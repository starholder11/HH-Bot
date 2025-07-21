# Video Trace Method - Reliable Search & Status

## 🔍 **Reliable Video Search Method**

This method can find ANY video in the system and show detailed processing status, regardless of title format or special characters.

### **Python-Based Search**

```bash
curl -s "https://hh-bot-lyart.vercel.app/api/media-labeling/assets?type=video" | python3 -c "
import json, sys
data = json.load(sys.stdin)
found = False
search_term = 'VIDEO_NAME_HERE'  # Replace with actual video name

for video in data:
    if search_term in video.get('title', ''):
        found = True
        print(f'✅ FOUND: {video[\"title\"]}')
        print(f'  ID: {video[\"id\"]}')
        print(f'  AI Status: {video[\"processing_status\"].get(\"ai_labeling\", \"unknown\")}')
        print(f'  Upload Status: {video[\"processing_status\"].get(\"upload\", \"unknown\")}')
        print(f'  Keyframe Status: {video[\"processing_status\"].get(\"keyframe_extraction\", \"unknown\")}')
        print(f'  Extraction Method: {video.get(\"extraction_method\", \"unknown\")}')
        print(f'  Keyframe Count: {video.get(\"keyframe_count\", 0)}')
        print(f'  Has AI Labels: {video.get(\"ai_labels\") is not None}')
        print(f'  Has Keyframes: {video.get(\"keyframe_stills\") is not None}')
        if video.get('keyframe_stills'):
            pending_count = sum(1 for kf in video['keyframe_stills'] if kf.get('processing_status', {}).get('ai_labeling') == 'pending')
            triggering_count = sum(1 for kf in video['keyframe_stills'] if kf.get('processing_status', {}).get('ai_labeling') == 'triggering')
            completed_count = sum(1 for kf in video['keyframe_stills'] if kf.get('processing_status', {}).get('ai_labeling') == 'completed')
            print(f'  Keyframes - Pending: {pending_count}, Triggering: {triggering_count}, Completed: {completed_count}')
        print('---')
        break

if not found:
    print(f'❌ \"{search_term}\" not found in database')
"
```

### **Example Usage**

#### Search for specific video:
```bash
# Replace 99_Baldeus_Moped_Car with your video name
curl -s "https://hh-bot-lyart.vercel.app/api/media-labeling/assets?type=video" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for video in data:
    if '99_Baldeus_Moped_Car' in video.get('title', ''):
        print(f'Found: {video[\"title\"]} - AI: {video[\"processing_status\"].get(\"ai_labeling\")}')
"
```

#### Find all failed videos:
```bash
curl -s "https://hh-bot-lyart.vercel.app/api/media-labeling/assets?type=video" | python3 -c "
import json, sys
data = json.load(sys.stdin)
failed_videos = []
for video in data:
    if video['processing_status'].get('ai_labeling') == 'failed':
        failed_videos.append(video['title'])
print(f'Failed videos: {failed_videos}')
"
```

#### Find videos with pending keyframes:
```bash
curl -s "https://hh-bot-lyart.vercel.app/api/media-labeling/assets?type=video" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for video in data:
    if video.get('keyframe_stills'):
        pending_count = sum(1 for kf in video['keyframe_stills'] if kf.get('processing_status', {}).get('ai_labeling') == 'pending')
        if pending_count > 0:
            print(f'{video[\"title\"]}: {pending_count} pending keyframes')
"
```

## 📊 **Status Interpretation**

### Video Processing States:
- **`upload`**: `completed` | `pending` | `failed`
- **`ai_labeling`**: `completed` | `pending` | `failed` | `triggering`
- **`keyframe_extraction`**: `completed` | `pending` | `failed`

### Keyframe Processing States:
- **`pending`**: Waiting for AI analysis
- **`triggering`**: Auto-trigger sent, processing started
- **`completed`**: AI analysis finished
- **`failed`**: AI analysis failed

### Common Issues:
1. **All keyframes pending**: Parameter mismatch in auto-trigger
2. **Video has no keyframes**: Keyframe extraction failed
3. **Extraction method unknown**: Processed before Lambda deployment

## 🎯 **Key Insights**

- **Use Python parsing**: More reliable than grep/jq for complex JSON
- **Check extraction_method**: `lambda` = new system, `unknown` = old system
- **Monitor keyframe states**: Most issues are keyframes stuck in `pending`
- **Verify AI labels**: `video.ai_labels != null` means video-level analysis worked
