"use client";
import React, { useEffect, useState } from 'react';

export default function CanvasToolbar({
  isEditingName,
  setIsEditingName,
  canvasName,
  setCanvasName,
  autoSaveCanvas,
  canvasProjectId,
  setCanvasProjectId,
  projectsList,
  saveCanvas,
  setShowCanvasManager,
  clearCanvas,
  loraTraining,
  trainCanvasLora,
  canvasLoras,
}: {
  isEditingName: boolean;
  setIsEditingName: (v: boolean) => void;
  canvasName: string;
  setCanvasName: (v: string) => void;
  autoSaveCanvas: () => Promise<void> | void;
  canvasProjectId: string;
  setCanvasProjectId: (v: string) => void;
  projectsList: Array<{ project_id: string; name: string }>;
  saveCanvas: () => Promise<void> | void;
  setShowCanvasManager: (v: boolean) => void;
  clearCanvas: () => void;
  loraTraining: null | { status: string; requestId?: string };
  trainCanvasLora: () => Promise<void>;
  canvasLoras: any[];
}) {
  return (
    <>
      <div className="mb-2 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
        <div className="min-w-0">
          {!isEditingName ? (
            <div
              className="cursor-text truncate text-neutral-100 text-base"
              title={canvasName || 'Untitled Canvas'}
              onDoubleClick={() => setIsEditingName(true)}
            >
              {canvasName || 'Untitled Canvas'}
            </div>
          ) : (
            <input
              value={canvasName}
              onChange={(e) => setCanvasName(e.target.value)}
              onBlur={() => { setIsEditingName(false); setTimeout(() => { void autoSaveCanvas(); }, 150); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditingName(false); void autoSaveCanvas(); } if (e.key === 'Escape') { setIsEditingName(false); } }}
              autoFocus
              className="w-full px-2 py-1.5 rounded-md border border-neutral-700 bg-neutral-900 text-neutral-100"
              placeholder="Canvas name"
            />
          )}
        </div>

        <label htmlFor="canvas-project-select" className="sr-only">Project</label>
        <select
          id="canvas-project-select"
          value={canvasProjectId}
          onChange={(e) => { setCanvasProjectId(e.target.value); void autoSaveCanvas(); }}
          className="px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100"
        >
          <option value="">No project</option>
          {projectsList.map((p) => (
            <option key={p.project_id} value={p.project_id}>{p.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void trainCanvasLora()}
            disabled={!canvasLoras || !Array.isArray(canvasLoras) || !!(loraTraining && loraTraining.status !== 'failed' && loraTraining.status !== 'COMPLETED')}
            className="px-2.5 py-1 text-sm rounded-md border border-neutral-800 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            title={!canvasLoras || canvasLoras.length === 0 ? 'Pin at least 3 images to train a LoRA' : 'Train a LoRA from pinned images'}
          >
            {loraTraining ? `LoRA: ${loraTraining.status}` : 'Train LoRA'}
          </button>
          {Array.isArray(canvasLoras) && canvasLoras.length > 0 && (
            <div className="text-xs text-neutral-400 truncate" title={canvasLoras.map((l: any) => `${l.status}${l.artifactUrl ? ' ✓' : ''}`).join(', ')}>
              {canvasLoras.length} LoRA(s)
            </div>
          )}
        </div>

        <button onClick={() => void saveCanvas()} className="px-2.5 py-1 text-sm rounded-md border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 text-neutral-100">Save</button>
        <button onClick={() => setShowCanvasManager(true)} className="px-2.5 py-1 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100">Load</button>
        <button onClick={clearCanvas} className="px-2.5 py-1 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100">Clear</button>
      </div>

      {/* Freeform toggle removed - only RGL canvas now */}
    </>
  );
}


