'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sliders,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileImage,
  X,
  Gauge,
  Sparkles
} from 'lucide-react';

interface KbReducerToolProps {
  backendUrl: string;
}

export const KbReducerTool: React.FC<KbReducerToolProps> = ({ backendUrl }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetKb, setTargetKb] = useState<number>(100);
  const [targetFormat, setTargetFormat] = useState<string>('JPG');

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

    // Intelligently set a reasonable default target KB (e.g. 35% of original size or 100KB)
    const originalKb = Math.round(f.size / 1024);
    if (originalKb > 300) {
      setTargetKb(Math.max(50, Math.round(originalKb * 0.4)));
    } else {
      setTargetKb(Math.max(20, Math.round(originalKb * 0.6)));
    }

    const ext = f.name.split('.').pop()?.toUpperCase() || 'JPG';
    setTargetFormat(['PNG', 'WEBP', 'JPEG', 'JPG'].includes(ext) ? (ext === 'JPEG' ? 'JPG' : ext) : 'JPG');
  };

  const handleClear = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (!file || targetKb <= 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('target_kb', targetKb.toString());
      formData.append('target_format', targetFormat);

      const res = await fetch(`${backendUrl}/api/tools/kb-reducer`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'KB reduction failed');
      }

      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setError(err.message || 'Failed to compress image to target KB.');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentSizeKb = file ? Math.round(file.size / 1024) : 0;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
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
            <Gauge className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-1">
            Image <span className="text-emerald-600">KB Reducer</span>
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4">
            Compress your image to hit an exact maximum file size (e.g. under 50 KB, 100 KB, or 200 KB) for job portals, forms, and web performance.
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
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                    Current Size: {currentSizeKb} KB
                  </span>
                  <span className="text-xs text-slate-400">
                    ({(file.size / (1024 * 1024)).toFixed(2)} MB)
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

          {/* Target KB Input Section */}
          <div className="space-y-4 mb-6">
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>Set Exact Target Size</span>
              <span className="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 font-mono text-sm">
                Max {targetKb} KB
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                min="10"
                max={Math.max(100, currentSizeKb)}
                step="5"
                value={targetKb}
                onChange={(e) => setTargetKb(Math.max(5, parseInt(e.target.value || '5', 10)))}
                className="w-full px-4 py-3 border-2 border-emerald-500/80 rounded-2xl text-lg font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 font-mono"
                placeholder="e.g. 100"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                KB
              </span>
            </div>

            {/* Quick KB Presets */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[50, 100, 200, 300, 500].map((kb) => (
                <button
                  key={kb}
                  type="button"
                  onClick={() => setTargetKb(kb)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    targetKb === kb
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 text-slate-600 hover:border-emerald-300 bg-white'
                  }`}
                >
                  Under {kb} KB
                </button>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div className="mb-6">
            <label className="text-[11px] uppercase font-bold text-slate-500 block mb-1">
              Compression Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'JPG', label: 'JPEG (Universal)' },
                { id: 'WEBP', label: 'WebP (Smallest)' },
                { id: 'PNG', label: 'PNG (Palette)' },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setTargetFormat(fmt.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    targetFormat === fmt.id
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-emerald-300'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
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
            <Gauge className="w-4 h-4" />
            {isProcessing ? 'Compressing with Iterative Search...' : `Compress Image to ≤ ${targetKb} KB`}
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
                <h4 className="font-bold text-slate-900 text-sm">Target Size Achieved!</h4>
                <p className="text-xs text-slate-500">{result.download_filename}</p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              Saved {result.saved_percent}%
            </span>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 mb-6 text-center text-xs">
            <div>
              <p className="text-slate-400 font-semibold uppercase text-[10px]">Original</p>
              <p className="font-bold text-slate-700 mt-0.5">{result.original_size_formatted}</p>
            </div>
            <div className="border-x border-emerald-100">
              <p className="text-emerald-600 font-semibold uppercase text-[10px]">Reduced Result</p>
              <p className="font-extrabold text-emerald-700 mt-0.5">{result.final_size_formatted}</p>
              <p className="text-[10px] text-emerald-600 font-medium">Target: {result.target_kb} KB</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase text-[10px]">Reduction</p>
              <p className="font-bold text-slate-700 mt-0.5">{result.saved_percent}%</p>
              <p className="text-[10px] text-slate-500">(-{(result.saved_bytes / 1024).toFixed(1)} KB)</p>
            </div>
          </div>

          {/* Download & Reset */}
          <div className="flex gap-3">
            <a
              href={`${backendUrl}${result.download_url}`}
              className="flex-1 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm transition-all"
            >
              <Download className="w-4 h-4" />
              Download {result.final_size_formatted} Image
            </a>
            <button
              type="button"
              onClick={handleClear}
              className="px-5 py-3.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 text-sm transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reduce Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
