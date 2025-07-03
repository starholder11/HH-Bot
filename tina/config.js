import { defineConfig } from 'tinacms'
import { UsernamePasswordAuthJSProvider } from 'tinacms-authjs/dist/tinacms'

export default defineConfig({
  branch: process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main',
  contentApiUrlOverride: '/api/tina/gql',

  // Use real authentication - NOT clientId/token
  authProvider: new UsernamePasswordAuthJSProvider(),

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