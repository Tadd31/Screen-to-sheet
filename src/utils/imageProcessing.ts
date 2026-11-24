import { htmlToReadableText, sanitizeDiagramSvg } from './mathFormatting';
import { DigitizedQuestion } from '../types';

const MAX_IMAGE_DIM = 1600;

export async function loadNormalizedImage(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
}> {
  // Use createImageBitmap with EXIF orientation support so sideways smartphone photos straighten automatically.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
      const targetW = Math.max(1, Math.round(bitmap.width * scale));
      const targetH = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close();

      return {
        dataUrl: canvas.toDataURL('image/jpeg', 0.9),
        width: targetW,
        height: targetH,
        mimeType: 'image/jpeg',
      };
    } catch {
      // Fallback to standard HTMLImageElement below
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.9),
          width: targetW,
          height: targetH,
          mimeType: 'image/jpeg',
        });
      };
      img.onerror = () => reject(new Error(`Could not decode ${file.name}`));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function rotateDataUrlClockwise(
  dataUrl: string,
  clockwiseDegrees: 90 | 180 | 270,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const swapDims = clockwiseDegrees === 90 || clockwiseDegrees === 270;
      const targetW = swapDims ? img.height : img.width;
      const targetH = swapDims ? img.width : img.height;

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.translate(targetW / 2, targetH / 2);
      ctx.rotate((clockwiseDegrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        width: targetW,
        height: targetH,
      });
    };
    img.onerror = () => reject(new Error('Failed to rotate image'));
    img.src = dataUrl;
  });
}

export function cropBoundingBox(
  dataUrl: string,
  box: number[],
): Promise<string | null> {
  if (!Array.isArray(box) || box.length !== 4) {
    return Promise.resolve(null);
  }
  const [rawYmin, rawXmin, rawYmax, rawXmax] = box;
  if (
    [rawYmin, rawXmin, rawYmax, rawXmax].some(
      (n) => typeof n !== 'number' || Number.isNaN(n),
    )
  ) {
    return Promise.resolve(null);
  }

  // Add subtle 1.5% padding around detected figure so labels are never clipped
  const pad = 15;
  const ymin = Math.max(0, Math.min(1000, rawYmin - pad));
  const xmin = Math.max(0, Math.min(1000, rawXmin - pad));
  const ymax = Math.max(0, Math.min(1000, rawYmax + pad));
  const xmax = Math.max(0, Math.min(1000, rawXmax + pad));

  if (ymax - ymin < 25 || xmax - xmin < 25) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sx = Math.round((xmin / 1000) * img.width);
      const sy = Math.round((ymin / 1000) * img.height);
      const sw = Math.max(1, Math.round(((xmax - xmin) / 1000) * img.width));
      const sh = Math.max(1, Math.round(((ymax - ymin) / 1000) * img.height));

      if (sw < 24 || sh < 24) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

export async function exportA4SheetSnapshot(params: {
  question: DigitizedQuestion;
  inkCanvas: HTMLCanvasElement;
  sheetHeaderHeightRatio: number;
  blankRetakeMode?: boolean;
  format: 'png' | 'jpg';
}): Promise<void> {
  const { question, inkCanvas, blankRetakeMode = false, format } = params;
  // Crisp 2x A4 portrait canvas (1588 x 2246)
  const W = 1588;
  const H = 2246;
  const paddingX = 92;
  const paddingTop = 80;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = W;
  outCanvas.height = H;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return;

  // Pure white A4 sheet
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Question label
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 38px "Plus Jakarta Sans", system-ui, sans-serif';
  const label = question.questionNumber || 'Question';
  ctx.fillText(label, paddingX, paddingTop + 34);

  // Question prompt wrapped cleanly
  const questionText = htmlToReadableText(question.questionTextHTML);
  ctx.fillStyle = '#1e293b';
  ctx.font = '400 30px "DM Sans", system-ui, sans-serif';
  const lines = wrapCanvasText(ctx, questionText, W - paddingX * 2);

  let cursorY = paddingTop + 92;
  for (const line of lines.slice(0, 12)) {
    ctx.fillText(line, paddingX, cursorY);
    cursorY += 42;
  }

  // Associated inline SVG diagram (preferred) with guaranteed fallback to cropped bitmap diagram
  const cleanSvg = sanitizeDiagramSvg(question.diagramSVG);
  const svgDataUri = cleanSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        blankRetakeMode
          ? cleanSvg.replace(
              /(<svg\b[^>]*>)/i,
              '$1<style>.student-diagram-layer,.teacher-diagram-layer{display:none;}</style>',
            )
          : cleanSvg,
      )}`
    : null;

  let diagImg: HTMLImageElement | null = null;
  let usedSvg = false;
  if (svgDataUri) {
    try {
      diagImg = await loadImageElement(svgDataUri);
      usedSvg = true;
    } catch {
      diagImg = null;
    }
  }
  if (!diagImg && question.croppedDiagramUrl) {
    try {
      diagImg = await loadImageElement(question.croppedDiagramUrl);
      usedSvg = false;
    } catch {
      diagImg = null;
    }
  }

  if (diagImg) {
    const maxDiagW = W - paddingX * 2;
    const maxDiagH = 380;
    const natW = diagImg.naturalWidth || diagImg.width || 480;
    const natH = diagImg.naturalHeight || diagImg.height || 300;
    const scale = Math.min(maxDiagW / natW, maxDiagH / natH, usedSvg ? 2.5 : 1);
    const drawW = Math.round(natW * scale);
    const drawH = Math.round(natH * scale);
    cursorY += 16;
    ctx.drawImage(diagImg, paddingX, cursorY, drawW, drawH);
    cursorY += drawH + 24;
  } else {
    cursorY += 16;
  }

  // Hairline rule separating header from working area
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(paddingX, cursorY);
  ctx.lineTo(W - paddingX, cursorY);
  ctx.stroke();

  // Composite the full A4 ink canvas layer right over the sheet
  ctx.drawImage(inkCanvas, 0, 0, W, H);

  const safeSlug = (question.questionNumber || 'question')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '');
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpg' ? 'jpg' : 'png';
  const dataUrl = outCanvas.toDataURL(mime, format === 'jpg' ? 0.94 : undefined);

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `ScreenToSheet-${safeSlug}.${ext}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
