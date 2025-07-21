#!/bin/bash

echo "🔍 Monitoring videos 22365, 22363, 22364 and checking for failures..."
echo "Timestamp: $(date)"

API_URL="https://hh-bot-lyart.vercel.app/api/media-labeling/assets?type=video"

while true; do
    echo "----------------------------------------"
    echo "⏰ $(date '+%H:%M:%S') - Checking status..."

    # Check for target videos
    echo "📹 Looking for videos 22365, 22363, 22364..."
    TARGET_VIDEOS=$(curl -s "$API_URL" | grep -E '"title":"(22365|22363|22364)"' || echo "NOT FOUND")

    if [ "$TARGET_VIDEOS" != "NOT FOUND" ]; then
        echo "✅ FOUND TARGET VIDEOS:"
        echo "$TARGET_VIDEOS"

        # Get detailed status for found videos
        curl -s "$API_URL" | grep -A 10 -B 2 -E '"title":"(22365|22363|22364)"'
    else
        echo "❌ Target videos not found in database"
    fi

    # Check for any failed/error states
    echo ""
    echo "🚨 Checking for any processing failures..."

    FAILED_AI=$(curl -s "$API_URL" | grep -c '"ai_labeling":"failed"' || echo "0")
    ERROR_AI=$(curl -s "$API_URL" | grep -c '"ai_labeling":"error"' || echo "0")
    PENDING_AI=$(curl -s "$API_URL" | grep -c '"ai_labeling":"pending"' || echo "0")
    TRIGGERING_AI=$(curl -s "$API_URL" | grep -c '"ai_labeling":"triggering"' || echo "0")
    PROCESSING_AI=$(curl -s "$API_URL" | grep -c '"ai_labeling":"processing"' || echo "0")

    echo "📊 Current AI labeling status counts:"
    echo "   Failed: $FAILED_AI"
    echo "   Error: $ERROR_AI"
    echo "   Pending: $PENDING_AI"
    echo "   Triggering: $TRIGGERING_AI"
    echo "   Processing: $PROCESSING_AI"

    if [ "$FAILED_AI" -gt 0 ] || [ "$ERROR_AI" -gt 0 ]; then
        echo "🚨 ATTENTION: Found failed/error videos!"
        curl -s "$API_URL" | grep -A 15 -B 2 '"ai_labeling":"failed"\|"ai_labeling":"error"'
    fi

    if [ "$TRIGGERING_AI" -gt 0 ] || [ "$PROCESSING_AI" -gt 0 ]; then
        echo "⚡ Active processing detected!"
        curl -s "$API_URL" | grep -A 5 -B 2 '"ai_labeling":"triggering"\|"ai_labeling":"processing"'
    fi

    echo ""
    echo "💤 Sleeping 30 seconds..."
    sleep 30
done
