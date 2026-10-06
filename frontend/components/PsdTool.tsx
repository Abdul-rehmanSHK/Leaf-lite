'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  FileCode,
  Upload,
  Layers,
  Eye,
  EyeOff,
  Copy,
  Check,
  Download,
  Zap,
  RefreshCw,
  Type,
  Image as ImageIcon,
  Folder,
  FolderOpen,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Info,
  Ruler,
  Palette,
  Crosshair,
  Search,
  Hand,
  MousePointer,
  ChevronRight,
  ChevronDown,
  Maximize2,
  X
} from 'lucide-react';
import { readPsd, getCompositeCanvas } from 'ag-psd';

interface PsdToolProps {
  backendUrl: string;
}

export interface PsdLayerItem {
  id: string;
  name: string;
  type: 'text' | 'image' | 'shape' | 'group';
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number; // 0-100
  visible: boolean;
  canvasDataUrl?: string;
  text?: {
    content: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: string | number;
    lineHeight: number | string;
    letterSpacing: number | string;
    colorHex: string;
    colorRgba: string;
    align: string;
  };
  colorHex?: string;
  children?: PsdLayerItem[];
  collapsed?: boolean;
}

export const PsdTool: React.FC<PsdToolProps> = ({ backendUrl }) => {
  const [psdFileName, setPsdFileName] = useState<string>('Sample_Design_Mockup.psd');
  const [psdWidth, setPsdWidth] = useState<number>(1280);
  const [psdHeight, setPsdHeight] = useState<number>(800);
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);
  const [layers, setLayers] = useState<PsdLayerItem[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);

  // Search & Navigation
  const [layerSearchQuery, setLayerSearchQuery] = useState<string>('');
  const [activeTool, setActiveTool] = useState<'select' | 'hand'>('select');
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [showGuides, setShowGuides] = useState<boolean>(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Viewport Zoom & Smooth Movement
  const [zoom, setZoom] = useState<number>(0.8);
  const [isDraggingPan, setIsDraggingPan] = useState<boolean>(false);
  const dragPanStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Processing & UI states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Layer Export states
  const [exportFormat, setExportFormat] = useState<'WEBP' | 'PNG' | 'JPG'>('WEBP');
  const [exportQuality, setExportQuality] = useState<number>(85);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizeResult, setOptimizeResult] = useState<{
    originalSize: string;
    optimizedSize: string;
    savedPercent: number;
    downloadUrl: string;
    filename: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation (Spacebar for pan, H for hand, V for select)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      if ((e.key === 'h' || e.key === 'H') && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        setActiveTool('hand');
      }
      if ((e.key === 'v' || e.key === 'V') && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        setActiveTool('select');
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Load sample PSD initially
  useEffect(() => {
    loadSamplePsd();
  }, []);

  const loadSamplePsd = () => {
    setPsdFileName('LeafLite_Ecommerce_Hero.psd');
    const w = 1280;
    const h = 720;
    setPsdWidth(w);
    setPsdHeight(h);

    // Create an exact crystal-clear sample composite canvas
    const compCanvas = document.createElement('canvas');
    compCanvas.width = w;
    compCanvas.height = h;
    const ctx = compCanvas.getContext('2d');
    if (ctx) {
      // Dark slate background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      // Card container
      ctx.fillStyle = '#1e293b';
      ctx.roundRect(80, 80, 1120, 560, 24);
      ctx.fill();

      // Badge
      ctx.fillStyle = '#10b981';
      ctx.roundRect(140, 140, 240, 36, 18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillText('⚡ High Performance Engine', 158, 163);

      // Headline
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 44px Outfit, Inter, sans-serif';
      ctx.fillText('Optimize Faster.', 140, 245);
      ctx.fillText('Deliver Better.', 140, 300);

      // Paragraph
      ctx.fillStyle = '#94a3b8';
      ctx.font = '15px Inter, sans-serif';
      ctx.fillText('Stateless, blazing-fast image compressor and converter with', 140, 350);
      ctx.fillText('batch processing, layer extraction, and zero quality loss.', 140, 375);

      // CTA Button
      ctx.fillStyle = '#10b981';
      ctx.roundRect(140, 420, 210, 48, 14);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Inter, sans-serif';
      ctx.fillText('Get Started Free →', 175, 451);

      // Showcase card
      ctx.fillStyle = '#047857';
      ctx.roundRect(710, 140, 440, 440, 20);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.fillText('🍃 LeafLite Studio', 800, 340);
      ctx.font = '14px Inter, sans-serif';
      ctx.fillStyle = '#a7f3d0';
      ctx.fillText('High-Fidelity PSD & Canvas Suite', 780, 375);

      setCompositeUrl(compCanvas.toDataURL('image/png'));
    }

    const demoLayers: PsdLayerItem[] = [
      {
        id: 'layer-bg',
        name: 'Background Gradient',
        type: 'shape',
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        opacity: 100,
        visible: true,
        colorHex: '#0f172a'
      },
      {
        id: 'layer-card',
        name: 'Hero Glass Container',
        type: 'shape',
        left: 80,
        top: 80,
        width: 1120,
        height: 560,
        opacity: 95,
        visible: true,
        colorHex: '#1e293b'
      },
      {
        id: 'layer-badge',
        name: 'Tag / Pill Badge',
        type: 'shape',
        left: 140,
        top: 140,
        width: 240,
        height: 36,
        opacity: 100,
        visible: true,
        colorHex: '#10b981'
      },
      {
        id: 'layer-badge-text',
        name: 'Badge Text',
        type: 'text',
        left: 158,
        top: 146,
        width: 200,
        height: 24,
        opacity: 100,
        visible: true,
        text: {
          content: '⚡ High Performance Engine',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 700,
          lineHeight: '20px',
          letterSpacing: '0.5px',
          colorHex: '#ffffff',
          colorRgba: 'rgba(255, 255, 255, 1)',
          align: 'left'
        }
      },
      {
        id: 'layer-heading',
        name: 'Headline Title',
        type: 'text',
        left: 140,
        top: 210,
        width: 520,
        height: 100,
        opacity: 100,
        visible: true,
        text: {
          content: 'Optimize Faster.\nDeliver Better.',
          fontFamily: 'Outfit, Inter, sans-serif',
          fontSize: 44,
          fontWeight: 800,
          lineHeight: '52px',
          letterSpacing: '-0.8px',
          colorHex: '#f8fafc',
          colorRgba: 'rgba(248, 250, 252, 1)',
          align: 'left'
        }
      },
      {
        id: 'layer-paragraph',
        name: 'Subtitle Description',
        type: 'text',
        left: 140,
        top: 335,
        width: 500,
        height: 50,
        opacity: 90,
        visible: true,
        text: {
          content: 'Stateless, blazing-fast image compressor and converter with batch processing, layer extraction, and zero quality loss.',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 15,
          fontWeight: 400,
          lineHeight: '24px',
          letterSpacing: '0px',
          colorHex: '#94a3b8',
          colorRgba: 'rgba(148, 163, 184, 1)',
          align: 'left'
        }
      },
      {
        id: 'layer-btn',
        name: 'CTA Button',
        type: 'shape',
        left: 140,
        top: 420,
        width: 210,
        height: 48,
        opacity: 100,
        visible: true,
        colorHex: '#10b981'
      },
      {
        id: 'layer-btn-text',
        name: 'Button Label',
        type: 'text',
        left: 175,
        top: 433,
        width: 140,
        height: 22,
        opacity: 100,
        visible: true,
        text: {
          content: 'Get Started Free →',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 15,
          fontWeight: 700,
          lineHeight: '20px',
          letterSpacing: '0.2px',
          colorHex: '#ffffff',
          colorRgba: 'rgba(255, 255, 255, 1)',
          align: 'center'
        }
      },
      {
        id: 'layer-img-product',
        name: 'Showcase Artwork Card',
        type: 'image',
        left: 710,
        top: 140,
        width: 440,
        height: 440,
        opacity: 100,
        visible: true,
        colorHex: '#047857'
      }
    ];

    setLayers(demoLayers);
    setSelectedLayerId('layer-heading');
  };

  // Upload and parse user PSD file
  const handlePsdUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setPsdFileName(file.name);
    setOptimizeResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const psd = readPsd(buffer, {
        skipLayerImageData: false,
        skipCompositeImageData: false
      });

      const w = psd.width || 1280;
      const h = psd.height || 800;
      setPsdWidth(w);
      setPsdHeight(h);

      // Extract crystal-clear composite preview using modern high-performance Blob URLs
      if (psd.canvas) {
        try {
          psd.canvas.toBlob((blob) => {
            if (blob) {
              const objUrl = URL.createObjectURL(blob);
              setCompositeUrl(objUrl);
            }
          }, 'image/png');
        } catch (e) {
          try {
            setCompositeUrl(psd.canvas.toDataURL('image/png'));
          } catch (_) {}
        }
      } else {
        try {
          const compCanvas = getCompositeCanvas(psd);
          if (compCanvas) {
            compCanvas.toBlob((blob) => {
              if (blob) {
                const objUrl = URL.createObjectURL(blob);
                setCompositeUrl(objUrl);
              }
            }, 'image/png');
          }
        } catch (e) {
          console.warn('Composite canvas generation error', e);
        }
      }

      // Concurrently fetch high-fidelity Adobe composite from backend (handles clipping masks & blend modes)
      (async () => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const inspectRes = await fetch(`${backendUrl}/api/tools/psd/inspect`, {
            method: 'POST',
            body: formData
          });
          if (inspectRes.ok) {
            const data = await inspectRes.json();
            if (data.composite_url) {
              setCompositeUrl(`${backendUrl}${data.composite_url}`);
            }
          }
        } catch (backendErr) {
          console.log('Backend PSD composite inspection optional note:', backendErr);
        }
      })();

      // Recursively parse layers with absolute coordinates
      const parsedLayers: PsdLayerItem[] = [];

      const processNode = (node: any, idx: number, parentPrefix = 'l'): PsdLayerItem => {
        const id = `${parentPrefix}-${idx}-${node.name || 'layer'}`;
        const layerW = node.width || (node.right && node.left ? node.right - node.left : 100);
        const layerH = node.height || (node.bottom && node.top ? node.bottom - node.top : 40);
        const left = node.left || 0;
        const top = node.top || 0;
        const opacity = Math.round((node.opacity ?? 1) * 100);
        const visible = node.hidden !== true;

        let type: PsdLayerItem['type'] = 'image';
        let textData: PsdLayerItem['text'] | undefined = undefined;

        if (node.text) {
          type = 'text';
          const t = node.text;
          const style = t.style || {};
          const font = style.font?.name || style.font?.postScriptName || 'Inter, sans-serif';
          const fontSize = Math.round(style.fontSize || 16);
          const fillColor = style.fillColor || { r: 15, g: 23, b: 42, a: 1 };
          const r = Math.round(fillColor.r * (fillColor.r <= 1 ? 255 : 1));
          const g = Math.round(fillColor.g * (fillColor.g <= 1 ? 255 : 1));
          const b = Math.round(fillColor.b * (fillColor.b <= 1 ? 255 : 1));
          const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

          textData = {
            content: t.text || '',
            fontFamily: font,
            fontSize: fontSize,
            fontWeight: style.font?.name?.toLowerCase().includes('bold') ? 700 : 400,
            lineHeight: style.leading ? `${Math.round(style.leading)}px` : `${Math.round(fontSize * 1.3)}px`,
            letterSpacing: style.tracking ? `${(style.tracking / 1000).toFixed(2)}em` : '0px',
            colorHex: hex,
            colorRgba: `rgba(${r}, ${g}, ${b}, ${fillColor.a ?? 1})`,
            align: style.alignment || 'left'
          };
        } else if (node.children && node.children.length > 0) {
          type = 'group';
        }

        let canvasDataUrl: string | undefined = undefined;
        if (node.canvas) {
          try {
            canvasDataUrl = node.canvas.toDataURL('image/png');
          } catch (e) {
            // ignore canvas data url error
          }
        }

        const item: PsdLayerItem = {
          id,
          name: node.name || `Layer ${idx + 1}`,
          type,
          left,
          top,
          width: layerW,
          height: layerH,
          opacity,
          visible,
          canvasDataUrl,
          text: textData,
          colorHex: textData?.colorHex || '#3b82f6'
        };

        if (node.children && node.children.length > 0) {
          item.children = node.children.map((c: any, cIdx: number) =>
            processNode(c, cIdx, `${id}-c`)
          );
        }

        return item;
      };

      if (psd.children && psd.children.length > 0) {
        psd.children.forEach((child: any, i: number) => {
          parsedLayers.push(processNode(child, i));
        });
      }

      setLayers(parsedLayers);
      if (parsedLayers.length > 0) {
        setSelectedLayerId(parsedLayers[0].id);
      }

      // Auto-fit width after loading
      setTimeout(() => {
        handleFitWidth(w);
      }, 100);
    } catch (err: any) {
      console.error('Error parsing PSD:', err);
      setError(`PSD Parsing Note: ${err.message || 'File parsed with fallback.'}. You can still inspect layers and extract text.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Flattened list of all layers for selection and distance math
  const flatLayers = useMemo(() => {
    const list: PsdLayerItem[] = [];
    const traverse = (items: PsdLayerItem[]) => {
      items.forEach((item) => {
        list.push(item);
        if (item.children) traverse(item.children);
      });
    };
    traverse(layers);
    return list;
  }, [layers]);

  // Filtered layers based on search query
  const filteredFlatLayers = useMemo(() => {
    if (!layerSearchQuery.trim()) return flatLayers;
    const q = layerSearchQuery.toLowerCase();
    return flatLayers.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.text && l.text.content.toLowerCase().includes(q))
    );
  }, [flatLayers, layerSearchQuery]);

  // Selected layer
  const selectedLayer = useMemo(() => {
    return flatLayers.find((l) => l.id === selectedLayerId) || null;
  }, [flatLayers, selectedLayerId]);

  // Hovered layer (for distance inspection)
  const hoveredLayer = useMemo(() => {
    if (!hoveredLayerId || hoveredLayerId === selectedLayerId) return null;
    return flatLayers.find((l) => l.id === hoveredLayerId) || null;
  }, [flatLayers, hoveredLayerId, selectedLayerId]);

  // Toggle group collapse
  const toggleGroupCollapse = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Toggle layer visibility
  const toggleLayerVisibility = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updateRecursive = (items: PsdLayerItem[]): PsdLayerItem[] => {
      return items.map((l) => {
        if (l.id === id) {
          return { ...l, visible: !l.visible };
        }
        if (l.children) {
          return { ...l, children: updateRecursive(l.children) };
        }
        return l;
      });
    };
    setLayers((prev) => updateRecursive(prev));
  };

  // Scroll viewport smoothly to center on a layer
  const scrollToLayer = useCallback(
    (layer: PsdLayerItem) => {
      if (!viewportRef.current) return;
      const targetY = (layer.top + layer.height / 2) * zoom - viewportRef.current.clientHeight / 2;
      const targetX = (layer.left + layer.width / 2) * zoom - viewportRef.current.clientWidth / 2;

      viewportRef.current.scrollTo({
        top: Math.max(0, targetY),
        left: Math.max(0, targetX),
        behavior: 'smooth'
      });
    },
    [zoom]
  );

  // Select layer and scroll to it
  const handleSelectLayer = (id: string) => {
    setSelectedLayerId(id);
    const l = flatLayers.find((item) => item.id === id);
    if (l) scrollToLayer(l);
  };

  // ---------------------------------------------------------------------------
  // ZOOM PRESETS ("Fit Width", "Fit All", "100%", "Top", "Bottom")
  // ---------------------------------------------------------------------------
  const handleFitWidth = (customWidth?: number) => {
    if (!viewportRef.current) return;
    const targetW = customWidth || psdWidth;
    const vpW = viewportRef.current.clientWidth - 48; // account for padding
    if (vpW > 0 && targetW > 0) {
      const computedZoom = Math.max(0.05, Math.min(2.5, Number((vpW / targetW).toFixed(2))));
      setZoom(computedZoom);
    }
  };

  const handleFitScreen = () => {
    if (!viewportRef.current) return;
    const vpW = viewportRef.current.clientWidth - 48;
    const vpH = viewportRef.current.clientHeight - 48;
    if (vpW > 0 && vpH > 0 && psdWidth > 0 && psdHeight > 0) {
      const computedZoom = Math.max(
        0.05,
        Number(Math.min(vpW / psdWidth, vpH / psdHeight).toFixed(2))
      );
      setZoom(computedZoom);
    }
  };

  const handleScrollToTop = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  };

  const handleScrollToBottom = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom((z) => Math.max(0.05, Math.min(3, Number((z + delta).toFixed(2)))));
    }
  };

  // ---------------------------------------------------------------------------
  // DRAG-TO-PAN (Hand tool / Spacebar / Middle Click / Background Drag)
  // ---------------------------------------------------------------------------
  const handlePointerDownPan = (e: React.PointerEvent) => {
    if (!viewportRef.current) return;
    const isMiddleClick = e.button === 1;
    const isHandMode = activeTool === 'hand' || isSpacePressed || isMiddleClick || e.altKey;
    const isBackground =
      e.target === viewportRef.current ||
      (e.target as HTMLElement)?.dataset?.bg === 'true';

    if (isHandMode || isBackground) {
      e.preventDefault();
      setIsDraggingPan(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const startScrollLeft = viewportRef.current.scrollLeft;
      const startScrollTop = viewportRef.current.scrollTop;

      const handlePointerMove = (moveEvt: PointerEvent) => {
        if (!viewportRef.current) return;
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;
        viewportRef.current.scrollLeft = startScrollLeft - dx;
        viewportRef.current.scrollTop = startScrollTop - dy;
      };

      const handlePointerUp = () => {
        setIsDraggingPan(false);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
  };

  // Copy helper
  const handleCopyText = (content: string, typeName: string) => {
    navigator.clipboard.writeText(content);
    setCopiedType(typeName);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Generate CSS snippet
  const generateLayerCss = (l: PsdLayerItem): string => {
    if (l.type === 'text' && l.text) {
      return `/* ${l.name} Typography */
font-family: ${l.text.fontFamily};
font-size: ${l.text.fontSize}px;
font-weight: ${l.text.fontWeight};
line-height: ${l.text.lineHeight};
letter-spacing: ${l.text.letterSpacing};
color: ${l.text.colorHex};
text-align: ${l.text.align};`;
    }

    return `/* ${l.name} Dimensions & Position */
width: ${l.width}px;
height: ${l.height}px;
position: absolute;
left: ${l.left}px;
top: ${l.top}px;
opacity: ${(l.opacity / 100).toFixed(2)};${l.colorHex ? `\nbackground-color: ${l.colorHex};` : ''}`;
  };

  // Export layer as image
  const handleExportLayer = async (isLeafLiteOptimize = false) => {
    if (!selectedLayer) return;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, selectedLayer.width);
    canvas.height = Math.max(1, selectedLayer.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (selectedLayer.canvasDataUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          resolve();
        };
        img.src = selectedLayer.canvasDataUrl!;
      });
    } else {
      if (selectedLayer.type === 'text' && selectedLayer.text) {
        ctx.fillStyle = selectedLayer.text.colorHex;
        ctx.font = `${selectedLayer.text.fontWeight} ${selectedLayer.text.fontSize}px ${selectedLayer.text.fontFamily}`;
        ctx.fillText(selectedLayer.text.content.split('\n')[0], 10, selectedLayer.text.fontSize + 4);
      } else {
        ctx.fillStyle = selectedLayer.colorHex || '#10b981';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    const mime = exportFormat === 'PNG' ? 'image/png' : exportFormat === 'JPG' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mime, exportQuality / 100)
    );

    if (!blob) return;

    const ext = exportFormat.toLowerCase();
    const filename = `${selectedLayer.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_layer.${ext}`;

    if (!isLeafLiteOptimize) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      setIsOptimizing(true);
      setOptimizeResult(null);
      try {
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('target_format', exportFormat);
        formData.append('quality', exportQuality.toString());

        const res = await fetch(`${backendUrl}/api/tools/optimize-direct`, {
          method: 'POST',
          body: formData
        });

        if (!res.ok) throw new Error('Backend optimization request failed.');
        const data = await res.json();
        setOptimizeResult({
          originalSize: data.original_size_formatted || `${(blob.size / 1024).toFixed(1)} KB`,
          optimizedSize: data.optimized_size_formatted,
          savedPercent: data.saved_percent || 0,
          downloadUrl: `${backendUrl}${data.download_url}`,
          filename: data.download_filename || filename
        });
      } catch (err: any) {
        alert(`Optimization notice: ${err.message}. Triggering client-side download instead.`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setIsOptimizing(false);
      }
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none min-h-0 h-full">
      {/* ========================================================================= */}
      {/* 1. TOP APP BAR (Tools, Presets, Zoom, PSD Upload)                         */}
      {/* ========================================================================= */}
      <div className="w-full bg-[#111827] border-b border-slate-800 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white shadow-md font-black text-sm">
            Ps
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-100 truncate max-w-xs">{psdFileName}</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                {psdWidth} × {psdHeight} px
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {flatLayers.length} Layers
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls & Navigation Tools */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tool Mode: Inspect ↖️ vs Pan ✋ */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTool('select')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                activeTool === 'select'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Inspect & Select Layer (V)"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Inspect</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('hand')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                activeTool === 'hand'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Move & Pan Tool - Drag anywhere to move PSD (H / Spacebar)"
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Move / Pan</span>
            </button>

            {/* Guides Toggle Button */}
            <button
              type="button"
              onClick={() => setShowGuides((prev) => !prev)}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                showGuides
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Toggle Spacing Guides & Measurements"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>Guides</span>
            </button>
          </div>

          {/* Quick Fit & Jump Presets */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleFitWidth()}
              className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 font-semibold cursor-pointer"
              title="Fit PSD width to screen (Best for website mockups!)"
            >
              Fit Width
            </button>
            <button
              type="button"
              onClick={handleFitScreen}
              className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 font-semibold cursor-pointer"
              title="Fit entire PSD on screen"
            >
              Fit All
            </button>
            <button
              type="button"
              onClick={() => setZoom(1.0)}
              className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 font-semibold cursor-pointer"
              title="100% Actual Pixel Size"
            >
              100%
            </button>
            <button
              type="button"
              onClick={handleScrollToTop}
              className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 font-semibold cursor-pointer"
              title="Scroll to Top"
            >
              Top
            </button>
            <button
              type="button"
              onClick={handleScrollToBottom}
              className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 font-semibold cursor-pointer"
              title="Scroll to Bottom"
            >
              Bottom
            </button>
          </div>

          {/* Zoom In/Out & Slider */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.05, Number((z - 0.1).toFixed(2))))}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <span className="px-1.5 font-mono text-[11px] text-slate-300 font-bold min-w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>

            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <input
              type="range"
              min="0.05"
              max="2.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-14 sm:w-20 mx-1.5 accent-cyan-500 cursor-pointer"
              title="Zoom Slider"
            />
          </div>

          {/* Open PSD & Sample PSD */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".psd"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handlePsdUpload(e.target.files[0]);
              }
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-cyan-900/30 cursor-pointer"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>Open PSD</span>
          </button>

          <button
            type="button"
            onClick={loadSamplePsd}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Load demo template PSD"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Sample</span>
          </button>
        </div>
      </div>

      {/* Error notification banner */}
      {error && (
        <div className="bg-amber-950/80 border-b border-amber-800 px-4 py-2 text-xs text-amber-300 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-amber-400 hover:text-white p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. THREE-PANE MAIN WORKSPACE (Layers Tree | Scrollable Viewport | CSS)     */}
      {/* ========================================================================= */}
      <div className="w-full flex-1 flex flex-col lg:flex-row bg-[#0b0f19] relative overflow-hidden">
        {/* ----------------------------------------------------------------------- */}
        {/* LEFT DOCK: SEARCHABLE LAYER HIERARCHY TREE                              */}
        {/* ----------------------------------------------------------------------- */}
        <div className="w-full lg:w-72 bg-[#111827] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col h-56 lg:h-full select-none shrink-0">
          {/* Header & Layer Search */}
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Layers ({filteredFlatLayers.length})
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Click to Inspect</span>
            </div>

            {/* Search Filter Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={layerSearchQuery}
                onChange={(e) => setLayerSearchQuery(e.target.value)}
                placeholder="Filter layers (e.g. text, button)..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Scrollable Layer Tree List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredFlatLayers.map((layer) => {
              const isSelected = selectedLayerId === layer.id;
              const isHovered = hoveredLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  onClick={() => handleSelectLayer(layer.id)}
                  onMouseEnter={() => setHoveredLayerId(layer.id)}
                  onMouseLeave={() => setHoveredLayerId(null)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-cyan-950/90 border-cyan-500 text-white shadow-sm'
                      : isHovered
                      ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                      : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {layer.type === 'text' ? (
                      <Type className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    ) : layer.type === 'group' ? (
                      <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : layer.type === 'shape' ? (
                      <div
                        className="w-3 h-3 rounded-xs border border-white/20 shrink-0"
                        style={{ backgroundColor: layer.colorHex || '#3b82f6' }}
                      />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate font-medium">{layer.name}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => toggleLayerVisibility(layer.id, e)}
                    className="p-1 text-slate-400 hover:text-white transition-colors ml-1"
                    title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                  >
                    {layer.visible ? (
                      <Eye className="w-3.5 h-3.5 text-slate-300" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Quick Helper pill */}
          <div className="p-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Hand className="w-3.5 h-3.5 text-cyan-400" />
              <span>Drag to Pan • Mouse Wheel to Scroll</span>
            </span>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CENTER VIEWPORT: SCROLLABLE, PIXEL-PERFECT PSD COMPOSITE CANVAS         */}
        {/* ----------------------------------------------------------------------- */}
        <div
          ref={viewportRef}
          onPointerDown={handlePointerDownPan}
          onWheel={handleWheel}
          className={`flex-1 bg-[#080c14] overflow-auto relative select-none ${
            activeTool === 'hand' || isSpacePressed || isDraggingPan
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-default'
          }`}
          style={{ scrollBehavior: isDraggingPan ? 'auto' : 'smooth' }}
          data-bg="true"
        >
          {/* Scrollable Stage Wrapper */}
          <div
            className="min-w-full min-h-full flex items-start justify-center p-6 sm:p-10"
            data-bg="true"
            style={{ width: 'max-content', height: 'max-content' }}
          >
            {/* Canvas Wrapper with drop shadow and dimensions */}
            <div
              ref={canvasWrapperRef}
              className="relative shadow-2xl border border-slate-800 bg-[#0f172a] rounded-xs transition-transform duration-75 origin-top"
              style={{
                width: `${Math.round(psdWidth * zoom)}px`,
                height: `${Math.round(psdHeight * zoom)}px`,
                minWidth: `${Math.round(psdWidth * zoom)}px`,
                minHeight: `${Math.round(psdHeight * zoom)}px`
              }}
            >
              {/* 1. Crystal-Clear Pixel-Perfect Composite Image */}
              {compositeUrl ? (
                <img
                  src={compositeUrl}
                  alt="PSD Composite"
                  className="w-full h-full object-contain pointer-events-none select-none block"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono">
                  Rendering PSD Composite Preview...
                </div>
              )}

              {/* 2. Interactive SVG Layer Overlays */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-auto"
                style={{ width: `${Math.round(psdWidth * zoom)}px`, height: `${Math.round(psdHeight * zoom)}px` }}
              >
                {/* Clickable & Hoverable Layer Rectangles */}
                {flatLayers.map((layer) => {
                  if (!layer.visible) return null;
                  const isSelected = selectedLayerId === layer.id;
                  const isHovered = hoveredLayerId === layer.id;

                  const lX = layer.left * zoom;
                  const lY = layer.top * zoom;
                  const lW = layer.width * zoom;
                  const lH = layer.height * zoom;

                  return (
                    <g key={layer.id}>
                      <rect
                        x={lX}
                        y={lY}
                        width={Math.max(2, lW)}
                        height={Math.max(2, lH)}
                        fill={isHovered && !isSelected ? 'rgba(6, 182, 212, 0.12)' : 'transparent'}
                        stroke={isSelected ? '#06b6d4' : isHovered ? 'rgba(6, 182, 212, 0.6)' : 'transparent'}
                        strokeWidth={isSelected ? 2 : 1}
                        strokeDasharray={isSelected ? 'none' : '4 2'}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLayerId(layer.id);
                        }}
                        onMouseEnter={() => setHoveredLayerId(layer.id)}
                        onMouseLeave={() => setHoveredLayerId(null)}
                      />
                    </g>
                  );
                })}

                {/* Selected Layer Measurement Lines & Calipers (only if showGuides is true) */}
                {selectedLayer && showGuides && (
                  <g className="pointer-events-none">
                    {/* Selected Layer Outline Box */}
                    <rect
                      x={selectedLayer.left * zoom}
                      y={selectedLayer.top * zoom}
                      width={selectedLayer.width * zoom}
                      height={selectedLayer.height * zoom}
                      fill="rgba(6, 182, 212, 0.05)"
                      stroke="#06b6d4"
                      strokeWidth={2}
                    />

                    {/* Top Guide Line to Canvas Margin */}
                    <line
                      x1={(selectedLayer.left + selectedLayer.width / 2) * zoom}
                      y1={0}
                      x2={(selectedLayer.left + selectedLayer.width / 2) * zoom}
                      y2={selectedLayer.top * zoom}
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />

                    {/* Left Guide Line to Canvas Margin */}
                    <line
                      x1={0}
                      y1={(selectedLayer.top + selectedLayer.height / 2) * zoom}
                      x2={selectedLayer.left * zoom}
                      y2={(selectedLayer.top + selectedLayer.height / 2) * zoom}
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />

                    {/* Right Guide Line to Canvas Margin */}
                    <line
                      x1={(selectedLayer.left + selectedLayer.width) * zoom}
                      y1={(selectedLayer.top + selectedLayer.height / 2) * zoom}
                      x2={psdWidth * zoom}
                      y2={(selectedLayer.top + selectedLayer.height / 2) * zoom}
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />

                    {/* Bottom Guide Line to Canvas Margin */}
                    <line
                      x1={(selectedLayer.left + selectedLayer.width / 2) * zoom}
                      y1={(selectedLayer.top + selectedLayer.height) * zoom}
                      x2={(selectedLayer.left + selectedLayer.width / 2) * zoom}
                      y2={psdHeight * zoom}
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  </g>
                )}
              </svg>

              {/* Selected Layer Floating Badge */}
              {selectedLayer && (
                <div
                  className="absolute z-50 bg-cyan-500 text-slate-950 font-mono font-bold text-[10px] px-2 py-0.5 rounded shadow-lg pointer-events-none whitespace-nowrap"
                  style={{
                    left: `${selectedLayer.left * zoom}px`,
                    top: `${Math.max(0, selectedLayer.top * zoom - 24)}px`
                  }}
                >
                  {selectedLayer.name} • {selectedLayer.width} × {selectedLayer.height} px
                </div>
              )}
            </div>
          </div>

          {/* Bottom Floating Navigation Hint Bar */}
          <div className="sticky bottom-3 left-4 bg-slate-900/95 border border-slate-800 text-[11px] text-slate-400 px-3.5 py-1.5 rounded-lg flex items-center gap-3 w-fit shadow-xl backdrop-blur-xs select-none">
            <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Hand className="w-3.5 h-3.5 text-cyan-400" />
              <span>Space + Drag to Pan</span>
            </span>
            <span>•</span>
            <span>Mouse Wheel: Scroll</span>
            <span>•</span>
            <span>Ctrl + Wheel: Zoom</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* RIGHT DOCK: DEEP CSS & TYPOGRAPHY INSPECTOR + LAYER EXPORTER            */}
        {/* ----------------------------------------------------------------------- */}
        <div className="w-full lg:w-80 bg-[#111827] border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-72 lg:h-full overflow-y-auto select-none shrink-0 p-4 space-y-5">
          {selectedLayer ? (
            <>
              {/* Layer Title & Badge */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-6 h-6 rounded-md bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0">
                    {selectedLayer.type === 'text' ? 'T' : '■'}
                  </div>
                  <div className="truncate">
                    <h4 className="text-xs font-bold text-white truncate">{selectedLayer.name}</h4>
                    <span className="text-[10px] font-mono text-cyan-400 uppercase">
                      {selectedLayer.type} Layer
                    </span>
                  </div>
                </div>

                <span className="text-[10px] font-mono text-slate-400">
                  {selectedLayer.width} × {selectedLayer.height} px
                </span>
              </div>

              {/* 1. TEXT CONTENT & 1-CLICK EXTRACT (For Text Layers) */}
              {selectedLayer.type === 'text' && selectedLayer.text && (
                <div className="space-y-2 bg-slate-900/90 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-cyan-400" />
                      Extracted Text
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(selectedLayer.text!.content, 'text')}
                      className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {copiedType === 'text' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedType === 'text' ? 'Copied!' : 'Copy Text'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 break-words max-h-24 overflow-y-auto border border-slate-800">
                    {selectedLayer.text.content}
                  </div>
                </div>
              )}

              {/* 2. TYPOGRAPHY SPECIFICATIONS (If Text Layer) */}
              {selectedLayer.type === 'text' && selectedLayer.text && (
                <div className="space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-cyan-400" />
                    Typography Specs
                  </span>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                      <span className="text-[10px] text-slate-500 block">Font Family</span>
                      <span className="font-semibold text-slate-200 truncate block text-[11px]" title={selectedLayer.text.fontFamily}>
                        {selectedLayer.text.fontFamily.split(',')[0]}
                      </span>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                      <span className="text-[10px] text-slate-500 block">Font Size</span>
                      <span className="font-mono font-bold text-slate-200 text-[11px]">
                        {selectedLayer.text.fontSize}px
                      </span>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                      <span className="text-[10px] text-slate-500 block">Line Height</span>
                      <span className="font-mono font-bold text-slate-200 text-[11px]">
                        {selectedLayer.text.lineHeight}
                      </span>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                      <span className="text-[10px] text-slate-500 block">Letter Spacing</span>
                      <span className="font-mono font-bold text-slate-200 text-[11px]">
                        {selectedLayer.text.letterSpacing}
                      </span>
                    </div>
                  </div>

                  {/* Text Color Swatch */}
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded border border-white/20 shadow-xs"
                        style={{ backgroundColor: selectedLayer.text.colorHex }}
                      />
                      <span className="font-mono font-bold text-slate-200">
                        {selectedLayer.text.colorHex}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyText(selectedLayer.text!.colorHex, 'color')}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold"
                    >
                      {copiedType === 'color' ? 'Copied' : 'Copy Hex'}
                    </button>
                  </div>
                </div>
              )}

              {/* 3. EXACT DIMENSIONS & SPACING CALIPERS */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-cyan-400" />
                  Dimensions & Spacing
                </span>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg flex justify-between">
                    <span className="text-slate-500">W:</span>
                    <span className="text-slate-200 font-bold">{selectedLayer.width}px</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg flex justify-between">
                    <span className="text-slate-500">H:</span>
                    <span className="text-slate-200 font-bold">{selectedLayer.height}px</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg flex justify-between">
                    <span className="text-slate-500">X (Left):</span>
                    <span className="text-slate-200 font-bold">{selectedLayer.left}px</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg flex justify-between">
                    <span className="text-slate-500">Y (Top):</span>
                    <span className="text-slate-200 font-bold">{selectedLayer.top}px</span>
                  </div>
                </div>

                {/* Distances to Canvas Edges */}
                <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-lg text-[11px] font-mono space-y-1">
                  <div className="text-[10px] text-slate-400 font-sans font-semibold mb-1">
                    Distances to Canvas Edges:
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Top: {selectedLayer.top}px</span>
                    <span>Bottom: {psdHeight - (selectedLayer.top + selectedLayer.height)}px</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Left: {selectedLayer.left}px</span>
                    <span>Right: {psdWidth - (selectedLayer.left + selectedLayer.width)}px</span>
                  </div>
                </div>
              </div>

              {/* 4. READY-TO-USE CSS CODE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    CSS Properties
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(generateLayerCss(selectedLayer), 'css')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    {copiedType === 'css' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedType === 'css' ? 'Copied!' : 'Copy CSS'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 rounded-xl text-[11px] font-mono text-cyan-300/90 overflow-x-auto border border-slate-800 max-h-36">
                  {generateLayerCss(selectedLayer)}
                </pre>
              </div>

              {/* 5. EXPORT LAYER AS IMAGE (WEBP, PNG, JPG) */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  Export Layer Image
                </span>

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

                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleExportLayer(false)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-100 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-300" />
                    <span>Download Layer ({exportFormat})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportLayer(true)}
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

                {optimizeResult && (
                  <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-emerald-300">
                      <span>Optimized Successfully!</span>
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
                      Download Optimized File
                    </a>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center py-10 space-y-2">
              <Crosshair className="w-8 h-8 text-slate-600" />
              <p className="text-xs">No layer selected.</p>
              <p className="text-[11px] text-slate-600">
                Click any layer on the canvas or tree to inspect CSS, typography, and spacing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
