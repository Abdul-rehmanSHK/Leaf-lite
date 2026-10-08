import os
import re
import json
import uuid
import shutil
import tempfile
import threading
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    BackgroundTasks,
    Depends,
    Request,
    status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from celery.result import AsyncResult

from celery_config import celery_app
from worker import optimize_image_task, delete_file_task, execute_optimization
from dependencies import get_db, get_current_user, UserContext
from tools_service import (
    check_image_dimensions,
    check_image_quality,
    get_exif_metadata,
    strip_exif_metadata,
    resize_image_tool,
    reduce_image_to_target_kb,
    merge_pdf_documents,
    optimize_image_direct,
    inspect_psd_file
)

# Initialize FastAPI application
app = FastAPI(
    title="LeafLite Image Optimization & PDF API",
    description="""
    Stateless, high-performance image optimization, conversion, and document processing API.
    <br><br>
    🚀 <b><a href="http://localhost:3000" target="_blank" style="display:inline-block; background-color:#10b981; color:white; padding:8px 16px; border-radius:8px; text-decoration:none; font-weight:bold;">👉 Open LeafLite Web Studio (http://localhost:3000)</a></b>
    """,
    version="2.0.0",
    swagger_ui_parameters={
        "docExpansion": "list",
        "defaultModelsExpandDepth": -1,
        "displayRequestDuration": True,
        "filter": True
    }
)

# CORS configuration to allow local & production Next.js frontend
raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = ["*"] if raw_origins.strip() == "*" else [o.strip() for o in raw_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True if ALLOWED_ORIGINS != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ephemeral storage directory configuration
DEFAULT_DIR = "/tmp/leaflite_uploads" if os.name != "nt" else str(Path(tempfile.gettempdir()) / "leaflite_uploads")
STORAGE_DIR = Path(os.getenv("LEAFLITE_STORAGE_DIR", DEFAULT_DIR))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

CHUNK_TEMP_DIR = STORAGE_DIR / "chunks"
CHUNK_TEMP_DIR.mkdir(parents=True, exist_ok=True)

SUPPORTED_FORMATS = {"JPG", "JPEG", "PNG", "WEBP", "SVG"}

# Local in-memory store for fallback execution
LOCAL_JOBS: Dict[str, Dict[str, Any]] = {}


def _run_local_optimization(job_id: str, input_path: str, target_format: str, original_filename: str, quality: int = 80):
    """Executes optimization in a local worker thread when Redis/Celery is offline."""
    LOCAL_JOBS[job_id] = {
        "status": "PROCESSING",
        "progress": 30,
        "message": f"Processing image to {target_format} (Quality={quality}%)..."
    }

    def progress_cb(pct, msg):
        if job_id in LOCAL_JOBS:
            LOCAL_JOBS[job_id]["progress"] = pct
            LOCAL_JOBS[job_id]["message"] = msg

    try:
        res = execute_optimization(
            job_id=job_id,
            input_path=input_path,
            target_format=target_format,
            original_filename=original_filename,
            quality=quality,
            progress_callback=progress_cb
        )
        LOCAL_JOBS[job_id] = {
            "status": "SUCCESS",
            "progress": 100,
            **res
        }
    except Exception as exc:
        LOCAL_JOBS[job_id] = {
            "status": "FAILED",
            "progress": 100,
            "error": str(exc)
        }


@app.get(
    "/",
    tags=["System Health"],
    summary="API Health Check & Web Studio Hub",
    description="Returns the status of the LeafLite API service and quick links to the Web Studio."
)
def health_check(request: Request):
    """Health check & gateway endpoint supporting content negotiation."""
    accept = request.headers.get("accept", "")
    if "text/html" in accept:
        return HTMLResponse("""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>LeafLite Studio - Gateway</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fafbfc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
                .card { background: white; border: 1px solid #e2e8f0; border-radius: 24px; padding: 40px; max-width: 540px; width: 100%; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05); }
                .badges { display: flex; gap: 8px; justify-content: center; margin-bottom: 18px; flex-wrap: wrap; }
                .badge { display: inline-flex; align-items: center; gap: 6px; background: #ecfdf5; color: #065f46; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 999px; border: 1px solid #a7f3d0; }
                .badge-warn { background: #fef3c7; color: #92400e; border-color: #fde68a; }
                .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
                .dot-warn { background: #f59e0b; }
                h1 { font-size: 26px; font-weight: 800; margin: 0 0 10px; }
                p { color: #64748b; font-size: 15px; line-height: 1.5; margin: 0 0 24px; }
                .btn { display: block; background: #10b981; color: white; text-decoration: none; padding: 14px 24px; border-radius: 14px; font-weight: 700; font-size: 15px; margin-bottom: 12px; transition: all 0.2s; box-shadow: 0 10px 15px -3px rgba(16,185,129,0.3); }
                .btn:hover { background: #059669; }
                .btn-secondary { background: #f1f5f9; color: #334155; box-shadow: none; }
                .btn-secondary:hover { background: #e2e8f0; }
                .notice-box { margin-top: 16px; padding: 14px 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; text-align: left; font-size: 13px; color: #475569; line-height: 1.6; }
                .notice-box code { background: #e2e8f0; color: #0f172a; padding: 2px 6px; border-radius: 6px; font-size: 12px; font-family: monospace; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="badges">
                    <span class="badge"><span class="dot"></span> Backend API: Online (:8000)</span>
                    <span id="frontend-badge" class="badge badge-warn"><span class="dot dot-warn"></span> Checking Web Studio (:3000)...</span>
                </div>
                <h1>LeafLite Studio Gateway</h1>
                <p>The high-performance image optimization & document processing engine is active.</p>
                <a id="launch-btn" href="http://localhost:3000" class="btn">👉 Launch LeafLite Web Studio (Port 3000)</a>
                <a href="/docs" class="btn btn-secondary">Explore Interactive Swagger API Docs (/docs)</a>
                <div id="offline-tip" class="notice-box" style="display:none;">
                    💡 <b>Looking for the Web UI?</b> If port 3000 says "site can't be reached", start both Frontend and Backend together by opening a terminal in the project root and running:
                    <br><br>
                    <code>npm run dev</code> &nbsp;or double-click <code>run.bat</code>
                </div>
            </div>
            <script>
                fetch('http://localhost:3000', { mode: 'no-cors' })
                    .then(() => {
                        const badge = document.getElementById('frontend-badge');
                        badge.className = 'badge';
                        badge.innerHTML = '<span class="dot"></span> Web Studio: Online (:3000)';
                    })
                    .catch(() => {
                        const badge = document.getElementById('frontend-badge');
                        badge.className = 'badge badge-warn';
                        badge.innerHTML = '<span class="dot dot-warn"></span> Web Studio: Offline (:3000)';
                        document.getElementById('offline-tip').style.display = 'block';
                    });
            </script>
        </body>
        </html>
        """)

    return JSONResponse({
        "service": "LeafLite API",
        "status": "online",
        "storage_dir": str(STORAGE_DIR),
        "frontend_url": "http://localhost:3000",
        "docs_url": "http://localhost:8000/docs"
    })


@app.post(
    "/upload",
    tags=["Image Optimization Pipeline"],
    summary="Upload & Enqueue Image with Quality Percentage",
    description="Accepts single image uploads or chunked parts with custom compression percentage (10-100%)."
)
async def upload_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Image file to convert (PNG, JPG, WEBP, SVG)"),
    target_format: str = Form("WEBP", description="Target output format: WEBP, JPG, PNG, or SVG"),
    quality: int = Form(80, description="Quality percentage: 10 to 100"),
    # Chunking parameters (optional)
    chunk_index: Optional[int] = Form(None, description="Index of current chunk"),
    total_chunks: Optional[int] = Form(None, description="Total number of chunks"),
    upload_id: Optional[str] = Form(None, description="Shared ID for the chunked session"),
    db: Optional[object] = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    target_format = target_format.upper().strip()
    if target_format not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported target format '{target_format}'. Supported: {', '.join(SUPPORTED_FORMATS)}"
        )

    quality = max(10, min(100, int(quality)))

    # Handle Chunked Upload Assembly
    if chunk_index is not None and total_chunks is not None and upload_id:
        active_upload_id = upload_id
        chunk_file_path = CHUNK_TEMP_DIR / f"{active_upload_id}.part_{chunk_index}"

        with open(chunk_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        existing_chunks = list(CHUNK_TEMP_DIR.glob(f"{active_upload_id}.part_*"))
        if len(existing_chunks) < total_chunks:
            return {
                "status": "CHUNK_RECEIVED",
                "upload_id": active_upload_id,
                "chunks_received": len(existing_chunks),
                "total_chunks": total_chunks
            }

        job_id = active_upload_id
        original_ext = Path(file.filename or "uploaded_image").suffix or ".bin"
        assembled_file_path = STORAGE_DIR / f"{job_id}_raw{original_ext}"

        with open(assembled_file_path, "wb") as outfile:
            for idx in range(total_chunks):
                part_path = CHUNK_TEMP_DIR / f"{active_upload_id}.part_{idx}"
                if part_path.exists():
                    with open(part_path, "rb") as infile:
                        shutil.copyfileobj(infile, outfile)
                    os.remove(part_path)

        saved_input_path = assembled_file_path
    else:
        # Standard Single File Upload
        job_id = str(uuid.uuid4())
        original_ext = Path(file.filename or "uploaded_image").suffix or ".bin"
        raw_file_path = STORAGE_DIR / f"{job_id}_raw{original_ext}"

        with open(raw_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        saved_input_path = raw_file_path

    dispatched_to_celery = False

    def _is_redis_available():
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.1)
            s.connect(("127.0.0.1", 6379))
            s.close()
            return True
        except Exception:
            return False

    if _is_redis_available():
        try:
            task = optimize_image_task.apply_async(
                kwargs={
                    "job_id": job_id,
                    "input_path": str(saved_input_path),
                    "target_format": target_format,
                    "original_filename": file.filename or f"image{original_ext}",
                    "quality": quality
                },
                task_id=job_id
            )
            dispatched_to_celery = True
        except Exception:
            dispatched_to_celery = False

    if not dispatched_to_celery:
        threading.Thread(
            target=_run_local_optimization,
            args=(job_id, str(saved_input_path), target_format, file.filename or f"image{original_ext}", quality),
            daemon=True
        ).start()

    return {
        "job_id": job_id,
        "status": "QUEUED",
        "target_format": target_format,
        "quality": quality,
        "filename": file.filename,
        "engine": "celery_redis" if dispatched_to_celery else "local_thread_fallback",
        "poll_url": f"/status/{job_id}"
    }


@app.get(
    "/status/{job_id}",
    tags=["Image Optimization Pipeline"],
    summary="Poll Job Status & Metrics",
    description="Returns real-time progress percentage (0-100%), current status, and file size savings comparison."
)
async def get_job_status(
    job_id: str,
    db: Optional[object] = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    # 1. Check local fallback jobs first
    if job_id in LOCAL_JOBS:
        local_data = LOCAL_JOBS[job_id]
        if local_data["status"] == "SUCCESS":
            return {
                "job_id": job_id,
                "status": "SUCCESS",
                "progress": 100,
                "original_filename": local_data.get("original_filename"),
                "download_filename": local_data.get("download_filename"),
                "target_format": local_data.get("target_format"),
                "quality": local_data.get("quality"),
                "original_size": local_data.get("original_size"),
                "optimized_size": local_data.get("optimized_size"),
                "saved_bytes": local_data.get("saved_bytes"),
                "saved_percent": local_data.get("saved_percent"),
                "download_url": f"/download/{job_id}"
            }
        elif local_data["status"] == "FAILED":
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "job_id": job_id,
                    "status": "FAILED",
                    "progress": 100,
                    "error": local_data.get("error", "Optimization failed.")
                }
            )
        else:
            return {
                "job_id": job_id,
                "status": "PROCESSING",
                "progress": local_data.get("progress", 50),
                "message": local_data.get("message", "Processing image...")
            }

    # 2. Check Celery AsyncResult
    try:
        async_result = AsyncResult(job_id, app=celery_app)
        if async_result.state == "PENDING":
            return {
                "job_id": job_id,
                "status": "PENDING",
                "progress": 10,
                "message": "Task queued in Celery worker..."
            }
        elif async_result.state == "PROGRESS":
            meta = async_result.info or {}
            return {
                "job_id": job_id,
                "status": "PROCESSING",
                "progress": meta.get("percent", 50),
                "message": meta.get("message", "Optimizing image...")
            }
        elif async_result.state == "SUCCESS":
            result_data = async_result.result
            return {
                "job_id": job_id,
                "status": "SUCCESS",
                "progress": 100,
                "original_filename": result_data.get("original_filename"),
                "download_filename": result_data.get("download_filename"),
                "target_format": result_data.get("target_format"),
                "quality": result_data.get("quality"),
                "original_size": result_data.get("original_size"),
                "optimized_size": result_data.get("optimized_size"),
                "saved_bytes": result_data.get("saved_bytes"),
                "saved_percent": result_data.get("saved_percent"),
                "download_url": f"/download/{job_id}"
            }
        elif async_result.state == "FAILURE":
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "job_id": job_id,
                    "status": "FAILED",
                    "progress": 100,
                    "error": str(async_result.info) or "Image conversion failed."
                }
            )
    except Exception:
        pass

    return {
        "job_id": job_id,
        "status": "NOT_FOUND",
        "progress": 0
    }


# ==============================================================================
# SPECIALIZED IMAGE & PDF TOOLS ENDPOINTS
# ==============================================================================

@app.post(
    "/api/tools/resize",
    tags=["Specialized Tools"],
    summary="Resize Image (Scale Percentage or Exact Pixels)",
    description="Resizes image by scale percentage (10-200%) or exact dimensions with aspect-ratio locking and Lanczos filter."
)
async def api_resize_image(
    file: UploadFile = File(..., description="Image to resize"),
    scale_percent: Optional[int] = Form(None, description="Resize percentage, e.g. 50"),
    target_width: Optional[int] = Form(None, description="Target width in pixels"),
    target_height: Optional[int] = Form(None, description="Target height in pixels"),
    keep_aspect_ratio: bool = Form(True, description="Maintain aspect ratio"),
    target_format: Optional[str] = Form(None, description="Output format (JPEG, PNG, WEBP)"),
    quality: int = Form(85, description="Image quality 10-100")
):
    job_id = str(uuid.uuid4())
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    raw_path = STORAGE_DIR / f"{job_id}_raw{ext}"
    with open(raw_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    out_ext = f".{target_format.lower()}" if target_format else ext
    if out_ext.lower() == ".jpeg":
        out_ext = ".jpg"
    out_path = STORAGE_DIR / f"{job_id}_resized{out_ext}"

    try:
        res = resize_image_tool(
            input_path=raw_path,
            output_path=out_path,
            scale_percent=scale_percent,
            target_width=target_width,
            target_height=target_height,
            keep_aspect_ratio=keep_aspect_ratio,
            output_format=target_format,
            quality=quality
        )
        base_name = Path(file.filename or "image").stem
        download_name = f"{base_name}_resized_{res['new_width']}x{res['new_height']}{out_ext}"

        LOCAL_JOBS[job_id] = {
            "status": "SUCCESS",
            "output_path": str(out_path),
            "download_filename": download_name,
            **res
        }
        return {
            "job_id": job_id,
            "download_url": f"/download/{job_id}",
            "download_filename": download_name,
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/api/tools/kb-reducer",
    tags=["Specialized Tools"],
    summary="Image KB Reducer",
    description="Compresses an image to hit a strict maximum file size in kilobytes (e.g. under 100 KB or 200 KB)."
)
async def api_reduce_kb(
    file: UploadFile = File(..., description="Image to reduce"),
    target_kb: int = Form(..., description="Target file size in KB (e.g. 100)"),
    target_format: Optional[str] = Form(None, description="Target format (JPEG, WEBP, PNG)")
):
    if target_kb <= 0:
        raise HTTPException(status_code=400, detail="Target KB must be greater than 0.")

    job_id = str(uuid.uuid4())
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    raw_path = STORAGE_DIR / f"{job_id}_raw{ext}"
    with open(raw_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    out_ext = f".{target_format.lower()}" if target_format else ext
    out_path = STORAGE_DIR / f"{job_id}_reduced{out_ext}"

    try:
        res = reduce_image_to_target_kb(
            input_path=raw_path,
            output_path=out_path,
            target_kb=target_kb,
            output_format=target_format
        )
        base_name = Path(file.filename or "image").stem
        download_name = f"{base_name}_{target_kb}kb{out_ext}"

        LOCAL_JOBS[job_id] = {
            "status": "SUCCESS",
            "output_path": str(out_path),
            "download_filename": download_name,
            **res
        }
        return {
            "job_id": job_id,
            "download_url": f"/download/{job_id}",
            "download_filename": download_name,
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/api/tools/merge-pdf",
    tags=["Specialized Tools"],
    summary="Merge PDF Documents with Custom Order",
    description="Uploads multiple PDF files, merges them in the exact specified order, and provides a merged PDF download."
)
async def api_merge_pdfs(
    files: List[UploadFile] = File(..., description="PDF files to merge"),
    order: Optional[str] = Form(None, description="Comma-separated zero-indexed file order (e.g. '0,2,1')")
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 PDF files to merge.")

    job_id = str(uuid.uuid4())
    saved_paths: List[Path] = []

    for idx, f in enumerate(files):
        p = STORAGE_DIR / f"{job_id}_part_{idx}.pdf"
        with open(p, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        saved_paths.append(p)

    out_path = STORAGE_DIR / f"{job_id}_merged.pdf"

    parsed_order = None
    if order:
        try:
            parsed_order = [int(x.strip()) for x in order.split(",") if x.strip().isdigit()]
        except Exception:
            parsed_order = None

    try:
        res = merge_pdf_documents(
            pdf_paths=saved_paths,
            output_path=out_path,
            order=parsed_order
        )
        download_name = "LeafLite_Merged_Document.pdf"
        LOCAL_JOBS[job_id] = {
            "status": "SUCCESS",
            "output_path": str(out_path),
            "download_filename": download_name,
            **res
        }
        return {
            "job_id": job_id,
            "download_url": f"/download/{job_id}",
            "download_filename": download_name,
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/api/tools/quality-checker",
    tags=["Specialized Tools"],
    summary="Image Quality & Blur Checker",
    description="Analyzes Laplacian sharpness variance, Shannon texture entropy, contrast standard deviation, and provides a 0-100 quality score."
)
async def api_check_quality(
    file: UploadFile = File(..., description="Image to analyze")
):
    temp_path = STORAGE_DIR / f"temp_check_{uuid.uuid4()}{Path(file.filename or 'img.jpg').suffix}"
    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        res = check_image_quality(temp_path)
        return res
    finally:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except Exception:
                pass


@app.post(
    "/api/tools/dimensions-checker",
    tags=["Specialized Tools"],
    summary="Image Dimensions & Aspect Ratio Checker",
    description="Inspects width, height, aspect ratio, orientation, megapixels, 300/150/72 DPI print sizes, and social media readiness."
)
async def api_check_dimensions(
    file: UploadFile = File(..., description="Image to inspect")
):
    temp_path = STORAGE_DIR / f"temp_dim_{uuid.uuid4()}{Path(file.filename or 'img.jpg').suffix}"
    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        res = check_image_dimensions(temp_path)
        return res
    finally:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except Exception:
                pass


@app.post(
    "/api/tools/exif",
    tags=["Specialized Tools"],
    summary="EXIF & GPS Metadata Viewer",
    description="Extracts camera hardware, exposure, lens, date taken, GPS coordinates, and provides privacy risk analysis."
)
async def api_get_exif(
    file: UploadFile = File(..., description="Image to inspect EXIF")
):
    temp_path = STORAGE_DIR / f"temp_exif_{uuid.uuid4()}{Path(file.filename or 'img.jpg').suffix}"
    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        res = get_exif_metadata(temp_path)
        return res
    finally:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except Exception:
                pass


@app.post(
    "/api/tools/exif/strip",
    tags=["Specialized Tools"],
    summary="EXIF Remover / Metadata Stripper",
    description="Strips 100% of metadata, camera tags, and GPS coordinates to produce a privacy-safe sanitized image."
)
async def api_strip_exif(
    file: UploadFile = File(..., description="Image to strip EXIF from")
):
    job_id = str(uuid.uuid4())
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    raw_path = STORAGE_DIR / f"{job_id}_raw{ext}"
    with open(raw_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    out_path = STORAGE_DIR / f"{job_id}_clean{ext}"

    try:
        res = strip_exif_metadata(input_path=raw_path, output_path=out_path)
        base_name = Path(file.filename or "image").stem
        download_name = f"{base_name}_sanitized_clean{ext}"

        LOCAL_JOBS[job_id] = {
            "status": "SUCCESS",
            "output_path": str(out_path),
            "download_filename": download_name,
            **res
        }
        return {
            "job_id": job_id,
            "download_url": f"/download/{job_id}",
            "download_filename": download_name,
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/api/tools/optimize-direct",
    tags=["Specialized Tools"],
    summary="Direct Single-Image or Layer Optimization",
    description="Directly converts and compresses any image raster or extracted PSD layer into WEBP, PNG, or JPG."
)
async def api_optimize_direct(
    file: UploadFile = File(..., description="Image or canvas raster to optimize"),
    target_format: str = Form("WEBP", description="Target format (WEBP, PNG, JPG)"),
    quality: int = Form(85, description="Quality percentage (10-100)")
):
    job_id = str(uuid.uuid4())
    in_ext = Path(file.filename or "image.png").suffix or ".png"
    raw_path = STORAGE_DIR / f"{job_id}_raw{in_ext}"
    with open(raw_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    fmt = target_format.upper().strip()
    out_ext = ".jpg" if fmt in ("JPG", "JPEG") else (".png" if fmt == "PNG" else ".webp")
    out_path = STORAGE_DIR / f"{job_id}_opt{out_ext}"

    try:
        res = optimize_image_direct(
            input_path=raw_path,
            output_path=out_path,
            output_format=fmt,
            quality=quality
        )
        base_name = Path(file.filename or "layer").stem
        download_name = f"{base_name}_optimized{out_ext}"

        LOCAL_JOBS[job_id] = {
            "status": "SUCCESS",
            "output_path": str(out_path),
            "download_filename": download_name,
            **res
        }
        return {
            "job_id": job_id,
            "download_url": f"/download/{job_id}",
            "download_filename": download_name,
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/api/tools/psd/inspect",
    tags=["PSD Tools"],
    summary="Inspect Adobe Photoshop (.psd) Document",
    description="Extracts layer hierarchy, positions, bounding boxes, text content, font specs, and composite image."
)
async def api_inspect_psd(
    file: UploadFile = File(..., description="Photoshop .psd file to inspect")
):
    job_id = str(uuid.uuid4())
    raw_path = STORAGE_DIR / f"{job_id}_doc.psd"
    with open(raw_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    composite_path = STORAGE_DIR / f"{job_id}_composite.png"

    try:
        res = inspect_psd_file(psd_path=raw_path, composite_output_path=composite_path)
        comp_url = f"/download/{job_id}" if composite_path.exists() else None
        if composite_path.exists():
            LOCAL_JOBS[job_id] = {
                "status": "SUCCESS",
                "output_path": str(composite_path),
                "download_filename": f"{Path(file.filename or 'document').stem}_preview.png"
            }
        return {
            "job_id": job_id,
            "filename": file.filename,
            "composite_url": comp_url,
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ==============================================================================
# PSD TO HTML & TAILWIND SUITE ENDPOINTS
# ==============================================================================

@app.post(
    "/api/tools/psd-to-html/convert",
    tags=["PSD Tools"],
    summary="Convert Photoshop PSD to HTML & Tailwind Bundle",
    description="Parses PSD layers, extracts typography & layout tokens, slices all raster assets into WebP, and generates HTML + CSS + Tailwind bundle."
)
async def api_psd_to_html_convert(
    file: UploadFile = File(..., description="Photoshop .psd file to convert")
):
    from psd_to_html_engine import PsdToHtmlEngine
    job_id = str(uuid.uuid4())
    raw_path = STORAGE_DIR / f"{job_id}_doc.psd"
    with open(raw_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    job_output_dir = STORAGE_DIR / f"psd_html_{job_id}"
    job_output_dir.mkdir(parents=True, exist_ok=True)

    try:
        engine = PsdToHtmlEngine(psd_path=raw_path, output_dir=job_output_dir, job_id=job_id)
        result = engine.parse_and_generate()

        zip_path = Path(result["zip_path"])
        LOCAL_JOBS[job_id] = {
            "status": "SUCCESS",
            "output_path": str(zip_path),
            "download_filename": result["zip_filename"]
        }

        return {
            "job_id": job_id,
            "zip_download_url": f"/download/{job_id}",
            **result
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post(
    "/api/tools/psd-to-html/sample",
    tags=["PSD Tools"],
    summary="Load Pre-Trained Marine Construction PSD Sample",
    description="Instantly generates or returns pre-cached HTML & Tailwind bundle for the training design reference."
)
async def api_psd_to_html_sample():
    from psd_to_html_engine import PsdToHtmlEngine
    project_root = Path(__file__).resolve().parent.parent
    sample_psd = project_root / "design.psd" / "Marine Construction Homepage 08-26-2026.psd"
    if not sample_psd.exists():
        alt = list((project_root / "design.psd").glob("*.psd"))
        if alt:
            sample_psd = alt[0]
        else:
            raise HTTPException(status_code=404, detail="Sample PSD reference not found.")

    job_id = "sample_marine_construction"
    job_output_dir = STORAGE_DIR / f"psd_html_{job_id}"
    job_output_dir.mkdir(parents=True, exist_ok=True)

    zip_path = job_output_dir / "marine-construction-homepage-08-26-2026_html_bundle.zip"
    cached_json = job_output_dir / "result_cache.json"

    if cached_json.exists() and zip_path.exists():
        try:
            with open(cached_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            LOCAL_JOBS[job_id] = {
                "status": "SUCCESS",
                "output_path": str(zip_path),
                "download_filename": zip_path.name
            }
            return {
                "job_id": job_id,
                "zip_download_url": f"/download/{job_id}",
                **data
            }
        except Exception:
            pass

    engine = PsdToHtmlEngine(psd_path=sample_psd, output_dir=job_output_dir, job_id=job_id)
    result = engine.parse_and_generate()

    LOCAL_JOBS[job_id] = {
        "status": "SUCCESS",
        "output_path": result["zip_path"],
        "download_filename": result["zip_filename"]
    }

    try:
        cache_to_save = {k: v for k, v in result.items() if k != "zip_path"}
        with open(cached_json, "w", encoding="utf-8") as f:
            json.dump(cache_to_save, f)
    except Exception:
        pass

    return {
        "job_id": job_id,
        "zip_download_url": f"/download/{job_id}",
        **result
    }


@app.get(
    "/api/tools/psd-to-html/asset/{job_id}/{filename}",
    tags=["PSD Tools"],
    summary="Get Extracted PSD Image Asset",
    description="Streams an extracted WebP/PNG image asset for live preview."
)
async def api_psd_to_html_asset(job_id: str, filename: str):
    asset_path = STORAGE_DIR / f"psd_html_{job_id}" / "images" / filename
    if not asset_path.exists():
        # Fallback check test_out directory if running in local test mode
        project_root = Path(__file__).resolve().parent.parent
        test_path = project_root / "backend" / "test_out" / "images" / filename
        if test_path.exists():
            asset_path = test_path
        else:
            raise HTTPException(status_code=404, detail="Asset not found")

    ext = asset_path.suffix.lower()
    media_type = "image/webp" if ext == ".webp" else ("image/png" if ext == ".png" else "image/jpeg")
    return FileResponse(path=str(asset_path), media_type=media_type)


# ==============================================================================
# DOWNLOAD ENDPOINT
# ==============================================================================

@app.get(
    "/download/{job_id}",
    tags=["Image Optimization Pipeline"],
    summary="Download Processed File",
    description="Streams the processed file as an attachment and schedules ephemeral file cleanup."
)
async def download_optimized_image(
    job_id: str,
    background_tasks: BackgroundTasks,
    db: Optional[object] = Depends(get_db),
    user: UserContext = Depends(get_current_user)
):
    output_path = None
    download_filename = f"file_{job_id}"

    # Check local jobs first
    if job_id in LOCAL_JOBS and LOCAL_JOBS[job_id]["status"] == "SUCCESS":
        res_data = LOCAL_JOBS[job_id]
        output_path = Path(res_data["output_path"])
        download_filename = res_data.get("download_filename", download_filename)

    # Check Celery jobs
    if not output_path or not output_path.exists():
        try:
            async_result = AsyncResult(job_id, app=celery_app)
            if async_result.state == "SUCCESS" and async_result.result:
                res_data = async_result.result
                output_path = Path(res_data["output_path"])
                download_filename = res_data.get("download_filename", download_filename)
        except Exception:
            pass

    if not output_path or not output_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Processed file not found or processing has not finished."
        )

    # Schedule ephemeral background cleanup
    raw_files = list(STORAGE_DIR.glob(f"{job_id}_*"))
    for rf in raw_files:
        if rf != output_path:
            background_tasks.add_task(delete_file_task, str(rf))

    background_tasks.add_task(delete_file_task, str(output_path))

    ext = output_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
        ".zip": "application/zip"
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(output_path),
        media_type=media_type,
        filename=download_filename,
        headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
    )
