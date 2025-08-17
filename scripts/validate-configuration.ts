#!/usr/bin/env tsx

/**
 * Configuration Validation Script
 *
 * Validates all configuration files, environment variables, and service dependencies
 * to ensure everything is properly configured before deployment.
 */

import fs from 'fs';
import path from 'path';

interface ValidationResult {
  category: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: any;
}

class ConfigurationValidator {
  private results: ValidationResult[] = [];

  async validateAll(): Promise<void> {
    console.log('🔍 Starting Configuration Validation...\n');

    await this.validatePackageJson();
    await this.validateTypeScriptConfig();
    await this.validateNextConfig();
    await this.validateEnvironmentConfig();
    await this.validateServiceConfigurations();
    await this.validateDockerConfiguration();
    await this.validateAWSConfiguration();

    this.generateReport();
  }

  private async validatePackageJson(): Promise<void> {
    console.log('📦 Validating package.json...');

    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

      // Check critical dependencies
      const criticalDeps = {
        '@langchain/langgraph': '^0.4.5',
        '@langchain/core': '^0.3.71',
        '@langchain/openai': '^0.6.7',
        'ioredis': '^5.7.0',
        'zod': '3.23.8',
        'uuid': '^11.1.0',
        'ws': '^8.18.3',
        'ai': '^3.3.35'
      };

      for (const [dep, expectedVersion] of Object.entries(criticalDeps)) {
        const actualVersion = packageJson.dependencies?.[dep];
        if (!actualVersion) {
          this.addResult({
            category: 'Package',
            name: `DEP_${dep}`,
            status: 'FAIL',
            message: `Critical dependency ${dep} is missing`
          });
        } else {
          this.addResult({
            category: 'Package',
            name: `DEP_${dep}`,
            status: 'PASS',
            message: `Dependency ${dep} is present`,
            details: { expected: expectedVersion, actual: actualVersion }
          });
        }
      }

      // Check scripts
      const requiredScripts = ['dev', 'build:web', 'start:web'];
      for (const script of requiredScripts) {
        if (!packageJson.scripts?.[script]) {
          this.addResult({
            category: 'Package',
            name: `SCRIPT_${script}`,
            status: 'FAIL',
            message: `Required script ${script} is missing`
          });
        } else {
          this.addResult({
            category: 'Package',
            name: `SCRIPT_${script}`,
            status: 'PASS',
            message: `Script ${script} is configured`
          });
        }
      }

      // Check Node.js version requirement
      if (packageJson.engines?.node) {
        this.addResult({
          category: 'Package',
          name: 'NODE_VERSION',
          status: 'PASS',
          message: `Node.js version requirement specified: ${packageJson.engines.node}`
        });
      } else {
        this.addResult({
          category: 'Package',
          name: 'NODE_VERSION',
          status: 'WARN',
          message: 'Node.js version requirement not specified'
        });
      }

    } catch (error) {
      this.addResult({
        category: 'Package',
        name: 'PACKAGE_JSON',
        status: 'FAIL',
        message: 'Failed to read or parse package.json',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async validateTypeScriptConfig(): Promise<void> {
    console.log('📝 Validating TypeScript configuration...');

    try {
      const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));

      // Check critical compiler options
      const requiredOptions = {
        'target': ['es2017', 'es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'esnext'],
        'module': ['esnext', 'commonjs'],
        'moduleResolution': ['node'],
        'strict': [true]
      };

      for (const [option, validValues] of Object.entries(requiredOptions)) {
        const actualValue = tsconfig.compilerOptions?.[option];
        if (validValues.includes(actualValue)) {
          this.addResult({
            category: 'TypeScript',
            name: `TS_${option.toUpperCase()}`,
            status: 'PASS',
            message: `TypeScript ${option} is properly configured`,
            details: { value: actualValue }
          });
        } else {
          this.addResult({
            category: 'TypeScript',
            name: `TS_${option.toUpperCase()}`,
            status: 'WARN',
            message: `TypeScript ${option} may need adjustment`,
            details: { actual: actualValue, valid: validValues }
          });
        }
      }

    } catch (error) {
      this.addResult({
        category: 'TypeScript',
        name: 'TSCONFIG',
        status: 'FAIL',
        message: 'Failed to read or parse tsconfig.json',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async validateNextConfig(): Promise<void> {
    console.log('⚡ Validating Next.js configuration...');

    try {
      const nextConfigPath = path.join(process.cwd(), 'next.config.js');
      if (fs.existsSync(nextConfigPath)) {
        this.addResult({
          category: 'Next.js',
          name: 'NEXT_CONFIG',
          status: 'PASS',
          message: 'next.config.js exists'
        });
      } else {
        this.addResult({
          category: 'Next.js',
          name: 'NEXT_CONFIG',
          status: 'WARN',
          message: 'next.config.js not found (using defaults)'
        });
      }

      // Check for app directory structure
      const appDirPath = path.join(process.cwd(), 'app');
      if (fs.existsSync(appDirPath)) {
        this.addResult({
          category: 'Next.js',
          name: 'APP_DIRECTORY',
          status: 'PASS',
          message: 'App directory structure detected'
        });
      } else {
        this.addResult({
          category: 'Next.js',
          name: 'APP_DIRECTORY',
          status: 'FAIL',
          message: 'App directory not found'
        });
      }

    } catch (error) {
      this.addResult({
        category: 'Next.js',
        name: 'NEXT_VALIDATION',
        status: 'FAIL',
        message: 'Next.js configuration validation failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async validateEnvironmentConfig(): Promise<void> {
    console.log('🌍 Validating environment configuration...');

    // Check for environment example file
    const envExamplePath = path.join(process.cwd(), 'config', 'environment.example.env');
    if (fs.existsSync(envExamplePath)) {
      this.addResult({
        category: 'Environment',
        name: 'ENV_EXAMPLE',
        status: 'PASS',
        message: 'Environment example file exists'
      });
    } else {
      this.addResult({
        category: 'Environment',
        name: 'ENV_EXAMPLE',
        status: 'WARN',
        message: 'Environment example file not found'
      });
    }

    // Validate critical environment variables
    const criticalEnvVars = [
      { name: 'OPENAI_API_KEY', required: true },
      { name: 'FAL_KEY', required: true },
      { name: 'REDIS_URL', required: false },
      { name: 'DATABASE_URL', required: false },
      { name: 'PUBLIC_API_BASE_URL', required: false }
    ];

    for (const envVar of criticalEnvVars) {
      const value = process.env[envVar.name];
      if (!value && envVar.required) {
        this.addResult({
          category: 'Environment',
          name: `ENV_${envVar.name}`,
          status: 'FAIL',
          message: `Required environment variable ${envVar.name} is not set`
        });
      } else if (!value && !envVar.required) {
        this.addResult({
          category: 'Environment',
          name: `ENV_${envVar.name}`,
          status: 'WARN',
          message: `Optional environment variable ${envVar.name} is not set`
        });
      } else if (value && (value.includes('your-') || value.includes('sk-your-'))) {
        this.addResult({
          category: 'Environment',
          name: `ENV_${envVar.name}`,
          status: 'FAIL',
          message: `Environment variable ${envVar.name} contains placeholder value`
        });
      } else {
        this.addResult({
          category: 'Environment',
          name: `ENV_${envVar.name}`,
          status: 'PASS',
          message: `Environment variable ${envVar.name} is properly configured`
        });
      }
    }
  }

  private async validateServiceConfigurations(): Promise<void> {
    console.log('🔧 Validating service configurations...');

    // Check service directory structure
    const servicesDirs = [
      'services/context',
      'services/tools',
      'services/orchestration',
      'services/intelligence',
      'services/quality',
      'services/ux',
      'services/websocket',
      'services/workflows'
    ];

    for (const dir of servicesDirs) {
      const dirPath = path.join(process.cwd(), dir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.ts'));
        this.addResult({
          category: 'Services',
          name: `DIR_${dir.replace('services/', '').toUpperCase()}`,
          status: 'PASS',
          message: `Service directory ${dir} exists with ${files.length} TypeScript files`
        });
      } else {
        this.addResult({
          category: 'Services',
          name: `DIR_${dir.replace('services/', '').toUpperCase()}`,
          status: 'FAIL',
          message: `Service directory ${dir} is missing`
        });
      }
    }

    // Check critical service files
    const criticalServices = [
      'services/context/RedisContextService.ts',
      'services/tools/ToolRegistry.ts',
      'services/tools/ComprehensiveTools.ts',
      'services/orchestration/LangGraphOrchestrator.ts',
      'services/intelligence/SimpleIntentClassifier.ts'
    ];

    for (const service of criticalServices) {
      const servicePath = path.join(process.cwd(), service);
      if (fs.existsSync(servicePath)) {
        this.addResult({
          category: 'Services',
          name: `FILE_${path.basename(service, '.ts').toUpperCase()}`,
          status: 'PASS',
          message: `Critical service ${service} exists`
        });
      } else {
        this.addResult({
          category: 'Services',
          name: `FILE_${path.basename(service, '.ts').toUpperCase()}`,
          status: 'FAIL',
          message: `Critical service ${service} is missing`
        });
      }
    }
  }

  private async validateDockerConfiguration(): Promise<void> {
    console.log('🐳 Validating Docker configuration...');

    // Check for Dockerfile
    const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      this.addResult({
        category: 'Docker',
        name: 'DOCKERFILE',
        status: 'PASS',
        message: 'Dockerfile exists'
      });
    } else {
      this.addResult({
        category: 'Docker',
        name: 'DOCKERFILE',
        status: 'WARN',
        message: 'Dockerfile not found (may be created during deployment)'
      });
    }

    // Check for .dockerignore
    const dockerignorePath = path.join(process.cwd(), '.dockerignore');
    if (fs.existsSync(dockerignorePath)) {
      this.addResult({
        category: 'Docker',
        name: 'DOCKERIGNORE',
        status: 'PASS',
        message: '.dockerignore exists'
      });
    } else {
      this.addResult({
        category: 'Docker',
        name: 'DOCKERIGNORE',
        status: 'WARN',
        message: '.dockerignore not found'
      });
    }
  }

  private async validateAWSConfiguration(): Promise<void> {
    console.log('☁️ Validating AWS configuration...');

    // Check infrastructure directory
    const infraDir = path.join(process.cwd(), 'infrastructure');
    if (fs.existsSync(infraDir)) {
      const ymlFiles = fs.readdirSync(infraDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      this.addResult({
        category: 'AWS',
        name: 'INFRASTRUCTURE_DIR',
        status: 'PASS',
        message: `Infrastructure directory exists with ${ymlFiles.length} CloudFormation templates`
      });
    } else {
      this.addResult({
        category: 'AWS',
        name: 'INFRASTRUCTURE_DIR',
        status: 'FAIL',
        message: 'Infrastructure directory is missing'
      });
    }

    // Check for deployment scripts
    const deploymentScripts = [
      'infrastructure/build-and-push.sh',
      'infrastructure/bulletproof-lancedb-deploy.sh'
    ];

    for (const script of deploymentScripts) {
      const scriptPath = path.join(process.cwd(), script);
      if (fs.existsSync(scriptPath)) {
        this.addResult({
          category: 'AWS',
          name: `SCRIPT_${path.basename(script, '.sh').toUpperCase()}`,
          status: 'PASS',
          message: `Deployment script ${script} exists`
        });
      } else {
        this.addResult({
          category: 'AWS',
          name: `SCRIPT_${path.basename(script, '.sh').toUpperCase()}`,
          status: 'WARN',
          message: `Deployment script ${script} not found`
        });
      }
    }

    // Check AWS environment variables
    const awsEnvVars = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
    for (const envVar of awsEnvVars) {
      const value = process.env[envVar];
      if (value) {
        this.addResult({
          category: 'AWS',
          name: `ENV_${envVar}`,
          status: 'PASS',
          message: `AWS environment variable ${envVar} is set`
        });
      } else {
        this.addResult({
          category: 'AWS',
          name: `ENV_${envVar}`,
          status: 'WARN',
          message: `AWS environment variable ${envVar} not set (may be configured in deployment)`
        });
      }
    }
  }

  private addResult(result: ValidationResult): void {
    this.results.push(result);
    const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
    console.log(`  ${icon} ${result.name}: ${result.message}`);
  }

  private generateReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📋 CONFIGURATION VALIDATION REPORT');
    console.log('='.repeat(80));

    const categories = [...new Set(this.results.map(r => r.category))];

    for (const category of categories) {
      const categoryResults = this.results.filter(r => r.category === category);
      const passed = categoryResults.filter(r => r.status === 'PASS').length;
      const warned = categoryResults.filter(r => r.status === 'WARN').length;
      const failed = categoryResults.filter(r => r.status === 'FAIL').length;

      console.log(`\n📂 ${category.toUpperCase()}:`);
      console.log(`  ✅ Passed: ${passed} | ⚠️ Warnings: ${warned} | ❌ Failed: ${failed}`);

      if (failed > 0) {
        console.log(`  Critical Issues:`);
        categoryResults
          .filter(r => r.status === 'FAIL')
          .forEach(r => console.log(`    • ${r.message}`));
      }
    }

    const totalPassed = this.results.filter(r => r.status === 'PASS').length;
    const totalWarned = this.results.filter(r => r.status === 'WARN').length;
    const totalFailed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`\n📊 OVERALL SUMMARY:`);
    console.log(`  Total Checks: ${total}`);
    console.log(`  ✅ Passed: ${totalPassed} (${((totalPassed / total) * 100).toFixed(1)}%)`);
    console.log(`  ⚠️  Warnings: ${totalWarned} (${((totalWarned / total) * 100).toFixed(1)}%)`);
    console.log(`  ❌ Failed: ${totalFailed} (${((totalFailed / total) * 100).toFixed(1)}%)`);

    console.log(`\n🎯 CONFIGURATION STATUS:`);
    if (totalFailed === 0) {
      console.log(`  ✅ CONFIGURATION IS VALID`);
      console.log(`  All critical configurations are in place. Warnings should be addressed but won't block deployment.`);
    } else {
      console.log(`  ❌ CONFIGURATION HAS ISSUES`);
      console.log(`  ${totalFailed} critical configuration issues must be resolved.`);
    }

    console.log('\n' + '='.repeat(80));
  }
}

// Run the validation
async function main() {
  const validator = new ConfigurationValidator();
  await validator.validateAll();
}

if (require.main === module) {
  main().catch(console.error);
}
