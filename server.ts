import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';
const LITE_MODEL_NAME = 'gemini-3.1-flash-lite';

const MATHS_SYSTEM_PROMPT = `You are an expert maths tutor digitising marked exam papers. Use UK English spelling throughout all generated notes, diagnostics, and solutions. Analyse the provided images. Group the content by question number. Deduplicate any overlapping photos.
Return a JSON array of objects. Each object must represent one question and contain:
- questionNumber: The question number or section label.
- marks: The score for this question (e.g., '1/4'). Return '' if no score is visible.
- questionTextHTML: Clean transcription of the printed or written question prompt itself. Format maths cleanly using HTML <sup>, <sub>, &radic;, and stacked CSS fractions (<span class='frac'><span class='frac-num'>a</span><span class='frac-den'>b</span></span>).
- sourceImageIndex: The 0-based integer index of the uploaded image where this question or its primary diagram appears.
- diagramBoundingBox: If this question includes a geometry diagram, graph, chart, or visual figure in that source image, return an array of 4 integers [ymin, xmin, ymax, xmax] scaled 0 to 1000 tightly bounding the diagram/figure (including its labels). If there is no diagram or figure, return an empty array [].
- diagramSVG: Whenever the question includes a geometric shape, graph, number line, chart, or teacher/student sketch, redraw it as a crisp, complete, self-contained inline <svg viewBox='0 0 240 150' ...>...</svg> string (adjusting viewBox proportions cleanly if taller/wider). Use single quotes inside ALL SVG attributes so the JSON never breaks. Inside SVG <text>, use plain Unicode symbols (√, °, ×, ÷, −, π, θ) instead of HTML entities like &radic; or &deg;, and always properly self-close empty tags (<line .../>, <path .../>). Separate the SVG into three semantic layers using <g> tags:
  1. Base Printed Diagram: Draw all printed shapes, axes, curves, ticks, and printed labels in clean black/dark-slate strokes (#1e293b) with white/transparent fills.
  2. <g class='student-diagram-layer'>: Preserve ALL student pencil additions drawn on top of the diagram (e.g., handwritten dimensions like '5x' or '2x', drawn lines/curves, shaded regions, extra labels), styled in slate-blue/pencil (#334155) with dashed strokes or hand-annotated styling so they are clearly distinguishable from the printed question.
  3. <g class='teacher-diagram-layer'>: Preserve ALL teacher pen sketches, correction curves, right-angle symbols, or arrows drawn near or on the diagram, styled in red (#dc2626) or green (#15803d).
  Always still populate diagramBoundingBox as a fallback, and return null for diagramSVG if the question has no diagram or cannot be redrawn cleanly.
- studentWorkingHTML: 100% VERBATIM transcription of the student's handwritten working. Do NOT fix their maths or spelling mistakes. Wrap teacher marks, ticks, crosses, and red corrections in <span class='teacher-red'>, and highlighted text in <mark class='highlight-pastel'>. Format maths cleanly using HTML <sup>, <sub>, &radic;, and CSS fractions (<span class='frac'><span class='frac-num'>a</span><span class='frac-den'>b</span></span>). Return '' if no student working is present on the page.
- diagnosticTag: A 1-sentence pinpoint of the student's core misconception in UK English (e.g., 'Confused circumference formula with area').
- modelSolutionHTML: A clean, step-by-step correct mathematical solution in UK English using HTML <sup>, <sub>, &radic;, <br>, and CSS fractions.
- pastoralNotes: Any margin notes, apologies, or emotional cues from the student or teacher. Return '' if none.`;

const ENGLISH_SYSTEM_PROMPT = `You are an expert English tutor digitising marked English exam papers, reading comprehensions, SPaG tasks, and handwritten or typed student essays. Use UK English spelling throughout all generated notes, diagnostics, and model answers. Analyse all provided images in natural paper/essay reading order, grouping multi-page continuations into a single entry where they belong to the same question or continuous essay, and deduplicating any overlapping photos.
Return a JSON array of objects. Each object must represent one question, task, or writing piece and contain:
- questionNumber: The question number, section label, or writing task heading (e.g., 'Q1', 'Q3(b)', 'Section B: Writing Task', or 'Essay' / 'Writing Piece' if a standalone student essay has no question number).
- marks: The score, mark, or grade visible (e.g., '3/4', '18/25', 'Grade 6'). Return '' if no score is visible.
- questionTextHTML: Clean transcription of the printed question, extract/stimulus prompt, or essay title/instructions. Format clearly using HTML <p>, <br>, <b>, <i>, <u>, <ul>, <ol>, and <li>. If the upload is a standalone student essay with no printed prompt shown, transcribe the student's written title if present, or write a concise editorial label such as '<i>Open writing piece (no printed prompt shown)</i>'.
- sourceImageIndex: The 0-based integer index of the uploaded image where this question or essay starts.
- diagramBoundingBox: If the question includes an actual printed visual stimulus (such as a photograph or illustration for a descriptive writing prompt, or a visual figure/chart), return [ymin, xmin, ymax, xmax] scaled 0 to 1000 tightly bounding that visual image. Otherwise return an empty array [].
- diagramSVG: Return null for English papers and essays (unless a literal simple geometric diagram is present).
- studentWorkingHTML: 100% VERBATIM transcription of the student's handwritten or typed response or essay. CRITICAL: Do NOT correct, polish, or normalise the student's spelling mistakes, grammar mistakes, punctuation omissions, comma splices, or phrasing—transcribe every error accurately so the tutor can teach from it. Preserve paragraph structure with <p>...</p> (or <br><br>), crossed-out student words with <s>...</s>, underlined words with <u>...</u>, teacher red-pen annotations, ticks, crosses, circled corrections, and SPaG margin codes (e.g., SP, P, G, ^, //) wrapped in <span class='teacher-red'>, and highlighted phrases wrapped in <mark class='highlight-pastel'>. Return '' if no student writing is present.
- diagnosticTag: A concise 1–2 sentence UK-English diagnostic summary highlighting key strengths and core English/literacy gaps (e.g., spelling, punctuation, tense consistency, sentence variety, quotation analysis, PEEL structure, or vocabulary).
- modelSolutionHTML: In UK English: for comprehension or analytical questions, provide a clear high-mark model response (and brief mark-scheme bullet points where helpful); for student essays or creative/transactional writing, provide an upgraded model paragraph/rewrite that improves SPaG, structure, and vocabulary while keeping the student's voice, followed by 2–3 actionable next-step bullet points using <ul><li>...</li></ul>.
- pastoralNotes: Any teacher margin praise/targets (e.g. WWW / EBI), student notes, or emotional cues. Return '' if none.`;

const ORIENTATION_SYSTEM_PROMPT = `You inspect uploaded exam paper images to determine if each image is upright or rotated.
For each labeled image, determine how many degrees CLOCKWISE (0, 90, 180, or 270) it must be rotated so that the printed text and handwriting are upright and readable normally left-to-right, top-to-bottom.
- 0 means already upright.
- 90 means rotated 90 degrees counter-clockwise right now, so rotating 90 degrees clockwise fixes it.
- 180 means upside down.
- 270 means rotated 90 degrees clockwise right now, so rotating 270 degrees clockwise fixes it.`;

interface IncomingImagePart {
  index: number;
  mimeType: string;
  data: string;
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isDailyQuotaError(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    raw.includes('requestsperday') ||
    raw.includes('perday') ||
    raw.includes('free_tier_requests') ||
    /retry in \d+h/i.test(raw) ||
    /limit:\s*0\b/i.test(raw)
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (isDailyQuotaError(err)) {
        throw err;
      }
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const isTransient =
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('503') ||
        msg.includes('502') ||
        msg.includes('504') ||
        msg.includes('500') ||
        msg.includes('unavailable') ||
        msg.includes('high demand') ||
        msg.includes('overloaded') ||
        msg.includes('resource_exhausted') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('fetch failed');
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      const baseDelayMs = Math.min(6000, 1200 * Math.pow(2, attempt - 1));
      const jitterMs = Math.floor(Math.random() * 400);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs));
    }
  }
  throw lastError;
}

function extractReadableErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    const inner = parsed?.error?.message || parsed?.message;
    if (typeof inner === 'string' && inner.trim()) {
      return inner.trim();
    }
  } catch {
    // Not a JSON error payload
  }
  return raw;
}

function formatRetryDuration(raw: string): string | null {
  const match = raw.match(/Please retry in\s+([^\s."]+)/i);
  if (!match) return null;
  const token = match[1];
  const hours = token.match(/(\d+)h/i)?.[1];
  const mins = token.match(/(\d+)m/i)?.[1];
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  if (mins) return `${mins}m`;
  const secs = token.match(/(\d+)/)?.[1];
  return secs ? `${secs}s` : null;
}

function parseGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message:
        'Gemini API key was rejected. Please verify GEMINI_API_KEY in Settings > Secrets (or in your local .env file if running from GitHub).',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    if (isDailyQuotaError(err)) {
      const waitWindow = formatRetryDuration(raw);
      const resetNote = waitWindow
        ? ` The daily free quota resets in approximately ${waitWindow}.`
        : '';
      return {
        status: 429,
        message: `Daily Free Tier Gemini request quota reached for now.${resetNote} To continue immediately with higher limits, attach a billing-enabled Gemini API key in Settings > Secrets.`,
      };
    }
    return {
      status: 429,
      message: 'Rate limit reached on the Gemini API. Please wait a few seconds and try again.',
    };
  }
  if (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.toLowerCase().includes('high demand') ||
    raw.toLowerCase().includes('overloaded')
  ) {
    return {
      status: 503,
      message:
        'The Gemini AI service is experiencing a temporary spike in demand right now. Your uploaded pages are safe—please wait a few seconds and click Try Again.',
    };
  }
  if (raw.includes('504') || raw.includes('DEADLINE_EXCEEDED') || raw.toLowerCase().includes('timeout')) {
    return {
      status: 504,
      message:
        'The request timed out. If you uploaded a large batch of photos, try analysing 4–6 pages at a time.',
    };
  }
  const cleanMessage = extractReadableErrorMessage(raw);
  return {
    status: 500,
    message: cleanMessage || 'Unexpected error communicating with the Gemini API.',
  };
}

function sanitizeIncomingImages(body: unknown): IncomingImagePart[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { images?: unknown }).images)) {
    return [];
  }
  const rawImages = (body as { images: unknown[] }).images;
  const cleaned: IncomingImagePart[] = [];
  for (const item of rawImages) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { index?: unknown; mimeType?: unknown; data?: unknown };
    if (typeof obj.data !== 'string' || !obj.data) continue;
    const base64Data = obj.data.includes(',') ? obj.data.split(',')[1] : obj.data;
    cleaned.push({
      index: typeof obj.index === 'number' ? obj.index : cleaned.length,
      mimeType: typeof obj.mimeType === 'string' && obj.mimeType.startsWith('image/') ? obj.mimeType : 'image/jpeg',
      data: base64Data,
    });
  }
  return cleaned;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '60mb' }));

  app.get('/api/health', (_req, res) => {
    const hasKey = Boolean(getGenAIClient());
    res.json({ ok: true, configured: hasKey });
  });

  app.post('/api/detect-orientation', async (req, res) => {
    const ai = getGenAIClient();
    if (!ai) {
      return res.json({ rotations: [] });
    }

    const images = sanitizeIncomingImages(req.body);
    if (images.length === 0) {
      return res.status(400).json({ error: 'No valid images provided.' });
    }

    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      for (const img of images) {
        parts.push({ text: `Image index ${img.index}:` });
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      }
      parts.push({
        text: 'Inspect each image and return the clockwise rotation angle (0, 90, 180, or 270) needed to make it upright.',
      });

      const response = await withRetry(
        () =>
          ai.models.generateContent({
            model: LITE_MODEL_NAME,
            contents: { parts },
            config: {
              systemInstruction: ORIENTATION_SYSTEM_PROMPT,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  rotations: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        imageIndex: { type: Type.INTEGER },
                        clockwiseDegrees: { type: Type.INTEGER },
                      },
                      required: ['imageIndex', 'clockwiseDegrees'],
                    },
                  },
                },
                required: ['rotations'],
              },
            },
          }),
        2,
      );

      const parsed = JSON.parse((response.text ?? '{"rotations":[]}').trim()) as {
        rotations?: Array<{ imageIndex: number; clockwiseDegrees: number }>;
      };
      const normalized = (parsed.rotations ?? []).map((r) => ({
        imageIndex: r.imageIndex,
        clockwiseDegrees: [0, 90, 180, 270].includes(r.clockwiseDegrees) ? r.clockwiseDegrees : 0,
      }));
      return res.json({ rotations: normalized });
    } catch (err) {
      const { message } = parseGeminiError(err);
      console.warn('Orientation detection skipped:', message);
      return res.json({ rotations: [] });
    }
  });

  app.post('/api/analyze-exam', async (req, res) => {
    const ai = getGenAIClient();
    if (!ai) {
      return res.status(503).json({
        error:
          'Gemini API key is not configured on the server. If you are running from GitHub, run "npm run setup" (or add GEMINI_API_KEY to .env) as described in README.md.',
      });
    }

    const images = sanitizeIncomingImages(req.body);
    if (images.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one exam image before analysing.' });
    }

    const rawSubject = (req.body as { subject?: unknown })?.subject;
    const subject: 'maths' | 'english' = rawSubject === 'english' ? 'english' : 'maths';

    const rawKnown = (req.body as { alreadyExtractedQuestions?: unknown })?.alreadyExtractedQuestions;
    const knownQuestions = Array.isArray(rawKnown)
      ? rawKnown.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 50)
      : [];

    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      for (const img of images) {
        parts.push({ text: `Uploaded Page (sourceImageIndex = ${img.index}):` });
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      }
      const contextNote =
        knownQuestions.length > 0
          ? ` Questions or sections already captured from earlier pages: [${knownQuestions.join(', ')}]. If this page is an exact duplicate photo of an already-captured question, return [] or skip it; if it contains continuation parts or further paragraphs of an earlier question or essay, reuse the exact same questionNumber so it merges cleanly.`
          : '';
      const userInstruction =
        subject === 'english'
          ? `Digitise all English exam questions, tasks, or student essays across these pages in natural order, deduplicating overlapping photos, merging multi-page essay continuations cleanly, preserving student spelling/punctuation/grammar errors verbatim alongside teacher red marks and highlights, and providing UK-English diagnostics and model answers/rewrites.${contextNote}`
          : `Digitize all exam questions across these pages, deduplicating overlapping photos, preserving student working verbatim with teacher red marks and highlights, redrawing any geometric shapes, graphs, or sketches as crisp layered inline <svg> strings in diagramSVG, and returning diagram bounding boxes.${contextNote}`;
      parts.push({
        text: userInstruction,
      });

      const systemPrompt = subject === 'english' ? ENGLISH_SYSTEM_PROMPT : MATHS_SYSTEM_PROMPT;

      const runExamGeneration = (modelName: string, thinkingLevel: ThinkingLevel) =>
        ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            systemInstruction: systemPrompt,
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionNumber: { type: Type.STRING },
                  marks: { type: Type.STRING },
                  questionTextHTML: { type: Type.STRING },
                  sourceImageIndex: { type: Type.INTEGER },
                  diagramBoundingBox: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                  },
                  diagramSVG: {
                    type: Type.STRING,
                    nullable: true,
                  },
                  studentWorkingHTML: { type: Type.STRING },
                  diagnosticTag: { type: Type.STRING },
                  modelSolutionHTML: { type: Type.STRING },
                  pastoralNotes: { type: Type.STRING },
                },
                required: [
                  'questionNumber',
                  'marks',
                  'questionTextHTML',
                  'sourceImageIndex',
                  'diagramBoundingBox',
                  'diagramSVG',
                  'studentWorkingHTML',
                  'diagnosticTag',
                  'modelSolutionHTML',
                  'pastoralNotes',
                ],
              },
            },
          },
        });

      let response;
      try {
        response = await withRetry(() => runExamGeneration(MODEL_NAME, ThinkingLevel.HIGH));
      } catch (primaryErr) {
        if (isDailyQuotaError(primaryErr)) {
          console.warn(`Primary model ${MODEL_NAME} daily quota reached; falling back to ${LITE_MODEL_NAME}.`);
          response = await withRetry(() => runExamGeneration(LITE_MODEL_NAME, ThinkingLevel.LOW), 2);
        } else {
          throw primaryErr;
        }
      }

      const rawJson = (response.text ?? '[]').trim();
      const questions = JSON.parse(rawJson);
      return res.json({ questions: Array.isArray(questions) ? questions : [] });
    } catch (err) {
      const { status, message } = parseGeminiError(err);
      if (status === 429 || status === 503 || status === 504) {
        console.warn(`Exam analysis deferred (${status}): ${message}`);
      } else {
        console.error('Exam analysis error:', err);
      }
      return res.status(status).json({ error: message });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        typeof (err as { status?: unknown })?.status === 'number'
          ? ((err as { status: number }).status)
          : 500;
      const errType = (err as { type?: unknown })?.type;
      const message =
        errType === 'entity.too.large'
          ? 'Uploaded image data exceeded the server request limit. Try smaller or fewer photos per batch.'
          : err instanceof Error && err.message
            ? err.message
            : 'Unexpected server error processing API request.';
      res.status(status).json({ error: message });
    },
  );

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Screen To Sheet running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
