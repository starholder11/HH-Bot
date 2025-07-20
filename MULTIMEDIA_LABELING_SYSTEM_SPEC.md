# Multimedia Labeling and Management Platform Expansion - Product Specification

## Executive Summary

This specification details the expansion of the existing audio labeling platform into comprehensive multimedia support, including images and videos with advanced AI-powered analysis. The system will support batch uploads, automatic metadata extraction, AI-driven labeling using GPT-4V and Claude 4 Vision APIs, manual review tools, and project-based organization while maintaining strict adherence to the established Next.js/Vercel serverless architecture, AWS S3 storage, and Cloudflare CDN.

**Key New Features:**
- Advanced video analysis with keyframe extraction and AI labeling
- 3-level hierarchical organization: Project → Video → Keyframe Stills
- GPT-4V integration for creative video analysis (primary)
- Claude 4 Vision API support (future expansion)
- Reusable keyframe stills as independent image assets

## Implementation Phases

### Phase 1: Foundation & Core Infrastructure
1. **Project Entity System** - Parent-child relationship management
2. **3-Level Hierarchy System** - Project → Video → Stills relationship
3. **Basic Batch Upload Workflow** - Multi-file selection and S3 upload
4. **Metadata Extraction** - Automatic technical metadata extraction
5. **JSON Schema Implementation** - Structured data format for multimedia assets

### Phase 2: AI Integration & Processing
1. **AI Labeling for Images** - OpenAI Vision API integration
2. **Video Keyframe Extraction** - Adaptive sampling strategies with still generation
3. **GPT-4V Video Analysis Pipeline** - Advanced creative analysis
4. **Keyframe Storage System** - Independent keyframe asset management with parent relationships
5. **Claude 4 Integration Framework** - Future expansion capability

### Phase 3: User Interface & Experience
1. **Manual Review Interface** - AI label editing and validation
2. **Enhanced Media Type UI** - Type-specific editing tools
3. **3-Level Navigation System** - Project, video, and still browsing
4. **Progress Monitoring** - Real-time status and feedback

### Phase 4: Production Readiness
1. **Job Queuing & Management** - Asynchronous processing
2. **Error Handling & Recovery** - Robust failure management
3. **Performance Optimization** - Scalability and monitoring
4. **Testing & Deployment** - End-to-end validation

---

## 1. 3-Level Hierarchical Organization System

### Overview
Enhanced hierarchical relationship system: **Project → Video → Keyframe Stills**, enabling comprehensive multimedia asset management with reusable generated artifacts.

### Project Entity Schema
```json
{
  "project_id": "unique_project_id",
  "name": "Project Name",
  "description": "Optional detailed description",
  "media_assets": ["media_asset_id_1", "media_asset_id_2"],
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp",
  "asset_counts": {
    "images": 0,
    "videos": 0,
    "keyframes": 0,
    "total": 0
  }
}
```

### Video Asset Schema (Level 2)
```json
{
  "id": "unique_video_id",
  "project_id": "parent_project_id",
  "filename": "video_filename.mp4",
  "media_type": "video",
  "keyframe_stills": ["keyframe_id_1", "keyframe_id_2", "keyframe_id_3"],
  "keyframe_count": 5,
  "s3_url": "https://aws_s3_video_url",
  "cloudflare_url": "https://cloudflare_cdn_video_url"
}
```

### Keyframe Still Schema (Level 3)
```json
{
  "id": "unique_keyframe_id",
  "parent_video_id": "source_video_id",
  "project_id": "parent_project_id",
  "media_type": "keyframe_still",
  "timestamp": "00:02:15",
  "frame_number": 4050,
  "filename": "video_filename_keyframe_02m15s.jpg",
  "s3_url": "https://aws_s3_keyframe_url",
  "cloudflare_url": "https://cloudflare_cdn_keyframe_url",
  "reusable_as_image": true,
  "ai_labels": {
    "scenes": ["urban street", "evening"],
    "objects": ["person", "bicycle", "streetlight"],
    "style": ["cinematic", "moody"],
    "mood": ["contemplative", "atmospheric"],
    "themes": ["solitude", "urban life"]
  }
}
```

### Use Cases
- Browse projects containing videos and their extracted stills
- Reuse keyframe stills as independent image assets in other projects
- Analyze video content through representative frames
- Build comprehensive media libraries with automatic categorization

---

## 2. Batch Upload Workflow

### User Experience Flow
1. **File Selection**: User selects multiple media files via drag-and-drop interface
2. **Project Assignment**: User selects existing project or creates new one (optional)
3. **Video Processing Options**: User selects keyframe extraction strategy
4. **Batch Metadata**: User inputs project-level metadata (name, description)
5. **Upload Initiation**: User confirms and begins upload process
6. **Progress Monitoring**: Real-time visual feedback during upload and processing

### System Implementation
- Generate unique identifiers and AWS S3 presigned URLs per file
- Direct client-to-S3 upload to reduce backend load
- Automatic keyframe extraction and storage for videos
- Concurrent upload handling for efficiency
- Batch ID linking all files in upload session
- Real-time progress tracking with resumable uploads

### Video Processing Pipeline
1. **Upload Completion**: Video uploaded to S3
2. **Metadata Extraction**: Duration, resolution, codec analysis
3. **Keyframe Extraction**: Generate representative stills
4. **Still Storage**: Upload keyframes as separate S3 objects
5. **AI Analysis**: Process both video (via keyframes) and individual stills
6. **Relationship Creation**: Link project → video → stills hierarchy

---

## 3. Advanced Video Analysis with GPT-4V Integration

### GPT-4V Analysis Pipeline

#### Core Video Processing
```typescript
// Example Next.js API route: /api/media-labeling/videos/analyze
import OpenAI from 'openai';
import { extractKeyframesFromVideo, uploadToS3 } from '@/lib/video-processing';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  const { videoId, analysisType = "comprehensive" } = await request.json();

  try {
    // 1. Download video from S3
    const videoAsset = await getVideoAsset(videoId);
    const localVideoPath = await downloadFromS3(videoAsset.s3_url);

    // 2. Extract keyframes with smart sampling
    const keyframes = await extractKeyframesFromVideo(localVideoPath, {
      strategy: 'adaptive', // uniform, key_moments, scene_change
      targetFrames: 5,
      maxSize: { width: 1024, height: 1024 }
    });

    // 3. Upload keyframes as separate assets
    const keyframeAssets = await Promise.all(
      keyframes.map(async (frame, index) => {
        const keyframeFilename = `${videoAsset.title}_keyframe_${index + 1}.jpg`;
        const s3Key = `keyframes/${videoId}/${keyframeFilename}`;

        const s3Url = await uploadToS3(frame.buffer, s3Key);
        const cloudflareUrl = convertToCloudflareUrl(s3Url);

        return {
          id: generateUUID(),
          parent_video_id: videoId,
          project_id: videoAsset.project_id,
          media_type: 'keyframe_still',
          timestamp: frame.timestamp,
          frame_number: frame.frameNumber,
          filename: keyframeFilename,
          s3_url: s3Url,
          cloudflare_url: cloudflareUrl,
          reusable_as_image: true
        };
      })
    );

    // 4. Analyze with GPT-4V
    const analysis = await analyzeVideoWithGPT4V(keyframes, analysisType);

    // 5. Update video asset with keyframe relationships and analysis
    await updateVideoAsset(videoId, {
      keyframe_stills: keyframeAssets.map(k => k.id),
      keyframe_count: keyframeAssets.length,
      ai_labels: analysis.videoLevelLabels,
      processing_status: {
        ...videoAsset.processing_status,
        ai_labeling: 'completed',
        keyframe_extraction: 'completed'
      }
    });

    // 6. Save individual keyframe assets
    await Promise.all(
      keyframeAssets.map(async (keyframe, index) => {
        keyframe.ai_labels = analysis.keyframeLevelLabels[index];
        await saveKeyframeAsset(keyframe);
      })
    );

    return Response.json({
      success: true,
      video_analysis: analysis.videoLevelLabels,
      keyframes: keyframeAssets,
      processing_time: analysis.processingTime
    });

  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

#### GPT-4V Analysis Implementation
```typescript
async function analyzeVideoWithGPT4V(keyframes: ExtractedFrame[], analysisType: string) {
  const analysisPrompts = {
    comprehensive: `
    Analyze these video keyframes and provide detailed creative analysis focusing on:

    **VISUAL STYLE & AESTHETICS:**
    - Art style and visual approach (realistic, stylized, abstract, photographic, etc.)
    - Color palette and mood creation
    - Lighting design and atmosphere
    - Composition and visual flow
    - Texture and rendering quality

    **MOOD & EMOTIONAL TONE:**
    - Primary emotional atmosphere
    - Mood descriptors (dark, whimsical, epic, intimate, contemplative, etc.)
    - Psychological impact and viewer response
    - Atmospheric qualities (mysterious, bright, gritty, dreamlike)

    **CREATIVE THEMES & CONTENT:**
    - Central themes and concepts
    - Subject matter and setting
    - Narrative elements and storytelling
    - Cultural or genre influences
    - Symbolic or metaphorical content

    **TECHNICAL EXECUTION:**
    - Production quality indicators
    - Visual effects and techniques
    - Artistic craftsmanship level
    - Composition and framing quality

    Respond with a JSON object containing arrays for each category with specific descriptive values.
    Also provide individual frame analysis for each keyframe.
    `,

    style_focus: `
    Focus specifically on artistic and visual style analysis:
    - Art movement or style influences
    - Rendering technique and approach
    - Color theory and palette usage
    - Visual aesthetics and design language
    - Stylistic consistency across frames

    Provide JSON response with detailed style categorization.
    `,

    mood_themes: `
    Analyze mood, themes, and narrative elements:
    - Emotional tone and atmosphere
    - Thematic content and concepts
    - Genre and storytelling elements
    - Symbolic meaning and interpretation
    - Audience and content positioning

    Return JSON with comprehensive mood and theme analysis.
    `
  };

  // Encode keyframes to base64
  const encodedFrames = keyframes.map(frame => ({
    timestamp: frame.timestamp,
    data: frame.buffer.toString('base64')
  }));

  // Prepare message content
  const messageContent = [
    // Add all keyframe images first
    ...encodedFrames.map((frame, index) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${frame.data}`,
        detail: "high" as const
      }
    })),
    // Add analysis prompt
    {
      type: "text" as const,
      text: analysisPrompts[analysisType] || analysisPrompts.comprehensive
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Latest GPT-4 with vision
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ],
      max_tokens: 3000,
      temperature: 0.1
    });

    const analysisText = response.choices[0].message.content;
    const parsedAnalysis = parseGPT4VResponse(analysisText);

    return {
      success: true,
      videoLevelLabels: parsedAnalysis.videoLevel,
      keyframeLevelLabels: parsedAnalysis.keyframeLevel,
      rawAnalysis: analysisText,
      tokensUsed: response.usage?.total_tokens,
      processingTime: Date.now()
    };

  } catch (error) {
    throw new Error(`GPT-4V analysis failed: ${error.message}`);
  }
}

function parseGPT4VResponse(responseText: string) {
  try {
    // Try to extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        videoLevel: {
          scenes: parsed.scenes || [],
          objects: parsed.objects || [],
          style: parsed.style || [],
          mood: parsed.mood || [],
          themes: parsed.themes || [],
          technical_quality: parsed.technical_quality || [],
          confidence_scores: parsed.confidence_scores || {}
        },
        keyframeLevel: parsed.keyframe_analysis || []
      };
    }
  } catch (error) {
    console.warn('Could not parse structured JSON, extracting key attributes');
  }

  // Fallback: extract key attributes from text
  return {
    videoLevel: extractKeyAttributesFromText(responseText),
    keyframeLevel: []
  };
}
```

### Claude 4 Vision Integration Framework (Future Expansion)

```typescript
// Future implementation: /api/media-labeling/videos/analyze-claude
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function analyzeVideoWithClaude4(keyframes: ExtractedFrame[], analysisType: string) {
  const analysisPrompts = {
    creative_analysis: `
    As a creative director and visual analyst, examine these video keyframes:

    **VISUAL STYLE & AESTHETICS:**
    - Artistic approach and visual DNA
    - Color story and palette strategy
    - Lighting design and mood creation
    - Composition and visual hierarchy
    - Texture and material quality

    **MOOD & EMOTIONAL RESONANCE:**
    - Primary atmospheric qualities
    - Emotional impact and viewer response
    - Psychological undertones
    - Audience engagement factors

    **CREATIVE THEMES & STORYTELLING:**
    - Central narrative concepts
    - Thematic depth and meaning
    - Cultural and genre positioning
    - Symbolic content and metaphor

    Provide comprehensive analysis with actionable creative insights.
    `,

    worldbuilding: `
    Analyze these frames for worldbuilding and environmental design:
    - World design language and consistency
    - Environmental storytelling elements
    - Cultural and civilization indicators
    - Architectural and design systems
    - How content fits into broader narrative universes
    `
  };

  // Prepare message with images and text
  const messageContent = [
    // Add keyframe images
    ...keyframes.map(frame => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: frame.buffer.toString('base64')
      }
    })),
    // Add analysis prompt
    {
      type: "text" as const,
      text: analysisPrompts[analysisType] || analysisPrompts.creative_analysis
    }
  ];

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4", // Latest Claude 4 model
      max_tokens: 4000,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ]
    });

    return {
      success: true,
      analysis: response.content[0].text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      provider: "claude-4"
    };

  } catch (error) {
    throw new Error(`Claude 4 analysis failed: ${error.message}`);
  }
}
```

---

## 4. Enhanced JSON Metadata Schema

### Core Video Asset Schema with 3-Level Relationships
```json
{
  "id": "unique_video_id",
  "batch_id": "unique_batch_id",
  "project": {
    "project_id": "unique_project_id",
    "name": "Project Name",
    "description": "Optional description"
  },
  "filename": "video_filename.mp4",
  "title": "Extracted or custom title",
  "media_type": "video",
  "s3_url": "https://aws_s3_video_url",
  "cloudflare_url": "https://cloudflare_cdn_video_url",

  "keyframe_stills": [
    {
      "id": "keyframe_still_id_1",
      "timestamp": "00:00:05",
      "frame_number": 150,
      "filename": "video_filename_keyframe_1.jpg",
      "s3_url": "https://aws_s3_keyframe_url",
      "cloudflare_url": "https://cloudflare_cdn_keyframe_url",
      "reusable_as_image": true,
      "ai_labels": {
        "scenes": ["interior", "studio"],
        "objects": ["person", "equipment"],
        "style": ["professional", "clean"],
        "mood": ["focused", "creative"],
        "themes": ["work", "artistry"]
      }
    }
  ],
  "keyframe_count": 5,

  "metadata": {
    "file_size": 15728640,
    "format": "mp4",
    "resolution": {"width": 1920, "height": 1080},
    "duration": 120.5,
    "codec": "h264",
    "frame_rate": 30,
    "aspect_ratio": "16:9",
    "bitrate": 5000000,
    "color_profile": "rec709"
  },

  "ai_labels": {
    "overall_analysis": {
      "scenes": ["urban environment", "artistic workspace", "creative process"],
      "objects": ["person", "tools", "equipment", "artwork"],
      "style": ["documentary", "observational", "natural lighting"],
      "mood": ["contemplative", "focused", "inspiring"],
      "themes": ["creativity", "craftsmanship", "artistic process"],
      "technical_quality": ["professional", "well-composed", "stable footage"]
    },
    "keyframe_analysis": [
      {
        "timestamp": "00:00:05",
        "scenes": ["interior", "studio"],
        "objects": ["person", "workbench"],
        "confidence_scores": {"scenes": [0.95], "objects": [0.88, 0.92]}
      }
    ],
    "analysis_metadata": {
      "provider": "gpt-4v",
      "model": "gpt-4o",
      "analysis_type": "comprehensive",
      "tokens_used": 2750,
      "confidence_average": 0.87,
      "processing_time_ms": 4500
    }
  },

  "manual_labels": {
    "scenes": [],
    "objects": [],
    "style": [],
    "mood": [],
    "themes": [],
    "custom_tags": [],
    "keyframe_overrides": {}
  },

  "processing_status": {
    "upload": "completed",
    "metadata_extraction": "completed",
    "keyframe_extraction": "completed",
    "ai_labeling": "completed",
    "manual_review": "pending"
  },

  "timestamps": {
    "uploaded": "2025-01-20T10:30:00Z",
    "metadata_extracted": "2025-01-20T10:30:30Z",
    "keyframes_extracted": "2025-01-20T10:31:00Z",
    "labeled_ai": "2025-01-20T10:32:15Z",
    "labeled_reviewed": null
  },

  "labeling_complete": false
}
```

### Keyframe Still as Independent Image Asset
```json
{
  "id": "unique_keyframe_id",
  "parent_video_id": "source_video_id",
  "project_id": "parent_project_id",
  "media_type": "keyframe_still",
  "source_info": {
    "video_filename": "original_video.mp4",
    "timestamp": "00:02:15",
    "frame_number": 4050,
    "extraction_method": "adaptive_sampling"
  },
  "filename": "video_filename_keyframe_02m15s.jpg",
  "title": "Generated from: Original Video - 02:15",
  "s3_url": "https://aws_s3_keyframe_url",
  "cloudflare_url": "https://cloudflare_cdn_keyframe_url",
  "reusable_as_image": true,

  "metadata": {
    "file_size": 245760,
    "format": "jpeg",
    "resolution": {"width": 1920, "height": 1080},
    "aspect_ratio": "16:9",
    "color_profile": "sRGB",
    "quality": 85
  },

  "ai_labels": {
    "scenes": ["urban street", "evening"],
    "objects": ["person", "bicycle", "streetlight", "building"],
    "style": ["cinematic", "moody", "realistic"],
    "mood": ["contemplative", "atmospheric", "solitary"],
    "themes": ["urban life", "solitude", "evening routine"],
    "confidence_scores": {
      "scenes": [0.92, 0.87],
      "objects": [0.89, 0.94, 0.96, 0.85],
      "style": [0.91, 0.88, 0.93],
      "mood": [0.86, 0.90, 0.84],
      "themes": [0.88, 0.91, 0.85]
    }
  },

  "usage_tracking": {
    "times_reused": 0,
    "projects_used_in": [],
    "last_used": null
  },

  "processing_status": {
    "extraction": "completed",
    "ai_labeling": "completed",
    "manual_review": "pending"
  },

  "timestamps": {
    "extracted": "2025-01-20T10:31:00Z",
    "labeled_ai": "2025-01-20T10:32:15Z",
    "labeled_reviewed": null
  },

  "labeling_complete": false
}
```

---

## 5. Advanced Video Processing Pipeline

### Keyframe Extraction Strategies

#### Adaptive Sampling (Recommended)
```typescript
function adaptiveKeyframeExtraction(videoDuration: number, targetFrames: number = 5) {
  if (videoDuration <= 10) {
    // Short clips: 1 frame per 2 seconds
    return {
      method: 'uniform_short',
      interval: 2,
      skipStart: 0.5, // Skip first 0.5 seconds
      skipEnd: 0.5
    };
  } else if (videoDuration <= 300) {
    // Medium clips: Scene-aware sampling
    return {
      method: 'scene_aware',
      targetFrames,
      sceneChangeThreshold: 0.3,
      minInterval: 5 // Minimum 5 seconds between frames
    };
  } else {
    // Long clips: Intelligent sampling with scene detection
    return {
      method: 'intelligent_long',
      targetFrames,
      sceneChangeThreshold: 0.4,
      skipStart: videoDuration * 0.05, // Skip first 5%
      skipEnd: videoDuration * 0.05
    };
  }
}
```

#### Scene Change Detection
```typescript
async function detectSceneChanges(videoPath: string): Promise<number[]> {
  // Use FFmpeg scene detection
  const ffmpeg = spawn('ffmpeg', [
    '-i', videoPath,
    '-vf', 'select=gt(scene\\,0.3),showinfo',
    '-f', 'null',
    '-'
  ]);

  const sceneTimestamps: number[] = [];

  ffmpeg.stderr.on('data', (data) => {
    const output = data.toString();
    const matches = output.match(/pts_time:([0-9.]+)/g);

    if (matches) {
      matches.forEach(match => {
        const timestamp = parseFloat(match.split(':')[1]);
        sceneTimestamps.push(timestamp);
      });
    }
  });

  return new Promise((resolve) => {
    ffmpeg.on('close', () => {
      resolve(sceneTimestamps);
    });
  });
}
```

### Keyframe Storage and Relationship Management

```typescript
// API route: /api/media-labeling/keyframes/reuse
export async function POST(request: Request) {
  const { keyframeId, targetProjectId } = await request.json();

  try {
    // Get original keyframe
    const keyframe = await getKeyframeAsset(keyframeId);

    // Create new image asset reference (reuse same S3 object)
    const reusedImage = {
      ...keyframe,
      id: generateUUID(),
      project_id: targetProjectId,
      media_type: 'image', // Now treated as regular image
      title: `Reused: ${keyframe.title}`,
      source_info: {
        ...keyframe.source_info,
        reused_from: keyframeId,
        original_video_id: keyframe.parent_video_id
      },
      usage_tracking: {
        times_reused: keyframe.usage_tracking.times_reused + 1,
        projects_used_in: [...keyframe.usage_tracking.projects_used_in, targetProjectId],
        last_used: new Date().toISOString()
      }
    };

    // Save as new image asset
    await saveImageAsset(reusedImage);

    // Update original keyframe usage tracking
    await updateKeyframeUsage(keyframeId, reusedImage.usage_tracking);

    return Response.json({
      success: true,
      reused_asset: reusedImage
    });

  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## 6. Enhanced User Interface for 3-Level Navigation

### Project → Video → Stills Interface

```typescript
// React component structure
function MediaBrowser() {
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [viewMode, setViewMode] = useState('projects'); // projects | videos | stills

  return (
    <div className="media-browser">
      {/* Breadcrumb Navigation */}
      <Breadcrumbs>
        <BreadcrumbItem
          onClick={() => setViewMode('projects')}
          active={viewMode === 'projects'}
        >
          Projects
        </BreadcrumbItem>

        {selectedProject && (
          <BreadcrumbItem
            onClick={() => setViewMode('videos')}
            active={viewMode === 'videos'}
          >
            {selectedProject.name}
          </BreadcrumbItem>
        )}

        {selectedVideo && (
          <BreadcrumbItem active={viewMode === 'stills'}>
            {selectedVideo.title} - Keyframes
          </BreadcrumbItem>
        )}
      </Breadcrumbs>

      {/* Dynamic Content Area */}
      {viewMode === 'projects' && (
        <ProjectGridView
          onProjectSelect={setSelectedProject}
        />
      )}

      {viewMode === 'videos' && selectedProject && (
        <VideoGridView
          projectId={selectedProject.id}
          onVideoSelect={setSelectedVideo}
        />
      )}

      {viewMode === 'stills' && selectedVideo && (
        <KeyframeStillsView
          videoId={selectedVideo.id}
          keyframes={selectedVideo.keyframe_stills}
        />
      )}
    </div>
  );
}

function KeyframeStillsView({ videoId, keyframes }) {
  const [selectedKeyframe, setSelectedKeyframe] = useState(null);

  return (
    <div className="keyframe-stills-view">
      {/* Keyframe Timeline */}
      <VideoTimeline videoId={videoId} keyframes={keyframes} />

      {/* Keyframe Grid */}
      <div className="keyframe-grid">
        {keyframes.map(keyframe => (
          <KeyframeCard
            key={keyframe.id}
            keyframe={keyframe}
            onSelect={setSelectedKeyframe}
            onReuseAsImage={() => handleReuseAsImage(keyframe)}
          />
        ))}
      </div>

      {/* Keyframe Detail Panel */}
      {selectedKeyframe && (
        <KeyframeDetailPanel
          keyframe={selectedKeyframe}
          onClose={() => setSelectedKeyframe(null)}
        />
      )}
    </div>
  );
}

function KeyframeCard({ keyframe, onSelect, onReuseAsImage }) {
  return (
    <div className="keyframe-card" onClick={() => onSelect(keyframe)}>
      <img
        src={keyframe.cloudflare_url}
        alt={`Keyframe at ${keyframe.timestamp}`}
        className="keyframe-thumbnail"
      />

      <div className="keyframe-info">
        <span className="timestamp">{keyframe.timestamp}</span>

        {/* AI Labels Preview */}
        <div className="label-preview">
          {keyframe.ai_labels.mood.slice(0, 2).map(mood => (
            <span key={mood} className="mood-tag">{mood}</span>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="keyframe-actions">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReuseAsImage();
            }}
            className="reuse-button"
          >
            Reuse as Image
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Video Analysis Dashboard

```typescript
function VideoAnalysisDashboard({ videoId }) {
  const [analysisResults, setAnalysisResults] = useState(null);
  const [analysisType, setAnalysisType] = useState('comprehensive');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const runAnalysis = async (provider = 'gpt-4v') => {
    setIsAnalyzing(true);

    try {
      const response = await fetch('/api/media-labeling/videos/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          analysisType,
          provider
        })
      });

      const results = await response.json();
      setAnalysisResults(results);

    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="video-analysis-dashboard">
      {/* Analysis Controls */}
      <div className="analysis-controls">
        <select
          value={analysisType}
          onChange={(e) => setAnalysisType(e.target.value)}
        >
          <option value="comprehensive">Comprehensive Analysis</option>
          <option value="style_focus">Style & Aesthetics</option>
          <option value="mood_themes">Mood & Themes</option>
        </select>

        <button
          onClick={() => runAnalysis('gpt-4v')}
          disabled={isAnalyzing}
          className="analyze-button primary"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze with GPT-4V'}
        </button>

        <button
          onClick={() => runAnalysis('claude-4')}
          disabled={isAnalyzing}
          className="analyze-button secondary"
        >
          Analyze with Claude 4 (Future)
        </button>
      </div>

      {/* Analysis Results */}
      {analysisResults && (
        <AnalysisResultsPanel results={analysisResults} />
      )}
    </div>
  );
}
```

---

## 7. Performance Optimization & Best Practices

### Keyframe Processing Optimization

```typescript
// Parallel keyframe processing
async function processKeyframesInBatches(keyframes: ExtractedFrame[], batchSize: number = 3) {
  const results = [];

  for (let i = 0; i < keyframes.length; i += batchSize) {
    const batch = keyframes.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (keyframe) => {
        // Optimize image size for API
        const optimizedFrame = await optimizeImageForAnalysis(keyframe);

        // Upload to S3
        const s3Url = await uploadKeyframeToS3(optimizedFrame);

        // Analyze with AI
        const aiLabels = await analyzeImageWithGPT4V(optimizedFrame);

        return {
          ...keyframe,
          s3_url: s3Url,
          ai_labels: aiLabels
        };
      })
    );

    results.push(...batchResults);

    // Rate limiting: wait between batches
    if (i + batchSize < keyframes.length) {
      await sleep(1000); // 1 second delay between batches
    }
  }

  return results;
}

async function optimizeImageForAnalysis(frame: ExtractedFrame) {
  const maxSize = { width: 1024, height: 1024 };
  const targetQuality = 85;

  // Resize if needed to stay within token limits
  if (frame.width * frame.height > 1048576) { // 1024x1024
    const aspectRatio = frame.width / frame.height;

    if (aspectRatio > 1) {
      frame.width = Math.min(maxSize.width, frame.width);
      frame.height = Math.round(frame.width / aspectRatio);
    } else {
      frame.height = Math.min(maxSize.height, frame.height);
      frame.width = Math.round(frame.height * aspectRatio);
    }
  }

  return frame;
}
```

### Error Handling and Retry Logic

```typescript
import { exponentialBackoff } from '@/lib/utils';

async function robustVideoAnalysis(videoId: string, maxRetries: number = 3) {
  return exponentialBackoff(async () => {
    try {
      return await analyzeVideoWithGPT4V(videoId);
    } catch (error) {
      if (error.status === 429) {
        // Rate limit hit, will retry with backoff
        throw error;
      } else if (error.status >= 500) {
        // Server error, will retry
        throw error;
      } else {
        // Client error, don't retry
        throw new Error(`Permanent failure: ${error.message}`);
      }
    }
  }, maxRetries);
}

function exponentialBackoff(fn: () => Promise<any>, maxRetries: number = 3) {
  return new Promise(async (resolve, reject) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await fn();
        resolve(result);
        return;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          reject(error);
          return;
        }

        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s...
        await sleep(delay);
      }
    }
  });
}
```

---

## 8. Future Extensibility & Claude 4 Integration

### Modular Analysis Provider System

```typescript
// Abstract provider interface
interface VideoAnalysisProvider {
  name: string;
  analyzeVideo(keyframes: ExtractedFrame[], options: AnalysisOptions): Promise<AnalysisResult>;
  getCapabilities(): ProviderCapabilities;
}

// GPT-4V implementation
class GPT4VProvider implements VideoAnalysisProvider {
  name = 'gpt-4v';

  async analyzeVideo(keyframes: ExtractedFrame[], options: AnalysisOptions) {
    // Implementation as shown above
  }

  getCapabilities() {
    return {
      maxImages: 10,
      maxTokens: 4000,
      supportedFormats: ['jpeg', 'png', 'webp'],
      analysisTypes: ['comprehensive', 'style_focus', 'mood_themes']
    };
  }
}

// Claude 4 implementation (future)
class Claude4Provider implements VideoAnalysisProvider {
  name = 'claude-4';

  async analyzeVideo(keyframes: ExtractedFrame[], options: AnalysisOptions) {
    // Claude 4 specific implementation
  }

  getCapabilities() {
    return {
      maxImages: 20,
      maxTokens: 8000,
      supportedFormats: ['jpeg', 'png', 'webp', 'gif'],
      analysisTypes: ['creative_analysis', 'worldbuilding', 'style_transfer']
    };
  }
}

// Provider registry
class AnalysisProviderRegistry {
  private providers = new Map<string, VideoAnalysisProvider>();

  register(provider: VideoAnalysisProvider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): VideoAnalysisProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Usage
const registry = new AnalysisProviderRegistry();
registry.register(new GPT4VProvider());
registry.register(new Claude4Provider());

// API route can now use any provider
export async function POST(request: Request) {
  const { videoId, provider = 'gpt-4v', analysisType } = await request.json();

  const analysisProvider = registry.getProvider(provider);
  const result = await analysisProvider.analyzeVideo(keyframes, { analysisType });

  return Response.json(result);
}
```

---

## 9. Security & Performance Considerations

### API Rate Limiting and Cost Management

```typescript
// Rate limiting for AI API calls
class AIAPIRateLimit {
  private readonly limits = {
    'gpt-4v': { requestsPerMinute: 50, tokensPerMinute: 40000 },
    'claude-4': { requestsPerMinute: 60, tokensPerMinute: 50000 }
  };

  private usage = new Map<string, { requests: number, tokens: number, resetTime: number }>();

  async checkRateLimit(provider: string, estimatedTokens: number): Promise<boolean> {
    const now = Date.now();
    const limit = this.limits[provider];

    if (!limit) return true;

    const usage = this.usage.get(provider) || { requests: 0, tokens: 0, resetTime: now + 60000 };

    // Reset if minute has passed
    if (now > usage.resetTime) {
      usage.requests = 0;
      usage.tokens = 0;
      usage.resetTime = now + 60000;
    }

    // Check limits
    if (usage.requests >= limit.requestsPerMinute ||
        usage.tokens + estimatedTokens > limit.tokensPerMinute) {
      return false;
    }

    // Update usage
    usage.requests++;
    usage.tokens += estimatedTokens;
    this.usage.set(provider, usage);

    return true;
  }
}
```

### Security Measures

```typescript
// Validate video files before processing
function validateVideoFile(file: File): ValidationResult {
  const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
  const maxSize = 500 * 1024 * 1024; // 500MB
  const minDuration = 1; // 1 second
  const maxDuration = 3600; // 1 hour

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Unsupported file type' };
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'File too large' };
  }

  // Additional validation would be done after upload
  return { valid: true };
}

// Sanitize AI responses
function sanitizeAIResponse(response: string): string {
  // Remove potential injection attempts
  return response
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}
```

---

## 10. Success Metrics & KPIs

### Technical Performance KPIs
- **Video Upload Success Rate**: >99% successful uploads
- **Keyframe Extraction Time**: <30 seconds for videos up to 5 minutes
- **AI Analysis Time**: <2 minutes for 5-keyframe analysis
- **System Uptime**: 99.9% availability target
- **Error Recovery**: <5% manual intervention required

### User Experience KPIs
- **Time to First Analysis**: <3 minutes from upload completion
- **AI Label Accuracy**: >80% acceptance rate for AI-generated labels
- **Keyframe Reuse Rate**: >30% of extracted keyframes reused as images
- **User Efficiency**: 60% reduction in manual video labeling time
- **Feature Adoption**: >70% user engagement with video analysis features

### Business Value KPIs
- **Content Processing Volume**: Support for 1000+ videos per month
- **Storage Optimization**: 40% reduction in duplicate content through keyframe reuse
- **Analysis Cost Efficiency**: <$0.50 per video for AI analysis
- **User Retention**: 85% of users continue using video features after 30 days

This specification provides comprehensive guidance for implementing advanced video analysis capabilities that build upon the existing multimedia platform while introducing cutting-edge AI analysis and innovative 3-level hierarchical organization.
