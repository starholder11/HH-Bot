# Multimedia Labeling and Management Platform Expansion - Product Specification

## Executive Summary

This specification details the expansion of the existing audio labeling platform into comprehensive multimedia support, including images and videos. The system will support batch uploads, automatic metadata extraction, AI-driven labeling, manual review tools, and project-based organization while maintaining strict adherence to the established Next.js/Vercel serverless architecture, AWS S3 storage, and Cloudflare CDN.

## Implementation Phases

### Phase 1: Foundation & Core Infrastructure
1. **Project Entity System** - Parent-child relationship management
2. **Basic Batch Upload Workflow** - Multi-file selection and S3 upload
3. **Metadata Extraction** - Automatic technical metadata extraction
4. **JSON Schema Implementation** - Structured data format for multimedia assets

### Phase 2: AI Integration & Processing
1. **AI Labeling for Images** - OpenAI Vision API integration
2. **Video Keyframe Extraction** - Adaptive sampling strategies
3. **AI Pipeline for Videos** - Keyframe analysis and aggregation
4. **Keyframe Storage System** - Independent keyframe asset management

### Phase 3: User Interface & Experience
1. **Manual Review Interface** - AI label editing and validation
2. **Enhanced Media Type UI** - Type-specific editing tools
3. **Navigation Systems** - Project and asset browsing
4. **Progress Monitoring** - Real-time status and feedback

### Phase 4: Production Readiness
1. **Job Queuing & Management** - Asynchronous processing
2. **Error Handling & Recovery** - Robust failure management
3. **Performance Optimization** - Scalability and monitoring
4. **Testing & Deployment** - End-to-end validation

---

## 1. Project-Based Organization System

### Overview
Hierarchical relationship system where Projects serve as parent entities containing multiple Media Objects as children, enabling streamlined asset management and improved searchability.

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
    "total": 0
  }
}
```

### Use Cases
- User creates new Project with descriptive title and optional description
- User manages existing Projects, viewing associated media assets and metadata summaries
- User locates and retrieves media assets based on Project metadata
- Bulk operations across all assets within a Project

### Implementation Notes
- Projects stored as distinct JSON documents in S3
- Child media assets reference parent Project IDs
- UI provides project creation, editing, and navigation interfaces
- Project selection optional but recommended for organization

---

## 2. Batch Upload Workflow

### User Experience Flow
1. **File Selection**: User selects multiple media files via drag-and-drop interface
2. **Project Assignment**: User selects existing project or creates new one (optional)
3. **Batch Metadata**: User inputs project-level metadata (name, description)
4. **Upload Initiation**: User confirms and begins upload process
5. **Progress Monitoring**: Real-time visual feedback during upload

### System Implementation
- Generate unique identifiers and AWS S3 presigned URLs per file
- Direct client-to-S3 upload to reduce backend load
- Concurrent upload handling for efficiency
- Batch ID linking all files in upload session
- Real-time progress tracking with resumable uploads

### Error Handling
- Individual file-level state tracking within batches
- Upload states: `pending`, `uploading`, `completed`, `error`
- Resumable uploads after network failures
- Clear UI indicators and recovery actions
- Detailed error logging for troubleshooting

---

## 3. Automatic Metadata Extraction

### Trigger Mechanism
Serverless functions triggered upon AWS S3 upload event completion

### Image Metadata Extraction
- **Resolution**: Width and height in pixels
- **File Format**: JPEG, PNG, WebP, etc.
- **Color Profile**: RGB, CMYK, sRGB
- **File Size**: Bytes
- **Creation Date**: EXIF data if available

### Video Metadata Extraction
- **Resolution**: Width and height
- **Duration**: Total length in seconds
- **Codec**: H.264, H.265, VP9, etc.
- **Frame Rate**: FPS
- **Aspect Ratio**: Calculated ratio
- **Bitrate**: Average bitrate
- **File Size**: Bytes

### Implementation Details
- Use FFmpeg/FFprobe for video analysis
- Sharp.js or similar for image analysis
- Immediate JSON metadata file update
- Error handling for corrupt or unsupported files

---

## 4. AI Labeling Pipeline

### Image Processing
**API Integration**: OpenAI Vision API (primary), with modular design for alternative providers

**Analysis Categories**:
- **Scene Description**: Environment and setting context
- **Object Detection**: Identification of people, animals, objects
- **Visual Style**: Photographic, illustration, cinematic, artistic
- **Mood/Emotion**: Inferred emotional context
- **Themes**: High-level conceptual categorization

### Video Processing Strategy

#### Keyframe Extraction Options
Users can select from three sampling strategies:

**1. Conditional Logic (Default)**
- Short clips (≤10 seconds): 1 frame per second
- Medium clips (10 seconds–5 minutes): 1 frame per 5-10 seconds
- Long clips (>5 minutes): Scene detection API for unique keyframes

**2. Timed Sampling**
- User-defined interval (e.g., every 5 seconds)
- Consistent sampling regardless of content

**3. Scene Change Detection**
- API-based scene boundary detection
- Extract keyframes at significant visual transitions

#### Video Labeling Process
1. Extract keyframes using selected strategy
2. Apply image AI labeling to each keyframe
3. Aggregate labels across all keyframes
4. Generate video-level metadata summary
5. Store individual keyframe analysis for review

---

## 5. JSON Metadata Schema

### Core Media Asset Schema
```json
{
  "id": "unique_asset_id",
  "batch_id": "unique_batch_id",
  "project": {
    "project_id": "unique_project_id",
    "name": "Project Name",
    "description": "Optional description"
  },
  "filename": "media_filename.ext",
  "media_type": "image" | "video",
  "s3_url": "https://aws_s3_url",
  "cloudflare_url": "https://cloudflare_cdn_url",
  "metadata": {
    "file_size": 123456,
    "format": "jpeg/mp4",
    "resolution": {"width": 1920, "height": 1080},
    "duration": 120,
    "codec": "h264",
    "frame_rate": 30,
    "aspect_ratio": "16:9",
    "color_profile": "sRGB"
  },
  "ai_labels": {
    "scenes": ["beach", "sunset"],
    "objects": ["person", "surfboard"],
    "style": ["photographic", "cinematic"],
    "mood": ["relaxed", "adventurous"],
    "themes": ["vacation", "leisure"],
    "confidence_scores": {
      "scenes": [0.95, 0.87],
      "objects": [0.92, 0.78]
    }
  },
  "manual_labels": {
    "scenes": [],
    "objects": [],
    "style": [],
    "mood": [],
    "themes": [],
    "custom_tags": []
  },
  "keyframes": [
    {
      "timestamp": "00:00:03",
      "s3_url": "...",
      "cloudflare_url": "...",
      "ai_labels": {...}
    }
  ],
  "processing_status": {
    "upload": "completed",
    "metadata_extraction": "completed",
    "ai_labeling": "completed",
    "manual_review": "pending"
  },
  "timestamps": {
    "uploaded": "ISO8601 timestamp",
    "metadata_extracted": "ISO8601 timestamp",
    "labeled_ai": "ISO8601 timestamp",
    "labeled_reviewed": "ISO8601 timestamp"
  },
  "labeling_complete": false
}
```

---

## 6. Manual Review Interface

### UI Components
- **AI Label Display**: Clear categorization of auto-generated labels
- **Edit Controls**: Accept, edit, remove, or add labels with minimal clicks
- **Video Navigation**: Frame-by-frame navigation with timestamp display
- **Batch Operations**: Apply labels across multiple assets
- **Status Indicators**: Visual progress tracking

### Functionality
- Real-time synchronization of manual edits to JSON metadata
- Undo/redo capability for label modifications
- Keyboard shortcuts for efficient navigation
- Bulk label application across similar assets
- Export capabilities for labeled datasets

### Integration with Existing Audio System
- Consistent UI patterns and design language
- Shared labeling taxonomy where applicable
- Unified search and filter capabilities
- Cross-media type project organization

---

## 7. Enhanced UI for Different Media Types

### Media Type Navigation
- **Tab-based Interface**: Audio | Images | Videos | All Media
- **Type-specific Filters**: Resolution, duration, format filters
- **Unified Search**: Cross-media search capabilities

### Type-Specific Editing Tools

#### Image Interface
- **Thumbnail Grid View**: Quick visual scanning
- **Zoom and Pan**: Detailed image inspection
- **Label Overlay**: Visual tag placement on images
- **Batch Selection**: Multi-image operations

#### Video Interface
- **Timeline Navigation**: Scrubbing through video content
- **Keyframe Viewer**: Jump between extracted frames
- **Playback Controls**: Standard video player functionality
- **Frame-specific Labeling**: Per-frame tag management

#### Shared Features
- **Consistent Label Editor**: Unified tagging interface
- **Status Indicators**: Processing and review states
- **Metadata Panel**: Technical details display
- **Export Options**: Various format exports

---

## 8. Job Queue and Processing Management

### Asynchronous Processing Architecture
- **Upload Queue**: File transfer management
- **Metadata Queue**: Technical analysis processing
- **AI Labeling Queue**: Vision API processing
- **Notification Queue**: User updates and alerts

### Job State Management
```json
{
  "job_id": "unique_job_id",
  "asset_id": "unique_asset_id",
  "job_type": "upload | metadata | ai_labeling",
  "status": "queued | processing | completed | error | retrying",
  "progress": 75,
  "started_at": "ISO8601 timestamp",
  "completed_at": "ISO8601 timestamp",
  "error_details": {
    "message": "Error description",
    "retry_count": 2,
    "max_retries": 3
  }
}
```

### Error Recovery
- **Automatic Retry Logic**: Exponential backoff for transient failures
- **Manual Retry Options**: User-initiated retry for failed jobs
- **Detailed Error Logging**: Comprehensive failure tracking
- **Graceful Degradation**: Partial success handling

---

## 9. System Architecture & Constraints

### Technology Stack
- **Frontend**: React/Next.js deployed via Vercel
- **Backend**: Next.js API routes (serverless functions)
- **Storage**: AWS S3 with Cloudflare CDN
- **AI Processing**: OpenAI Vision API (modular for alternatives)
- **Data Format**: JSON documents stored alongside media files

### Architectural Principles
- **Serverless-First**: Leverage Vercel function capabilities
- **Modular Design**: Easy integration of alternative AI providers
- **Scalable Storage**: S3 handles large file volumes efficiently
- **CDN Optimization**: Global asset delivery via Cloudflare

### Constraints & Exclusions
- **No Keystatic CMS**: Multimedia labeling bypasses existing CMS
- **JSON Storage**: Maintain existing data patterns
- **API Rate Limits**: Respect OpenAI Vision API limitations
- **File Size Limits**: Define maximum upload sizes

---

## 10. Security & Performance Considerations

### Security Measures
- **Presigned URL Validation**: Time-limited, single-use upload URLs
- **File Type Validation**: Strict MIME type and extension checking
- **Size Limitations**: Maximum file size enforcement
- **Access Control**: Project-based permission system

### Performance Optimization
- **Concurrent Processing**: Parallel AI labeling operations
- **CDN Utilization**: Global asset delivery optimization
- **Caching Strategy**: Metadata and thumbnail caching
- **Progressive Loading**: Efficient large dataset handling

### Monitoring & Analytics
- **Processing Metrics**: Job completion times and success rates
- **Error Tracking**: Comprehensive failure analysis
- **Usage Analytics**: User behavior and system performance
- **Cost Monitoring**: AI API usage and storage costs

---

## 11. Future Extensibility

### Modular API Design
- **Provider Abstraction**: Easy AI service switching
- **Plugin Architecture**: Additional processing modules
- **Webhook Integration**: External system notifications
- **API Versioning**: Backward compatibility maintenance

### Scalability Considerations
- **Database Migration Path**: Future database integration options
- **Microservice Evolution**: Service decomposition possibilities
- **ML Model Integration**: Custom model deployment capabilities
- **Multi-tenant Support**: Organization-level data isolation

---

## Success Metrics

### Technical KPIs
- **Upload Success Rate**: >99% successful uploads
- **Processing Time**: <2 minutes average for AI labeling
- **System Uptime**: 99.9% availability target
- **Error Recovery**: <5% manual intervention required

### User Experience KPIs
- **Time to First Label**: <30 seconds from upload completion
- **Labeling Accuracy**: >85% AI label acceptance rate
- **User Efficiency**: 50% reduction in manual labeling time
- **Feature Adoption**: >80% user engagement with new features

This specification provides comprehensive guidance for implementing a robust, scalable multimedia labeling platform that builds upon existing infrastructure while introducing powerful new capabilities for content creators and media professionals.
