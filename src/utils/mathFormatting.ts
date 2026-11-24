const ALLOWED_TAGS = new Set([
  'SPAN',
  'MARK',
  'SUP',
  'SUB',
  'BR',
  'P',
  'DIV',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'DEL',
  'OL',
  'UL',
  'LI',
]);

const ALLOWED_CLASSES = new Set([
  'teacher-red',
  'highlight-pastel',
  'frac',
  'frac-num',
  'frac-den',
]);

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      const cleanChild = sanitizeNode(child, doc);
      if (cleanChild) fragment.appendChild(cleanChild);
    }
    return fragment;
  }

  const cleanEl = doc.createElement(tag.toLowerCase());
  const classAttr = el.getAttribute('class');
  if (classAttr) {
    const safeClasses = classAttr
      .split(/\s+/)
      .filter((cls) => ALLOWED_CLASSES.has(cls));
    if (safeClasses.length > 0) {
      cleanEl.setAttribute('class', safeClasses.join(' '));
    }
  }

  for (const child of Array.from(el.childNodes)) {
    const cleanChild = sanitizeNode(child, doc);
    if (cleanChild) cleanEl.appendChild(cleanChild);
  }
  return cleanEl;
}

export function sanitizeMathHtml(rawHtml: string | null | undefined): string {
  if (!rawHtml) return '';
  if (typeof window === 'undefined') return rawHtml;

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;
  if (!root) return '';

  const outDoc = document.implementation.createHTMLDocument('');
  const container = outDoc.createElement('div');
  for (const child of Array.from(root.childNodes)) {
    const clean = sanitizeNode(child, outDoc);
    if (clean) container.appendChild(clean);
  }
  return container.innerHTML;
}

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
};

const SUBSCRIPTS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
};

function toUnicodeScript(text: string, map: Record<string, string>, fallbackPrefix: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const chars = Array.from(trimmed);
  if (chars.every((c) => map[c])) {
    return chars.map((c) => map[c]).join('');
  }
  return chars.length === 1 ? `${fallbackPrefix}${trimmed}` : `${fallbackPrefix}(${trimmed})`;
}

export function htmlToReadableText(rawHtml: string | null | undefined): string {
  if (!rawHtml) return '';
  if (typeof window === 'undefined') {
    return rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toUpperCase();

    if (tag === 'BR') return '\n';

    if (el.classList.contains('frac')) {
      const num = el.querySelector('.frac-num')?.textContent?.trim() ?? '';
      const den = el.querySelector('.frac-den')?.textContent?.trim() ?? '';
      const nFormatted = num.length > 1 && /[+\-*/\s]/.test(num) ? `(${num})` : num;
      const dFormatted = den.length > 1 && /[+\-*/\s]/.test(den) ? `(${den})` : den;
      return `${nFormatted}/${dFormatted}`;
    }

    const inner = Array.from(el.childNodes).map(walk).join('');

    if (tag === 'SUP') {
      return toUnicodeScript(inner, SUPERSCRIPTS, '^');
    }
    if (tag === 'SUB') {
      return toUnicodeScript(inner, SUBSCRIPTS, '_');
    }
    if (tag === 'P' || tag === 'DIV') {
      return inner.trim() ? `${inner.trim()}\n` : '';
    }
    if (tag === 'LI') {
      return inner.trim() ? `• ${inner.trim()}\n` : '';
    }
    return inner;
  };

  return walk(root)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const ALLOWED_SVG_TAGS = new Set([
  'svg',
  'g',
  'path',
  'line',
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'polyline',
  'text',
  'tspan',
  'defs',
  'marker',
  'title',
]);

const ALLOWED_SVG_ATTRS = new Set([
  'xmlns',
  'viewBox',
  'width',
  'height',
  'class',
  'id',
  'd',
  'x',
  'y',
  'dx',
  'dy',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'opacity',
  'transform',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'marker-start',
  'marker-mid',
  'marker-end',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'orient',
  'preserveAspectRatio',
]);

const SVG_ATTR_CANONICAL: Record<string, string> = {};
for (const attr of ALLOWED_SVG_ATTRS) {
  SVG_ATTR_CANONICAL[attr.toLowerCase()] = attr;
}

const SVG_HTML_ENTITY_MAP: Record<string, string> = {
  radic: '√',
  deg: '°',
  times: '×',
  divide: '÷',
  minus: '−',
  plusmn: '±',
  sup2: '²',
  sup3: '³',
  le: '≤',
  ge: '≥',
  ne: '≠',
  approx: '≈',
  pi: 'π',
  theta: 'θ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  angle: '∠',
  perp: '⊥',
  parallel: '∥',
  infin: '∞',
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function normalizeSvgForXml(rawSvg: string): string {
  // Replace HTML named entities (invalid in strict XML) with Unicode characters
  const withUnicode = rawSvg.replace(/&([a-zA-Z0-9]+);/g, (full, name: string) => {
    if (name === 'amp' || name === 'lt' || name === 'gt' || name === 'quot' || name === 'apos') {
      return full;
    }
    return SVG_HTML_ENTITY_MAP[name] ?? full;
  });

  // Escape stray bare ampersands that would otherwise fail XML parsing
  return withUnicode.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

function sanitizeSvgNode(node: Node, outDoc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return outDoc.createTextNode(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_SVG_TAGS.has(tag)) {
    return null;
  }

  const cleanEl = outDoc.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const attr of Array.from(el.attributes)) {
    const rawName = attr.name;
    const lowerName = rawName.toLowerCase();
    const val = attr.value;
    if (lowerName.startsWith('on')) continue;
    if (/javascript:/i.test(val)) continue;
    const canonicalName = SVG_ATTR_CANONICAL[lowerName];
    if (canonicalName) {
      cleanEl.setAttribute(canonicalName, val);
    }
  }

  if (tag === 'svg') {
    cleanEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!cleanEl.getAttribute('viewBox')) {
      cleanEl.setAttribute('viewBox', '0 0 240 150');
    }
    cleanEl.removeAttribute('width');
    cleanEl.removeAttribute('height');
  }

  for (const child of Array.from(el.childNodes)) {
    const cleanChild = sanitizeSvgNode(child, outDoc);
    if (cleanChild) cleanEl.appendChild(cleanChild);
  }
  return cleanEl;
}

export function sanitizeDiagramSvg(rawSvg: string | null | undefined): string {
  if (!rawSvg || typeof rawSvg !== 'string') return '';
  const trimmed = rawSvg.trim();
  if (!trimmed || !trimmed.toLowerCase().includes('<svg')) return '';
  if (typeof window === 'undefined') return trimmed;

  const normalized = normalizeSvgForXml(trimmed);
  const parser = new DOMParser();

  let svgEl: Element | null = null;
  const parsedXml = parser.parseFromString(normalized, 'image/svg+xml');
  if (!parsedXml.querySelector('parsererror')) {
    svgEl = parsedXml.querySelector('svg');
  }

  // Lenient HTML fallback if strict XML tripped on unclosed tags; always keep cropped photo fallback if still invalid/empty
  if (!svgEl) {
    const parsedHtml = parser.parseFromString(normalized, 'text/html');
    svgEl = parsedHtml.querySelector('svg');
  }
  if (!svgEl) {
    return '';
  }

  const outDoc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
  const cleanSvg = sanitizeSvgNode(svgEl, outDoc) as Element | null;
  if (!cleanSvg) return '';

  // Ensure the SVG actually contains drawable diagram shapes rather than an empty shell
  const hasDrawableShapes = Boolean(
    cleanSvg.querySelector('path, line, rect, circle, ellipse, polygon, polyline, text'),
  );
  if (!hasDrawableShapes) {
    return '';
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(cleanSvg);
}

