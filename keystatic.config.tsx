import { config, collection, fields } from '@keystatic/core';

// Determine storage mode based on environment
const getStorageConfig = () => {
  // Always use local storage if any GitHub config is missing
  // This prevents production errors when OAuth isn't set up yet
  if (!process.env.KEYSTATIC_GITHUB_CLIENT_ID || 
      !process.env.KEYSTATIC_GITHUB_CLIENT_SECRET || 
      !process.env.KEYSTATIC_SECRET) {
    console.log('Using local storage - GitHub OAuth not configured');
    return { kind: 'local' as const };
  }
  
  // Only use GitHub storage when all environment variables are present
  if (process.env.NODE_ENV === 'production') {
    console.log('Using GitHub storage - production mode with OAuth configured');
    return {
      kind: 'github' as const,
      repo: { owner: 'starholder11', name: 'HH-Bot' },
      experimental_forceFullCommit: true
    };
  }
  
  // Default to local for development
  return { kind: 'local' as const };
};

export default config({
  storage: getStorageConfig(),
  
  collections: {
    timeline: collection({
      label: 'Timeline',
      path: 'content/timeline/*',
      slugField: 'slug',
      schema: {
        title: fields.text({ label: 'Title' }),
        slug: fields.slug({ name: { label: 'Slug' } }),
        date: fields.date({ label: 'Date' }),
        author: fields.text({ label: 'Author' }),
        location: fields.text({ label: 'Location' }),
        body: fields.mdx({ label: 'Body' }),
      },
    }),
  },
}); 