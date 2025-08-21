import { z } from 'zod';

export const TransformZ = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number(), z.number()])
});

export const ObjectAssetZ = z.object({
  id: z.string(),
  filename: z.string(),
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  media_type: z.literal('object'),
  object_type: z.union([z.literal('atomic'), z.literal('composite')]),
  object: z.object({
    modelUrl: z.string().url().optional(),
    boundingBox: z.object({
      min: z.tuple([z.number(), z.number(), z.number()]),
      max: z.tuple([z.number(), z.number(), z.number()])
    }),
    components: z
      .array(
        z.object({
          id: z.string(),
          objectId: z.string(),
          transform: TransformZ,
          role: z.string(),
          required: z.boolean()
        })
      )
      .optional(),
    category: z.string(),
    subcategory: z.string().optional(),
    style: z.string().optional(),
    tags: z.array(z.string()),
    materials: z
      .array(
        z.object({
          name: z.string(),
          properties: z.record(z.any())
        })
      )
      .optional(),
    physics: z
      .object({ mass: z.number().optional(), friction: z.number().optional(), restitution: z.number().optional() })
      .optional()
  }),
  s3_url: z.string(),
  cloudflare_url: z.string().optional().or(z.literal('')),
  ai_labels: z.any().default({ scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} }),
  manual_labels: z.any().default({ scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] }),
  processing_status: z.any(),
  timestamps: z.object({
    created: z.string().optional().or(z.string()),
    updated: z.string().optional().or(z.string()),
    spatial_preview_generated: z.string().optional()
  }).partial().default({}),
  created_at: z.string(),
  updated_at: z.string()
});

export const ObjectCollectionZ = z.object({
  id: z.string(),
  filename: z.string(),
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  media_type: z.literal('object_collection'),
  collection_type: z.union([z.literal('furniture_set'), z.literal('room_kit'), z.literal('scene'), z.literal('custom')]),
  collection: z.object({
    name: z.string(),
    description: z.string().optional(),
    objects: z.array(
      z.object({
        id: z.string(),
        objectId: z.string(),
        transform: TransformZ,
        role: z.string(),
        quantity: z.number().int().positive().optional(),
        optional: z.boolean().optional()
      })
    ),
    subCollections: z
      .array(
        z.object({
          id: z.string(),
          collectionId: z.string(),
          transform: TransformZ,
          role: z.string()
        })
      )
      .optional(),
    category: z.string(),
    style: z.string(),
    boundingBox: z.object({
      min: z.tuple([z.number(), z.number(), z.number()]),
      max: z.tuple([z.number(), z.number(), z.number()])
    }).optional(),
    constraints: z
      .array(
        z.object({
          type: z.union([z.literal('proximity'), z.literal('alignment'), z.literal('orientation')]),
          objects: z.array(z.string()),
          parameters: z.record(z.any())
        })
      )
      .optional(),
    version: z.number().int().nonnegative().optional()
  }),
  s3_url: z.string(),
  cloudflare_url: z.string().optional().or(z.literal('')),
  ai_labels: z.any().default({ scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} }),
  manual_labels: z.any().default({ scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] }),
  processing_status: z.any(),
  timestamps: z.object({ created: z.string().optional(), updated: z.string().optional(), preview_generated: z.string().optional() }).partial().default({}),
  created_at: z.string(),
  updated_at: z.string()
});

export const SpaceItemZ = z.object({
  id: z.string(),
  assetId: z.string(),
  assetType: z.union([
    z.literal('image'),
    z.literal('video'),
    z.literal('audio'),
    z.literal('text'),
    z.literal('layout'),
    z.literal('canvas'),
    z.literal('object'),
    z.literal('object_collection')
  ]),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number(), z.number()]),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  clickable: z.boolean().optional(),
  hoverEffect: z.union([z.literal('glow'), z.literal('scale'), z.literal('none')]).optional(),
  objectProperties: z
    .object({
      showComponents: z.boolean().optional(),
      interactionLevel: z.union([z.literal('collection'), z.literal('object'), z.literal('component')]).optional(),
      lodLevel: z.number().int().nonnegative().optional(),
      physics: z.object({ enabled: z.boolean(), kinematic: z.boolean().optional() }).optional()
    })
    .optional(),
  groupId: z.string().optional(),
  importMetadata: z
    .object({
      sourceType: z.union([z.literal('layout'), z.literal('manual')]),
      sourceId: z.string().optional(),
      importVersion: z.number().int().nonnegative().optional(),
      importTimestamp: z.string().optional(),
      originalTransform: TransformZ.optional()
    })
    .optional()
});

export const SpaceAssetZ = z.object({
  id: z.string(),
  filename: z.string(),
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  media_type: z.literal('space'),
  space_type: z.union([z.literal('gallery'), z.literal('timeline'), z.literal('grid'), z.literal('cluster'), z.literal('custom')]),
  space: z.object({
    environment: z.object({
      backgroundColor: z.string().optional(),
      lighting: z.union([z.literal('studio'), z.literal('natural'), z.literal('dramatic')]).optional(),
      fog: z.object({ color: z.string(), density: z.number() }).optional(),
      skybox: z.string().optional()
    }),
    camera: z.object({ position: z.tuple([z.number(), z.number(), z.number()]), target: z.tuple([z.number(), z.number(), z.number()]), fov: z.number().optional(), controls: z.union([z.literal('orbit'), z.literal('first-person'), z.literal('fly')]).optional() }),
    items: z.array(SpaceItemZ),
    relationships: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          type: z.union([z.literal('maintain-distance'), z.literal('align'), z.literal('orbit'), z.literal('follow')]),
          value: z.number().optional(),
          enabled: z.boolean().optional()
        })
      )
      .optional(),
    zones: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          bounds: z.object({ min: z.tuple([z.number(), z.number(), z.number()]), max: z.tuple([z.number(), z.number(), z.number()]) }),
          properties: z.object({ backgroundColor: z.string().optional(), label: z.string().optional() }).optional()
        })
      )
      .optional()
  }),
  s3_url: z.string(),
  cloudflare_url: z.string().optional().or(z.literal('')),
  ai_labels: z.any().default({ scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} }),
  manual_labels: z.any().default({ scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] }),
  processing_status: z.any(),
  timestamps: z.object({ created: z.string().optional(), updated: z.string().optional(), spatial_preview_generated: z.string().optional() }).partial().default({}),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int().nonnegative().optional(),
  sourceMappings: z
    .array(
      z.object({
        sourceType: z.literal('layout'),
        sourceId: z.string(),
        layoutItemId: z.string(),
        spaceItemId: z.string(),
        importVersion: z.number().int().nonnegative()
      })
    )
    .optional()
});

export type ObjectAssetInput = z.infer<typeof ObjectAssetZ>;
export type ObjectCollectionInput = z.infer<typeof ObjectCollectionZ>;
export type SpaceAssetInput = z.infer<typeof SpaceAssetZ>;


