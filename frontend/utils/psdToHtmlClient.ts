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
  composite_url?: string;
  detected_sections_count: number;
  extracted_images_count: number;
  primary_color: string;
  secondary_color: string;
  color_palette: string[];
  fonts: string[];
  sections: SectionSummary[];
  html_code: string;
  html_code_min: string;
  css_code: string;
  css_code_min: string;
  tailwind_code: string;
  tailwind_code_min: string;
  assets: ExtractedAsset[];
  zip_download_url: string;
  zip_filename: string;
}

export function sanitizeSlug(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
  return s.replace(/[\s_]+/g, '-').toLowerCase() || 'item';
}

export function rgbToHex(r: number, g: number, b: number): string {
  const ir = Math.max(0, Math.min(255, Math.round(r <= 1 ? r * 255 : r)));
  const ig = Math.max(0, Math.min(255, Math.round(g <= 1 ? g * 255 : g)));
  const ib = Math.max(0, Math.min(255, Math.round(b <= 1 ? b * 255 : b)));
  return `#${((1 << 24) + (ir << 16) + (ig << 8) + ib).toString(16).slice(1)}`;
}

export function minifyHtml(html: string): string {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([\{\}:;,>+~])\s*/g, '$1')
    .replace(/;\}/g, '}')
    .replace(/\s+/g, ' ')
    .trim();
}

function guessSectionType(name: string, idx: number, total: number): string {
  const n = name.toLowerCase();
  if (/header|navbar|top|menu|nav/.test(n) || (idx === 0 && total > 1)) return 'header';
  if (/footer|bottom|copyright/.test(n) || (idx === total - 1 && total > 2)) return 'footer';
  if (/hero|banner|intro|welcome|slider|cover/.test(n) || (idx <= 1 && total > 1)) return 'hero';
  if (/card|grid|service|tile|project|portfolio|product|item/.test(n)) return 'cards_grid';
  if (/feature|about|why|solution|split|photo & content|content & photo/.test(n)) return 'feature_two_col';
  if (/stat|counter|number/.test(n)) return 'stats';
  if (/testimonial|review|quote|client/.test(n)) return 'testimonials';
  if (/faq|question|answer|accordion/.test(n)) return 'faq';
  if (/partner|brand|client|logo|sponsor/.test(n)) return 'logos';
  if (/cta|contact|call|form|touch/.test(n)) return 'cta';
  return 'content';
}

interface ParsedSection {
  name: string;
  type: string;
  heading: string;
  eyebrow: string;
  subheading: string;
  paragraphs: string[];
  buttons: string[];
  nav_links: string[];
  images: ExtractedAsset[];
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

  // Extract layer canvas as WebP asset
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

  // Inspect raw nodes in the PSD
  let topItems = psd.children || [];
  // If wrapped in a single artboard folder, inspect inside it
  if (topItems.length === 1 && topItems[0].children && topItems[0].children.length > 0) {
    topItems = topItems[0].children;
  }

  // Filter visible items
  const visibleItems = topItems.filter((item: any) => !item.hidden);
  const totalCount = visibleItems.length;

  for (let idx = 0; idx < visibleItems.length; idx++) {
    const item = visibleItems[idx];
    const secType = guessSectionType(item.name || `Section ${idx + 1}`, idx, totalCount);

    const sec: ParsedSection = {
      name: item.name || `Section ${idx + 1}`,
      type: secType,
      heading: '',
      eyebrow: '',
      subheading: '',
      paragraphs: [],
      buttons: [],
      nav_links: [],
      images: []
    };

    // Recursive traversal to collect all text and graphics inside group
    const traverse = async (node: any) => {
      if (node.hidden) return;

      if (node.text) {
        const textContent = (node.text.text || '').replace(/\r/g, '\n').trim();
        if (!textContent) return;

        const style = node.text.style || {};
        const fontName = style.font?.name || style.font?.postScriptName || 'Inter';
        const cleanFont = fontName.split('-')[0].replace(/Regular|Bold|Light|Medium|Black|SemiBold/gi, '').trim() || 'Inter';
        fontSet.add(cleanFont);

        const fontSize = Math.round(style.fontSize || 16);
        if (style.fillColor) {
          const hex = rgbToHex(style.fillColor.r, style.fillColor.g, style.fillColor.b);
          colorFreq[hex] = (colorFreq[hex] || 0) + 1;
        }

        const nodeName = (node.name || '').toLowerCase();
        const isShort = textContent.length < 35 && !textContent.includes('\n');
        const isBtnName = /button|btn|cta/.test(nodeName);
        const isBtnWord = /^(get|sign|order|learn|start|contact|book|shop|explore|view|estimate|download)/i.test(textContent);

        if (secType === 'header' && (textContent.includes('\t') || textContent.includes('  ') || textContent.includes('\n'))) {
          const parts = textContent.split(/[\t\n]+|\s{3,}/);
          for (const p of parts) {
            const clean = p.trim();
            if (clean && clean.length < 30 && !sec.nav_links.includes(clean)) {
              sec.nav_links.push(clean);
            }
          }
          if (sec.nav_links.length >= 2) return;
        }

        if (isShort && (isBtnName || (isBtnWord && textContent.split(/\s+/).length <= 4))) {
          if (!sec.buttons.includes(textContent)) {
            sec.buttons.push(textContent);
          }
        } else if (isShort && (/eyebrow|tag|badge|pill|sub-title/i.test(nodeName) || (fontSize <= 15 && textContent === textContent.toUpperCase()))) {
          if (!sec.eyebrow) sec.eyebrow = textContent;
        } else if (fontSize >= 26 || (!sec.heading && isShort)) {
          if (!sec.heading) {
            sec.heading = textContent;
          } else if (!sec.subheading && isShort) {
            sec.subheading = textContent;
          } else {
            sec.paragraphs.push(textContent);
          }
        } else if (fontSize >= 19 && !sec.subheading && isShort) {
          sec.subheading = textContent;
        } else {
          sec.paragraphs.push(textContent);
        }
      } else if (node.canvas) {
        const asset = await extractLayerAsset(node, `${secType}-${item.name || 'img'}`);
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

    if (sec.heading || sec.paragraphs.length > 0 || sec.images.length > 0 || sec.buttons.length > 0) {
      sections.push(sec);
    }
  }

  // Composite preview extraction
  let compositeUrl: string | undefined = undefined;
  let compAsset: ExtractedAsset | null = null;
  try {
    const compCanvas = psd.canvas || getCompositeCanvas(psd);
    if (compCanvas) {
      compositeUrl = compCanvas.toDataURL('image/png');
      const blob: Blob = await new Promise((res) => compCanvas.toBlob((b) => res(b || new Blob([])), 'image/webp', 0.85));
      compAsset = {
        name: `${file.name.replace(/\.psd$/i, '')} Visual`,
        filename: `${sanitizeSlug(file.name.replace(/\.psd$/i, ''))}-hero.webp`,
        path: `images/${sanitizeSlug(file.name.replace(/\.psd$/i, ''))}-hero.webp`,
        url: compCanvas.toDataURL('image/webp', 0.85),
        width: compCanvas.width,
        height: compCanvas.height,
        size_bytes: blob.size,
        blob
      };
      allAssets.unshift(compAsset);
    }
  } catch (err) {
    console.warn('Canvas composite generation note:', err);
  }

  // If no sections were found in group hierarchy, create section from document composite
  if (sections.length === 0) {
    sections.push({
      name: file.name.replace(/\.psd$/i, '').replace(/[-_]/g, ' '),
      type: 'hero',
      heading: file.name.replace(/\.psd$/i, '').replace(/[-_]/g, ' '),
      eyebrow: '',
      subheading: '',
      paragraphs: [],
      buttons: ['Learn More'],
      nav_links: [],
      images: compAsset ? [compAsset] : []
    });
  }

  // Dominant palette calculation
  const sortedColors = Object.entries(colorFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
    .filter((c) => !['#ffffff', '#000000', '#111827', '#0f172a', '#f8fafc', '#f1f5f9', '#e2e8f0', '#334155'].includes(c.toLowerCase()));

  const primaryColor = sortedColors[0] || '#0284c7';
  const secondaryColor = sortedColors[1] || '#0d9488';
  const colorPalette = [primaryColor, secondaryColor, '#1e293b', '#f8fafc'];
  const fontList = Array.from(fontSet).slice(0, 3);
  if (fontList.length === 0) fontList.push('Inter', 'system-ui');

  // Generate Modern HTML & CSS
  const { htmlCode, cssCode } = generateModernCssBundle(file.name, sections, primaryColor, secondaryColor, fontList);
  const tailwindCode = generateTailwindBundle(file.name, sections, primaryColor, secondaryColor, fontList);

  const htmlCodeMin = minifyHtml(htmlCode);
  const cssCodeMin = minifyCss(cssCode);
  const tailwindCodeMin = minifyHtml(tailwindCode);

  // Build ZIP Package with clean leaf-{slug}/ root folder
  const folderSlug = `leaf-${sanitizeSlug(file.name.replace(/\.psd$/i, ''))}`;
  const zip = new JSZip();
  const rootFolder = zip.folder(folderSlug);

  const readmeContent = `# ${file.name.replace(/\.psd$/i, '')} - LeafLite Export

Exported cleanly from **${file.name}** (${docWidth}×${docHeight}px) using LeafLite Studio.

## 📁 Package Contents

- \`index.html\`: Semantic HTML5 document linked to \`css/style.css\`.
- \`index.min.html\`: Minified HTML5 production code.
- \`tailwind.html\`: Utility-first Tailwind CSS export ready to open in any browser.
- \`tailwind.min.html\`: Minified Tailwind CSS output.
- \`css/style.css\`: Custom stylesheet with CSS variables, typography, and responsive styles.
- \`css/style.min.css\`: Minified stylesheet.
- \`images/\`: Extracted and sliced high-efficiency WebP image assets (${allAssets.length} assets).

## 🚀 How to Run & Preview

Open \`index.html\` (Modern CSS) or \`tailwind.html\` (Tailwind CSS) directly in any web browser.

## 🎨 Extracted Design Tokens

- **Primary Color**: \`${primaryColor}\`
- **Secondary Color**: \`${secondaryColor}\`
- **Typography Detected**: ${fontList.join(', ')}
- **Detected Sections**: ${sections.length} sections
`;

  rootFolder?.file('README.md', readmeContent);
  rootFolder?.file('index.html', htmlCode);
  rootFolder?.file('index.min.html', htmlCodeMin);
  rootFolder?.file('tailwind.html', tailwindCode);
  rootFolder?.file('tailwind.min.html', tailwindCodeMin);
  rootFolder?.file('css/style.css', cssCode);
  rootFolder?.file('css/style.min.css', cssCodeMin);

  const imagesFolder = rootFolder?.folder('images');
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
    composite_url: compositeUrl,
    detected_sections_count: sections.length,
    extracted_images_count: allAssets.length,
    primary_color: primaryColor,
    secondary_color: secondaryColor,
    color_palette: colorPalette,
    fonts: fontList,
    sections: sectionSummaries,
    html_code: htmlCode,
    html_code_min: htmlCodeMin,
    css_code: cssCode,
    css_code_min: cssCodeMin,
    tailwind_code: tailwindCode,
    tailwind_code_min: tailwindCodeMin,
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
  const fontBody = fonts[0] || 'Inter';
  const fontHeading = fonts[1] || fontBody;
  const projectTitle = psdName.replace(/\.psd$/i, '').replace(/[-_]/g, ' ');

  let sectionsHtml = '';

  sections.forEach((sec, idx) => {
    const secId = `section-${idx + 1}`;

    if (sec.type === 'header') {
      const logoImg = sec.images[0]
        ? `<img src="images/${sec.images[0].filename}" alt="Logo" class="logo-img" />`
        : `<span class="logo-text">${projectTitle}</span>`;

      const navHtml = sec.nav_links.length > 0
        ? `<nav class="main-nav"><ul>${sec.nav_links.map((l) => `<li><a href="#${sanitizeSlug(l)}">${l}</a></li>`).join('')}</ul></nav>`
        : '';

      const btnHtml = sec.buttons.length > 0
        ? `<a href="#action" class="btn btn-primary">${sec.buttons[0]}</a>`
        : '';

      sectionsHtml += `
  <!-- Header: ${sec.name} -->
  <header class="site-header">
    <div class="container header-container">
      <a href="#" class="logo">${logoImg}</a>
      ${navHtml}
      ${btnHtml}
    </div>
  </header>`;
    } else if (sec.type === 'hero') {
      const bgImg = sec.images[0]
        ? `style="background: linear-gradient(rgba(15,23,42,0.7), rgba(15,23,42,0.7)), url('images/${sec.images[0].filename}') center/cover;"`
        : '';

      const btnsHtml = sec.buttons
        .map((b, i) => `<a href="#action" class="btn ${i === 0 ? 'btn-primary' : 'btn-outline'}">${b}</a>`)
        .join('\n          ');

      sectionsHtml += `
  <!-- Hero Section: ${sec.name} -->
  <section class="hero-section" id="${secId}" ${bgImg}>
    <div class="container hero-container">
      ${sec.eyebrow ? `<span class="eyebrow">${sec.eyebrow}</span>` : ''}
      ${sec.heading ? `<h1>${sec.heading}</h1>` : `<h1>${projectTitle}</h1>`}
      ${sec.subheading ? `<p class="hero-lead">${sec.subheading}</p>` : ''}
      ${sec.paragraphs.map((p) => `<p>${p}</p>`).join('\n      ')}
      ${sec.buttons.length > 0 ? `<div class="hero-btns">${btnsHtml}</div>` : ''}
    </div>
  </section>`;
    } else if (sec.type === 'cards_grid') {
      const cardItems = sec.images.length > 0 ? sec.images : [null];
      sectionsHtml += `
  <!-- Cards Grid: ${sec.name} -->
  <section class="cards-section section-alt" id="${secId}">
    <div class="container">
      ${sec.eyebrow || sec.heading ? `
      <div class="section-title-wrap">
        ${sec.eyebrow ? `<span class="eyebrow">${sec.eyebrow}</span>` : ''}
        ${sec.heading ? `<h2>${sec.heading}</h2>` : ''}
      </div>` : ''}
      <div class="cards-grid">
        ${cardItems.map((cImg, cIdx) => `
        <div class="card-item">
          ${cImg ? `<div class="card-img-wrap"><img src="images/${cImg.filename}" alt="${cImg.name}" /></div>` : ''}
          <div class="card-body">
            <h3>${sec.paragraphs[cIdx] && sec.paragraphs[cIdx].length < 50 ? sec.paragraphs[cIdx] : `${sec.name} Item ${cIdx + 1}`}</h3>
            ${sec.paragraphs[cIdx] && sec.paragraphs[cIdx].length >= 50 ? `<p>${sec.paragraphs[cIdx]}</p>` : ''}
            <a href="#" class="card-link">Learn More &rarr;</a>
          </div>
        </div>`).join('\n        ')}
      </div>
    </div>
  </section>`;
    } else if (sec.type === 'footer') {
      sectionsHtml += `
  <!-- Footer Section: ${sec.name} -->
  <footer class="site-footer" id="${secId}">
    <div class="container footer-grid">
      <div class="footer-col">
        <h3>${sec.heading || projectTitle}</h3>
        ${sec.paragraphs.map((p) => `<p>${p}</p>`).join('\n        ')}
      </div>
      ${sec.nav_links.length > 0 ? `
      <div class="footer-col">
        <h4>Navigation</h4>
        <ul class="footer-links">
          ${sec.nav_links.map((l) => `<li><a href="#${sanitizeSlug(l)}">${l}</a></li>`).join('\n          ')}
        </ul>
      </div>` : ''}
    </div>
    <div class="footer-bottom">
      <div class="container">
        <p>&copy; ${new Date().getFullYear()} ${projectTitle}. All rights reserved.</p>
      </div>
    </div>
  </footer>`;
    } else {
      // Content / Feature 2-Column Section
      const hasMedia = sec.images.length > 0;
      sectionsHtml += `
  <!-- Section: ${sec.name} -->
  <section class="${hasMedia ? 'feature-section' : 'content-section'} ${idx % 2 === 1 ? 'section-alt' : ''}" id="${secId}">
    <div class="container ${hasMedia ? 'feature-grid' : ''}">
      ${hasMedia ? `<div class="feature-media"><img src="images/${sec.images[0].filename}" alt="${sec.images[0].name}" class="feature-img" /></div>` : ''}
      <div class="feature-content">
        ${sec.eyebrow ? `<span class="eyebrow">${sec.eyebrow}</span>` : ''}
        ${sec.heading ? `<h2>${sec.heading}</h2>` : `<h2>${sec.name}</h2>`}
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
  <title>${projectTitle} | LeafLite PSD to HTML</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
${sectionsHtml}
</body>
</html>`;

  const cssCode = `/* ========================================================================= */
/* 🍃 LeafLite Clean Generated CSS: ${projectTitle}                           */
/* ========================================================================= */
:root {
  --primary: ${primary};
  --secondary: ${secondary};
  --text-main: #0f172a;
  --text-muted: #64748b;
  --bg-light: #f8fafc;
  --font-family: "${fontBody}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-heading: "${fontHeading}", "${fontBody}", sans-serif;
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
h1, h2, h3, h4 { font-family: var(--font-heading); color: var(--primary); font-weight: 700; line-height: 1.25; margin-bottom: 1rem; }
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

/* Cards Grid */
.section-title-wrap { text-align: center; max-width: 760px; margin: 0 auto 48px auto; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 28px; }
.card-item { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.05); transition: all 0.3s ease; }
.card-item:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0,0,0,0.1); }
.card-img-wrap img { width: 100%; height: 210px; object-fit: cover; }
.card-body { padding: 24px; }
.card-link { font-weight: 700; color: var(--secondary); display: inline-flex; align-items: center; gap: 6px; }

/* Footer */
.site-footer { background: #0f172a; color: #94a3b8; padding-top: 60px; }
.footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 36px; padding-bottom: 40px; }
.footer-col h3, .footer-col h4 { color: #ffffff; margin-bottom: 16px; }
.footer-links { list-style: none; }
.footer-links li { margin-bottom: 8px; }
.footer-links a:hover { color: #ffffff; }
.footer-bottom { border-top: 1px solid #1e293b; padding: 20px 0; text-align: center; font-size: 13px; }
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
  const projectTitle = psdName.replace(/\.psd$/i, '').replace(/[-_]/g, ' ');
  let sectionsHtml = '';

  sections.forEach((sec, idx) => {
    if (sec.type === 'header') {
      const logoImg = sec.images[0]
        ? `<img src="images/${sec.images[0].filename}" alt="Logo" class="h-10 w-auto" />`
        : `<span class="text-xl font-black text-brandPrimary">${projectTitle}</span>`;

      const navHtml = sec.nav_links.length > 0
        ? `<nav class="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-700">${sec.nav_links.map((l) => `<a href="#${sanitizeSlug(l)}" class="hover:text-brandPrimary transition-colors">${l}</a>`).join('')}</nav>`
        : '';

      const btnHtml = sec.buttons.length > 0
        ? `<a href="#contact" class="px-5 py-2.5 rounded-lg bg-brandPrimary hover:bg-brandSecondary text-white text-xs font-bold uppercase tracking-wider transition-all shadow-xs">${sec.buttons[0]}</a>`
        : '';

      sectionsHtml += `
  <!-- Header: ${sec.name} -->
  <header class="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <a href="#">${logoImg}</a>
      ${navHtml}
      ${btnHtml}
    </div>
  </header>`;
    } else if (sec.type === 'hero') {
      sectionsHtml += `
  <!-- Hero: ${sec.name} -->
  <section class="py-24 bg-brandPrimary text-white relative">
    <div class="max-w-7xl mx-auto px-6">
      <div class="max-w-3xl space-y-6">
        ${sec.eyebrow ? `<span class="text-xs font-bold uppercase tracking-widest text-cyan-300">${sec.eyebrow}</span>` : ''}
        <h1 class="text-4xl sm:text-6xl font-black tracking-tight">${sec.heading || projectTitle}</h1>
        ${sec.subheading ? `<p class="text-xl text-slate-200">${sec.subheading}</p>` : ''}
        ${sec.paragraphs.map((p) => `<p class="text-slate-300">${p}</p>`).join('\n        ')}
        ${sec.buttons.length > 0 ? `
        <div class="flex gap-4 pt-4">
          ${sec.buttons.map((b, i) => `<a href="#" class="px-6 py-3 rounded-lg font-bold text-sm ${i === 0 ? 'bg-white text-brandPrimary hover:bg-slate-100' : 'border-2 border-white text-white hover:bg-white/10'} transition-all">${b}</a>`).join('\n          ')}
        </div>` : ''}
      </div>
    </div>
  </section>`;
    } else if (sec.type === 'cards_grid') {
      const cardItems = sec.images.length > 0 ? sec.images : [null];
      sectionsHtml += `
  <!-- Cards Grid: ${sec.name} -->
  <section class="py-20 bg-slate-50">
    <div class="max-w-7xl mx-auto px-6">
      ${sec.eyebrow || sec.heading ? `
      <div class="text-center max-w-2xl mx-auto mb-14">
        ${sec.eyebrow ? `<span class="text-xs font-bold uppercase tracking-widest text-brandSecondary block mb-2">${sec.eyebrow}</span>` : ''}
        ${sec.heading ? `<h2 class="text-3xl sm:text-4xl font-bold text-brandPrimary">${sec.heading}</h2>` : ''}
      </div>` : ''}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${cardItems.map((cImg, cIdx) => `
        <div class="bg-white rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition-all border border-slate-100 flex flex-col">
          ${cImg ? `<img src="images/${cImg.filename}" alt="${cImg.name}" class="w-full h-52 object-cover" />` : ''}
          <div class="p-6 flex-1 flex flex-col justify-between">
            <div>
              <h3 class="text-lg font-bold text-brandPrimary mb-2">${sec.paragraphs[cIdx] && sec.paragraphs[cIdx].length < 50 ? sec.paragraphs[cIdx] : `${sec.name} Item ${cIdx + 1}`}</h3>
              ${sec.paragraphs[cIdx] && sec.paragraphs[cIdx].length >= 50 ? `<p class="text-slate-600 text-sm leading-relaxed mb-4">${sec.paragraphs[cIdx]}</p>` : ''}
            </div>
            <a href="#" class="text-xs font-bold text-brandSecondary hover:text-brandPrimary inline-flex items-center gap-1 uppercase tracking-wider">Learn More &rarr;</a>
          </div>
        </div>`).join('\n        ')}
      </div>
    </div>
  </section>`;
    } else {
      const hasMedia = sec.images.length > 0;
      sectionsHtml += `
  <!-- Section: ${sec.name} -->
  <section class="py-20 ${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}">
    <div class="max-w-7xl mx-auto px-6 ${hasMedia ? 'grid grid-cols-1 lg:grid-cols-2 gap-12 items-center' : ''}">
      ${hasMedia ? `<div><img src="images/${sec.images[0].filename}" alt="${sec.images[0].name}" class="rounded-2xl shadow-xl w-full" /></div>` : ''}
      <div class="space-y-4">
        ${sec.eyebrow ? `<span class="text-xs font-bold uppercase tracking-wider text-brandSecondary">${sec.eyebrow}</span>` : ''}
        <h2 class="text-3xl sm:text-4xl font-bold text-brandPrimary">${sec.heading || sec.name}</h2>
        ${sec.subheading ? `<p class="text-slate-600 leading-relaxed text-lg">${sec.subheading}</p>` : ''}
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
  <title>${projectTitle} | LeafLite Tailwind Export</title>
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
