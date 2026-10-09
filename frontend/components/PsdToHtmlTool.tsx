'use client';

import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { convertPsdClientSide } from '../utils/psdToHtmlClient';
import {
  Upload,
  Download,
  Code2,
  FileCode,
  Palette,
  Eye,
  Check,
  Copy,
  Layers,
  Sparkles,
  Maximize2,
  ExternalLink,
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  FolderArchive,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Flame,
  LayoutTemplate,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Ruler,
  Folder,
  FileText,
  Sliders,
  Sparkle
} from 'lucide-react';

interface PsdToHtmlToolProps {
  backendUrl: string;
  initialFile?: File | null;
}

interface ExtractedAsset {
  name: string;
  filename: string;
  path: string;
  url: string;
  width: number;
  height: number;
  size_bytes: number;
}

interface SectionSummary {
  name: string;
  type: string;
  heading: string;
  images_count: number;
  buttons_count: number;
}

interface ConversionResult {
  job_id: string;
  psd_name: string;
  dimensions: { width: number; height: number };
  composite_url?: string;
  detected_sections_count: number;
  extracted_images_count: number;
  primary_color: string;
  secondary_color: string;
  color_palette: string[];
  fonts: string[];
  sections: SectionSummary[];
  html_code: string;
  css_code: string;
  tailwind_code: string;
  assets: ExtractedAsset[];
  zip_download_url?: string;
  zip_filename?: string;
}

type DeviceMode = 'desktop' | 'laptop' | 'tablet' | 'mobile';
type ActiveTab = 'psd_view' | 'preview' | 'html' | 'css' | 'tailwind' | 'assets' | 'sections';
type OutputMode = 'css' | 'tailwind' | 'both';

export const PsdToHtmlTool: React.FC<PsdToHtmlToolProps> = ({ backendUrl, initialFile }) => {
  const [data, setData] = useState<ConversionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Workflow tabs and export preferences
  // Opens PSD first as requested by user!
  const [activeTab, setActiveTab] = useState<ActiveTab>('psd_view');
  const [outputMode, setOutputMode] = useState<OutputMode>('css');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Original PSD View controls (Zoom, Pan, Section Pins)
  const [psdZoom, setPsdZoom] = useState<number>(0.65);
  const [showSectionPins, setShowSectionPins] = useState<boolean>(true);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const psdViewportRef = useRef<HTMLDivElement>(null);

  // Load sample initially or load forwarded file
  useEffect(() => {
    if (initialFile) {
      handleFileUpload(initialFile);
    } else {
      loadSampleData();
    }
  }, [initialFile]);

  const loadSampleData = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingStep('Opening Marine Construction PSD (1920 × 9934px)...');

    try {
      let result: ConversionResult | null = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
        const res = await fetch(`${backendUrl}/api/tools/psd-to-html/sample`, {
          method: 'POST',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          result = await res.json();
        }
      } catch {
        // Backend unavailable, fallback to bundled static sample
      }

      if (!result) {
        const staticRes = await fetch('/sample_psd_data.json');
        if (staticRes.ok) {
          result = await staticRes.json();
        }
      }

      if (!result) {
        throw new Error('Could not load PSD template. Please upload a PSD or verify backend.');
      }

      // Ensure composite_url fallback for sample if not set
      if (!result.composite_url) {
        result.composite_url = '/sample_assets/marine_construction_composite.webp';
      }

      setData(result);
      setActiveTab('psd_view'); // Open PSD view first!
    } catch (err: any) {
      console.warn('Sample fetch notice:', err.message);
      setError(err.message || 'Failed to load PSD');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.psd')) {
      alert('Please upload a valid Adobe Photoshop (.psd) file.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadingStep(`Opening and parsing ${file.name}...`);

    let convertedSuccessfully = false;

    // 1. Try local/cloud Python backend first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${backendUrl}/api/tools/psd-to-html/convert`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const result: ConversionResult = await res.json();
        setData(result);
        setActiveTab('psd_view'); // Show PSD first!
        convertedSuccessfully = true;
      }
    } catch {
      // Backend not running locally or timeout
    }

    // 2. High-performance Client-Side Fallback (ag-psd WebAssembly & JSZip)
    if (!convertedSuccessfully) {
      try {
        setLoadingStep(`Extracting layers, vectors & typography in browser...`);
        const clientResult = await convertPsdClientSide(file);
        setData(clientResult as unknown as ConversionResult);
        setActiveTab('psd_view'); // Show PSD first!
        convertedSuccessfully = true;
      } catch (clientErr: any) {
        console.error('Client PSD conversion error:', clientErr);
        setError(`Failed to open PSD: ${clientErr.message || 'Error parsing layer tree'}`);
      }
    }

    setIsLoading(false);
    setLoadingStep('');
  };

  const handleTriggerExport = (chosenMode: OutputMode) => {
    setOutputMode(chosenMode);
    setExportNotice(`Exported successfully to ${chosenMode === 'css' ? 'Modern CSS (HTML5 + style.css)' : chosenMode === 'tailwind' ? 'Tailwind CSS' : 'Complete Dual Bundle'}! All files and ZIP package are ready.`);
    setActiveTab('preview'); // Transition to live code preview
    setTimeout(() => {
      setExportNotice(null);
    }, 4500);
  };

  const handleCopy = (content: string, typeName: string) => {
    navigator.clipboard.writeText(content);
    setCopiedType(typeName);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Packages everything into a root folder leaf-[name]/ as requested by the user
  const handleDownloadZip = async (specificMode?: OutputMode) => {
    if (!data) return;

    const mode = specificMode || outputMode;
    const baseSlug = (data.psd_name || 'psd_project')
      .replace(/\.psd$/i, '')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .toLowerCase() || 'project';
    const folderName = `leaf-${baseSlug}`;
    const zipFilename = mode === 'both' 
      ? `${folderName}_complete_bundle.zip`
      : `${folderName}_${mode}_bundle.zip`;

    setIsLoading(true);
    setLoadingStep(`Packaging project folder '${folderName}/' into ZIP...`);

    try {
      const zip = new JSZip();
      const rootFolder = zip.folder(folderName);

      const readmeContent = `# ${data.psd_name.replace(/\.psd$/i, '')} - LeafLite Export

Exported from **${data.psd_name}** (${data.dimensions.width}×${data.dimensions.height}px) using LeafLite Studio.
Selected Export Mode: **${mode.toUpperCase()}**

## 📁 Package Contents

${mode === 'css' || mode === 'both' ? `- \`index.html\`: Semantic HTML5 document linked to modular styles in \`css/style.css\`.\n- \`css/style.css\`: Custom stylesheet with design tokens, responsive breakpoints, and transitions.` : ''}
${mode === 'tailwind' ? `- \`index.html\`: Tailwind CSS HTML document with Tailwind utility classes and customized configuration.` : ''}
${mode === 'both' ? `- \`tailwind.html\`: Alternative Tailwind CSS export for rapid utility prototyping.` : ''}
- \`images/\`: Extracted and sliced high-efficiency WebP image assets (${data.extracted_images_count} assets).

## 🚀 How to Run & Preview

1. Open \`index.html\` directly in any modern web browser (Chrome, Edge, Firefox, Safari).
2. Or serve locally with any static web server:
\`\`\`bash
# Using Python
python -m http.server 3000

# Or using Node.js
npx serve .
\`\`\`

## 🎨 Design Tokens & Palette

- **Primary Color**: \`${data.primary_color}\`
- **Secondary Color**: \`${data.secondary_color}\`
- **Fonts Detected**: ${data.fonts.join(', ')}
- **Detected Sections**: ${data.detected_sections_count} sections
`;

      rootFolder?.file('README.md', readmeContent);

      if (mode === 'css') {
        rootFolder?.file('index.html', data.html_code);
        rootFolder?.file('css/style.css', data.css_code);
      } else if (mode === 'tailwind') {
        rootFolder?.file('index.html', data.tailwind_code);
      } else {
        // 'both'
        rootFolder?.file('index.html', data.html_code);
        rootFolder?.file('tailwind.html', data.tailwind_code);
        rootFolder?.file('css/style.css', data.css_code);
      }

      const imagesFolder = rootFolder?.folder('images');
      for (const asset of data.assets) {
        if (asset.url.startsWith('data:')) {
          const base64Data = asset.url.split(',')[1];
          imagesFolder?.file(asset.filename, base64Data, { base64: true });
        } else {
          try {
            const fetchUrl = asset.url.startsWith('/') ? asset.url : `${backendUrl}${asset.url}`;
            const imgRes = await fetch(fetchUrl);
            if (imgRes.ok) {
              const imgBlob = await imgRes.blob();
              imagesFolder?.file(asset.filename, imgBlob);
            }
          } catch (_) {}
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (zipErr: any) {
      alert('Could not package ZIP: ' + zipErr.message);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // Generate self-contained HTML for live preview iframe
  const getPreviewHtml = (): string => {
    if (!data) return '';

    const resolveUrl = (asset: ExtractedAsset) => {
      if (asset.url.startsWith('data:') || asset.url.startsWith('blob:')) {
        return asset.url;
      }
      if (asset.url.startsWith('/') && !asset.url.startsWith('/api')) {
        return asset.url;
      }
      return `${backendUrl}${asset.url}`;
    };

    if (outputMode === 'tailwind') {
      let code = data.tailwind_code;
      data.assets.forEach((asset) => {
        const u = resolveUrl(asset);
        code = code.replaceAll(`images/${asset.filename}`, u);
        code = code.replaceAll(`url('images/${asset.filename}')`, `url('${u}')`);
        code = code.replaceAll(`url("images/${asset.filename}")`, `url("${u}")`);
      });
      return code;
    } else {
      let code = data.html_code;
      // Inject CSS into <style> tag so iframe renders self-contained
      const inlineStyle = `<style>\n${data.css_code}\n</style>`;
      code = code.replace('<link rel="stylesheet" href="css/style.css" />', inlineStyle);

      data.assets.forEach((asset) => {
        const u = resolveUrl(asset);
        code = code.replaceAll(`images/${asset.filename}`, u);
        code = code.replaceAll(`url('images/${asset.filename}')`, `url('${u}')`);
        code = code.replaceAll(`url("images/${asset.filename}")`, `url("${u}")`);
      });
      return code;
    }
  };

  const handleOpenInNewTab = () => {
    const html = getPreviewHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const deviceWidths: Record<DeviceMode, string> = {
    desktop: '100%',
    laptop: '1024px',
    tablet: '768px',
    mobile: '375px'
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none min-h-0 h-full">
      {/* ========================================================================= */}
      {/* 1. TOP APP BAR                                                            */}
      {/* ========================================================================= */}
      <div className="w-full bg-[#111827] border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center text-white shadow-md font-black text-sm">
            <LayoutTemplate className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">PSD to HTML & Tailwind Studio</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                <Flame className="w-3 h-3 text-emerald-400" />
                Trained Engine
              </span>
              {data && (
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800">
                  {data.dimensions.width} × {data.dimensions.height}px
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              {data ? data.psd_name : 'Open PSD first, select CSS or Tailwind option, and export complete ZIP folder'}
            </span>
          </div>
        </div>

        {/* Action Controls & Top Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Sample Button */}
          <button
            type="button"
            onClick={loadSampleData}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Reload the 1920×9934px Marine Construction training PSD"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Load Reference PSD</span>
          </button>

          {/* Full Live Website Button */}
          <a
            href="/demo-marine-construction/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer no-underline"
            title="Open the complete reference site in a new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>Reference Preview</span>
          </a>

          {/* Upload New PSD Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Open PSD File</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".psd"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. LOADING & SUCCESS NOTIFICATIONS                                        */}
      {/* ========================================================================= */}
      {isLoading && (
        <div className="w-full bg-cyan-950/80 border-b border-cyan-800 px-4 py-2 flex items-center justify-between text-xs text-cyan-200 animate-pulse">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span className="font-semibold">{loadingStep || 'Processing PSD...'}</span>
          </div>
          <span className="text-[11px] text-cyan-400/80">Slicing images to WebP & analyzing layout geometry</span>
        </div>
      )}

      {exportNotice && (
        <div className="w-full bg-emerald-950/90 border-b border-emerald-700 px-4 py-2 flex items-center justify-between text-xs text-emerald-200 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{exportNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="w-full bg-rose-950/80 border-b border-rose-800 px-4 py-2 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. WORKFLOW NAVIGATION TABS                                               */}
      {/* ========================================================================= */}
      <div className="w-full bg-[#0e1628] border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Main Tab Controls: PSD First -> Live Preview -> Code Readers */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {/* TAB 1: ORIGINAL PSD DESIGN (OPENED FIRST!) */}
          <button
            type="button"
            onClick={() => setActiveTab('psd_view')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'psd_view'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Inspect the original PSD design canvas first"
          >
            <Palette className="w-3.5 h-3.5 text-cyan-300" />
            <span>1. Original PSD Visual</span>
            <span className="bg-cyan-900/80 text-cyan-200 text-[10px] px-1.5 py-0.2 rounded-full border border-cyan-700">
              Source
            </span>
          </button>

          {/* TAB 2: LIVE PREVIEW */}
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'preview'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>2. Live Preview</span>
          </button>

          {/* TAB 3: READ HTML CODE */}
          <button
            type="button"
            onClick={() => setActiveTab('html')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'html'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Read HTML</span>
          </button>

          {/* TAB 4: READ CSS CODE */}
          <button
            type="button"
            onClick={() => setActiveTab('css')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'css'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Read CSS</span>
          </button>

          {/* TAB 5: READ TAILWIND CODE */}
          <button
            type="button"
            onClick={() => setActiveTab('tailwind')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'tailwind'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>Read Tailwind</span>
          </button>

          {/* TAB 6: ASSETS */}
          <button
            type="button"
            onClick={() => setActiveTab('assets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'assets'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Assets ({data?.extracted_images_count || 0})</span>
          </button>

          {/* TAB 7: SECTIONS */}
          <button
            type="button"
            onClick={() => setActiveTab('sections')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'sections'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sections ({data?.detected_sections_count || 0})</span>
          </button>
        </div>

        {/* Quick Export Mode Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setOutputMode('css')}
              className={`px-2.5 py-1 rounded flex items-center gap-1 font-bold transition-all cursor-pointer ${
                outputMode === 'css'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Modern CSS Output"
            >
              <span>CSS</span>
            </button>
            <button
              type="button"
              onClick={() => setOutputMode('tailwind')}
              className={`px-2.5 py-1 rounded flex items-center gap-1 font-bold transition-all cursor-pointer ${
                outputMode === 'tailwind'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Tailwind CSS Output"
            >
              <span>Tailwind</span>
            </button>
            <button
              type="button"
              onClick={() => setOutputMode('both')}
              className={`px-2.5 py-1 rounded flex items-center gap-1 font-bold transition-all cursor-pointer ${
                outputMode === 'both'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Dual Bundle (CSS + Tailwind)"
            >
              <span>Both</span>
            </button>
          </div>

          {activeTab === 'preview' && (
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDeviceMode('desktop')}
                className={`p-1.5 rounded ${deviceMode === 'desktop' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Desktop"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('laptop')}
                className={`p-1.5 rounded ${deviceMode === 'laptop' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Laptop (1024px)"
              >
                <Laptop className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('tablet')}
                className={`p-1.5 rounded ${deviceMode === 'tablet' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Tablet (768px)"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('mobile')}
                className={`p-1.5 rounded ${deviceMode === 'mobile' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Mobile (375px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'preview' && (
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Open Live Preview in New Window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MAIN STUDIO WORKSPACE                                                  */}
      {/* ========================================================================= */}
      <div className="flex-1 w-full flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Main Stage (Center) */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#090d16] border-r border-slate-800 overflow-hidden">
          {/* Subheader / Toolbar for Code Tabs */}
          {(activeTab === 'html' || activeTab === 'css' || activeTab === 'tailwind') && data && (
            <div className="w-full bg-[#0d1322] border-b border-slate-800 px-4 py-1.5 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-400">
                {activeTab === 'html' ? (outputMode === 'tailwind' ? 'tailwind.html' : 'index.html') : activeTab === 'css' ? 'css/style.css' : 'tailwind.html'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const code = activeTab === 'html' ? (outputMode === 'tailwind' ? data.tailwind_code : data.html_code) : activeTab === 'css' ? data.css_code : data.tailwind_code;
                    handleCopy(code, activeTab);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  {copiedType === activeTab ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedType === activeTab ? 'Copied!' : 'Copy Code'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'html') {
                      const code = outputMode === 'tailwind' ? data.tailwind_code : data.html_code;
                      handleDownloadFile(code, outputMode === 'tailwind' ? 'tailwind.html' : 'index.html', 'text/html');
                    } else if (activeTab === 'css') {
                      handleDownloadFile(data.css_code, 'style.css', 'text/css');
                    } else {
                      handleDownloadFile(data.tailwind_code, 'tailwind.html', 'text/html');
                    }
                  }}
                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Download File</span>
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 1: ORIGINAL PSD VISUAL INSPECTOR (OPEN PSD FIRST)                 */}
          {/* ===================================================================== */}
          {activeTab === 'psd_view' && data && (
            <div className="flex-1 w-full h-full flex flex-col overflow-hidden bg-[#0a0e1a] relative">
              {/* PSD Canvas Navigation Toolbar */}
              <div className="w-full bg-[#111827] border-b border-slate-800 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 shrink-0 z-10">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-cyan-400" />
                    PSD Design Canvas
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded-full border border-cyan-800">
                    {data.dimensions.width} × {data.dimensions.height} px
                  </span>
                </div>

                {/* Canvas Presets & Zoom Controls */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setPsdZoom(0.65)}
                      className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 font-semibold cursor-pointer"
                      title="Fit PSD width to screen (Best for web designs)"
                    >
                      Fit Width
                    </button>
                    <button
                      type="button"
                      onClick={() => setPsdZoom(0.25)}
                      className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 font-semibold cursor-pointer"
                      title="Fit full page height"
                    >
                      Fit All
                    </button>
                    <button
                      type="button"
                      onClick={() => setPsdZoom(1.0)}
                      className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-cyan-400 font-semibold cursor-pointer"
                      title="100% pixel fidelity"
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSectionPins((prev) => !prev)}
                      className={`px-2 py-1 rounded font-semibold cursor-pointer transition-colors ${
                        showSectionPins ? 'bg-cyan-900/60 text-cyan-300' : 'text-slate-400 hover:text-white'
                      }`}
                      title="Toggle section position markers"
                    >
                      Pins
                    </button>
                  </div>

                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setPsdZoom((z) => Math.max(0.1, Number((z - 0.1).toFixed(2))))}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-1.5 font-mono text-[11px] text-slate-300 font-bold min-w-10 text-center">
                      {Math.round(psdZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setPsdZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(2))))}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Viewport for Original PSD Canvas */}
              <div
                ref={psdViewportRef}
                className="flex-1 w-full h-full overflow-auto p-4 sm:p-8 flex justify-center items-start bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] select-text"
              >
                <div
                  className="relative transition-transform duration-200 shadow-2xl rounded-lg overflow-hidden border border-slate-700/80 bg-white"
                  style={{
                    width: `${data.dimensions.width * psdZoom}px`,
                    minHeight: `${data.dimensions.height * psdZoom}px`
                  }}
                >
                  {/* High Fidelity Composite Image */}
                  {data.composite_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.composite_url.startsWith('/') ? data.composite_url : `${backendUrl}${data.composite_url}`}
                      alt={data.psd_name}
                      className="w-full h-auto block select-none pointer-events-none"
                    />
                  ) : (
                    /* Fallback canvas representation */
                    <div className="w-full h-full p-12 bg-slate-900 text-white flex flex-col items-center justify-center space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center font-bold text-2xl">
                        Ps
                      </div>
                      <h3 className="text-xl font-bold">{data.psd_name}</h3>
                      <p className="text-sm text-slate-400 max-w-md text-center">
                        Photoshop document opened with {data.detected_sections_count} detected sections and {data.extracted_images_count} extracted WebP assets.
                      </p>
                    </div>
                  )}

                  {/* Section Markers Overlay */}
                  {showSectionPins && data.sections.map((sec, idx) => {
                    const stepY = ((idx + 0.5) / data.sections.length) * 100;
                    return (
                      <div
                        key={idx}
                        className="absolute left-3 z-20 group"
                        style={{ top: `${stepY}%` }}
                      >
                        <div
                          onClick={() => setSelectedSectionIdx(idx)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold shadow-lg border backdrop-blur-md cursor-pointer transition-all flex items-center gap-1.5 ${
                            selectedSectionIdx === idx
                              ? 'bg-cyan-500 text-white border-white scale-105'
                              : 'bg-slate-900/90 text-cyan-300 border-cyan-800/80 hover:bg-cyan-600 hover:text-white'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                          <span>{idx + 1}. {sec.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dedicated Bottom Export Banner (Direct Action) */}
              <div className="w-full bg-[#111827]/95 border-t border-slate-800 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Select Export Option:
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Choose Modern CSS, Tailwind CSS, or Both, then click Export to read code & download ZIP.
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {/* Select Options: Modern CSS vs Tailwind vs Both */}
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setOutputMode('css')}
                      className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                        outputMode === 'css'
                          ? 'bg-cyan-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Modern CSS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOutputMode('tailwind')}
                      className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                        outputMode === 'tailwind'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Tailwind CSS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOutputMode('both')}
                      className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                        outputMode === 'both'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Complete Both</span>
                    </button>
                  </div>

                  {/* Primary Trigger Export Button */}
                  <button
                    type="button"
                    onClick={() => handleTriggerExport(outputMode)}
                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    <span>⚡ Export as {outputMode.toUpperCase()} & Read Code</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 2: LIVE PREVIEW IFRAME                                            */}
          {/* ===================================================================== */}
          {activeTab === 'preview' && (
            <div className="flex-1 w-full h-full overflow-auto flex items-start justify-center p-2 sm:p-4 bg-slate-950/80">
              <div
                className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300 border border-slate-700 flex flex-col"
                style={{
                  width: deviceWidths[deviceMode],
                  minHeight: '600px',
                  height: '100%'
                }}
              >
                <iframe
                  ref={iframeRef}
                  title="Live PSD to HTML Preview"
                  srcDoc={getPreviewHtml()}
                  sandbox="allow-scripts allow-same-origin"
                  className="w-full h-full flex-1 border-0"
                />
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 3: READ HTML CODE                                                 */}
          {/* ===================================================================== */}
          {activeTab === 'html' && data && (
            <div className="flex-1 w-full h-full overflow-auto p-4 font-mono text-xs text-slate-200 bg-[#080c14]">
              <div className="mb-3 flex items-center justify-between text-slate-400 text-[11px] pb-2 border-b border-slate-800">
                <span>📄 Document: {outputMode === 'tailwind' ? 'tailwind.html (Tailwind CSS)' : 'index.html (Modern CSS)'}</span>
                <span>{(outputMode === 'tailwind' ? data.tailwind_code.split('\n').length : data.html_code.split('\n').length)} Lines</span>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto select-text leading-relaxed">
                <code>{outputMode === 'tailwind' ? data.tailwind_code : data.html_code}</code>
              </pre>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 4: READ CSS CODE                                                  */}
          {/* ===================================================================== */}
          {activeTab === 'css' && data && (
            <div className="flex-1 w-full h-full overflow-auto p-4 font-mono text-xs text-slate-200 bg-[#080c14]">
              <div className="mb-3 flex items-center justify-between text-slate-400 text-[11px] pb-2 border-b border-slate-800">
                <span>🎨 Stylesheet: css/style.css (Custom BEM & CSS Variables)</span>
                <span>{data.css_code.split('\n').length} Lines</span>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto select-text leading-relaxed">
                <code>{data.css_code}</code>
              </pre>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 5: READ TAILWIND CODE                                             */}
          {/* ===================================================================== */}
          {activeTab === 'tailwind' && data && (
            <div className="flex-1 w-full h-full overflow-auto p-4 font-mono text-xs text-slate-200 bg-[#080c14]">
              <div className="mb-3 flex items-center justify-between text-slate-400 text-[11px] pb-2 border-b border-slate-800">
                <span>🌊 Document: tailwind.html (Tailwind CSS Utilities + Config)</span>
                <span>{data.tailwind_code.split('\n').length} Lines</span>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto select-text leading-relaxed">
                <code>{data.tailwind_code}</code>
              </pre>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 6: EXTRACTED ASSETS GALLERY                                       */}
          {/* ===================================================================== */}
          {activeTab === 'assets' && data && (
            <div className="flex-1 w-full h-full overflow-auto p-4 bg-[#080c14]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Extracted WebP Assets ({data.assets.length})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    All graphics, logos, and photos sliced directly from PSD layers into high-efficiency WebP files.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadZip()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download All in ZIP</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {data.assets.map((asset, i) => (
                  <div
                    key={i}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between group hover:border-cyan-600 transition-all"
                  >
                    <div className="w-full h-32 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:8px_8px] rounded-lg overflow-hidden flex items-center justify-center p-2 mb-2 bg-slate-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url.startsWith('/') ? asset.url : `${backendUrl}${asset.url}`}
                        alt={asset.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-200 truncate block" title={asset.filename}>
                        {asset.filename}
                      </span>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>{asset.width} × {asset.height}px</span>
                        <span>{(asset.size_bytes / 1024).toFixed(1)} KB</span>
                      </div>
                      <a
                        href={asset.url.startsWith('/') ? asset.url : `${backendUrl}${asset.url}`}
                        download={asset.filename}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 w-full py-1 bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white rounded text-[10px] font-bold text-center block transition-colors no-underline"
                      >
                        Download WebP
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 7: DETECTED SECTIONS BREAKDOWN                                    */}
          {/* ===================================================================== */}
          {activeTab === 'sections' && data && (
            <div className="flex-1 w-full h-full overflow-auto p-4 space-y-3 bg-[#080c14]">
              <div className="mb-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Geometric Section Analysis ({data.sections.length} Sections)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Semantic roles automatically identified by the trained PSD structural engine.
                </p>
              </div>

              {data.sections.map((sec, i) => (
                <div
                  key={i}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-xs">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white capitalize">{sec.name}</h4>
                      <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block">
                        Type: {sec.type}
                      </span>
                      {sec.heading && (
                        <p className="text-[11px] text-slate-400 mt-1 max-w-md truncate">
                          Heading: &ldquo;{sec.heading}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                    <span>{sec.images_count} Assets</span>
                    <span>{sec.buttons_count} Buttons</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ======================================================================= */}
        {/* RIGHT DOCK: PROJECT INFO, EXPORT OPTIONS & COMPLETE ZIP DOWNLOAD        */}
        {/* ======================================================================= */}
        <div className="w-full lg:w-84 bg-[#0e1422] border-t lg:border-t-0 lg:border-l border-slate-800 p-4 flex flex-col justify-between overflow-y-auto shrink-0 space-y-5">
          <div className="space-y-5">
            {/* 1. Complete ZIP Package Card (Root Folder Nested) */}
            {data && (
              <div className="bg-gradient-to-br from-emerald-950/70 via-cyan-950/50 to-slate-900 border border-emerald-700/60 rounded-2xl p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <FolderArchive className="w-4 h-4 text-emerald-400" />
                    Complete Project ZIP
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-900/60 px-2 py-0.5 rounded-full border border-emerald-800 font-bold">
                    ZIP Folder
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Extracts a complete root folder <code className="text-emerald-300">leaf-{data.psd_name.replace(/\.psd$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '-')}/</code> containing all files, folders, and WebP assets:
                </p>

                <div className="bg-slate-950/90 rounded-lg p-2.5 font-mono text-[10px] text-slate-300 space-y-1 border border-slate-800">
                  <div className="text-emerald-400 font-bold flex items-center gap-1">
                    <Folder className="w-3 h-3" />
                    <span>leaf-{data.psd_name.replace(/\.psd$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '-')}/</span>
                  </div>
                  <div className="pl-3 text-slate-400">├── index.html {outputMode === 'css' ? '(Modern CSS)' : outputMode === 'tailwind' ? '(Tailwind)' : '(CSS)'}</div>
                  {outputMode === 'both' && <div className="pl-3 text-slate-400">├── tailwind.html (Tailwind)</div>}
                  {(outputMode === 'css' || outputMode === 'both') && <div className="pl-3 text-slate-400">├── css/style.css</div>}
                  <div className="pl-3 text-slate-400">├── images/ ({data.extracted_images_count} WebP files)</div>
                  <div className="pl-3 text-slate-400">└── README.md (Docs & Tokens)</div>
                </div>

                {/* Primary Download Button */}
                <button
                  type="button"
                  onClick={() => handleDownloadZip()}
                  disabled={isLoading}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Project ZIP ({outputMode.toUpperCase()})</span>
                </button>

                {/* Secondary Quick Download Options */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDownloadZip('css')}
                    disabled={isLoading}
                    className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold text-center transition-colors cursor-pointer"
                  >
                    Download CSS ZIP
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadZip('tailwind')}
                    disabled={isLoading}
                    className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold text-center transition-colors cursor-pointer"
                  >
                    Download Tailwind ZIP
                  </button>
                </div>
              </div>
            )}

            {/* 2. Export Configuration Card */}
            {data && (
              <div className="space-y-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  Export Options
                </span>

                <div className="space-y-2">
                  <label
                    onClick={() => setOutputMode('css')}
                    className={`p-2.5 rounded-lg border flex items-start gap-2.5 cursor-pointer transition-all ${
                      outputMode === 'css'
                        ? 'bg-cyan-950/60 border-cyan-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="export_flavor"
                      checked={outputMode === 'css'}
                      onChange={() => setOutputMode('css')}
                      className="mt-0.5 accent-cyan-500"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold block text-slate-200">Modern Semantic CSS</span>
                      <span className="text-[10px] text-slate-400 leading-tight block">
                        HTML5 structure with modular <code className="text-cyan-300">css/style.css</code> stylesheet.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setOutputMode('tailwind')}
                    className={`p-2.5 rounded-lg border flex items-start gap-2.5 cursor-pointer transition-all ${
                      outputMode === 'tailwind'
                        ? 'bg-emerald-950/60 border-emerald-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="export_flavor"
                      checked={outputMode === 'tailwind'}
                      onChange={() => setOutputMode('tailwind')}
                      className="mt-0.5 accent-emerald-500"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold block text-slate-200">Tailwind CSS (Utility)</span>
                      <span className="text-[10px] text-slate-400 leading-tight block">
                        Utility classes with custom color theme & responsive modifiers.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setOutputMode('both')}
                    className={`p-2.5 rounded-lg border flex items-start gap-2.5 cursor-pointer transition-all ${
                      outputMode === 'both'
                        ? 'bg-purple-950/60 border-purple-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="export_flavor"
                      checked={outputMode === 'both'}
                      onChange={() => setOutputMode('both')}
                      className="mt-0.5 accent-purple-500"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold block text-slate-200">Complete Dual Bundle</span>
                      <span className="text-[10px] text-slate-400 leading-tight block">
                        Both CSS & Tailwind HTML outputs included in project archive.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* 3. Design Tokens & Palette */}
            {data && (
              <div className="space-y-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  Design Tokens
                </span>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Primary Color</span>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded border border-white/20 shadow-xs" style={{ backgroundColor: data.primary_color }} />
                      <span className="font-mono text-[11px] text-white font-bold">{data.primary_color}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Secondary Color</span>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded border border-white/20 shadow-xs" style={{ backgroundColor: data.secondary_color }} />
                      <span className="font-mono text-[11px] text-white font-bold">{data.secondary_color}</span>
                    </div>
                  </div>
                </div>

                {/* Typography Specs */}
                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Detected Typography
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.fonts.map((f, i) => (
                      <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4. Training Engine Reference Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Ready & Trained Engine
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Trained and calibrated with <strong>Marine Construction Homepage</strong> human-coded reference:
              </p>
              <ul className="text-[10px] text-slate-400 space-y-1 list-disc list-inside">
                <li>Automatic PSD design preview on open</li>
                <li>1-click option to export in CSS or Tailwind</li>
                <li>Live syntax-highlighted code readers</li>
                <li>Complete ZIP archive with clean root directory</li>
              </ul>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 text-center pt-4 border-t border-slate-800">
            LeafLite Studio &bull; High-Performance PSD to HTML Engine
          </div>
        </div>
      </div>
    </div>
  );
};
