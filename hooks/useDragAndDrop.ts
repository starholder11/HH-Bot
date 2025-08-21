/**
 * Drag and Drop Hook for Objects in Layouts and Spaces
 * 
 * Handles drag and drop operations from object browser to layout/space editors
 */

import { useState, useCallback, useRef } from 'react';
// Note: Direct insertion functions moved to API routes to avoid server-side imports in client code

export interface DragData {
  objectId: string;
  objectType: 'object' | 'object_collection';
  objectData: any;
  sourceType: 'browser' | 'layout' | 'space';
  sourceId?: string;
}

export interface DropTarget {
  targetId: string;
  targetType: 'layout' | 'space';
  targetData: any;
  boundingRect?: DOMRect;
}

export interface DragState {
  isDragging: boolean;
  dragData: DragData | null;
  dropTarget: DropTarget | null;
  dragPosition: { x: number; y: number } | null;
  previewPosition: { x: number; y: number; z?: number } | null;
  validDrop: boolean;
  conflicts: string[];
}

export interface UseDragAndDropOptions {
  onDragStart?: (data: DragData) => void;
  onDragEnd?: (result: { success: boolean; error?: string }) => void;
  onDrop?: (data: DragData, target: DropTarget, position: { x: number; y: number; z?: number }) => void;
  validateDrop?: (data: DragData, target: DropTarget) => boolean;
}

/**
 * Drag and drop hook for spatial objects
 */
export function useDragAndDrop(options: UseDragAndDropOptions = {}) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragData: null,
    dropTarget: null,
    dragPosition: null,
    previewPosition: null,
    validDrop: false,
    conflicts: [],
  });

  const dragImageRef = useRef<HTMLElement | null>(null);

  /**
   * Start dragging an object
   */
  const startDrag = useCallback((
    event: React.DragEvent,
    objectId: string,
    objectType: 'object' | 'object_collection',
    objectData: any,
    sourceType: 'browser' | 'layout' | 'space' = 'browser',
    sourceId?: string
  ) => {
    const dragData: DragData = {
      objectId,
      objectType,
      objectData,
      sourceType,
      sourceId,
    };

    // Set drag data
    event.dataTransfer.setData('application/json', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'copy';

    // Create custom drag image if needed
    if (dragImageRef.current) {
      event.dataTransfer.setDragImage(dragImageRef.current, 32, 32);
    }

    setDragState(prev => ({
      ...prev,
      isDragging: true,
      dragData,
      dragPosition: { x: event.clientX, y: event.clientY },
    }));

    options.onDragStart?.(dragData);
  }, [options]);

  /**
   * Handle drag over target
   */
  const handleDragOver = useCallback((
    event: React.DragEvent,
    targetId: string,
    targetType: 'layout' | 'space',
    targetData: any
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    if (!dragState.isDragging || !dragState.dragData) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const z = 0; // Default Z for spaces

    const dropTarget: DropTarget = {
      targetId,
      targetType,
      targetData,
      boundingRect: rect,
    };

    // Calculate preview position
    let previewPosition: { x: number; y: number; z?: number };
    
    if (targetType === 'layout') {
      // Convert screen coordinates to layout coordinates
      const designSize = targetData.layout_data?.designSize || targetData.layout?.designSize || { width: 1440, height: 1024 };
      const scaleX = designSize.width / rect.width;
      const scaleY = designSize.height / rect.height;
      
      previewPosition = {
        x: x * scaleX,
        y: y * scaleY,
      };
    } else {
      // Convert screen coordinates to 3D world coordinates
      // This is a simplified conversion - real implementation would use camera projection
      const worldX = (x / rect.width - 0.5) * 20; // Assume 20m floor
      const worldZ = (y / rect.height - 0.5) * 20;
      
      previewPosition = {
        x: worldX,
        y: 0,
        z: worldZ,
      };
    }

    // Simple client-side validation (detailed validation happens on server)
    const existingItems = targetType === 'layout' 
      ? (targetData.layout_data?.items || targetData.layout?.items || [])
      : (targetData.space?.items || []);
    
    const validation = {
      valid: true, // Optimistic validation, server will do real validation
      conflicts: [] as string[],
    };

    setDragState(prev => ({
      ...prev,
      dropTarget,
      previewPosition,
      validDrop: validation.valid,
      conflicts: validation.conflicts,
    }));
  }, [dragState]);

  /**
   * Handle drop
   */
  const handleDrop = useCallback(async (
    event: React.DragEvent,
    targetId: string,
    targetType: 'layout' | 'space',
    targetData: any
  ) => {
    event.preventDefault();

    if (!dragState.isDragging || !dragState.dragData || !dragState.previewPosition) {
      return;
    }

    try {
      // Call appropriate API endpoint
      const endpoint = targetType === 'layout' 
        ? `/api/layouts/${targetId}/add-object`
        : `/api/spaces/${targetId}/add-object`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectId: dragState.dragData.objectId,
          objectType: dragState.dragData.objectType,
          position: dragState.previewPosition,
          config: targetType === 'layout' 
            ? { iconStyle: 'outline', showLabel: true }
            : { snapToFloor: true },
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        options.onDrop?.(dragState.dragData, dragState.dropTarget!, dragState.previewPosition);
        options.onDragEnd?.({ success: true });
      } else {
        throw new Error(result.error || 'API call failed');
      }

    } catch (error) {
      console.error('Drop failed:', error);
      options.onDragEnd?.({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Drop failed' 
      });
    } finally {
      // Reset drag state
      setDragState({
        isDragging: false,
        dragData: null,
        dropTarget: null,
        dragPosition: null,
        previewPosition: null,
        validDrop: false,
        conflicts: [],
      });
    }
  }, [dragState, options]);

  /**
   * Handle drag end (cleanup)
   */
  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      dragData: null,
      dropTarget: null,
      dragPosition: null,
      previewPosition: null,
      validDrop: false,
      conflicts: [],
    });
  }, []);

  /**
   * Make an element draggable
   */
  const makeDraggable = useCallback((
    objectId: string,
    objectType: 'object' | 'object_collection',
    objectData: any,
    sourceType: 'browser' | 'layout' | 'space' = 'browser',
    sourceId?: string
  ) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => 
      startDrag(event, objectId, objectType, objectData, sourceType, sourceId),
    onDragEnd: handleDragEnd,
  }), [startDrag, handleDragEnd]);

  /**
   * Make an element a drop target
   */
  const makeDropTarget = useCallback((
    targetId: string,
    targetType: 'layout' | 'space',
    targetData: any
  ) => ({
    onDragOver: (event: React.DragEvent) => 
      handleDragOver(event, targetId, targetType, targetData),
    onDrop: (event: React.DragEvent) => 
      handleDrop(event, targetId, targetType, targetData),
    onDragLeave: () => {
      // Clear preview when leaving drop target
      setDragState(prev => ({
        ...prev,
        dropTarget: null,
        previewPosition: null,
        validDrop: false,
        conflicts: [],
      }));
    },
  }), [handleDragOver, handleDrop]);

  return {
    dragState,
    makeDraggable,
    makeDropTarget,
    dragImageRef,
  };
}

/**
 * Hook for drag and drop with visual feedback
 */
export function useDragAndDropWithPreview(options: UseDragAndDropOptions = {}) {
  const dragAndDrop = useDragAndDrop(options);
  const [showPreview, setShowPreview] = useState(false);

  const makeDraggableWithPreview = useCallback((
    objectId: string,
    objectType: 'object' | 'object_collection',
    objectData: any,
    sourceType: 'browser' | 'layout' | 'space' = 'browser',
    sourceId?: string
  ) => ({
    ...dragAndDrop.makeDraggable(objectId, objectType, objectData, sourceType, sourceId),
    onDragStart: (event: React.DragEvent) => {
      dragAndDrop.makeDraggable(objectId, objectType, objectData, sourceType, sourceId).onDragStart(event);
      setShowPreview(true);
    },
    onDragEnd: (event: React.DragEvent) => {
      dragAndDrop.makeDraggable(objectId, objectType, objectData, sourceType, sourceId).onDragEnd(event);
      setShowPreview(false);
    },
  }), [dragAndDrop]);

  return {
    ...dragAndDrop,
    makeDraggableWithPreview,
    showPreview,
  };
}
