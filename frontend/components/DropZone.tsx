'use client';

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileImage, X, Image as ImageIcon, CheckCircle, FileCode, Sparkles } from 'lucide-react';

export interface ImageMetadata {
  file: File;
  name: string;
  size: number;
  format: string;
  width?: number;
  height?: number;
  previewUrl: string;
}

interface DropZoneProps {
  onFileSelect: (metadata: ImageMetadata) => void;
  selectedMetadata: ImageMetadata | null;
  onClearFile: () => void;
  disabled?: boolean;
  activeMode: 'optimize' | 'convert';
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFileSelect,
  selectedMetadata,
  onClearFile,
  disabled = false,
  activeMode,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toUpperCase() || 'UNKNOWN';
    const previewUrl = URL.createObjectURL(file);

    // Read image dimensions
    const img = new Image();
    img.onload = () => {
      onFileSelect({
        file,
        name: file.name,
        size: file.size,
        format: ext,
        width: img.naturalWidth,
        height: img.naturalHeight,
        previewUrl,
      });
    };
    img.onerror = () => {
      onFileSelect({
        file,
        name: file.name,
        size: file.size,
        format: ext,
        previewUrl,
      });
    };
    img.src = previewUrl;
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('image/') || droppedFile.name.endsWith('.svg')) {
        processFile(droppedFile);
      }
    }
  }, [disabled, processFile]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/tiff,image/svg+xml"
        className="hidden"
        disabled={disabled}
      />

      {!selectedMetadata ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`
            relative group cursor-pointer overflow-hidden rounded-3xl p-10 sm:p-14
            flex flex-col items-center justify-center text-center
            transition-all duration-300 ease-out
            bg-white/90 backdrop-blur-md
            border-2 border-dashed
            ${isDragOver
              ? 'border-emerald-500 bg-emerald-50/60 shadow-2xl shadow-emerald-500/15 scale-[1.01]'
              : 'border-emerald-200/90 hover:border-emerald-500 hover:bg-emerald-50/25 hover:shadow-xl hover:shadow-emerald-500/10 shadow-sm'
            }
          `}
        >
          {/* Subtle Accent Glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-100/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

          {/* Icon Badge */}
          <div className={`
            w-20 h-20 rounded-2xl flex items-center justify-center mb-5
            transition-all duration-300
            ${isDragOver
              ? 'bg-emerald-600 text-white scale-110 shadow-lg shadow-emerald-600/30 ring-4 ring-emerald-100'
              : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100/90 group-hover:scale-105 group-hover:text-emerald-700'
            }
          `}>
            <UploadCloud className="w-10 h-10 transition-transform duration-300 group-hover:-translate-y-0.5" />
          </div>

          <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
            Drag & drop your image here, or{' '}
            <span className="text-emerald-600 underline decoration-emerald-300 underline-offset-4 group-hover:text-emerald-700">
              browse files
            </span>
          </h3>

          <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
            {activeMode === 'optimize'
              ? 'Accepts PNG, JPG, WEBP, and AVIF. Applies streaming lossy & lossless quantization.'
              : 'Accepts any raster image or SVG. Auto-detects format and converts to desired output.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs font-semibold text-emerald-900">
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 shadow-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Up to 90% Size Reduction
            </span>
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 shadow-xs flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              Auto-Format Detection
            </span>
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 shadow-xs flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-emerald-600" />
              Raster to SVG Vectorize
            </span>
          </div>
        </div>
      ) : (
        /* Selected File Card View */
        <div className="relative rounded-3xl bg-white p-6 sm:p-7 shadow-xl shadow-emerald-950/5 border border-emerald-100 transition-all">
          <div className="flex items-center gap-5">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center shadow-inner">
              {selectedMetadata.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedMetadata.previewUrl}
                  alt={selectedMetadata.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <FileImage className="w-9 h-9 text-emerald-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Detected: {selectedMetadata.format}
                </span>

                {selectedMetadata.width && selectedMetadata.height && (
                  <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                    {selectedMetadata.width} × {selectedMetadata.height} px
                  </span>
                )}

                <span className="text-xs font-semibold text-slate-500">
                  {formatFileSize(selectedMetadata.size)}
                </span>
              </div>

              <h4 className="text-base sm:text-lg font-bold text-slate-800 truncate" title={selectedMetadata.name}>
                {selectedMetadata.name}
              </h4>

              <p className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                Ready for {activeMode === 'optimize' ? 'lossy 8-bit optimization' : 'instant format conversion'}
              </p>
            </div>

            {!disabled && (
              <button
                type="button"
                onClick={onClearFile}
                className="p-2.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                title="Change or remove file"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
