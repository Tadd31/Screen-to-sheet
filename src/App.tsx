import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calculator,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Loader2,
  Printer,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { QuestionCard } from './components/QuestionCard';
import { WhiteboardModal } from './components/WhiteboardModal';
import {
  ApiQuestionResponse,
  DigitizedQuestion,
  ExamSubject,
  UploadedPage,
} from './types';
import { generateStandaloneWorksheetHtml } from './utils/exportHtml';
import {
  cropBoundingBox,
  loadNormalizedImage,
  rotateDataUrlClockwise,
} from './utils/imageProcessing';

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [subject, setSubject] = useState<ExamSubject>('maths');
  const [pages, setPages] = useState<UploadedPage[]>([]);
  const [questions, setQuestions] = useState<DigitizedQuestion[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showAnswers, setShowAnswers] = useState(true);
  const [showDiagnostic, setShowDiagnostic] = useState(true);
  const [blankRetakeMode, setBlankRetakeMode] = useState(false);
  const [activeTabletQuestion, setActiveTabletQuestion] =
    useState<DigitizedQuestion | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('retake-mode', blankRetakeMode);
    return () => {
      document.body.classList.remove('retake-mode');
    };
  }, [blankRetakeMode]);

  useEffect(() => {
    if (!showHowItWorks) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHowItWorks(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showHowItWorks]);

  const runAutoOrientation = useCallback(async (newPages: UploadedPage[]) => {
    if (newPages.length === 0) return;
    try {
      const response = await fetch('/api/detect-orientation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: newPages.map((p, idx) => ({
            index: idx,
            mimeType: p.mimeType,
            data: p.orientedDataUrl,
          })),
        }),
      });

      if (!response.ok) {
        setPages((prev) =>
          prev.map((p) =>
            newPages.some((np) => np.id === p.id)
              ? { ...p, isAutoOrienting: false }
              : p,
          ),
        );
        return;
      }

      const data = (await response.json()) as {
        rotations?: Array<{ imageIndex: number; clockwiseDegrees: number }>;
      };
      const rotationMap = new Map<string, number>();
      for (const r of data.rotations ?? []) {
        const target = newPages[r.imageIndex];
        if (target && [90, 180, 270].includes(r.clockwiseDegrees)) {
          rotationMap.set(target.id, r.clockwiseDegrees);
        }
      }

      const rotatedResults = await Promise.all(
        newPages.map(async (page) => {
          const deg = rotationMap.get(page.id);
          if (!deg) return { id: page.id, rotated: null };
          const rotated = await rotateDataUrlClockwise(
            page.orientedDataUrl,
            deg as 90 | 180 | 270,
          );
          return { id: page.id, deg, rotated };
        }),
      );

      setPages((prev) =>
        prev.map((p) => {
          const match = rotatedResults.find((r) => r.id === p.id);
          if (!match) return p;
          if (!match.rotated) {
            return { ...p, isAutoOrienting: false };
          }
          return {
            ...p,
            orientedDataUrl: match.rotated.dataUrl,
            width: match.rotated.width,
            height: match.rotated.height,
            rotationDeg: (p.rotationDeg + (match.deg ?? 0)) % 360,
            isAutoOrienting: false,
            wasAutoRotated: true,
          };
        }),
      );
    } catch {
      setPages((prev) =>
        prev.map((p) =>
          newPages.some((np) => np.id === p.id)
            ? { ...p, isAutoOrienting: false }
            : p,
        ),
      );
    }
  }, []);

  const handleFilesSelected = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setErrorMsg(null);

      const imageFiles = Array.from(fileList).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (imageFiles.length === 0) {
        setErrorMsg('Please select image files (PNG, JPG, or WEBP).');
        return;
      }

      const loaded: UploadedPage[] = [];
      for (const file of imageFiles) {
        try {
          const norm = await loadNormalizedImage(file);
          loaded.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fileName: file.name,
            mimeType: norm.mimeType,
            orientedDataUrl: norm.dataUrl,
            rotationDeg: 0,
            width: norm.width,
            height: norm.height,
            isAutoOrienting: true,
            wasAutoRotated: false,
          });
        } catch (err) {
          setErrorMsg(
            err instanceof Error ? err.message : `Failed to read ${file.name}`,
          );
        }
      }

      if (loaded.length > 0) {
        setPages((prev) => [...prev, ...loaded]);
        void runAutoOrientation(loaded);
      }
    },
    [runAutoOrientation],
  );

  const handleRotatePage = async (pageId: string) => {
    const target = pages.find((p) => p.id === pageId);
    if (!target) return;
    try {
      const rotated = await rotateDataUrlClockwise(target.orientedDataUrl, 90);
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? {
                ...p,
                orientedDataUrl: rotated.dataUrl,
                width: rotated.width,
                height: rotated.height,
                rotationDeg: (p.rotationDeg + 90) % 360,
                wasAutoRotated: false,
              }
            : p,
        ),
      );
    } catch {
      setErrorMsg('Could not rotate that image. Please try again.');
    }
  };

  const handleRemovePage = (pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  const handleAnalyzeExam = async () => {
    if (pages.length === 0 || isAnalyzing) return;
    setErrorMsg(null);
    setIsAnalyzing(true);

    try {
      const response = await fetch('/api/analyze-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          images: pages.map((p, idx) => ({
            index: idx,
            mimeType: p.mimeType,
            data: p.orientedDataUrl,
          })),
        }),
      });

      const payload = (await response.json()) as {
        questions?: ApiQuestionResponse[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || 'Failed to analyse the uploaded exam images.',
        );
      }

      const rawQuestions = payload.questions ?? [];
      if (rawQuestions.length === 0) {
        setErrorMsg(
          subject === 'english'
            ? 'No English questions, prompts, or student writing were detected in the uploaded images. Check that the photos are clear and try again.'
            : 'No exam questions were detected in the uploaded images. Check that the photos are clear and try again.',
        );
        return;
      }

      const hydrated: DigitizedQuestion[] = await Promise.all(
        rawQuestions.map(async (q, idx) => {
          const sourceIdx =
            typeof q.sourceImageIndex === 'number' &&
            q.sourceImageIndex >= 0 &&
            q.sourceImageIndex < pages.length
              ? q.sourceImageIndex
              : 0;
          const sourcePage = pages[sourceIdx];
          const croppedDiagramUrl =
            sourcePage &&
            Array.isArray(q.diagramBoundingBox) &&
            q.diagramBoundingBox.length === 4
              ? await cropBoundingBox(
                  sourcePage.orientedDataUrl,
                  q.diagramBoundingBox,
                )
              : null;

          return {
            ...q,
            id: `q-${Date.now()}-${idx}`,
            subject,
            sourceImageIndex: sourceIdx,
            croppedDiagramUrl,
            liveNotes: '',
          };
        }),
      );

      setQuestions(hydrated);
      document
        .getElementById('worksheet')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unexpected error analysing exam paper.',
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateLiveNotes = useCallback((id: string, notes: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, liveNotes: notes } : q)),
    );
  }, []);

  const worksheetTabUrl = useMemo(() => {
    if (questions.length === 0) return null;
    const html = generateStandaloneWorksheetHtml(questions, {
      showAnswers,
      showDiagnostic,
      blankRetakeMode,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    return URL.createObjectURL(blob);
  }, [questions, showAnswers, showDiagnostic, blankRetakeMode]);

  useEffect(() => {
    return () => {
      if (worksheetTabUrl) URL.revokeObjectURL(worksheetTabUrl);
    };
  }, [worksheetTabUrl]);

  const handleExportHtml = () => {
    if (questions.length === 0) return;
    const html = generateStandaloneWorksheetHtml(questions, {
      showAnswers,
      showDiagnostic,
      blankRetakeMode,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'screen-to-sheet-worksheet.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract (Single-row, clean wordmark, nav links, 1 CTA) */}
      <header className="no-print bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 inline-flex items-center gap-2"
          >
            <span aria-hidden="true">📝</span>
            <span>Screen To Sheet</span>
          </a>

          <nav className="flex items-center gap-5 shrink-0">
            <button
              type="button"
              onClick={() => setShowHowItWorks(true)}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              How It Works
            </button>

            {questions.length > 0 && worksheetTabUrl && (
              <a
                href={worksheetTabUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open print-ready worksheet in a new tab"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#cce5ff] hover:bg-[#b8daff] text-[#1e3a8a] transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Worksheet
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-8 worksheet-container">
        {/* Intake & Configuration Zone (Hidden on Print) */}
        <section id="upload" className="no-print space-y-6">
          {/* Pre-Upload Subject Mode Selector */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-xs font-semibold text-slate-500 whitespace-nowrap">
                Paper Subject
              </span>
              <div
                role="group"
                aria-label="Select paper subject before uploading"
                className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
              >
                <button
                  type="button"
                  aria-pressed={subject === 'maths'}
                  disabled={isAnalyzing}
                  onClick={() => setSubject('maths')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                    subject === 'maths'
                      ? 'bg-white text-[#1e3a8a] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Maths
                </button>
                <button
                  type="button"
                  aria-pressed={subject === 'english'}
                  disabled={isAnalyzing}
                  onClick={() => setSubject('english')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                    subject === 'english'
                      ? 'bg-white text-[#1e3a8a] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  English
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              {subject === 'english'
                ? 'Comprehension, SPaG & student essays — preserves exact spelling/punctuation errors, paragraphing & teacher SPaG marks.'
                : 'Marked maths papers — preserves working verbatim, fractions & redraws layered geometric SVG diagrams.'}
            </p>
          </div>

          {/* Drag-and-Drop Multi-Image Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              void handleFilesSelected(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              isDragging
                ? 'border-[#3b82f6] bg-[#cce5ff]/35'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="mx-auto w-11 h-11 rounded-lg bg-[#cce5ff] text-[#1e3a8a] flex items-center justify-center mb-3">
              <Upload className="w-5 h-5" />
            </div>
            <p className="font-display font-semibold text-base text-slate-900">
              {subject === 'english'
                ? 'Drop English exam papers or student essay photos here, or click to browse'
                : 'Drop marked maths exam photos here, or click to browse'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Supports multiple PNG, JPG, or WEBP pages · Auto-rotates sideways photos ·
              Deduplicates overlapping shots
            </p>
          </div>

          {/* Uploaded Thumbnails Preview & Manual Rotation Override */}
          {pages.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-700">
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {pages.length}
                  </span>{' '}
                  {pages.length === 1 ? 'page' : 'pages'} ready for{' '}
                  <span className="font-semibold text-slate-900">
                    {subject === 'english' ? 'English' : 'Maths'}
                  </span>{' '}
                  digitisation
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPages([])}
                    disabled={isAnalyzing}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    Clear Photos
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAnalyzeExam()}
                    disabled={
                      isAnalyzing || pages.some((p) => p.isAutoOrienting)
                    }
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#cce5ff] hover:bg-[#b8daff] text-[#1e3a8a] transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analysing &amp; Digitising...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        {subject === 'english'
                          ? 'Analyse & Digitise English'
                          : 'Analyse & Digitise Maths'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    className="border border-slate-200 rounded-lg p-2.5 bg-white flex flex-col gap-2"
                  >
                    <div className="relative aspect-[3/4] bg-[#f8f9fa] rounded-md overflow-hidden border border-slate-100 flex items-center justify-center">
                      <img
                        src={page.orientedDataUrl}
                        alt={page.fileName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                      {page.isAutoOrienting && (
                        <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-1.5 text-xs font-medium text-slate-700">
                          <Loader2 className="w-4 h-4 animate-spin text-[#1e3a8a]" />
                          Auto-orienting
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate font-medium text-slate-700">
                        Page {index + 1}
                      </span>
                      {page.wasAutoRotated && (
                        <span className="text-[11px] text-emerald-700 font-medium whitespace-nowrap">
                          Auto-rotated
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleRotatePage(page.id)}
                        disabled={page.isAutoOrienting || isAnalyzing}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePage(page.id)}
                        disabled={isAnalyzing}
                        aria-label={`Remove ${page.fileName}`}
                        className="inline-flex items-center justify-center p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Feedback Banner */}
          {errorMsg && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8d7da]/80 border border-[#f1aeb5] text-[#881337] px-4 py-3 text-sm"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Unable to complete digitisation</p>
                  <p className="mt-0.5">{errorMsg}</p>
                </div>
              </div>
              {pages.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleAnalyzeExam()}
                  disabled={isAnalyzing}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-[#f1aeb5] text-[#881337] hover:bg-[#fff5f6] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
        </section>

        {/* Sticky Live Tutoring Controls Bar */}
        {questions.length > 0 && (
          <div className="no-print sticky top-3 z-20 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-700">
              <span className="font-mono-tabular font-semibold text-slate-900">
                {questions.length}
              </span>{' '}
              {questions.length === 1 ? 'question' : 'questions'} digitised
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAnswers((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showAnswers
                    ? 'bg-[#d4edda] border-[#86efac] text-[#14532d]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {showAnswers ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    Hide Solution
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Reveal Solution
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowDiagnostic((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showDiagnostic
                    ? 'bg-[#f8d7da] border-[#f1aeb5] text-[#881337]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {showDiagnostic ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    Hide Diagnostic
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Show Diagnostic
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setBlankRetakeMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  blankRetakeMode
                    ? 'bg-[#cce5ff] border-[#93c5fd] text-[#1e3a8a]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Blank Retake Mode: {blankRetakeMode ? 'On' : 'Off'}
              </button>

              <button
                type="button"
                onClick={handleExportHtml}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Export HTML
              </button>

              {worksheetTabUrl && (
                <a
                  href={worksheetTabUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open print-ready worksheet in a new tab"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#fff3cd] hover:bg-[#ffe69c] border border-[#fde68a] text-[#713f12] transition-colors whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Worksheet
                </a>
              )}
            </div>
          </div>
        )}

        {/* Main Worksheet Area — Starts Empty Until Images Are Uploaded & Analyzed */}
        <section id="worksheet" className="space-y-5">
          {questions.length === 0 ? (
            <div className="no-print bg-white border border-slate-200 rounded-xl p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-xl bg-[#d4edda]/70 text-[#14532d] flex items-center justify-center mb-3">
                <Download className="w-5 h-5" />
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Your digitised worksheet will appear here
              </h2>
              <p className="mt-1.5 max-w-xl mx-auto text-sm text-slate-600 leading-relaxed">
                Choose <span className="font-semibold text-slate-800">Maths</span> or{' '}
                <span className="font-semibold text-slate-800">English</span> above, upload one or
                more photos of a marked exam paper or student essay, and click{' '}
                <span className="font-semibold text-slate-800">
                  {subject === 'english'
                    ? 'Analyse & Digitise English'
                    : 'Analyse & Digitise Maths'}
                </span>{' '}
                to build your live tutoring worksheet.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  sourcePage={pages[q.sourceImageIndex]}
                  showAnswers={showAnswers}
                  showDiagnostic={showDiagnostic}
                  blankRetakeMode={blankRetakeMode}
                  onUpdateLiveNotes={handleUpdateLiveNotes}
                  onOpenTablet={(question) => setActiveTabletQuestion(question)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* How It Works Overlay Modal */}
      {showHowItWorks && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-it-works-title"
          onClick={() => setShowHowItWorks(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 sm:p-8 shadow-lg space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2
                id="how-it-works-title"
                className="font-display text-xl font-bold text-slate-900"
              >
                How It Works
              </h2>
              <button
                type="button"
                onClick={() => setShowHowItWorks(false)}
                aria-label="Close How It Works"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-lg p-4 bg-white">
                <span className="inline-block bg-[#cce5ff] text-[#1e3a8a] font-mono-tabular text-xs font-semibold px-2 py-0.5 rounded-md mb-2">
                  01. Drop &amp; Straighten
                </span>
                <h3 className="font-display font-semibold text-sm text-slate-900">
                  Auto-Oriented Photos
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Drop smartphone snaps or screenshots. Sideways pages automatically rotate upright
                  before analysis, with a manual Rotate button if needed.
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-4 bg-white">
                <span className="inline-block bg-[#f8d7da] text-[#881337] font-mono-tabular text-xs font-semibold px-2 py-0.5 rounded-md mb-2">
                  02. Verbatim Capture
                </span>
                <h3 className="font-display font-semibold text-sm text-slate-900">
                  Mistakes, Diagrams &amp; Essays
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Student working and English essays are transcribed verbatim with red teacher
                  markings and SPaG/highlights preserved, while maths diagrams redraw as crisp
                  layered SVGs.
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-4 bg-white">
                <span className="inline-block bg-[#d4edda] text-[#14532d] font-mono-tabular text-xs font-semibold px-2 py-0.5 rounded-md mb-2">
                  03. Teach Live
                </span>
                <h3 className="font-display font-semibold text-sm text-slate-900">
                  Tablet Board &amp; Chat Copy
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Toggle Blank Retake Mode, copy questions straight to Teams/Zoom chat, or click{' '}
                  <strong>Open for tablet</strong> to write live on a pure-white A4 sheet.
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-4 bg-white">
                <span className="inline-block bg-[#fff3cd] text-[#713f12] font-mono-tabular text-xs font-semibold px-2 py-0.5 rounded-md mb-2">
                  04. Print &amp; Share
                </span>
                <h3 className="font-display font-semibold text-sm text-slate-900">
                  A4 Print &amp; Exports
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Download PNG/JPG snapshots from the tablet view, export a standalone HTML file, or
                  click <strong>Print Worksheet</strong> for a clean A4 tab with colours preserved.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Open for tablet — Full-Screen Pure-White A4 Pen-Tablet Whiteboard */}
      {activeTabletQuestion && (
        <WhiteboardModal
          question={activeTabletQuestion}
          blankRetakeMode={blankRetakeMode}
          onClose={() => setActiveTabletQuestion(null)}
        />
      )}
    </div>
  );
}
