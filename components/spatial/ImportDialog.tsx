"use client";
import { useState } from "react";

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (opts: { layoutId: string; grouping: 'flat' | 'clustered' | 'elevated' }) => Promise<void> | void;
};

export default function ImportDialog({ open, onClose, onImport }: ImportDialogProps) {
  const [layoutId, setLayoutId] = useState('demo-layout');
  const [grouping, setGrouping] = useState<'flat' | 'clustered' | 'elevated'>('flat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      await onImport({ layoutId, grouping });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-5 text-white">
        <h2 className="mb-3 text-lg font-semibold">Import Layout into Space</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-neutral-300">Layout ID</label>
            <input
              className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
              value={layoutId}
              onChange={(e) => setLayoutId(e.target.value)}
              placeholder="layout-id"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-neutral-300">Grouping</label>
            <select
              className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
              value={grouping}
              onChange={(e) => setGrouping(e.target.value as any)}
            >
              <option value="flat">Flat</option>
              <option value="clustered">Clustered</option>
              <option value="elevated">Elevated</option>
            </select>
          </div>
        </div>

        {error && <div className="mt-3 rounded border border-red-700 bg-red-900/40 p-2 text-xs text-red-200">{error}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-700 disabled:bg-blue-800" onClick={handleImport} disabled={busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}


