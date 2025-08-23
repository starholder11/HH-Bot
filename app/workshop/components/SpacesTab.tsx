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
    } catch (e: any) {
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
    } catch (e: any) {
      console.error('Create space failed:', e);
      setError(`Failed to create space: ${e.message}`);
    }
  }

  function openSpace(spaceId: string) {
    router.push(`/spaces/${spaceId}/edit`);
  }

  async function deleteSpace(spaceId: string) {
    if (!confirm('Delete this space? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${msg}`);
      }
      // Optimistically remove from list
      setSpaces(prev => prev.filter(s => s.id !== spaceId));
    } catch (e: any) {
      console.error('Delete space failed:', e);
      setError(`Failed to delete space: ${e.message}`);
    }
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
            <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900 focus:bg-neutral-900">
              <button
                onClick={() => openSpace(s.id)}
                className="flex-1 text-left min-w-0"
              >
                <div className="font-medium text-neutral-100 truncate">{s.title || s.id}</div>
                <div className="text-xs text-neutral-400">{s.updated_at ? `Updated ${new Date(s.updated_at).toLocaleString()}` : 'No updates yet'}</div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); void deleteSpace(s.id); }}
                className="ml-2 p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-red-900/20"
                title="Delete space"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
