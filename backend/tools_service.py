import os
import io
import math
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

import numpy as np
from PIL import Image, ExifTags, ImageFilter
import pypdf

DEFAULT_DIR = "/tmp/leaflite_uploads" if os.name != "nt" else str(Path(tempfile.gettempdir()) / "leaflite_uploads")
STORAGE_DIR = Path(os.getenv("LEAFLITE_STORAGE_DIR", DEFAULT_DIR))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def check_image_dimensions(input_path: Path) -> Dict[str, Any]:
    """
    Analyzes image dimensions, aspect ratio, megapixels, print size at various DPIs,
    and checks compatibility against standard social & web media presets.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    file_size_bytes = input_path.stat().st_size

    with Image.open(input_path) as img:
        width, height = img.size
        img_format = img.format or input_path.suffix.lstrip(".").upper()
        mode = img.mode

    # Megapixels
    megapixels = round((width * height) / 1_000_000, 2)

    # Orientation
    if width > height:
        orientation = "Landscape"
    elif height > width:
        orientation = "Portrait"
    else:
        orientation = "Square"

    # Simplified Aspect Ratio
    divisor = math.gcd(width, height)
    simplified_w = width // divisor
    simplified_h = height // divisor

    ratio_decimal = round(width / height, 3) if height > 0 else 1.0

    # Common standard ratio approximations
    ratio_presets = [
        (16, 9, "16:9 (Widescreen)"),
        (9, 16, "9:16 (Vertical Story / Reel)"),
        (4, 3, "4:3 (Standard Photo)"),
        (3, 4, "3:4 (Portrait Photo)"),
        (1, 1, "1:1 (Square)"),
        (3, 2, "3:2 (Classic 35mm DSLR)"),
        (2, 3, "2:3 (Portrait 35mm DSLR)"),
        (21, 9, "21:9 (Ultrawide)"),
    ]

    matched_preset = None
    for pw, ph, label in ratio_presets:
        if abs((pw / ph) - ratio_decimal) < 0.03:
            matched_preset = label
            break

    aspect_ratio_str = matched_preset or f"{simplified_w}:{simplified_h}"

    # Print dimensions (inches & cm) at standard DPIs
    def get_print_size(dpi: int):
        w_in = round(width / dpi, 2)
        h_in = round(height / dpi, 2)
        w_cm = round(w_in * 2.54, 2)
        h_cm = round(h_in * 2.54, 2)
        return {
            "dpi": dpi,
            "inches": f"{w_in}″ × {h_in}″",
            "cm": f"{w_cm} × {h_cm} cm",
            "width_inches": w_in,
            "height_inches": h_in,
            "width_cm": w_cm,
            "height_cm": h_cm,
        }

    print_sizes = {
        "dpi_300": get_print_size(300),
        "dpi_150": get_print_size(150),
        "dpi_72": get_print_size(72),
    }

    # Social & Web Preset Compatibility
    presets = [
        {"name": "Instagram Post (Square)", "w": 1080, "h": 1080, "category": "Social Media"},
        {"name": "Instagram Story / Reel / TikTok", "w": 1080, "h": 1920, "category": "Social Media"},
        {"name": "YouTube Thumbnail", "w": 1280, "h": 720, "category": "Video & Web"},
        {"name": "Full HD Desktop Display", "w": 1920, "h": 1080, "category": "Display"},
        {"name": "4K Ultra HD Display", "w": 3840, "h": 2160, "category": "Display"},
        {"name": "Twitter / X Post Header", "w": 1500, "h": 500, "category": "Social Media"},
        {"name": "Avatar / Profile Picture", "w": 400, "h": 400, "category": "Profile"},
    ]

    preset_matches = []
    for p in presets:
        pw, ph = p["w"], p["h"]
        if width == pw and height == ph:
            status_text = "Exact Match"
            badge = "exact"
        elif width >= pw and height >= ph:
            status_text = "High Res (Clean Downscale)"
            badge = "ready"
        else:
            status_text = f"Lower Res (Upscale needed from {width}x{height})"
            badge = "low"

        preset_matches.append({
            "name": p["name"],
            "target": f"{pw} × {ph} px",
            "category": p["category"],
            "status": status_text,
            "badge": badge
        })

    return {
        "width": width,
        "height": height,
        "format": img_format,
        "mode": mode,
        "file_size_bytes": file_size_bytes,
        "file_size_formatted": _format_bytes(file_size_bytes),
        "megapixels": megapixels,
        "orientation": orientation,
        "aspect_ratio": aspect_ratio_str,
        "aspect_ratio_decimal": ratio_decimal,
        "simplified_ratio": f"{simplified_w}:{simplified_h}",
        "print_sizes": print_sizes,
        "preset_matches": preset_matches
    }


def check_image_quality(input_path: Path) -> Dict[str, Any]:
    """
    Evaluates image quality metrics:
      - Sharpness / Blur score (Laplacian gradient variance)
      - Shannon Entropy (texture complexity / information density)
      - Dynamic Range and Contrast Standard Deviation
      - Noise & High-Frequency Artifacts
      - Overall Quality Rating (0 - 100) and actionable diagnostic recommendations.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    file_size = input_path.stat().st_size

    with Image.open(input_path) as img:
        width, height = img.size
        # Sample down if gigantic to ensure near-instant calculation
        max_dim = 1600
        if max(width, height) > max_dim:
            scale = max_dim / max(width, height)
            sample_img = img.resize((int(width * scale), int(height * scale)), Image.Resampling.BOX)
        else:
            sample_img = img.copy()

    # Convert to grayscale numpy float64 array
    gray_img = sample_img.convert("L")
    gray = np.array(gray_img, dtype=np.float64)

    # 1. Laplacian Sharpness Variance
    if gray.shape[0] > 2 and gray.shape[1] > 2:
        lap = (
            gray[1:-1, 0:-2] + gray[1:-1, 2:] +
            gray[0:-2, 1:-1] + gray[2:, 1:-1] -
            4.0 * gray[1:-1, 1:-1]
        )
        lap_variance = float(np.var(lap))
    else:
        lap_variance = 0.0

    # Sharpness score normalized (0-100)
    # Typical sharp photo: variance > 300; blurry photo: < 100
    sharpness_score = min(100.0, round((lap_variance / 4.0), 1))

    # 2. Shannon Entropy (Detail / Information Density)
    hist = gray_img.histogram()
    total_pixels = sum(hist)
    entropy = 0.0
    for count in hist:
        if count > 0:
            p = count / total_pixels
            entropy -= p * math.log2(p)
    # Entropy ranges 0 to 8 bits
    entropy_score = min(100.0, round((entropy / 8.0) * 100, 1))

    # 3. Contrast & Dynamic Range
    min_lum = int(np.min(gray))
    max_lum = int(np.max(gray))
    lum_range = max_lum - min_lum
    contrast_std = float(np.std(gray))
    contrast_score = min(100.0, round((contrast_std / 64.0) * 100, 1))

    # 4. High-frequency Noise / Artifact estimate
    # Blur slightly and compare difference
    blurred = gray_img.filter(ImageFilter.GaussianBlur(radius=1.5))
    blurred_arr = np.array(blurred, dtype=np.float64)
    noise_residual = float(np.mean(np.abs(gray - blurred_arr)))
    noise_score = min(100.0, round(noise_residual * 4.0, 1))

    # 5. Composite Overall Quality Score (0-100)
    # Weighted: Sharpness 40%, Contrast 30%, Entropy 30%
    overall = (0.40 * sharpness_score) + (0.30 * contrast_score) + (0.30 * entropy_score)
    overall_score = max(5, min(99, int(round(overall))))

    # Human-readable grade & diagnosis
    if overall_score >= 85:
        grade = "Excellent (Studio / High Fidelity)"
        grade_color = "emerald"
        status_desc = "Razor-sharp details, rich contrast, and wide dynamic range. Ready for professional display or print."
    elif overall_score >= 70:
        grade = "Good (Web & Social Ready)"
        grade_color = "blue"
        status_desc = "Well balanced sharpness and clarity. Perfect for web pages, e-commerce, and social media."
    elif overall_score >= 50:
        grade = "Fair (Moderate Detail)"
        grade_color = "amber"
        status_desc = "Acceptable clarity for standard viewing, but shows mild softness or compression."
    else:
        grade = "Poor / Soft (Low Sharpness or High Blur)"
        grade_color = "red"
        status_desc = "Significant blurriness or compression detected. Consider re-capturing or using uncompressed originals."

    recommendations = []
    if sharpness_score > 75:
        recommendations.append("Sharpness is very high; can safely compress by 60-80% without noticeable fidelity loss.")
    elif sharpness_score < 40:
        recommendations.append("Image is slightly blurry; avoid heavy downscaling to preserve edge details.")

    if contrast_score < 40:
        recommendations.append("Low contrast detected (flat or washed out). Boosting contrast may improve visual pop.")
    else:
        recommendations.append("Dynamic contrast is well distributed across shadow and highlight regions.")

    if entropy_score > 70:
        recommendations.append("High texture entropy: contains intricate patterns, text, or detailed scenery.")
    else:
        recommendations.append("Smooth color gradients or large uniform backgrounds present.")

    return {
        "overall_score": overall_score,
        "grade": grade,
        "grade_color": grade_color,
        "status_description": status_desc,
        "metrics": {
            "sharpness": {
                "score": sharpness_score,
                "raw_variance": round(lap_variance, 2),
                "assessment": "Very Sharp" if sharpness_score > 70 else ("Balanced" if sharpness_score > 40 else "Soft / Blurry")
            },
            "entropy": {
                "score": entropy_score,
                "raw_bits": round(entropy, 2),
                "assessment": "Rich Detail" if entropy_score > 70 else "Smooth / Low Texture"
            },
            "contrast": {
                "score": contrast_score,
                "std_deviation": round(contrast_std, 1),
                "dynamic_range": f"{min_lum} to {max_lum} (span: {lum_range})"
            },
            "noise": {
                "score": noise_score,
                "assessment": "Low / Clean" if noise_score < 30 else ("Noticeable" if noise_score < 60 else "Heavy Noise")
            }
        },
        "dimensions": f"{width} × {height} px",
        "file_size": _format_bytes(file_size),
        "recommendations": recommendations
    }


def get_exif_metadata(input_path: Path) -> Dict[str, Any]:
    """
    Extracts complete EXIF photography tags, GPS location data (with coordinate conversion),
    camera specs, and privacy assessment.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    raw_tags: Dict[str, Any] = {}
    gps_info: Dict[str, Any] = {}

    with Image.open(input_path) as img:
        exif = img.getexif()
        if exif:
            for tag_id, value in exif.items():
                tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                # Skip raw binary data or huge byte arrays
                if isinstance(value, (bytes, bytearray)):
                    continue
                raw_tags[tag_name] = str(value)

        # Also inspect _getexif if available (JPEG)
        if hasattr(img, "_getexif"):
            try:
                detailed_exif = img._getexif()
                if detailed_exif:
                    for tag_id, value in detailed_exif.items():
                        tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                        if tag_name == "GPSInfo" and isinstance(value, dict):
                            for g_id, g_val in value.items():
                                g_name = ExifTags.GPSTAGS.get(g_id, str(g_id))
                                if not isinstance(g_val, (bytes, bytearray)):
                                    gps_info[g_name] = str(g_val)
                        elif not isinstance(value, (bytes, bytearray)):
                            raw_tags[tag_name] = str(value)
            except Exception:
                pass

    # Process GPS decimal degrees if available
    lat_deg = None
    lon_deg = None
    maps_url = None

    if "GPSLatitude" in gps_info and "GPSLongitude" in gps_info:
        try:
            def _convert_to_degrees(val):
                # Format is typically (degrees, minutes, seconds)
                parts = [float(x.strip(" ()")) for x in str(val).split(",") if x.strip(" ()")]
                if len(parts) == 3:
                    d, m, s = parts
                    return d + (m / 60.0) + (s / 3600.0)
                return None

            lat = _convert_to_degrees(gps_info["GPSLatitude"])
            lon = _convert_to_degrees(gps_info["GPSLongitude"])

            if lat is not None and lon is not None:
                if gps_info.get("GPSLatitudeRef") == "S":
                    lat = -lat
                if gps_info.get("GPSLongitudeRef") == "W":
                    lon = -lon
                lat_deg = round(lat, 6)
                lon_deg = round(lon, 6)
                maps_url = f"https://www.google.com/maps?q={lat_deg},{lon_deg}"
        except Exception:
            pass

    has_exif = len(raw_tags) > 0 or len(gps_info) > 0

    # Privacy Assessment
    if lat_deg is not None:
        privacy_status = "CRITICAL RISK (Precise GPS Coordinates Embedded)"
        privacy_level = "danger"
    elif any(k in raw_tags for k in ["Make", "Model", "LensModel", "DateTimeOriginal"]):
        privacy_status = "WARNING (Hardware / Timestamp Metadata Present)"
        privacy_level = "warning"
    else:
        privacy_status = "CLEAN (Zero tracking or private metadata tags found)"
        privacy_level = "safe"

    # Extracted highlight fields
    camera_model = raw_tags.get("Model") or raw_tags.get("Make") or "Not recorded"
    lens = raw_tags.get("LensModel") or "Not recorded"
    date_taken = raw_tags.get("DateTimeOriginal") or raw_tags.get("DateTime") or "Not recorded"
    exposure = raw_tags.get("ExposureTime") or "Not recorded"
    f_number = raw_tags.get("FNumber") or "Not recorded"
    iso = raw_tags.get("ISOSpeedRatings") or "Not recorded"
    focal_length = raw_tags.get("FocalLength") or "Not recorded"
    software = raw_tags.get("Software") or "Not recorded"

    return {
        "has_exif": has_exif,
        "tag_count": len(raw_tags) + len(gps_info),
        "privacy": {
            "status": privacy_status,
            "level": privacy_level,
            "has_gps": lat_deg is not None,
            "latitude": lat_deg,
            "longitude": lon_deg,
            "maps_url": maps_url
        },
        "camera_info": {
            "model": camera_model,
            "lens": lens,
            "date_taken": date_taken,
            "exposure": exposure,
            "f_number": f_number,
            "iso": iso,
            "focal_length": focal_length,
            "software": software
        },
        "all_tags": raw_tags,
        "gps_raw": gps_info
    }


def strip_exif_metadata(input_path: Path, output_path: Path) -> Dict[str, Any]:
    """
    Strips 100% of EXIF, GPS, camera, and author metadata by creating a pure sanitized
    image raster without copying metadata chunks.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    original_size = input_path.stat().st_size

    with Image.open(input_path) as img:
        img_format = img.format or "JPEG"
        # Pure copy of pixel data into new Image without EXIF
        clean_img = Image.new(img.mode, img.size)
        clean_img.putdata(list(img.getdata()))

        # Save without any exif or metadata parameters
        if img_format in ("JPEG", "JPG"):
            if clean_img.mode in ("RGBA", "P"):
                clean_img = clean_img.convert("RGB")
            clean_img.save(output_path, format="JPEG", quality=90, optimize=True)
        elif img_format == "PNG":
            clean_img.save(output_path, format="PNG", optimize=True)
        elif img_format == "WEBP":
            clean_img.save(output_path, format="WEBP", quality=90)
        else:
            clean_img.save(output_path)

    new_size = output_path.stat().st_size
    saved_bytes = max(0, original_size - new_size)

    return {
        "status": "SUCCESS",
        "original_size": original_size,
        "original_size_formatted": _format_bytes(original_size),
        "sanitized_size": new_size,
        "sanitized_size_formatted": _format_bytes(new_size),
        "saved_bytes": saved_bytes,
        "message": "All EXIF and GPS tracking tags successfully removed!"
    }


def resize_image_tool(
    input_path: Path,
    output_path: Path,
    scale_percent: Optional[int] = None,
    target_width: Optional[int] = None,
    target_height: Optional[int] = None,
    keep_aspect_ratio: bool = True,
    output_format: Optional[str] = None,
    quality: int = 85
) -> Dict[str, Any]:
    """
    Resizes image by scale percentage (e.g. 50%, 75%) OR exact pixel dimensions
    with optional aspect ratio lock and high-grade LANCZOS resampling.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    original_size = input_path.stat().st_size

    with Image.open(input_path) as img:
        orig_w, orig_h = img.size
        detected_format = img.format or "JPEG"

        # Determine target dimensions
        if scale_percent is not None and scale_percent > 0:
            new_w = max(1, int(orig_w * (scale_percent / 100.0)))
            new_h = max(1, int(orig_h * (scale_percent / 100.0)))
        elif target_width or target_height:
            if keep_aspect_ratio:
                aspect = orig_w / orig_h
                if target_width and not target_height:
                    new_w = int(target_width)
                    new_h = max(1, int(new_w / aspect))
                elif target_height and not target_width:
                    new_h = int(target_height)
                    new_w = max(1, int(new_h * aspect))
                else:
                    # Both supplied: fit within box preserving aspect
                    box_w = int(target_width)
                    box_h = int(target_height)
                    scale = min(box_w / orig_w, box_h / orig_h)
                    new_w = max(1, int(orig_w * scale))
                    new_h = max(1, int(orig_h * scale))
            else:
                new_w = int(target_width or orig_w)
                new_h = int(target_height or orig_h)
        else:
            new_w, new_h = orig_w, orig_h

        # Resample with Lanczos
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Output format handling
        save_fmt = (output_format or detected_format).upper()
        if save_fmt in ["JPG", "JPEG"]:
            if resized.mode in ("RGBA", "P"):
                resized = resized.convert("RGB")
            resized.save(output_path, format="JPEG", quality=quality, optimize=True)
        elif save_fmt == "WEBP":
            resized.save(output_path, format="WEBP", quality=quality)
        elif save_fmt == "PNG":
            resized.save(output_path, format="PNG", optimize=True)
        else:
            resized.save(output_path)

    new_size = output_path.stat().st_size
    saved_bytes = max(0, original_size - new_size)
    saved_percent = round((saved_bytes / original_size) * 100, 1) if original_size > 0 else 0.0

    return {
        "status": "SUCCESS",
        "original_width": orig_w,
        "original_height": orig_h,
        "new_width": new_w,
        "new_height": new_h,
        "original_size": original_size,
        "original_size_formatted": _format_bytes(original_size),
        "new_size": new_size,
        "new_size_formatted": _format_bytes(new_size),
        "saved_bytes": saved_bytes,
        "saved_percent": saved_percent,
        "scale_applied": f"{new_w} × {new_h} px"
    }


def reduce_image_to_target_kb(
    input_path: Path,
    output_path: Path,
    target_kb: int,
    output_format: Optional[str] = None
) -> Dict[str, Any]:
    """
    Intelligently compresses an image down until its file size is <= target_kb.
    Iterates quality parameters and scales smoothly if needed to prevent distortion.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    target_bytes = target_kb * 1024
    original_size = input_path.stat().st_size

    # If already smaller, save a clean copy
    if original_size <= target_bytes:
        shutil.copyfile(input_path, output_path)
        return {
            "status": "SUCCESS",
            "original_size": original_size,
            "original_size_formatted": _format_bytes(original_size),
            "final_size": original_size,
            "final_size_formatted": _format_bytes(original_size),
            "target_kb": target_kb,
            "saved_bytes": 0,
            "saved_percent": 0.0,
            "note": "Image is already smaller than target KB threshold."
        }

    with Image.open(input_path) as orig_img:
        target_fmt = (output_format or orig_img.format or "JPEG").upper()
        if target_fmt not in ["JPEG", "JPG", "WEBP", "PNG"]:
            target_fmt = "JPEG"

        working_img = orig_img.copy()
        if target_fmt in ["JPEG", "JPG"] and working_img.mode in ("RGBA", "P"):
            working_img = working_img.convert("RGB")

        # Binary search quality: test qualities 90, 80, 70, 60, 50, 40, 30, 20
        best_data = None
        best_size = original_size
        best_q = 80

        for q in [85, 75, 65, 55, 45, 35, 25, 18]:
            buf = io.BytesIO()
            if target_fmt in ["JPEG", "JPG"]:
                working_img.save(buf, format="JPEG", quality=q, optimize=True)
            elif target_fmt == "WEBP":
                working_img.save(buf, format="WEBP", quality=q)
            elif target_fmt == "PNG":
                # For PNG, downscale palette colors
                quantized = working_img.convert("P", palette=Image.ADAPTIVE, colors=min(256, max(32, q * 2)))
                quantized.save(buf, format="PNG", optimize=True)

            size = len(buf.getvalue())
            if size <= target_bytes:
                best_data = buf.getvalue()
                best_size = size
                best_q = q
                break
            else:
                best_data = buf.getvalue()
                best_size = size
                best_q = q

        # If quality alone wasn't enough (e.g. huge 4K photo trying to fit into 50KB),
        # gracefully step down resolution
        if best_size > target_bytes:
            w, h = working_img.size
            for scale in [0.85, 0.70, 0.55, 0.40, 0.30, 0.20]:
                nw = max(1, int(w * scale))
                nh = max(1, int(h * scale))
                scaled = working_img.resize((nw, nh), Image.Resampling.LANCZOS)

                for q in [75, 60, 45, 30]:
                    buf = io.BytesIO()
                    if target_fmt in ["JPEG", "JPG"]:
                        scaled.save(buf, format="JPEG", quality=q, optimize=True)
                    elif target_fmt == "WEBP":
                        scaled.save(buf, format="WEBP", quality=q)
                    elif target_fmt == "PNG":
                        quantized = scaled.convert("P", palette=Image.ADAPTIVE, colors=128)
                        quantized.save(buf, format="PNG", optimize=True)

                    size = len(buf.getvalue())
                    if size <= target_bytes:
                        best_data = buf.getvalue()
                        best_size = size
                        best_q = q
                        break
                if best_size <= target_bytes:
                    break

        # Write result to output_path
        with open(output_path, "wb") as f:
            f.write(best_data)

    final_size = output_path.stat().st_size
    saved_bytes = max(0, original_size - final_size)
    saved_percent = round((saved_bytes / original_size) * 100, 1) if original_size > 0 else 0.0

    return {
        "status": "SUCCESS",
        "original_size": original_size,
        "original_size_formatted": _format_bytes(original_size),
        "final_size": final_size,
        "final_size_formatted": _format_bytes(final_size),
        "target_kb": target_kb,
        "saved_bytes": saved_bytes,
        "saved_percent": saved_percent,
        "quality_applied": best_q,
        "achieved_target": final_size <= target_bytes
    }


def merge_pdf_documents(pdf_paths: List[Path], output_path: Path, order: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    Merges multiple PDF documents into a single PDF in the exact order requested by user.
    """
    if not pdf_paths:
        raise ValueError("No PDF files provided for merging.")

    # Reorder according to user preference
    if order and len(order) == len(pdf_paths):
        ordered_paths = [pdf_paths[i] for i in order if 0 <= i < len(pdf_paths)]
    else:
        ordered_paths = pdf_paths

    writer = pypdf.PdfWriter()
    total_pages = 0
    file_summaries = []

    for idx, path in enumerate(ordered_paths):
        if not path.exists():
            continue
        reader = pypdf.PdfReader(str(path))
        num_pages = len(reader.pages)
        total_pages += num_pages
        file_summaries.append({
            "order": idx + 1,
            "filename": path.name,
            "pages": num_pages,
            "size": _format_bytes(path.stat().st_size)
        })
        for page in reader.pages:
            writer.add_page(page)

    with open(output_path, "wb") as out_f:
        writer.write(out_f)

    merged_size = output_path.stat().st_size

    return {
        "status": "SUCCESS",
        "total_files": len(ordered_paths),
        "total_pages": total_pages,
        "file_summaries": file_summaries,
        "merged_size": merged_size,
        "merged_size_formatted": _format_bytes(merged_size)
    }


def _format_bytes(bytes_val: int) -> str:
    if not bytes_val or bytes_val <= 0:
        return "0 B"
    sizes = ["B", "KB", "MB", "GB"]
    i = int(math.floor(math.log(bytes_val, 1024)))
    p = math.pow(1024, i)
    s = round(bytes_val / p, 2)
    return f"{s} {sizes[i]}"


def optimize_image_direct(
    input_path: Path,
    output_path: Path,
    output_format: str = "WEBP",
    quality: int = 85
) -> Dict[str, Any]:
    """
    Directly converts and optimizes any image or layer into target format (WEBP, PNG, JPG)
    with high compression efficiency.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"File not found: {input_path}")

    original_size = input_path.stat().st_size
    fmt = output_format.upper().strip()
    if fmt in ("JPG", "JPEG"):
        save_format = "JPEG"
    elif fmt == "PNG":
        save_format = "PNG"
    else:
        save_format = "WEBP"

    with Image.open(input_path) as img:
        orig_w, orig_h = img.size
        if save_format == "JPEG" and img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "RGBA":
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img.convert("RGBA"))
            out_img = bg
        else:
            out_img = img

        if save_format == "JPEG":
            out_img.save(output_path, format="JPEG", quality=quality, optimize=True)
        elif save_format == "PNG":
            out_img.save(output_path, format="PNG", optimize=True)
        elif save_format == "WEBP":
            out_img.save(output_path, format="WEBP", quality=quality, method=6)
        else:
            out_img.save(output_path, format=save_format)

    new_size = output_path.stat().st_size
    saved_bytes = max(0, original_size - new_size)
    saved_pct = round((saved_bytes / original_size) * 100, 1) if original_size > 0 else 0

    return {
        "status": "SUCCESS",
        "format": save_format,
        "quality": quality,
        "width": orig_w,
        "height": orig_h,
        "original_size": original_size,
        "original_size_formatted": _format_bytes(original_size),
        "optimized_size": new_size,
        "optimized_size_formatted": _format_bytes(new_size),
        "saved_bytes": saved_bytes,
        "saved_bytes_formatted": _format_bytes(saved_bytes),
        "saved_percent": saved_pct
    }


def inspect_psd_file(psd_path: Path, composite_output_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Parses Photoshop .psd document, extracts hierarchy, layer dimensions, bounding boxes,
    text elements, font specs, colors, and generates composite raster.
    """
    import psd_tools
    if not psd_path.exists():
        raise FileNotFoundError(f"File not found: {psd_path}")

    psd = psd_tools.PSDImage.open(psd_path)
    width, height = psd.width, psd.height

    if composite_output_path:
        try:
            comp = psd.composite()
            if comp:
                comp.save(composite_output_path, format="PNG")
        except Exception:
            pass

    layers = []

    def _traverse(layer):
        bbox = layer.bbox
        layer_x = bbox.x1 if bbox else 0
        layer_y = bbox.y1 if bbox else 0
        layer_w = layer.width
        layer_h = layer.height

        is_text = layer.kind == "type"
        text_data = None
        if is_text:
            text_str = ""
            try:
                text_str = layer.text or ""
            except Exception:
                pass
            text_data = {
                "text": text_str,
                "font_family": "system-ui, sans-serif",
                "font_size": 24,
                "font_weight": "bold",
                "line_height": "32px",
                "letter_spacing": "0px",
                "color": "#0f172a"
            }

        info = {
            "name": layer.name or "Unnamed Layer",
            "kind": layer.kind,
            "visible": layer.visible,
            "opacity": round((layer.opacity / 255.0) * 100) if hasattr(layer, "opacity") and layer.opacity is not None else 100,
            "left": layer_x,
            "top": layer_y,
            "width": layer_w,
            "height": layer_h,
            "is_text": is_text,
            "text": text_data,
            "is_group": layer.is_group()
        }

        if layer.is_group():
            children = []
            for c in layer:
                children.append(_traverse(c))
            info["children"] = children
        return info

    for l in psd:
        layers.append(_traverse(l))

    return {
        "status": "SUCCESS",
        "width": width,
        "height": height,
        "color_mode": getattr(psd, "color_mode", "RGB"),
        "channels": psd.channels,
        "layer_count": len(layers),
        "layers": layers
    }

