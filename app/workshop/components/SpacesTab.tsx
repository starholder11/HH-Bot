"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SpacesTab() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<Array<{ id: string; title: string; updated_at?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadSpaces(); }, []);

  async function loadSpaces() {
    try {
      setLoading(true);
      const res = await fetch('/api/spaces', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      // The API returns { assets: [...], totalCount: number }
      setSpaces(data?.assets || []);
    } catch (e) {
      console.error('Spaces load failed:', e);
      setError('Failed to load spaces');
    } finally {
      setLoading(false);
    }
  }

  async function handleNewSpace() {
    try {
      const body = {
        title: `New Space ${new Date().toLocaleString()}`,
        space_type: 'custom'
      };
      const res = await fetch('/api/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`${res.status}: ${errorText}`);
      }
      const created = await res.json();
      router.push(`/spaces/${created.id}/edit`);
    } catch (e) {
      console.error('Create space failed:', e);
      setError(`Failed to create space: ${e.message}`);
    }
  }

  function openSpace(spaceId: string) {
    router.push(`/spaces/${spaceId}/edit`);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-neutral-400">Spaces</div>
        <div className="flex gap-2">
          <button onClick={() => void loadSpaces()} className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100">Refresh</button>
          <button onClick={() => void handleNewSpace()} className="px-3 py-1.5 text-sm rounded-md border border-blue-700 bg-blue-600 hover:bg-blue-700 text-white">New Space</button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded border border-red-700 bg-red-900/20 text-red-300 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-neutral-800 bg-neutral-950 divide-y divide-neutral-900 overflow-hidden">
        {loading ? (
          <div className="p-4 text-neutral-400">Loading...</div>
        ) : spaces.length === 0 ? (
          <div className="p-6 text-neutral-400">No spaces yet. Click "New Space" to create one.</div>
        ) : (
          spaces.map((s) => (
            <button
              key={s.id}
              onClick={() => openSpace(s.id)}
              className="w-full text-left px-4 py-3 hover:bg-neutral-900 focus:bg-neutral-900"
            >
              <div className="font-medium text-neutral-100">{s.title || s.id}</div>
              <div className="text-xs text-neutral-400">{s.updated_at ? `Updated ${new Date(s.updated_at).toLocaleString()}` : 'No updates yet'}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
