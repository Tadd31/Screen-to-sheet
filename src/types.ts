export interface UploadedPage {
  id: string;
  fileName: string;
  mimeType: string;
  orientedDataUrl: string;
  rotationDeg: number;
  width: number;
  height: number;
  isAutoOrienting: boolean;
  wasAutoRotated: boolean;
}

export interface ApiQuestionResponse {
  questionNumber: string;
  marks: string;
  questionTextHTML: string;
  sourceImageIndex: number;
  diagramBoundingBox: number[];
  diagramSVG: string | null;
  studentWorkingHTML: string;
  diagnosticTag: string;
  modelSolutionHTML: string;
  pastoralNotes: string;
}

export type ExamSubject = 'maths' | 'english';

export interface DigitizedQuestion extends ApiQuestionResponse {
  id: string;
  subject?: ExamSubject;
  croppedDiagramUrl: string | null;
  liveNotes: string;
}

export type PenTool = 'pen' | 'highlighter' | 'eraser';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface InkStroke {
  tool: PenTool;
  color: string;
  baseWidth: number;
  points: StrokePoint[];
}
