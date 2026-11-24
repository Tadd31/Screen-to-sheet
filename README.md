# 📝 Screen To Sheet

Turn smartphone photos and screenshots of marked student **Maths** or **English** exam papers—and handwritten English essays—into a clean, interactive worksheet for live online tutoring, pen-tablet working, and crisp white-paper A4 printing.

## Key Features

- **Maths & English Subject Selector**: Choose **Maths** or **English** right above the upload zone before analysing:
  - **Maths Mode**: Preserves equations, stacked fractions, and student calculations verbatim alongside red teacher markings, and redraws geometric shapes, graphs, and sketches as crisp three-layer inline `<svg>` diagrams.
  - **English Mode**: Supports reading comprehension, SPaG tasks, and multi-page handwritten or typed essays—preserving paragraph structure, crossed-out words, and exact spelling/punctuation errors verbatim alongside teacher red-pen SPaG codes, plus UK-English diagnostics and upgraded model paragraphs/next steps.
- **Automatic Photo Straightening & Deduplication**: Uploaded photos automatically normalise camera EXIF orientation and detect sideways or upside-down pages using Gemini (`gemini-3.1-flash-lite`) so you rarely need to rotate manually (with a manual **Rotate** button on every page thumbnail), while merging multi-page continuations and deduplicating overlapping shots.
- **Live Tutoring Controls**:
  - **Hide / Reveal Solution** and **Hide / Show Diagnostic** toggles during live screen-sharing.
  - **Blank Retake Mode** to hide student working, red marks, scores, and diagram annotations—leaving clean white ruled space to re-attempt the problem live or on paper.
  - **Copy Question / Copy Prompt** and **Copy Solution / Copy Model** buttons formatted cleanly for **Microsoft Teams** and **Zoom** chat.
  - **Live Notes** area on every card for typing reminders during the lesson.
  - **How It Works** quick guide modal in the top bar.
- **Open for Tablet (A4 Pen-Tablet Whiteboard)**: Click **Open for tablet** on any card to open a pure white A4 sheet with the prompt and diagram pinned at the top, a pressure-sensitive stylus canvas below, an **Open in New Tab** link, and instant **Download PNG** / **Download JPG** export buttons.
- **A4 Printing**: Click **Print Worksheet** to open a clean A4-paginated print tab with colours preserved.
- **Resilient Quota & Fallback Handling**: Page-orientation checks run on `gemini-3.1-flash-lite` to preserve `gemini-4-hydrogen` quota, with automatic fallback to `gemini-3.1-flash-lite` if the Free Tier daily cap on the primary model is reached.

---

## Easy Setup Guide (Running Locally from GitHub)

Your API key stays privately on the server (`.env`), never in browser code and never committed to GitHub.

### Step 1: Get a Gemini API Key
1. Go to [Google AI Studio API Keys](https://aistudio.google.com/apikey) and sign in with your Google account.
2. Click **Create API key** and copy the key (keep it private).

### Step 2: Install Dependencies
Install [Node.js](https://nodejs.org/) (**version 22 or newer** recommended), open a terminal in this repository folder, and run:

```bash
npm install --legacy-peer-deps
```

*(Using `--legacy-peer-deps` avoids optional `esbuild` peer-dependency warnings during installation.)*

### Step 3: Configure Your API Key & Start
Run the setup helper and paste your key when prompted:

```bash
npm run setup
```

*(Or copy `.env.example` to `.env` and replace `MY_GEMINI_API_KEY` with your key.)*

Start the app in development mode:

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

To run a production build locally:

```bash
npm run build
NODE_ENV=production npm start
```

---

## Uploading Safely to GitHub

1. `.gitignore` already excludes `.env*`, `node_modules/`, `dist/`, and `.aistudio/` so your personal API key and build output are never pushed.
2. Never paste a real key into `.env.example` or any `.ts`, `.tsx`, or `.html` file.
3. Verify the project passes type-checking and builds cleanly before pushing:

```bash
npm run lint && npm run build
```
