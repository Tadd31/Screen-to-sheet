import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eraser,
  ExternalLink,
  Highlighter,
  PenLine,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { DigitizedQuestion, InkStroke, PenTool, StrokePoint } from '../types';
import { generateWhiteboardTabHtml } from '../utils/exportHtml';
import { exportA4SheetSnapshot } from '../utils/imageProcessing';
import { sanitizeDiagramSvg, sanitizeMathHtml } from '../utils/mathFormatting';

interface WhiteboardModalProps {
  question: DigitizedQuestion;
  blankRetakeMode: boolean;
  onClose: () => void;
}

const CANVAS_W = 1588;
const CANVAS_H = 2246;

const PEN_COLORS = [
  { label: 'Black', value: '#0f172a' },
  { label: 'Teacher Red', value: '#dc2626' },
  { label: 'Blue', value: '#2563eb' },
];

const WIDTH_OPTIONS = [
  { label: 'Fine', value: 3.5 },
  { label: 'Med', value: 6 },
  { label: 'Bold', value: 10 },
];

export const WhiteboardModal: React.FC<WhiteboardModalProps> = ({
  question,
  blankRetakeMode,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<InkStroke[]>([]);
  const activeStrokeRef = useRef<InkStroke | null>(null);

  const [tool, setTool] = useState<PenTool>('pen');
  const [penColor, setPenColor] = useState<string>('#0f172a');
  const [strokeWidth, setStrokeWidth] = useState<number>(6);
  const [strokeCount, setStrokeCount] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<'png' | 'jpg' | null>(null);

  const newTabUrl = useMemo(() => {
    const html = generateWhiteboardTabHtml(question, { blankRetakeMode });
    const blob = new Blob([html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [question, blankRetakeMode]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(newTabUrl);
    };
  }, [newTabUrl]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const drawSingleStroke = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: InkStroke) => {
      if (stroke.points.length === 0) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else if (stroke.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.36)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
      }

      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        ctx.beginPath();
        ctx.fillStyle =
          stroke.tool === 'highlighter'
            ? 'rgba(250, 204, 21, 0.36)'
            : stroke.tool === 'eraser'
              ? 'rgba(0,0,0,1)'
              : stroke.color;
        const r =
          stroke.tool === 'eraser'
            ? 20
            : stroke.tool === 'highlighter'
              ? 18
              : stroke.baseWidth * 0.6;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1];
        const curr = stroke.points[i];
        const pressureFactor =
          curr.pressure > 0 ? 0.65 + curr.pressure * 0.7 : 1;

        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.lineWidth =
          stroke.tool === 'eraser'
            ? 38
            : stroke.tool === 'highlighter'
              ? 36
              : stroke.baseWidth * pressureFactor;
        ctx.stroke();
      }
      ctx.restore();
    },
    [],
  );

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    for (const s of strokesRef.current) {
      drawSingleStroke(ctx, s);
    }
  }, [drawSingleStroke]);

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
      pressure: e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toCanvasPoint(e);
    const nextStroke: InkStroke = {
      tool,
      color: penColor,
      baseWidth: strokeWidth,
      points: [pt],
    };
    activeStrokeRef.current = nextStroke;
    strokesRef.current.push(nextStroke);
    setStrokeCount(strokesRef.current.length);
    redrawAll();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return;
    const pt = toCanvasPoint(e);
    activeStrokeRef.current.points.push(pt);
    redrawAll();
  };

  const handlePointerEnd = () => {
    activeStrokeRef.current = null;
  };

  const handleUndo = () => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redrawAll();
  };

  const handleClear = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    redrawAll();
  };

  const handleSnapshotDownload = async (format: 'png' | 'jpg') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsExporting(format);
    try {
      await exportA4SheetSnapshot({
        question,
        inkCanvas: canvas,
        sheetHeaderHeightRatio: 0.25,
        blankRetakeMode,
        format,
      });
    } finally {
      setIsExporting(null);
    }
  };

  const safeQuestionHtml = useMemo(
    () => sanitizeMathHtml(question.questionTextHTML),
    [question.questionTextHTML],
  );
  const safeDiagramSvg = useMemo(
    () => sanitizeDiagramSvg(question.diagramSVG),
    [question.diagramSVG],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#f8f9fa] no-print"
      role="dialog"
      aria-modal="true"
      aria-label={`A4 tablet whiteboard for ${question.questionNumber}`}
    >
      {/* Floating Non-Captured Tablet Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display font-bold text-slate-900 text-sm mr-2 whitespace-nowrap">
            {question.questionNumber || 'Question'} · A4 Tablet Sheet
          </span>

          {/* Color & Tool Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {PEN_COLORS.map((c) => {
              const active = tool === 'pen' && penColor === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    setTool('pen');
                    setPenColor(c.value);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#cce5ff] text-[#1e3a8a]'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <PenLine className="w-3.5 h-3.5" style={{ color: c.value }} />
                  {c.label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setTool('highlighter')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tool === 'highlighter'
                  ? 'bg-[#fff3cd] text-[#713f12]'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
              Highlighter
            </button>

            <button
              type="button"
              onClick={() => setTool('eraser')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tool === 'eraser'
                  ? 'bg-[#f8d7da] text-[#881337]'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              Eraser
            </button>
          </div>

          {/* Stroke Width */}
          {tool === 'pen' && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {WIDTH_OPTIONS.map((w) => (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => setStrokeWidth(w.value)}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    strokeWidth === w.value
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleUndo}
            disabled={strokeCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Undo
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={strokeCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Ink
          </button>
        </div>

        {/* Right Actions: New Tab, PNG/JPG Snapshot, Close */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={newTabUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in New Tab
          </a>

          <button
            type="button"
            onClick={() => handleSnapshotDownload('png')}
            disabled={isExporting !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#cce5ff] hover:bg-[#b8daff] text-[#1e3a8a] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting === 'png' ? 'Saving PNG...' : 'Download PNG'}
          </button>

          <button
            type="button"
            onClick={() => handleSnapshotDownload('jpg')}
            disabled={isExporting !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#d4edda] hover:bg-[#c3e6cb] text-[#14532d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting === 'jpg' ? 'Saving JPG...' : 'Download JPG'}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close tablet whiteboard"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>

      {/* Scrollable Desk Container Holding Pure White A4 Sheet */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center items-start">
        <div className="relative w-full max-w-[794px] aspect-[210/297] bg-white border border-slate-300 shadow-sm shrink-0 overflow-hidden">
          {/* Pinned Pure White Question & Diagram Header at Top of A4 Page */}
          <div className="px-10 pt-8 pb-5 border-b border-slate-200 bg-white pointer-events-none select-none">
            <h2 className="font-display font-bold text-xl text-slate-900 mb-2">
              {question.questionNumber || 'Question'}
            </h2>
            <div
              className="text-[15px] leading-relaxed text-slate-800"
              dangerouslySetInnerHTML={{ __html: safeQuestionHtml }}
            />
            {safeDiagramSvg ? (
              <div
                className="diagram-svg-container mt-4 max-w-md bg-white border border-slate-200 rounded-md p-2"
                dangerouslySetInnerHTML={{ __html: safeDiagramSvg }}
              />
            ) : (
              question.croppedDiagramUrl && (
                <div className="mt-4 inline-block bg-white border border-slate-200 rounded-md p-2">
                  <img
                    src={question.croppedDiagramUrl}
                    alt={`Diagram for ${question.questionNumber}`}
                    referrerPolicy="no-referrer"
                    className="max-h-48 max-w-full object-contain block"
                  />
                </div>
              )
            )}
          </div>

          {/* Live Stylus / Pen-Tablet Pointer Canvas Covering Full A4 Page */}
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            style={{ touchAction: 'none' }}
            className="absolute inset-0 w-full h-full cursor-crosshair z-10"
          />
        </div>
      </div>
    </div>
  );
};
