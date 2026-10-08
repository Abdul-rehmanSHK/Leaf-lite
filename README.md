# 🍃 LeafLite Studio

> High-performance, stateless image optimization, format conversion, and document processing suite.

[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2014-black?style=flat&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Language-Python%203.10+-3776AB?style=flat&logo=python)](https://python.org/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)

---

## ✨ Features

### ⚡ 1. Intelligent Image Compressor
- **Custom Quality Control**: Fine-tune compression levels (Max 60%, Balanced 80%, High Quality 92%, or custom slider 10–100%).
- **Native Format Preservation**: Compresses JPG to JPG, PNG to PNG, and WebP to WebP by default.
- **Convert to WebP Toggle**: Optional toggle to convert images to WebP during compression for massive size reductions (up to 85%+).

### 🔄 2. Smart Format Converter
- **Auto-Detection**: Automatically detects input image formats (PNG, JPG, WebP, AVIF, SVG, GIF, BMP, HEIC).
- **Intelligent Options**: Automatically disables the source format and offers valid target format options (`WEBP`, `JPG`, `PNG`, `AVIF`, `SVG`).

### 📦 3. Batch Processing & 1-Click ZIP Download
- **Up to 10 Images Simultaneously**: Drag & drop or select multiple images at once.
- **Interactive Carousel**: Preview card with transparent checkerboard background, filename, format badge, and thumbnail navigation.
- **1-Click ZIP Download**: Package and download all processed files in a single `.zip` file via client-side `JSZip`, or download files individually.

### 🎯 4. Results Popup Modal
- **Clean UI**: Processing results appear in a sleek popup dialog instead of stretching the main card.
- **Detailed Savings Breakdown**: View original size vs. optimized size with exact percentage savings.

### 🎨 5. Photoshop Canvas & Resize Studio (Full-Screen Studio)
- **Photoshop Shortcuts**: `Ctrl+N` for custom canvas resolutions, `Ctrl+T` free transform bounding box with 8 anchor handles, and `Shift` aspect ratio constraint lock.
- **Multi-Document Tabs**: Manage multiple canvas tabs simultaneously.
- **Multi-Layer Stacking**: Add, reorder, duplicate, hide, and lock image layers.
- **Direct Canvas Export**: Export high-resolution canvases to WebP, PNG, or JPG with quality controls.

### 📄 6. Photoshop PSD Layer Studio (Exact PSD Inspector & Exporter)
- **Full-Screen Workspace**: Dedicated full-bleed workspace with top navbar navigation.
- **Fluid Pan & Move**: Spacebar drag panning, Hand tool (`H`), mouse wheel scrolling for tall landing pages, and `↔️ Fit Width` / `🔲 Fit All` presets.
- **100% Adobe Composite Fidelity**: Exact composite rendering backed by `psd-tools` and hardware-accelerated Blob URLs.
- **Layer Hierarchy & Search**: Inspect layer folders, filter layers in real-time, and jump directly to any layer.
- **CSS & Typography Extraction**: 1-click copy for font family, font size, weight, line height, letter spacing, hex colors, and exact CSS rules.
- **Toggleable Measurement Guides**: Inspect spacing calipers and bounding boxes with 1-click guide toggle.
- **Individual Layer Exporter**: Export and optimize layers directly to WebP, PNG, or JPG.

### 🌐 7. PSD to HTML & Tailwind Studio (Trained Code & Asset Generator)
- **Trained on Real Human-Coded Reference**: Calibrated with the 1920×9934px Marine Construction design to output clean semantic HTML5, BEM naming, and modern design tokens (`--primary: #003478`, `--secondary: #0088ce`).
- **Rule-Based Geometric Engine**: Detects headers, hero banners, 2-column features, card grids, statistics counters, testimonials, and footers with exact padding and margin math.
- **Dual Code Outputs**: 1-click instant toggle between **Modern Semantic CSS** and **Tailwind CSS**.
- **Automated WebP Asset Slicing**: Extracts and optimizes all images, logos, and photos directly into an `images/` directory.
- **Interactive Multi-Device Preview**: Live sandbox preview with instant breakpoint toggles (Desktop 🖥️, Laptop 💻, Tablet 📱, Mobile 📱) and full-screen preview.
- **1-Click Complete Project ZIP Download**: Packages `index.html`, `tailwind.html`, `css/style.css`, and all sliced WebP assets into a deployment-ready ZIP archive.

### 🛠️ 8. Specialized Suite Tools
- **Target KB Reducer**: Compress images to meet strict maximum file size thresholds (e.g., under 100 KB or 200 KB).
- **PDF Merger**: Combine multiple PDF files into one clean document with custom page ordering.
- **Quality & Sharpness Checker**: Laplacian variance and entropy scoring for blur detection.
- **Dimensions Inspector**: Detailed width, height, aspect ratio, orientation, and print DPI diagnostics.
- **EXIF Metadata Viewer & Sanitizer**: Inspect camera hardware, GPS coordinates, and strip all EXIF tags for complete privacy.

---

## 🏗️ Architecture & Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons, JSZip.
- **Backend API**: FastAPI, Python 3.10+, Uvicorn, Celery (with local multi-threading fallback), Redis.
- **Image Processing Engines**: `pyvips` (libvips C-library), Pillow (PIL), `pngquant` 8-bit quantization, `potrace` raster-to-vector tracing.
- **Deployment**: Docker, Docker Compose, Linux systemd configuration scripts.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js** (v18 or newer)
- **Python** (v3.10 or newer)
- **Git**

---

### 1. Clone the Repository
```bash
git clone https://github.com/Abdul-rehmanSHK/Leaf-lite.git
cd Leaf-lite
```

---

### ⚡ Fast Start (Run Full Stack with 1 Command)
From the project root:
```bash
# Start both Backend (:8000) and Frontend (:3000) simultaneously
npm run dev

# Or on Windows, double-click run.bat
```
Visit **[http://localhost:3000](http://localhost:3000)**.

---

### 2. Set Up & Run the Backend
```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment (optional but recommended)
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Start FastAPI backend server (Port 8000)
python -m uvicorn main:app --reload --port 8000
```
> The API will be active at `http://localhost:8000`.  
> Interactive Swagger documentation is available at `http://localhost:8000/docs`.

---

### 3. Set Up & Run the Frontend
Open a new terminal window:
```bash
# From project root
cd frontend

# Install dependencies
npm install

# Start Next.js development server (Port 3000)
npm run dev
```

---

### 4. Open in Browser
Visit **[http://localhost:3000](http://localhost:3000)** to access the LeafLite Studio interface.

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | API Health Check and Web Studio Hub gateway |
| `POST` | `/upload` | Upload single or chunked image with target format & quality |
| `GET` | `/status/{job_id}` | Poll processing progress percentage (0–100%) and metrics |
| `GET` | `/download/{job_id}` | Download processed image with auto ephemeral cleanup |
| `POST` | `/api/tools/resize` | Resize image by percentage or exact pixel dimensions |
| `POST` | `/api/tools/kb-reducer` | Compress image to strict target file size in KB |
| `POST` | `/api/tools/merge-pdf` | Merge multiple PDF documents with custom ordering |
| `POST` | `/api/tools/quality-checker`| Analyze sharpness, texture entropy, and blur score |
| `POST` | `/api/tools/dimensions-checker` | Inspect dimensions, aspect ratio, orientation, and DPI |
| `POST` | `/api/tools/exif` | View camera, shutter, and GPS metadata |
| `POST` | `/api/tools/exif/strip` | Strip 100% of metadata for a sanitized, privacy-safe file |

---

## 🐳 Docker Deployment

To spin up the entire LeafLite stack (FastAPI backend, Celery worker, Redis, and Next.js frontend) with Docker Compose:

```bash
docker-compose up -d --build
```

---

## 📄 License

This project is licensed under the MIT License.