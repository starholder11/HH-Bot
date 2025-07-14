#!/usr/bin/env bash
# Remove lines containing remote-image Markdown or <img> tags with remote src
# Only affects files under content/timeline and import_src/content/timeline

set -euo pipefail

# unified regex for remote-image markdown or html
PAT='(!\[[^]]*\]\([^)]*https?://[^)]*\))|(<img[^>]*src=["'"'"']https?://[^"'"'"']*["'"'"'][^>]*>)'

# Find all markdown/mdx/mdoc files containing remote-image patterns
files=$(grep -R -l -E "$PAT" content/timeline import_src/content/timeline 2>/dev/null | sort -u)

echo "Found $(echo "$files" | wc -w) files with remote-image syntax"

for f in $files; do
  case "$f" in
    *.md|*.mdx|*.mdoc)
      # Remove offending lines containing remote image markdown or HTML
      sed -E -i.bak '/!\[[^]]*\]\([^)]*https?:\/\/[^)]*\)/d' "$f"
      sed -E -i.bak '/<img[^>]*src="https?:\/\/[^"]*"[^>]*>/d' "$f"
      rm "$f.bak"
      echo "sanitized $f";;
    *)
      echo "skipped non-markdown $f";;
  esac
done

echo "Sanitization complete." 