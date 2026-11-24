import { DigitizedQuestion } from '../types';
import { htmlToReadableText, sanitizeDiagramSvg, sanitizeMathHtml } from './mathFormatting';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateWhiteboardTabHtml(
  question: DigitizedQuestion,
  options?: { blankRetakeMode?: boolean },
): string {
  const safeNum = escapeHtml(question.questionNumber || 'Question');
  const safeQuestionHtml = sanitizeMathHtml(question.questionTextHTML);
  const plainText = escapeHtml(htmlToReadableText(question.questionTextHTML));
  const cleanSvg = sanitizeDiagramSvg(question.diagramSVG);
  const blankRetake = Boolean(options?.blankRetakeMode);
  const svgForDataUri = cleanSvg
    ? blankRetake
      ? cleanSvg.replace(
          /(<svg\b[^>]*>)/i,
          '$1<style>.student-diagram-layer,.teacher-diagram-layer{display:none;}</style>',
        )
      : cleanSvg
    : '';

  const diagramBlock = cleanSvg
    ? `<div class="diagram-svg-box" style="margin-top:12px; padding:8px; border:1px solid #e2e8f0; border-radius:6px; background:#fff; max-width:380px;">${cleanSvg}</div>`
    : question.croppedDiagramUrl
      ? `<img id="wb-diagram" src="${question.croppedDiagramUrl}" alt="Question diagram" style="max-width:100%; max-height:220px; object-fit:contain; display:block; margin-top:12px; border:1px solid #e2e8f0; border-radius:6px; background:#fff;" />`
      : '';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeNum} — A4 Tablet Whiteboard</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f8f9fa; color: #0f172a; font-family: system-ui, -apple-system, sans-serif; }
  .toolbar {
    position: sticky; top: 0; z-index: 20;
    background: #ffffff; border-bottom: 1px solid #e2e8f0;
    padding: 10px 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
  }
  .group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  button {
    border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a;
    border-radius: 6px; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer;
    white-space: nowrap;
  }
  button:hover { background: #f1f5f9; }
  button.active { background: #cce5ff; border-color: #60a5fa; color: #1e3a8a; }
  button.primary { background: #cce5ff; border-color: #93c5fd; color: #1e3a8a; }
  .desk { padding: 20px 16px 48px; display: flex; justify-content: center; }
  .a4-sheet {
    position: relative; width: 794px; max-width: 100%; aspect-ratio: 210 / 297;
    background: #ffffff; border: 1px solid #cbd5e1; box-shadow: 0 4px 20px rgba(15,23,42,0.06);
    overflow: hidden;
  }
  .sheet-header {
    padding: 36px 46px 16px; border-bottom: 1px solid #e2e8f0; background: #ffffff;
    pointer-events: none; user-select: none;
  }
  .q-title { font-size: 20px; font-weight: 700; margin: 0 0 8px; color: #0f172a; }
  .q-body { font-size: 15px; line-height: 1.55; color: #1e293b; }
  canvas#ink {
    position: absolute; inset: 0; width: 100%; height: 100%;
    touch-action: none; cursor: crosshair; z-index: 5;
  }
  .frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 3px; font-size: 0.88em; line-height: 1.1; }
  .frac-num { border-bottom: 1.5px solid currentColor; padding: 0 3px 1px; }
  .frac-den { padding: 1px 3px 0; }
  .diagram-svg-box svg { width: 100%; max-height: 220px; height: auto; display: block; }
  body.retake-mode .student-diagram-layer, body.retake-mode .teacher-diagram-layer { display: none; }
  @media print {
    .toolbar { display: none !important; }
    .desk { padding: 0 !important; background: #ffffff !important; }
    .a4-sheet { border: none !important; box-shadow: none !important; width: 100% !important; }
  }
</style>
</head>
<body class="${blankRetake ? 'retake-mode' : ''}">
  <div class="toolbar">
    <div class="group">
      <strong style="font-size:14px;">${safeNum} · Tablet Board</strong>
      <button type="button" class="tool active" data-tool="pen" data-color="#0f172a">Black Pen</button>
      <button type="button" class="tool" data-tool="pen" data-color="#dc2626">Red Pen</button>
      <button type="button" class="tool" data-tool="pen" data-color="#2563eb">Blue Pen</button>
      <button type="button" class="tool" data-tool="highlighter" data-color="rgba(250, 204, 21, 0.38)">Highlighter</button>
      <button type="button" class="tool" data-tool="eraser" data-color="#ffffff">Eraser</button>
    </div>
    <div class="group">
      <button type="button" id="undo-btn">Undo</button>
      <button type="button" id="clear-btn">Clear</button>
      <button type="button" class="primary" id="dl-png">Download PNG</button>
      <button type="button" class="primary" id="dl-jpg">Download JPG</button>
      <button type="button" onclick="window.print()">Print A4</button>
    </div>
  </div>
  <div class="desk">
    <div class="a4-sheet" id="a4-sheet">
      <div class="sheet-header">
        <div class="q-title">${safeNum}</div>
        <div class="q-body">${safeQuestionHtml}</div>
        ${diagramBlock}
      </div>
      <canvas id="ink" width="1588" height="2246"></canvas>
    </div>
  </div>
  <script>
    (function() {
      const canvas = document.getElementById('ink');
      const ctx = canvas.getContext('2d');
      const plainQuestion = ${JSON.stringify(plainText)};
      const qTitle = ${JSON.stringify(question.questionNumber || 'Question')};
      const svgDataUri = ${JSON.stringify(svgForDataUri ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgForDataUri) : '')};
      const diagSrc = ${JSON.stringify(question.croppedDiagramUrl || '')};

      let tool = 'pen';
      let color = '#0f172a';
      let strokes = [];
      let activeStroke = null;

      function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const s of strokes) {
          drawStroke(s);
        }
      }

      function drawStroke(s) {
        if (!s.points.length) return;
        ctx.save();
        if (s.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
          ctx.lineWidth = 34;
        } else if (s.tool === 'highlighter') {
          ctx.globalCompositeOperation = 'multiply';
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 34;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 4.5;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        if (s.points.length === 1) {
          ctx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
        }
        ctx.stroke();
        ctx.restore();
      }

      function getPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: ((e.clientX - rect.left) / rect.width) * canvas.width,
          y: ((e.clientY - rect.top) / rect.height) * canvas.height
        };
      }

      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        activeStroke = { tool, color, points: [getPoint(e)] };
        strokes.push(activeStroke);
        redraw();
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!activeStroke) return;
        activeStroke.points.push(getPoint(e));
        redraw();
      });

      canvas.addEventListener('pointerup', () => { activeStroke = null; });
      canvas.addEventListener('pointercancel', () => { activeStroke = null; });

      document.querySelectorAll('.tool').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tool').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          tool = btn.getAttribute('data-tool');
          color = btn.getAttribute('data-color');
        });
      });

      document.getElementById('undo-btn').addEventListener('click', () => {
        strokes.pop();
        redraw();
      });

      document.getElementById('clear-btn').addEventListener('click', () => {
        strokes = [];
        redraw();
      });

      function wrapLines(c, text, maxW) {
        const out = [];
        for (const p of text.split('\\n')) {
          if (!p.trim()) { out.push(''); continue; }
          let cur = '';
          for (const w of p.split(/\\s+/)) {
            const t = cur ? cur + ' ' + w : w;
            if (c.measureText(t).width > maxW && cur) { out.push(cur); cur = w; }
            else cur = t;
          }
          if (cur) out.push(cur);
        }
        return out;
      }

      function exportImage(fmt) {
        const out = document.createElement('canvas');
        out.width = 1588; out.height = 2246;
        const c = out.getContext('2d');
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, out.width, out.height);
        const padX = 92;
        c.fillStyle = '#0f172a';
        c.font = '700 38px system-ui, sans-serif';
        c.fillText(qTitle, padX, 114);
        c.fillStyle = '#1e293b';
        c.font = '400 30px system-ui, sans-serif';
        let y = 172;
        for (const line of wrapLines(c, plainQuestion, out.width - padX * 2).slice(0, 12)) {
          c.fillText(line, padX, y);
          y += 42;
        }
        const finish = (bottomY) => {
          c.strokeStyle = '#e2e8f0';
          c.lineWidth = 2;
          c.beginPath(); c.moveTo(padX, bottomY); c.lineTo(out.width - padX, bottomY); c.stroke();
          c.drawImage(canvas, 0, 0);
          const a = document.createElement('a');
          a.href = out.toDataURL(fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.94);
          a.download = 'ScreenToSheet-' + qTitle.replace(/[^a-zA-Z0-9_-]+/g, '-') + '.' + fmt;
          a.click();
        };
        const srcToDraw = svgDataUri || diagSrc;
        if (srcToDraw) {
          const tmpImg = new Image();
          tmpImg.onload = () => {
            const maxW = out.width - padX * 2;
            const maxH = 380;
            const nw = tmpImg.naturalWidth || 480;
            const nh = tmpImg.naturalHeight || 300;
            const s = Math.min(maxW / nw, maxH / nh, svgDataUri ? 2.5 : 1);
            const dw = Math.round(nw * s);
            const dh = Math.round(nh * s);
            c.drawImage(tmpImg, padX, y + 16, dw, dh);
            finish(y + 16 + dh + 24);
          };
          tmpImg.onerror = () => finish(y + 16);
          tmpImg.src = srcToDraw;
        } else {
          finish(y + 16);
        }
      }

      document.getElementById('dl-png').addEventListener('click', () => exportImage('png'));
      document.getElementById('dl-jpg').addEventListener('click', () => exportImage('jpg'));
    })();
  </script>
</body>
</html>`;
}

export function generateStandaloneWorksheetHtml(
  questions: DigitizedQuestion[],
  options: { showAnswers: boolean; showDiagnostic: boolean; blankRetakeMode: boolean },
): string {
  const serializedQuestions = JSON.stringify(
    questions.map((q) => ({
      ...q,
      questionTextHTML: sanitizeMathHtml(q.questionTextHTML),
      studentWorkingHTML: sanitizeMathHtml(q.studentWorkingHTML),
      modelSolutionHTML: sanitizeMathHtml(q.modelSolutionHTML),
      plainQuestionText: htmlToReadableText(q.questionTextHTML),
      plainSolutionText: htmlToReadableText(q.modelSolutionHTML),
    })),
  );

  const cardsHtml = questions
    .map((q, idx) => {
      const qHtml = sanitizeMathHtml(q.questionTextHTML);
      const sHtml = sanitizeMathHtml(q.studentWorkingHTML);
      const solHtml = sanitizeMathHtml(q.modelSolutionHTML);
      const diagHtml = sanitizeMathHtml(q.diagnosticTag);
      const pastoralHtml = sanitizeMathHtml(q.pastoralNotes);
      const cleanSvg = sanitizeDiagramSvg(q.diagramSVG);
      const hasStudentWork = Boolean(sHtml.trim());
      const isEnglish = q.subject === 'english';
      const col1Title = isEnglish
        ? cleanSvg || q.croppedDiagramUrl
          ? 'Prompt &amp; Stimulus'
          : 'Task / Question'
        : 'Question &amp; Diagram';
      const attemptLabel = isEnglish
        ? 'Student Writing &amp; Marking'
        : 'Student Attempt &amp; Marking';
      const modelTitle = isEnglish
        ? 'Model Answer &amp; Feedback'
        : 'Step-by-Step Model Solution';

      return `
      <article class="card" data-idx="${idx}">
        <header class="card-header">
          <div class="card-title-row">
            <span class="q-num">${escapeHtml(q.questionNumber || (isEnglish ? `Task ${idx + 1}` : `Q${idx + 1}`))}</span>
            ${q.marks ? `<span class="q-marks marks-badge">Score: ${escapeHtml(q.marks)}</span>` : ''}
          </div>
          <div class="card-actions no-print">
            <button type="button" class="btn-soft" onclick="copyChat(${idx}, 'question', this)">${isEnglish ? 'Copy Prompt' : 'Copy Question'}</button>
            <button type="button" class="btn-soft" onclick="copyChat(${idx}, 'solution', this)">${isEnglish ? 'Copy Model' : 'Copy Solution'}</button>
            <button type="button" class="btn-blue" onclick="openTablet(${idx})">Open for tablet</button>
          </div>
        </header>
        <div class="card-grid ${!hasStudentWork ? 'no-student-work' : ''}">
          <section class="col col-1">
            <div class="col-label">${col1Title}</div>
            <div class="math-body">${qHtml}</div>
            ${
              cleanSvg
                ? `<div class="diagram-box diagram-svg-box">${cleanSvg}</div>`
                : q.croppedDiagramUrl
                  ? `<div class="diagram-box"><img src="${q.croppedDiagramUrl}" alt="Diagram for ${escapeHtml(q.questionNumber)}" /></div>`
                  : ''
            }
          </section>
          <section class="col col-2 ${!hasStudentWork ? 'empty-original-work' : ''}">
            <div class="col-label student-work-label">
              <span class="label-attempt">${attemptLabel}</span>
              <span class="label-retake">Student Writing Space</span>
            </div>
            <div class="student-work-content">
              ${hasStudentWork ? `<div class="math-body">${sHtml}</div>` : '<p class="muted-note">No written attempt on uploaded page.</p>'}
            </div>
            <div class="retake-pad" aria-hidden="true"></div>
          </section>
          <section class="col col-3 tutor-panel">
            <div class="col-label">Tutor Dashboard</div>
            ${diagHtml.trim() ? `<div class="diag-box"><strong>Diagnostic:</strong> ${diagHtml}</div>` : ''}
            ${pastoralHtml.trim() ? `<div class="pastoral-box"><strong>Margin Note:</strong> ${pastoralHtml}</div>` : ''}
            <div class="solution-box">
              <div class="sol-title">${modelTitle}</div>
              <div class="math-body">${solHtml}</div>
            </div>
            <div class="notes-wrap">
              <div class="notes-title">Live Notes</div>
              <div contenteditable="true" class="live-notes" data-placeholder="Type live notes here...">${escapeHtml(q.liveNotes || '')}</div>
            </div>
          </section>
        </div>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Screen To Sheet — Exported Worksheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..600;1,9..40,400..600&family=IBM+Plex+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --font-display: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
    --font-body: "DM Sans", system-ui, -apple-system, sans-serif;
    --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #f8f9fa; color: #0f172a;
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
  }
  .topbar {
    position: sticky; top: 0; z-index: 30;
    background: #ffffff; border-bottom: 1px solid #e2e8f0;
    padding: 12px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  }
  .brand-block { display: flex; flex-direction: column; gap: 2px; }
  .brand { font-family: var(--font-display); font-weight: 700; font-size: 17px; color: #0f172a; }
  .print-hint { font-size: 12px; color: #64748b; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; }
  button {
    font-family: var(--font-body);
    border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a;
    padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
    white-space: nowrap;
  }
  button:hover { background: #f1f5f9; }
  button.active-mint { background: #d4edda; border-color: #86efac; color: #14532d; }
  button.active-pink { background: #f8d7da; border-color: #f1aeb5; color: #881337; }
  button.active-blue { background: #cce5ff; border-color: #93c5fd; color: #1e3a8a; }
  button.btn-print { background: #fff3cd; border-color: #fde68a; color: #713f12; }
  button.btn-print:hover { background: #ffe69c; }
  .btn-blue { background: #cce5ff; border-color: #93c5fd; color: #1e3a8a; padding: 6px 12px; font-size: 12px; }
  .btn-soft { padding: 6px 10px; font-size: 12px; border-color: #e2e8f0; color: #334155; font-weight: 500; }
  .wrap { max-width: 1360px; margin: 24px auto; padding: 0 24px 60px; }
  .card {
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
    margin-bottom: 20px; overflow: hidden;
  }
  .card-header {
    background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    padding: 12px 20px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  }
  .card-title-row { display: flex; align-items: center; gap: 12px; }
  .q-num {
    font-family: var(--font-display); font-weight: 700; font-size: 14px;
    color: #1e3a8a; background: #cce5ff; padding: 4px 10px; border-radius: 6px;
  }
  .q-marks { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 500; color: #475569; }
  .card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: stretch; }
  .card-grid.no-student-work { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .empty-original-work { display: none; }
  body.retake-mode .card-grid.no-student-work { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  body.retake-mode .empty-original-work { display: block; }
  .col { padding: 20px; background: #ffffff; min-width: 0; overflow-wrap: break-word; word-break: break-word; }
  .col-1, .col-2 { border-right: 1px solid #e2e8f0; background: #ffffff; }
  .col-label { font-family: var(--font-display); font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 12px; }
  .label-retake { display: none; }
  body.retake-mode .label-attempt { display: none; }
  body.retake-mode .label-retake { display: inline; }
  .math-body { font-size: 15px; line-height: 1.625; color: #0f172a; }
  .math-body p + p { margin-top: 0.6em; }
  .math-body s, .math-body del { color: #64748b; text-decoration: line-through; }
  .diagram-box { margin-top: 16px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; }
  .diagram-box img { max-width: 100%; max-height: 240px; object-fit: contain; display: block; margin: 0 auto; }
  .diagram-svg-box svg { width: 100%; max-width: 100%; max-height: 240px; height: auto; display: block; margin: 0 auto; }
  .teacher-red { color: #dc2626; font-weight: 600; }
  .highlight-pastel { background-color: #fef08a; color: #1e293b; padding: 0 3px; border-radius: 2px; }
  .frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 3px; font-size: 0.88em; line-height: 1.1; }
  .frac-num { border-bottom: 1.5px solid currentColor; padding: 0 3px 1px; }
  .frac-den { padding: 1px 3px 0; }
  .diag-box {
    background: rgba(248, 215, 218, 0.85); color: #881337; border: 1px solid #f1aeb5;
    padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 1.375; margin-bottom: 12px;
  }
  .pastoral-box {
    background: rgba(255, 243, 205, 0.85); color: #713f12; border: 1px solid #ffe69c;
    padding: 8px 12px; border-radius: 8px; font-size: 14px; line-height: 1.375; margin-bottom: 12px;
  }
  .solution-box { border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #ffffff; }
  .sol-title {
    font-size: 12px; font-weight: 600; color: #14532d; background: #d4edda;
    padding: 4px 10px; border-radius: 6px; display: inline-block; margin-bottom: 8px;
  }
  .notes-wrap { border: 1px solid #fde68a; border-radius: 8px; padding: 12px; background: #ffffff; }
  .notes-title {
    font-size: 12px; font-weight: 600; color: #713f12; background: #fff3cd;
    padding: 2px 8px; border-radius: 6px; display: inline-block; margin-bottom: 8px;
  }
  .live-notes { min-height: 60px; font-size: 14px; color: #1e293b; outline: none; line-height: 1.5; }
  .live-notes:empty::before { content: attr(data-placeholder); color: #94a3b8; }
  .muted-note { color: #64748b; font-size: 13px; font-style: italic; }
  .retake-pad {
    display: none; min-height: 180px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;
    background-image: repeating-linear-gradient(to bottom, transparent, transparent 31px, #e2e8f0 31px, #e2e8f0 32px);
  }
  body.hide-answers .solution-box { display: none; }
  body.hide-diagnostic .diag-box { display: none; }
  body.retake-mode .marks-badge { display: none; }
  body.retake-mode .student-work-content { display: none; }
  body.retake-mode .retake-pad { display: block; }
  body.retake-mode .student-diagram-layer, body.retake-mode .teacher-diagram-layer { display: none; }
  @media screen and (max-width: 720px) {
    .card-grid,
    .card-grid.no-student-work,
    body.retake-mode .card-grid.no-student-work { grid-template-columns: 1fr; }
    .col-1, .col-2 { border-right: none; border-bottom: 1px solid #e2e8f0; }
  }
  /* Pre-built UK A4 print sheet pagination (hidden on screen, active on print) */
  #a4-print-root { display: none; }
  .a4-print-ctx {
    --font-display: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
    --font-body: "DM Sans", system-ui, -apple-system, sans-serif;
    --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
  }
  .a4-print-ctx .card {
    display: block;
    width: 100%;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    margin-bottom: 12px;
    overflow: visible;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .a4-print-ctx .card-header {
    display: block;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
    padding: 8px 14px;
  }
  .a4-print-ctx .card-actions { display: none; }
  .a4-print-ctx .q-num { background: #cce5ff; color: #1e3a8a; }
  .a4-print-ctx .card-grid {
    display: table;
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
  }
  .a4-print-ctx .col {
    display: table-cell;
    vertical-align: top;
    width: 33.3333%;
    min-width: 0;
    padding: 10px 12px;
    background: #ffffff;
    border-top: none;
    border-bottom: none;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .a4-print-ctx .card-grid.no-student-work .col,
  body.retake-mode .a4-print-ctx .card-grid .col,
  body.retake-mode .a4-print-ctx .card-grid.no-student-work .col {
    width: 50%;
  }
  .a4-print-ctx .col-1,
  .a4-print-ctx .col-2 { border-right: 1px solid #e2e8f0; }
  body.retake-mode .a4-print-ctx .col-2 { border-right: none; }
  .a4-print-ctx .col-label { margin-bottom: 8px; }
  .a4-print-ctx .math-body { font-size: 13px; line-height: 1.5; }
  .a4-print-ctx .diagram-svg-box svg,
  .a4-print-ctx .diagram-box img {
    max-width: 100%;
    max-height: 195px;
    height: auto;
  }
  .a4-print-ctx .diag-box {
    background: rgba(248, 215, 218, 0.85); color: #881337; border: 1px solid #f1aeb5;
    font-size: 12.5px; padding: 7px 10px; margin-bottom: 8px;
  }
  .a4-print-ctx .pastoral-box {
    background: rgba(255, 243, 205, 0.85); color: #713f12; border: 1px solid #ffe69c;
    font-size: 12.5px; padding: 7px 10px; margin-bottom: 8px;
  }
  .a4-print-ctx .sol-title { background: #d4edda; color: #14532d; }
  .a4-print-ctx .solution-box {
    border: 1px solid #bbf7d0; background: #ffffff; padding: 9px 10px; margin-bottom: 8px;
  }
  .a4-print-ctx .notes-wrap {
    border: 1px solid #fde68a; background: #ffffff; padding: 8px 10px;
  }
  .a4-print-ctx .notes-title { background: #fff3cd; color: #713f12; }
  .a4-print-ctx .live-notes { min-height: 0; font-size: 12px; }
  .a4-print-ctx .teacher-red { color: #dc2626; }
  .a4-print-ctx .highlight-pastel { background-color: #fef08a; color: #0f172a; }
  body.retake-mode .a4-print-ctx .tutor-panel { display: none; }
  .a4-print-ctx .empty-original-work { display: none; }
  body.retake-mode .a4-print-ctx .empty-original-work { display: table-cell; }

  .a4-print-page {
    position: relative;
    width: 190mm;
    height: 274mm;
    box-sizing: border-box;
    padding-bottom: 12mm;
    background: #ffffff;
  }
  .a4-print-page.oversized-page {
    height: auto;
    min-height: 274mm;
  }
  .a4-print-page.oversized-page .card {
    break-inside: auto;
    page-break-inside: auto;
  }
  .a4-print-page:not(:last-child) {
    break-after: page;
    page-break-after: always;
  }
  .a4-page-footer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 8mm;
    text-align: center;
    font-family: var(--font-body);
    font-size: 10.5px;
    font-weight: 500;
    color: #64748b;
    line-height: 8mm;
  }

  @page {
    size: A4 portrait;
    margin: 10mm;
  }
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    .no-print, .topbar, main.wrap { display: none !important; }
    #a4-print-root { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
  }
</style>
</head>
<body class="${!options.showAnswers ? 'hide-answers' : ''} ${!options.showDiagnostic ? 'hide-diagnostic' : ''} ${options.blankRetakeMode ? 'retake-mode' : ''}">
  <div class="topbar no-print">
    <div class="brand-block">
      <div class="brand">Screen To Sheet · Worksheet &amp; Print View</div>
      <div class="print-hint">Use <strong>Print A4 Worksheet</strong> or press Ctrl+P / Cmd+P to print or save as PDF (this bar hides automatically).</div>
    </div>
    <div class="controls">
      <button type="button" id="toggle-answers" class="${options.showAnswers ? 'active-mint' : ''}" onclick="toggleAnswers()">${options.showAnswers ? 'Hide Solution' : 'Reveal Solution'}</button>
      <button type="button" id="toggle-diagnostic" class="${options.showDiagnostic ? 'active-pink' : ''}" onclick="toggleDiagnostic()">${options.showDiagnostic ? 'Hide Diagnostic' : 'Show Diagnostic'}</button>
      <button type="button" id="toggle-retake" class="${options.blankRetakeMode ? 'active-blue' : ''}" onclick="toggleRetake()">Blank Retake Mode</button>
      <button type="button" class="btn-print" onclick="printWorksheet()">Print A4 Worksheet</button>
    </div>
  </div>
  <main class="wrap">${cardsHtml}</main>
  <div id="a4-print-root" class="a4-print-ctx" aria-hidden="true"></div>
  <script>
    const QUESTIONS = ${serializedQuestions};

    function measureMmUnitPx() {
      const ruler = document.createElement('div');
      ruler.style.cssText = 'position:fixed;left:-9999px;top:0;width:100mm;height:100mm;visibility:hidden;pointer-events:none;';
      document.body.appendChild(ruler);
      const pxPerMm = ruler.getBoundingClientRect().height / 100 || 3.7795;
      document.body.removeChild(ruler);
      return pxPerMm;
    }

    function preparePrintCardClone(card, idx) {
      const clone = card.cloneNode(true);
      const srcNotes = card.querySelector('.live-notes');
      const dstNotes = clone.querySelector('.live-notes');
      const notesWrap = clone.querySelector('.notes-wrap');
      const noteText = srcNotes ? srcNotes.innerText.trim() : '';
      if (dstNotes) {
        dstNotes.removeAttribute('contenteditable');
        dstNotes.removeAttribute('data-placeholder');
        dstNotes.textContent = srcNotes ? srcNotes.innerText : '';
      }
      if (!noteText && notesWrap) {
        notesWrap.remove();
      }
      // Namespace SVG IDs inside print clones so marker/clipPath references never collide with hidden screen cards
      const svgs = clone.querySelectorAll('svg');
      svgs.forEach((svg, sIdx) => {
        const pfx = 'pr' + idx + '_' + sIdx + '_';
        const raw = svg.outerHTML
          .replace(/id=(["'])([^"']+)\\1/g, 'id=$1' + pfx + '$2$1')
          .replace(/url\\(#([^)]+)\\)/g, 'url(#' + pfx + '$1)');
        const tmp = document.createElement('div');
        tmp.innerHTML = raw;
        if (tmp.firstElementChild) {
          svg.replaceWith(tmp.firstElementChild);
        }
      });
      return clone;
    }

    function rebuildPrintPages() {
      const printRoot = document.getElementById('a4-print-root');
      const wrap = document.querySelector('main.wrap');
      if (!printRoot || !wrap) return;

      const sourceCards = Array.from(wrap.querySelectorAll(':scope > .card'));
      if (sourceCards.length === 0) {
        printRoot.innerHTML = '';
        return;
      }

      const pxPerMm = measureMmUnitPx();
      // 297mm UK A4 - 20mm page margins - 12mm reserved footer - 5mm safety buffer = ~260mm usable card height
      const maxPageBodyPx = 259 * pxPerMm;
      const cardGapPx = 12;

      const measurer = document.createElement('div');
      measurer.className = 'a4-print-ctx';
      measurer.style.cssText = 'position:fixed;left:-99999px;top:0;width:190mm;visibility:hidden;pointer-events:none;background:#fff;';
      document.body.appendChild(measurer);

      const clones = sourceCards.map((card, idx) => {
        const clone = preparePrintCardClone(card, idx);
        measurer.appendChild(clone);
        return clone;
      });

      const heights = clones.map((clone) => Math.ceil(clone.getBoundingClientRect().height));
      document.body.removeChild(measurer);

      const pages = [];
      let currentGroup = [];
      let currentHeight = 0;

      clones.forEach((clone, i) => {
        const h = heights[i];
        const addedHeight = currentGroup.length === 0 ? h : currentHeight + cardGapPx + h;
        if (currentGroup.length > 0 && addedHeight > maxPageBodyPx) {
          pages.push({ cards: currentGroup, oversized: false });
          currentGroup = [clone];
          currentHeight = h;
        } else {
          currentGroup.push(clone);
          currentHeight = addedHeight;
        }
      });
      if (currentGroup.length > 0) {
        pages.push({ cards: currentGroup, oversized: currentGroup.length === 1 && currentHeight > maxPageBodyPx });
      }

      printRoot.innerHTML = '';
      const totalPages = pages.length;
      pages.forEach((pg, pageIdx) => {
        const pageEl = document.createElement('section');
        pageEl.className = 'a4-print-page' + (pg.oversized ? ' oversized-page' : '');
        const bodyEl = document.createElement('div');
        bodyEl.className = 'a4-page-body';
        pg.cards.forEach((c, cIdx) => {
          if (cIdx === pg.cards.length - 1) c.style.marginBottom = '0';
          bodyEl.appendChild(c);
        });
        const footerEl = document.createElement('footer');
        footerEl.className = 'a4-page-footer';
        footerEl.textContent = 'Page ' + (pageIdx + 1) + ' of ' + totalPages;
        pageEl.appendChild(bodyEl);
        pageEl.appendChild(footerEl);
        printRoot.appendChild(pageEl);
      });
    }

    function printWorksheet() {
      rebuildPrintPages();
      window.print();
    }

    function toggleAnswers() {
      const hidden = document.body.classList.toggle('hide-answers');
      const btn = document.getElementById('toggle-answers');
      btn.textContent = hidden ? 'Reveal Solution' : 'Hide Solution';
      btn.classList.toggle('active-mint', !hidden);
      rebuildPrintPages();
    }
    function toggleDiagnostic() {
      const hidden = document.body.classList.toggle('hide-diagnostic');
      const btn = document.getElementById('toggle-diagnostic');
      btn.textContent = hidden ? 'Show Diagnostic' : 'Hide Diagnostic';
      btn.classList.toggle('active-pink', !hidden);
      rebuildPrintPages();
    }
    function toggleRetake() {
      const on = document.body.classList.toggle('retake-mode');
      document.getElementById('toggle-retake').classList.toggle('active-blue', on);
      rebuildPrintPages();
    }
    function copyChat(idx, kind, btn) {
      const q = QUESTIONS[idx];
      if (!q) return;
      const text = kind === 'question'
        ? (q.questionNumber ? q.questionNumber + ': ' : '') + (q.plainQuestionText || '')
        : (q.questionNumber ? q.questionNumber + ' Solution:\\n' : '') + (q.plainSolutionText || '');
      navigator.clipboard.writeText(text).then(() => {
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = prev; }, 1400);
      });
    }
    function openTablet(idx) {
      const q = QUESTIONS[idx];
      if (!q) return;
      const retake = document.body.classList.contains('retake-mode');
      const win = window.open('', '_blank');
      if (!win) return;
      const diagHtml = q.diagramSVG
        ? '<div style="margin-top:16px;max-width:440px;">' + q.diagramSVG + '</div>'
        : (q.croppedDiagramUrl ? '<img src="' + q.croppedDiagramUrl + '" style="max-width:100%;margin-top:16px;" />' : '');
      const styleBlock = retake ? '<style>.student-diagram-layer,.teacher-diagram-layer{display:none;}</style>' : '';
      win.document.write('<!doctype html><html><head><title>' + (q.questionNumber || 'Question') + '</title>' + styleBlock + '</head><body style="font-family:system-ui;margin:24px;background:#fff;"><h2>' + (q.questionNumber || '') + '</h2><div>' + (q.questionTextHTML || '') + '</div>' + diagHtml + '</body></html>');
      win.document.close();
    }

    let notesTimer = null;
    document.addEventListener('input', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('live-notes')) {
        clearTimeout(notesTimer);
        notesTimer = setTimeout(rebuildPrintPages, 150);
      }
    });
    window.addEventListener('load', rebuildPrintPages);
    window.addEventListener('beforeprint', rebuildPrintPages);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(rebuildPrintPages);
    }
    rebuildPrintPages();
  </script>
</body>
</html>`;
}
