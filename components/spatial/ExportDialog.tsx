"use client";
import { useState } from "react";

type ExportDialogProps = {
  open: boolean;
  onClose: () => void;
  onExport: (opts: { target: 'layout'; overwrite: boolean }) => Promise<void> | void;
};

export default function ExportDialog({ open, onClose, onExport }: ExportDialogProps) {
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      await onExport({ target: 'layout', overwrite });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-5 text-white">
        <h2 className="mb-3 text-lg font-semibold">Export Space</h2>
        <p className="text-sm text-neutral-300 mb-3">Re-export may overwrite layout-mapped items. A versioned backup is created.</p>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Overwrite layout-mapped items (keep manual items)
        </label>

        {error && <div className="mt-3 rounded border border-red-700 bg-red-900/40 p-2 text-xs text-red-200">{error}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm hover:bg-emerald-700 disabled:bg-emerald-800" onClick={handleExport} disabled={busy}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}


