# Video Processing Solutions Analysis

## Current Problem

Our video analysis system requires keyframe extraction from uploaded videos, but FFmpeg packages are causing webpack build failures in serverless environments like Vercel. We need a production-ready solution.

## Solution Options Analysis

### Option 1: Cloud-Based Video Processing Services ⭐ **RECOMMENDED**

**AWS MediaConvert + Lambda**
- **Pros:**
  - No FFmpeg installation issues
  - Highly scalable and cost-effective
  - AWS native integration
  - Professional-grade video processing
  - Built-in thumbnails/keyframe extraction
- **Cons:**
  - Additional AWS service dependency
  - Learning curve for MediaConvert API
- **Implementation:** 2-3 days
- **Cost:** ~$0.015 per minute of video processed

**Cloudinary Video API**
- **Pros:**
  - Simple REST API
  - Built-in keyframe extraction
  - CDN integration
  - No server infrastructure needed
- **Cons:**
  - Third-party dependency
  - Higher cost for large volumes
- **Implementation:** 1-2 days
- **Cost:** ~$0.02-0.05 per video processed

### Option 2: Serverless FFmpeg (Vercel Functions)

**Custom Vercel Function with FFmpeg Binary**
- **Pros:**
  - Keeps processing in-house
  - No external service dependencies
  - Full control over processing logic
- **Cons:**
  - 50MB function size limit (tight for FFmpeg)
  - 10-second execution timeout
  - Complex binary management
- **Implementation:** 3-5 days
- **Feasibility:** Challenging but possible

### Option 3: Client-Side Processing

**WebCodecs API + Canvas**
- **Pros:**
  - No server processing load
  - Instant results
  - No additional costs
- **Cons:**
  - Limited browser support (Chrome 94+)
  - Large video files may crash browsers
  - User's device performance dependent
- **Implementation:** 4-6 days
- **Feasibility:** Good for small videos (<100MB)

### Option 4: Dedicated Video Processing Service

**Separate Docker Container with FFmpeg**
- **Pros:**
  - Full FFmpeg capabilities
  - Scalable with container orchestration
  - Clean separation of concerns
- **Cons:**
  - Additional infrastructure complexity
  - Requires DevOps setup
  - Higher operational overhead
- **Implementation:** 5-7 days
- **Cost:** $20-50/month for basic setup

## Recommended Implementation Plan

### Phase 1: Quick Win - AWS MediaConvert (Recommended)

```typescript
// app/api/video-analysis/extract-keyframes/route.ts
import { MediaConvertClient, CreateJobCommand } from "@aws-sdk/client-mediaconvert";

export async function POST(request: Request) {
  const { videoS3Key, targetFrames = 8 } = await request.json();

  const mediaConvert = new MediaConvertClient({ region: "us-east-1" });

  const jobSettings = {
    Role: process.env.MEDIACONVERT_ROLE_ARN,
    Settings: {
      Inputs: [{
        FileInput: `s3://${process.env.S3_BUCKET}/${videoS3Key}`,
        VideoSelector: {},
      }],
      OutputGroups: [{
        Name: "Thumbnails",
        OutputGroupSettings: {
          Type: "FILE_GROUP_SETTINGS",
          FileGroupSettings: {
            Destination: `s3://${process.env.S3_BUCKET}/keyframes/`
          }
        },
        Outputs: [{
          NameModifier: "_thumb",
          VideoDescription: {
            CodecSettings: {
              Codec: "FRAME_CAPTURE",
              FrameCaptureSettings: {
                FramerateNumerator: 1,
                FramerateDenominator: Math.ceil(videoDuration / targetFrames),
                MaxCaptures: targetFrames,
                Quality: 80
              }
            }
          }
        }]
      }]
    }
  };

  const command = new CreateJobCommand(jobSettings);
  const result = await mediaConvert.send(command);

  return Response.json({ jobId: result.Job?.Id });
}
```

**Setup Steps:**
1. Create MediaConvert IAM role with S3 access
2. Set up S3 event triggers for processing completion
3. Update video upload flow to trigger keyframe extraction
4. Implement webhook handler for MediaConvert job completion

**Timeline:** 2-3 days
**Cost:** ~$0.015 per minute of video

### Phase 2: Fallback - Vercel Functions with Static FFmpeg

If MediaConvert is rejected, implement lightweight FFmpeg:

```typescript
// Use static FFmpeg binary approach
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

// Download static FFmpeg binary (7MB compressed)
const FFMPEG_URL = "https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4.0/linux-x64";

export async function POST(request: Request) {
  const tempDir = '/tmp';
  const ffmpegPath = `${tempDir}/ffmpeg`;

  // Download and cache FFmpeg binary
  if (!existsSync(ffmpegPath)) {
    const response = await fetch(FFMPEG_URL);
    const buffer = await response.arrayBuffer();
    writeFileSync(ffmpegPath, Buffer.from(buffer));
    chmodSync(ffmpegPath, 0o755);
  }

  // Process video with 10-second timeout
  // Implementation details...
}
```

### Phase 3: Enhanced Client-Side Processing

For videos under 50MB, offer instant client-side processing:

```typescript
// Client-side keyframe extraction using WebCodecs
const extractKeyframesClient = async (videoFile: File, targetFrames: number) => {
  if (!('VideoDecoder' in window)) {
    throw new Error('WebCodecs not supported');
  }

  const decoder = new VideoDecoder({
    output: (frame) => {
      // Extract frame to canvas and convert to blob
    },
    error: (error) => console.error('Decode error:', error)
  });

  // Implementation for modern browsers
};
```

## Implementation Priority

1. **Week 1:** AWS MediaConvert integration (covers 90% of use cases)
2. **Week 2:** Vercel Functions fallback (for edge cases)
3. **Week 3:** Client-side processing (for instant feedback)

## Cost Analysis

| Solution | Setup Cost | Per-Video Cost | Monthly Cost (100 videos) |
|----------|------------|----------------|---------------------------|
| MediaConvert | $0 | $0.015-0.05 | $1.50-5.00 |
| Cloudinary | $0 | $0.02-0.08 | $2.00-8.00 |
| Vercel Functions | $0 | $0.000 | $0.00 |
| Dedicated Service | $50 | $0.000 | $50.00 |

## Next Steps

1. **Immediate:** Remove current broken FFmpeg implementation
2. **Day 1-2:** Set up AWS MediaConvert with basic keyframe extraction
3. **Day 3:** Integrate with existing video upload flow
4. **Day 4-5:** Add error handling and monitoring
5. **Week 2:** Implement Vercel Functions fallback if needed

This approach eliminates the FFmpeg package issues while providing a more robust, scalable solution.
