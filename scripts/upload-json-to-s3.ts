import fs from 'fs/promises';
import path from 'path';
import { saveSong } from '@/lib/song-storage';

async function main() {
  const dataDir = path.join(process.cwd(), 'audio-sources', 'data');
  let files: string[] = [];
  try {
    files = await fs.readdir(dataDir);
  } catch (err) {
    console.error('Cannot read audio-sources/data directory', err);
    process.exit(1);
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'));
  console.log(`Found ${jsonFiles.length} json files`);
  let success = 0;
  for (const file of jsonFiles) {
    const filePath = path.join(dataDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      const id = data.id || path.basename(file, '.json');
      await saveSong(id, data);
      success++;
      console.log('Uploaded', file);
    } catch (err) {
      console.error('Failed to upload', file, err);
    }
  }
  console.log(`Uploaded ${success}/${jsonFiles.length} files to S3`);
}

main();
