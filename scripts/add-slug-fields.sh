#!/bin/bash

echo "🔧 Adding slug fields to timeline entries..."

# Process each timeline directory
for dir in content/timeline/*/; do
    if [ -d "$dir" ]; then
        # Extract the slug from the directory name
        slug=$(basename "$dir")
        yaml_file="$dir/index.yaml"

        if [ -f "$yaml_file" ]; then
            # Check if slug field already exists
            if ! grep -q "^slug:" "$yaml_file"; then
                # Create a temporary file with slug field added at the top
                {
                    echo "slug: $slug"
                    cat "$yaml_file"
                } > "$yaml_file.tmp" && mv "$yaml_file.tmp" "$yaml_file"

                echo "✅ Added slug '$slug' to $yaml_file"
            else
                echo "⏭️  Slug already exists in $yaml_file"
            fi
        else
            echo "⚠️  No index.yaml found in $dir"
        fi
    fi
done

echo "🎉 Finished adding slug fields!"
