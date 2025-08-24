"use client";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import PublicSpaceViewer from "@/components/spatial/PublicSpaceViewer";

export default function PublicSpaceViewPage() {
  const params = useParams();
  const spaceId = (params?.id as string) || "";
  const [spaceData, setSpaceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId) return;

    const loadSpace = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/spaces/${spaceId}`, { cache: 'no-store' });
        
        if (!response.ok) {
          throw new Error(`Failed to load space: ${response.statusText}`);
        }
        
        const space = await response.json();
        setSpaceData(space);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load space';
        console.error('Error loading space:', err);
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    loadSpace();
  }, [spaceId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl mb-2">Loading Space...</div>
          <div className="text-neutral-400">Preparing 3D environment</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl mb-2 text-red-400">Error Loading Space</div>
          <div className="text-neutral-400">{error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!spaceData) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl mb-2">Space Not Found</div>
          <div className="text-neutral-400">The requested space could not be found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900">
      <PublicSpaceViewer 
        spaceData={spaceData}
        spaceId={spaceId}
      />
    </div>
  );
}
