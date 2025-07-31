const { execSync } = require('child_process');

async function deployNuclearOption() {
  try {
    console.log('🚀 Starting Nuclear Option Deployment...');

    // Step 1: Create task definition
    console.log('📋 Creating task definition...');
    const taskDefinition = {
      family: 'lancedb-v2',
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: '2048',
      memory: '4096',
      executionRoleArn: 'arn:aws:iam::781939061434:role/ecsTaskExecutionRole',
      taskRoleArn: 'arn:aws:iam::781939061434:role/ecsTaskExecutionRole',
      containerDefinitions: [{
        name: 'lancedb',
        image: '781939061434.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:v2.0',
        portMappings: [{
          containerPort: 8000,
          protocol: 'tcp'
        }],
        essential: true,
        logConfiguration: {
          logDriver: 'awslogs',
          options: {
            'awslogs-group': '/ecs/lancedb-v2',
            'awslogs-region': 'us-east-1',
            'awslogs-stream-prefix': 'ecs',
            'awslogs-create-group': 'true'
          }
        },
        environment: [
          { name: 'NODE_ENV', value: 'production' },
          { name: 'PORT', value: '8000' }
        ],
        secrets: [{
          name: 'OPENAI_API_KEY',
          valueFrom: 'arn:aws:secretsmanager:us-east-1:781939061434:secret:openai-api-key'
        }],
        healthCheck: {
          command: ['CMD-SHELL', 'curl -f http://localhost:8000/health || exit 1'],
          interval: 30,
          timeout: 5,
          retries: 3,
          startPeriod: 60
        }
      }]
    };

    // Write task definition to file
    require('fs').writeFileSync('task-definition.json', JSON.stringify(taskDefinition, null, 2));

    // Register task definition
    execSync('aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1', { stdio: 'inherit' });
    console.log('✅ Task definition created');

    // Step 2: Get VPC and subnet info
    console.log('🌐 Getting VPC information...');
    const vpcId = execSync('aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text --region us-east-1', { encoding: 'utf8' }).trim();
    console.log(`VPC ID: ${vpcId}`);

    const subnet1 = execSync(`aws ec2 describe-subnets --filters "Name=vpc-id,Values=${vpcId}" --query "Subnets[0].SubnetId" --output text --region us-east-1`, { encoding: 'utf8' }).trim();
    const subnet2 = execSync(`aws ec2 describe-subnets --filters "Name=vpc-id,Values=${vpcId}" --query "Subnets[1].SubnetId" --output text --region us-east-1`, { encoding: 'utf8' }).trim();
    console.log(`Subnets: ${subnet1}, ${subnet2}`);

    const securityGroup = execSync(`aws ec2 describe-security-groups --filters "Name=vpc-id,Values=${vpcId}" "Name=group-name,Values=default" --query "SecurityGroups[0].GroupId" --output text --region us-east-1`, { encoding: 'utf8' }).trim();
    console.log(`Security Group: ${securityGroup}`);

    // Step 3: Create service
    console.log('🔧 Creating ECS service...');
    const serviceCommand = `aws ecs create-service \
      --cluster lancedb-cluster-v2 \
      --service-name lancedb-vector-search \
      --task-definition lancedb-v2:1 \
      --desired-count 1 \
      --launch-type FARGATE \
      --platform-version LATEST \
      --network-configuration "awsvpcConfiguration={subnets=[${subnet1},${subnet2}],securityGroups=[${securityGroup}],assignPublicIp=ENABLED}" \
      --enable-execute-command \
      --deployment-configuration "maximumPercent=200,minimumHealthyPercent=50" \
      --region us-east-1`;

    execSync(serviceCommand, { stdio: 'inherit' });
    console.log('✅ Service created');

    // Step 4: Wait for service to be stable
    console.log('⏳ Waiting for service to stabilize...');
    execSync('aws ecs wait services-stable --cluster lancedb-cluster-v2 --services lancedb-vector-search --region us-east-1', { stdio: 'inherit' });
    console.log('✅ Service is stable');

    // Step 5: Get service URL
    console.log('🔍 Getting service details...');
    const taskArn = execSync('aws ecs list-tasks --cluster lancedb-cluster-v2 --service-name lancedb-vector-search --query "taskArns[0]" --output text --region us-east-1', { encoding: 'utf8' }).trim();

    if (taskArn && taskArn !== 'None') {
      const networkInterfaceId = execSync(`aws ecs describe-tasks --cluster lancedb-cluster-v2 --tasks ${taskArn} --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text --region us-east-1`, { encoding: 'utf8' }).trim();

      if (networkInterfaceId && networkInterfaceId !== 'None') {
        const publicIp = execSync(`aws ec2 describe-network-interfaces --network-interface-ids ${networkInterfaceId} --query "NetworkInterfaces[0].Association.PublicIp" --output text --region us-east-1`, { encoding: 'utf8' }).trim();

        if (publicIp && publicIp !== 'None') {
          console.log(`🎯 Service running at: http://${publicIp}:8000`);

          // Test the service
          console.log('🧪 Testing service health...');
          try {
            const healthResponse = execSync(`curl -s http://${publicIp}:8000/health`, { encoding: 'utf8' });
            console.log('Health response:', healthResponse);
          } catch (error) {
            console.log('Health check failed, service may still be starting...');
          }
        }
      }
    }

    console.log('🎉 Nuclear option deployment completed!');

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deployNuclearOption();
