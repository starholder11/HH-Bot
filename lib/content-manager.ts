import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface ContentStats {
  totalEntries: number;
  entries: Array<{
    filename: string;
    title: string;
    slug: string;
    date: string;
  }>;
}

export function getContentStats(): ContentStats {
  const timelineDirectory = path.join(process.cwd(), 'content/timeline');
  
  if (!fs.existsSync(timelineDirectory)) {
    return { totalEntries: 0, entries: [] };
  }

  const filenames = fs.readdirSync(timelineDirectory);
  const entries = filenames
    .filter((filename: string) => filename.endsWith('.md'))
    .map((filename: string) => {
      const filePath = path.join(timelineDirectory, filename);
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const { data } = matter(fileContents);
      
      return {
        filename,
        title: data.title || 'Untitled',
        slug: data.slug || filename.replace('.md', ''),
        date: data.date || 'No date',
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    totalEntries: entries.length,
    entries,
  };
}

export function getContentTemplate(): string {
  return `---
title: "Your Timeline Entry Title"
slug: "your-slug-here"
date: "${new Date().toISOString()}"
body: |
  <p>Your timeline entry content goes here.</p>
  <p>You can use HTML tags for formatting.</p>
  <ul>
    <li>Bullet points</li>
    <li>And more content</li>
  </ul>
---

# Your Timeline Entry Title

Your timeline entry content goes here.

You can use markdown formatting as well.
`;
}

 