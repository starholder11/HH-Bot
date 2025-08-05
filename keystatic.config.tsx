import { config, collection, fields } from '@keystatic/core';

export default config({
  storage: process.env.NODE_ENV === 'production'
    ? {
        kind: 'github',
        repo: {
          owner: 'starholder11',
          name: 'HH-Bot',
        },
      }
    : {
        kind: 'local',
      },

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
      slugField: 'slug',
      schema: {
        slug: fields.slug({
        name: { label: 'Slug' },
        generate: ({ title }) =>
          (title || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-'),
        validation: {
          isRequired: true,
          message: 'Slug is required (lowercase letters, numbers, dash)'
        }
      }),
        title: fields.text({ label: 'Title' }),
        date: fields.date({ label: 'Date' }),
        content: fields.mdx({ label: 'Content' }),
        categories: fields.array(fields.text({ label: 'Category' }), { label: 'Categories' }),
        gallery: fields.array(fields.text({ label: 'Gallery Item' }), { label: 'Gallery' }),
        attachments: fields.array(fields.text({ label: 'Attachment' }), { label: 'Attachments' }),
      },
    }),
  },
});
