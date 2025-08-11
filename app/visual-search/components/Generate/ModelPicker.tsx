"use client";
import React from 'react';

export type FalModel = { id: string; name: string; provider: 'fal'; category: 'image'|'audio'|'video'|'text'; description: string; inputSchema: any; defaults?: Record<string, any> };

export default function ModelPicker({ models, value, onChange, filter, onFilterChange }: {
  models: FalModel[];
  value: string;
  onChange: (id: string) => void;
  filter: string;
  onFilterChange: (q: string) => void;
}) {
  const list = React.useMemo(() => {
    const q = filter.toLowerCase();
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [models, filter]);
  return (
    <div className="space-y-2">
      <input value={filter} onChange={(e) => onFilterChange(e.target.value)} placeholder="Filter models" className="w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100">
        <option value="">Select a model…</option>
        {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}


