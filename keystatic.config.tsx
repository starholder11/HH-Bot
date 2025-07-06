import { config, collection, fields } from '@keystatic/core';

export default config({
  storage: { kind: 'local' },
  
  collections: {
    timeline: collection({
      label: 'Timeline',
      path: 'content/timeline/*',
      slugField: 'slug',
      schema: {
        previewLinks: fields.text({
          label: '🔗 Preview & Published Links',
          description: 'Save entry first, then copy URLs below and open in new browser tab to preview without leaving admin.\n\nReplace {slug} with the actual slug value from the Slug field below.',
          defaultValue: 'Preview (saved changes): /api/preview/timeline/{slug}\nPublished (live site): /timeline/{slug}',
          validation: { isRequired: false },
          multiline: true
        }),
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
          directory: 'public/images',
          publicPath: 'https://drbs5yklwtho3.cloudfront.net/images/'
        }),
        gallery: fields.array(
          fields.image({
            label: 'Gallery Image',
            directory: 'public/images',
            publicPath: 'https://drbs5yklwtho3.cloudfront.net/images/'
          }),
          {
            label: 'Image Gallery'
          }
        ),
        attachments: fields.array(
          fields.file({
            label: 'Attachment',
            directory: 'public/files',
            publicPath: 'https://drbs5yklwtho3.cloudfront.net/files/'
          }),
          {
            label: 'File Attachments'
          }
        )
      }
    })
  }
}); 