import { readPsd, getCompositeCanvas } from 'ag-psd';
import JSZip from 'jszip';

export interface ExtractedAsset {
  name: string;
  filename: string;
  path: string;
  url: string;
  width: number;
  height: number;
  size_bytes: number;
  blob?: Blob;
}

export interface SectionSummary {
  name: string;
  type: string;
  heading: string;
  images_count: number;
  buttons_count: number;
}

export interface ClientConversionResult {
  job_id: string;
  psd_name: string;
  dimensions: { width: number; height: number };
  detected_sections_count: number;
  extracted_images_count: number;
  primary_color: string;
  secondary_color: string;
  color_palette: string[];
  fonts: string[];
  sections: SectionSummary[];
  html_code: string;
  css_code: string;
  tailwind_code: string;
  assets: ExtractedAsset[];
  zip_download_url: string;
  zip_filename: string;
}

function sanitizeSlug(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
  return s.replace(/[\s_]+/g, '-').toLowerCase() || 'item';
}

function rgbToHex(r: number, g: number, b: number): string {
  const ir = Math.max(0, Math.min(255, Math.round(r <= 1 ? r * 255 : r)));
  const ig = Math.max(0, Math.min(255, Math.round(g <= 1 ? g * 255 : g)));
  const ib = Math.max(0, Math.min(255, Math.round(b <= 1 ? b * 255 : b)));
  return `#${((1 << 24) + (ir << 16) + (ig << 8) + ib).toString(16).slice(1)}`;
}

function guessSectionType(name: string): string {
  const n = name.toLowerCase();
  if (/header|nav|menu|top|navbar/.test(n)) return 'header';
  if (/hero|banner|intro|welcome|slider/.test(n)) return 'hero';
  if (/feature|benefit|why|solution|service/.test(n)) return 'feature';
  if (/card|tile|grid|project|item|portfolio/.test(n)) return 'cards';
  if (/stat|counter|number/.test(n)) return 'stats';
  if (/testimonial|review|quote|client/.test(n)) return 'testimonials';
  if (/faq|question|answer/.test(n)) return 'faq';
  if (/team|about|member|author|people/.test(n)) return 'team';
  if (/partner|brand|client|logo|sponsor/.test(n)) return 'logos';
  if (/cta|contact|call|touch|newsletter/.test(n)) return 'cta';
  if (/footer|bottom|copyright/.test(n)) return 'footer';
  return 'section';
}

interface ParsedSection {
  name: string;
  type: string;
  heading: string;
  eyebrow: string;
  subheading: string;
  paragraphs: string[];
  buttons: string[];
  images: ExtractedAsset[];
  cards: { title: string; desc: string; img?: ExtractedAsset }[];
}

export async function convertPsdClientSide(file: File): Promise<ClientConversionResult> {
  const buffer = await file.arrayBuffer();
  const psd = readPsd(buffer, {
    skipLayerImageData: false,
    skipCompositeImageData: false
  });

  const docWidth = psd.width || 1920;
  const docHeight = psd.height || 1080;

  const colorFreq: Record<string, number> = {};
  const fontSet = new Set<string>();
  const allAssets: ExtractedAsset[] = [];
  const sections: ParsedSection[] = [];

  let assetCounter = 0;

  // Extract layer image as web asset
  const extractLayerAsset = async (layer: any, prefix: string): Promise<ExtractedAsset | null> => {
    if (!layer.canvas) return null;
    assetCounter++;
    const canvas: HTMLCanvasElement = layer.canvas;
    const w = canvas.width || 100;
    const h = canvas.height || 100;
    const filename = `${sanitizeSlug(prefix)}-${assetCounter}.webp`;

    const blob: Blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b || new Blob([])), 'image/webp', 0.85);
    });

    const dataUrl = canvas.toDataURL('image/webp', 0.85);

    const asset: ExtractedAsset = {
      name: layer.name || `Asset ${assetCounter}`,
      filename,
      path: `images/${filename}`,
      url: dataUrl,
      width: w,
      height: h,
      size_bytes: blob.size,
      blob
    };

    allAssets.push(asset);
    return asset;
  };

  // Process a node (group or layer)
  const processGroupOrLayer = async (item: any, idx: number): Promise<ParsedSection | null> => {
    if (item.hidden) return null;

    const secType = guessSectionType(item.name || `Section ${idx + 1}`);
    const sec: ParsedSection = {
      name: item.name || `Section ${idx + 1}`,
      type: secType,
      heading: '',
      eyebrow: '',
      subheading: '',
      paragraphs: [],
      buttons: [],
      images: [],
      cards: []
    };

    // Recursively collect text & image layers within this section
    const traverse = async (node: any) => {
      if (node.hidden) return;

      if (node.text) {
        const textContent = (node.text.text || '').trim();
        if (!textContent) return;

        const style = node.text.style || {};
        const fontName = style.font?.name || style.font?.postScriptName || 'Inter';
        fontSet.add(fontName.split('-')[0].replace(/Regular|Bold|Light|Medium/gi, '').trim() || 'Inter');

        const fontSize = style.fontSize || 16;
        if (style.fillColor) {
          const hex = rgbToHex(style.fillColor.r, style.fillColor.g, style.fillColor.b);
          colorFreq[hex] = (colorFreq[hex] || 0) + 1;
        }

        // Categorize text
        const isShort = textContent.length < 35 && !textContent.includes('\n');
        const isActionWord = /^(get|learn|contact|explore|view|read|request|call|start|see|submit|order|book|estimate)/i.test(textContent);

        if (isShort && (isActionWord || /button|btn/i.test(node.name || ''))) {
          sec.buttons.push(textContent);
        } else if (isShort && (/eyebrow|tag|badge|sub-title/i.test(node.name || '') || (fontSize <= 14 && textContent === textContent.toUpperCase()))) {
          if (!sec.eyebrow) sec.eyebrow = textContent;
        } else if (fontSize >= 22 || (!sec.heading && isShort)) {
          if (!sec.heading) {
            sec.heading = textContent;
          } else if (!sec.subheading && isShort) {
            sec.subheading = textContent;
          } else {
            sec.paragraphs.push(textContent);
          }
        } else {
          sec.paragraphs.push(textContent);
        }
      } else if (node.canvas) {
        const asset = await extractLayerAsset(node, `${secType}-${item.name}`);
        if (asset && sec.images.length < 6) {
          sec.images.push(asset);
        }
      }

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          await traverse(child);
        }
      }
    };

    if (item.children && item.children.length > 0) {
      for (const child of item.children) {
        await traverse(child);
      }
    } else {
      await traverse(item);
    }

    // Default heading if none found
    if (!sec.heading && sec.paragraphs.length > 0) {
      sec.heading = sec.paragraphs[0].slice(0, 50);
      sec.paragraphs = sec.paragraphs.slice(1);
    }

    return sec;
  };

  // Iterate top-level layers
  const topItems = psd.children || [];
  for (let i = 0; i < topItems.length; i++) {
    const s = await processGroupOrLayer(topItems[i], i);
    if (s && (s.heading || s.paragraphs.length > 0 || s.images.length > 0 || s.buttons.length > 0)) {
      sections.push(s);
    }
  }

  // If no sections found, create a fallback section from composite canvas
  if (sections.length === 0) {
    let compAsset: ExtractedAsset | null = null;
    try {
      const compCanvas = psd.canvas || getCompositeCanvas(psd);
      if (compCanvas) {
        const blob: Blob = await new Promise((res) => compCanvas.toBlob((b) => res(b || new Blob([])), 'image/webp', 0.85));
        compAsset = {
          name: 'Hero Composite',
          filename: 'hero-composite.webp',
          path: 'images/hero-composite.webp',
          url: compCanvas.toDataURL('image/webp', 0.85),
          width: compCanvas.width,
          height: compCanvas.height,
          size_bytes: blob.size,
          blob
        };
        allAssets.push(compAsset);
      }
    } catch {}

    sections.push({
      name: 'Hero Section',
      type: 'hero',
      heading: file.name.replace(/\.psd$/i, ''),
      eyebrow: 'LeafLite PSD to HTML',
      subheading: 'High-performance responsive conversion',
      paragraphs: ['Exported cleanly with automated semantic layout and modern CSS styling.'],
      buttons: ['Get Started', 'Learn More'],
      images: compAsset ? [compAsset] : [],
      cards: []
    });
  }

  // Determine dominant brand colors
  const sortedColors = Object.entries(colorFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
    .filter((c) => !['#ffffff', '#000000', '#111827', '#0f172a', '#f8fafc'].includes(c.toLowerCase()));

  const primaryColor = sortedColors[0] || '#003478';
  const secondaryColor = sortedColors[1] || '#0088ce';
  const colorPalette = [primaryColor, secondaryColor, '#334155', '#f8fafc'];
  const fontList = Array.from(fontSet).slice(0, 3);
  if (fontList.length === 0) fontList.push('Inter', 'sans-serif');

  // Generate Modern HTML & CSS
  const { htmlCode, cssCode } = generateModernCssBundle(file.name, sections, primaryColor, secondaryColor, fontList);
  const tailwindCode = generateTailwindBundle(file.name, sections, primaryColor, secondaryColor, fontList);

  // Build ZIP using JSZip
  const zip = new JSZip();
  zip.file('index.html', htmlCode);
  zip.file('tailwind.html', tailwindCode);
  zip.file('css/style.css', cssCode);

  const imagesFolder = zip.folder('images');
  for (const asset of allAssets) {
    if (asset.blob) {
      imagesFolder?.file(asset.filename, asset.blob);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipBlobUrl = URL.createObjectURL(zipBlob);
  const zipFilename = `${sanitizeSlug(file.name.replace(/\.psd$/i, ''))}_html_bundle.zip`;

  const sectionSummaries: SectionSummary[] = sections.map((s) => ({
    name: s.name,
    type: s.type,
    heading: s.heading || s.name,
    images_count: s.images.length,
    buttons_count: s.buttons.length
  }));

  return {
    job_id: `client-${Date.now()}`,
    psd_name: file.name,
    dimensions: { width: docWidth, height: docHeight },
    detected_sections_count: sections.length,
    extracted_images_count: allAssets.length,
    primary_color: primaryColor,
    secondary_color: secondaryColor,
    color_palette: colorPalette,
    fonts: fontList,
    sections: sectionSummaries,
    html_code: htmlCode,
    css_code: cssCode,
    tailwind_code: tailwindCode,
    assets: allAssets,
    zip_download_url: zipBlobUrl,
    zip_filename: zipFilename
  };
}

function generateModernCssBundle(
  psdName: string,
  sections: ParsedSection[],
  primary: string,
  secondary: string,
  fonts: string[]
): { htmlCode: string; cssCode: string } {
  const fontHeading = fonts[0] || 'Inter';
  const fontBody = fonts[1] || fonts[0] || 'Inter';

  let sectionsHtml = '';

  sections.forEach((sec, idx) => {
    const secId = `section-${idx + 1}`;

    if (sec.type === 'header') {
      const logoImg = sec.images[0] ? `<img src="images/${sec.images[0].filename}" alt="Logo" class="logo-img" />` : `<span class="logo-text">${sec.heading || 'Brand'}</span>`;
      const btn = sec.buttons[0] ? `<a href="#contact" class="btn btn-primary">${sec.buttons[0]}</a>` : '';
      sectionsHtml += `
  <!-- Header: ${sec.name} -->
  <header class="site-header">
    <div class="container header-container">
      <a href="#" class="logo">${logoImg}</a>
      <nav class="main-nav">
        <ul>
          <li><a href="#about">About</a></li>
          <li><a href="#services">Services</a></li>
          <li><a href="#projects">Projects</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </nav>
      ${btn}
    </div>
  </header>`;
    } else if (sec.type === 'hero') {
      const bgImg = sec.images[0] ? `style="background: linear-gradient(rgba(15,23,42,0.7), rgba(15,23,42,0.7)), url('images/${sec.images[0].filename}') center/cover;"` : '';
      const btnsHtml = sec.buttons.map((b, i) => `<a href="#action" class="btn ${i === 0 ? 'btn-primary' : 'btn-outline'}">${b}</a>`).join('\n          ');

      sectionsHtml += `
  <!-- Hero Section -->
  <section class="hero-section" id="${secId}" ${bgImg}>
    <div class="container hero-container">
      ${sec.eyebrow ? `<span class="eyebrow">${sec.eyebrow}</span>` : ''}
      <h1>${sec.heading || 'Modern Responsive Experience'}</h1>
      ${sec.subheading ? `<p class="hero-lead">${sec.subheading}</p>` : ''}
      ${sec.paragraphs.map((p) => `<p>${p}</p>`).join('\n      ')}
      ${sec.buttons.length > 0 ? `<div class="hero-btns">${btnsHtml}</div>` : ''}
    </div>
  </section>`;
    } else if (sec.type === 'footer') {
      sectionsHtml += `
  <!-- Footer Section -->
  <footer class="site-footer" id="${secId}">
    <div class="container footer-grid">
      <div class="footer-col">
        <h3>${sec.heading || psdName}</h3>
        ${sec.paragraphs.map((p) => `<p>${p}</p>`).join('\n        ')}
      </div>
      <div class="footer-col">
        <h4>Navigation</h4>
        <ul class="footer-links">
          <li><a href="#">Home</a></li>
          <li><a href="#services">Services</a></li>
          <li><a href="#projects">Portfolio</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Contact</h4>
        <p>Email: info@example.com<br/>Phone: (800) 555-0199</p>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="container">
        <p>&copy; ${new Date().getFullYear()} ${psdName.replace(/\.psd$/i, '')}. All rights reserved. Generated with LeafLite Studio.</p>
      </div>
    </div>
  </footer>`;
    } else {
      // General feature / cards / content section
      const hasMedia = sec.images.length > 0;
      const imgHtml = hasMedia ? `<div class="feature-media"><img src="images/${sec.images[0].filename}" alt="${sec.heading}" class="feature-img" /></div>` : '';

      sectionsHtml += `
  <!-- Section: ${sec.name} -->
  <section class="${hasMedia ? 'feature-section' : 'content-section'} ${idx % 2 === 1 ? 'section-alt' : ''}" id="${secId}">
    <div class="container ${hasMedia ? 'feature-grid' : ''}">
      ${hasMedia ? imgHtml : ''}
      <div class="feature-content">
        ${sec.eyebrow ? `<span class="eyebrow">${sec.eyebrow}</span>` : ''}
        <h2>${sec.heading || sec.name}</h2>
        ${sec.subheading ? `<p class="subheading">${sec.subheading}</p>` : ''}
        ${sec.paragraphs.map((p) => `<p>${p}</p>`).join('\n        ')}
        ${sec.buttons.map((b) => `<a href="#action" class="btn btn-primary">${b}</a>`).join('\n        ')}
      </div>
    </div>
  </section>`;
    }
  });

  const htmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${psdName.replace(/\.psd$/i, '')} | LeafLite PSD to HTML</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
${sectionsHtml}
</body>
</html>`;

  const cssCode = `/* ========================================================================= */
/* 🍃 LeafLite Clean Modern CSS (Learned Reference Architecture)             */
/* ========================================================================= */
:root {
  --primary: ${primary};
  --secondary: ${secondary};
  --text-main: #0f172a;
  --text-muted: #64748b;
  --bg-light: #f8fafc;
  --font-family: "${fontBody}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --container-max: 1440px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-family);
  color: var(--text-main);
  background: #ffffff;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

a { text-decoration: none; color: inherit; transition: all 0.25s ease; }
img { max-width: 100%; height: auto; display: block; }
.container { max-width: var(--container-max); margin: 0 auto; padding: 0 24px; width: 100%; }

/* Typography */
h1, h2, h3, h4 { color: var(--primary); font-weight: 700; line-height: 1.25; margin-bottom: 1rem; }
h1 { font-size: clamp(32px, 5vw, 56px); letter-spacing: -0.02em; }
h2 { font-size: clamp(24px, 3.5vw, 40px); }
h3 { font-size: clamp(20px, 2.5vw, 28px); }
p { color: var(--text-muted); font-size: 16px; margin-bottom: 1.2rem; }
.eyebrow {
  display: inline-block;
  text-transform: uppercase;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--secondary);
  margin-bottom: 0.75rem;
}
.hero-lead { font-size: 1.25rem; color: #e2e8f0; margin-bottom: 2rem; }

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 26px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.25s ease;
  cursor: pointer;
  border: none;
}
.btn-primary { background: var(--primary); color: #ffffff; }
.btn-primary:hover { background: var(--secondary); transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.15); }
.btn-outline { background: transparent; color: #ffffff; border: 2px solid #ffffff; }
.btn-outline:hover { background: #ffffff; color: var(--primary); }

/* Header */
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e2e8f0;
  padding: 16px 0;
}
.header-container { display: flex; align-items: center; justify-content: space-between; }
.logo-img { max-height: 44px; width: auto; }
.logo-text { font-size: 22px; font-weight: 800; color: var(--primary); }
.main-nav ul { display: flex; list-style: none; gap: 24px; }
.main-nav a { font-size: 14px; font-weight: 600; color: var(--text-main); }
.main-nav a:hover { color: var(--secondary); }
@media (max-width: 768px) { .main-nav { display: none; } }

/* Hero */
.hero-section {
  padding: 100px 0;
  background: var(--primary);
  color: #ffffff;
  display: flex;
  align-items: center;
}
.hero-section h1 { color: #ffffff; }
.hero-btns { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 1rem; }

/* Sections */
section { padding: 80px 0; }
.section-alt { background: var(--bg-light); }
.feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.feature-img { border-radius: 12px; box-shadow: 0 12px 30px rgba(0,0,0,0.08); width: 100%; }
@media (max-width: 900px) { .feature-grid { grid-template-columns: 1fr; } }

/* Footer */
.site-footer { background: #0f172a; color: #94a3b8; padding-top: 60px; }
.footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 36px; padding-bottom: 40px; }
.footer-col h3, .footer-col h4 { color: #ffffff; margin-bottom: 16px; }
.footer-links { list-style: none; space-y: 8px; }
.footer-links a:hover { color: #ffffff; }
.footer-bottom { border-top: 1px solid #1e293b; padding: 20px 0; text-align: center; font-size: 13px; }
@media (max-width: 768px) { .footer-grid { grid-template-columns: 1fr; } }
`;

  return { htmlCode, cssCode };
}

function generateTailwindBundle(
  psdName: string,
  sections: ParsedSection[],
  primary: string,
  secondary: string,
  fonts: string[]
): string {
  let sectionsHtml = '';

  sections.forEach((sec, idx) => {
    if (sec.type === 'header') {
      const logoImg = sec.images[0] ? `<img src="images/${sec.images[0].filename}" alt="Logo" class="h-10 w-auto" />` : `<span class="text-xl font-black text-brandPrimary">${sec.heading || 'Brand'}</span>`;
      const btn = sec.buttons[0] ? `<a href="#contact" class="px-5 py-2.5 rounded-lg bg-brandPrimary hover:bg-brandSecondary text-white text-xs font-bold uppercase tracking-wider transition-all shadow-sm">${sec.buttons[0]}</a>` : '';

      sectionsHtml += `
  <!-- Header -->
  <header class="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <a href="#">${logoImg}</a>
      <nav class="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-700">
        <a href="#about" class="hover:text-brandPrimary transition-colors">About</a>
        <a href="#services" class="hover:text-brandPrimary transition-colors">Services</a>
        <a href="#projects" class="hover:text-brandPrimary transition-colors">Projects</a>
        <a href="#contact" class="hover:text-brandPrimary transition-colors">Contact</a>
      </nav>
      ${btn}
    </div>
  </header>`;
    } else if (sec.type === 'hero') {
      sectionsHtml += `
  <!-- Hero -->
  <section class="py-24 bg-brandPrimary text-white relative">
    <div class="max-w-7xl mx-auto px-6">
      <div class="max-w-3xl space-y-6">
        ${sec.eyebrow ? `<span class="text-xs font-bold uppercase tracking-widest text-cyan-300">${sec.eyebrow}</span>` : ''}
        <h1 class="text-4xl sm:text-6xl font-black tracking-tight">${sec.heading || 'Modern Responsive Experience'}</h1>
        ${sec.subheading ? `<p class="text-xl text-slate-200">${sec.subheading}</p>` : ''}
        ${sec.paragraphs.map((p) => `<p class="text-slate-300">${p}</p>`).join('\n        ')}
        <div class="flex gap-4 pt-4">
          ${sec.buttons.map((b, i) => `<a href="#" class="px-6 py-3 rounded-lg font-bold text-sm ${i === 0 ? 'bg-white text-brandPrimary hover:bg-slate-100' : 'border-2 border-white text-white hover:bg-white/10'} transition-all">${b}</a>`).join('\n          ')}
        </div>
      </div>
    </div>
  </section>`;
    } else {
      const hasMedia = sec.images.length > 0;
      sectionsHtml += `
  <!-- Section: ${sec.name} -->
  <section class="py-20 ${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}">
    <div class="max-w-7xl mx-auto px-6 ${hasMedia ? 'grid grid-cols-1 lg:grid-cols-2 gap-12 items-center' : ''}">
      ${hasMedia ? `<div><img src="images/${sec.images[0].filename}" alt="${sec.heading}" class="rounded-2xl shadow-xl w-full" /></div>` : ''}
      <div class="space-y-4">
        ${sec.eyebrow ? `<span class="text-xs font-bold uppercase tracking-wider text-brandSecondary">${sec.eyebrow}</span>` : ''}
        <h2 class="text-3xl sm:text-4xl font-bold text-brandPrimary">${sec.heading || sec.name}</h2>
        ${sec.paragraphs.map((p) => `<p class="text-slate-600 leading-relaxed">${p}</p>`).join('\n        ')}
        ${sec.buttons.map((b) => `<a href="#" class="inline-block px-6 py-2.5 bg-brandPrimary hover:bg-brandSecondary text-white text-xs font-bold rounded-lg transition-all">${b}</a>`).join('\n        ')}
      </div>
    </div>
  </section>`;
    }
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${psdName.replace(/\.psd$/i, '')} | LeafLite Tailwind Export</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brandPrimary: '${primary}',
            brandSecondary: '${secondary}',
          }
        }
      }
    }
  </script>
</head>
<body class="bg-white text-slate-800 antialiased">
${sectionsHtml}
</body>
</html>`;
}
