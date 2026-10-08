'use client';

import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Upload,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  FileArchive,
  RefreshCw,
  Sparkles,
  Zap,
  ArrowRightLeft,
  ExternalLink,
  Sliders,
  Check,
  Layers,
  Wrench,
  ShieldCheck,
  Maximize2,
  FileText,
  Gauge,
  FileCode,
  Code2,
  X
} from 'lucide-react';

import { ResizeTool } from '../components/ResizeTool';
import { PsdTool } from '../components/PsdTool';
import { PsdToHtmlTool } from '../components/PsdToHtmlTool';
import { KbReducerTool } from '../components/KbReducerTool';
import { PdfMergerTool } from '../components/PdfMergerTool';
import { QualityCheckerTool } from '../components/QualityCheckerTool';
import { DimensionsCheckerTool } from '../components/DimensionsCheckerTool';
import { ExifTool } from '../components/ExifTool';

type MainTab = 'compressor' | 'converter' | 'resize' | 'psd_studio' | 'psd_to_html' | 'more_tools';
type ExtraTool = 'kb_reducer' | 'pdf_merger' | 'quality_checker' | 'dimensions_checker' | 'exif_tool';
type OutputFormat = 'WEBP' | 'JPG' | 'PNG' | 'AVIF' | 'SVG';

interface UploadedFileItem {
  id: string;
  file: File;
  previewUrl: string;
  detectedFormat: string;
  sizeBytes: number;
}

interface ProcessedFileItem {
  id: string;
  originalName: string;
  download_filename: string;
  target_format: string;
  original_size: number;
  optimized_size: number;
  saved_percent: number;
  download_url?: string;
  blob?: Blob;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SUPPORTED_OUTPUTS: OutputFormat[] = ['WEBP', 'JPG', 'PNG', 'AVIF', 'SVG'];

export default function LeafLiteStudioPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('compressor');
  const [previousMainTab, setPreviousMainTab] = useState<MainTab>('compressor');
  const [selectedExtraTool, setSelectedExtraTool] = useState<ExtraTool>('kb_reducer');

  // File management (up to 10 images)
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [carouselIndex, setCarouselIndex] = useState<number>(0);
  const [targetFormat, setTargetFormat] = useState<OutputFormat>('WEBP');

  // Compressor options
  const [quality, setQuality] = useState<number>(80);
  const [compressConvertToWebp, setCompressConvertToWebp] = useState<boolean>(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Results & ZIP Modal
  const [processedResults, setProcessedResults] = useState<ProcessedFileItem[]>([]);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      files.forEach((f) => {
        try {
          URL.revokeObjectURL(f.previewUrl);
        } catch (_) {}
      });
    };
  }, []);

  const detectImageFormat = (file: File): string => {
    const ext = file.name.split('.').pop()?.toUpperCase() || '';
    if (ext === 'JPEG') return 'JPG';
    if (['JPG', 'PNG', 'WEBP', 'AVIF', 'GIF', 'BMP', 'SVG', 'HEIC'].includes(ext)) {
      return ext;
    }
    const type = file.type.toLowerCase();
    if (type.includes('webp')) return 'WEBP';
    if (type.includes('png')) return 'PNG';
    if (type.includes('jpeg') || type.includes('jpg')) return 'JPG';
    if (type.includes('avif')) return 'AVIF';
    if (type.includes('gif')) return 'GIF';
    if (type.includes('svg')) return 'SVG';
    return ext || 'UNKNOWN';
  };

  const adaptTargetFormat = (sourceFormat: string) => {
    if (sourceFormat === 'WEBP') {
      setTargetFormat('JPG');
    } else {
      setTargetFormat('WEBP');
    }
  };

  const handleAddFiles = (newFileList: FileList | File[]) => {
    setErrorMessage(null);
    const validFiles: UploadedFileItem[] = [];
    const list = Array.from(newFileList);

    const imageFiles = list.filter((f) => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|avif|gif|bmp|svg|heic)$/i.test(f.name));

    if (imageFiles.length === 0) {
      setErrorMessage('Please select valid image files (JPG, PNG, WebP, AVIF, GIF, etc.).');
      return;
    }

    const availableSlots = 10 - files.length;
    if (availableSlots <= 0) {
      setErrorMessage('You can upload up to 10 images at once. Clear or process current images first.');
      return;
    }

    const filesToTake = imageFiles.slice(0, availableSlots);
    if (imageFiles.length > availableSlots) {
      setErrorMessage(`Added ${availableSlots} images. Maximum 10 images allowed per batch.`);
    }

    filesToTake.forEach((file) => {
      const detected = detectImageFormat(file);
      validFiles.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        detectedFormat: detected,
        sizeBytes: file.size,
      });
    });

    const updated = [...files, ...validFiles];
    setFiles(updated);
    setProcessedResults([]);

    if (updated.length > 0) {
      adaptTargetFormat(updated[0].detectedFormat);
    }
  };

  const handleClearAll = () => {
    if (isProcessing) return;
    files.forEach((f) => {
      try {
        URL.revokeObjectURL(f.previewUrl);
      } catch (_) {}
    });
    setFiles([]);
    setCarouselIndex(0);
    setProcessedResults([]);
    setShowResultModal(false);
    setErrorMessage(null);
    setProgressPercent(0);
    setProgressText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveSingle = (idxToRemove: number) => {
    if (isProcessing) return;
    const fileToRemove = files[idxToRemove];
    if (fileToRemove) {
      try {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      } catch (_) {}
    }
    const updated = files.filter((_, idx) => idx !== idxToRemove);
    setFiles(updated);
    if (carouselIndex >= updated.length && updated.length > 0) {
      setCarouselIndex(updated.length - 1);
    }
    if (updated.length > 0) {
      adaptTargetFormat(updated[Math.min(carouselIndex, updated.length - 1)].detectedFormat);
    }
  };

  const currentFile = files[carouselIndex] || null;

  useEffect(() => {
    if (currentFile && currentFile.detectedFormat === targetFormat) {
      adaptTargetFormat(currentFile.detectedFormat);
    }
  }, [carouselIndex, currentFile]);

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const convertInBrowserCanvas = async (file: File, format: OutputFormat, qualityVal: number): Promise<{ blob: Blob; filename: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        if (format === 'JPG') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);

        let mime = 'image/webp';
        let ext = '.webp';
        if (format === 'JPG') {
          mime = 'image/jpeg';
          ext = '.jpg';
        } else if (format === 'PNG') {
          mime = 'image/png';
          ext = '.png';
        } else if (format === 'AVIF') {
          mime = 'image/avif';
          ext = '.avif';
        }

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
              resolve({
                blob,
                filename: `${baseName}_optimized${ext}`,
              });
            } else {
              canvas.toBlob(
                (fallbackBlob) => {
                  if (fallbackBlob) {
                    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                    resolve({
                      blob: fallbackBlob,
                      filename: `${baseName}_optimized.webp`,
                    });
                  } else {
                    reject(new Error('Failed to generate image blob'));
                  }
                },
                'image/webp',
                qualityVal / 100
              );
            }
          },
          mime,
          qualityVal / 100
        );
      };
      img.onerror = () => reject(new Error(`Failed to load ${file.name} for canvas processing`));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleStartProcessing = async () => {
    if (files.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setProcessedResults([]);
    setProgressPercent(5);
    setProgressText(`Starting ${activeTab === 'compressor' ? 'compression' : 'conversion'}...`);

    const results: ProcessedFileItem[] = [];
    const effectiveQuality = activeTab === 'compressor' ? quality : 85;

    try {
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        const stepNum = i + 1;
        setProgressText(`Processing image ${stepNum} of ${files.length}: ${item.file.name}`);
        setProgressPercent(Math.round((i / files.length) * 90) + 5);

        let effectiveTarget: OutputFormat = targetFormat;
        if (activeTab === 'compressor') {
          if (compressConvertToWebp) {
            effectiveTarget = 'WEBP';
          } else {
            const detected = item.detectedFormat.toUpperCase();
            effectiveTarget = ['JPG', 'JPEG'].includes(detected)
              ? 'JPG'
              : ['PNG', 'WEBP', 'AVIF', 'SVG'].includes(detected)
              ? (detected as OutputFormat)
              : 'JPG';
          }
        }

        let processedItem: ProcessedFileItem | null = null;

        try {
          const formData = new FormData();
          formData.append('file', item.file);
          formData.append('target_format', effectiveTarget);
          formData.append('quality', effectiveQuality.toString());

          const res = await fetch(`${BACKEND_URL}/upload`, {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            const uploadData = await res.json();
            const jid = uploadData.job_id;

            for (let attempts = 0; attempts < 25; attempts++) {
              await new Promise((r) => setTimeout(r, 200));
              const statusRes = await fetch(`${BACKEND_URL}/status/${jid}`);
              if (statusRes.ok) {
                const sData = await statusRes.json();
                if (sData.status === 'SUCCESS') {
                  const downloadRes = await fetch(`${BACKEND_URL}${sData.download_url}`);
                  const fileBlob = await downloadRes.blob();

                  processedItem = {
                    id: item.id,
                    originalName: item.file.name,
                    download_filename: sData.download_filename || `${item.file.name}_optimized.${effectiveTarget.toLowerCase()}`,
                    target_format: effectiveTarget,
                    original_size: sData.original_size || item.sizeBytes,
                    optimized_size: sData.optimized_size || fileBlob.size,
                    saved_percent: sData.saved_percent ?? Math.max(0, Math.round(((item.sizeBytes - fileBlob.size) / item.sizeBytes) * 100)),
                    download_url: sData.download_url,
                    blob: fileBlob,
                  };
                  break;
                }
              }
            }
          }
        } catch (serverErr) {
          console.warn('Backend API unavailable, falling back to local browser engine:', serverErr);
        }

        if (!processedItem) {
          const canvasRes = await convertInBrowserCanvas(item.file, effectiveTarget, effectiveQuality);
          const savedPct = Math.max(0, Math.round(((item.sizeBytes - canvasRes.blob.size) / item.sizeBytes) * 100));
          processedItem = {
            id: item.id,
            originalName: item.file.name,
            download_filename: canvasRes.filename,
            target_format: effectiveTarget,
            original_size: item.sizeBytes,
            optimized_size: canvasRes.blob.size,
            saved_percent: savedPct,
            blob: canvasRes.blob,
          };
        }

        results.push(processedItem);
      }

      setProgressPercent(100);
      setProgressText('All images processed successfully!');
      setProcessedResults(results);
      if (results.length > 0) {
        setShowResultModal(true);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while processing images.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAllZip = async () => {
    if (processedResults.length === 0 || isZipping) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();

      for (let i = 0; i < processedResults.length; i++) {
        const item = processedResults[i];
        let fileBlob = item.blob;

        if (!fileBlob && item.download_url) {
          const res = await fetch(`${BACKEND_URL}${item.download_url}`);
          fileBlob = await res.blob();
        }

        if (fileBlob) {
          zip.file(item.download_filename, fileBlob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);

      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = activeTab === 'compressor' ? 'leaflite_compressed_images.zip' : 'leaflite_converted_images.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(zipUrl);
    } catch (err: any) {
      setErrorMessage('Failed to generate ZIP. You can still download individual files below.');
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadSingle = (item: ProcessedFileItem) => {
    if (item.blob) {
      const url = URL.createObjectURL(item.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.download_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (item.download_url) {
      window.location.href = `${BACKEND_URL}${item.download_url}`;
    }
  };

  const switchMainTab = (tab: MainTab) => {
    setActiveTab(tab);
    if (tab !== 'more_tools') {
      setPreviousMainTab(tab);
    }
    setErrorMessage(null);
  };

  const toggleMoreTools = () => {
    if (activeTab === 'more_tools') {
      setActiveTab(previousMainTab);
    } else {
      setPreviousMainTab(activeTab);
      setActiveTab('more_tools');
    }
    setErrorMessage(null);
  };

  const closeMoreTools = () => {
    setActiveTab(previousMainTab);
    setErrorMessage(null);
  };

  const totalOriginalBytes = processedResults.reduce((acc, curr) => acc + curr.original_size, 0);
  const totalOptimizedBytes = processedResults.reduce((acc, curr) => acc + curr.optimized_size, 0);
  const overallSavedPercent = totalOriginalBytes > 0
    ? Math.round(((totalOriginalBytes - totalOptimizedBytes) / totalOriginalBytes) * 100)
    : 0;

  const isStudioMode = activeTab === 'resize' || activeTab === 'psd_studio' || activeTab === 'psd_to_html';

  return (
    <div className={`min-h-screen ${isStudioMode ? 'h-screen overflow-hidden bg-[#0b0f19]' : 'bg-[#fafbfc]'} text-slate-800 flex flex-col font-sans selection:bg-emerald-500 selection:text-white`}>
      {/* Top Navbar with LeafLite Branding */}
      <header className={`w-full border-b ${isStudioMode ? 'border-slate-800 bg-[#0d131f] text-white' : 'border-emerald-100/80 bg-white/95'} backdrop-blur-md sticky top-0 z-40 shrink-0`}>
        <div className={`${isStudioMode ? 'w-full px-4 sm:px-6' : 'max-w-5xl mx-auto px-4 sm:px-6'} h-14 sm:h-16 flex items-center justify-between`}>
          {/* LeafLite Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <span className="text-lg">🍃</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-extrabold tracking-tight ${isStudioMode ? 'text-white' : 'text-slate-900'}`}>
                Leaf<span className="text-emerald-500">Lite</span>
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                Studio
              </span>
            </div>
          </div>

          {/* Engine indicator & Docs link */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Engine Active (:8000)</span>
            </div>

            <a
              href={`${BACKEND_URL}/docs`}
              target="_blank"
              rel="noreferrer"
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${isStudioMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'} transition-colors border border-transparent hover:border-emerald-200`}
            >
              <span>API Docs</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {isStudioMode ? (
        <main className="flex-1 w-full flex flex-col overflow-hidden h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)] min-h-0 bg-[#0b0f19]">
          {/* Top Primary Tabs Bar in Studio Mode */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#0e1626] px-3 sm:px-6 py-1.5 select-none shrink-0 z-20">
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => switchMainTab('compressor')}
                className="px-3 sm:px-4 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all whitespace-nowrap cursor-pointer"
              >
                Compressor
              </button>

              <button
                type="button"
                onClick={() => switchMainTab('converter')}
                className="px-3 sm:px-4 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all whitespace-nowrap cursor-pointer"
              >
                Converter
              </button>

              <button
                type="button"
                onClick={() => switchMainTab('resize')}
                className={`px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'resize'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Resize (PS Canvas)</span>
              </button>

              <button
                type="button"
                onClick={() => switchMainTab('psd_studio')}
                className={`px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'psd_studio'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>PSD Studio</span>
              </button>

              <button
                type="button"
                onClick={() => switchMainTab('psd_to_html')}
                className={`px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'psd_to_html'
                    ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>PSD to HTML</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMoreTools}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-emerald-400" />
                <span>More Tools</span>
              </button>
            </div>
          </div>

          {/* Studio Workspace Content */}
          <div className="flex-1 w-full min-h-0 overflow-hidden flex flex-col">
            {activeTab === 'resize' && <ResizeTool backendUrl={BACKEND_URL} />}
            {activeTab === 'psd_studio' && <PsdTool backendUrl={BACKEND_URL} />}
            {activeTab === 'psd_to_html' && <PsdToHtmlTool backendUrl={BACKEND_URL} />}
          </div>
        </main>
      ) : (
        <main className="flex-1 w-full mx-auto px-4 py-6 sm:py-8 flex flex-col items-center transition-all duration-200 max-w-4xl">
        {/* Hero Section */}
        <section className="w-full text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-2.5 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Stateless High-Performance Image Optimization
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mb-2">
            {activeTab === 'compressor' ? (
              <>Compress <span className="text-emerald-600">Images</span></>
            ) : activeTab === 'converter' ? (
              <>Convert Image <span className="text-emerald-600">Formats</span></>
            ) : (
              <>Specialized <span className="text-emerald-600">LeafLite Tools</span></>
            )}
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
            {activeTab === 'more_tools'
              ? 'Target KB reducer, PDF merge, quality metrics, dimension inspection, and EXIF privacy tools.'
              : 'Fast, high-fidelity image processing. Drop up to 10 images at once, auto-detect formats, and download all in a ZIP file.'}
          </p>
        </section>

        {/* ========================================================================= */}
        {/* MAIN TOOL CARD                                                            */}
        {/* ========================================================================= */}
        <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-md shadow-slate-100/80 overflow-hidden mb-8">
          {/* Top Primary Tabs Bar: Compressor | Converter | Resize | PSD Studio | More Tools */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#fbfcfd] px-4 pt-2">
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => switchMainTab('compressor')}
                className={`px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                  activeTab === 'compressor'
                    ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Compressor
              </button>

              <button
                type="button"
                onClick={() => switchMainTab('converter')}
                className={`px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                  activeTab === 'converter'
                    ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Converter
              </button>

              {/* Resize Tab Added Right in Main Top Tabs! */}
              <button
                type="button"
                onClick={() => switchMainTab('resize')}
                className="px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap border-transparent text-slate-500 hover:text-slate-800"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Resize (PS Canvas)</span>
              </button>

              {/* PSD Studio Tab (Shown right after Resize) */}
              <button
                type="button"
                onClick={() => switchMainTab('psd_studio')}
                className="px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap border-transparent text-slate-500 hover:text-slate-800"
              >
                <FileCode className="w-3.5 h-3.5 text-cyan-600" />
                <span>PSD Studio</span>
              </button>

              {/* PSD to HTML Tab */}
              <button
                type="button"
                onClick={() => switchMainTab('psd_to_html')}
                className="px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap border-transparent text-slate-500 hover:text-slate-800"
              >
                <Code2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>PSD to HTML</span>
              </button>
            </div>

            {/* More Tools Toggle with Cross / Close Icon */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMoreTools}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'more_tools'
                    ? 'bg-emerald-100/90 text-emerald-950 font-bold border border-emerald-300 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {activeTab === 'more_tools' ? (
                  <>
                    <X className="w-3.5 h-3.5 text-emerald-800" />
                    <span>Close Tools</span>
                  </>
                ) : (
                  <>
                    <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                    <span>More Tools</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Secondary Tabs Row when 'More Tools' is Open */}
          {activeTab === 'more_tools' && (
            <div className="w-full bg-slate-50/80 border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between gap-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: 'kb_reducer' as ExtraTool, label: 'Target KB Reducer' },
                  { id: 'pdf_merger' as ExtraTool, label: 'PDF Merger' },
                  { id: 'quality_checker' as ExtraTool, label: 'Quality Checker' },
                  { id: 'dimensions_checker' as ExtraTool, label: 'Dimensions Inspector' },
                  { id: 'exif_tool' as ExtraTool, label: 'EXIF Metadata Tool' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedExtraTool(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedExtraTool === t.id
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-200/80 border border-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Distinct cross icon to close the More Tools view and return */}
              <button
                type="button"
                onClick={closeMoreTools}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors shrink-0 ml-2"
                title="Close More Tools (Return to main tool)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Card Body */}
          <div className="p-6 sm:p-8 flex flex-col items-center">
            {activeTab === 'more_tools' ? (
              /* More Tools Components */
              <div className="w-full text-left">
                {selectedExtraTool === 'kb_reducer' && <KbReducerTool backendUrl={BACKEND_URL} />}
                {selectedExtraTool === 'pdf_merger' && <PdfMergerTool backendUrl={BACKEND_URL} />}
                {selectedExtraTool === 'quality_checker' && <QualityCheckerTool backendUrl={BACKEND_URL} />}
                {selectedExtraTool === 'dimensions_checker' && <DimensionsCheckerTool backendUrl={BACKEND_URL} />}
                {selectedExtraTool === 'exif_tool' && <ExifTool backendUrl={BACKEND_URL} />}
              </div>
            ) : (
              /* Core Compressor & Converter Simple Experience */
              <>
                {/* Top Action Buttons: SELECT FILES & CLEAR */}
                <div className="flex items-center justify-center gap-3 mb-6 w-full">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.heic,.heif,.webp,.avif,.png,.jpg,.jpeg,.svg,.bmp,.gif"
                    onChange={(e) => {
                      if (e.target.files) handleAddFiles(e.target.files);
                    }}
                    className="hidden"
                    id="file-upload-input"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-sm uppercase tracking-wide transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>SELECT FILES</span>
                    {files.length > 0 && (
                      <span className="bg-emerald-800 text-emerald-100 text-[11px] px-2 py-0.5 rounded-full ml-1">
                        {files.length}/10
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAll}
                    disabled={isProcessing || files.length === 0}
                    className="bg-rose-500 hover:bg-rose-600 active:scale-[0.98] text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-sm uppercase tracking-wide transition-all disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>CLEAR</span>
                  </button>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div className="w-full max-w-lg mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Drop Zone & Carousel Preview Area */}
                <div className="w-full relative flex items-center justify-center my-2">
                  {/* Left Carousel Arrow */}
                  <button
                    type="button"
                    onClick={() => setCarouselIndex((prev) => Math.max(0, prev - 1))}
                    disabled={carouselIndex === 0 || files.length === 0}
                    className="absolute -left-2 sm:-left-4 z-20 p-2 text-slate-400 hover:text-emerald-600 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors cursor-pointer"
                    title="Previous image"
                  >
                    <ChevronLeft className="w-8 h-8 sm:w-10 sm:h-10 stroke-[2.5]" />
                  </button>

                  {/* Right Carousel Arrow */}
                  <button
                    type="button"
                    onClick={() => setCarouselIndex((prev) => Math.min(files.length - 1, prev + 1))}
                    disabled={carouselIndex >= files.length - 1 || files.length === 0}
                    className="absolute -right-2 sm:-right-4 z-20 p-2 text-slate-400 hover:text-emerald-600 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors cursor-pointer"
                    title="Next image"
                  >
                    <ChevronRight className="w-8 h-8 sm:w-10 sm:h-10 stroke-[2.5]" />
                  </button>

                  {/* Empty Dropzone OR Image Preview Card */}
                  {files.length === 0 ? (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files) handleAddFiles(e.dataTransfer.files);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full max-w-xl h-44 sm:h-52 border-2 border-dashed border-emerald-200 bg-[#f4fbf7]/60 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-all p-4 text-center"
                    >
                      <Upload className="w-7 h-7 text-emerald-500/80 mb-1" />
                      <p className="text-sm font-bold text-emerald-800">Drop Your Files Here</p>
                      <p className="text-xs text-slate-500">or click to browse from device (up to 10 images)</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      {/* Image Preview Card */}
                      <div className="w-48 sm:w-56 h-48 sm:h-56 rounded-xl border border-slate-300 shadow-sm overflow-hidden relative flex flex-col bg-white">
                        {/* Top bar with filename & remove button */}
                        <div className="bg-slate-800/90 backdrop-blur-xs text-white px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono z-10">
                          <span className="truncate max-w-[140px]" title={currentFile.file.name}>
                            {currentFile.file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSingle(carouselIndex)}
                            className="text-slate-300 hover:text-white p-0.5 rounded transition-colors"
                            title="Remove this image"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Thumbnail with Transparency Checkerboard */}
                        <div className="flex-1 checkerboard-bg flex items-center justify-center relative overflow-hidden p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={currentFile.previewUrl}
                            alt={currentFile.file.name}
                            className="max-h-full max-w-full object-contain pointer-events-none drop-shadow-xs"
                          />

                          {/* Large detected format badge overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-xl sm:text-2xl font-black text-slate-800 tracking-wider bg-white/80 backdrop-blur-xs px-3 py-1 rounded-lg shadow-sm border border-slate-200">
                              {currentFile.detectedFormat}
                            </span>
                          </div>
                        </div>

                        {/* File Size */}
                        <div className="bg-slate-50 text-slate-500 text-[10px] text-center py-1 border-t border-slate-200 font-medium">
                          {formatFileSize(currentFile.sizeBytes)}
                        </div>
                      </div>

                      {/* Carousel Pager indicator */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <span>Image {carouselIndex + 1} of {files.length}</span>
                        <span className="text-slate-300">•</span>
                        <span>Total {files.length} selected</span>
                      </div>

                      {/* Mini thumbnails strip */}
                      {files.length > 1 && (
                        <div className="flex items-center gap-1.5 max-w-md overflow-x-auto py-1 px-2">
                          {files.map((f, idx) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setCarouselIndex(idx)}
                              className={`w-8 h-8 rounded border overflow-hidden shrink-0 transition-all ${
                                idx === carouselIndex
                                  ? 'ring-2 ring-emerald-500 border-emerald-500 scale-105'
                                  : 'opacity-60 hover:opacity-100 border-slate-200'
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={f.previewUrl} alt="thumb" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Compressor Quality Controls */}
                {activeTab === 'compressor' && files.length > 0 && (
                  <div className="w-full max-w-lg mt-4 mb-2 p-4 bg-emerald-50/40 border border-emerald-100 rounded-xl flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Compression Quality:</span>
                      <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        {quality}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <button type="button" onClick={() => setQuality(60)} className="hover:text-emerald-700">
                        Max Compress (60%)
                      </button>
                      <button type="button" onClick={() => setQuality(80)} className="hover:text-emerald-700 font-bold text-emerald-700">
                        Balanced (80%)
                      </button>
                      <button type="button" onClick={() => setQuality(92)} className="hover:text-emerald-700">
                        High Quality (92%)
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom Controls Bar & Action Button */}
                <div className="w-full max-w-lg mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4">
                  {activeTab === 'compressor' ? (
                    /* WebP Toggle Button for Compressor (No format pills) */
                    <button
                      type="button"
                      onClick={() => setCompressConvertToWebp((prev) => !prev)}
                      className={`inline-flex items-center gap-3 px-4 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-all shadow-2xs cursor-pointer select-none ${
                        compressConvertToWebp
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div
                        className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                          compressConvertToWebp ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform duration-200 transform ${
                            compressConvertToWebp ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="leading-tight">Convert to WebP</span>
                        <span className="text-[10px] font-normal text-slate-500">
                          {compressConvertToWebp ? 'ON (Max compression)' : 'OFF (Keep original format)'}
                        </span>
                      </div>
                    </button>
                  ) : (
                    /* Format Pills: WEBP, JPG, PNG, AVIF, SVG (Only in Converter tab) */
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 shadow-2xs">
                      {SUPPORTED_OUTPUTS.map((fmt) => {
                        const isSourceFormat = currentFile && currentFile.detectedFormat === fmt;
                        const isSelected = targetFormat === fmt && !isSourceFormat;

                        return (
                          <button
                            key={fmt}
                            type="button"
                            disabled={isSourceFormat || isProcessing}
                            onClick={() => setTargetFormat(fmt)}
                            title={isSourceFormat ? `Image is already ${fmt}` : `Convert to ${fmt}`}
                            className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all ${
                              isSourceFormat
                                ? 'text-slate-300 bg-transparent cursor-not-allowed line-through'
                                : isSelected
                                ? 'bg-slate-800 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          >
                            {fmt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* CONVERT / COMPRESS Action Button */}
                  <button
                    type="button"
                    onClick={handleStartProcessing}
                    disabled={files.length === 0 || isProcessing}
                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-sm uppercase tracking-wide transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Zap className="w-4 h-4 text-emerald-200 fill-emerald-200" />
                    )}
                    <span>{activeTab === 'compressor' ? 'COMPRESS' : 'CONVERT'}</span>
                    {files.length > 0 && (
                      <span className="bg-emerald-800 text-emerald-100 text-[11px] px-2 py-0.5 rounded-full ml-0.5">
                        {files.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Progress Bar */}
                {isProcessing && (
                  <div className="w-full max-w-lg mt-6">
                    <div className="flex items-center justify-between text-xs text-slate-600 font-semibold mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        <span>{progressText}</span>
                      </span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Compact Results Status Pill in Main Card (No lower page stretch) */}
                {processedResults.length > 0 && !isProcessing && (
                  <div className="w-full max-w-lg mt-5 p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-2 text-emerald-950 font-semibold truncate">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        {processedResults.length} {processedResults.length === 1 ? 'image' : 'images'} ready ({overallSavedPercent}% saved)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleDownloadAllZip}
                        disabled={isZipping}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        {isZipping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
                        <span>.ZIP</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowResultModal(true)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg border border-slate-300 transition-colors shadow-2xs cursor-pointer"
                      >
                        View Results Popup
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      )}

      {/* ========================================================================= */}
      {/* RESULTS POPUP MODAL                                                       */}
      {/* ========================================================================= */}
      {showResultModal && processedResults.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowResultModal(false);
          }}
        >
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Optimization Complete
                  </h3>
                  <p className="text-xs text-slate-500">
                    All {processedResults.length} {processedResults.length === 1 ? 'image' : 'images'} successfully processed
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowResultModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Savings Summary Banner */}
              <div className="p-4 bg-emerald-50/90 border border-emerald-200/90 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-emerald-950">
                    Total File Size Savings
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    {formatFileSize(totalOriginalBytes)} → {formatFileSize(totalOptimizedBytes)}{' '}
                    {overallSavedPercent > 0 && (
                      <span className="font-extrabold text-emerald-800">(-{overallSavedPercent}%)</span>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadAllZip}
                  disabled={isZipping}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  {isZipping ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileArchive className="w-4 h-4" />
                  )}
                  <span>Download All (.ZIP)</span>
                </button>
              </div>

              {/* Individual Converted Files List */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Individual Download Files:
                </p>

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {processedResults.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-xl flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0 border border-emerald-200">
                          {item.target_format}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-semibold text-slate-800 truncate" title={item.download_filename}>
                            {item.download_filename}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatFileSize(item.original_size)} → {formatFileSize(item.optimized_size)}{' '}
                            {item.saved_percent > 0 && (
                              <span className="font-bold text-emerald-600">(-{item.saved_percent}%)</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDownloadSingle(item)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-200/80 active:scale-95 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>Download</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResultModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={isZipping}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {isZipping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
                <span>Download All (.ZIP)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LeafLite Footer (Hidden in Studio Mode for 100% full-screen canvas view) */}
      {!isStudioMode && (
        <footer className="w-full border-t border-slate-200/80 bg-white py-6 text-xs text-slate-500">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">LeafLite Studio</span>
              <span className="text-slate-300">•</span>
              <span>Stateless Image Optimization & Conversion Engine</span>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <a href={`${BACKEND_URL}/docs`} target="_blank" rel="noreferrer" className="hover:text-emerald-600">
                Interactive API Docs
              </a>
              <span>Port 3000 & 8000</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
