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
        slug: fields.slug({ name: { label: 'Slug' } }),
        title: fields.text({ label: 'Title' }),
        date: fields.date({ label: 'Date' }),
        template: fields.select({
          label: 'Template',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Year Review', value: 'year-review' },
            { label: 'Character Profile', value: 'character-profile' },
            { label: 'Event Story', value: 'event-story' },
            { label: 'World Building', value: 'world-building' },
          ],
          defaultValue: 'default',
        }),
        period: fields.text({ label: 'Period' }),
        year: fields.integer({ label: 'Year' }),
        content: fields.mdx({ label: 'Content' }),
        categories: fields.array(fields.text({ label: 'Category' }), { label: 'Categories' }),
        gallery: fields.array(fields.text({ label: 'Gallery Item' }), { label: 'Gallery' }),
        attachments: fields.array(fields.text({ label: 'Attachment' }), { label: 'Attachments' }),
      },
    }),
  },
});
