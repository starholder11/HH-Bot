import { defineConfig } from 'tinacms'

export default defineConfig({
  branch: process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main',
  contentApiUrlOverride: '/api/tina/gql',

  // Use TinaCMS's built-in authentication
  authProvider: {
    type: 'credentials',
    users: [
      {
        name: 'spaceman',
        email: 'cfurlong@gmail.com',
        password: 'admin123',
      },
    ],
  },

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
      // TinaCMS user collection for authentication
      {
        name: 'users',
        label: 'Users',
        path: 'content/users',
        format: 'json',
        fields: [
          {
            type: 'string',
            name: 'name',
            label: 'Name',
            required: true,
          },
          {
            type: 'string',
            name: 'email',
            label: 'Email',
            required: true,
          },
          {
            type: 'password',
            name: 'password',
            label: 'Password',
            required: true,
          },
        ],
      },
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