#!/usr/bin/env tsx

import { execSync } from 'child_process';

async function updateLanceDBService() {
  console.log('🚀 Updating LanceDB Service with Vector Search Fix...');

  try {
    // Step 1: Register a new task definition with the latest image
    console.log('\n📋 Step 1: Registering new task definition...');

    const taskDefinitionJson = {
      family: 'lancedb-real',
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: '1024',
      memory: '2048',
      executionRoleArn: 'arn:aws:iam::781939061434:role/ecsTaskExecutionRole',
      taskRoleArn: 'arn:aws:iam::781939061434:role/ecsTaskExecutionRole',
      containerDefinitions: [
        {
          name: 'lancedb',
          image: '781939061434.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:latest',
          portMappings: [
            {
              containerPort: 8000,
              protocol: 'tcp'
            }
          ],
          essential: true,
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': '/ecs/lancedb-real',
              'awslogs-region': 'us-east-1',
              'awslogs-stream-prefix': 'ecs'
            }
          },
          environment: [
            {
              name: 'NODE_ENV',
              value: 'production'
            },
            {
              name: 'PORT',
              value: '8000'
            },
            {
              name: 'LANCEDB_PATH',
              value: '/tmp/lancedb'
            }
          ],
          secrets: [
            {
              name: 'OPENAI_API_KEY',
              valueFrom: 'arn:aws:secretsmanager:us-east-1:781939061434:secret:openai-api-key'
            }
          ]
        }
      ]
    };

    // Write task definition to temporary file
    const fs = require('fs');
    const tempFile = '/tmp/task-definition.json';
    fs.writeFileSync(tempFile, JSON.stringify(taskDefinitionJson, null, 2));

    // Register new task definition
    const registerCommand = `aws ecs register-task-definition --cli-input-json file://${tempFile} --region us-east-1`;
    console.log(`Running: ${registerCommand}`);

    const registerOutput = execSync(registerCommand, { encoding: 'utf8' });
    console.log('✅ Task definition registered successfully');

    // Parse the new task definition ARN
    const taskDefMatch = registerOutput.match(/"taskDefinitionArn":\s*"([^"]+)"/);
    if (!taskDefMatch) {
      throw new Error('Could not parse task definition ARN from output');
    }
    const newTaskDefArn = taskDefMatch[1];
    console.log(`📋 New task definition ARN: ${newTaskDefArn}`);

    // Step 2: Update the ECS service to use the new task definition
    console.log('\n🔄 Step 2: Updating ECS service...');

    const updateCommand = `aws ecs update-service --cluster lancedb-real --service lancedb-real --task-definition ${newTaskDefArn} --region us-east-1`;
    console.log(`Running: ${updateCommand}`);

    execSync(updateCommand, { encoding: 'utf8' });
    console.log('✅ ECS service updated successfully');

    // Step 3: Force new deployment
    console.log('\n🚀 Step 3: Forcing new deployment...');

    const forceDeployCommand = `aws ecs update-service --cluster lancedb-real --service lancedb-real --force-new-deployment --region us-east-1`;
    console.log(`Running: ${forceDeployCommand}`);

    execSync(forceDeployCommand, { encoding: 'utf8' });
    console.log('✅ Force deployment initiated');

    // Step 4: Wait for deployment to complete
    console.log('\n⏳ Step 4: Waiting for deployment to complete...');

    let deploymentComplete = false;
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes with 10-second intervals

    while (!deploymentComplete && attempts < maxAttempts) {
      try {
        const statusCommand = `aws ecs describe-services --cluster lancedb-real --services lancedb-real --region us-east-1 --query 'services[0].deployments[0].status' --output text`;
        const status = execSync(statusCommand, { encoding: 'utf8' }).trim();

        if (status === 'PRIMARY') {
          deploymentComplete = true;
          console.log('✅ Deployment completed successfully');
        } else {
          console.log(`⏳ Deployment status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          attempts++;
        }
      } catch (error) {
        console.log(`⚠️ Error checking deployment status: ${error}`);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    if (!deploymentComplete) {
      console.log('⚠️ Deployment may still be in progress. Check AWS console for final status.');
    }

    // Clean up temp file
    fs.unlinkSync(tempFile);

    console.log('\n🎉 LanceDB service update completed!');
    console.log('💡 The service should now be running with the vector search fix.');
    console.log('🔍 You can test the fix by running the ingestion script again.');

  } catch (error) {
    console.error('❌ Failed to update LanceDB service:', error);
    process.exit(1);
  }
}

// Run the update
updateLanceDBService().catch(console.error);
