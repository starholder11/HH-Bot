import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { exportLayoutToSpace, reExportLayoutToSpace, previewLayoutExport } from '@/lib/spatial/export-workflows';

const ExportRequestZ = z.object({
  layoutId: z.string(),
  spaceId: z.string().optional(),
  config: z.object({
    floorSize: z.number().positive().optional(),
    itemHeight: z.number().positive().optional(),
    groupingStrategy: z.union([
      z.literal('flat'),
      z.literal('clustered'), 
      z.literal('elevated'),
      z.literal('timeline'),
      z.literal('grid')
    ]).optional(),
    preserveAspectRatio: z.boolean().optional(),
    autoAnalyzeGrouping: z.boolean().optional(),
    createBackup: z.boolean().optional(),
    preserveManualEdits: z.boolean().optional(),
    conflictResolution: z.union([
      z.literal('preserve_manual'),
      z.literal('use_layout'),
      z.literal('prompt_user')
    ]).optional(),
  }).optional(),
  preview: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { layoutId, spaceId, config, preview } = ExportRequestZ.parse(body);

    // Preview mode - don't actually create/update space
    if (preview) {
      const previewResult = await previewLayoutExport(layoutId, spaceId, config);
      
      return NextResponse.json({
        success: true,
        preview: previewResult,
        action: spaceId ? 're-export' : 'initial-export',
      });
    }

    // Actual export
    const exportResult = spaceId 
      ? await reExportLayoutToSpace(layoutId, spaceId, config)
      : await exportLayoutToSpace(layoutId, undefined, config);

    return NextResponse.json({
      success: true,
      result: {
        spaceId: exportResult.spaceAsset.id,
        version: exportResult.version.version,
        summary: exportResult.summary,
        conflicts: exportResult.conflicts,
        backup: exportResult.backup ? {
          id: exportResult.backup.id,
          created: exportResult.backup.createdAt,
        } : undefined,
      },
      spaceAsset: exportResult.spaceAsset,
    });

  } catch (error) {
    console.error('Error exporting layout to space:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Export failed',
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const layoutId = searchParams.get('layoutId');
    const spaceId = searchParams.get('spaceId');

    if (!layoutId) {
      return NextResponse.json(
        { error: 'layoutId parameter required' },
        { status: 400 }
      );
    }

    // Return preview of export
    const preview = await previewLayoutExport(layoutId, spaceId || undefined);
    
    return NextResponse.json({
      success: true,
      preview,
      action: spaceId ? 're-export' : 'initial-export',
    });

  } catch (error) {
    console.error('Error previewing layout export:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Preview failed',
        success: false,
      },
      { status: 500 }
    );
  }
}
