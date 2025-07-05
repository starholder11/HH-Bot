// Simple slug function for testing
function toSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Test slug generation
console.log('Testing slug generation:');
console.log('MuffinMan →', toSlug('MuffinMan'));
console.log('Hi →', toSlug('Hi'));
console.log('Milady of the Elephant Stone →', toSlug('Milady of the Elephant Stone'));

// Test content reading
const fs = require('fs');
const path = require('path');

const TIMELINE_DIR = path.join(process.cwd(), 'content', 'timeline');

function folderToSlug(folderName) {
  return toSlug(folderName);
}

function getAllTimelineSlugs() {
  try {
    const entries = fs.readdirSync(TIMELINE_DIR, { withFileTypes: true });
    
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => folderToSlug(entry.name))
      .filter(slug => slug.length > 0);
  } catch (error) {
    console.error('Error reading timeline directory:', error);
    return [];
  }
}

console.log('\nAvailable timeline slugs:');
const slugs = getAllTimelineSlugs();
console.log(slugs); 