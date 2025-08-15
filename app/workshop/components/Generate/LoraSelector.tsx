"use client";
import React from 'react';

type Lora = { id: string; path: string; scale: number; selected: boolean; label: string };

export default function LoraSelector({ loras, onChange }: { loras: Lora[]; onChange: (next: Lora[]) => void }) {
  const toggle = (idx: number) => {
    const next = loras.map((l, i) => (i === idx ? { ...l, selected: !l.selected } : l));
    onChange(next);
  };
  const setScale = (idx: number, scale: number) => {
    const next = loras.map((l, i) => (i === idx ? { ...l, scale } : l));
    onChange(next);
  };
  if (!loras || loras.length === 0) return null;
  return (
    <div className="rounded-md border border-neutral-800 p-2">
      <div className="text-xs text-neutral-400 mb-2">LoRA selection</div>
      <div className="space-y-2">
        {loras.map((l, idx) => (
          <label key={l.id || l.path || idx} className="flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={l.selected} onChange={() => toggle(idx)} />
            <span className="flex-1 truncate">{l.label || l.path}</span>
            <input
              type="number"
              step={0.1}
              min={0}
              max={2}
              value={l.scale}
              onChange={(e) => setScale(idx, Number(e.target.value))}
              className="w-20 px-2 py-1 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
            />
          </label>
        ))}
      </div>
    </div>
  );
}


