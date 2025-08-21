import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addObjectToSpace } from '@/lib/spatial/direct-insertion';

const AddObjectToSpaceRequestZ = z.object({
  objectId: z.string(),
  objectType: z.union([z.literal('object'), z.literal('object_collection')]),
  position: z.object({
    x: z.number(),
    y: z.number().optional(),
    z: z.number().optional(),
  }),
  config: z.object({
    defaultScale: z.tuple([z.number(), z.number(), z.number()]).optional(),
    defaultRotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
    snapToFloor: z.boolean().optional(),
  }).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const spaceId = params.id;
    const body = await request.json();
    const { objectId, objectType, position, config } = AddObjectToSpaceRequestZ.parse(body);

    const result = await addObjectToSpace(
      spaceId,
      objectId,
      objectType,
      position,
      config
    );

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error) {
    console.error('Error adding object to space:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to add object to space',
        success: false,
      },
      { status: 500 }
    );
  }
}
