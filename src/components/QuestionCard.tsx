import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Image as ImageIcon, Tablet } from 'lucide-react';
import { DigitizedQuestion, UploadedPage } from '../types';
import {
  htmlToReadableText,
  sanitizeDiagramSvg,
  sanitizeMathHtml,
} from '../utils/mathFormatting';

interface QuestionCardProps {
  question: DigitizedQuestion;
  sourcePage?: UploadedPage;
  showAnswers: boolean;
  showDiagnostic: boolean;
  blankRetakeMode: boolean;
  onUpdateLiveNotes: (id: string, notes: string) => void;
  onOpenTablet: (question: DigitizedQuestion) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  sourcePage,
  showAnswers,
  showDiagnostic,
  blankRetakeMode,
  onUpdateLiveNotes,
  onOpenTablet,
}) => {
  const [copiedTarget, setCopiedTarget] = useState<'question' | 'solution' | null>(null);
  const [showFullSource, setShowFullSource] = useState(false);
  const notesRef = useRef<HTMLDivElement | null>(null);

  const safeQuestionHtml = useMemo(
    () => sanitizeMathHtml(question.questionTextHTML),
    [question.questionTextHTML],
  );
  const safeStudentHtml = useMemo(
    () => sanitizeMathHtml(question.studentWorkingHTML),
    [question.studentWorkingHTML],
  );
  const safeSolutionHtml = useMemo(
    () => sanitizeMathHtml(question.modelSolutionHTML),
    [question.modelSolutionHTML],
  );
  const safeDiagnosticHtml = useMemo(
    () => sanitizeMathHtml(question.diagnosticTag),
    [question.diagnosticTag],
  );
  const safePastoralHtml = useMemo(
    () => sanitizeMathHtml(question.pastoralNotes),
    [question.pastoralNotes],
  );
  const safeDiagramSvg = useMemo(
    () => sanitizeDiagramSvg(question.diagramSVG),
    [question.diagramSVG],
  );

  const isEnglish = question.subject === 'english';
  const hasStudentWork = safeStudentHtml.trim().length > 0;
  const showColumn2 = hasStudentWork || blankRetakeMode;

  useEffect(() => {
    if (notesRef.current && notesRef.current.innerText !== question.liveNotes) {
      notesRef.current.innerText = question.liveNotes;
    }
  }, [question.id]);

  const handleCopyForChat = async (kind: 'question' | 'solution') => {
    const text =
      kind === 'question'
        ? `${question.questionNumber ? `${question.questionNumber}: ` : ''}${htmlToReadableText(question.questionTextHTML)}`
        : `${question.questionNumber ? `${question.questionNumber} Solution:\n` : ''}${htmlToReadableText(question.modelSolutionHTML)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(kind);
      window.setTimeout(() => setCopiedTarget(null), 1600);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <article className="question-card bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Card Header — Pastel UI chrome on screen, pure white on print */}
      <header className="question-card-header bg-[#f8fafc] border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-bold text-sm text-[#1e3a8a] bg-[#cce5ff] px-2.5 py-1 rounded-md whitespace-nowrap tutor-chrome-tint">
            {question.questionNumber || (isEnglish ? 'Task' : 'Question')}
          </span>
          {!blankRetakeMode && question.marks && (
            <span className="font-mono-tabular text-xs font-medium text-slate-600 whitespace-nowrap">
              Score: {question.marks}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => handleCopyForChat('question')}
            title={
              isEnglish
                ? 'Copy prompt or question text for Teams or Zoom chat'
                : 'Copy clean question text for Teams or Zoom chat'
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedTarget === 'question' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                {isEnglish ? 'Copied Prompt' : 'Copied Question'}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                {isEnglish ? 'Copy Prompt' : 'Copy Question'}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleCopyForChat('solution')}
            title={
              isEnglish
                ? 'Copy model response and feedback for Teams or Zoom chat'
                : 'Copy step-by-step solution for Teams or Zoom chat'
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedTarget === 'solution' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                {isEnglish ? 'Copied Model' : 'Copied Solution'}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                {isEnglish ? 'Copy Model' : 'Copy Solution'}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onOpenTablet(question)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#cce5ff] hover:bg-[#b8daff] text-[#1e3a8a] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Tablet className="w-3.5 h-3.5" />
            Open for tablet
          </button>
        </div>
      </header>

      {/* Adaptive Sprint Body: Pure white surfaces for Question & Student Work */}
      <div
        className={`question-card-grid grid grid-cols-1 ${
          showColumn2 ? 'lg:grid-cols-12 print-cols-3' : 'lg:grid-cols-2 print-cols-2'
        }`}
      >
        {/* Column 1: Question & Auto-Cropped Diagram (Pure White #ffffff) */}
        <section
          className={`question-col-1 bg-white p-5 border-b lg:border-b-0 lg:border-r border-slate-200 ${
            showColumn2 ? 'lg:col-span-4' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-display text-xs font-semibold text-slate-500">
              {isEnglish
                ? safeDiagramSvg || question.croppedDiagramUrl
                  ? 'Prompt & Stimulus'
                  : 'Task / Question'
                : 'Question & Diagram'}
            </h3>
            {sourcePage && (
              <button
                type="button"
                onClick={() => setShowFullSource((v) => !v)}
                className="no-print inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 whitespace-nowrap cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {showFullSource ? 'Hide Source Page' : 'View Source Page'}
              </button>
            )}
          </div>

          <div
            className="essay-prose text-[15px] leading-relaxed text-slate-900 bg-white print:text-[13px] print:leading-normal"
            dangerouslySetInnerHTML={{ __html: safeQuestionHtml }}
          />

          {safeDiagramSvg ? (
            <div
              className="diagram-print-block diagram-svg-container mt-4 bg-white border border-slate-200 rounded-lg p-3"
              dangerouslySetInnerHTML={{ __html: safeDiagramSvg }}
            />
          ) : (
            question.croppedDiagramUrl && (
              <div className="diagram-print-block mt-4 bg-white border border-slate-200 rounded-lg p-3">
                <img
                  src={question.croppedDiagramUrl}
                  alt={`Cropped diagram for ${question.questionNumber}`}
                  referrerPolicy="no-referrer"
                  className="max-h-60 max-w-full object-contain mx-auto block"
                />
              </div>
            )
          )}

          {showFullSource && sourcePage && (
            <div className="no-print mt-3 bg-white border border-slate-200 rounded-lg p-2">
              <img
                src={sourcePage.orientedDataUrl}
                alt={sourcePage.fileName}
                referrerPolicy="no-referrer"
                className="max-h-80 w-full object-contain mx-auto block"
              />
            </div>
          )}
        </section>

        {/* Column 2: Student Attempt & Marking OR Blank Retake Writing Space (Pure White #ffffff) */}
        {showColumn2 && (
          <section className="question-col-2 bg-white p-5 border-b lg:border-b-0 lg:border-r border-slate-200 lg:col-span-4">
            <h3 className="font-display text-xs font-semibold text-slate-500 mb-3">
              {blankRetakeMode
                ? 'Student Writing Space'
                : isEnglish
                  ? 'Student Writing & Marking'
                  : 'Student Attempt & Marking'}
            </h3>

            {blankRetakeMode ? (
              <div
                className="retake-ruled-pad border border-slate-200 rounded-lg p-3"
                aria-label="Blank student writing area"
              />
            ) : (
              <div
                className="essay-prose text-[15px] leading-relaxed text-slate-900 bg-white print:text-[13px] print:leading-normal"
                dangerouslySetInnerHTML={{ __html: safeStudentHtml }}
              />
            )}
          </section>
        )}

        {/* Column 3: Tutor Dashboard (Hidden on Print when Blank Retake Mode is active) */}
        <section
          className={`question-col-3 bg-white p-5 ${
            showColumn2 ? 'lg:col-span-4' : ''
          } ${blankRetakeMode ? 'print:hidden' : ''}`}
        >
          <h3 className="font-display text-xs font-semibold text-slate-500 mb-3">
            Tutor Dashboard
          </h3>

          <div className="space-y-3">
            {showDiagnostic && safeDiagnosticHtml.trim() !== '' && (
              <div className="diagnostic-print-block tutor-chrome-tint bg-[#f8d7da]/85 border border-[#f1aeb5] text-[#881337] rounded-lg px-3 py-2 text-sm print:text-[12.5px] leading-snug">
                <span className="font-semibold">Diagnostic: </span>
                <span dangerouslySetInnerHTML={{ __html: safeDiagnosticHtml }} />
              </div>
            )}

            {safePastoralHtml.trim() !== '' && (
              <div className="pastoral-print-block tutor-chrome-tint bg-[#fff3cd]/85 border border-[#ffe69c] text-[#713f12] rounded-lg px-3 py-2 text-sm print:text-[12.5px] leading-snug">
                <span className="font-semibold">Margin Note: </span>
                <span dangerouslySetInnerHTML={{ __html: safePastoralHtml }} />
              </div>
            )}

            {showAnswers && (
              <div className="solution-print-block border border-[#bbf7d0] rounded-lg p-3 bg-white">
                <div className="tutor-chrome-tint inline-block bg-[#d4edda] text-[#14532d] text-xs font-semibold px-2.5 py-1 rounded-md mb-2">
                  {isEnglish ? 'Model Answer & Feedback' : 'Step-by-Step Model Solution'}
                </div>
                <div
                  className="essay-prose text-[15px] leading-relaxed text-slate-900 bg-white print:text-[13px] print:leading-normal"
                  dangerouslySetInnerHTML={{ __html: safeSolutionHtml }}
                />
              </div>
            )}

            <div className="border border-[#fde68a] rounded-lg p-3 bg-white no-print">
              <div className="tutor-chrome-tint inline-block bg-[#fff3cd] text-[#713f12] text-xs font-semibold px-2 py-0.5 rounded-md mb-2">
                Live Notes
              </div>
              <div
                ref={notesRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) =>
                  onUpdateLiveNotes(question.id, e.currentTarget.innerText)
                }
                data-placeholder="Type live notes here..."
                className="live-notes min-h-[60px] text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#cce5ff] rounded-md p-1"
              />
            </div>

            {question.liveNotes.trim() !== '' && (
              <div className="notes-print-block hidden print:block border border-[#fde68a] rounded-lg p-3 bg-white">
                <div className="inline-block bg-[#fff3cd] text-[#713f12] text-xs font-semibold px-2 py-0.5 rounded-md mb-1.5">
                  Live Notes
                </div>
                <div className="text-xs text-slate-900 whitespace-pre-wrap">
                  {question.liveNotes}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </article>
  );
};
