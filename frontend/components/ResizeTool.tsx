'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Maximize2,
  Download,
  RotateCcw,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Sliders,
  FileImage,
  X
} from 'lucide-react';

interface ResizeToolProps {
  backendUrl: string;
}

export const ResizeTool: React.FC<ResizeToolProps> = ({ backendUrl }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalWidth, setOriginalWidth] = useState<number>(0);
  const [originalHeight, setOriginalHeight] = useState<number>(0);

  const [mode, setMode] = useState<'percent' | 'exact'>('percent');
  const [scalePercent, setScalePercent] = useState<number>(50);

  const [targetWidth, setTargetWidth] = useState<string>('');
  const [targetHeight, setTargetHeight] = useState<string>('');
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(true);

  const [targetFormat, setTargetFormat] = useState<string>('JPG');
  const [quality, setQuality] = useState<number>(85);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
    setResult(null);

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);

    const img = new Image();
    img.onload = () => {
      setOriginalWidth(img.naturalWidth);
      setOriginalHeight(img.naturalHeight);
      setTargetWidth(Math.round(img.naturalWidth * (scalePercent / 100)).toString());
      setTargetHeight(Math.round(img.naturalHeight * (scalePercent / 100)).toString());
    };
    img.src = url;

    const ext = f.name.split('.').pop()?.toUpperCase() || 'JPG';
    setTargetFormat(['PNG', 'WEBP', 'JPEG', 'JPG'].includes(ext) ? (ext === 'JPEG' ? 'JPG' : ext) : 'JPG');
  };

  const handleWidthChange = (val: string) => {
    setTargetWidth(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && lockAspectRatio && originalWidth > 0 && originalHeight > 0) {
      const ratio = originalHeight / originalWidth;
      setTargetHeight(Math.round(num * ratio).toString());
    }
  };

  const handleHeightChange = (val: string) => {
    setTargetHeight(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && lockAspectRatio && originalWidth > 0 && originalHeight > 0) {
      const ratio = originalWidth / originalHeight;
      setTargetWidth(Math.round(num * ratio).toString());
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setOriginalWidth(0);
    setOriginalHeight(0);
  };

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (mode === 'percent') {
        formData.append('scale_percent', scalePercent.toString());
      } else {
        if (targetWidth) formData.append('target_width', targetWidth);
        if (targetHeight) formData.append('target_height', targetHeight);
        formData.append('keep_aspect_ratio', lockAspectRatio ? 'true' : 'false');
      }
      formData.append('target_format', targetFormat);
      formData.append('quality', quality.toString());

      const res = await fetch(`${backendUrl}/api/tools/resize`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Resize failed');
      }

      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setError(err.message || 'Failed to resize image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const computedWidth =
    mode === 'percent'
      ? Math.max(1, Math.round(originalWidth * (scalePercent / 100)))
      : parseInt(targetWidth || '0', 10) || originalWidth;

  const computedHeight =
    mode === 'percent'
      ? Math.max(1, Math.round(originalHeight * (scalePercent / 100)))
      : parseInt(targetHeight || '0', 10) || originalHeight;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Upload Box */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp"
        className="hidden"
      />

      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative group cursor-pointer overflow-hidden rounded-3xl p-10 sm:p-12 flex flex-col items-center justify-center text-center bg-white border-2 border-dashed border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-105 group-hover:bg-emerald-100 transition-all">
            <Maximize2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-1">
            Choose an image to <span className="text-emerald-600">Resize</span>
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4">
            Scale by percentage (e.g. 50%, 75%) or specify exact pixel dimensions with aspect ratio lock.
          </p>
          <span className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all">
            Browse Image
          </span>
        </div>
      ) : (
        /* Image Selected Control Card */
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xl shadow-emerald-950/5">
          {/* Header Preview */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <FileImage className="w-8 h-8 text-emerald-600 m-auto" />
                )}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm truncate max-w-xs">{file.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono font-medium">
                    Original: {originalWidth} × {originalHeight} px
                  </span>
                  <span className="text-xs text-slate-400">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClear}
              disabled={isProcessing}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode('percent')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'percent' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Scale by Percentage (%)
            </button>
            <button
              type="button"
              onClick={() => setMode('exact')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'exact' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Exact Pixel Dimensions (px)
            </button>
          </div>

          {/* Controls: Percentage Mode */}
          {mode === 'percent' ? (
            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Resize Percentage</span>
                <span className="text-emerald-600 font-mono text-base">{scalePercent}%</span>
              </div>

              <input
                type="range"
                min="10"
                max="200"
                step="5"
                value={scalePercent}
                onChange={(e) => setScalePercent(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-600 cursor-pointer"
              />

              <div className="flex gap-2">
                {[25, 50, 75, 100, 150].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setScalePercent(pct)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      scalePercent === pct
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'border-slate-200 text-slate-600 hover:border-emerald-300'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Controls: Exact Dimensions Mode */
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-center">
                <div>
                  <label className="text-[11px] uppercase font-bold text-slate-500 block mb-1">
                    Width (px)
                  </label>
                  <input
                    type="number"
                    value={targetWidth}
                    onChange={(e) => handleWidthChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="Width"
                  />
                </div>

                <div className="pt-5">
                  <button
                    type="button"
                    onClick={() => setLockAspectRatio(!lockAspectRatio)}
                    className={`p-2.5 rounded-xl border transition-all ${
                      lockAspectRatio
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                    title={lockAspectRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                  >
                    {lockAspectRatio ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                </div>

                <div>
                  <label className="text-[11px] uppercase font-bold text-slate-500 block mb-1">
                    Height (px)
                  </label>
                  <input
                    type="number"
                    value={targetHeight}
                    onChange={(e) => handleHeightChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="Height"
                  />
                </div>
              </div>

              {/* Quick Dimension Presets */}
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { label: '1920 × 1080 (FHD)', w: 1920, h: 1080 },
                  { label: '1280 × 720 (HD)', w: 1280, h: 720 },
                  { label: '1080 × 1080 (Square)', w: 1080, h: 1080 },
                  { label: '800 × 600', w: 800, h: 600 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTargetWidth(preset.w.toString());
                      setTargetHeight(preset.h.toString());
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Real-time Dimensions Output Badge */}
          <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 mb-6 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600">Output Dimensions Preview:</span>
            <span className="font-mono font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-md border border-emerald-200 shadow-2xs">
              {computedWidth} × {computedHeight} px
            </span>
          </div>

          {/* Quality & Format Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-[11px] uppercase font-bold text-slate-500 block mb-1">
                Output Format
              </label>
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="JPG">JPG / JPEG (Universal)</option>
                <option value="WEBP">WebP (Modern Compact)</option>
                <option value="PNG">PNG (Lossless / Transparency)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-[11px] uppercase font-bold text-slate-500 mb-1">
                <span>Quality Setting</span>
                <span className="text-emerald-600 font-mono">{quality}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                step="5"
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            type="button"
            onClick={handleProcess}
            disabled={isProcessing}
            className={`w-full py-4 rounded-2xl font-bold text-white shadow-lg flex items-center justify-center gap-2 text-sm transition-all ${
              isProcessing
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 active:scale-[0.99]'
            }`}
          >
            <Maximize2 className="w-4 h-4" />
            {isProcessing ? 'Resampling Image...' : `Resize to ${computedWidth} × ${computedHeight} px`}
          </button>
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-200 shadow-xl shadow-emerald-950/5 animate-fadeIn">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Image Resized Successfully!</h4>
                <p className="text-xs text-slate-500">{result.download_filename}</p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {result.scale_applied}
            </span>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 mb-6 text-center text-xs">
            <div>
              <p className="text-slate-400 font-semibold uppercase text-[10px]">Original</p>
              <p className="font-bold text-slate-700 mt-0.5">
                {result.original_width} × {result.original_height} px
              </p>
              <p className="text-[11px] text-slate-500">{result.original_size_formatted}</p>
            </div>
            <div className="border-x border-emerald-100">
              <p className="text-emerald-600 font-semibold uppercase text-[10px]">Resized</p>
              <p className="font-extrabold text-emerald-700 mt-0.5">
                {result.new_width} × {result.new_height} px
              </p>
              <p className="text-[11px] text-emerald-600 font-bold">{result.new_size_formatted}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase text-[10px]">Size Saved</p>
              <p className="font-bold text-slate-700 mt-0.5">{result.saved_percent}%</p>
              <p className="text-[11px] text-slate-500">(-{(result.saved_bytes / 1024).toFixed(1)} KB)</p>
            </div>
          </div>

          {/* Download & Reset */}
          <div className="flex gap-3">
            <a
              href={`${backendUrl}${result.download_url}`}
              className="flex-1 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm transition-all"
            >
              <Download className="w-4 h-4" />
              Download Resized Image
            </a>
            <button
              type="button"
              onClick={handleClear}
              className="px-5 py-3.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 text-sm transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Resize Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
