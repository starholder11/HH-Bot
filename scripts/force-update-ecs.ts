#!/usr/bin/env tsx

import { execSync } from 'child_process';
import * as fs from 'fs';

async function forceUpdateECS() {
  console.log('🚀 Force Updating ECS Service with PLANNER_RULES_URL Fix...');

  try {
    // Step 1: Find the correct cluster and service names
    console.log('\n🔍 Step 1: Finding ECS clusters and services...');

    const clustersOutput = execSync('aws ecs list-clusters --region us-east-1', { encoding: 'utf8' });
    console.log('Clusters found:', clustersOutput);

    // Target the agent service specifically
    const clusterName = 'lancedb-bulletproof-simple-cluster';
    console.log(`📋 Using cluster: ${clusterName}`);

    // Step 2: List services in the cluster
    console.log('\n🔍 Step 2: Finding agent services in cluster...');
    const servicesOutput = execSync(`aws ecs list-services --cluster ${clusterName} --region us-east-1`, { encoding: 'utf8' });
    console.log('Services found:', servicesOutput);

    // Try to find the agent service (prefer v2)
    const serviceMatch = servicesOutput.match(/hh-agent-app-service-v2/) || servicesOutput.match(/hh-agent-app-service/);
    if (!serviceMatch) {
      throw new Error('Could not find agent service');
    }

    const serviceName = serviceMatch[0];
    console.log(`📋 Found agent service: ${serviceName}`);

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

    let taskDef = JSON.parse(taskDefMatch2[0]);

    // Step 5: Update task definition with our local version (includes PLANNER_RULES_URL)
    console.log('\n🔍 Step 5: Updating task definition with local changes...');
    const localTaskDef = JSON.parse(fs.readFileSync('infrastructure/agent-task-definition.json', 'utf8'));
    
    // Use the local task definition but preserve the family name if different
    if (taskDef.family) {
      localTaskDef.family = taskDef.family;
    }
    
    console.log(`✅ Using updated task definition with PLANNER_RULES_URL: ${localTaskDef.containerDefinitions[0].environment.find((e: any) => e.name === 'PLANNER_RULES_URL')?.value}`);
    
    taskDef = localTaskDef;

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
    console.log('💡 The service should now be running with PLANNER_RULES_URL configured.');
    console.log('🔍 Backend will now load planner rules from S3 and recognize video generation patterns.');

  } catch (error) {
    console.error('❌ Failed to update ECS service:', error);
    process.exit(1);
  }
}

// Run the update
forceUpdateECS().catch(console.error);
