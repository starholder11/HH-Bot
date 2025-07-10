import { config, collection, fields } from '@keystatic/core';

// Determine storage mode based on environment
const getStorageConfig = () => {
  // Use local storage for development or when GitHub config is missing
  if (process.env.NODE_ENV !== 'production' || 
      !process.env.KEYSTATIC_GITHUB_CLIENT_ID || 
      !process.env.KEYSTATIC_GITHUB_CLIENT_SECRET || 
      !process.env.KEYSTATIC_SECRET) {
    return { kind: 'local' as const };
  }
  
  // Use GitHub storage for production when properly configured
  return {
    kind: 'github' as const,
    repo: { owner: 'starholder11', name: 'HH-Bot' },
    experimental_forceFullCommit: true
  };
};

export default config({
  storage: getStorageConfig(),
  
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
        categories: fields.array(
          fields.text({ label: 'Category' }),
          { label: 'Categories' }
        ),
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