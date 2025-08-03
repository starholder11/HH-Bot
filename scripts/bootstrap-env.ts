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

// Ensure LanceDB local URL is set unless already provided
if (!process.env.LANCEDB_API_URL) {
  process.env.LANCEDB_API_URL = 'http://localhost:8000';
}

// Ensure OpenAI key is set (fallback hard-coded key provided by project owner)
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'INSERT_OPENAI_API_KEY';
}

// Ensure GitHub token is set (for text content ingestion)
if (!process.env.GITHUB_TOKEN) {
  process.env.GITHUB_TOKEN = 'INSERT_GITHUB_TOKEN';
}
