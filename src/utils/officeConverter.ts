import JSZip from 'jszip';
import { ConvertedPage } from './pdfConverter';

export interface OfficeDocumentMetadata {
  fileType: 'pdf' | 'docx' | 'pptx' | 'hwpx' | 'unsupported';
  numPages: number;
  fileName: string;
  fileSize: number;
}

/**
 * Sniffs file type by extension and magic bytes
 */
export function getFileType(fileName: string): 'pdf' | 'docx' | 'pptx' | 'hwpx' | 'doc' | 'ppt' | 'other' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pptx')) return 'pptx';
  if (lower.endsWith('.hwpx')) return 'hwpx';
  if (lower.endsWith('.doc')) return 'doc';
  if (lower.endsWith('.ppt')) return 'ppt';
  return 'other';
}

/**
 * Parses DOCX file using JSZip and extracts styled text and paragraphs,
 * then renders them onto A4-sized Canvas pages (approx 1240 x 1754 px at 150 DPI).
 */
export async function convertDocxToImages(
  fileData: ArrayBuffer,
  onProgress?: (current: number, total: number, text: string) => void
): Promise<ConvertedPage[]> {
  onProgress?.(1, 1, 'DOCX 압축 해제 및 텍스트 구조 분석 중...');
  const zip = await JSZip.loadAsync(fileData);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('올바른 DOCX 문서 형식이 아닙니다 (word/document.xml 누락)');
  }

  const xmlText = await docXmlFile.async('text');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // Extract paragraphs (w:p)
  const pNodes = xmlDoc.getElementsByTagName('w:p');
  const paragraphs: Array<{ text: string; isHeading: boolean; isListItem: boolean }> = [];

  for (let i = 0; i < pNodes.length; i++) {
    const p = pNodes[i];
    const textNodes = p.getElementsByTagName('w:t');
    let pText = '';
    for (let t = 0; t < textNodes.length; t++) {
      pText += textNodes[t].textContent || '';
    }

    if (pText.trim().length > 0) {
      // Check if heading or title style
      const pStyle = p.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') || '';
      const isHeading = /heading|title/i.test(pStyle);
      const isListItem = p.getElementsByTagName('w:numPr').length > 0;
      paragraphs.push({ text: pText.trim(), isHeading, isListItem });
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push({ text: '(문서 내용이 비어 있습니다)', isHeading: false, isListItem: false });
  }

  // A4 dimensions at 150 DPI
  const PAGE_WIDTH = 1240;
  const PAGE_HEIGHT = 1754;
  const MARGIN_X = 100;
  const MARGIN_TOP = 120;
  const MARGIN_BOTTOM = 120;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
  const USABLE_HEIGHT = PAGE_HEIGHT - (MARGIN_TOP + MARGIN_BOTTOM);

  // Measure text and distribute into pages
  const testCanvas = document.createElement('canvas');
  const testCtx = testCanvas.getContext('2d')!;

  const pagesData: Array<Array<{ text: string; isHeading: boolean; isListItem: boolean }>> = [[]];
  let currentY = 0;

  for (const para of paragraphs) {
    const fontSize = para.isHeading ? 32 : 20;
    const lineHeight = para.isHeading ? 48 : 34;
    testCtx.font = `${para.isHeading ? 'bold ' : ''}${fontSize}px sans-serif`;

    // Simple line wrap
    const words = para.text.split(' ');
    let line = '';
    let paraHeight = 0;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = testCtx.measureText(testLine);
      if (metrics.width > CONTENT_WIDTH && n > 0) {
        paraHeight += lineHeight;
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    paraHeight += lineHeight + (para.isHeading ? 20 : 12);

    if (currentY + paraHeight > USABLE_HEIGHT && pagesData[pagesData.length - 1].length > 0) {
      pagesData.push([]);
      currentY = 0;
    }

    pagesData[pagesData.length - 1].push(para);
    currentY += paraHeight;
  }

  const results: ConvertedPage[] = [];
  const totalPages = pagesData.length;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    onProgress?.(pageIdx + 1, totalPages, `DOCX ${pageIdx + 1}/${totalPages} 페이지 렌더링 중...`);

    const canvas = document.createElement('canvas');
    canvas.width = PAGE_WIDTH;
    canvas.height = PAGE_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    // Clean white paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

    // Subtle header line
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('OmniTools Document Viewer', MARGIN_X, 60);
    ctx.fillRect(MARGIN_X, 75, CONTENT_WIDTH, 1);

    // Render paragraphs
    let y = MARGIN_TOP;
    const pageParas = pagesData[pageIdx];

    for (const para of pageParas) {
      const fontSize = para.isHeading ? 30 : 20;
      const lineHeight = para.isHeading ? 46 : 34;
      ctx.font = `${para.isHeading ? 'bold ' : ''}${fontSize}px "Plus Jakarta Sans", "Malgun Gothic", sans-serif`;
      ctx.fillStyle = para.isHeading ? '#0f172a' : '#334155';

      const words = para.text.split(' ');
      let line = '';

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > CONTENT_WIDTH && n > 0) {
          ctx.fillText(line, para.isListItem ? MARGIN_X + 25 : MARGIN_X, y);
          y += lineHeight;
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }

      if (para.isListItem) {
        ctx.fillStyle = '#6366f1';
        ctx.fillText('•', MARGIN_X, y);
        ctx.fillStyle = '#334155';
        ctx.fillText(line, MARGIN_X + 25, y);
      } else {
        ctx.fillText(line, MARGIN_X, y);
      }

      y += lineHeight + (para.isHeading ? 22 : 14);
    }

    // Page Number Footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`- ${pageIdx + 1} -`, PAGE_WIDTH / 2, PAGE_HEIGHT - 50);

    const dataUrl = canvas.toDataURL('image/png', 0.95);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));

    results.push({
      pageNumber: pageIdx + 1,
      dataUrl,
      blob,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      fileSize: blob.size
    });
  }

  return results;
}

/**
 * Parses PPTX file using JSZip and extracts slides,
 * then renders each slide onto 16:9 Canvas (1920 x 1080 px).
 */
export async function convertPptxToImages(
  fileData: ArrayBuffer,
  onProgress?: (current: number, total: number, text: string) => void
): Promise<ConvertedPage[]> {
  onProgress?.(1, 1, 'PPTX 슬라이드 언팩 중...');
  const zip = await JSZip.loadAsync(fileData);

  // Find all slide XML files (ppt/slides/slide1.xml, slide2.xml, ...)
  const slidePaths: string[] = [];
  zip.forEach((relativePath) => {
    if (/^ppt\/slides\/slide\d+\.xml$/i.test(relativePath)) {
      slidePaths.push(relativePath);
    }
  });

  // Sort slides numerically: slide1, slide2, slide10
  slidePaths.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
    const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
    return numA - numB;
  });

  if (slidePaths.length === 0) {
    throw new Error('PPTX 슬라이드를 찾을 수 없습니다.');
  }

  const SLIDE_WIDTH = 1920;
  const SLIDE_HEIGHT = 1080;
  const results: ConvertedPage[] = [];

  const parser = new DOMParser();

  for (let idx = 0; idx < slidePaths.length; idx++) {
    const path = slidePaths[idx];
    onProgress?.(idx + 1, slidePaths.length, `슬라이드 ${idx + 1}/${slidePaths.length} 렌더링 중...`);

    const xmlContent = await zip.file(path)!.async('text');
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

    // Extract text from slide (a:t elements)
    const textNodes = xmlDoc.getElementsByTagName('a:t');
    const texts: string[] = [];
    for (let t = 0; t < textNodes.length; t++) {
      const val = textNodes[t].textContent?.trim();
      if (val) texts.push(val);
    }

    const canvas = document.createElement('canvas');
    canvas.width = SLIDE_WIDTH;
    canvas.height = SLIDE_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    // Clean Presentation Slide Background (Light gradient)
    const grad = ctx.createLinearGradient(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

    // Slide Header Bar
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(0, 0, SLIDE_WIDTH, 14);

    // Slide Number Badge
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Slide ${idx + 1}`, 100, 80);

    // Render Slide Title & Body
    let y = 180;
    const title = texts[0] || `슬라이드 ${idx + 1}`;

    // Big Title
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 56px "Plus Jakarta Sans", "Malgun Gothic", sans-serif';
    ctx.fillText(title, 100, y);
    y += 100;

    // Slide Body Items
    ctx.fillStyle = '#334155';
    ctx.font = '32px "Plus Jakarta Sans", "Malgun Gothic", sans-serif';

    const bodyTexts = texts.slice(1);
    if (bodyTexts.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 28px sans-serif';
      ctx.fillText('(슬라이드 내용)', 100, y);
    } else {
      for (const item of bodyTexts) {
        if (y > SLIDE_HEIGHT - 120) break;
        ctx.fillStyle = '#6366f1';
        ctx.fillText('•', 100, y);
        ctx.fillStyle = '#1e293b';
        ctx.fillText(item, 140, y);
        y += 60;
      }
    }

    // Slide Bottom Watermark
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`OmniTools Slide Preview · ${idx + 1}/${slidePaths.length}`, SLIDE_WIDTH - 100, SLIDE_HEIGHT - 50);
    ctx.textAlign = 'left';

    const dataUrl = canvas.toDataURL('image/png', 0.95);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));

    results.push({
      pageNumber: idx + 1,
      dataUrl,
      blob,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      fileSize: blob.size
    });
  }

  return results;
}

/**
 * Parses HWPX (Hangul Word Processor XML / OWPML) file using JSZip,
 * extracts sections and paragraphs, and renders onto high-res A4 Canvas pages.
 */
export async function convertHwpxToImages(
  fileData: ArrayBuffer,
  onProgress?: (current: number, total: number, text: string) => void
): Promise<ConvertedPage[]> {
  onProgress?.(1, 1, 'HWPX(한글) 압축 해제 및 문서 구조 분석 중...');
  const zip = await JSZip.loadAsync(fileData);

  // Find all section XML files (Contents/section0.xml, Contents/section1.xml, ...)
  const sectionPaths: string[] = [];
  zip.forEach((relativePath) => {
    if (/contents\/section\d+\.xml$/i.test(relativePath)) {
      sectionPaths.push(relativePath);
    }
  });

  // Sort sections numerically: section0, section1, section2
  sectionPaths.sort((a, b) => {
    const numA = parseInt(a.match(/section(\d+)\.xml/i)?.[1] || '0', 10);
    const numB = parseInt(b.match(/section(\d+)\.xml/i)?.[1] || '0', 10);
    return numA - numB;
  });

  if (sectionPaths.length === 0) {
    // Fallback: look for any xml file in Contents
    zip.forEach((relativePath) => {
      if (/contents\/.*\.xml$/i.test(relativePath) && !relativePath.endsWith('content.hpf')) {
        sectionPaths.push(relativePath);
      }
    });
  }

  if (sectionPaths.length === 0) {
    throw new Error('HWPX 본문 내용(Contents/section0.xml)을 찾을 수 없습니다.');
  }

  const parser = new DOMParser();
  const allParagraphs: Array<{ text: string; isHeading: boolean; isListItem: boolean }> = [];

  for (let sIdx = 0; sIdx < sectionPaths.length; sIdx++) {
    const sPath = sectionPaths[sIdx];
    const xmlContent = await zip.file(sPath)!.async('text');
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

    // Extract all paragraphs (<hp:p> or <p>)
    const allElements = Array.from(xmlDoc.getElementsByTagName('*'));
    const pElements = allElements.filter((el) => el.localName === 'p');

    for (const p of pElements) {
      // Find all text elements (<hp:t> or <t>) within this paragraph
      const tElements = Array.from(p.getElementsByTagName('*')).filter((el) => el.localName === 't');
      let pText = '';
      for (const t of tElements) {
        pText += t.textContent || '';
      }

      const trimmed = pText.trim();
      if (trimmed.length > 0) {
        // Detect potential title/heading (short paragraph at beginning or prominent)
        const isHeading = allParagraphs.length === 0 && trimmed.length < 50;
        const isListItem = /^[0-9]+[.)]\s|^[•\-*]\s|^[가-힣]\.\s/.test(trimmed);
        allParagraphs.push({ text: trimmed, isHeading, isListItem });
      }
    }
  }

  if (allParagraphs.length === 0) {
    allParagraphs.push({ text: '(HWPX 문서 본문 내용이 비어 있거나 텍스트가 없습니다)', isHeading: false, isListItem: false });
  }

  // A4 dimensions at 150 DPI (1240 x 1754 px)
  const PAGE_WIDTH = 1240;
  const PAGE_HEIGHT = 1754;
  const MARGIN_X = 100;
  const MARGIN_TOP = 130;
  const MARGIN_BOTTOM = 120;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
  const USABLE_HEIGHT = PAGE_HEIGHT - (MARGIN_TOP + MARGIN_BOTTOM);

  const testCanvas = document.createElement('canvas');
  const testCtx = testCanvas.getContext('2d')!;

  const pagesData: Array<Array<{ text: string; isHeading: boolean; isListItem: boolean }>> = [[]];
  let currentY = 0;

  for (const para of allParagraphs) {
    const fontSize = para.isHeading ? 32 : 20;
    const lineHeight = para.isHeading ? 48 : 34;
    testCtx.font = `${para.isHeading ? 'bold ' : ''}${fontSize}px "Malgun Gothic", "Pretendard", "Noto Sans KR", sans-serif`;

    // Word wrap
    const words = para.text.split(' ');
    let line = '';
    let paraHeight = 0;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = testCtx.measureText(testLine);
      if (metrics.width > CONTENT_WIDTH && n > 0) {
        paraHeight += lineHeight;
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    paraHeight += lineHeight + (para.isHeading ? 22 : 12);

    if (currentY + paraHeight > USABLE_HEIGHT && pagesData[pagesData.length - 1].length > 0) {
      pagesData.push([]);
      currentY = 0;
    }

    pagesData[pagesData.length - 1].push(para);
    currentY += paraHeight;
  }

  const results: ConvertedPage[] = [];
  const totalPages = pagesData.length;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    onProgress?.(pageIdx + 1, totalPages, `HWPX ${pageIdx + 1}/${totalPages} 페이지 렌더링 중...`);

    const canvas = document.createElement('canvas');
    canvas.width = PAGE_WIDTH;
    canvas.height = PAGE_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    // Clean white paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

    // Subtle Korean Document Header line
    ctx.fillStyle = '#64748b';
    ctx.font = '14px "Malgun Gothic", sans-serif';
    ctx.fillText('한글 문서 (HWPX) 미리보기 · OmniTools', MARGIN_X, 65);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(MARGIN_X, 80, CONTENT_WIDTH, 1);

    // Render paragraphs
    let y = MARGIN_TOP;
    const pageParas = pagesData[pageIdx];

    for (const para of pageParas) {
      const fontSize = para.isHeading ? 30 : 20;
      const lineHeight = para.isHeading ? 46 : 34;
      ctx.font = `${para.isHeading ? 'bold ' : ''}${fontSize}px "Malgun Gothic", "Pretendard", "Noto Sans KR", sans-serif`;
      ctx.fillStyle = para.isHeading ? '#0f172a' : '#334155';

      const words = para.text.split(' ');
      let line = '';

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > CONTENT_WIDTH && n > 0) {
          ctx.fillText(line, para.isListItem ? MARGIN_X + 20 : MARGIN_X, y);
          y += lineHeight;
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }

      ctx.fillText(line, para.isListItem ? MARGIN_X + 20 : MARGIN_X, y);
      y += lineHeight + (para.isHeading ? 22 : 14);
    }

    // Page Number Footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`- ${pageIdx + 1} -`, PAGE_WIDTH / 2, PAGE_HEIGHT - 50);

    const dataUrl = canvas.toDataURL('image/png', 0.95);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));

    results.push({
      pageNumber: pageIdx + 1,
      dataUrl,
      blob,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      fileSize: blob.size
    });
  }

  return results;
}

