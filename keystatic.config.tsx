import { config, fields, collection } from '@keystatic/core';

export default config({
  storage: { kind: 'local' },
  collections: {
    timeline: collection({
      label: 'Timeline',
      path: 'content/timeline/*',
      slugField: 'slug',
      schema: {
        title: fields.text({ label: 'Title', validation: { isRequired: true } }),
        slug: fields.text({ label: 'Slug', validation: { isRequired: true } }),
        date: fields.date({ label: 'Date', validation: { isRequired: true } }),
        body: fields.markdoc({ label: 'Body' }),
      },
    }),
  },
}); 