import { config, collection, fields } from '@keystatic/core';

export default config({
  storage: 
    process.env.NODE_ENV === 'production' 
      ? {
          kind: 'github',
          repo: 'starholder11/HH-Bot'
        }
      : { kind: 'local' },
  
  collections: {
    timeline: collection({
      label: 'Timeline',
      path: 'content/timeline/*',
      slugField: 'slug',
      schema: {
        title: fields.text({ 
          label: 'Title',
          validation: { isRequired: true }
        }),
        slug: fields.text({ 
          label: 'Slug',
          validation: { isRequired: true }
        }),
        date: fields.date({ 
          label: 'Date',
          validation: { isRequired: true }
        }),
        body: fields.markdoc({ 
          label: 'Body' 
        }),
        featuredImage: fields.image({
          label: 'Featured Image',
          directory: 'public/images'
        }),
        gallery: fields.array(
          fields.image({
            label: 'Gallery Image',
            directory: 'public/images'
          }),
          {
            label: 'Image Gallery'
          }
        ),
        attachments: fields.array(
          fields.file({
            label: 'Attachment',
            directory: 'public/files'
          }),
          {
            label: 'File Attachments'
          }
        )
      }
    })
  }
}); 