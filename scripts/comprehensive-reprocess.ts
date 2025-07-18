#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { enhancedLyricsAnalysis } from '../lib/enhanced-music-analysis';

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

    // Skip empty lines at the start
    if (!titleFound && !trimmedLine) continue;

    // First non-empty line is the title (unless it's a prompt line)
    if (!titleFound && trimmedLine && !trimmedLine.toLowerCase().startsWith('prompt')) {
      data.title = trimmedLine.replace(/^title:\s*/i, '').trim(); // Handle optional "TITLE:" prefix
      titleFound = true;
      continue;
    }

    // Look for "Prompt:" or "Prompt;" line (flexible with punctuation)
    if (trimmedLine.toLowerCase().match(/^prompt[\s:;]+/)) {
      const promptMatch = trimmedLine.match(/^prompt[\s:;]+(.+)/i);
      if (promptMatch) {
        data.prompt = promptMatch[1].trim();
        promptFound = true;
        continue;
      }
    }

    // Look for "Lyrics:" line (case insensitive)
    if (trimmedLine.toLowerCase().match(/^lyrics[\s:;]*$/)) {
      lyricsStarted = true;
      continue;
    }

    // If we found a title and prompt, and this isn't a prompt/lyrics header,
    // assume everything else is lyrics
    if (titleFound && promptFound && !lyricsStarted && trimmedLine) {
      // Check if this line looks like a lyrics header we missed
      if (!trimmedLine.toLowerCase().match(/^(lyrics|verse|chorus|bridge|intro|outro)/)) {
        lyricsStarted = true;
        lyricsLines.push(line);
        continue;
      }
    }

    // After we found "Lyrics:" or started lyrics collection
    if (lyricsStarted) {
      lyricsLines.push(line);
    }

    // If we have a title but no explicit prompt, and this line looks like it might be lyrics
    if (titleFound && !promptFound && !lyricsStarted && trimmedLine) {
      // Check if this looks like song content (verses, etc.) rather than a prompt
      if (trimmedLine.toLowerCase().match(/^\[?(verse|chorus|bridge|intro|outro|pre-verse|instrumental)/)) {
        lyricsStarted = true;
        lyricsLines.push(line);
        continue;
      }
    }
  }

  // If we didn't find lyrics but have content after the title/prompt, treat it as lyrics
  if (!lyricsStarted && titleFound && lines.length > 2) {
    let startLine = 1; // Skip title
    if (promptFound) startLine = 2; // Skip title and prompt

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim()) { // Found non-empty content
        // Collect everything from here as lyrics
        lyricsLines = lines.slice(i);
        break;
      }
    }
  }

  data.lyrics = lyricsLines.join('\n').trim();

  // Fallback: if no title found, use filename base
  if (!data.title) {
    data.title = 'Unknown Title';
  }

  return data;
}

function normalizeFilename(filename: string): string {
  // Convert underscores to spaces and normalize
  return filename.replace(/[_]/g, ' ').toLowerCase();
}

function findMatchingTxtFile(mp3Name: string, txtFiles: string[]): string | undefined {
  const mp3Base = path.parse(mp3Name).name;
  const mp3Normalized = normalizeFilename(mp3Base);

  // Try exact match first
  let match = txtFiles.find(file => {
    const txtBase = path.parse(file).name;
    return txtBase === mp3Base;
  });

  if (match) return match;

  // Try normalized match (handles underscore/space differences)
  match = txtFiles.find(file => {
    const txtBase = path.parse(file).name;
    const txtNormalized = normalizeFilename(txtBase);
    return txtNormalized === mp3Normalized;
  });

  if (match) return match;

  // Try partial matches for similar names
  match = txtFiles.find(file => {
    const txtBase = path.parse(file).name;
    const txtNormalized = normalizeFilename(txtBase);
    return txtNormalized.includes(mp3Normalized) || mp3Normalized.includes(txtNormalized);
  });

  return match;
}

async function comprehensiveReprocess() {
  console.log('🔄 Starting comprehensive reprocessing with FULL GENRE SYSTEM...');

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
    await fs.mkdir(dataDir, { recursive: true });
  }

  // Get all files
  const files = await fs.readdir(audioSourcesDir);
  const mp3Files = files.filter(file => file.endsWith('.mp3')).sort();
  const txtFiles = files.filter(file => file.endsWith('.txt') &&
    !file.includes('sample-song') &&
    !file.includes('README') &&
    !file.includes('analysis')).sort();

  console.log(`\n📊 Found ${mp3Files.length} MP3 files and ${txtFiles.length} TXT files`);
  console.log(`🎯 Using COMPREHENSIVE GENRE SYSTEM (20 primary genres, 200+ styles)`);

  let processedCount = 0;
  let pairedCount = 0;
  let unpairedCount = 0;

  // Process each MP3 file
  for (const mp3File of mp3Files) {
    const baseName = path.parse(mp3File).name;
    const txtFile = findMatchingTxtFile(mp3File, txtFiles);

    let lyricsData: LyricsData = { title: baseName };

    // Try to find and parse the TXT file
    if (txtFile) {
      try {
        const txtPath = path.join(audioSourcesDir, txtFile);
        const txtContent = await fs.readFile(txtPath, 'utf-8');
        lyricsData = parseLyricsFile(txtContent);

        console.log(`\n📝 PAIRED: ${mp3File} ↔ ${txtFile}`);
        console.log(`   Title: ${lyricsData.title}`);
        console.log(`   Prompt: ${lyricsData.prompt ? lyricsData.prompt.substring(0, 60) + '...' : 'None'}`);
        console.log(`   Lyrics: ${lyricsData.lyrics ? `${lyricsData.lyrics.substring(0, 30)}...` : 'None'}`);
        pairedCount++;
      } catch (error) {
        console.warn(`⚠️  Could not read ${txtFile}:`, error);
        unpairedCount++;
      }
    } else {
      console.log(`\n📀 UNPAIRED: ${mp3File} (no matching TXT file found)`);
      unpairedCount++;
    }

    // Run enhanced analysis
    const analysis = enhancedLyricsAnalysis(
      lyricsData.lyrics || '',
      lyricsData.prompt || ''
    );

    // Generate unique ID and mock S3 URLs
    const songId = uuidv4();
    const s3_url = `https://your-bucket.s3.amazonaws.com/audio/${mp3File}`;
    const cloudflare_url = `https://cdn.yourdomain.com/audio/${mp3File}`;

    // Create comprehensive song data with new structure
    const songData = {
      id: songId,
      filename: mp3File,
      s3_url,
      cloudflare_url,
      title: lyricsData.title || baseName,
      prompt: lyricsData.prompt || '',
      lyrics: lyricsData.lyrics || '',
      auto_analysis: {
        enhanced_analysis: analysis,
        // Keep some legacy fields for compatibility
        content_type: analysis.vocals === "none" ? "Instrumental" : "Vocal",
        word_count: analysis.word_count,
        sentiment_score: analysis.sentiment_score
      },
      manual_labels: {
        // Pre-populate with enhanced analysis
        primary_genre: analysis.primary_genre,
        styles: analysis.styles,
        energy_level: analysis.energy_level,
        emotional_intensity: analysis.emotional_intensity,
        mood: analysis.mood,
        themes: analysis.themes,
        tempo: 5, // Default middle value
        vocals: analysis.vocals,
        language: 'english',
        explicit: false,
        instrumental: analysis.vocals === "none",
        // Add fields for custom additions
        custom_styles: [],
        custom_moods: [],
        custom_themes: []
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      labeling_complete: false
    };

    console.log(`🎵 ANALYZED: ${songData.title}`);
    console.log(`   Genre: ${analysis.primary_genre} | Styles: [${analysis.styles.slice(0, 3).join(', ')}${analysis.styles.length > 3 ? '...' : ''}]`);
    console.log(`   Mood: [${analysis.mood.slice(0, 3).join(', ')}${analysis.mood.length > 3 ? '...' : ''}] | Intensity: ${analysis.emotional_intensity}/10`);
    console.log(`   Themes: [${analysis.themes.slice(0, 3).join(', ')}${analysis.themes.length > 3 ? '...' : ''}]`);
    console.log(`   Vocals: ${analysis.vocals} | Energy: ${analysis.energy_level}/10`);
    console.log(`   Prompt Elements: [${analysis.prompt.slice(0, 2).join(', ')}${analysis.prompt.length > 2 ? '...' : ''}]`);

    // Save to JSON file
    const jsonPath = path.join(dataDir, `${songId}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(songData, null, 2));

    processedCount++;
  }

  console.log(`\n🎉 COMPREHENSIVE REPROCESSING COMPLETE!`);
  console.log(`   ✅ Total Processed: ${processedCount} songs`);
  console.log(`   🔗 Paired (MP3+TXT): ${pairedCount} songs`);
  console.log(`   📀 Unpaired (MP3 only): ${unpairedCount} songs`);
  console.log(`   📁 Data saved to: audio-sources/data/`);
  console.log(`   🌐 Visit: http://localhost:3000/audio-labeling`);

  console.log(`\n💡 ENHANCED FEATURES:`);
  console.log(`   🎯 Fixed file naming mismatches (underscore vs space)`);
  console.log(`   🏷️  COMPREHENSIVE genre classification (20 primary genres)`);
  console.log(`   🎼 200+ substyles across ALL music genres`);
  console.log(`   😊 Enhanced mood detection (43 moods)`);
  console.log(`   🎨 Rich theme analysis (47 themes)`);
  console.log(`   🎤 Automatic vocal detection (male/female/both/none)`);
  console.log(`   🎛️  Prompt style analysis (renamed from production_style)`);
  console.log(`   📊 Smart pre-population of all fields`);
  console.log(`   ➕ Custom field addition support`);

  if (unpairedCount > 0) {
    console.log(`\n⚠️  NOTE: ${unpairedCount} MP3 files couldn't be paired with TXT files.`);
    console.log(`   This is normal for instrumental tracks or files with very different naming.`);
  }

  console.log(`\n🎼 PRIMARY GENRES NOW INCLUDE:`);
  console.log(`   Blues, Classical, Country, Electronic, Experimental, Folk, Funk,`);
  console.log(`   Hip Hop, Jazz, Latin, Metal, Pop, Punk, R&B, Reggae, Rock, Soul, World, Vocal`);
}

// Run the script
comprehensiveReprocess().catch(console.error);
