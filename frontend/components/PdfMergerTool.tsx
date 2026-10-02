'use client';

import React, { useState, useRef } from 'react';
import {
  FileText,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  ArrowRightLeft,
  Sparkles,
  Layers
} from 'lucide-react';

interface PdfMergerToolProps {
  backendUrl: string;
}

interface PdfFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
}

export const PdfMergerTool: React.FC<PdfMergerToolProps> = ({ backendUrl }) => {
  const [files, setFiles] = useState<PdfFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesAdded = (fileList: FileList | File[]) => {
    setError(null);
    setResult(null);

    const newItems: PdfFileItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        newItems.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          file: f,
          name: f.name,
          size: f.size,
        });
      }
    }

    if (newItems.length === 0) {
      setError('Please select valid PDF documents (.pdf).');
      return;
    }

    setFiles((prev) => [...prev, ...newItems]);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === files.length - 1)
    ) {
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...files];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setFiles(updated);
  };

  const removeItem = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (files.length <= 1) setResult(null);
  };

  const handleReverseOrder = () => {
    setFiles((prev) => [...prev].reverse());
  };

  const handleSortAlphabetical = () => {
    setFiles((prev) =>
      [...prev].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    );
  };

  const handleClearAll = () => {
    setFiles([]);
    setResult(null);
    setError(null);
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      setError('Please add at least 2 PDF documents to merge.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((item) => {
        formData.append('files', item.file);
      });
      // Order is sequential 0, 1, 2, ...
      const orderStr = files.map((_, idx) => idx).join(',');
      formData.append('order', orderStr);

      const res = await fetch(`${backendUrl}/api/tools/merge-pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'PDF merge failed');
      }

      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setError(err.message || 'Failed to merge PDF documents.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
        accept="application/pdf"
        multiple
        className="hidden"
      />

      {files.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative group cursor-pointer overflow-hidden rounded-3xl p-10 sm:p-14 flex flex-col items-center justify-center text-center bg-white border-2 border-dashed border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-105 group-hover:bg-emerald-100 transition-all">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-1">
            Merge Multiple <span className="text-emerald-600">PDF Documents</span>
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4">
            Upload two or more PDF files, rearrange their order with ▲ / ▼ controls or quick sort, and merge into a single PDF.
          </p>
          <span className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all">
            Select PDF Files
          </span>
        </div>
      ) : (
        /* PDF Queue & Order Configuration */
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-xl shadow-emerald-950/5">
          {/* Header & Quick Reorder Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                PDF Order Configuration ({files.length} documents)
              </h4>
              <p className="text-xs text-slate-500">
                Documents will be merged top-to-bottom in the exact sequence shown below.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReverseOrder}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 text-xs font-semibold flex items-center gap-1 transition-all"
                title="Reverse order"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Reverse
              </button>
              <button
                type="button"
                onClick={handleSortAlphabetical}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 text-xs font-semibold transition-all"
                title="Sort A-Z"
              >
                Sort A-Z
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add More
              </button>
            </div>
          </div>

          {/* List of PDFs with Move Up / Move Down buttons */}
          <div className="space-y-2.5 mb-6">
            {files.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-emerald-200 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-xs truncate max-w-xs sm:max-w-md">
                      {item.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">{formatSize(item.size)}</p>
                  </div>
                </div>

                {/* Order Buttons */}
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                    title="Move up in order"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === files.length - 1}
                    className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                    title="Move down in order"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 cursor-pointer transition-colors ml-1"
                    title="Remove PDF"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleMerge}
              disabled={isProcessing || files.length < 2}
              className={`flex-1 py-4 rounded-2xl font-bold text-white shadow-lg flex items-center justify-center gap-2 text-sm transition-all ${
                isProcessing || files.length < 2
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 active:scale-[0.99]'
              }`}
            >
              <Layers className="w-4 h-4" />
              {isProcessing
                ? 'Merging Documents...'
                : `Merge ${files.length} PDFs into One Document`}
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={isProcessing}
              className="px-4 py-4 rounded-2xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-xs transition-all"
            >
              Clear All
            </button>
          </div>
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
                <h4 className="font-bold text-slate-900 text-sm">PDFs Merged Successfully!</h4>
                <p className="text-xs text-slate-500">{result.download_filename}</p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {result.total_pages} Total Pages
            </span>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 mb-6 text-center text-xs">
            <div>
              <p className="text-slate-400 font-semibold uppercase text-[10px]">Files Merged</p>
              <p className="font-bold text-slate-700 mt-0.5">{result.total_files} documents</p>
            </div>
            <div className="border-x border-emerald-100">
              <p className="text-emerald-600 font-semibold uppercase text-[10px]">Total Pages</p>
              <p className="font-extrabold text-emerald-700 mt-0.5">{result.total_pages} pages</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase text-[10px]">Final Size</p>
              <p className="font-bold text-slate-700 mt-0.5">{result.merged_size_formatted}</p>
            </div>
          </div>

          {/* Merged File Order Summary */}
          {result.file_summaries && (
            <div className="mb-6 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <p className="font-bold text-slate-700 mb-2">Merged Sequence:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                {result.file_summaries.map((s: any) => (
                  <li key={s.order}>
                    <span className="font-semibold text-slate-800">{s.filename}</span> —{' '}
                    {s.pages} pages ({s.size})
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Download & Reset */}
          <div className="flex gap-3">
            <a
              href={`${backendUrl}${result.download_url}`}
              className="flex-1 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm transition-all"
            >
              <Download className="w-4 h-4" />
              Download Combined PDF ({result.merged_size_formatted})
            </a>
            <button
              type="button"
              onClick={handleClearAll}
              className="px-5 py-3.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 text-sm transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Merge Another Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
