import type {
  ForwardRequest,
  ForwardView,
  InverseRequest,
  InverseView,
} from "@latex-collab/contracts";

export interface SourceToPdfOptions {
  projectId: string;
  jobId: string;
  fileId: string;
  line: number;
  column: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface PdfToSourceOptions {
  projectId: string;
  jobId: string;
  page: number;
  x: number;
  y: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Performs forward SyncTeX lookup: code source line -> PDF bounding boxes (CMP-07).
 */
export async function navigateSourceToPdf(
  options: SourceToPdfOptions,
): Promise<ForwardView> {
  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "/api/v1";

  const requestBody: ForwardRequest = {
    jobId: options.jobId,
    fileId: options.fileId,
    line: options.line,
    column: options.column,
  };

  const response = await fetcher(
    `${baseUrl}/projects/${options.projectId}/synctex/forward`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(`Forward SyncTeX request failed with status ${response.status}`);
    (error as Error & { status?: number; data?: unknown }).status = response.status;
    (error as Error & { status?: number; data?: unknown }).data = errorBody;
    throw error;
  }

  return (await response.json()) as ForwardView;
}

/**
 * Performs inverse SyncTeX lookup: PDF coordinates -> code source position (CMP-07).
 */
export async function navigatePdfToSource(
  options: PdfToSourceOptions,
): Promise<InverseView> {
  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "/api/v1";

  const requestBody: InverseRequest = {
    jobId: options.jobId,
    page: options.page,
    x: options.x,
    y: options.y,
  };

  const response = await fetcher(
    `${baseUrl}/projects/${options.projectId}/synctex/inverse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(`Inverse SyncTeX request failed with status ${response.status}`);
    (error as Error & { status?: number; data?: unknown }).status = response.status;
    (error as Error & { status?: number; data?: unknown }).data = errorBody;
    throw error;
  }

  return (await response.json()) as InverseView;
}

/**
 * Documented coordinate tolerance in PDF points (CMP-07 tolerance specification: 5.0 pt).
 */
export const SYNCTEX_POINT_TOLERANCE_PT = 5.0;

/**
 * Validates whether two PDF coordinate points are within acceptable SyncTeX tolerance.
 */
export function isWithinSyncTeXDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  tolerance = SYNCTEX_POINT_TOLERANCE_PT,
): boolean {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) <= tolerance;
}

/**
 * Converts PDF points to browser CSS pixels based on rendering scale and viewport.
 */
export function pdfPointsToPixels(points: number, scale: number): number {
  return points * scale;
}

/**
 * Converts browser CSS pixels back to PDF points based on rendering scale.
 */
export function pixelsToPdfPoints(pixels: number, scale: number): number {
  if (scale <= 0) return 0;
  return pixels / scale;
}
