import { config, collection, fields } from '@keystatic/core';

export default config({
  // Use GitHub storage in production, local in development
  storage: process.env.NODE_ENV === 'production' 
    ? {
        kind: 'github',
        repo: { owner: 'starholder11', name: 'HH-Bot' },
      }
    : { kind: 'local' },
  
  collections: {
    timeline: collection({
      label: 'Timeline',
      path: 'content/timeline/*',
      slugField: 'slug',
      schema: {
        title: fields.text({ label: 'Title' }),
        slug: fields.slug({ name: { label: 'Slug' } }),
        date: fields.date({ label: 'Date' }),
        categories: fields.array(
          fields.text({ label: 'Category' }),
          { label: 'Categories' }
        ),
        gallery: fields.array(
          fields.text({ label: 'Gallery Item' }),
          { label: 'Gallery', itemLabel: props => props.value }
        ),
        attachments: fields.array(
          fields.text({ label: 'Attachment' }),
          { label: 'Attachments', itemLabel: props => props.value }
        ),
      },
    }),
  },
}); 