# Audio Uploader System - Technical Documentation

## Executive Summary

The Audio Uploader System is a production-ready feature that enables users to upload MP3 files directly to the audio labeling platform. The system implements a secure, scalable two-step upload process using AWS S3 presigned URLs, automatic metadata extraction, and seamless integration with the existing audio labeling workflow.

**Key Achievements:**
- ✅ Support for large files up to 100MB (audiobooks/extended tracks)
- ✅ Automatic MP3 metadata extraction and title resolution
- ✅ Duplicate prevention based on title matching
- ✅ Production-ready deployment with CORS configuration
- ✅ Real-time progress tracking and error handling
- ✅ Automatic cover art generation integration

---

## System Architecture

### High-Level Flow
```
[User Selects File] → [Frontend Validation] → [Presigned URL Request]
     ↓
[Direct S3 Upload] → [Upload Completion API] → [Metadata Processing]
     ↓
[JSON Creation] → [UI Refresh] → [Ready for Labeling]
```

### Core Components

#### 1. **Two-Step Upload Process**
- **Step 1:** Generate presigned S3 URL with validation
- **Step 2:** Direct browser-to-S3 upload using presigned URL
- **Step 3:** Server-side completion processing

#### 2. **Metadata Processing Pipeline**
- MP3 file analysis using `music-metadata` library
- Title extraction as authoritative source
- Duration, bitrate, and format detection
- Automatic JSON structure generation

#### 3. **Storage Architecture**
- **Audio Files:** AWS S3 (`hh-bot-images-2025-prod/audio/`)
- **Metadata:** AWS S3 (`hh-bot-images-2025-prod/audio-sources/data/`)
- **CDN:** CloudFlare distribution for optimized delivery

---

## API Design

### Endpoint 1: Get Upload URL
**Route:** `POST /api/audio-labeling/get-upload-url`

**Purpose:** Generate presigned S3 URL and validate upload request

**Request Body:**
```json
{
  "filename": "song.mp3",
  "fileSize": 50000000,
  "title": "Song Title" // Optional, extracted from metadata if not provided
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/presigned-url...",
  "s3Url": "https://hh-bot-images-2025-prod.s3.amazonaws.com/audio/...",
  "cloudflareUrl": "https://drbs5yklwtho3.cloudfront.net/audio/...",
  "key": "audio/timestamp-id-filename.mp3"
}
```

**Validation Rules:**
- File size limit: 100MB maximum
- File type: MP3 only (`.mp3` extension)
- Duplicate prevention: Title-based checking
- Filename sanitization and unique ID generation

### Endpoint 2: Complete Upload
**Route:** `POST /api/audio-labeling/finish-upload`

**Purpose:** Process uploaded file and create song metadata entry

**Request Body:**
```json
{
  "s3Url": "https://s3.amazonaws.com/...",
  "cloudflareUrl": "https://cloudfront.net/...",
  "key": "audio/filename.mp3",
  "originalFilename": "original-name.mp3"
}
```

**Processing Steps:**
1. Download file from S3 for metadata extraction
2. Extract MP3 metadata (title, artist, duration, bitrate)
3. Generate unique song ID
4. Create JSON metadata file
5. Upload JSON to S3
6. Return complete song object

**Response:**
```json
{
  "success": true,
  "song": {
    "id": "uuid",
    "title": "Extracted Title",
    "s3_url": "...",
    "cloudflare_url": "...",
    "metadata": { "duration": 169, "bitrate": 208229 },
    "manual_labels": { "primary_genre": "", "styles": [] },
    "created_at": "2025-07-19T22:19:15.037Z",
    "labeling_complete": false
  }
}
```

---

## Frontend Integration

### Upload Modal Component
Located in: `app/audio-labeling/page.tsx`

**Key Features:**
- Drag & drop file selection
- Real-time progress tracking (0% → 100%)
- Error handling with user-friendly messages
- Automatic UI refresh upon completion

**Upload Flow:**
```javascript
// 1. Get presigned URL
const presignedResponse = await fetch('/api/audio-labeling/get-upload-url', {
  method: 'POST',
  body: JSON.stringify({ filename, fileSize })
});

// 2. Upload directly to S3
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'audio/mpeg' }
});

// 3. Complete upload processing
const completeResponse = await fetch('/api/audio-labeling/finish-upload', {
  method: 'POST',
  body: JSON.stringify({ s3Url, cloudflareUrl, key, originalFilename })
});
```

### Progress Tracking
- **10%:** Presigned URL obtained
- **20%:** Upload initiated
- **80%:** S3 upload complete
- **90%:** Metadata processing
- **100%:** UI refresh and completion

---

## Security Implementation

### CORS Configuration
S3 bucket configured to allow uploads from production domains:

```json
{
  "AllowedOrigins": [
    "http://localhost:3000",
    "https://hh-bot-lyart.vercel.app",
    "https://hh-bot.vercel.app"
  ],
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"]
}
```

### File Validation
- **Client-side:** File type and size validation before upload
- **Server-side:** Double validation in presigned URL generation
- **Filename sanitization:** Remove dangerous characters, add unique IDs
- **Duplicate prevention:** Title-based checking against existing songs

### Access Control
- Presigned URLs expire after 10 minutes
- Server-side AWS credentials never exposed to client
- Direct S3 upload bypasses server infrastructure limits

---

## Error Handling

### Common Error Scenarios

#### 1. File Size Exceeded
```json
{
  "error": "File size exceeds 100MB limit",
  "details": "Consider compressing audio or splitting into segments"
}
```

#### 2. Duplicate Title
```json
{
  "error": "Song with this title already exists",
  "existing_song": { "id": "...", "title": "..." }
}
```

#### 3. Invalid File Type
```json
{
  "error": "Only MP3 files are supported",
  "received": "audio/wav"
}
```

#### 4. S3 Upload Failure
- **CORS errors:** Automatic retry with error logging
- **Network issues:** Progress tracking shows failure point
- **Timeout:** 10-minute presigned URL expiration

### Error Recovery
- Automatic retry for network failures
- Clear error messages for user correction
- Graceful degradation with manual file selection fallback

---

## Performance Considerations

### Upload Optimization
- **Direct S3 Upload:** Bypasses server infrastructure limits
- **Presigned URLs:** Eliminates server bottlenecks
- **CDN Integration:** CloudFlare for optimized global delivery
- **Parallel Processing:** Metadata extraction doesn't block UI

### Scalability
- **Serverless Architecture:** Auto-scaling with Vercel functions
- **S3 Storage:** Unlimited capacity with regional optimization
- **Database-free Design:** JSON files for simple metadata storage

### File Size Support
- **Limit:** 100MB per file (supports audiobooks/extended tracks)
- **Streaming:** Direct browser-to-S3 eliminates server memory usage
- **Progress Tracking:** Real-time feedback for large uploads

---

## Production Deployment

### Environment Configuration
```bash
# Required Environment Variables
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET_NAME=hh-bot-images-2025-prod
CLOUDFLARE_DOMAIN=drbs5yklwtho3.cloudfront.net
```

### Deployment Process
1. **Route Structure:** Flattened API routes for Vercel compatibility
   - `/api/audio-labeling/get-upload-url/`
   - `/api/audio-labeling/finish-upload/`

2. **Dependencies:**
   - `@aws-sdk/client-s3` - S3 operations
   - `@aws-sdk/s3-request-presigner` - Presigned URL generation
   - `music-metadata` - MP3 file analysis

3. **CORS Setup:** S3 bucket permissions configured for production domains

### Testing Strategy
- **Local Development:** Full upload flow testing with development S3
- **Production Testing:** Verified with real MP3 files up to 100MB
- **Error Scenarios:** Tested duplicate prevention, file validation
- **Cross-browser:** Verified upload functionality across browsers

---

## Integration Points

### Audio Labeling System
- **Seamless Integration:** Uploaded files immediately available for labeling
- **Metadata Inheritance:** Extracted MP3 data populates initial song fields
- **UI Refresh:** Automatic song list update upon upload completion
- **Cover Art:** Integration with existing cover art generation system

### Existing APIs
- **Song Management:** Uses existing PATCH endpoints for label updates
- **File Storage:** Consistent with existing S3 storage patterns
- **CDN Distribution:** Leverages existing CloudFlare configuration

---

## Monitoring & Observability

### Error Tracking
- **Client-side:** Browser console logging for debugging
- **Server-side:** Structured error logging with request IDs
- **S3 Operations:** AWS CloudTrail for upload audit trails

### Performance Metrics
- **Upload Success Rate:** Track completion percentage
- **Processing Time:** Monitor metadata extraction duration
- **File Sizes:** Track average upload sizes and success rates

### Health Checks
- **Presigned URL Generation:** API endpoint availability
- **S3 Connectivity:** AWS service health monitoring
- **Metadata Processing:** JSON creation success rates

---

## Future Enhancements

### Short-term Improvements
1. **Batch Upload:** Multiple file selection and processing
2. **Format Support:** Add support for WAV, FLAC, M4A formats
3. **Auto-labeling:** ML-based genre and mood detection
4. **Upload Resume:** Support for interrupted upload recovery

### Long-term Architecture
1. **Microservices:** Dedicated upload service separation
2. **Event-driven Processing:** Queue-based metadata processing
3. **Advanced Analytics:** Upload pattern analysis and optimization
4. **CDN Optimization:** Geographic upload endpoint selection

### User Experience
1. **Drag & Drop Enhancement:** Multiple file zones and preview
2. **Mobile Optimization:** Touch-friendly upload interface
3. **Bulk Operations:** Folder upload and batch metadata editing
4. **Upload History:** Track and manage previous uploads

---

## Technical Debt & Maintenance

### Current Limitations
1. **Single File Processing:** No batch operations currently
2. **Manual Labeling:** All classification requires human input
3. **Error Recovery:** Limited automatic retry mechanisms
4. **File Format Restriction:** MP3 only support

### Maintenance Requirements
1. **AWS Credential Rotation:** Regular security key updates
2. **Dependency Updates:** Keep music-metadata library current
3. **S3 Lifecycle Management:** Archive old uploads if needed
4. **CORS Policy Updates:** Maintain domain whitelist

### Code Quality
- **Test Coverage:** Comprehensive unit and integration tests needed
- **Documentation:** API documentation and inline code comments
- **Type Safety:** Full TypeScript implementation
- **Error Boundaries:** React error boundary implementation

---

## Conclusion

The Audio Uploader System represents a significant enhancement to the platform's capabilities, providing users with a streamlined, secure, and scalable method for adding new audio content. The two-step upload architecture using presigned S3 URLs ensures optimal performance while maintaining security best practices.

**Key Success Metrics:**
- ✅ **Scalability:** Supports 100MB files without server bottlenecks
- ✅ **Security:** No server-side file handling or credential exposure
- ✅ **User Experience:** Real-time progress tracking and error handling
- ✅ **Integration:** Seamless connection with existing labeling workflow
- ✅ **Production Ready:** Deployed and tested in live environment

The system is well-positioned for future enhancements and provides a solid foundation for expanding audio content management capabilities.

---

**Document Version:** 1.0
**Last Updated:** July 19, 2025
**Next Review:** Q3 2025
**Prepared for:** Senior Architecture Review
