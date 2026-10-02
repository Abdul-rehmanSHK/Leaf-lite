'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  RotateCcw,
  AlertCircle,
  FileImage,
  X,
  Camera,
  MapPin,
  Calendar,
  Download,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Info
} from 'lucide-react';

interface ExifToolProps {
  backendUrl: string;
}

export const ExifTool: React.FC<ExifToolProps> = ({ backendUrl }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isStripping, setIsStripping] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exifData, setExifData] = useState<any | null>(null);
  const [stripResult, setStripResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = async (f: File) => {
    setFile(f);
    setError(null);
    setExifData(null);
    setStripResult(null);

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', f);

      const res = await fetch(`${backendUrl}/api/tools/exif`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to read EXIF');
      }

      const json = await res.json();
      setExifData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to read EXIF metadata.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStripExif = async () => {
    if (!file) return;
    setIsStripping(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${backendUrl}/api/tools/exif/strip`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to strip EXIF');
      }

      const json = await res.json();
      setStripResult(json);
    } catch (err: any) {
      setError(err.message || 'Failed to sanitize image metadata.');
    } finally {
      setIsStripping(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreviewUrl(null);
    setExifData(null);
    setStripResult(null);
    setError(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        accept="image/png,image/jpeg,image/webp,image/avif,image/tiff"
        className="hidden"
      />

      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative group cursor-pointer overflow-hidden rounded-3xl p-10 sm:p-14 flex flex-col items-center justify-center text-center bg-white border-2 border-dashed border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-105 group-hover:bg-emerald-100 transition-all">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-1">
            EXIF <span className="text-emerald-600">Metadata Viewer & Privacy Remover</span>
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4">
            Inspect camera hardware, GPS coordinates, shutter speeds, and timestamps embedded in your photos — or strip them all in 1 click for complete privacy.
          </p>
          <span className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all">
            Inspect & Sanitize Image
          </span>
        </div>
      ) : (
        /* Image Preview & EXIF Results */
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
                      Scanning EXIF & GPS tags...
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClear}
              disabled={isAnalyzing || isStripping}
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

          {exifData && (
            <div className="space-y-6 animate-fadeIn">
              {/* Privacy Risk Assessment Banner */}
              <div
                className={`p-5 rounded-2xl border flex items-start gap-3.5 ${
                  exifData.privacy.level === 'danger'
                    ? 'bg-red-50/80 border-red-200 text-red-800'
                    : exifData.privacy.level === 'warning'
                    ? 'bg-amber-50/80 border-amber-200 text-amber-800'
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                }`}
              >
                <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">Privacy Assessment: {exifData.privacy.level.toUpperCase()}</span>
                    <span className="text-[11px] font-mono font-semibold">
                      {exifData.tag_count} metadata tags
                    </span>
                  </div>
                  <p className="leading-relaxed">{exifData.privacy.status}</p>

                  {/* GPS Details if available */}
                  {exifData.privacy.has_gps && (
                    <div className="mt-3 p-3 bg-white/80 rounded-xl border border-red-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-red-600" />
                        <span className="font-mono font-bold text-slate-800">
                          {exifData.privacy.latitude}, {exifData.privacy.longitude}
                        </span>
                      </div>
                      {exifData.privacy.maps_url && (
                        <a
                          href={exifData.privacy.maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:underline"
                        >
                          View on Google Maps <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Camera & Shooting Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Camera</span>
                  <span className="font-bold text-slate-800 truncate block">
                    {exifData.camera_info.model}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Date Taken</span>
                  <span className="font-bold text-slate-800 truncate block">
                    {exifData.camera_info.date_taken}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">ISO / Exposure</span>
                  <span className="font-bold text-slate-800 truncate block font-mono">
                    ISO {exifData.camera_info.iso} • {exifData.camera_info.exposure}s
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">F-Stop / Lens</span>
                  <span className="font-bold text-slate-800 truncate block font-mono">
                    ƒ/{exifData.camera_info.f_number} • {exifData.camera_info.focal_length}mm
                  </span>
                </div>
              </div>

              {/* All Tags Expandable Table */}
              {Object.keys(exifData.all_tags).length > 0 && (
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden text-xs">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-bold text-slate-700">
                    Detected EXIF Tags ({Object.keys(exifData.all_tags).length})
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {Object.entries(exifData.all_tags).map(([key, val]) => (
                      <div key={key} className="flex justify-between px-4 py-2 hover:bg-slate-50/50">
                        <span className="font-semibold text-slate-600 font-mono text-[11px]">{key}</span>
                        <span className="text-slate-800 font-mono text-[11px] truncate max-w-xs">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 1-Click Strip EXIF Button */}
              {!stripResult ? (
                <button
                  type="button"
                  onClick={handleStripExif}
                  disabled={isStripping}
                  className={`w-full py-4 rounded-2xl font-bold text-white shadow-lg flex items-center justify-center gap-2 text-sm transition-all ${
                    isStripping
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 active:scale-[0.99]'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  {isStripping ? 'Sanitizing Metadata...' : 'Strip All EXIF & GPS Metadata (Make Safe)'}
                </button>
              ) : (
                /* Stripped Result Success Card */
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 animate-fadeIn space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <div>
                        <h5 className="font-bold text-emerald-950 text-sm">Image Sanitized!</h5>
                        <p className="text-xs text-emerald-700">
                          100% of camera, location, and device metadata has been removed.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold bg-white text-emerald-800 px-2.5 py-1 rounded-md border border-emerald-200">
                      {stripResult.sanitized_size_formatted}
                    </span>
                  </div>

                  <a
                    href={`${backendUrl}${stripResult.download_url}`}
                    className="w-full py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download Clean Sanitized Image
                  </a>
                </div>
              )}

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
