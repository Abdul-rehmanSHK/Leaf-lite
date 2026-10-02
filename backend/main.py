import os
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
    merge_pdf_documents
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
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
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
            <title>LeafLite Studio - Gateway</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fafbfc; color: #0f172a; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: white; border: 1px solid #e2e8f0; border-radius: 24px; padding: 48px; max-width: 520px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05); }
                .badge { display: inline-block; background: #ecfdf5; color: #065f46; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 999px; border: 1px solid #a7f3d0; margin-bottom: 16px; }
                h1 { font-size: 28px; font-weight: 800; margin: 0 0 12px; }
                p { color: #64748b; font-size: 15px; line-height: 1.5; margin: 0 0 28px; }
                .btn { display: block; background: #10b981; color: white; text-decoration: none; padding: 14px 24px; border-radius: 14px; font-weight: 700; font-size: 15px; margin-bottom: 12px; transition: all 0.2s; box-shadow: 0 10px 15px -3px rgba(16,185,129,0.3); }
                .btn:hover { background: #059669; }
                .btn-secondary { background: #f1f5f9; color: #334155; box-shadow: none; }
                .btn-secondary:hover { background: #e2e8f0; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="badge">🍃 API Status: ONLINE (Port 8000)</div>
                <h1>LeafLite Studio Gateway</h1>
                <p>The high-performance stateless image optimization & conversion engine is active.</p>
                <a href="http://localhost:3000" class="btn">👉 Launch LeafLite Web Studio (Port 3000)</a>
                <a href="/docs" class="btn btn-secondary">Explore Interactive Swagger API Docs</a>
            </div>
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
        ".pdf": "application/pdf"
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(output_path),
        media_type=media_type,
        filename=download_filename,
        headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
    )
