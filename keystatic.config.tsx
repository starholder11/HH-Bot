import { config, collection, fields } from '@keystatic/core';

export default config({
  storage: {
    kind: 'github',
    repo: {
      owner: 'starholder11',
      name: 'HH-Bot',
    },
    // @ts-ignore -- branch is accepted by Keystatic storage config but not typed in older version
    branch: 'keystatic-reset',
  },
  
  // Enable full file replacement commits to avoid stale delete paths
  // IMPORTANT: Do NOT remove or alter the following block unless the repository owner explicitly requests it.
  // @ts-ignore – experimental option not in typings yet
  experimental: { forceFullCommit: true },
  
  collections: {
    posts: collection({
      label: 'Posts',
      path: 'content/posts/*',
      slugField: 'title',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        content: fields.mdx({ label: 'Content' }),
      },
    }),
    
    timeline: collection({
      label: 'Timeline',
      path: 'content/timeline/*/',
      slugField: 'title',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        date: fields.date({ label: 'Date' }),
        content: fields.mdx({ label: 'Content' }),
        categories: fields.array(fields.text({ label: 'Category' }), { label: 'Categories' }),
        gallery: fields.array(fields.text({ label: 'Gallery Item' }), { label: 'Gallery' }),
        attachments: fields.array(fields.text({ label: 'Attachment' }), { label: 'Attachments' }),
      },
    }),
  },
}); 