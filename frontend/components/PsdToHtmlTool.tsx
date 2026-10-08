'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  LayoutTemplate
} from 'lucide-react';

interface PsdToHtmlToolProps {
  backendUrl: string;
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
  zip_download_url: string;
  zip_filename: string;
}

type DeviceMode = 'desktop' | 'laptop' | 'tablet' | 'mobile';
type ActiveTab = 'preview' | 'html' | 'css' | 'assets' | 'sections';
type OutputMode = 'css' | 'tailwind';

export const PsdToHtmlTool: React.FC<PsdToHtmlToolProps> = ({ backendUrl }) => {
  const [data, setData] = useState<ConversionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Studio tabs and preview controls
  const [activeTab, setActiveTab] = useState<ActiveTab>('preview');
  const [outputMode, setOutputMode] = useState<OutputMode>('css');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load sample initially so user sees a working live preview right away!
  useEffect(() => {
    loadSampleData();
  }, []);

  const loadSampleData = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingStep('Parsing trained Marine Construction PSD (86MB)...');

    try {
      let result: ConversionResult | null = null;
      try {
        const res = await fetch(`${backendUrl}/api/tools/psd-to-html/sample`, {
          method: 'POST'
        });
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
        throw new Error('Could not load training sample. Please upload a PSD or verify backend.');
      }

      setData(result);
    } catch (err: any) {
      console.warn('Sample fetch notice:', err.message);
      setError(err.message || 'Failed to load sample');
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
    setLoadingStep(`Uploading & parsing ${file.name} with geometric bounding-box engine...`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${backendUrl}/api/tools/psd-to-html/convert`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to parse and convert PSD.');
      }

      const result: ConversionResult = await res.json();
      setData(result);
      setActiveTab('preview');
    } catch (err: any) {
      setError(err.message || 'An error occurred while converting PSD.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
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

  // Generate self-contained HTML for live preview iframe
  const getPreviewHtml = (): string => {
    if (!data) return '';

    const resolveUrl = (asset: ExtractedAsset) => {
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
              <span className="text-sm font-bold text-white tracking-tight">PSD to HTML & Tailwind</span>
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
              {data ? data.psd_name : 'Extracts CSS, Tailwind, Typography, Spacing & WebP Assets'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Selector: Modern CSS vs Tailwind */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setOutputMode('css')}
              className={`px-3 py-1.5 rounded flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                outputMode === 'css'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Modern Modular CSS (Learned Reference Style)"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Modern CSS</span>
            </button>

            <button
              type="button"
              onClick={() => setOutputMode('tailwind')}
              className={`px-3 py-1.5 rounded flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                outputMode === 'tailwind'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Tailwind CSS Utility Classes"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Tailwind CSS</span>
            </button>
          </div>

          {/* Quick Sample Button */}
          <button
            type="button"
            onClick={loadSampleData}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Reload the 9,934px Marine Construction training mockup"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Load Reference Sample</span>
          </button>

          {/* Full Live Website Button */}
          <a
            href="/demo-marine-construction/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer no-underline"
            title="Open the complete hand-coded 1,436-line responsive site in a new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>Full Live Website</span>
          </a>

          {/* Upload PSD Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload New PSD</span>
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
      {/* 2. LOADING & ERROR OVERLAYS                                               */}
      {/* ========================================================================= */}
      {isLoading && (
        <div className="w-full bg-cyan-950/70 border-b border-cyan-800/80 px-4 py-2 flex items-center justify-between text-xs text-cyan-200">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span className="font-semibold">{loadingStep || 'Processing PSD...'}</span>
          </div>
          <span className="text-[11px] text-cyan-400/80">Slicing images to WebP & synthesizing markup</span>
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
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MAIN STUDIO VIEW                                                       */}
      {/* ========================================================================= */}
      <div className="flex-1 w-full flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left & Center Stage */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#090d16] border-r border-slate-800 overflow-hidden">
          {/* Sub Navigation Bar for Code & Preview Tabs */}
          <div className="w-full bg-[#0d1322] border-b border-slate-800 px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Live Preview</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('html')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'html'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>HTML Code</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('css')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'css'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{outputMode === 'tailwind' ? 'Tailwind Config' : 'CSS Styles'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('assets')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'assets'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Assets ({data?.extracted_images_count || 0})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('sections')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'sections'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Sections ({data?.detected_sections_count || 0})</span>
              </button>
            </div>

            {/* Device Switcher (When on Preview tab) */}
            {activeTab === 'preview' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDeviceMode('desktop')}
                    className={`p-1.5 rounded ${deviceMode === 'desktop' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Desktop (100%)"
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

                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                  title="Open in Full Screen Tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Copy / Download buttons for Code tabs */}
            {(activeTab === 'html' || activeTab === 'css') && data && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const code = activeTab === 'html' ? (outputMode === 'tailwind' ? data.tailwind_code : data.html_code) : data.css_code;
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
                    } else {
                      handleDownloadFile(data.css_code, 'style.css', 'text/css');
                    }
                  }}
                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </div>
            )}
          </div>

          {/* Main Stage Content */}
          <div className="flex-1 w-full overflow-hidden flex flex-col min-h-0 bg-[#080c14] relative">
            {/* 1. PREVIEW TAB */}
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

            {/* 2. HTML CODE TAB */}
            {activeTab === 'html' && data && (
              <div className="flex-1 w-full h-full overflow-auto p-4 font-mono text-xs text-slate-200">
                <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto select-text leading-relaxed">
                  <code>{outputMode === 'tailwind' ? data.tailwind_code : data.html_code}</code>
                </pre>
              </div>
            )}

            {/* 3. CSS CODE TAB */}
            {activeTab === 'css' && data && (
              <div className="flex-1 w-full h-full overflow-auto p-4 font-mono text-xs text-slate-200">
                <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto select-text leading-relaxed">
                  <code>{data.css_code}</code>
                </pre>
              </div>
            )}

            {/* 4. ASSETS GALLERY TAB */}
            {activeTab === 'assets' && data && (
              <div className="flex-1 w-full h-full overflow-auto p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {data.assets.map((asset, i) => (
                    <div
                      key={i}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col justify-between group hover:border-cyan-600 transition-all"
                    >
                      <div className="w-full h-32 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:8px_8px] rounded-lg overflow-hidden flex items-center justify-center p-2 mb-2 bg-slate-950">
                        <img
                          src={`${backendUrl}${asset.url}`}
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
                          href={`${backendUrl}${asset.url}`}
                          download={asset.filename}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 w-full py-1 bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white rounded text-[10px] font-bold text-center block transition-colors"
                        >
                          Download WebP
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. SECTIONS TAB */}
            {activeTab === 'sections' && data && (
              <div className="flex-1 w-full h-full overflow-auto p-4 space-y-3">
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
        </div>

        {/* Right Dock: Project Info, Tokens, & 1-Click ZIP Download */}
        <div className="w-full lg:w-80 bg-[#0e1422] border-t lg:border-t-0 lg:border-l border-slate-800 p-4 flex flex-col justify-between overflow-y-auto shrink-0 space-y-5">
          <div className="space-y-5">
            {/* Download Full Bundle Card */}
            {data && (
              <div className="bg-gradient-to-br from-emerald-950/70 to-cyan-950/70 border border-emerald-700/60 rounded-2xl p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <FolderArchive className="w-4 h-4 text-emerald-400" />
                    Complete Package
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-900/60 px-2 py-0.5 rounded-full border border-emerald-800">
                    ZIP Bundle
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Includes full <code className="text-emerald-300">index.html</code>, <code className="text-emerald-300">tailwind.html</code>, <code className="text-emerald-300">style.css</code>, and all sliced WebP images in <code className="text-emerald-300">images/</code>!
                </p>
                <a
                  href={`${backendUrl}${data.zip_download_url}`}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Project ZIP</span>
                </a>
              </div>
            )}

            {/* Design Tokens & Learned Colors */}
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

            {/* Training Reference Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Active Training Reference
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Trained on your real <strong>Marine Construction Homepage</strong> PSD &amp; manual HTML/CSS files.
              </p>
              <ul className="text-[10px] text-slate-400 space-y-1 list-disc list-inside">
                <li>BEM &amp; Semantic HTML5 hierarchy</li>
                <li>Container max-width: 1620px</li>
                <li>Buttons with smooth 0.3s hover transition</li>
                <li>Auto WebP slicing for all photos &amp; icons</li>
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
