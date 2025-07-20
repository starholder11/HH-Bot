#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface LyricsData {
  title?: string;
  prompt?: string;
  lyrics?: string;
}

function parseLyricsFile(content: string): LyricsData {
  const lines = content.split('\n');
  const data: LyricsData = {};

  let titleFound = false;
  let lyricsStarted = false;
  let lyricsLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // First non-empty line is the title
    if (!titleFound && trimmedLine) {
      data.title = trimmedLine;
      titleFound = true;
      continue;
    }

    // Look for "Prompt:" line
    if (trimmedLine.toLowerCase().startsWith('prompt:')) {
      data.prompt = trimmedLine.substring(7).trim();
      continue;
    }

    // Look for "Lyrics:" line
    if (trimmedLine.toLowerCase().startsWith('lyrics:')) {
      lyricsStarted = true;
      const lyricsOnSameLine = trimmedLine.substring(7).trim();
      if (lyricsOnSameLine) {
        lyricsLines.push(lyricsOnSameLine);
      }
      continue;
    }

    // Collect everything after "Lyrics:" line
    if (lyricsStarted) {
      lyricsLines.push(line);
    }
  }

  data.lyrics = lyricsLines.join('\n').trim();
  return data;
}

function analyzeContent(lyrics: string, prompt: string): any {
  const words = lyrics.toLowerCase().split(/\s+/);
  const wordCount = words.length;

  // Detect content type based on characteristics
  const contentTypes: string[] = [];

  if (lyrics.includes('om-') || lyrics.includes('ah-ah') || lyrics.includes('hree-') || lyrics.includes('dhung-')) {
    contentTypes.push('onomatopoeia');
  }

  if (lyrics.includes('[') && lyrics.includes(']')) {
    contentTypes.push('production notes');
  }

  if (lyrics.includes('\n\n') || lyrics.split('\n').length > 10) {
    contentTypes.push('traditional lyrics');
  }

  if (wordCount < 10) {
    contentTypes.push('minimal');
  }

  // Extract production techniques from prompt
  const productionTechniques: string[] = [];
  const promptLower = prompt.toLowerCase();

  const techKeywords = {
    'sampling': ['sample', 'sampled'],
    'distortion': ['distortion', 'harsh', 'raw'],
    'acid': ['acid'],
    'breakbeat': ['break', 'beats'],
    'chanting': ['chant', 'throat'],
    'acapella': ['acapella'],
    'psychedelic': ['psyched', 'psychedelia'],
    'ambient': ['ambient'],
    'experimental': ['experimental']
  };

  Object.keys(techKeywords).forEach(tech => {
    if (techKeywords[tech as keyof typeof techKeywords].some(keyword => promptLower.includes(keyword))) {
      productionTechniques.push(tech);
    }
  });

  // Extract structural elements
  const structuralElements: string[] = [];
  if (lyrics.includes('[Intro')) structuralElements.push('intro');
  if (lyrics.includes('[Verse')) structuralElements.push('verse');
  if (lyrics.includes('[Chorus')) structuralElements.push('chorus');
  if (lyrics.includes('[Bridge')) structuralElements.push('bridge');
  if (lyrics.includes('[Outro')) structuralElements.push('outro');
  if (lyrics.includes('[Instrumental')) structuralElements.push('instrumental');
  if (lyrics.includes('[Sample')) structuralElements.push('samples');

  // Calculate energy based on prompt keywords
  let energyScore = 5;
  const highEnergyWords = ['punk', 'harsh', 'big beat', 'acid', 'distortion'];
  const lowEnergyWords = ['ambient', 'chant', 'devotional', 'soft'];

  if (highEnergyWords.some(word => promptLower.includes(word))) energyScore = 8;
  if (lowEnergyWords.some(word => promptLower.includes(word))) energyScore = 3;

  // Extract mood from both lyrics and prompt
  const moodKeywords: string[] = [];
  const allText = (lyrics + ' ' + prompt).toLowerCase();

  const moodMap = {
    'aggressive': ['harsh', 'raw', 'punk', 'distortion'],
    'meditative': ['chant', 'om', 'devotional', 'throat'],
    'psychedelic': ['acid', 'psyched', 'trip'],
    'euphoric': ['dance', 'house', 'beat'],
    'spiritual': ['devotional', 'chant', 'om', 'prayer']
  };

  Object.keys(moodMap).forEach(mood => {
    if (moodMap[mood as keyof typeof moodMap].some(keyword => allText.includes(keyword))) {
      moodKeywords.push(mood);
    }
  });

  return {
    content_types: contentTypes.length > 0 ? contentTypes : ['experimental'],
    production_techniques: productionTechniques,
    estimated_energy: energyScore,
    mood_keywords: moodKeywords,
    word_count: wordCount,
    structural_elements: structuralElements.length > 0 ? structuralElements : ['freeform'],
    has_traditional_structure: structuralElements.includes('verse') && structuralElements.includes('chorus')
  };
}

async function processExistingFiles() {
  console.log('🎵 Processing existing audio files...');

  const audioSourcesDir = path.join(process.cwd(), 'audio-sources');
  const dataDir = path.join(audioSourcesDir, 'data');

  // Ensure data directory exists
  await fs.mkdir(dataDir, { recursive: true });

  // Get all MP3 files
  const files = await fs.readdir(audioSourcesDir);
  const mp3Files = files.filter(file => file.endsWith('.mp3'));
  const txtFiles = files.filter(file => file.endsWith('.txt') &&
    !file.includes('sample-song')); // Skip our sample files

  console.log(`Found ${mp3Files.length} MP3 files and ${txtFiles.length} TXT files`);

  let processedCount = 0;
  let skippedCount = 0;

  for (const mp3File of mp3Files) {
    const baseName = path.parse(mp3File).name;
    const txtFile = txtFiles.find(file => path.parse(file).name === baseName);

    let lyricsData: LyricsData = { title: baseName };

    // If there's a matching TXT file, parse it
    if (txtFile) {
      try {
        const txtPath = path.join(audioSourcesDir, txtFile);
        const txtContent = await fs.readFile(txtPath, 'utf-8');
        lyricsData = parseLyricsFile(txtContent);
        console.log(`📝 Parsed lyrics for: ${baseName}`);
      } catch (error) {
        console.warn(`⚠️  Could not read ${txtFile}:`, error);
      }
    } else {
      console.log(`📀 No lyrics file for: ${baseName} (MP3 only)`);
    }

    // Generate mock S3 URLs (update these when you configure S3)
    const songId = uuidv4();
    const s3_url = `https://your-bucket.s3.amazonaws.com/audio/${mp3File}`;
    const cloudflare_url = `https://cdn.yourdomain.com/audio/${mp3File}`;

    // Perform automated analysis
    const autoAnalysis = analyzeContent(
      lyricsData.lyrics || '',
      lyricsData.prompt || ''
    );

    // Create song data object
    const songData = {
      id: songId,
      filename: mp3File,
      s3_url,
      cloudflare_url,
      lyrics: lyricsData.lyrics || '',
      title: lyricsData.title || baseName,
      prompt: lyricsData.prompt || '',
      auto_analysis: autoAnalysis,
      manual_labels: {
        primary_genres: [],
        production_techniques: autoAnalysis.production_techniques || [],
        content_type: autoAnalysis.content_types[0] || '',
        energy_level: autoAnalysis.estimated_energy || 5,
        emotional_intensity: 5,
        mood: autoAnalysis.mood_keywords || [],
        tempo_feel: '',
        language: 'english',
        explicit: false,
        instrumental: lyricsData.lyrics ? false : true
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      labeling_complete: false
    };

    // Save to JSON file
    const jsonPath = path.join(dataDir, `${songId}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(songData, null, 2));

    processedCount++;
    console.log(`✅ Processed: ${songData.title}`);
  }

  console.log(`\n🎉 Processing complete!`);
  console.log(`   ✅ Processed: ${processedCount} songs`);
  console.log(`   📁 Data saved to: audio-sources/data/`);
  console.log(`   🌐 Visit: http://localhost:3000/audio-labeling`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Configure your S3 credentials in .env.local`);
  console.log(`   2. Run the S3 upload script to upload MP3s`);
  console.log(`   3. Start labeling your songs!`);
}

// Run the script
processExistingFiles().catch(console.error);
