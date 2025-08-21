"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import SpaceViewer from "@/components/spatial/SpaceViewer";
import SpaceControls from "@/components/spatial/SpaceControls";

export default function SpacePage() {
  const params = useParams();
  const spaceId = (params?.id as string) || "demo";
  const [mode, setMode] = useState<"orbit" | "first-person" | "fly">("orbit");

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Space: {spaceId}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <SpaceViewer spaceId={spaceId} cameraMode={mode} />
        </div>
        <div className="lg:col-span-1">
          <SpaceControls mode={mode} onChangeMode={setMode} />
        </div>
      </div>
    </div>
  );
}


