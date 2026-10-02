'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  RotateCcw,
  AlertCircle,
  FileImage,
  X,
  Gauge,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Activity
} from 'lucide-react';

interface QualityCheckerToolProps {
  backendUrl: string;
}

export const QualityCheckerTool: React.FC<QualityCheckerToolProps> = ({ backendUrl }) => {
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

    // Auto-analyze immediately upon selection
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', f);

      const res = await fetch(`${backendUrl}/api/tools/quality-checker`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Analysis failed');
      }

      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setError(err.message || 'Failed to inspect image quality.');
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
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp"
        className="hidden"
      />

      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative group cursor-pointer overflow-hidden rounded-3xl p-10 sm:p-14 flex flex-col items-center justify-center text-center bg-white border-2 border-dashed border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-105 group-hover:bg-emerald-100 transition-all">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-1">
            Image <span className="text-emerald-600">Quality & Blur Checker</span>
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4">
            Upload an image to inspect mathematical sharpness (Laplacian variance), Shannon texture entropy, compression artifacts, and get an overall quality score out of 100.
          </p>
          <span className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all">
            Analyze Image Quality
          </span>
        </div>
      ) : (
        /* Image Preview & Status */
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
                      Analyzing sharpness & entropy...
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

          {/* Results Analysis */}
          {result && (
            <div className="space-y-6 animate-fadeIn">
              {/* Overall Score Banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-center sm:text-left">
                  <div className="w-20 h-20 rounded-2xl bg-emerald-600 text-white flex flex-col items-center justify-center shadow-lg shadow-emerald-600/25 shrink-0">
                    <span className="text-2xl font-black">{result.overall_score}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">/ 100</span>
                  </div>
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 mb-1 border border-emerald-200">
                      {result.grade}
                    </span>
                    <p className="text-xs text-slate-600 max-w-md leading-relaxed">
                      {result.status_description}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-mono text-slate-400 block">Resolution</span>
                  <span className="text-xs font-bold font-mono text-slate-800">
                    {result.dimensions}
                  </span>
                </div>
              </div>

              {/* 4 Diagnostic Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Metric 1: Sharpness */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-emerald-600" />
                      Sharpness / Blur Variance
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-700">
                      {result.metrics.sharpness.score}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full mb-2 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${Math.min(100, result.metrics.sharpness.score)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Rating: {result.metrics.sharpness.assessment}</span>
                    <span className="font-mono">Var: {result.metrics.sharpness.raw_variance}</span>
                  </div>
                </div>

                {/* Metric 2: Texture Entropy */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                      Texture Entropy (Detail)
                    </span>
                    <span className="text-xs font-mono font-bold text-blue-700">
                      {result.metrics.entropy.score}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full mb-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${Math.min(100, result.metrics.entropy.score)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>{result.metrics.entropy.assessment}</span>
                    <span className="font-mono">{result.metrics.entropy.raw_bits} bits/px</span>
                  </div>
                </div>

                {/* Metric 3: Contrast & Dynamic Range */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-700">Dynamic Contrast</span>
                    <span className="text-xs font-mono font-bold text-purple-700">
                      {result.metrics.contrast.score}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full mb-2 overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full"
                      style={{ width: `${Math.min(100, result.metrics.contrast.score)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Range: {result.metrics.contrast.dynamic_range}</span>
                    <span className="font-mono">σ={result.metrics.contrast.std_deviation}</span>
                  </div>
                </div>

                {/* Metric 4: Noise Level */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-700">Noise / Artifacts</span>
                    <span className="text-xs font-mono font-bold text-amber-700">
                      {result.metrics.noise.score}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full mb-2 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${Math.min(100, result.metrics.noise.score)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Noise Rating: {result.metrics.noise.assessment}</span>
                  </div>
                </div>
              </div>

              {/* Actionable Recommendations */}
              {result.recommendations && result.recommendations.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-xs">
                  <p className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Optimizer Recommendations:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 leading-relaxed">
                    {result.recommendations.map((rec: string, i: number) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reset Button */}
              <button
                type="button"
                onClick={handleClear}
                className="w-full py-3.5 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 text-xs flex items-center justify-center gap-2 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Analyze Another Image
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
