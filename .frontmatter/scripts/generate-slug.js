const arguments = process.argv;
if (arguments && arguments.length > 0) {
  const frontMatterArg = arguments[4];
  const data = frontMatterArg ? JSON.parse(frontMatterArg) : null;
  
  // Generate URL-friendly slug from title
  const slug = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  const output = JSON.stringify({
    "frontmatter": {
      "slug": slug
    }
  });
  
  console.log(output);
} 