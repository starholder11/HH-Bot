"use client";
import { useEffect, useState } from 'react';

type Asset = { id: string; title: string; media_type: string; filename: string };

export default function ManagePage() {
  const [tab, setTab] = useState<'spaces' | 'objects' | 'collections'>('spaces');
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const url = tab === 'spaces' ? '/api/spaces' : (tab === 'objects' ? '/api/objects' : '/api/object-collections');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        setItems((data.assets || []).map((a: any) => ({ id: a.id, title: a.title || a.filename, media_type: a.media_type, filename: a.filename })));
      } catch (e: any) { setError(e?.message || 'Failed'); } finally { setLoading(false); }
    };
    load();
  }, [tab]);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-6">Asset Management</h1>
      <div className="flex gap-2 mb-4">
        {(['spaces','objects','collections'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md border ${tab===t? 'bg-white' : 'bg-neutral-100'} border-neutral-300`}>{t}</button>
        ))}
      </div>
      {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
      {loading ? <div>Loading…</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(a => (
            <div key={a.id} className="p-3 rounded-lg border border-neutral-200 bg-white">
              <div className="text-xs uppercase text-neutral-500">{a.media_type}</div>
              <div className="font-medium">{a.title}</div>
              <div className="text-xs text-neutral-500">{a.filename}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}