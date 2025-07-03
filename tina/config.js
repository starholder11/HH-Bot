import { defineConfig } from "tinacms";

// Your hosting provider likely exposes this as an environment variable
const branch = process.env.HEAD || process.env.VERCEL_GIT_COMMIT_REF || "main";

export default defineConfig({
  branch,
  
  // Open source TinaCMS - no external authentication required
  // Local development setup for admin interface

  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },
  media: {
    tina: {
      mediaRoot: "uploads",
      publicFolder: "public",
    },
  },
  admin: {
    auth: {
      onLogin: async ({ token }) => {
        // For open source, we can implement custom auth here if needed
        return { token };
      },
      onLogout: async () => {
        // Handle logout
      },
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
        name: "timeline",
        label: "Timeline",
        path: "content/timeline",
        format: "md",
        ui: {
          router: ({ document }) => {
            return `/timeline/${document._sys.filename}`;
          },
        },
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
            name: "slug",
            label: "Slug",
            required: true,
            description: "URL-friendly identifier (e.g., 'first-milestone')",
          },
          {
            type: "datetime",
            name: "date",
            label: "Date",
            required: true,
            description: "When this milestone occurred",
          },
          {
            type: "rich-text",
            name: "body",
            label: "Description",
            isBody: true,
            required: true,
            description: "Rich text description of this timeline entry",
          },
        ],
      },
    ],
  },
}); 