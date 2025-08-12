'use client';

import { useState } from 'react';
import { LayoutAsset } from '@/app/visual-search/types';
import LayoutViewer from './LayoutViewer';

interface LayoutEditorProps {
  layout: LayoutAsset;
  onClose: () => void;
  onSave?: (updatedLayout: LayoutAsset) => void;
}

export default function LayoutEditor({ layout, onClose, onSave }: LayoutEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedLayout, setEditedLayout] = useState<LayoutAsset>(layout);
  const [saving, setSaving] = useState(false);

  // Save layout changes
  const handleSave = async () => {
    if (!onSave) return;

    try {
      setSaving(true);
      
      // Update the layout via API
      const response = await fetch(`/api/media-assets/${editedLayout.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedLayout)
      });

      if (!response.ok) {
        throw new Error('Failed to save layout');
      }

      const result = await response.json();
      onSave(result.asset);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save layout:', err);
      alert('Failed to save layout: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // Update layout title
  const updateTitle = (newTitle: string) => {
    setEditedLayout(prev => ({
      ...prev,
      title: newTitle
    }));
  };

  // Update layout description
  const updateDescription = (newDescription: string) => {
    setEditedLayout(prev => ({
      ...prev,
      description: newDescription
    }));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex-1">
            {isEditing ? (
              <input
                type="text"
                value={editedLayout.title}
                onChange={(e) => updateTitle(e.target.value)}
                className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-neutral-100 text-lg font-medium"
                autoFocus
              />
            ) : (
              <h2 className="text-lg font-medium text-neutral-100">{layout.title}</h2>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setEditedLayout(layout);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 text-sm rounded border border-neutral-600 bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-sm rounded border border-green-600 bg-green-700 hover:bg-green-600 text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-sm rounded border border-neutral-600 bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Description (when editing) */}
      {isEditing && (
        <div className="p-4 border-b border-neutral-700">
          <label className="block text-sm text-neutral-400 mb-2">Description</label>
          <textarea
            value={editedLayout.description || ''}
            onChange={(e) => updateDescription(e.target.value)}
            placeholder="Add a description for this layout..."
            className="w-full bg-neutral-800 border border-neutral-600 rounded px-3 py-2 text-neutral-100 resize-none"
            rows={2}
          />
        </div>
      )}

      {/* Layout Viewer */}
      <div className="flex-1 overflow-hidden">
        <LayoutViewer 
          layout={isEditing ? editedLayout : layout} 
          className="h-full"
        />
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-neutral-700 bg-neutral-900/40">
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <div>
            Layout ID: {layout.id}
          </div>
          <div>
            Created: {new Date(layout.created_at).toLocaleString()}
          </div>
        </div>
        {layout.description && !isEditing && (
          <div className="mt-2 text-sm text-neutral-300">
            {layout.description}
          </div>
        )}
      </div>
    </div>
  );
}
