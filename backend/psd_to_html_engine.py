import os
import re
import json
import uuid
import shutil
import zipfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from PIL import Image
import psd_tools

def sanitize_slug(name: str) -> str:
    s = re.sub(r'[^a-zA-Z0-9_\-\s]', '', name).strip()
    s = re.sub(r'[\s_]+', '-', s).lower()
    return s or "layer"

def rgb_to_hex(r: float, g: float, b: float) -> str:
    ir = int(round(r * 255 if r <= 1.0 else r))
    ig = int(round(g * 255 if g <= 1.0 else g))
    ib = int(round(b * 255 if b <= 1.0 else b))
    ir = max(0, min(255, ir))
    ig = max(0, min(255, ig))
    ib = max(0, min(255, ib))
    return f"#{ir:02x}{ig:02x}{ib:02x}"

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

    def parse_and_generate(self) -> Dict[str, Any]:
        psd = psd_tools.PSDImage.open(self.psd_path)
        doc_w = psd.width or 1920
        doc_h = psd.height or 1080

        groups_data = []
        color_freq: Dict[str, int] = {}
        font_set = set()

        # Iterate top-level groups or loose layers
        top_items = []
        for item in psd:
            if not item.visible:
                continue
            bbox = item.bbox
            top_y = bbox[1] if bbox else 0
            top_items.append((top_y, item))

        # Sort top-level elements vertically
        top_items.sort(key=lambda x: x[0])

        for idx, (_, item) in enumerate(top_items):
            if item.is_group():
                g_info = self._process_group(item, idx, color_freq, font_set)
                if g_info:
                    groups_data.append(g_info)
            else:
                # Standalone background or banner
                img_asset = self._slice_layer_image(item, f"root-item-{idx}")
                if img_asset:
                    groups_data.append({
                        "id": f"section-{idx}",
                        "name": item.name,
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

        # Palette determination
        sorted_colors = sorted(color_freq.items(), key=lambda x: x[1], reverse=True)
        # Filter out pure whites/blacks for primary palette
        dominant_accents = [c for c, _ in sorted_colors if c not in ("#ffffff", "#000000", "#111827", "#f8fafc")]
        primary_color = dominant_accents[0] if dominant_accents else "#003478"
        secondary_color = dominant_accents[1] if len(dominant_accents) > 1 else "#0088ce"

        self.color_palette = [primary_color, secondary_color, "#484848", "#f4f6f8"]
        self.fonts = list(font_set) or ["Overpass", "Fraunces"]

        # Generate Code Flavors
        html_code, css_code = self._generate_modern_css_bundle(groups_data, doc_w, primary_color, secondary_color)
        tailwind_code = self._generate_tailwind_bundle(groups_data, doc_w, primary_color, secondary_color)

        # Write files into output_dir
        index_html_path = self.output_dir / "index.html"
        with open(index_html_path, "w", encoding="utf-8") as f:
            f.write(html_code)

        css_dir = self.output_dir / "css"
        css_dir.mkdir(exist_ok=True)
        style_css_path = css_dir / "style.css"
        with open(style_css_path, "w", encoding="utf-8") as f:
            f.write(css_code)

        tailwind_html_path = self.output_dir / "tailwind.html"
        with open(tailwind_html_path, "w", encoding="utf-8") as f:
            f.write(tailwind_code)

        # Generate composite raster of the entire PSD for original design preview
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

        # Create ZIP package with root project folder containing all files
        folder_slug = f"leaf-{sanitize_slug(self.psd_path.stem)}"
        zip_filename = f"{sanitize_slug(self.psd_path.stem)}_html_bundle.zip"
        zip_path = self.output_dir / zip_filename

        readme_content = f"""# {self.psd_path.stem} - LeafLite HTML & Tailwind Export

This complete project package was generated from `{self.psd_path.name}` ({doc_w}x{doc_h}px) by LeafLite Studio.

## 📁 Project Structure

- `index.html`: Modern semantic HTML5 markup with custom CSS link.
- `tailwind.html`: Utility-first Tailwind CSS export ready to preview in any browser.
- `css/style.css`: Modular stylesheet with custom properties, responsive design, and transitions.
- `images/`: High-efficiency WebP raster assets extracted directly from PSD layers.

## 🚀 How to Run & Preview

1. Open `index.html` (Modern CSS) or `tailwind.html` (Tailwind CSS) in any modern web browser.
2. Or serve locally with any static server:
   - Python: `python -m http.server 3000`
   - Node: `npx serve .`

## 🎨 Design Tokens & Palette

- **Primary Color**: `{primary_color}`
- **Secondary Color**: `{secondary_color}`
- **Fonts Detected**: {', '.join(self.fonts)}
"""

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"{folder_slug}/README.md", readme_content)
            zf.write(index_html_path, arcname=f"{folder_slug}/index.html")
            zf.write(tailwind_html_path, arcname=f"{folder_slug}/tailwind.html")
            zf.write(style_css_path, arcname=f"{folder_slug}/css/style.css")
            for img_file in self.images_dir.glob("*.*"):
                zf.write(img_file, arcname=f"{folder_slug}/images/{img_file.name}")

        return {
            "status": "SUCCESS",
            "psd_name": self.psd_path.name,
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
                    "heading": g["heading"],
                    "images_count": len(g["images"]),
                    "buttons_count": len(g["buttons"])
                }
                for g in groups_data
            ],
            "html_code": html_code,
            "css_code": css_code,
            "tailwind_code": tailwind_code,
            "assets": self.extracted_assets,
            "zip_path": str(zip_path),
            "zip_filename": zip_filename
        }

    def _process_group(self, group, idx: int, color_freq: Dict[str, int], font_set: set) -> Optional[Dict[str, Any]]:
        name_lower = group.name.lower()
        bbox = list(group.bbox) if group.bbox else [0, 0, 1920, 600]

        texts: List[Dict[str, Any]] = []
        images: List[Dict[str, Any]] = []
        buttons: List[str] = []

        # Recursively inspect layers within group
        for layer in group:
            if not layer.visible:
                continue

            if layer.kind == "type":
                t_info = self._extract_type_info(layer)
                if t_info:
                    texts.append(t_info)
                    font_set.add(t_info["font_family"])
                    col = t_info["color_hex"]
                    color_freq[col] = color_freq.get(col, 0) + 1
            elif layer.kind in ("pixel", "smartobject") or (layer.kind == "shape" and "logo" in layer.name.lower()):
                img = self._slice_layer_image(layer, f"{group.name}-{layer.name}")
                if img:
                    images.append(img)
            elif layer.kind == "shape":
                # Button or shape card background
                if any(k in layer.name.lower() for k in ("button", "btn", "rectangle 2", "cta")):
                    pass

        # Classify texts into semantic roles
        heading = ""
        eyebrow = ""
        subheading = ""
        paragraphs = []
        nav_links = []

        for t in texts:
            txt = t["text"]
            fsize = t["font_size"]
            tname = t["name"].lower()

            # Detect navigation links
            if any(k in txt.lower() for k in ("about", "services", "contact", "projects", "home")) and ("\t" in txt or "  " in txt or len(txt.split()) <= 10):
                if any(x in txt for x in ("\t", "   ", "v")):
                    parts = re.split(r'[\tv\s]{2,}', txt)
                    for p in parts:
                        p_clean = p.replace('v', '').strip()
                        if p_clean and len(p_clean) < 30:
                            nav_links.append(p_clean)
                else:
                    nav_links.append(txt)
                continue

            # Detect buttons
            if any(k in tname for k in ("button", "btn", "estimate", "explore", "view", "more", "start")) or (fsize <= 18 and len(txt.split()) <= 4 and txt.isupper()):
                if txt not in buttons and len(txt) < 35:
                    buttons.append(txt)
                    continue

            # Headings vs Eyebrow vs Paragraph
            if fsize >= 34:
                if not heading:
                    heading = txt
                else:
                    paragraphs.append(txt)
            elif fsize >= 22:
                if not subheading:
                    subheading = txt
                else:
                    paragraphs.append(txt)
            elif fsize <= 16 and (txt.isupper() or "welcome" in txt.lower() or "service" in txt.lower() or len(txt) < 40):
                if not eyebrow:
                    eyebrow = txt
                else:
                    paragraphs.append(txt)
            else:
                paragraphs.append(txt)

        # Determine section type
        sec_type = "content"
        if "header" in name_lower or idx == 0:
            sec_type = "header"
        elif "footer" in name_lower or idx >= 15:
            sec_type = "footer"
        elif any(k in name_lower for k in ("banner", "hero")):
            sec_type = "banner"
        elif any(k in name_lower for k in ("conversion", "service", "tile", "grid")):
            sec_type = "cards_grid"
        elif any(k in name_lower for k in ("photo & content", "content & photo", "welcome", "about")):
            sec_type = "feature_two_col"
        elif "stat" in name_lower:
            sec_type = "stats"
        elif "testimonial" in name_lower:
            sec_type = "testimonials"
        elif any(k in name_lower for k in ("faq", "accordion")):
            sec_type = "faq"
        elif "logo" in name_lower:
            sec_type = "logos"
        elif any(k in name_lower for k in ("cta", "contact", "form")):
            sec_type = "cta"

        return {
            "id": f"section-{idx}",
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
            font_family = "sans-serif"
            color_hex = "#1e293b"

            td = layer.engine_dict
            rd = layer.resource_dict
            if td and 'StyleRun' in td:
                run_data = td['StyleRun'].get('RunArray', [])
                if run_data:
                    sheet = run_data[0].get('StyleSheet', {}).get('StyleSheetData', {})
                    font_size = float(sheet.get('FontSize', 16.0))
                    font_idx = sheet.get('Font', 0)
                    if rd and 'FontSet' in rd:
                        fonts = rd.get('FontSet', [])
                        if font_idx < len(fonts):
                            fname = fonts[font_idx].get('Name', '')
                            if fname:
                                font_family = str(fname).strip("'\"").split('-')[0].replace("72ptSoft", "").replace("72pt", "").strip()

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
                "font_family": font_family or "Overpass",
                "color_hex": color_hex,
                "bbox": list(layer.bbox) if layer.bbox else [0, 0, 100, 30]
            }
        except Exception:
            return None

    def _slice_layer_image(self, layer, base_name: str) -> Optional[Dict[str, Any]]:
        try:
            # Skip tiny 1x1 or invisibles
            if not layer.bbox or layer.width < 10 or layer.height < 10:
                return None

            # Render composite of layer
            comp = layer.composite()
            if not comp:
                return None

            clean_name = sanitize_slug(base_name)
            filename = f"{clean_name}.webp"
            target_path = self.images_dir / filename

            # Ensure unique name
            c = 1
            while target_path.exists():
                filename = f"{clean_name}-{c}.webp"
                target_path = self.images_dir / filename
                c += 1

            # Convert and save as WebP
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
            return asset_info
        except Exception as e:
            return None

    def _generate_modern_css_bundle(self, sections: List[Dict[str, Any]], doc_w: int, primary: str, secondary: str) -> Tuple[str, str]:
        """Generates semantic HTML5 and clean modular CSS matching user's reference."""
        html_lines = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            f'  <title>{self.psd_path.stem} | LeafLite PSD to HTML</title>',
            '  <link rel="preconnect" href="https://fonts.googleapis.com">',
            '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
            '  <link href="https://fonts.googleapis.com/css2?family=Overpass:wght@300;400;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&display=swap" rel="stylesheet">',
            '  <link rel="stylesheet" href="css/style.css" />',
            '</head>',
            '<body>'
        ]

        css_lines = [
            '/* ========================================================================= */',
            '/* 🍃 LeafLite Generated Modern CSS (Learned Reference Style)                 */',
            '/* ========================================================================= */',
            ':root {',
            f'  --primary: {primary};',
            f'  --secondary: {secondary};',
            '  --text-dark: #1e293b;',
            '  --text-muted: #64748b;',
            '  --bg-light: #f8fafc;',
            '  --font-body: "Overpass", system-ui, sans-serif;',
            '  --font-heading: "Fraunces", Georgia, serif;',
            '  --container-max: 1620px;',
            '}',
            '',
            '* { box-sizing: border-box; margin: 0; padding: 0; }',
            'body { font-family: var(--font-body); color: var(--text-dark); background: #ffffff; line-height: 1.6; }',
            'a { text-decoration: none; color: inherit; transition: all 0.3s ease; }',
            'img { max-width: 100%; height: auto; display: block; }',
            '.container { max-width: var(--container-max); margin: 0 auto; padding: 0 24px; width: 100%; }',
            '',
            '/* Typography */',
            'h1, h2, h3, h4 { font-family: var(--font-heading); color: var(--primary); font-weight: 600; line-height: 1.25; }',
            'h1 { font-size: clamp(36px, 5vw, 64px); letter-spacing: -0.5px; margin-bottom: 20px; }',
            'h2 { font-size: clamp(28px, 3.5vw, 44px); margin-bottom: 18px; }',
            'h3 { font-size: clamp(20px, 2.5vw, 26px); margin-bottom: 12px; }',
            'p { color: var(--text-muted); font-size: 16px; margin-bottom: 18px; }',
            '.eyebrow { text-transform: uppercase; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; color: var(--secondary); margin-bottom: 10px; display: inline-block; }',
            '',
            '/* Buttons */',
            '.btn { display: inline-flex; align-items: center; justify-content: center; padding: 14px 28px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 4px; transition: all 0.3s ease-in-out; cursor: pointer; border: none; }',
            '.btn-primary { background: var(--primary); color: #ffffff; }',
            '.btn-primary:hover { background: var(--secondary); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }',
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

        # Build HTML & Section CSS
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
                # Logo
                logo_img = next((img for img in imgs if "logo" in img["filename"].lower()), imgs[0] if imgs else None)
                if logo_img:
                    html_lines.append(f'      <a href="#" class="logo"><img src="{logo_img["path"]}" alt="Logo" /></a>')
                else:
                    html_lines.append(f'      <a href="#" class="logo-text">{self.psd_path.stem}</a>')

                # Nav
                html_lines.append('      <nav class="main-nav">')
                html_lines.append('        <ul>')
                links = nav_links or ["About", "Services", "Projects", "Service Areas", "Contact"]
                for l in links[:7]:
                    html_lines.append(f'          <li><a href="#{sanitize_slug(l)}">{l}</a></li>')
                html_lines.append('        </ul>')
                html_lines.append('      </nav>')

                # Header CTA
                cta_txt = btns[0] if btns else "Get an Estimate"
                html_lines.append(f'      <a href="#contact" class="btn btn-secondary">{cta_txt}</a>')
                html_lines.append('    </div>')
                html_lines.append('  </header>')

                # Header CSS
                css_lines.extend([
                    '/* Site Header */',
                    '.site-header { width: 100%; padding: 20px 0; background: #ffffff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }',
                    '.header-container { display: flex; align-items: center; justify-content: space-between; gap: 24px; }',
                    '.logo img { max-height: 48px; width: auto; }',
                    '.logo-text { font-family: var(--font-heading); font-size: 24px; font-weight: 700; color: var(--primary); }',
                    '.main-nav ul { display: flex; list-style: none; gap: 28px; }',
                    '.main-nav a { font-size: 14px; font-weight: 600; text-transform: uppercase; color: var(--text-dark); }',
                    '.main-nav a:hover { color: var(--secondary); }',
                    '@media (max-width: 992px) { .main-nav { display: none; } }',
                    ''
                ])

            elif stype == "banner":
                banner_img = max(imgs, key=lambda x: x["width"] * x["height"]) if imgs else None
                bg_style = f' style="background-image: linear-gradient(rgba(0,30,70,0.65), rgba(0,30,70,0.65)), url(\'{banner_img["path"]}\'); background-size: cover; background-position: center;"' if banner_img else ' class="banner-gradient"'

                html_lines.append(f'  <!-- Hero Banner: {sname} -->')
                html_lines.append(f'  <section class="hero-banner"{bg_style}>')
                html_lines.append('    <div class="container hero-container">')
                if eyebrow:
                    html_lines.append(f'      <span class="eyebrow hero-eyebrow">{eyebrow}</span>')
                html_lines.append(f'      <h1>{heading or "Custom Dock & Shoreline Construction"}</h1>')
                if paras:
                    html_lines.append(f'      <p class="hero-desc">{paras[0]}</p>')
                if btns:
                    html_lines.append('      <div class="hero-btns">')
                    for b_idx, b in enumerate(btns[:2]):
                        b_cls = "btn-secondary" if b_idx == 0 else "btn-outline"
                        html_lines.append(f'        <a href="#cta" class="btn {b_cls}">{b}</a>')
                    html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </section>')

                css_lines.extend([
                    '/* Hero Banner */',
                    '.hero-banner { min-height: 650px; display: flex; align-items: center; color: #ffffff; padding: 120px 0; }',
                    '.banner-gradient { background: linear-gradient(135deg, var(--primary), var(--secondary)); }',
                    '.hero-container { max-width: 900px; text-align: left; }',
                    '.hero-banner h1 { color: #ffffff; font-weight: 700; text-shadow: 0 2px 10px rgba(0,0,0,0.3); }',
                    '.hero-eyebrow { color: #38bdf8; }',
                    '.hero-desc { color: #e2e8f0; font-size: 18px; margin-bottom: 32px; max-width: 720px; }',
                    '.hero-btns { display: flex; gap: 16px; flex-wrap: wrap; }',
                    ''
                ])

            elif stype == "feature_two_col":
                feat_img = max(imgs, key=lambda x: x["width"] * x["height"]) if imgs else None
                html_lines.append(f'  <!-- Feature Section: {sname} -->')
                html_lines.append(f'  <section class="feature-two-col" id="{sid}">')
                html_lines.append('    <div class="container feature-grid">')
                if feat_img:
                    html_lines.append('      <div class="feature-media">')
                    html_lines.append(f'        <img src="{feat_img["path"]}" alt="{heading or "Feature"}" class="feature-img" />')
                    html_lines.append('      </div>')
                html_lines.append('      <div class="feature-content">')
                if eyebrow:
                    html_lines.append(f'        <span class="eyebrow">{eyebrow}</span>')
                if heading:
                    html_lines.append(f'        <h2>{heading}</h2>')
                for p in paras[:3]:
                    html_lines.append(f'        <p>{p}</p>')
                if btns:
                    html_lines.append(f'        <a href="#more" class="btn btn-primary">{btns[0]}</a>')
                html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </section>')

                css_lines.extend([
                    '/* Two Column Feature */',
                    '.feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }',
                    '.feature-img { width: 100%; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }',
                    '@media (max-width: 992px) { .feature-grid { grid-template-columns: 1fr; gap: 36px; } }',
                    ''
                ])

            elif stype == "cards_grid":
                html_lines.append(f'  <!-- Cards Grid: {sname} -->')
                html_lines.append(f'  <section class="cards-section section-alt" id="{sid}">')
                html_lines.append('    <div class="container">')
                html_lines.append('      <div class="section-title-wrap">')
                if eyebrow:
                    html_lines.append(f'        <span class="eyebrow">{eyebrow}</span>')
                if heading:
                    html_lines.append(f'        <h2>{heading}</h2>')
                html_lines.append('      </div>')
                html_lines.append('      <div class="cards-grid">')
                card_items = imgs if imgs else [None, None, None]
                for c_idx, card_img in enumerate(card_items[:6]):
                    html_lines.append('        <div class="card-item">')
                    if card_img:
                        html_lines.append(f'          <div class="card-img-wrap"><img src="{card_img["path"]}" alt="Service" /></div>')
                    html_lines.append('          <div class="card-body">')
                    html_lines.append(f'            <h3>Service & Feature {c_idx+1}</h3>')
                    c_desc = paras[c_idx] if c_idx < len(paras) else "High-fidelity professional solutions engineered for longevity and performance."
                    html_lines.append(f'            <p>{c_desc}</p>')
                    html_lines.append('            <a href="#" class="card-link">Learn More &rarr;</a>')
                    html_lines.append('          </div>')
                    html_lines.append('        </div>')
                html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </section>')

                css_lines.extend([
                    '/* Cards Grid */',
                    '.section-title-wrap { text-align: center; max-width: 800px; margin: 0 auto 50px auto; }',
                    '.cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 32px; }',
                    '.card-item { background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); transition: all 0.3s ease; }',
                    '.card-item:hover { transform: translateY(-6px); box-shadow: 0 12px 28px rgba(0,0,0,0.12); }',
                    '.card-img-wrap img { width: 100%; height: 220px; object-fit: cover; }',
                    '.card-body { padding: 28px; }',
                    '.card-link { font-weight: 700; color: var(--secondary); display: inline-flex; align-items: center; gap: 6px; }',
                    '.card-link:hover { color: var(--primary); }',
                    ''
                ])

            elif stype == "stats":
                html_lines.append(f'  <!-- Stats Section: {sname} -->')
                html_lines.append(f'  <section class="stats-section" style="background: var(--primary); color: #fff;">')
                html_lines.append('    <div class="container stats-grid">')
                stat_vals = ["1982", "500+", "100%", "40+"]
                stat_labels = ["Founded & Serving", "Projects Completed", "Licensed & Insured", "Years Experience"]
                for sv, sl in zip(stat_vals, stat_labels):
                    html_lines.append('      <div class="stat-box">')
                    html_lines.append(f'        <div class="stat-number">{sv}</div>')
                    html_lines.append(f'        <div class="stat-label">{sl}</div>')
                    html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </section>')

                css_lines.extend([
                    '/* Stats */',
                    '.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; text-align: center; }',
                    '.stat-number { font-family: var(--font-heading); font-size: 48px; font-weight: 700; color: var(--secondary); margin-bottom: 8px; }',
                    '.stat-label { font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #e2e8f0; }',
                    '@media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 36px; } }',
                    ''
                ])

            elif stype == "footer":
                html_lines.append(f'  <!-- Footer: {sname} -->')
                html_lines.append('  <footer class="site-footer">')
                html_lines.append('    <div class="container footer-grid">')
                html_lines.append('      <div class="footer-col">')
                html_lines.append(f'        <h4 class="footer-title">{self.psd_path.stem}</h4>')
                html_lines.append('        <p>Serving lakefront property owners with dedicated craftsmanship, environmental expertise, and enduring construction.</p>')
                html_lines.append('      </div>')
                html_lines.append('      <div class="footer-col">')
                html_lines.append('        <h4 class="footer-title">Quick Links</h4>')
                html_lines.append('        <ul class="footer-links">')
                for ql in ["Home", "About Us", "Our Services", "Recent Projects", "Contact"]:
                    html_lines.append(f'          <li><a href="#{sanitize_slug(ql)}">{ql}</a></li>')
                html_lines.append('        </ul>')
                html_lines.append('      </div>')
                html_lines.append('      <div class="footer-col">')
                html_lines.append('        <h4 class="footer-title">Get in Touch</h4>')
                html_lines.append('        <p>Phone: 828-495-3040<br/>Email: info@marineconstruction.com<br/>Office: Lake Hickory, NC</p>')
                html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('    <div class="footer-bottom">')
                html_lines.append('      <div class="container">')
                html_lines.append(f'        <p>&copy; 2026 {self.psd_path.stem}. All rights reserved. Generated with LeafLite Studio.</p>')
                html_lines.append('      </div>')
                html_lines.append('    </div>')
                html_lines.append('  </footer>')

                css_lines.extend([
                    '/* Footer */',
                    '.site-footer { background: #0f172a; color: #94a3b8; padding-top: 70px; }',
                    '.footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 48px; padding-bottom: 60px; }',
                    '.footer-title { color: #ffffff; font-size: 18px; margin-bottom: 20px; }',
                    '.footer-links { list-style: none; space-y: 10px; }',
                    '.footer-links li { margin-bottom: 10px; }',
                    '.footer-links a:hover { color: var(--secondary); }',
                    '.footer-bottom { border-top: 1px solid #1e293b; padding: 24px 0; text-align: center; font-size: 13px; }',
                    '@media (max-width: 768px) { .footer-grid { grid-template-columns: 1fr; gap: 36px; } }',
                    ''
                ])

            else:
                # Generic content section
                html_lines.append(f'  <!-- Section: {sname} -->')
                html_lines.append(f'  <section class="generic-section" id="{sid}">')
                html_lines.append('    <div class="container">')
                if eyebrow:
                    html_lines.append(f'      <span class="eyebrow">{eyebrow}</span>')
                if heading:
                    html_lines.append(f'      <h2>{heading}</h2>')
                for p in paras[:2]:
                    html_lines.append(f'      <p>{p}</p>')
                if imgs:
                    html_lines.append('      <div class="section-images">')
                    for im in imgs[:4]:
                        html_lines.append(f'        <img src="{im["path"]}" alt="{im["name"]}" class="generic-img" />')
                    html_lines.append('      </div>')
                if btns:
                    html_lines.append(f'      <a href="#" class="btn btn-primary">{btns[0]}</a>')
                html_lines.append('    </div>')
                html_lines.append('  </section>')

        html_lines.extend([
            '</body>',
            '</html>'
        ])

        return "\n".join(html_lines), "\n".join(css_lines)

    def _generate_tailwind_bundle(self, sections: List[Dict[str, Any]], doc_w: int, primary: str, secondary: str) -> str:
        """Generates self-contained modern Tailwind CSS markup."""
        tw_lines = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8" />',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            f'  <title>{self.psd_path.stem} | LeafLite PSD to Tailwind</title>',
            '  <!-- Tailwind CSS CDN -->',
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
            '  <link rel="preconnect" href="https://fonts.googleapis.com">',
            '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
            '  <link href="https://fonts.googleapis.com/css2?family=Overpass:wght@300;400;600;700&family=Fraunces:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">',
            '  <style>',
            '    body { font-family: "Overpass", system-ui, sans-serif; }',
            '    h1, h2, h3, h4 { font-family: "Fraunces", Georgia, serif; }',
            '  </style>',
            '</head>',
            '<body class="bg-white text-slate-800 antialiased selection:bg-cyan-500 selection:text-white">'
        ]

        for s in sections:
            stype = s["type"]
            sname = s["name"]
            heading = s["heading"]
            eyebrow = s["eyebrow"]
            paras = s["paragraphs"]
            btns = s["buttons"]
            imgs = s["images"]
            nav_links = s.get("nav_links", [])

            if stype == "header":
                tw_lines.append(f'  <!-- Header: {sname} -->')
                tw_lines.append('  <header class="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">')
                tw_lines.append('    <div class="max-w-[1620px] mx-auto px-6 h-20 flex items-center justify-between gap-6">')
                logo_img = next((img for img in imgs if "logo" in img["filename"].lower()), imgs[0] if imgs else None)
                if logo_img:
                    tw_lines.append(f'      <a href="#" class="shrink-0"><img src="{logo_img["path"]}" alt="Logo" class="h-12 w-auto" /></a>')
                else:
                    tw_lines.append(f'      <a href="#" class="text-2xl font-bold text-brandPrimary shrink-0">{self.psd_path.stem}</a>')

                tw_lines.append('      <nav class="hidden lg:flex items-center gap-8">')
                links = nav_links or ["About", "Services", "Projects", "Service Areas", "Contact"]
                for l in links[:7]:
                    tw_lines.append(f'        <a href="#{sanitize_slug(l)}" class="text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-brandSecondary transition-colors">{l}</a>')
                tw_lines.append('      </nav>')

                cta_txt = btns[0] if btns else "Get an Estimate"
                tw_lines.append(f'      <a href="#contact" class="px-6 py-2.5 bg-brandSecondary hover:bg-brandPrimary text-white text-xs font-bold uppercase tracking-wider rounded transition-all shadow-sm hover:shadow-md">{cta_txt}</a>')
                tw_lines.append('    </div>')
                tw_lines.append('  </header>')

            elif stype == "banner":
                banner_img = max(imgs, key=lambda x: x["width"] * x["height"]) if imgs else None
                bg_attr = f'style="background-image: linear-gradient(rgba(0,34,75,0.7), rgba(0,34,75,0.7)), url(\'{banner_img["path"]}\'); background-size: cover; background-position: center;"' if banner_img else 'class="bg-gradient-to-tr from-brandPrimary to-brandSecondary"'
                tw_lines.append(f'  <!-- Hero Banner: {sname} -->')
                tw_lines.append(f'  <section class="min-h-[640px] flex items-center py-24 text-white" {bg_attr}>')
                tw_lines.append('    <div class="max-w-[1620px] mx-auto px-6 w-full">')
                tw_lines.append('      <div class="max-w-3xl">')
                if eyebrow:
                    tw_lines.append(f'        <span class="inline-block text-cyan-300 text-xs font-bold uppercase tracking-widest mb-3">{eyebrow}</span>')
                tw_lines.append(f'        <h1 class="text-4xl sm:text-6xl font-bold leading-tight mb-6 drop-shadow-md">{heading or "Custom Dock & Shoreline Construction"}</h1>')
                if paras:
                    tw_lines.append(f'        <p class="text-slate-200 text-lg leading-relaxed mb-8 max-w-2xl">{paras[0]}</p>')
                if btns:
                    tw_lines.append('        <div class="flex flex-wrap gap-4">')
                    for b_idx, b in enumerate(btns[:2]):
                        b_cls = "bg-brandSecondary hover:bg-brandPrimary text-white shadow-lg" if b_idx == 0 else "border-2 border-white hover:bg-white hover:text-brandPrimary text-white"
                        tw_lines.append(f'          <a href="#cta" class="px-7 py-3 rounded text-xs font-bold uppercase tracking-wider transition-all {b_cls}">{b}</a>')
                    tw_lines.append('        </div>')
                tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('  </section>')

            elif stype == "feature_two_col":
                feat_img = max(imgs, key=lambda x: x["width"] * x["height"]) if imgs else None
                tw_lines.append(f'  <!-- Feature 2-Column: {sname} -->')
                tw_lines.append('  <section class="py-20 lg:py-28 bg-white">')
                tw_lines.append('    <div class="max-w-[1620px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">')
                if feat_img:
                    tw_lines.append(f'      <div><img src="{feat_img["path"]}" alt="{heading or "Feature"}" class="rounded-xl shadow-xl w-full object-cover max-h-[550px]" /></div>')
                tw_lines.append('      <div class="space-y-6">')
                if eyebrow:
                    tw_lines.append(f'        <span class="text-brandSecondary text-xs font-bold uppercase tracking-widest block">{eyebrow}</span>')
                if heading:
                    tw_lines.append(f'        <h2 class="text-3xl sm:text-4xl font-bold text-brandPrimary">{heading}</h2>')
                for p in paras[:3]:
                    tw_lines.append(f'        <p class="text-slate-600 leading-relaxed">{p}</p>')
                if btns:
                    tw_lines.append(f'        <a href="#more" class="inline-block px-7 py-3 bg-brandPrimary hover:bg-brandSecondary text-white text-xs font-bold uppercase tracking-wider rounded transition-all">{btns[0]}</a>')
                tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('  </section>')

            elif stype == "cards_grid":
                tw_lines.append(f'  <!-- Cards Grid: {sname} -->')
                tw_lines.append('  <section class="py-24 bg-slate-50">')
                tw_lines.append('    <div class="max-w-[1620px] mx-auto px-6">')
                tw_lines.append('      <div class="text-center max-w-2xl mx-auto mb-16">')
                if eyebrow:
                    tw_lines.append(f'        <span class="text-brandSecondary text-xs font-bold uppercase tracking-widest block mb-2">{eyebrow}</span>')
                if heading:
                    tw_lines.append(f'        <h2 class="text-3xl sm:text-4xl font-bold text-brandPrimary">{heading}</h2>')
                tw_lines.append('      </div>')
                tw_lines.append('      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">')
                card_items = imgs if imgs else [None, None, None]
                for c_idx, c_img in enumerate(card_items[:6]):
                    tw_lines.append('        <div class="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 border border-slate-100 flex flex-col">')
                    if c_img:
                        tw_lines.append(f'          <img src="{c_img["path"]}" alt="Service" class="w-full h-56 object-cover" />')
                    tw_lines.append('          <div class="p-6 flex-1 flex flex-col justify-between">')
                    tw_lines.append('            <div>')
                    tw_lines.append(f'              <h3 class="text-xl font-bold text-brandPrimary mb-2">Service Solution {c_idx+1}</h3>')
                    c_desc = paras[c_idx] if c_idx < len(paras) else "Engineered waterfront solutions delivered with industry-leading precision."
                    tw_lines.append(f'              <p class="text-slate-600 text-sm leading-relaxed mb-4">{c_desc}</p>')
                    tw_lines.append('            </div>')
                    tw_lines.append('            <a href="#" class="text-xs font-bold text-brandSecondary hover:text-brandPrimary inline-flex items-center gap-1 uppercase tracking-wider">Learn More &rarr;</a>')
                    tw_lines.append('          </div>')
                    tw_lines.append('        </div>')
                tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('  </section>')

            elif stype == "stats":
                tw_lines.append(f'  <!-- Stats: {sname} -->')
                tw_lines.append('  <section class="py-16 bg-brandPrimary text-white">')
                tw_lines.append('    <div class="max-w-[1620px] mx-auto px-6 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">')
                stat_vals = ["1982", "500+", "100%", "40+"]
                stat_labels = ["Founded & Serving", "Projects Completed", "Licensed & Insured", "Years Experience"]
                for sv, sl in zip(stat_vals, stat_labels):
                    tw_lines.append('      <div>')
                    tw_lines.append(f'        <div class="text-4xl sm:text-5xl font-bold text-cyan-400 mb-2">{sv}</div>')
                    tw_lines.append(f'        <div class="text-xs font-bold uppercase tracking-wider text-slate-300">{sl}</div>')
                    tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('  </section>')

            elif stype == "footer":
                tw_lines.append(f'  <!-- Footer: {sname} -->')
                tw_lines.append('  <footer class="bg-slate-900 text-slate-400 pt-20 pb-12">')
                tw_lines.append('    <div class="max-w-[1620px] mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 pb-16 border-b border-slate-800">')
                tw_lines.append('      <div>')
                tw_lines.append(f'        <h4 class="text-white text-lg font-bold mb-4">{self.psd_path.stem}</h4>')
                tw_lines.append('        <p class="text-sm leading-relaxed text-slate-400">Serving lakefront property owners with dedicated craftsmanship, environmental expertise, and enduring construction.</p>')
                tw_lines.append('      </div>')
                tw_lines.append('      <div>')
                tw_lines.append('        <h4 class="text-white text-lg font-bold mb-4">Quick Links</h4>')
                tw_lines.append('        <ul class="space-y-2 text-sm">')
                for ql in ["Home", "About Us", "Our Services", "Recent Projects", "Contact"]:
                    tw_lines.append(f'          <li><a href="#{sanitize_slug(ql)}" class="hover:text-white transition-colors">{ql}</a></li>')
                tw_lines.append('        </ul>')
                tw_lines.append('      </div>')
                tw_lines.append('      <div>')
                tw_lines.append('        <h4 class="text-white text-lg font-bold mb-4">Contact</h4>')
                tw_lines.append('        <p class="text-sm text-slate-400">Phone: 828-495-3040<br/>Email: info@marineconstruction.com<br/>Lake Hickory, NC</p>')
                tw_lines.append('      </div>')
                tw_lines.append('    </div>')
                tw_lines.append('    <div class="max-w-[1620px] mx-auto px-6 text-center text-xs text-slate-500 pt-8">')
                tw_lines.append(f'      &copy; 2026 {self.psd_path.stem}. All rights reserved. Generated with LeafLite Studio.')
                tw_lines.append('    </div>')
                tw_lines.append('  </footer>')

        tw_lines.extend([
            '</body>',
            '</html>'
        ])

        return "\n".join(tw_lines)
