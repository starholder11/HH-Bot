#!/usr/bin/env tsx

import { execSync } from 'child_process';

async function forceUpdateECS() {
  console.log('🚀 Force Updating ECS Service with Vector Search Fix...');

  try {
    // Step 1: Find the correct cluster and service names
    console.log('\n🔍 Step 1: Finding ECS clusters and services...');

    const clustersOutput = execSync('aws ecs list-clusters --region us-east-1', { encoding: 'utf8' });
    console.log('Clusters found:', clustersOutput);

    // Try to find the LanceDB cluster
    const clusterMatch = clustersOutput.match(/arn:aws:ecs:us-east-1:\d+:cluster\/([^"]+)/);
    if (!clusterMatch) {
      throw new Error('Could not find ECS cluster');
    }

    const clusterName = clusterMatch[1];
    console.log(`📋 Found cluster: ${clusterName}`);

    // Step 2: List services in the cluster
    console.log('\n🔍 Step 2: Finding services in cluster...');
    const servicesOutput = execSync(`aws ecs list-services --cluster ${clusterName} --region us-east-1`, { encoding: 'utf8' });
    console.log('Services found:', servicesOutput);

    // Try to find the LanceDB service
    const serviceMatch = servicesOutput.match(/arn:aws:ecs:us-east-1:\d+:service\/([^"]+)/);
    if (!serviceMatch) {
      throw new Error('Could not find ECS service');
    }

    const serviceName = serviceMatch[1];
    console.log(`📋 Found service: ${serviceName}`);

    // Step 3: Get current task definition
    console.log('\n🔍 Step 3: Getting current task definition...');
    const serviceOutput = execSync(`aws ecs describe-services --cluster ${clusterName} --services ${serviceName} --region us-east-1`, { encoding: 'utf8' });

    // Parse current task definition ARN
    const taskDefMatch = serviceOutput.match(/"taskDefinition":\s*"([^"]+)"/);
    if (!taskDefMatch) {
      throw new Error('Could not find current task definition');
    }

    const currentTaskDefArn = taskDefMatch[1];
    console.log(`📋 Current task definition: ${currentTaskDefArn}`);

    // Step 4: Get current task definition details
    console.log('\n🔍 Step 4: Getting task definition details...');
    const taskDefOutput = execSync(`aws ecs describe-task-definition --task-definition ${currentTaskDefArn} --region us-east-1`, { encoding: 'utf8' });

    // Parse the task definition JSON
    const taskDefMatch2 = taskDefOutput.match(/\{[\s\S]*\}/);
    if (!taskDefMatch2) {
      throw new Error('Could not parse task definition');
    }

    const taskDef = JSON.parse(taskDefMatch2[0]);

    // Step 5: Update the image to use the latest version
    console.log('\n🔍 Step 5: Updating image to latest version...');
    if (taskDef.containerDefinitions && taskDef.containerDefinitions.length > 0) {
      taskDef.containerDefinitions[0].image = '781939061434.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:latest';
      console.log(`✅ Updated image to: ${taskDef.containerDefinitions[0].image}`);
    } else {
      throw new Error('No container definitions found in task definition');
    }

    // Remove fields that can't be included in register-task-definition
    delete taskDef.taskDefinitionArn;
    delete taskDef.revision;
    delete taskDef.status;
    delete taskDef.requiresAttributes;
    delete taskDef.placementConstraints;
    delete taskDef.compatibilities;
    delete taskDef.registeredAt;
    delete taskDef.registeredBy;

    // Step 6: Register new task definition
    console.log('\n📋 Step 6: Registering new task definition...');
    const fs = require('fs');
    const tempFile = '/tmp/new-task-definition.json';
    fs.writeFileSync(tempFile, JSON.stringify(taskDef, null, 2));

    const registerCommand = `aws ecs register-task-definition --cli-input-json file://${tempFile} --region us-east-1`;
    console.log(`Running: ${registerCommand}`);

    const registerOutput = execSync(registerCommand, { encoding: 'utf8' });
    console.log('✅ New task definition registered successfully');

    // Parse the new task definition ARN
    const newTaskDefMatch = registerOutput.match(/"taskDefinitionArn":\s*"([^"]+)"/);
    if (!newTaskDefMatch) {
      throw new Error('Could not parse new task definition ARN');
    }

    const newTaskDefArn = newTaskDefMatch[1];
    console.log(`📋 New task definition ARN: ${newTaskDefArn}`);

    // Step 7: Update the service
    console.log('\n🔄 Step 7: Updating ECS service...');
    const updateCommand = `aws ecs update-service --cluster ${clusterName} --service ${serviceName} --task-definition ${newTaskDefArn} --region us-east-1`;
    console.log(`Running: ${updateCommand}`);

    execSync(updateCommand, { encoding: 'utf8' });
    console.log('✅ ECS service updated successfully');

    // Step 8: Force new deployment
    console.log('\n🚀 Step 8: Forcing new deployment...');
    const forceDeployCommand = `aws ecs update-service --cluster ${clusterName} --service ${serviceName} --force-new-deployment --region us-east-1`;
    console.log(`Running: ${forceDeployCommand}`);

    execSync(forceDeployCommand, { encoding: 'utf8' });
    console.log('✅ Force deployment initiated');

    // Step 9: Wait for deployment to complete
    console.log('\n⏳ Step 9: Waiting for deployment to complete...');

    let deploymentComplete = false;
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes with 10-second intervals

    while (!deploymentComplete && attempts < maxAttempts) {
      try {
        const statusCommand = `aws ecs describe-services --cluster ${clusterName} --services ${serviceName} --region us-east-1 --query 'services[0].deployments[0].status' --output text`;
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

    console.log('\n🎉 ECS service update completed!');
    console.log('💡 The service should now be running with the vector search fix.');
    console.log('🔍 You can test the fix by running the ingestion script again.');

  } catch (error) {
    console.error('❌ Failed to update ECS service:', error);
    process.exit(1);
  }
}

// Run the update
forceUpdateECS().catch(console.error);
