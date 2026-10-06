'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Maximize2,
  Download,
  RotateCcw,
  Lock,
  Unlock,
  Sliders,
  FileImage,
  X,
  Layers,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Move,
  Sparkles,
  Zap,
  RefreshCw,
  FolderOpen,
  Check,
  AlignLeft,
  AlignCenter,
  Crop,
  Palette,
  Shield,
  HelpCircle,
  Keyboard
} from 'lucide-react';

interface ResizeToolProps {
  backendUrl: string;
}

export type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface CanvasLayer {
  id: string;
  name: string;
  src: string;
  imgElement?: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  opacity: number; // 0-100
  visible: boolean;
  locked: boolean;
}

export interface CanvasDocument {
  id: string;
  title: string;
  width: number;
  height: number;
  backgroundColor: string; // 'transparent', '#ffffff', '#0f172a', etc.
  layers: CanvasLayer[];
  activeLayerId: string | null;
  zoom: number;
  panX: number;
  panY: number;
}

const PRESET_CANVASES = [
  { name: 'Full HD (1920 × 1080)', w: 1920, h: 1080 },
  { name: 'Instagram Square (1080 × 1080)', w: 1080, h: 1080 },
  { name: 'Instagram Story / Reel (1080 × 1920)', w: 1080, h: 1920 },
  { name: 'Twitter / X Banner (1500 × 500)', w: 1500, h: 500 },
  { name: '4K UHD (3840 × 2160)', w: 3840, h: 2160 },
  { name: 'Social Post / Web (1200 × 630)', w: 1200, h: 630 },
  { name: 'A4 Print (2480 × 3508)', w: 2480, h: 3508 },
  { name: 'Standard Photo (1024 × 768)', w: 1024, h: 768 }
];

export const ResizeTool: React.FC<ResizeToolProps> = ({ backendUrl }) => {
  // Multi-Document state
  const [documents, setDocuments] = useState<CanvasDocument[]>([
    {
      id: 'doc-default',
      title: 'Canvas 1',
      width: 1280,
      height: 720,
      backgroundColor: '#ffffff',
      layers: [],
      activeLayerId: null,
      zoom: 0.65,
      panX: 0,
      panY: 0
    }
  ]);
  const [activeDocId, setActiveDocId] = useState<string>('doc-default');

  // Active document helper
  const activeDoc = useMemo(() => {
    return documents.find((d) => d.id === activeDocId) || documents[0];
  }, [documents, activeDocId]);

  // Selected layer helper
  const activeLayer = useMemo(() => {
    if (!activeDoc || !activeDoc.activeLayerId) return null;
    return activeDoc.layers.find((l) => l.id === activeDoc.activeLayerId) || null;
  }, [activeDoc]);

  // Transform & Tool Modes
  const [activeTool, setActiveTool] = useState<'move' | 'transform' | 'pan' | 'crop'>('transform');
  const [isShiftPressed, setIsShiftPressed] = useState<boolean>(false);
  const [forceLockAspect, setForceLockAspect] = useState<boolean>(true);

  // New Canvas Modal (Ctrl+N)
  const [showNewCanvasModal, setShowNewCanvasModal] = useState<boolean>(false);
  const [newDocTitle, setNewDocTitle] = useState<string>('Untitled-1');
  const [newDocWidth, setNewDocWidth] = useState<number>(1920);
  const [newDocHeight, setNewDocHeight] = useState<number>(1080);
  const [newDocBg, setNewDocBg] = useState<string>('transparent');

  // Export & Optimization states
  const [exportFormat, setExportFormat] = useState<'WEBP' | 'PNG' | 'JPG'>('WEBP');
  const [exportQuality, setExportQuality] = useState<number>(85);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizeResult, setOptimizeResult] = useState<{
    originalSize: string;
    optimizedSize: string;
    savedPercent: number;
    downloadUrl: string;
    filename: string;
  } | null>(null);

  // Drag tracking refs
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initW: number;
    initH: number;
    handle: HandleType | 'move';
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // GLOBAL KEYBOARD SHORTCUTS (Ctrl+N, Ctrl+T, Shift, Delete)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N / Cmd+N: New Canvas
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowNewCanvasModal(true);
      }
      // Ctrl+T / Cmd+T: Free Transform Mode
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setActiveTool((prev) => (prev === 'transform' ? 'move' : 'transform'));
      }
      // Shift Key: Aspect Ratio Constraint
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      // Delete / Backspace: Delete active layer
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeLayer) {
        // Prevent deleting if typing in input
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          handleDeleteLayer(activeLayer.id);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeLayer]);

  // Load a sample image layer on first startup if canvas is empty
  useEffect(() => {
    if (activeDoc && activeDoc.layers.length === 0) {
      loadSampleImageLayer();
    }
  }, []);

  const loadSampleImageLayer = () => {
    // Generate a clean sample SVG artwork image
    const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#059669" />
          <stop offset="100%" stop-color="#10b981" />
        </linearGradient>
      </defs>
      <rect width="600" height="400" rx="24" fill="url(#grad)" />
      <circle cx="300" cy="180" r="70" fill="#ffffff" fill-opacity="0.2" />
      <text x="300" y="195" font-family="system-ui, sans-serif" font-size="44" font-weight="900" fill="#ffffff" text-anchor="middle">🍃 LeafLite</text>
      <text x="300" y="240" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#e2e8f0" text-anchor="middle">Photoshop Canvas Studio Layer</text>
      <text x="300" y="340" font-family="monospace" font-size="13" font-weight="700" fill="#a7f3d0" text-anchor="middle">Press Ctrl+T to Transform • Ctrl+N for New Canvas</text>
    </svg>`;

    const blob = new Blob([sampleSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const layer: CanvasLayer = {
      id: `layer-${Date.now()}`,
      name: 'LeafLite Showcase Banner',
      src: url,
      x: Math.round((activeDoc.width - 600) / 2),
      y: Math.round((activeDoc.height - 400) / 2),
      width: 600,
      height: 400,
      originalWidth: 600,
      originalHeight: 400,
      opacity: 100,
      visible: true,
      locked: false
    };

    updateActiveDoc((doc) => ({
      ...doc,
      layers: [layer],
      activeLayerId: layer.id
    }));
  };

  // Helper to update active document
  const updateActiveDoc = (updater: (doc: CanvasDocument) => CanvasDocument) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === activeDocId ? updater(doc) : doc))
    );
  };

  // ---------------------------------------------------------------------------
  // DOCUMENT MANAGEMENT (Tabs, New Canvas, Close Tab)
  // ---------------------------------------------------------------------------
  const handleCreateNewCanvas = () => {
    const newDoc: CanvasDocument = {
      id: `doc-${Date.now()}`,
      title: newDocTitle || `Canvas ${documents.length + 1}`,
      width: Math.max(100, newDocWidth),
      height: Math.max(100, newDocHeight),
      backgroundColor: newDocBg,
      layers: [],
      activeLayerId: null,
      zoom: 0.6,
      panX: 0,
      panY: 0
    };

    setDocuments((prev) => [...prev, newDoc]);
    setActiveDocId(newDoc.id);
    setShowNewCanvasModal(false);
  };

  const handleCloseDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (documents.length <= 1) {
      alert('At least one canvas document must remain open.');
      return;
    }
    const filtered = documents.filter((d) => d.id !== id);
    setDocuments(filtered);
    if (activeDocId === id) {
      setActiveDocId(filtered[0].id);
    }
  };

  // ---------------------------------------------------------------------------
  // LAYER MANAGEMENT (Add Image, Delete, Duplicate, Reorder, Visibility)
  // ---------------------------------------------------------------------------
  const handleAddImageFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const origW = img.naturalWidth || 400;
      const origH = img.naturalHeight || 300;

      // Center image on canvas, scaling down if larger than canvas
      let initW = origW;
      let initH = origH;
      if (initW > activeDoc.width * 0.9 || initH > activeDoc.height * 0.9) {
        const fitScale = Math.min(
          (activeDoc.width * 0.8) / initW,
          (activeDoc.height * 0.8) / initH
        );
        initW = Math.round(initW * fitScale);
        initH = Math.round(initH * fitScale);
      }

      const layer: CanvasLayer = {
        id: `layer-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        src: url,
        imgElement: img,
        x: Math.round((activeDoc.width - initW) / 2),
        y: Math.round((activeDoc.height - initH) / 2),
        width: initW,
        height: initH,
        originalWidth: origW,
        originalHeight: origH,
        opacity: 100,
        visible: true,
        locked: false
      };

      updateActiveDoc((doc) => ({
        ...doc,
        layers: [...doc.layers, layer],
        activeLayerId: layer.id
      }));
    };
    img.src = url;
  };

  const handleDeleteLayer = (layerId: string) => {
    updateActiveDoc((doc) => {
      const nextLayers = doc.layers.filter((l) => l.id !== layerId);
      return {
        ...doc,
        layers: nextLayers,
        activeLayerId: nextLayers.length > 0 ? nextLayers[nextLayers.length - 1].id : null
      };
    });
  };

  const handleDuplicateLayer = (layerId: string) => {
    const layer = activeDoc.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const dup: CanvasLayer = {
      ...layer,
      id: `layer-${Date.now()}`,
      name: `${layer.name} (Copy)`,
      x: layer.x + 20,
      y: layer.y + 20
    };

    updateActiveDoc((doc) => ({
      ...doc,
      layers: [...doc.layers, dup],
      activeLayerId: dup.id
    }));
  };

  const handleToggleVisibility = (layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateActiveDoc((doc) => ({
      ...doc,
      layers: doc.layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    }));
  };

  const handleToggleLock = (layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateActiveDoc((doc) => ({
      ...doc,
      layers: doc.layers.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l))
    }));
  };

  const handleMoveLayerOrder = (layerId: string, direction: 'up' | 'down') => {
    updateActiveDoc((doc) => {
      const idx = doc.layers.findIndex((l) => l.id === layerId);
      if (idx < 0) return doc;
      const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= doc.layers.length) return doc;

      const newLayers = [...doc.layers];
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[targetIdx];
      newLayers[targetIdx] = temp;

      return { ...doc, layers: newLayers };
    });
  };

  // Center active layer
  const handleCenterActiveLayer = () => {
    if (!activeLayer) return;
    updateActiveDoc((doc) => ({
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === activeLayer.id
          ? {
              ...l,
              x: Math.round((doc.width - l.width) / 2),
              y: Math.round((doc.height - l.height) / 2)
            }
          : l
      )
    }));
  };

  // Fit layer to canvas
  const handleFitLayerToCanvas = () => {
    if (!activeLayer) return;
    const aspect = activeLayer.originalWidth / activeLayer.originalHeight;
    let newW = activeDoc.width;
    let newH = Math.round(newW / aspect);
    if (newH > activeDoc.height) {
      newH = activeDoc.height;
      newW = Math.round(newH * aspect);
    }

    updateActiveDoc((doc) => ({
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === activeLayer.id
          ? {
              ...l,
              width: newW,
              height: newH,
              x: Math.round((doc.width - newW) / 2),
              y: Math.round((doc.height - newH) / 2)
            }
          : l
      )
    }));
  };

  // ---------------------------------------------------------------------------
  // INTERACTIVE TRANSFORM & POINTER DRAGGING (Ctrl+T with 8 Handles + Shift Lock)
  // ---------------------------------------------------------------------------
  const handlePointerDown = (
    e: React.PointerEvent,
    handle: HandleType | 'move',
    layer: CanvasLayer
  ) => {
    if (layer.locked) return;
    e.preventDefault();
    e.stopPropagation();

    // Set active layer
    updateActiveDoc((doc) => ({ ...doc, activeLayerId: layer.id }));

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: layer.x,
      initY: layer.y,
      initW: layer.width,
      initH: layer.height,
      handle
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!dragStartRef.current) return;
      const { startX, startY, initX, initY, initW, initH, handle: h } = dragStartRef.current;

      const screenDx = moveEvt.clientX - startX;
      const screenDy = moveEvt.clientY - startY;

      // Scale screen movement by canvas zoom level
      const dx = screenDx / activeDoc.zoom;
      const dy = screenDy / activeDoc.zoom;

      // Shift constraint lock: active if Shift is pressed OR force lock aspect ratio is on
      const isConstrained = moveEvt.shiftKey || isShiftPressed || forceLockAspect;
      const aspect = initW / initH;

      let nextX = initX;
      let nextY = initY;
      let nextW = initW;
      let nextH = initH;

      if (h === 'move') {
        nextX = Math.round(initX + dx);
        nextY = Math.round(initY + dy);
      } else {
        switch (h) {
          case 'se': // Bottom-right
            nextW = Math.max(10, Math.round(initW + dx));
            nextH = Math.max(10, Math.round(initH + dy));
            if (isConstrained) {
              if (Math.abs(dx) >= Math.abs(dy)) {
                nextH = Math.max(10, Math.round(nextW / aspect));
              } else {
                nextW = Math.max(10, Math.round(nextH * aspect));
              }
            }
            break;

          case 'e': // Right edge
            nextW = Math.max(10, Math.round(initW + dx));
            if (isConstrained) {
              nextH = Math.max(10, Math.round(nextW / aspect));
            }
            break;

          case 's': // Bottom edge
            nextH = Math.max(10, Math.round(initH + dy));
            if (isConstrained) {
              nextW = Math.max(10, Math.round(nextH * aspect));
            }
            break;

          case 'nw': // Top-left
            nextW = Math.max(10, Math.round(initW - dx));
            nextH = Math.max(10, Math.round(initH - dy));
            if (isConstrained) {
              if (Math.abs(dx) >= Math.abs(dy)) {
                nextH = Math.max(10, Math.round(nextW / aspect));
              } else {
                nextW = Math.max(10, Math.round(nextH * aspect));
              }
            }
            nextX = initX + (initW - nextW);
            nextY = initY + (initH - nextH);
            break;

          case 'ne': // Top-right
            nextW = Math.max(10, Math.round(initW + dx));
            nextH = Math.max(10, Math.round(initH - dy));
            if (isConstrained) {
              if (Math.abs(dx) >= Math.abs(dy)) {
                nextH = Math.max(10, Math.round(nextW / aspect));
              } else {
                nextW = Math.max(10, Math.round(nextH * aspect));
              }
            }
            nextY = initY + (initH - nextH);
            break;

          case 'sw': // Bottom-left
            nextW = Math.max(10, Math.round(initW - dx));
            nextH = Math.max(10, Math.round(initH + dy));
            if (isConstrained) {
              if (Math.abs(dx) >= Math.abs(dy)) {
                nextH = Math.max(10, Math.round(nextW / aspect));
              } else {
                nextW = Math.max(10, Math.round(nextH * aspect));
              }
            }
            nextX = initX + (initW - nextW);
            break;

          case 'w': // Left edge
            nextW = Math.max(10, Math.round(initW - dx));
            if (isConstrained) {
              nextH = Math.max(10, Math.round(nextW / aspect));
            }
            nextX = initX + (initW - nextW);
            break;

          case 'n': // Top edge
            nextH = Math.max(10, Math.round(initH - dy));
            if (isConstrained) {
              nextW = Math.max(10, Math.round(nextH * aspect));
            }
            nextY = initY + (initH - nextH);
            break;
        }
      }

      updateActiveDoc((doc) => ({
        ...doc,
        layers: doc.layers.map((l) =>
          l.id === layer.id
            ? {
                ...l,
                x: nextX,
                y: nextY,
                width: nextW,
                height: nextH
              }
            : l
        )
      }));
    };

    const handlePointerUp = () => {
      dragStartRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // ---------------------------------------------------------------------------
  // CANVAS COMPOSITING & HIGH-RES EXPORT / SAVE TO COMPUTER
  // ---------------------------------------------------------------------------
  const renderCompositeCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = activeDoc.width;
    canvas.height = activeDoc.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // Draw background
    if (activeDoc.backgroundColor !== 'transparent') {
      ctx.fillStyle = activeDoc.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw visible layers in order
    for (const l of activeDoc.layers) {
      if (!l.visible) continue;
      ctx.save();
      ctx.globalAlpha = l.opacity / 100;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, l.x, l.y, l.width, l.height);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = l.src;
      });

      ctx.restore();
    }

    return canvas;
  };

  // Save to computer or optimize via LeafLite backend
  const handleExportDocument = async (isLeafLiteOptimize = false) => {
    setIsExporting(true);
    setOptimizeResult(null);

    try {
      const compositeCanvas = await renderCompositeCanvas();
      const mime =
        exportFormat === 'PNG' ? 'image/png' : exportFormat === 'JPG' ? 'image/jpeg' : 'image/webp';

      const blob = await new Promise<Blob | null>((resolve) =>
        compositeCanvas.toBlob((b) => resolve(b), mime, exportQuality / 100)
      );

      if (!blob) throw new Error('Failed to generate export file.');

      const ext = exportFormat.toLowerCase();
      const filename = `${activeDoc.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${activeDoc.width}x${activeDoc.height}.${ext}`;

      if (!isLeafLiteOptimize) {
        // Direct Client-Side Download to System
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Send to LeafLite FastAPI backend optimization engine
        setIsOptimizing(true);
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('target_format', exportFormat);
        formData.append('quality', exportQuality.toString());

        const res = await fetch(`${backendUrl}/api/tools/optimize-direct`, {
          method: 'POST',
          body: formData
        });

        if (!res.ok) throw new Error('Optimization request failed.');
        const data = await res.json();

        setOptimizeResult({
          originalSize: data.original_size_formatted || `${(blob.size / 1024).toFixed(1)} KB`,
          optimizedSize: data.optimized_size_formatted,
          savedPercent: data.saved_percent || 0,
          downloadUrl: `${backendUrl}${data.download_url}`,
          filename: data.download_filename || filename
        });
      }
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setIsExporting(false);
      setIsOptimizing(false);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none min-h-0 h-full">
      {/* ========================================================================= */}
      {/* 1. TOP DOCUMENT TABS BAR (Photoshop-style Multi-Canvas Tabs)               */}
      {/* ========================================================================= */}
      <div className="w-full bg-[#111827] border-b border-slate-800 px-3 pt-2 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {documents.map((doc) => {
            const isActive = doc.id === activeDocId;
            return (
              <div
                key={doc.id}
                onClick={() => setActiveDocId(doc.id)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#1e293b] text-cyan-400 border-cyan-400 font-bold shadow-xs'
                    : 'bg-[#151d2f]/70 text-slate-400 border-transparent hover:bg-slate-800/80 hover:text-slate-200'
                }`}
              >
                <span>{doc.title}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900/80 text-slate-400">
                  {doc.width}×{doc.height}
                </span>

                {/* Close Tab Button */}
                <button
                  type="button"
                  onClick={(e) => handleCloseDocument(doc.id, e)}
                  className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-1"
                  title="Close Canvas"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* + New Canvas Button (Ctrl+N) */}
          <button
            type="button"
            onClick={() => setShowNewCanvasModal(true)}
            className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 rounded-t-lg transition-colors cursor-pointer ml-1"
            title="Create New Canvas (Ctrl+N)"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>New Canvas</span>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1 rounded">Ctrl+N</span>
          </button>
        </div>

        {/* Quick Help & Status Badge */}
        <div className="flex items-center gap-2 pr-2">
          <div
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold flex items-center gap-1.5 border transition-all ${
              isShiftPressed || forceLockAspect
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Aspect ratio locking is engaged (hold Shift to toggle)"
          >
            <Lock className="w-3 h-3" />
            <span>Shift: {isShiftPressed || forceLockAspect ? 'Constrained' : 'Freeform'}</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SECONDARY CONTROLS & SHORTCUT BAR                                      */}
      {/* ========================================================================= */}
      <div className="w-full bg-[#151f33] border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Tool Selector Buttons */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTool('transform')}
            className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all ${
              activeTool === 'transform'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Free Transform Tool (Ctrl+T)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Transform</span>
            <span className="text-[9px] font-mono opacity-80">Ctrl+T</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('move')}
            className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all ${
              activeTool === 'move'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Move Tool (V)"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Move</span>
          </button>

          <button
            type="button"
            onClick={() => setForceLockAspect((prev) => !prev)}
            className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 border transition-all ${
              forceLockAspect
                ? 'bg-emerald-950/90 border-emerald-600 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Toggle Aspect Ratio Constraint (Shift)"
          >
            {forceLockAspect ? <Lock className="w-3.5 h-3.5 text-emerald-400" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>Lock Ratio</span>
          </button>
        </div>

        {/* Add Layer / Open Image */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleAddImageFile(e.target.files[0]);
              }
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Image Layer</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() =>
                updateActiveDoc((doc) => ({
                  ...doc,
                  zoom: Math.max(0.15, Number((doc.zoom - 0.1).toFixed(1)))
                }))
              }
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] text-slate-300">
              {Math.round(activeDoc.zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() =>
                updateActiveDoc((doc) => ({
                  ...doc,
                  zoom: Math.min(3, Number((doc.zoom + 0.1).toFixed(1)))
                }))
              }
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                updateActiveDoc((doc) => ({ ...doc, zoom: 0.65, panX: 0, panY: 0 }))
              }
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              title="Reset Viewport"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN WORKSPACE (Photoshop Canvas Viewport + Right Inspector Dock)        */}
      {/* ========================================================================= */}
      <div className="w-full flex-1 min-h-0 flex flex-col lg:flex-row bg-[#090d16] relative">
        {/* ----------------------------------------------------------------------- */}
        {/* CENTER VIEWPORT: THE PHOTOSHOP CANVAS DOCUMENT                          */}
        {/* ----------------------------------------------------------------------- */}
        <div
          ref={canvasContainerRef}
          className="flex-1 bg-[#090d16] overflow-hidden relative flex items-center justify-center select-none"
        >
          {/* Canvas Document Frame */}
          <div
            className={`relative transition-transform duration-75 shadow-2xl border border-slate-700/80 rounded-sm ${
              activeDoc.backgroundColor === 'transparent' ? 'checkerboard-bg' : ''
            }`}
            style={{
              width: `${activeDoc.width}px`,
              height: `${activeDoc.height}px`,
              transform: `translate(${activeDoc.panX}px, ${activeDoc.panY}px) scale(${activeDoc.zoom})`,
              transformOrigin: 'center center',
              backgroundColor: activeDoc.backgroundColor === 'transparent' ? undefined : activeDoc.backgroundColor
            }}
          >
            {/* Render Layers */}
            {activeDoc.layers.map((layer) => {
              if (!layer.visible) return null;
              const isSelected = activeDoc.activeLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateActiveDoc((doc) => ({ ...doc, activeLayerId: layer.id }));
                  }}
                  onPointerDown={(e) => handlePointerDown(e, 'move', layer)}
                  className={`absolute group cursor-move select-none ${
                    isSelected ? 'z-30' : 'z-10'
                  }`}
                  style={{
                    left: `${layer.x}px`,
                    top: `${layer.y}px`,
                    width: `${layer.width}px`,
                    height: `${layer.height}px`,
                    opacity: layer.opacity / 100
                  }}
                >
                  <img
                    src={layer.src}
                    alt={layer.name}
                    className="w-full h-full object-contain pointer-events-none"
                    draggable={false}
                  />

                  {/* PHOTOSHOP TRANSFORM BOUNDING BOX & 8 ANCHOR HANDLES (Ctrl+T) */}
                  {isSelected && activeTool === 'transform' && !layer.locked && (
                    <div className="absolute inset-0 border-2 border-cyan-400 pointer-events-none">
                      {/* NW Handle */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'nw', layer)}
                        className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-cyan-600 rounded-xs shadow-md pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform"
                      />
                      {/* N Handle */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'n', layer)}
                        className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-cyan-600 rounded-xs shadow-md pointer-events-auto cursor-ns-resize hover:scale-125 transition-transform"
                      />
                      {/* NE Handle */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'ne', layer)}
                        className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-cyan-600 rounded-xs shadow-md pointer-events-auto cursor-nesw-resize hover:scale-125 transition-transform"
                      />
                      {/* E Handle */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'e', layer)}
                        className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-4 bg-white border-2 border-cyan-600 rounded-xs shadow-md pointer-events-auto cursor-ew-resize hover:scale-125 transition-transform"
                      />
                      {/* SE Handle */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'se', layer)}
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-cyan-600 rounded-xs shadow-md pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform"
                      />
                      {/* S Handle */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 's', layer)}
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-cyan-600 rounded-xs shadow-md pointer-events-auto cursor-ns-resize hover:scale-125 transition-transform"
                      />
                      {/* SW Handle */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'sw', layer)}
                        className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-cyan-600 rounded-xs shadow-md pointer-events-auto cursor-nesw-resize hover:scale-125 transition-transform"
                      />
                      {/* W Handle */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'w', layer)}
                        className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-4 bg-white border-2 border-cyan-600 rounded-xs shadow-md pointer-events-auto cursor-ew-resize hover:scale-125 transition-transform"
                      />

                      {/* Dimension Pill Overlay */}
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-cyan-500 text-slate-950 font-mono font-bold text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                        {layer.width} × {layer.height} px • (
                        {Math.round((layer.width / layer.originalWidth) * 100)}%)
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Viewport Status Bar */}
          <div className="absolute bottom-3 left-4 bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-3 backdrop-blur-xs">
            <span>Canvas: <b className="text-slate-200">{activeDoc.width} × {activeDoc.height} px</b></span>
            <span>•</span>
            <span>Zoom: <b className="text-slate-200">{Math.round(activeDoc.zoom * 100)}%</b></span>
            <span>•</span>
            <span>Active Layer: <b className="text-cyan-400">{activeLayer ? activeLayer.name : 'None'}</b></span>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* RIGHT DOCK: GEOMETRY INSPECTOR, LAYERS STACK & SYSTEM EXPORT            */}
        {/* ----------------------------------------------------------------------- */}
        <div className="w-full lg:w-80 bg-[#111827] border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-72 lg:h-full overflow-y-auto select-none shrink-0 p-4 space-y-5">
          {/* 1. Canvas Dimensions & Properties */}
          <div className="space-y-2 border-b border-slate-800 pb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Crop className="w-3.5 h-3.5 text-cyan-400" />
              Canvas Settings
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                <span className="text-[10px] text-slate-500 block">Width (px)</span>
                <input
                  type="number"
                  value={activeDoc.width}
                  onChange={(e) =>
                    updateActiveDoc((doc) => ({
                      ...doc,
                      width: Math.max(50, parseInt(e.target.value) || 100)
                    }))
                  }
                  className="w-full bg-transparent text-white font-mono font-bold focus:outline-none"
                />
              </div>

              <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                <span className="text-[10px] text-slate-500 block">Height (px)</span>
                <input
                  type="number"
                  value={activeDoc.height}
                  onChange={(e) =>
                    updateActiveDoc((doc) => ({
                      ...doc,
                      height: Math.max(50, parseInt(e.target.value) || 100)
                    }))
                  }
                  className="w-full bg-transparent text-white font-mono font-bold focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Active Layer Transform & Geometry */}
          {activeLayer && (
            <div className="space-y-2.5 border-b border-slate-800 pb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  Layer Transform
                </span>
                <span className="text-[10px] font-mono text-cyan-400 font-bold">
                  {Math.round((activeLayer.width / activeLayer.originalWidth) * 100)}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">W (px)</span>
                  <input
                    type="number"
                    value={activeLayer.width}
                    onChange={(e) => {
                      const val = Math.max(10, parseInt(e.target.value) || 10);
                      const aspect = activeLayer.originalWidth / activeLayer.originalHeight;
                      updateActiveDoc((doc) => ({
                        ...doc,
                        layers: doc.layers.map((l) =>
                          l.id === activeLayer.id
                            ? {
                                ...l,
                                width: val,
                                height: forceLockAspect ? Math.round(val / aspect) : l.height
                              }
                            : l
                        )
                      }));
                    }}
                    className="w-full bg-transparent text-white font-mono font-bold focus:outline-none"
                  />
                </div>

                <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">H (px)</span>
                  <input
                    type="number"
                    value={activeLayer.height}
                    onChange={(e) => {
                      const val = Math.max(10, parseInt(e.target.value) || 10);
                      const aspect = activeLayer.originalWidth / activeLayer.originalHeight;
                      updateActiveDoc((doc) => ({
                        ...doc,
                        layers: doc.layers.map((l) =>
                          l.id === activeLayer.id
                            ? {
                                ...l,
                                height: val,
                                width: forceLockAspect ? Math.round(val * aspect) : l.width
                              }
                            : l
                        )
                      }));
                    }}
                    className="w-full bg-transparent text-white font-mono font-bold focus:outline-none"
                  />
                </div>

                <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">X Position</span>
                  <input
                    type="number"
                    value={activeLayer.x}
                    onChange={(e) =>
                      updateActiveDoc((doc) => ({
                        ...doc,
                        layers: doc.layers.map((l) =>
                          l.id === activeLayer.id ? { ...l, x: parseInt(e.target.value) || 0 } : l
                        )
                      }))
                    }
                    className="w-full bg-transparent text-white font-mono font-bold focus:outline-none"
                  />
                </div>

                <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Y Position</span>
                  <input
                    type="number"
                    value={activeLayer.y}
                    onChange={(e) =>
                      updateActiveDoc((doc) => ({
                        ...doc,
                        layers: doc.layers.map((l) =>
                          l.id === activeLayer.id ? { ...l, y: parseInt(e.target.value) || 0 } : l
                        )
                      }))
                    }
                    className="w-full bg-transparent text-white font-mono font-bold focus:outline-none"
                  />
                </div>
              </div>

              {/* Opacity Slider */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Layer Opacity:</span>
                  <span className="font-mono text-cyan-400">{activeLayer.opacity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={activeLayer.opacity}
                  onChange={(e) =>
                    updateActiveDoc((doc) => ({
                      ...doc,
                      layers: doc.layers.map((l) =>
                        l.id === activeLayer.id ? { ...l, opacity: Number(e.target.value) } : l
                      )
                    }))
                  }
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Layer Alignment Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCenterActiveLayer}
                  className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold"
                >
                  Center Layer
                </button>
                <button
                  type="button"
                  onClick={handleFitLayerToCanvas}
                  className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold"
                >
                  Fit Canvas
                </button>
              </div>
            </div>
          )}

          {/* 3. Photoshop Layers Stack */}
          <div className="space-y-2 border-b border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Layers Panel ({activeDoc.layers.length})
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {activeDoc.layers.map((layer, idx) => {
                const isSelected = activeDoc.activeLayerId === layer.id;
                return (
                  <div
                    key={layer.id}
                    onClick={() => updateActiveDoc((doc) => ({ ...doc, activeLayerId: layer.id }))}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/80 border-cyan-500 text-white shadow-xs'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <img
                        src={layer.src}
                        alt=""
                        className="w-6 h-6 object-cover rounded-xs border border-white/20 shrink-0"
                      />
                      <span className="truncate font-medium">{layer.name}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleToggleVisibility(layer.id, e)}
                        className="p-1 hover:text-white text-slate-400"
                        title="Toggle Visibility"
                      >
                        {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleToggleLock(layer.id, e)}
                        className="p-1 hover:text-white text-slate-400"
                        title="Toggle Lock"
                      >
                        {layer.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLayer(layer.id);
                        }}
                        className="p-1 hover:text-rose-400 text-slate-500"
                        title="Delete Layer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Export & Save to System with LeafLite Optimization */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              Save & Export Canvas
            </span>

            {/* Output Format Tabs */}
            <div className="flex items-center gap-2">
              {(['WEBP', 'PNG', 'JPG'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    exportFormat === fmt
                      ? 'bg-cyan-600 border-cyan-500 text-white shadow-xs'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            {/* Quality Slider (for WEBP and JPG) */}
            {exportFormat !== 'PNG' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Quality:</span>
                  <span className="font-mono text-cyan-400">{exportQuality}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={exportQuality}
                  onChange={(e) => setExportQuality(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleExportDocument(false)}
                disabled={isExporting}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-100 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-300" />
                <span>Save to Computer ({exportFormat})</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportDocument(true)}
                disabled={isOptimizing}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-98 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/40 cursor-pointer"
              >
                {isOptimizing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-emerald-200 fill-emerald-200" />
                )}
                <span>Optimize with LeafLite Engine</span>
              </button>
            </div>

            {/* Optimization Results Report */}
            {optimizeResult && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-emerald-300">
                  <span>Engine Optimized!</span>
                  <span className="bg-emerald-800 text-white text-[10px] px-2 py-0.5 rounded-full">
                    {optimizeResult.savedPercent}% Saved
                  </span>
                </div>
                <div className="text-[11px] text-emerald-400/90 font-mono">
                  {optimizeResult.originalSize} → {optimizeResult.optimizedSize}
                </div>
                <a
                  href={optimizeResult.downloadUrl}
                  download={optimizeResult.filename}
                  className="block text-center w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors"
                >
                  Download Optimized Image
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. NEW CANVAS MODAL (Ctrl+N / Cmd+N)                                       */}
      {/* ========================================================================= */}
      {showNewCanvasModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewCanvasModal(false);
          }}
        >
          <div className="bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Create New Canvas Document</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCanvasModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Document Name</label>
              <input
                type="text"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-bold text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Preset Picker */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Preset Size</label>
              <select
                onChange={(e) => {
                  const preset = PRESET_CANVASES.find((p) => p.name === e.target.value);
                  if (preset) {
                    setNewDocWidth(preset.w);
                    setNewDocHeight(preset.h);
                  }
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:border-cyan-500 focus:outline-none"
              >
                {PRESET_CANVASES.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Width & Height Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Width (px)</label>
                <input
                  type="number"
                  value={newDocWidth}
                  onChange={(e) => setNewDocWidth(parseInt(e.target.value) || 100)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Height (px)</label>
                <input
                  type="number"
                  value={newDocHeight}
                  onChange={(e) => setNewDocHeight(parseInt(e.target.value) || 100)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Background Color Picker */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Canvas Background</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'transparent', label: 'Transparent' },
                  { id: '#ffffff', label: 'Pure White' },
                  { id: '#0f172a', label: 'Dark Studio' }
                ].map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setNewDocBg(bg.id)}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      newDocBg === bg.id
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowNewCanvasModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewCanvas}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs shadow-md shadow-cyan-900/40"
              >
                Create Canvas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
