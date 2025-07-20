#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { analyzeGenreFromPrompt } from '../lib/genre-hierarchy';
import { analyzeLyricsForMoodAndEmotion } from '../lib/lyrics-nlp';

interface LyricsData {
  title?: string;
  prompt?: string;
  lyrics?: string;
}

function parseLyricsFile(content: string): LyricsData {
  const lines = content.split('\n');
  const data: LyricsData = {};

  let titleFound = false;
  let promptFound = false;
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

    // Look for "Prompt:" line (case insensitive)
    if (trimmedLine.toLowerCase().startsWith('prompt:')) {
      data.prompt = trimmedLine.substring(7).trim(); // Remove "Prompt:" and trim
      promptFound = true;
      continue;
    }

    // Look for "Lyrics:" line (case insensitive)
    if (trimmedLine.toLowerCase().startsWith('lyrics:')) {
      lyricsStarted = true;
      // Check if there's content on the same line after "Lyrics:"
      const lyricsOnSameLine = trimmedLine.substring(7).trim();
      if (lyricsOnSameLine) {
        lyricsLines.push(lyricsOnSameLine);
      }
      continue;
    }

    // If we've found prompt but not yet "Lyrics:" and it's not empty, it might be lyrics content
    if (promptFound && !lyricsStarted && trimmedLine && !trimmedLine.toLowerCase().startsWith('lyrics:')) {
      // This handles files like "Stick Em Up Fever" where lyrics start immediately after prompt
      lyricsStarted = true;
      lyricsLines.push(line);
      continue;
    }

    // Collect everything after "Lyrics:" line or after prompt if no "Lyrics:" header
    if (lyricsStarted) {
      lyricsLines.push(line); // Keep original formatting including spaces
    }
  }

  data.lyrics = lyricsLines.join('\n').trim();
  return data;
}

async function reprocessExistingFiles() {
  console.log('🔄 Reprocessing files with proper analysis...');

  const audioSourcesDir = path.join(process.cwd(), 'audio-sources');
  const dataDir = path.join(audioSourcesDir, 'data');

  // Clear existing data
  try {
    const existingFiles = await fs.readdir(dataDir);
    for (const file of existingFiles) {
      if (file.endsWith('.json')) {
        await fs.unlink(path.join(dataDir, file));
      }
    }
    console.log('🗑️  Cleared existing data files');
  } catch (error) {
    // Data directory might not exist
    await fs.mkdir(dataDir, { recursive: true });
  }

  // Get all MP3 files
  const files = await fs.readdir(audioSourcesDir);
  const mp3Files = files.filter(file => file.endsWith('.mp3'));
  const txtFiles = files.filter(file => file.endsWith('.txt') &&
    !file.includes('sample-song')); // Skip our sample files

  console.log(`Found ${mp3Files.length} MP3 files and ${txtFiles.length} TXT files`);

  let processedCount = 0;

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
        console.log(`📝 Parsed: ${lyricsData.title}`);
        console.log(`   Prompt: ${lyricsData.prompt}`);
        console.log(`   Lyrics: ${lyricsData.lyrics ? `${lyricsData.lyrics.substring(0, 50)}...` : 'None'}`);
      } catch (error) {
        console.warn(`⚠️  Could not read ${txtFile}:`, error);
      }
    } else {
      console.log(`📀 No lyrics file for: ${baseName} (MP3 only)`);
    }

    // Generate analysis
    const genreAnalysis = analyzeGenreFromPrompt(lyricsData.prompt || '');
    const lyricsAnalysis = analyzeLyricsForMoodAndEmotion(lyricsData.lyrics || '');

    // Generate mock S3 URLs (update these when you configure S3)
    const songId = uuidv4();
    const s3_url = `https://your-bucket.s3.amazonaws.com/audio/${mp3File}`;
    const cloudflare_url = `https://cdn.yourdomain.com/audio/${mp3File}`;

    // Create song data object with proper structure
    const songData = {
      id: songId,
      filename: mp3File,
      s3_url,
      cloudflare_url,
      title: lyricsData.title || baseName,
      prompt: lyricsData.prompt || '',
      lyrics: lyricsData.lyrics || '',
      auto_analysis: {
        genre_analysis: genreAnalysis,
        lyrics_analysis: lyricsAnalysis,
        content_type: lyricsAnalysis.content_type,
        word_count: lyricsAnalysis.word_count,
        sentiment_score: lyricsAnalysis.sentiment_score
      },
      manual_labels: {
        // Pre-populate with analysis results
        primary_genre: genreAnalysis.primaryGenre,
        styles: genreAnalysis.styles,
        energy_level: 5, // Default, will be manually adjusted
        emotional_intensity: lyricsAnalysis.emotional_intensity,
        mood: lyricsAnalysis.mood,
        tempo: 5, // 1-10 scale
        content_type: lyricsAnalysis.content_type,
        themes: lyricsAnalysis.themes,
        language: 'english',
        explicit: false,
        instrumental: !lyricsData.lyrics
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      labeling_complete: false
    };

    console.log(`🎵 Analyzed: ${songData.title}`);
    console.log(`   Genre: ${genreAnalysis.primaryGenre} | Styles: ${genreAnalysis.styles.join(', ')}`);
    console.log(`   Mood: ${lyricsAnalysis.mood.join(', ')} | Intensity: ${lyricsAnalysis.emotional_intensity}/10`);
    console.log(`   Themes: ${lyricsAnalysis.themes.join(', ')}`);

    // Save to JSON file
    const jsonPath = path.join(dataDir, `${songId}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(songData, null, 2));

    processedCount++;
    console.log(`✅ Processed: ${songData.title}\n`);
  }

  console.log(`🎉 Reprocessing complete!`);
  console.log(`   ✅ Processed: ${processedCount} songs`);
  console.log(`   📁 Data saved to: audio-sources/data/`);
  console.log(`   🌐 Visit: http://localhost:3000/audio-labeling`);
  console.log(`\n💡 Your songs now have:`);
  console.log(`   🎯 Proper prompt/lyrics parsing`);
  console.log(`   🏷️  Hierarchical genre classification`);
  console.log(`   😊 Mood and emotional analysis from lyrics`);
  console.log(`   🎨 Smart pre-population of all fields`);
}

// Run the script
reprocessExistingFiles().catch(console.error);
