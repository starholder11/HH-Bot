import { defineConfig } from 'tinacms'

export default defineConfig({
  branch: process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main',
  contentApiUrlOverride: '/api/tina/gql',
  // Force local mode - no cloud authentication
  clientId: process.env.TINA_PUBLIC_IS_LOCAL === 'true' ? null : '',
  token: process.env.TINA_PUBLIC_IS_LOCAL === 'true' ? null : '',
  useLocalAuth: true,
  // Disable cloud features completely
  cloud: {
    enabled: false,
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
  // See docs on content modeling for more info on how to setup new content models: https://tina.io/docs/schema/
  schema: {
    collections: [
      {
        name: "post",
        label: "Posts",
        path: "content/posts",
        format: "mdx",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "string",
            name: "description",
            label: "Description",
            required: true,
          },
          {
            type: "datetime",
            name: "date",
            label: "Date",
            required: true,
          },
          {
            type: "rich-text",
            name: "body",
            label: "Body",
            isBody: true,
          },
        ],
      },
      {
        name: 'timeline',
        label: 'Timeline',
        path: 'content/timeline',
        format: 'mdx',
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
            name: 'description',
            label: 'Description',
            required: true,
          },
          {
            type: 'datetime',
            name: 'date',
            label: 'Date',
            required: true,
          },
          {
            type: 'string',
            name: 'category',
            label: 'Category',
            required: true,
          },
          {
            type: 'string',
            name: 'status',
            label: 'Status',
            options: ['completed', 'in-progress', 'planned'],
            required: true,
          },
          {
            type: 'rich-text',
            name: 'body',
            label: 'Body',
            isBody: true,
          },
        ],
      },
    ],
  },
}) 