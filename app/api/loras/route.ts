import { NextRequest, NextResponse } from 'next/server';
import { readJsonFromS3 } from '@/lib/s3-upload';

export async function GET(request: NextRequest) {
  try {
    // Read the canvas index to get all canvases
    const indexData = await readJsonFromS3('canvases/index.json');
    if (!indexData || !indexData.items) {
      return NextResponse.json([]);
    }

    const allLoras: Array<{
      canvasId: string;
      canvasName: string;
      loraId: string;
      path: string;
      triggerWord: string;
      scale: number;
      artifactUrl: string;
      status: string;
    }> = [];

    // Check each canvas for completed LoRAs
    for (const canvasEntry of indexData.items) {
      try {
        const canvasData = await readJsonFromS3(canvasEntry.key);
        if (canvasData?.loras) {
          for (const lora of canvasData.loras) {
            if (lora.status === 'completed' && lora.artifactUrl) {
              allLoras.push({
                canvasId: canvasData.id,
                canvasName: canvasData.name || canvasData.id,
                loraId: lora.id,
                path: lora.path,
                triggerWord: lora.triggerWord,
                scale: 1.0,
                artifactUrl: lora.artifactUrl,
                status: lora.status
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to read canvas ${canvasEntry.key}:`, error);
        continue;
      }
    }

    return NextResponse.json(allLoras);
  } catch (error) {
    console.error('[loras] Error fetching all LoRAs:', error);
    return NextResponse.json({ error: 'Failed to fetch LoRAs' }, { status: 500 });
  }
}
