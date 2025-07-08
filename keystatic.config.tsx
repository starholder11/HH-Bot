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
        ),
        
        // ✅ NEW: Add OpenAI tracking fields
        openaiFileId: fields.text({ 
          label: 'OpenAI File ID (Internal)',
          description: 'Auto-populated by sync process - do not edit manually',
          validation: { isRequired: false }
        }),
        
        openaiFileName: fields.text({
          label: 'OpenAI File Name (Internal)', 
          description: 'Auto-populated by sync process - do not edit manually',
          validation: { isRequired: false }
        }),
        
        lastSyncedAt: fields.text({
          label: 'Last Synced (Internal)',
          description: 'Auto-populated by sync process - do not edit manually', 
          validation: { isRequired: false }
        }),
        
        contentHash: fields.text({
          label: 'Content Hash (Internal)',
          description: 'Auto-populated by sync process - do not edit manually',
          validation: { isRequired: false }
        })
      }
    })
  }
}); 