"use client";
import { useState } from 'react';

export default function TestExportWorkflowPage() {
  const [exportResult, setExportResult] = useState<any>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreviewExport = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Preview export with mock layout data
      const mockLayoutData = {
        layoutId: 'demo-layout-001',
        config: {
          floorSize: 25,
          groupingStrategy: 'clustered',
          preserveAspectRatio: true,
          autoAnalyzeGrouping: true,
        },
        preview: true,
      };

      const response = await fetch('/api/spaces/export-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockLayoutData),
      });

      const result = await response.json();
      setPreviewResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleActualExport = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Actual export (would normally fail without real layout)
      const mockExportData = {
        layoutId: 'demo-layout-001',
        config: {
          floorSize: 25,
          groupingStrategy: 'clustered',
          createBackup: true,
          preserveManualEdits: true,
          conflictResolution: 'preserve_manual',
        },
        preview: false,
      };

      const response = await fetch('/api/spaces/export-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockExportData),
      });

      const result = await response.json();
      setExportResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-4">Layout-to-Space Export Workflow Test</h1>
      <p className="mb-6 text-neutral-300">
        Testing the complete layout-to-space export system with versioning and conflict resolution:
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Export Controls</h3>
          
          <div className="space-y-4">
            <button
              onClick={handlePreviewExport}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-600 text-white px-4 py-2 rounded"
            >
              {loading ? 'Loading...' : 'Preview Export'}
            </button>
            
            <button
              onClick={handleActualExport}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-neutral-600 text-white px-4 py-2 rounded"
            >
              {loading ? 'Loading...' : 'Actual Export (will fail - demo)'}
            </button>
          </div>

          {error && (
            <div className="mt-4 bg-red-600/20 border border-red-600 rounded p-3">
              <div className="text-red-400 text-sm">Error: {error}</div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Export Results</h3>
          
          {previewResult && (
            <div className="mb-4 bg-blue-600/20 border border-blue-600 rounded p-3">
              <div className="text-blue-400 font-medium mb-2">Preview Result</div>
              <pre className="text-xs text-neutral-300 overflow-auto">
                {JSON.stringify(previewResult, null, 2)}
              </pre>
            </div>
          )}

          {exportResult && (
            <div className="mb-4 bg-green-600/20 border border-green-600 rounded p-3">
              <div className="text-green-400 font-medium mb-2">Export Result</div>
              <pre className="text-xs text-neutral-300 overflow-auto">
                {JSON.stringify(exportResult, null, 2)}
              </pre>
            </div>
          )}

          {!previewResult && !exportResult && (
            <div className="text-neutral-400 text-sm">
              Click "Preview Export" to see the export workflow in action.
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 bg-neutral-800 border border-neutral-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Export Workflow Features</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-neutral-200 mb-2">Initial Export</h4>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>✅ Layout → Space coordinate transformation</li>
              <li>✅ Automatic grouping strategy analysis</li>
              <li>✅ Source mapping generation</li>
              <li>✅ Version 1 creation</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-neutral-200 mb-2">Re-Export</h4>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>✅ Automatic backup creation</li>
              <li>✅ Manual edit preservation</li>
              <li>✅ Conflict detection & resolution</li>
              <li>✅ Version increment</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-neutral-200 mb-2">Versioning</h4>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>✅ Source mapping tracking</li>
              <li>✅ Change type classification</li>
              <li>✅ Rollback capability</li>
              <li>✅ Version cleanup</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-neutral-200 mb-2">Conflict Resolution</h4>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>✅ Preserve manual edits</li>
              <li>✅ Update layout-sourced items</li>
              <li>✅ Detect coordinate conflicts</li>
              <li>✅ User choice workflows</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
