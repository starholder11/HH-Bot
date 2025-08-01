// Bootstrap to load env exports from config files before other imports
import fs from 'fs';
import path from 'path';

/**
 * Load shell-style `export KEY="value"` lines from a file
 */
function loadShellEnv(filePath: string) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return;

  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*export\s+([A-Z0-9_]+)=\"?([^\"]*)\"?/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

// Priority order: explicit config.sh > example > .env.local > .env
loadShellEnv('infrastructure/config.sh');
loadShellEnv('infrastructure/config.example.sh');
loadShellEnv('.env.local');
loadShellEnv('.env');
