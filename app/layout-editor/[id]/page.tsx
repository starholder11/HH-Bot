'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LayoutAsset } from '@/app/visual-search/types';
import LayoutEditorStandalone from '@/app/visual-search/components/Layout/LayoutEditorStandalone';

export default function LayoutEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutAsset | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/media-assets/${id}?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load layout (${res.status})`);
        const json = await res.json();
        if (!json?.success || !json?.asset) throw new Error(json?.error || 'Layout not found');
        if (!cancelled) setLayout(json.asset);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-neutral-950 text-neutral-300 flex items-center justify-center">
        Loading layout…
      </div>
    );
  }

  if (error || !layout) {
    return (
      <div className="w-full min-h-screen bg-neutral-950 text-neutral-300 flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-3">
          <div className="text-red-400 text-sm">{error || 'Layout not found'}</div>
          <button onClick={() => router.push('/visual-search')} className="px-3 py-1.5 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm">Back to Visual Search</button>
        </div>
      </div>
    );
  }

  return (
    <LayoutEditorStandalone
      layout={layout}
      onBack={() => router.push('/visual-search')}
      onSaved={(updated) => setLayout(updated)}
    />
  );
}


