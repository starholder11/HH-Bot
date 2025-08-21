"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import SpaceViewer from "@/components/spatial/SpaceViewer";
import SpaceControls from "@/components/spatial/SpaceControls";
import ImportDialog from "@/components/spatial/ImportDialog";
import ExportDialog from "@/components/spatial/ExportDialog";

export default function SpacePage() {
  const params = useParams();
  const spaceId = (params?.id as string) || "demo";
  const [mode, setMode] = useState<"orbit" | "first-person" | "fly">("orbit");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Space: {spaceId}</h1>
        <div className="flex gap-2">
          <button
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700"
            onClick={async () => {
              setImporting(true);
              setMessage(null);
              try {
                const resp = await fetch('/api/spaces/export-layout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ layoutId: 'demo-layout', targetSpaceId: spaceId, grouping: 'flat' })
                });
                const json = await resp.json();
                setMessage(json.success ? 'Imported demo-layout into space' : (json.error || 'Import failed'));
              } catch (e: any) {
                setMessage(e?.message || 'Import failed');
              } finally {
                setImporting(false);
              }
            }}
          >
            {importing ? 'Importing…' : 'Import Demo Layout'}
          </button>
          <button className="px-3 py-1.5 text-sm rounded bg-neutral-700 hover:bg-neutral-600" onClick={() => setShowImport(true)}>Import…</button>
          <button className="px-3 py-1.5 text-sm rounded bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowExport(true)}>Export…</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <SpaceViewer spaceId={spaceId} cameraMode={mode} />
        </div>
        <div className="lg:col-span-1">
          <SpaceControls mode={mode} onChangeMode={setMode} />
          {message && (
            <div className="mt-3 text-xs text-neutral-300 bg-neutral-800 border border-neutral-700 rounded p-2">{message}</div>
          )}
        </div>
      </div>

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={async ({ layoutId, grouping }) => {
          const resp = await fetch('/api/spaces/export-layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layoutId, targetSpaceId: spaceId, grouping })
          });
          const json = await resp.json();
          if (!json.success) throw new Error(json.error || 'Import failed');
          setMessage(`Imported ${layoutId} into space`);
        }}
      />

      <ExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        onExport={async ({ overwrite }) => {
          // Placeholder: wire to export-to-layout when implemented
          setMessage(overwrite ? 'Export with overwrite requested (placeholder)' : 'Export requested (placeholder)');
        }}
      />
    </div>
  );
}


