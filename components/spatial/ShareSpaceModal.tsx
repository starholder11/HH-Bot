"use client";
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface ShareSpaceModalProps {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  spaceTitle?: string;
}

export default function ShareSpaceModal({ open, onClose, spaceId, spaceTitle }: ShareSpaceModalProps) {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const baseUrl = window.location.origin;
      setShareUrl(`${baseUrl}/view/${spaceId}`);
    }
  }, [spaceId]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openInNewTab = () => {
    window.open(shareUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Space</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-neutral-600 mb-2">
              Share this space with others. They'll be able to explore it in 3D without editing capabilities.
            </p>
            {spaceTitle && (
              <p className="text-sm font-medium text-neutral-800 mb-3">
                "{spaceTitle}"
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">
              Public View Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-md bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={copyToClipboard}
                className={`px-3 py-2 text-sm rounded-md transition-colors ${
                  copied 
                    ? 'bg-green-600 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={openInNewTab}
              className="flex-1 px-4 py-2 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md transition-colors"
            >
              Preview
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Done
            </button>
          </div>

          <div className="pt-2 border-t border-neutral-200">
            <h4 className="text-sm font-medium text-neutral-700 mb-2">
              Viewer Features
            </h4>
            <ul className="text-xs text-neutral-600 space-y-1">
              <li>• 3D navigation with orbit, first-person, and fly camera modes</li>
              <li>• Object interaction and selection</li>
              <li>• Full-screen viewing</li>
              <li>• Text content scrolling for text objects</li>
              <li>• Responsive design for desktop and mobile</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
