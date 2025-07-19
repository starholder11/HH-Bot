import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { uploadAudioToS3, generateUniqueFilename } from '@/lib/s3-config';
import { saveSong } from '@/lib/song-storage';

interface LyricsData {
  title?: string;
  prompt?: string;
  lyrics?: string;
}

function parseLyricsFile(content: string): LyricsData {
  const lines = content.split('\n');
  const data: LyricsData = {};

  // Get title from first non-empty line
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

    // Look for "Prompt:" line
    if (trimmedLine.toLowerCase().startsWith('prompt:')) {
      data.prompt = trimmedLine.substring(7).trim(); // Remove "Prompt:" and trim
      promptFound = true;
      continue;
    }

    // Look for "Lyrics:" line
    if (trimmedLine.toLowerCase().startsWith('lyrics:')) {
      lyricsStarted = true;
      // Check if there's content on the same line after "Lyrics:"
      const lyricsOnSameLine = trimmedLine.substring(7).trim();
      if (lyricsOnSameLine) {
        lyricsLines.push(lyricsOnSameLine);
      }
      continue;
    }

    // Collect everything after "Lyrics:" line
    if (lyricsStarted) {
      lyricsLines.push(line); // Keep original formatting including spaces
    }
  }

  data.lyrics = lyricsLines.join('\n').trim();
  return data;
}

function analyzeContent(lyrics: string, prompt: string): any {
  const words = lyrics.toLowerCase().split(/\s+/);
  const wordCount = words.length;

  // Detect content type based on characteristics
  const contentTypes = [];

  // Check for experimental/onomatopoeia content
  if (lyrics.includes('om-') || lyrics.includes('ah-ah') || lyrics.includes('hree-') || lyrics.includes('dhung-')) {
    contentTypes.push('onomatopoeia');
  }

  // Check for production notes
  if (lyrics.includes('[') && lyrics.includes(']')) {
    contentTypes.push('production notes');
  }

  // Check for traditional lyrics (verses, narrative structure)
  if (lyrics.includes('\n\n') || lyrics.split('\n').length > 10) {
    contentTypes.push('traditional lyrics');
  }

  // Check for minimal content
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

  // Extract structural elements (for experimental music)
  const structuralElements = [];
  if (lyrics.includes('[Intro')) structuralElements.push('intro');
  if (lyrics.includes('[Verse')) structuralElements.push('verse');
  if (lyrics.includes('[Chorus')) structuralElements.push('chorus');
  if (lyrics.includes('[Bridge')) structuralElements.push('bridge');
  if (lyrics.includes('[Outro')) structuralElements.push('outro');
  if (lyrics.includes('[Instrumental')) structuralElements.push('instrumental');
  if (lyrics.includes('[Sample')) structuralElements.push('samples');

  // Calculate energy based on prompt keywords
  let energyScore = 5; // default
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
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Separate MP3 and TXT files
    const mp3Files = files.filter(file => file.name.endsWith('.mp3'));
    const txtFiles = files.filter(file => file.name.endsWith('.txt'));

    const results = [];

    // Process file pairs
    for (const mp3File of mp3Files) {
      const baseName = path.parse(mp3File.name).name;
      const txtFile = txtFiles.find(file => path.parse(file.name).name === baseName);

      if (!txtFile) {
        console.warn(`No matching TXT file for ${mp3File.name}`);
        continue;
      }

      try {
        // Read TXT file content
        const txtContent = await txtFile.text();
        const lyricsData = parseLyricsFile(txtContent);

        // Upload MP3 to S3
        const uniqueFilename = generateUniqueFilename(mp3File.name);
        const { s3_url, cloudflare_url } = await uploadAudioToS3(mp3File, uniqueFilename);

        // Perform automated analysis
        const autoAnalysis = analyzeContent(lyricsData.lyrics || '', lyricsData.prompt || '');

        // Create song data object
        const songData = {
          id: uuidv4(),
          filename: mp3File.name,
          s3_url,
          cloudflare_url,
          lyrics: lyricsData.lyrics || '',
          title: lyricsData.title || baseName,
          prompt: lyricsData.prompt || '',
          auto_analysis: autoAnalysis,
          manual_labels: {
            primary_genres: [],
            production_techniques: [],
            content_type: '',
            energy_level: autoAnalysis.estimated_energy || 5,
            emotional_intensity: 5,
            mood: [],
            tempo_feel: '',
            language: 'english',
            explicit: false,
            instrumental: false
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          labeling_complete: false
        };

        // Persist song JSON
        await saveSong(songData.id, songData);

        results.push(songData);

      } catch (error) {
        console.error(`Error processing ${mp3File.name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      songs: results
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}
