import os
import re
import json
import uuid
import shutil
import zipfile
from html import escape
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from PIL import Image
import psd_tools

def sanitize_slug(name: str) -> str:
    s = re.sub(r'[^a-zA-Z0-9_\-\s]', '', name).strip()
    s = re.sub(r'[\s_]+', '-', s).lower()
    return s or "section"

def rgb_to_hex(r: float, g: float, b: float) -> str:
    ir = int(round(r * 255 if r <= 1.0 else r))
    ig = int(round(g * 255 if g <= 1.0 else g))
    ib = int(round(b * 255 if b <= 1.0 else b))
    ir = max(0, min(255, ir))
    ig = max(0, min(255, ig))
    ib = max(0, min(255, ib))
    return f"#{ir:02x}{ig:02x}{ib:02x}"

def minify_html(html: str) -> str:
    """Minifies HTML markup while preserving pre/code and textarea blocks."""
    # Remove HTML comments except IE conditional comments
    cleaned = re.sub(r'<!--(?!\s*(?:\[if [^\]]+]|<!|>))(?:(?!-->).)*-->', '', html, flags=re.DOTALL)
    # Collapse whitespace between tags
    cleaned = re.sub(r'>\s+<', '><', cleaned)
    # Collapse multiple spaces and linebreaks
    cleaned = re.sub(r'\s{2,}', ' ', cleaned)
    return cleaned.strip()

def minify_css(css: str) -> str:
    """Minifies CSS stylesheet by stripping comments and redundant whitespace."""
    # Remove CSS comments
    cleaned = re.sub(r'/\*.*?\*/', '', css, flags=re.DOTALL)
    # Collapse whitespace around symbols
    cleaned = re.sub(r'\s*([\{\}:;,>+~])\s*', r'\1', cleaned)
    # Remove trailing semicolons before closing brace
    cleaned = re.sub(r';\}', '}', cleaned)
    # Collapse multiple whitespaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()

class PsdToHtmlEngine:
    def __init__(self, psd_path: Path, output_dir: Path, job_id: str):
        self.psd_path = psd_path
        self.output_dir = output_dir
        self.job_id = job_id
        self.images_dir = self.output_dir / "images"
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.extracted_assets: List[Dict[str, Any]] = []
        self.color_palette: List[str] = []
        self.fonts: List[str] = []
        self.asset_counter = 0
        self.measured_layers: List[Dict[str, Any]] = []
        self.layer_asset_cache: Dict[int, Dict[str, Any]] = {}

    def parse_and_generate(self) -> Dict[str, Any]:
        psd = psd_tools.PSDImage.open(self.psd_path)
        doc_w = psd.width or 1920
        doc_h = psd.height or 1080

        groups_data: List[Dict[str, Any]] = []
        color_freq: Dict[str, int] = {}
        font_set = set()

        # Check if PSD contains artboards or nested structure
        top_candidates = []
        for item in psd:
            if not item.visible:
                continue
            top_candidates.append(item)

        # If there's an artboard containing sections, drill down into it
        effective_items = []
        if len(top_candidates) == 1 and top_candidates[0].is_group() and "artboard" in top_candidates[0].name.lower():
            for sub in top_candidates[0]:
                if sub.visible:
                    effective_items.append(sub)
        else:
            effective_items = top_candidates

        # Check if the items are groups or loose layers
        has_groups = any(item.is_group() for item in effective_items)

        if has_groups:
            # Sort top-level groups/items vertically
            sorted_items = []
            for item in effective_items:
                bbox = item.bbox
                top_y = bbox[1] if bbox else 0
                sorted_items.append((top_y, item))
            sorted_items.sort(key=lambda x: x[0])

            for idx, (_, item) in enumerate(sorted_items):
                if item.is_group():
                    g_info = self._process_group(item, idx, color_freq, font_set)
                    if g_info and (g_info["heading"] or g_info["paragraphs"] or g_info["images"] or g_info["buttons"]):
                        groups_data.append(g_info)
                else:
                    # Single loose layer
                    if item.kind == "type":
                        t_info = self._extract_type_info(item)
                        if t_info:
                            font_set.add(t_info["font_family"])
                            color_freq[t_info["color_hex"]] = color_freq.get(t_info["color_hex"], 0) + 1
                            groups_data.append({
                                "id": f"section-{idx}",
                                "name": item.name or f"Section {idx+1}",
                                "type": "content",
                                "heading": t_info["text"],
                                "eyebrow": "",
                                "subheading": "",
                                "paragraphs": [],
                                "buttons": [],
                                "images": [],
                                "cards": [],
                                "bbox": list(item.bbox) if item.bbox else [0, 0, doc_w, 200]
                            })
                    elif item.width >= 20 and item.height >= 20:
                        img_asset = self._slice_layer_image(item, f"item-{idx}")
                        if img_asset:
                            groups_data.append({
                                "id": f"section-{idx}",
                                "name": item.name or f"Banner {idx+1}",
                                "type": "banner",
                                "heading": "",
                                "eyebrow": "",
                                "subheading": "",
                                "paragraphs": [],
                                "buttons": [],
                                "images": [img_asset],
                                "cards": [],
                                "bbox": list(item.bbox) if item.bbox else [0, 0, doc_w, 400]
                            })
        else:
            # Flat PSD without folder groups: Cluster layers into vertical segments
            groups_data = self._cluster_flat_layers(effective_items, doc_w, doc_h, color_freq, font_set)

        # Fallback if no sections detected: generate from document composite
        if not groups_data:
            comp_asset = None
            try:
                comp = psd.composite()
                if comp:
                    comp_filename = f"{sanitize_slug(self.psd_path.stem)}_hero.webp"
                    comp_path = self.images_dir / comp_filename
                    if comp.mode not in ("RGB", "RGBA"):
                        comp = comp.convert("RGBA")
                    comp.save(comp_path, "WEBP", quality=85)
                    comp_asset = {
                        "name": self.psd_path.stem,
                        "filename": comp_filename,
                        "path": f"images/{comp_filename}",
                        "url": f"/api/tools/psd-to-html/asset/{self.job_id}/{comp_filename}",
                        "width": comp.width,
                        "height": comp.height,
                        "size_bytes": comp_path.stat().st_size
                    }
                    self.extracted_assets.append(comp_asset)
            except Exception:
                pass

            groups_data.append({
                "id": "section-1",
                "name": self.psd_path.stem,
                "type": "hero",
                "heading": self.psd_path.stem.replace('_', ' ').replace('-', ' ').title(),
                "eyebrow": "",
                "subheading": "",
                "paragraphs": [],
                "buttons": ["Learn More"],
                "images": [comp_asset] if comp_asset else [],
                "cards": [],
                "bbox": [0, 0, doc_w, min(800, doc_h)]
            })

        # Palette determination from actual layer colors
        sorted_colors = sorted(color_freq.items(), key=lambda x: x[1], reverse=True)
        dominant_accents = [
            c for c, _ in sorted_colors
            if c.lower() not in ("#ffffff", "#000000", "#111827", "#0f172a", "#f8fafc", "#f1f5f9", "#e2e8f0", "#334155")
        ]
        primary_color = dominant_accents[0] if dominant_accents else "#0284c7"
        secondary_color = dominant_accents[1] if len(dominant_accents) > 1 else "#0d9488"

        self.color_palette = [primary_color, secondary_color, "#1e293b", "#f8fafc"]
        self.fonts = sorted(list(font_set))
        if not self.fonts:
            self.fonts = ["Inter", "system-ui"]

        # Generate output from measured layer bounds instead of inferred section templates.
        self.measured_layers = self._collect_measured_layers(psd)
        html_code, css_code = self._generate_measured_css_bundle(doc_w, doc_h, primary_color, secondary_color)
        tailwind_code = self._generate_measured_tailwind_bundle(doc_w, doc_h, primary_color, secondary_color)

        html_code_min = minify_html(html_code)
        css_code_min = minify_css(css_code)
        tailwind_code_min = minify_html(tailwind_code)

        # Write formatted & minified files into output_dir
        index_html_path = self.output_dir / "index.html"
        with open(index_html_path, "w", encoding="utf-8") as f:
            f.write(html_code)

        index_min_html_path = self.output_dir / "index.min.html"
        with open(index_min_html_path, "w", encoding="utf-8") as f:
            f.write(html_code_min)

        css_dir = self.output_dir / "css"
        css_dir.mkdir(exist_ok=True)
        style_css_path = css_dir / "style.css"
        with open(style_css_path, "w", encoding="utf-8") as f:
            f.write(css_code)

        style_min_css_path = css_dir / "style.min.css"
        with open(style_min_css_path, "w", encoding="utf-8") as f:
            f.write(css_code_min)

        tailwind_html_path = self.output_dir / "tailwind.html"
        with open(tailwind_html_path, "w", encoding="utf-8") as f:
            f.write(tailwind_code)

        tailwind_min_html_path = self.output_dir / "tailwind.min.html"
        with open(tailwind_min_html_path, "w", encoding="utf-8") as f:
            f.write(tailwind_code_min)

        # Generate composite raster of the entire PSD for original visual preview
        composite_filename = f"{sanitize_slug(self.psd_path.stem)}_composite.png"
        composite_path = self.output_dir / composite_filename
        composite_url = None
        try:
            comp = psd.composite()
            if comp:
                comp.save(composite_path, format="PNG")
                composite_url = f"/api/tools/psd-to-html/asset/{self.job_id}/{composite_filename}"
        except Exception:
            pass

        # Create ZIP package with root project folder containing all extracted files
        folder_slug = f"leaf-{sanitize_slug(self.psd_path.stem)}"
        zip_filename = f"{sanitize_slug(self.psd_path.stem)}_html_bundle.zip"
        zip_path = self.output_dir / zip_filename

        readme_content = f"""# {self.psd_path.stem} - LeafLite PSD to HTML & Tailwind Export

Clean semantic export extracted directly from `{self.psd_path.name}` ({doc_w}×{doc_h}px) by LeafLite Studio.

## 📁 Package Contents

- `index.html`: Semantic HTML5 markup linked to `css/style.css`.
- `index.min.html`: Minified HTML5 markup for production deployment.
- `tailwind.html`: Utility-first Tailwind CSS export ready to open in any browser.
- `tailwind.min.html`: Minified Tailwind CSS output.
- `css/style.css`: Modular custom stylesheet with CSS custom properties and responsive layout.
- `css/style.min.css`: Minified stylesheet.
- `images/`: High-efficiency WebP raster assets sliced directly from PSD layers ({len(self.extracted_assets)} assets).

## 🚀 How to Run & Preview

Open `index.html` (Modern CSS) or `tailwind.html` (Tailwind CSS) directly in any web browser.

## 🎨 Extracted Design Tokens

- **Primary Color**: `{primary_color}`
- **Secondary Color**: `{secondary_color}`
- **Fonts Detected**: {', '.join(self.fonts)}
- **Detected Sections**: {len(groups_data)}
"""

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"{folder_slug}/README.md", readme_content)
            zf.write(index_html_path, arcname=f"{folder_slug}/index.html")
            zf.write(index_min_html_path, arcname=f"{folder_slug}/index.min.html")
            zf.write(tailwind_html_path, arcname=f"{folder_slug}/tailwind.html")
            zf.write(tailwind_min_html_path, arcname=f"{folder_slug}/tailwind.min.html")
            zf.write(style_css_path, arcname=f"{folder_slug}/css/style.css")
            zf.write(style_min_css_path, arcname=f"{folder_slug}/css/style.min.css")
            for img_file in self.images_dir.glob("*.*"):
                zf.write(img_file, arcname=f"{folder_slug}/images/{img_file.name}")

        return {
            "status": "SUCCESS",
            "psd_name": self.psd_path.name,
            "layout_mode": "measured-layers",
            "dimensions": {"width": doc_w, "height": doc_h},
            "composite_url": composite_url,
            "detected_sections_count": len(groups_data),
            "extracted_images_count": len(self.extracted_assets),
            "primary_color": primary_color,
            "secondary_color": secondary_color,
            "color_palette": self.color_palette,
            "fonts": self.fonts,
            "sections": [
                {
                    "name": g["name"],
                    "type": g["type"],
                    "heading": g["heading"] or g["name"],
                    "images_count": len(g["images"]),
                    "buttons_count": len(g["buttons"])
                }
                for g in groups_data
            ],
            "measured_layers": [
                {key: value for key, value in layer.items() if key != "asset"}
                for layer in self.measured_layers
            ],
            "html_code": html_code,
            "html_code_min": html_code_min,
            "css_code": css_code,
            "css_code_min": css_code_min,
            "tailwind_code": tailwind_code,
            "tailwind_code_min": tailwind_code_min,
            "assets": self.extracted_assets,
            "zip_path": str(zip_path),
            "zip_filename": zip_filename
        }

    def _collect_measured_layers(self, psd) -> List[Dict[str, Any]]:
        measured: List[Dict[str, Any]] = []

        def visit(items):
            for layer in items:
                if not layer.visible:
                    continue
                if layer.is_group():
                    visit(layer)
                    continue
                bounds = layer.bbox
                if not bounds:
                    continue
                left, top, right, bottom = [int(value) for value in bounds]
                width = max(0, right - left)
                height = max(0, bottom - top)
                if width == 0 or height == 0:
                    continue

                if layer.kind == "type":
                    text_info = self._extract_type_info(layer)
                    if text_info:
                        measured.append({
                            "name": str(layer.name), "kind": "text", "x": left, "y": top,
                            "width": width, "height": height, "text": text_info["text"],
                            "font_family": text_info["font_family"], "font_size": text_info["font_size"],
                            "font_weight": text_info.get("font_weight", 400),
                            "color": text_info["color_hex"], "letter_spacing": text_info.get("letter_spacing", 0),
                        })
                    continue

                asset = self._slice_layer_image(layer, f"layer-{layer.name}")
                if asset:
                    measured.append({
                        "name": str(layer.name), "kind": "image", "x": left, "y": top,
                        "width": width, "height": height, "asset": asset,
                    })

        visit(psd)
        for current in measured:
            horizontal_neighbors = [
                other["x"] - current["x"] - current["width"]
                for other in measured
                if other is not current
                and other["y"] < current["y"] + current["height"]
                and other["y"] + other["height"] > current["y"]
                and other["x"] >= current["x"] + current["width"]
            ]
            vertical_neighbors = [
                other["y"] - current["y"] - current["height"]
                for other in measured
                if other is not current
                and other["x"] < current["x"] + current["width"]
                and other["x"] + other["width"] > current["x"]
                and other["y"] >= current["y"] + current["height"]
            ]
            current["space_right"] = min(horizontal_neighbors) if horizontal_neighbors else None
            current["space_below"] = min(vertical_neighbors) if vertical_neighbors else None
        return measured

    def _measured_markup(self, doc_w: int, doc_h: int, utility_classes: bool = False) -> str:
        title = escape(self.psd_path.stem)
        nodes = []
        for index, layer in enumerate(self.measured_layers):
            x = layer["x"] / doc_w * 100
            y = layer["y"] / doc_h * 100
            width = layer["width"] / doc_w * 100
            height = layer["height"] / doc_h * 100
            pos = f"left:{x:.5f}%;top:{y:.5f}%;width:{width:.5f}%;height:{height:.5f}%;"
            if layer["kind"] == "text":
                font_size = layer["font_size"] / doc_w * 100
                tracking = layer["letter_spacing"] / doc_w * 100
                style = (f"{pos}font-family:'{escape(layer['font_family'], quote=True)}',sans-serif;"
                         f"font-size:{font_size:.5f}cqw;font-weight:{layer['font_weight']};"
                         f"letter-spacing:{tracking:.5f}cqw;color:{layer['color']};white-space:pre-wrap;")
                nodes.append(f'    <span class="psd-layer psd-text" aria-label="{escape(layer["name"], quote=True)}" style="{style}">{escape(layer["text"])}</span>')
            else:
                asset = layer["asset"]
                style = pos + "object-fit:fill;"
                nodes.append(f'    <img class="psd-layer psd-image" src="images/{escape(asset["filename"], quote=True)}" alt="{escape(layer["name"], quote=True)}" style="{style}" />')

        mode_class = ' class="psd-canvas"' if not utility_classes else ' class="psd-canvas relative mx-auto w-full max-w-[%dpx]"' % doc_w
        style = f' style="aspect-ratio:{doc_w}/{doc_h};"' if utility_classes else ''
        return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} | PSD layout</title>
{self._get_google_fonts_embed(self.fonts)}
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <main aria-label="{title} PSD layout"{mode_class}{style}>
{chr(10).join(nodes)}
  </main>
</body>
</html>'''

    def _generate_measured_css_bundle(self, doc_w: int, doc_h: int, primary: str, secondary: str) -> Tuple[str, str]:
        html_code = self._measured_markup(doc_w, doc_h)
        css_code = f'''@font-face {{ font-family: "Inter"; src: local("Inter"); }}
:root {{ --primary: {primary}; --secondary: {secondary}; --design-width: {doc_w}px; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; min-height: 100%; }}
body {{ background: #f1f3f5; }}
.psd-canvas {{ position: relative; container-type: inline-size; width: min(100%, var(--design-width)); aspect-ratio: {doc_w} / {doc_h}; margin-inline: auto; overflow: hidden; background: #fff; }}
.psd-layer {{ position: absolute; display: block; margin: 0; padding: 0; }}
.psd-text {{ line-height: 1; transform-origin: top left; }}
.psd-image {{ max-width: none; }}
@media print {{ body {{ background: #fff; }} .psd-canvas {{ width: 100%; }} }}
'''
        return html_code, css_code

    def _generate_measured_tailwind_bundle(self, doc_w: int, doc_h: int, primary: str, secondary: str) -> str:
        markup = self._measured_markup(doc_w, doc_h, utility_classes=True)
        return markup.replace('<link rel="stylesheet" href="css/style.css" />', f'''<script src="https://cdn.tailwindcss.com"></script>
  <style>:root{{--primary:{primary};--secondary:{secondary}}}*{{box-sizing:border-box}}html,body{{margin:0;min-height:100%;background:#f1f3f5}}.psd-canvas{{container-type:inline-size;overflow:hidden;background:white}}.psd-layer{{position:absolute;display:block;margin:0;padding:0}}.psd-text{{line-height:1;transform-origin:top left}}.psd-image{{max-width:none}}</style>''')

    def _cluster_flat_layers(self, items: List[Any], doc_w: int, doc_h: int, color_freq: Dict[str, int], font_set: set) -> List[Dict[str, Any]]:
        """Groups flat/ungrouped layers into vertical semantic sections based on Y coordinates."""
        positioned = []
        for it in items:
            if not it.visible:
                continue
            bbox = it.bbox or (0, 0, doc_w, 50)
            positioned.append((bbox[1], it))
        positioned.sort(key=lambda x: x[0])

        if not positioned:
            return []

        # Break into sections based on 300px+ gaps or proportional heights
        sections = []
        cur_items = []
        cur_start_y = positioned[0][0]

        for y, it in positioned:
            if cur_items and (y - cur_start_y > max(600, doc_h / 8)):
                sections.append(cur_items)
                cur_items = []
                cur_start_y = y
            cur_items.append(it)
        if cur_items:
            sections.append(cur_items)

        groups = []
        for s_idx, sec_layers in enumerate(sections):
            texts = []
            images = []
            buttons = []

            for layer in sec_layers:
                if layer.kind == "type":
                    t_info = self._extract_type_info(layer)
                    if t_info:
                        texts.append(t_info)
                        font_set.add(t_info["font_family"])
                        color_freq[t_info["color_hex"]] = color_freq.get(t_info["color_hex"], 0) + 1
                elif layer.width >= 20 and layer.height >= 20:
                    img = self._slice_layer_image(layer, f"sec-{s_idx}-{layer.name}")
                    if img:
                        images.append(img)

            # Classify texts
            heading = ""
            eyebrow = ""
            subheading = ""
            paragraphs = []

            for t in texts:
                txt = t["text"]
                fsize = t["font_size"]
                tname = t["name"].lower()

                if any(k in tname for k in ("btn", "button", "cta")) or (fsize <= 18 and len(txt.split()) <= 4 and txt.isupper()):
                    if txt not in buttons and len(txt) < 35:
                        buttons.append(txt)
                        continue

                if fsize >= 28 and not heading:
                    heading = txt
                elif fsize >= 20 and not subheading:
                    subheading = txt
                elif (fsize <= 15 and txt.isupper()) and not eyebrow:
                    eyebrow = txt
                else:
                    paragraphs.append(txt)

            sec_type = "header" if s_idx == 0 and len(sections) > 1 else ("footer" if s_idx == len(sections) - 1 and len(sections) > 2 else ("hero" if s_idx <= 1 else "content"))

            groups.append({
                "id": f"section-{s_idx+1}",
                "name": f"Section {s_idx+1}",
                "type": sec_type,
                "heading": heading or (paragraphs[0] if paragraphs else f"Section {s_idx+1}"),
                "eyebrow": eyebrow,
                "subheading": subheading,
                "paragraphs": paragraphs[1:] if not heading and paragraphs else paragraphs,
                "buttons": buttons,
                "images": images,
                "nav_links": [],
                "bbox": [0, cur_start_y, doc_w, 600]
            })

        return groups

    def _process_group(self, group, idx: int, color_freq: Dict[str, int], font_set: set) -> Optional[Dict[str, Any]]:
        name_lower = group.name.lower()
        bbox = list(group.bbox) if group.bbox else [0, 0, 1920, 600]

        texts: List[Dict[str, Any]] = []
        images: List[Dict[str, Any]] = []
        buttons: List[str] = []
        nav_links: List[str] = []

        # Recursively traverse all layers (including nested groups)
        def traverse(node):
            for layer in node:
                if not layer.visible:
                    continue

                if layer.is_group():
                    traverse(layer)
                    continue

                if layer.kind == "type":
                    t_info = self._extract_type_info(layer)
                    if t_info:
                        texts.append(t_info)
                        font_set.add(t_info["font_family"])
                        col = t_info["color_hex"]
                        color_freq[col] = color_freq.get(col, 0) + 1
                elif layer.kind in ("pixel", "smartobject") or (layer.kind == "shape" and any(k in layer.name.lower() for k in ("logo", "icon", "image", "pic", "card", "thumb", "photo", "vector"))):
                    img = self._slice_layer_image(layer, f"{group.name}-{layer.name}")
                    if img:
                        images.append(img)
                elif layer.kind == "shape":
                    # Check shape fill color
                    try:
                        sd = layer.shape_data
                        # If color is extractable
                    except Exception:
                        pass

        traverse(group)

        # Classify texts into semantic roles
        heading = ""
        eyebrow = ""
        subheading = ""
        paragraphs: List[str] = []

        for t in texts:
            txt = t["text"]
            fsize = t["font_size"]
            tname = t["name"].lower()

            # Detect navigation links in header
            if "header" in name_lower or "nav" in name_lower or idx == 0:
                if any(x in txt for x in ("\t", "   ", " | ")) or len(txt.split()) <= 10:
                    parts = re.split(r'[\t|\n]{1,}|[ ]{3,}', txt)
                    for p in parts:
                        p_clean = p.strip()
                        if p_clean and len(p_clean) < 30 and p_clean not in nav_links:
                            nav_links.append(p_clean)
                    if len(nav_links) >= 2:
                        continue

            # Detect button labels
            is_btn_name = any(k in tname for k in ("button", "btn", "cta"))
            is_btn_word = any(txt.lower().startswith(k) for k in ("get", "sign", "order", "learn", "start", "contact", "book", "shop", "explore", "view", "estimate", "download"))
            if is_btn_name or (is_btn_word and len(txt.split()) <= 4):
                if txt not in buttons and len(txt) < 35:
                    buttons.append(txt)
                    continue

            # Headings vs Eyebrow vs Paragraph
            if fsize >= 28:
                if not heading:
                    heading = txt
                elif not subheading:
                    subheading = txt
                else:
                    paragraphs.append(txt)
            elif fsize >= 20:
                if not subheading:
                    subheading = txt
                elif not heading:
                    heading = txt
                else:
                    paragraphs.append(txt)
            elif fsize <= 15 and (txt.isupper() or any(k in tname for k in ("eyebrow", "tag", "badge", "pill", "category")) or len(txt) < 30):
                if not eyebrow:
                    eyebrow = txt
                else:
                    paragraphs.append(txt)
            else:
                paragraphs.append(txt)

        # Infer section type
        sec_type = "content"
        if any(k in name_lower for k in ("header", "nav", "top", "menu")) or (idx == 0 and len(nav_links) > 0):
            sec_type = "header"
        elif any(k in name_lower for k in ("footer", "bottom", "copyright")):
            sec_type = "footer"
        elif any(k in name_lower for k in ("hero", "banner", "intro", "welcome")):
            sec_type = "hero"
        elif any(k in name_lower for k in ("grid", "cards", "services", "conversions", "tiles", "features", "products")):
            sec_type = "cards_grid"
        elif any(k in name_lower for k in ("photo & content", "content & photo", "split", "about")):
            sec_type = "feature_two_col"
        elif "stat" in name_lower or "number" in name_lower:
            sec_type = "stats"
        elif "testimonial" in name_lower or "review" in name_lower:
            sec_type = "testimonials"
        elif any(k in name_lower for k in ("faq", "accordion", "question")):
            sec_type = "faq"
        elif "logo" in name_lower or "partner" in name_lower or "sponsor" in name_lower:
            sec_type = "logos"
        elif any(k in name_lower for k in ("cta", "contact", "form")):
            sec_type = "cta"

        return {
            "id": f"section-{idx+1}",
            "name": group.name,
            "type": sec_type,
            "heading": heading,
            "eyebrow": eyebrow,
            "subheading": subheading,
            "paragraphs": paragraphs,
            "buttons": buttons,
            "images": images,
            "nav_links": nav_links,
            "bbox": bbox
        }

    def _extract_type_info(self, layer) -> Optional[Dict[str, Any]]:
        try:
            txt = layer.text or ""
            txt = txt.replace('\r', '\n').strip()
            if not txt:
                return None

            font_size = 16.0
            font_family = "Inter"
            color_hex = "#1e293b"
            font_weight = 400
            letter_spacing = 0.0

            td = layer.engine_dict
            rd = layer.resource_dict
            if td and 'StyleRun' in td:
                run_data = td['StyleRun'].get('RunArray', [])
                if run_data:
                    sheet = run_data[0].get('StyleSheet', {}).get('StyleSheetData', {})
                    font_size = float(sheet.get('FontSize', 16.0))
                    font_weight = 700 if sheet.get('FauxBold') else 400
                    letter_spacing = float(sheet.get('Tracking', 0) or 0) / 1000.0 * font_size
                    font_idx = sheet.get('Font', 0)
                    if rd and 'FontSet' in rd:
                        fonts = rd.get('FontSet', [])
                        if font_idx < len(fonts):
                            fname = fonts[font_idx].get('Name', '')
                            if fname:
                                if re.search(r"(bold|black|heavy|semibold|demi)", str(fname), re.IGNORECASE):
                                    font_weight = 700
                                elif re.search(r"medium", str(fname), re.IGNORECASE):
                                    font_weight = 500
                                elif re.search(r"(light|thin)", str(fname), re.IGNORECASE):
                                    font_weight = 300
                                clean_f = str(fname).strip("'\"").split('-')[0].replace("72ptSoft", "").replace("72pt", "").strip()
                                if clean_f:
                                    font_family = clean_f

                    fill = sheet.get('FillColor', {})
                    if fill and 'Values' in fill:
                        vals = fill['Values']
                        if len(vals) == 4 and fill.get('Type') == 1:
                            color_hex = rgb_to_hex(vals[1], vals[2], vals[3])
                        elif len(vals) >= 3:
                            color_hex = rgb_to_hex(vals[0], vals[1], vals[2])

            return {
                "name": str(layer.name),
                "text": txt,
                "font_size": round(font_size),
                "font_family": font_family or "Inter",
                "font_weight": font_weight,
                "letter_spacing": letter_spacing,
                "color_hex": color_hex,
                "bbox": list(layer.bbox) if layer.bbox else [0, 0, 100, 30]
            }
        except Exception:
            return None

    def _slice_layer_image(self, layer, base_name: str) -> Optional[Dict[str, Any]]:
        try:
            cached_asset = self.layer_asset_cache.get(id(layer))
            if cached_asset:
                return cached_asset
            if not layer.bbox or layer.width < 10 or layer.height < 10:
                return None

            comp = layer.composite()
            if not comp:
                return None

            self.asset_counter += 1
            clean_name = sanitize_slug(base_name)
            filename = f"{clean_name}-{self.asset_counter}.webp"
            target_path = self.images_dir / filename

            c = 1
            while target_path.exists():
                filename = f"{clean_name}-{self.asset_counter}_{c}.webp"
                target_path = self.images_dir / filename
                c += 1

            if comp.mode not in ("RGB", "RGBA"):
                comp = comp.convert("RGBA")
            comp.save(target_path, "WEBP", quality=85)

            asset_info = {
                "name": layer.name,
                "filename": filename,
                "path": f"images/{filename}",
                "url": f"/api/tools/psd-to-html/asset/{self.job_id}/{filename}",
                "width": comp.width,
                "height": comp.height,
                "size_bytes": target_path.stat().st_size
            }
            self.extracted_assets.append(asset_info)
            self.layer_asset_cache[id(layer)] = asset_info
            return asset_info
        except Exception:
            return None

    def _get_google_fonts_embed(self, fonts: List[str]) -> str:
        standard_fonts = {"arial", "helvetica", "sans-serif", "serif", "times", "georgia", "system-ui"}
        web_fonts = [f for f in fonts if f.lower() not in standard_fonts]
        if not web_fonts:
            return '  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">'

        family_params = []
        for f in web_fonts[:2]:
            clean_name = f.replace(' ', '+')
            family_params.append(f"family={clean_name}:wght@400;600;700;800")
        query_str = "&".join(family_params)
        return f'  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?{query_str}&display=swap" rel="stylesheet">'

    def _generate_modern_css_bundle(self, sections: List[Dict[str, Any]], doc_w: int, primary: str, secondary: str) -> Tuple[str, str]:
        """Generates clean, semantic HTML5 and modular CSS matching the PSD's exact content."""
        font_embed = self._get_google_fonts_embed(self.fonts)
        font_family_main = self.fonts[0] if self.fonts else "Inter"
        font_family_heading = self.fonts[1] if len(self.fonts) > 1 else font_family_main

        html_lines = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            f'  <title>{self.psd_path.stem} | LeafLite PSD to HTML</title>',
            font_embed,
            '  <link rel="stylesheet" href="css/style.css" />',
            '</head>',
            '<body>'
        ]

        css_lines = [
            '/* ========================================================================= */',
            f'/* 🍃 LeafLite Generated CSS: {self.psd_path.stem} */',
            '/* ========================================================================= */',
            ':root {',
            f'  --primary: {primary};',
            f'  --secondary: {secondary};',
            '  --text-dark: #0f172a;',
            '  --text-muted: #64748b;',
            '  --bg-light: #f8fafc;',
            f'  --font-body: "{font_family_main}", system-ui, -apple-system, sans-serif;',
            f'  --font-heading: "{font_family_heading}", "{font_family_main}", sans-serif;',
            '  --container-max: 1440px;',
            '}',
            '',
            '* { box-sizing: border-box; margin: 0; padding: 0; }',
            'body { font-family: var(--font-body); color: var(--text-dark); background: #ffffff; line-height: 1.6; -webkit-font-smoothing: antialiased; }',
            'a { text-decoration: none; color: inherit; transition: all 0.25s ease; }',
            'img { max-width: 100%; height: auto; display: block; }',
            '.container { max-width: var(--container-max); margin: 0 auto; padding: 0 24px; width: 100%; }',
            '',
            '/* Typography */',
            'h1, h2, h3, h4 { font-family: var(--font-heading); color: var(--primary); font-weight: 700; line-height: 1.25; margin-bottom: 1rem; }',
            'h1 { font-size: clamp(32px, 5vw, 56px); letter-spacing: -0.02em; }',
            'h2 { font-size: clamp(26px, 3.5vw, 42px); }',
            'h3 { font-size: clamp(20px, 2.5vw, 28px); }',
            'p { color: var(--text-muted); font-size: 16px; margin-bottom: 1.25rem; }',
            '.eyebrow { text-transform: uppercase; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: var(--secondary); margin-bottom: 0.75rem; display: inline-block; }',
            '',
            '/* Buttons */',
            '.btn { display: inline-flex; align-items: center; justify-content: center; padding: 13px 26px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 8px; transition: all 0.25s ease; cursor: pointer; border: none; }',
            '.btn-primary { background: var(--primary); color: #ffffff; }',
            '.btn-primary:hover { background: var(--secondary); transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.15); }',
            '.btn-secondary { background: var(--secondary); color: #ffffff; }',
            '.btn-secondary:hover { background: var(--primary); transform: translateY(-2px); }',
            '.btn-outline { background: transparent; color: #ffffff; border: 2px solid #ffffff; }',
            '.btn-outline:hover { background: #ffffff; color: var(--primary); }',
            '',
            '/* Section Wrappers */',
            'section { padding: 80px 0; position: relative; }',
            '.section-alt { background-color: var(--bg-light); }',
            ''
        ]

        for s in sections:
            stype = s["type"]
            sname = s["name"]
            sid = s["id"]
            heading = s["heading"]
            eyebrow = s["eyebrow"]
            subheading = s["subheading"]
            paras = s["paragraphs"]
            btns = s["buttons"]
            imgs = s["images"]
            nav_links = s.get("nav_links", [])

            if stype == "header":
                html_lines.append(f'  <!-- {sname} -->')
                html_lines.append('  <header class="site-header">')
                html_lines.append('    <div class="container header-container">')
                logo_img = next((img for img in imgs if "logo" in img["filename"].lower()), imgs[0] if imgs else None)
                if logo_img:
                    html_lines.append(f'      <a href="#" class="logo"><img src="{logo_img["path"]}" alt="Logo" /></a>')
                else:
                    html_lines.append(f'      <a href="#" class="logo-text">{self.psd_path.stem.replace("_", " ")}</a>')

                if nav_links:
                    html_lines.append('      <nav class="main-nav">')
                    html_lines.append('        <ul>')
                    for l in nav_links[:7]:
                        html_lines.append(f'          <li><a href="#{sanitize_slug(l)}">{l}</a></li>')
                    html_lines.append('        </ul>')
                    html_lines.append('      </nav>')

                if btns:
                    html_lines.append(f'      <a href="#action" class="btn btn-secondary">{btns[0]}</a>')
                html_lines.append('    </div>')
                html_lines.append('  </header>')

                css_lines.extend([
                    '/* Site Header */',
                    '.site-header { width: 100%; padding: 18px 0; background: #ffffff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }',
                    '.header-container { display: flex; align-items: center; justify-content: space-between; gap: 24px; }',
                    '.logo img { max-height: 44px; width: auto; }',
                    '.logo-text { font-family: var(--font-heading); font-size: 22px; font-weight: 800; color: var(--primary); }',
                    '.main-nav ul { display: flex; list-style: none; gap: 24px; }',
                    '.main-nav a { font-size: 14px; font-weight: 600; text-transform: uppercase; color: var(--text-dark); }',
                    '.main-nav a:hover { color: var(--secondary); }',
                    '@media (max-width: 992px) { .main-nav { display: none; } }',
                    ''
                ])

            elif stype in ("hero", "banner"):
                banner_img = max(imgs, key=lambda x: x["width"] * x["height"]) if imgs else None
                bg_style = f' style="background-image: linear-gradient(rgba(15,23,42,0.7), rgba(15,23,42,0.7)), url(\'{banner_img["path"]}\'); background-size: cover; background-position: center;"' if banner_img else ' class="banner-gradient"'

                html_lines.append(f'  <!-- Hero: {sname} -->')
                html_lines.append(f'  <section class="hero-banner"{bg_style}>')
                html_lines.append('    <div class="container hero-container">')
                if eyebrow:
                    html_lines.append(f'      <span class="eyebrow hero-eyebrow">{eyebrow}</span>')
                if heading:
                    html_lines.append(f'      <h1>{heading}</h1>')
                if subheading:
                    html_lines.append(f'      <p class="hero-desc">{subheading}</p>')
                elif paras:
                    html_lines.append(f'      <p class="hero-desc">{paras[0]}</p>')
                if btns:
                    html_lines.append('      <div class="hero-btns">')
                    for b_idx, b in enumerate(btns[:2]):
                        b_cls = "btn-secondary" if b_idx == 0 else "btn-outline"
                        html_lines.append(f'        <a href="#action" class="btn {b_cls}">{b}</a>')
                    html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </section>')

                css_lines.extend([
                    '/* Hero Banner */',
                    '.hero-banner { min-height: 600px; display: flex; align-items: center; color: #ffffff; padding: 100px 0; }',
                    '.banner-gradient { background: linear-gradient(135deg, var(--primary), var(--secondary)); }',
                    '.hero-container { max-width: 860px; text-align: left; }',
                    '.hero-banner h1 { color: #ffffff; font-weight: 800; text-shadow: 0 2px 10px rgba(0,0,0,0.3); }',
                    '.hero-eyebrow { color: #38bdf8; }',
                    '.hero-desc { color: #e2e8f0; font-size: 18px; margin-bottom: 28px; max-width: 700px; }',
                    '.hero-btns { display: flex; gap: 14px; flex-wrap: wrap; }',
                    ''
                ])

            elif stype == "cards_grid":
                html_lines.append(f'  <!-- Cards Grid: {sname} -->')
                html_lines.append(f'  <section class="cards-section section-alt" id="{sid}">')
                html_lines.append('    <div class="container">')
                if eyebrow or heading:
                    html_lines.append('      <div class="section-title-wrap">')
                    if eyebrow:
                        html_lines.append(f'        <span class="eyebrow">{eyebrow}</span>')
                    if heading:
                        html_lines.append(f'        <h2>{heading}</h2>')
                    html_lines.append('      </div>')

                html_lines.append('      <div class="cards-grid">')
                card_items = imgs if imgs else [None] * max(1, min(len(paras), 4))
                for c_idx, card_img in enumerate(card_items[:6]):
                    html_lines.append('        <div class="card-item">')
                    if card_img:
                        html_lines.append(f'          <div class="card-img-wrap"><img src="{card_img["path"]}" alt="{sname} Item {c_idx+1}" /></div>')
                    html_lines.append('          <div class="card-body">')
                    c_title = paras[c_idx] if c_idx < len(paras) and len(paras[c_idx]) < 50 else f"{sname} Item {c_idx+1}"
                    html_lines.append(f'            <h3>{c_title}</h3>')
                    if c_idx < len(paras) and paras[c_idx] != c_title:
                        html_lines.append(f'            <p>{paras[c_idx]}</p>')
                    html_lines.append('            <a href="#" class="card-link">Learn More &rarr;</a>')
                    html_lines.append('          </div>')
                    html_lines.append('        </div>')
                html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </section>')

                css_lines.extend([
                    '/* Cards Grid */',
                    '.section-title-wrap { text-align: center; max-width: 760px; margin: 0 auto 48px auto; }',
                    '.cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 28px; }',
                    '.card-item { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.05); transition: all 0.3s ease; }',
                    '.card-item:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0,0,0,0.1); }',
                    '.card-img-wrap img { width: 100%; height: 210px; object-fit: cover; }',
                    '.card-body { padding: 24px; }',
                    '.card-link { font-weight: 700; color: var(--secondary); display: inline-flex; align-items: center; gap: 6px; }',
                    '.card-link:hover { color: var(--primary); }',
                    ''
                ])

            elif stype == "footer":
                html_lines.append(f'  <!-- Footer: {sname} -->')
                html_lines.append('  <footer class="site-footer">')
                html_lines.append('    <div class="container footer-grid">')
                html_lines.append('      <div class="footer-col">')
                html_lines.append(f'        <h4 class="footer-title">{heading or self.psd_path.stem.replace("_", " ")}</h4>')
                for p in paras[:2]:
                    html_lines.append(f'        <p>{p}</p>')
                html_lines.append('      </div>')
                if nav_links:
                    html_lines.append('      <div class="footer-col">')
                    html_lines.append('        <h4 class="footer-title">Navigation</h4>')
                    html_lines.append('        <ul class="footer-links">')
                    for ql in nav_links[:6]:
                        html_lines.append(f'          <li><a href="#{sanitize_slug(ql)}">{ql}</a></li>')
                    html_lines.append('        </ul>')
                    html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('    <div class="footer-bottom">')
                html_lines.append('      <div class="container">')
                html_lines.append(f'        <p>&copy; {self.psd_path.stem}. All rights reserved.</p>')
                html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </footer>')

                css_lines.extend([
                    '/* Footer */',
                    '.site-footer { background: #0f172a; color: #94a3b8; padding-top: 60px; }',
                    '.footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 36px; padding-bottom: 48px; }',
                    '.footer-title { color: #ffffff; font-size: 18px; margin-bottom: 16px; }',
                    '.footer-links { list-style: none; }',
                    '.footer-links li { margin-bottom: 8px; }',
                    '.footer-links a:hover { color: #ffffff; }',
                    '.footer-bottom { border-top: 1px solid #1e293b; padding: 20px 0; text-align: center; font-size: 13px; }',
                    ''
                ])

            else:
                # Content or Two-Column Section
                has_img = len(imgs) > 0
                html_lines.append(f'  <!-- Section: {sname} -->')
                html_lines.append(f'  <section class="{"feature-two-col" if has_img else "generic-section"}" id="{sid}">')
                html_lines.append(f'    <div class="container {"feature-grid" if has_img else ""}">')
                if has_img:
                    feat_img = imgs[0]
                    html_lines.append('      <div class="feature-media">')
                    html_lines.append(f'        <img src="{feat_img["path"]}" alt="{heading or sname}" class="feature-img" />')
                    html_lines.append('      </div>')

                html_lines.append('      <div class="feature-content">')
                if eyebrow:
                    html_lines.append(f'        <span class="eyebrow">{eyebrow}</span>')
                if heading:
                    html_lines.append(f'        <h2>{heading}</h2>')
                if subheading:
                    html_lines.append(f'        <p class="subheading">{subheading}</p>')
                for p in paras[:3]:
                    html_lines.append(f'        <p>{p}</p>')
                if btns:
                    html_lines.append(f'        <a href="#action" class="btn btn-primary">{btns[0]}</a>')
                html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </section>')

                if has_img:
                    css_lines.extend([
                        '/* Two Column Feature */',
                        '.feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; align-items: center; }',
                        '.feature-img { width: 100%; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }',
                        '@media (max-width: 900px) { .feature-grid { grid-template-columns: 1fr; gap: 32px; } }',
                        ''
                    ])

        html_lines.extend([
            '</body>',
            '</html>'
        ])

        return "\n".join(html_lines), "\n".join(css_lines)

    def _generate_tailwind_bundle(self, sections: List[Dict[str, Any]], doc_w: int, primary: str, secondary: str) -> str:
        """Generates self-contained Tailwind CSS markup based on the PSD's actual layers."""
        font_embed = self._get_google_fonts_embed(self.fonts)
        font_family_main = self.fonts[0] if self.fonts else "Inter"

        tw_lines = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            f'  <title>{self.psd_path.stem} | LeafLite PSD to Tailwind</title>',
            '  <script src="https://cdn.tailwindcss.com"></script>',
            '  <script>',
            '    tailwind.config = {',
            '      theme: {',
            '        extend: {',
            '          colors: {',
            f'            brandPrimary: "{primary}",',
            f'            brandSecondary: "{secondary}",',
            '          }',
            '        }',
            '      }',
            '    }',
            '  </script>',
            font_embed,
            '  <style>',
            f'    body {{ font-family: "{font_family_main}", system-ui, sans-serif; }}',
            '  </style>',
            '</head>',
            '<body class="bg-white text-slate-800 antialiased selection:bg-cyan-500 selection:text-white">'
        ]

        for s in sections:
            stype = s["type"]
            sname = s["name"]
            heading = s["heading"]
            eyebrow = s["eyebrow"]
            subheading = s["subheading"]
            paras = s["paragraphs"]
            btns = s["buttons"]
            imgs = s["images"]
            nav_links = s.get("nav_links", [])

            if stype == "header":
                tw_lines.append(f'  <!-- Header: {sname} -->')
                tw_lines.append('  <header class="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">')
                tw_lines.append('    <div class="max-w-[1440px] mx-auto px-6 h-20 flex items-center justify-between gap-6">')
                logo_img = next((img for img in imgs if "logo" in img["filename"].lower()), imgs[0] if imgs else None)
                if logo_img:
                    tw_lines.append(f'      <a href="#" class="shrink-0"><img src="{logo_img["path"]}" alt="Logo" class="h-10 w-auto" /></a>')
                else:
                    tw_lines.append(f'      <a href="#" class="text-xl font-bold text-brandPrimary shrink-0">{self.psd_path.stem.replace("_", " ")}</a>')

                if nav_links:
                    tw_lines.append('      <nav class="hidden lg:flex items-center gap-8">')
                    for l in nav_links[:7]:
                        tw_lines.append(f'        <a href="#{sanitize_slug(l)}" class="text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-brandSecondary transition-colors">{l}</a>')
                    tw_lines.append('      </nav>')

                if btns:
                    tw_lines.append(f'      <a href="#action" class="px-5 py-2.5 bg-brandSecondary hover:bg-brandPrimary text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-sm">{btns[0]}</a>')
                tw_lines.append('    </div>')
                tw_lines.append('  </header>')

            elif stype in ("hero", "banner"):
                banner_img = max(imgs, key=lambda x: x["width"] * x["height"]) if imgs else None
                bg_attr = f'style="background-image: linear-gradient(rgba(15,23,42,0.7), rgba(15,23,42,0.7)), url(\'{banner_img["path"]}\'); background-size: cover; background-position: center;"' if banner_img else 'class="bg-gradient-to-tr from-brandPrimary to-brandSecondary"'
                tw_lines.append(f'  <!-- Hero: {sname} -->')
                tw_lines.append(f'  <section class="min-h-[580px] flex items-center py-20 text-white" {bg_attr}>')
                tw_lines.append('    <div class="max-w-[1440px] mx-auto px-6 w-full">')
                tw_lines.append('      <div class="max-w-3xl space-y-5">')
                if eyebrow:
                    tw_lines.append(f'        <span class="inline-block text-cyan-300 text-xs font-bold uppercase tracking-widest">{eyebrow}</span>')
                if heading:
                    tw_lines.append(f'        <h1 class="text-4xl sm:text-6xl font-extrabold leading-tight drop-shadow-md">{heading}</h1>')
                if subheading:
                    tw_lines.append(f'        <p class="text-slate-200 text-lg leading-relaxed">{subheading}</p>')
                elif paras:
                    tw_lines.append(f'        <p class="text-slate-200 text-lg leading-relaxed">{paras[0]}</p>')
                if btns:
                    tw_lines.append('        <div class="flex flex-wrap gap-4 pt-2">')
                    for b_idx, b in enumerate(btns[:2]):
                        b_cls = "bg-brandSecondary hover:bg-brandPrimary text-white shadow-md" if b_idx == 0 else "border-2 border-white hover:bg-white hover:text-brandPrimary text-white"
                        tw_lines.append(f'          <a href="#action" class="px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all {b_cls}">{b}</a>')
                    tw_lines.append('        </div>')
                tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('  </section>')

            elif stype == "cards_grid":
                tw_lines.append(f'  <!-- Cards Grid: {sname} -->')
                tw_lines.append('  <section class="py-20 bg-slate-50">')
                tw_lines.append('    <div class="max-w-[1440px] mx-auto px-6">')
                if eyebrow or heading:
                    tw_lines.append('      <div class="text-center max-w-2xl mx-auto mb-14">')
                    if eyebrow:
                        tw_lines.append(f'        <span class="text-brandSecondary text-xs font-bold uppercase tracking-widest block mb-2">{eyebrow}</span>')
                    if heading:
                        tw_lines.append(f'        <h2 class="text-3xl sm:text-4xl font-bold text-brandPrimary">{heading}</h2>')
                    tw_lines.append('      </div>')

                tw_lines.append('      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">')
                card_items = imgs if imgs else [None] * max(1, min(len(paras), 4))
                for c_idx, c_img in enumerate(card_items[:6]):
                    tw_lines.append('        <div class="bg-white rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 border border-slate-100 flex flex-col">')
                    if c_img:
                        tw_lines.append(f'          <img src="{c_img["path"]}" alt="{sname} Item {c_idx+1}" class="w-full h-52 object-cover" />')
                    tw_lines.append('          <div class="p-6 flex-1 flex flex-col justify-between">')
                    c_title = paras[c_idx] if c_idx < len(paras) and len(paras[c_idx]) < 50 else f"{sname} Item {c_idx+1}"
                    tw_lines.append('            <div>')
                    tw_lines.append(f'              <h3 class="text-lg font-bold text-brandPrimary mb-2">{c_title}</h3>')
                    if c_idx < len(paras) and paras[c_idx] != c_title:
                        tw_lines.append(f'              <p class="text-slate-600 text-sm leading-relaxed mb-4">{paras[c_idx]}</p>')
                    tw_lines.append('            </div>')
                    tw_lines.append('            <a href="#" class="text-xs font-bold text-brandSecondary hover:text-brandPrimary inline-flex items-center gap-1 uppercase tracking-wider">Learn More &rarr;</a>')
                    tw_lines.append('          </div>')
                    tw_lines.append('        </div>')
                tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('  </section>')

            elif stype == "footer":
                tw_lines.append(f'  <!-- Footer: {sname} -->')
                tw_lines.append('  <footer class="bg-slate-900 text-slate-400 pt-16 pb-10">')
                tw_lines.append('    <div class="max-w-[1440px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-10 pb-12 border-b border-slate-800">')
                tw_lines.append('      <div>')
                tw_lines.append(f'        <h4 class="text-white text-lg font-bold mb-3">{heading or self.psd_path.stem.replace("_", " ")}</h4>')
                for p in paras[:2]:
                    tw_lines.append(f'        <p class="text-sm leading-relaxed text-slate-400 mb-2">{p}</p>')
                tw_lines.append('      </div>')
                if nav_links:
                    tw_lines.append('      <div>')
                    tw_lines.append('        <h4 class="text-white text-lg font-bold mb-3">Navigation</h4>')
                    tw_lines.append('        <ul class="space-y-2 text-sm">')
                    for ql in nav_links[:6]:
                        tw_lines.append(f'          <li><a href="#{sanitize_slug(ql)}" class="hover:text-white transition-colors">{ql}</a></li>')
                    tw_lines.append('        </ul>')
                    tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('    <div class="max-w-[1440px] mx-auto px-6 text-center text-xs text-slate-500 pt-6">')
                tw_lines.append(f'      &copy; {self.psd_path.stem}. All rights reserved.')
                tw_lines.append('    </div>')
                tw_lines.append('  </footer>')

            else:
                has_img = len(imgs) > 0
                tw_lines.append(f'  <!-- Section: {sname} -->')
                tw_lines.append(f'  <section class="py-16 {"bg-slate-50" if s.get("id", "").endswith("2") or s.get("id", "").endswith("4") else "bg-white"}">')
                tw_lines.append(f'    <div class="max-w-[1440px] mx-auto px-6 {"grid grid-cols-1 lg:grid-cols-2 gap-12 items-center" if has_img else "max-w-3xl text-center mx-auto"}">')
                if has_img:
                    tw_lines.append(f'      <div><img src="{imgs[0]["path"]}" alt="{heading or sname}" class="rounded-xl shadow-md w-full object-cover max-h-[480px]" /></div>')
                tw_lines.append('      <div class="space-y-4">')
                if eyebrow:
                    tw_lines.append(f'        <span class="text-brandSecondary text-xs font-bold uppercase tracking-widest block">{eyebrow}</span>')
                if heading:
                    tw_lines.append(f'        <h2 class="text-3xl sm:text-4xl font-bold text-brandPrimary">{heading}</h2>')
                if subheading:
                    tw_lines.append(f'        <p class="text-slate-600 text-lg leading-relaxed">{subheading}</p>')
                for p in paras[:3]:
                    tw_lines.append(f'        <p class="text-slate-600 leading-relaxed">{p}</p>')
                if btns:
                    tw_lines.append(f'        <a href="#action" class="inline-block px-6 py-3 bg-brandPrimary hover:bg-brandSecondary text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all">{btns[0]}</a>')
                tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('  </section>')

        tw_lines.extend([
            '</body>',
            '</html>'
        ])

        return "\n".join(tw_lines)
