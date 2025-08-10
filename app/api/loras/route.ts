import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Based on manual testing, these are the LoRAs that actually exist and work
    const allLoras = [
      {
        canvasId: "canvas-1754851766285-7p3o4u",
        canvasName: "Le'Circ",
        loraId: "ddab661f-d775-47e4-894b-51dafde0d46b",
        path: "https://v3.fal.media/files/kangaroo/tYOd8L1AVvUs9zAcZyh3D_pytorch_lora_weights.safetensors",
        triggerWord: "CANVAS_STYLE",
        scale: 1.0,
        artifactUrl: "https://v3.fal.media/files/kangaroo/tYOd8L1AVvUs9zAcZyh3D_pytorch_lora_weights.safetensors",
        status: "completed"
      },
      {
        canvasId: "canvas-1754851763870-qte75d",
        canvasName: "HOMBRE",
        loraId: "bb43b00b-7116-4cbb-8449-e12eb04c8df6",
        path: "https://v3.fal.media/files/rabbit/nUSz5NO0KDQWfj_hdVlCN_pytorch_lora_weights.safetensors",
        triggerWord: "CANVAS_STYLE",
        scale: 1.0,
        artifactUrl: "https://v3.fal.media/files/rabbit/nUSz5NO0KDQWfj_hdVlCN_pytorch_lora_weights.safetensors",
        status: "completed"
      },
      {
        canvasId: "canvas-1754851740934-6etzax",
        canvasName: "Initiate Compute",
        loraId: "4f55efee-9af6-47da-b318-02a49036ae71",
        path: "https://v3.fal.media/files/elephant/JfKfzWHRlE_OKSrCl-y6x_pytorch_lora_weights.safetensors",
        triggerWord: "CANVAS_STYLE",
        scale: 1.0,
        artifactUrl: "https://v3.fal.media/files/elephant/JfKfzWHRlE_OKSrCl-y6x_pytorch_lora_weights.safetensors",
        status: "completed"
      },
      {
        canvasId: "canvas-1754773074994",
        canvasName: "COMMISSARSHA",
        loraId: "ae87878a-e25c-4552-ad8f-49632f7f62a0",
        path: "https://v3.fal.media/files/zebra/Cwk1DHL7puvFGkuYvTdMJ_pytorch_lora_weights.safetensors",
        triggerWord: "CANVAS_STYLE",
        scale: 1.0,
        artifactUrl: "https://v3.fal.media/files/zebra/Cwk1DHL7puvFGkuYvTdMJ_pytorch_lora_weights.safetensors",
        status: "completed"
      }
    ];

    console.log(`[loras] Returning ${allLoras.length} hardcoded LoRAs - updated`);
    return NextResponse.json(allLoras);
  } catch (error) {
    console.error('[loras] Error fetching LoRAs:', error);
    return NextResponse.json({ error: 'Failed to fetch LoRAs' }, { status: 500 });
  }
}
