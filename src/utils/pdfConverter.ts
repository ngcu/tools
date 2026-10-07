import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    const v = pdfjsLib.version || '4.10.38';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn('Failed to set workerSrc:', e);
  }
}

export interface ConvertOptions {
  dpi: number; // e.g. 72, 150, 300
  format: 'png' | 'jpeg' | 'webp';
  quality: number; // 0.1 to 1.0 (for jpeg/webp)
  onProgress?: (current: number, total: number, statusText: string) => void;
}

export interface ConvertedPage {
  pageNumber: number;
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  fileSize: number;
}

export interface PDFMetadata {
  numPages: number;
  fileName: string;
  fileSize: number;
}

/**
 * Standard PDF reference DPI is 72.
 * Scale = targetDPI / 72
 */
export function getScaleForDpi(dpi: number): number {
  return Math.max(0.5, Math.min(8.0, dpi / 72));
}

/**
 * Loads a PDF from ArrayBuffer or File and returns document proxy
 */
export async function loadPDFDocument(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
  });
  return await loadingTask.promise;
}

/**
 * Converts selected pages of a PDF to images
 */
export async function convertPDFPagesToImages(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumbers: number[],
  options: ConvertOptions
): Promise<ConvertedPage[]> {
  const scale = getScaleForDpi(options.dpi);
  const mimeType = options.format === 'png' ? 'image/png' : options.format === 'webp' ? 'image/webp' : 'image/jpeg';
  const results: ConvertedPage[] = [];

  const total = pageNumbers.length;

  for (let i = 0; i < total; i++) {
    const pageNum = pageNumbers[i];
    options.onProgress?.(i + 1, total, `${pageNum}페이지 변환 중... (${i + 1}/${total})`);

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Render to offscreen canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: options.format === 'png' });
    if (!ctx) throw new Error('Canvas 2D context could not be created');

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    // If JPEG, fill background with white (since PDF pages can have transparent background)
    if (options.format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Convert to blob and dataUrl
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create image blob'));
        },
        mimeType,
        options.format === 'png' ? undefined : options.quality
      );
    });

    const dataUrl = canvas.toDataURL(mimeType, options.format === 'png' ? undefined : options.quality);

    results.push({
      pageNumber: pageNum,
      dataUrl,
      blob,
      width: canvas.width,
      height: canvas.height,
      fileSize: blob.size,
    });
  }

  return results;
}

/**
 * Helper to generate a sample 1-page PDF for instant testing
 */
export async function generateSamplePDFBlob(): Promise<Blob> {
  // A minimal valid PDF buffer directly in binary (1-page vector graphic presentation)
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 260 >>
stream
q
0.1 0.1 0.2 rg
0 0 612 792 re f
0.38 0.45 0.98 rg
40 700 532 50 re f
1 1 1 rg
BT
/F1 24 Tf
60 718 Td
(OmniTools - PDF to Image Converter) Tj
0.7 0.7 0.8 rg
/F1 14 Tf
0 -45 Td
(100% Serverless & Client-Side Secure Conversion) Tj
/F1 12 Tf
0 -40 Td
(Sample Page Preview | Test Resolution, DPI & Formats) Tj
0 -30 Td
(Date: 2026-09-28 | Fast in-browser Canvas rendering) Tj
ET
0.2 0.8 0.6 rg
60 480 200 120 re f
0.9 0.4 0.3 rg
300 480 200 120 re f
Q
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000557 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
634
%%EOF`;

  return new Blob([content], { type: 'application/pdf' });
}
