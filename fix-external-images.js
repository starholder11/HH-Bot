const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all MDX files in the timeline directory
const mdxFiles = glob.sync('content/timeline/*/content.mdx');

console.log(`Found ${mdxFiles.length} MDX files to process`);

mdxFiles.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Replace external image references with HTML img tags
  const updatedContent = content.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
    '<img src="$2" alt="$1" />'
  );
  
  if (content !== updatedContent) {
    fs.writeFileSync(filePath, updatedContent);
    console.log(`Updated: ${filePath}`);
  }
});

console.log('External image conversion complete'); 