import { defineConfig } from 'tinacms'

export default defineConfig({
  // Local mode with client ID
  clientId: 'local',
  branch: 'main',
  contentApiUrlOverride: '/api/tina/gql',

  // No authentication for testing - use LocalBackendAuthProvider

  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },
  media: {
    tina: {
      mediaRoot: '',
      publicFolder: 'public',
    },
  },
  schema: {
    collections: [
      // Your existing timeline collection
      {
        name: 'timeline',
        label: 'Timeline',
        path: 'content/timeline',
        format: 'md',
        fields: [
          {
            type: 'string',
            name: 'title',
            label: 'Title',
            isTitle: true,
            required: true,
          },
          {
            type: 'string',
            name: 'slug',
            label: 'Slug',
            required: true,
          },
          {
            type: 'datetime',
            name: 'date',
            label: 'Date',
            required: true,
          },
          {
            type: 'rich-text',
            name: 'body',
            label: 'Content',
            isBody: true,
          },
        ],
      },
    ],
  },
}) 