#!/bin/bash

echo "🧹 Starting sanitization of remote images from timeline content..."

# Count files before
total_files=$(find content/timeline -name "*.mdx" | wc -l)
echo "📊 Found $total_files MDX files to process"

# Remove remote image markdown: ![...](https://...)
echo "🔍 Removing remote image markdown references..."
find content/timeline -name "*.mdx" -exec sed -i '' '/!\[.*\](https:\/\/.*)/d' {} \;

# Remove remote image markdown: ![...](http://...)
find content/timeline -name "*.mdx" -exec sed -i '' '/!\[.*\](http:\/\/.*)/d' {} \;

# Remove HTML img tags with remote sources
echo "🔍 Removing HTML img tags with remote sources..."
find content/timeline -name "*.mdx" -exec sed -i '' '/<img[^>]*src="https:\/\/[^"]*"[^>]*>/d' {} \;
find content/timeline -name "*.mdx" -exec sed -i '' '/<img[^>]*src="http:\/\/[^"]*"[^>]*>/d' {} \;

# Also process import_src if it exists
if [ -d "import_src/content/timeline" ]; then
    echo "🔍 Processing import_src directory..."
    find import_src/content/timeline -name "*.mdoc" -exec sed -i '' '/!\[.*\](https:\/\/.*)/d' {} \;
    find import_src/content/timeline -name "*.mdoc" -exec sed -i '' '/!\[.*\](http:\/\/.*)/d' {} \;
    find import_src/content/timeline -name "*.mdoc" -exec sed -i '' '/<img[^>]*src="https:\/\/[^"]*"[^>]*>/d' {} \;
    find import_src/content/timeline -name "*.mdoc" -exec sed -i '' '/<img[^>]*src="http:\/\/[^"]*"[^>]*>/d' {} \;
fi

# Count remaining remote references
remaining=$(grep -r "https://" content/timeline/ | grep -E "(!\[.*\]\(https://|<img.*src=\"https://)" | wc -l)

echo "✅ Sanitization complete!"
echo "📊 Remaining remote image references: $remaining"

if [ $remaining -eq 0 ]; then
    echo "🎉 All remote image references successfully removed!"
else
    echo "⚠️  Some remote image references may remain - please review manually"
    grep -r "https://" content/timeline/ | grep -E "(!\[.*\]\(https://|<img.*src=\"https://)" | head -5
fi
