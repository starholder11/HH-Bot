import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMediaAsset, saveMediaAsset } from '@/lib/media-storage';
import { generateLayoutItemIcon } from '@/utils/spatial/icon-generation';

const AddObjectRequestZ = z.object({
  objectId: z.string(),
  objectType: z.union([z.literal('object'), z.literal('object_collection')]),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  iconConfig: z.object({
    style: z.union([z.literal('outline'), z.literal('filled'), z.literal('isometric'), z.literal('top-down')]).optional(),
    showLabel: z.boolean().optional(),
  }).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const layoutId = params.id;
    const body = await request.json();
    const { objectId, objectType, position, iconConfig } = AddObjectRequestZ.parse(body);

    // 1. Load the layout
    const layout = await getMediaAsset(layoutId);
    if (!layout || layout.media_type !== 'layout') {
      return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
    }

    // 2. Load the object/collection data
    const objectResponse = await fetch(`${request.nextUrl.origin}/api/${objectType === 'object' ? 'objects' : 'object-collections'}/${objectId}`);
    if (!objectResponse.ok) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    const objectData = await objectResponse.json();

    // 3. Generate 2D icon for the object
    const icon = generateLayoutItemIcon(objectType, objectData, {
      width: position.w,
      height: position.h,
      style: iconConfig?.style || 'outline',
      showLabel: iconConfig?.showLabel !== false,
    });

    // 4. Calculate normalized coordinates
    const designSize = (layout as any).layout_data?.designSize || { width: 1440, height: 1024 };
    const nx = position.x / designSize.width;
    const ny = position.y / designSize.height;
    const nw = position.w / designSize.width;
    const nh = position.h / designSize.height;

    // 5. Create new layout item
    const newItem = {
      id: `object_${objectId}_${Date.now()}`,
      type: 'content_ref' as const,
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      nx,
      ny,
      nw,
      nh,
      refId: objectId,
      contentType: objectType as any,
      snippet: objectData.filename || `${objectType} asset`,
      objectLayoutProperties: {
        iconUrl: icon.iconUrl,
        previewUrl: icon.previewUrl,
        boundingBox2D: icon.boundingBox2D,
        showLabel: iconConfig?.showLabel !== false,
        category: objectData.object?.category || objectData.collection?.category,
        subcategory: objectData.object?.subcategory || objectData.collection?.style,
      },
    };

    // 6. Add item to layout
    const updatedLayout = {
      ...layout,
      layout_data: {
        ...(layout as any).layout_data,
        items: [...((layout as any).layout_data?.items || []), newItem],
      },
      metadata: {
        ...(layout as any).metadata,
        item_count: ((layout as any).metadata?.item_count || 0) + 1,
      },
      updated_at: new Date().toISOString(),
    };

    // 7. Save updated layout
    await saveMediaAsset(updatedLayout);

    return NextResponse.json({
      success: true,
      item: newItem,
      layout: updatedLayout,
      icon: {
        url: icon.iconUrl,
        metadata: icon.metadata,
      },
    });

  } catch (error) {
    console.error('Error adding object to layout:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
