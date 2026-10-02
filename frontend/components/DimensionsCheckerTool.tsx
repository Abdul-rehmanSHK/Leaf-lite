'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  RotateCcw,
  AlertCircle,
  FileImage,
  X,
  Printer,
  Sparkles,
  Share2,
  CheckCircle2,
  Maximize2
} from 'lucide-react';

interface DimensionsCheckerToolProps {
  backendUrl: string;
}

export const DimensionsCheckerTool: React.FC<DimensionsCheckerToolProps> = ({ backendUrl }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = async (f: File) => {
    setFile(f);
    setError(null);
    setResult(null);

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', f);

      const res = await fetch(`${backendUrl}/api/tools/dimensions-checker`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Inspection failed');
      }

      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setError(err.message || 'Failed to inspect image dimensions.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/svg+xml"
        className="hidden"
      />

      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative group cursor-pointer overflow-hidden rounded-3xl p-10 sm:p-14 flex flex-col items-center justify-center text-center bg-white border-2 border-dashed border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-105 group-hover:bg-emerald-100 transition-all">
            <Maximize2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-1">
            Image <span className="text-emerald-600">Dimensions & Aspect Ratio Checker</span>
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4">
            Inspect exact pixel dimensions, aspect ratio (16:9, 4:3, etc.), megapixels, print dimensions at 300 DPI, and web/social media compatibility.
          </p>
          <span className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all">
            Inspect Image Dimensions
          </span>
        </div>
      ) : (
        /* Image Preview & Results */
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xl shadow-emerald-950/5">
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
                  <span className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                  {isAnalyzing && (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      Computing aspect ratio & print sizing...
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClear}
              disabled={isAnalyzing}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-6 animate-fadeIn">
              {/* Primary Dimensions Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Pixel Resolution
                  </span>
                  <span className="text-base sm:text-lg font-black text-slate-900 font-mono">
                    {result.width} × {result.height}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">pixels</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">
                    Aspect Ratio
                  </span>
                  <span className="text-base sm:text-lg font-black text-emerald-800">
                    {result.aspect_ratio}
                  </span>
                  <span className="text-[11px] text-emerald-600 block mt-0.5">
                    ({result.aspect_ratio_decimal}:1)
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Total Pixels
                  </span>
                  <span className="text-base sm:text-lg font-black text-slate-900 font-mono">
                    {result.megapixels} MP
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Megapixels</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Orientation
                  </span>
                  <span className="text-base sm:text-lg font-black text-slate-900">
                    {result.orientation}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Mode: {result.mode}</span>
                </div>
              </div>

              {/* Print Sizing Table */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80">
                <div className="flex items-center gap-2 mb-3">
                  <Printer className="w-4 h-4 text-emerald-600" />
                  <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Physical Print Dimensions Calculator
                  </h5>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-emerald-50/40 border border-emerald-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-emerald-800">300 DPI</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        Fine Art / Glossy
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-800 font-mono">
                      {result.print_sizes.dpi_300.inches}
                    </p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {result.print_sizes.dpi_300.cm}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-slate-700">150 DPI</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                        Magazine / Flyer
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-800 font-mono">
                      {result.print_sizes.dpi_150.inches}
                    </p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {result.print_sizes.dpi_150.cm}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-slate-700">72 DPI</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                        Display Screen
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-800 font-mono">
                      {result.print_sizes.dpi_72.inches}
                    </p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {result.print_sizes.dpi_72.cm}
                    </p>
                  </div>
                </div>
              </div>

              {/* Web & Social Media Compatibility Matrix */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80">
                <div className="flex items-center gap-2 mb-3">
                  <Share2 className="w-4 h-4 text-emerald-600" />
                  <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Web & Social Media Compatibility Matrix
                  </h5>
                </div>

                <div className="space-y-2">
                  {result.preset_matches.map((item: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-800">{item.name}</span>
                        <span className="text-slate-400 font-mono ml-2 text-[11px]">{item.target}</span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          item.badge === 'exact'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.badge === 'ready'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reset */}
              <button
                type="button"
                onClick={handleClear}
                className="w-full py-3.5 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 text-xs flex items-center justify-center gap-2 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Inspect Another Image
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
