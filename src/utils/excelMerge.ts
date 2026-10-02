import * as XLSX from 'xlsx';

export interface ParsedFileInfo {
  id: string;
  name: string;
  size: number;
  type: string; // 'xlsx' | 'xlsb' | 'xlsm' | 'xls' | 'csv'
  encoding?: string; // For CSV: 'utf-8' | 'euc-kr'
  sheetName: string;
  totalRows: number;
  totalCols: number;
  headers: string[];
  rawRows: Record<string, any>[];
  fileObj: File;
}

export interface MergeOptions {
  includeFileNameColumn: boolean; // Prepend source file name as the first column
  fileNameColumnHeader: string; // e.g. "파일명"
  skipEmptyRows: boolean; // Skip rows where all values are empty
}

/**
 * Detect text encoding for CSV files: checks for UTF-8 BOM, validates UTF-8, falls back to EUC-KR
 */
export function detectCsvEncoding(bytes: Uint8Array): 'utf-8' | 'euc-kr' {
  // Check UTF-8 BOM: EF BB BF
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8';
  }

  // Try UTF-8 decoding with strict error checking
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(bytes);
    return 'utf-8';
  } catch {
    // UTF-8 validation failed (likely EUC-KR / CP949 with Korean characters)
    return 'euc-kr';
  }
}

/**
 * Decode CSV bytes using specified or auto-detected encoding
 */
export function decodeCsvBytes(bytes: Uint8Array, encoding?: 'utf-8' | 'euc-kr'): { text: string; encodingUsed: 'utf-8' | 'euc-kr' } {
  const enc = encoding || detectCsvEncoding(bytes);
  try {
    const decoder = new TextDecoder(enc);
    return { text: decoder.decode(bytes), encodingUsed: enc };
  } catch (e) {
    console.warn(`Failed to decode with ${enc}, falling back to utf-8`, e);
    const decoder = new TextDecoder('utf-8');
    return { text: decoder.decode(bytes), encodingUsed: 'utf-8' };
  }
}

/**
 * Parse a single Excel or CSV file
 */
export async function parseFile(file: File, preferredEncoding?: 'utf-8' | 'euc-kr'): Promise<ParsedFileInfo> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let workbook: XLSX.WorkBook;
  let encodingUsed: string | undefined = undefined;

  if (ext === 'csv') {
    const { text, encodingUsed: detectedEnc } = decodeCsvBytes(bytes, preferredEncoding);
    encodingUsed = detectedEnc;
    workbook = XLSX.read(text, { type: 'string', cellDates: true });
  } else {
    // xlsx, xlsb, xlsm, xls
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  }

  // User requirement: "각 파일의 첫 번째 시트만 병합"
  const firstSheetName = workbook.SheetNames[0] || 'Sheet1';
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert worksheet to JSON (header: 1 gets raw 2D array)
  const sheetData: any[][] = worksheet ? XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) : [];

  if (sheetData.length === 0) {
    return {
      id: `${file.name}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: file.name,
      size: file.size,
      type: ext,
      encoding: encodingUsed,
      sheetName: firstSheetName,
      totalRows: 0,
      totalCols: 0,
      headers: [],
      rawRows: [],
      fileObj: file,
    };
  }

  // Clean and normalize headers from row 0
  const rawHeaders = sheetData[0].map((h: any, i: number) => {
    const val = String(h ?? '').trim();
    return val || `Column_${i + 1}`;
  });

  // Ensure unique headers
  const seenHeaders = new Map<string, number>();
  const headers = rawHeaders.map((header) => {
    const count = seenHeaders.get(header) || 0;
    seenHeaders.set(header, count + 1);
    return count === 0 ? header : `${header}_${count}`;
  });

  // Parse data rows
  const rawRows: Record<string, any>[] = [];
  for (let r = 1; r < sheetData.length; r++) {
    const rowArray = sheetData[r];
    // Check if entire row is empty
    const isEmpty = !rowArray || rowArray.every((cell: any) => cell === null || cell === undefined || String(cell).trim() === '');
    if (isEmpty) continue;

    const rowObj: Record<string, any> = {};
    headers.forEach((h, colIdx) => {
      rowObj[h] = rowArray[colIdx] ?? '';
    });
    rawRows.push(rowObj);
  }

  return {
    id: `${file.name}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: file.name,
    size: file.size,
    type: ext,
    encoding: encodingUsed,
    sheetName: firstSheetName,
    totalRows: rawRows.length,
    totalCols: headers.length,
    headers,
    rawRows,
    fileObj: file,
  };
}

/**
 * Merge multiple parsed files based on the first file's headers as the master schema
 */
export function mergeFilesData(
  files: ParsedFileInfo[],
  options: MergeOptions
): {
  mergedHeaders: string[];
  mergedRows: Record<string, any>[];
  stats: {
    totalFiles: number;
    totalRows: number;
    matchedColumnsCount: number;
    missingInOtherFiles: Record<string, string[]>; // file -> missing columns
  };
} {
  if (files.length === 0) {
    return {
      mergedHeaders: [],
      mergedRows: [],
      stats: { totalFiles: 0, totalRows: 0, matchedColumnsCount: 0, missingInOtherFiles: {} },
    };
  }

  // 1. Master headers from the FIRST file
  const baseHeaders = [...files[0].headers];

  // Optional: Add file name column at the VERY FRONT (per user's explicit preference)
  const finalHeaders = options.includeFileNameColumn
    ? [options.fileNameColumnHeader, ...baseHeaders]
    : baseHeaders;

  const mergedRows: Record<string, any>[] = [];
  const missingInOtherFiles: Record<string, string[]> = {};

  files.forEach((file, fileIdx) => {
    const fileHeaderSet = new Set(file.headers.map((h) => h.toLowerCase().trim()));
    const headerMapping = new Map<string, string>(); // baseHeader -> fileHeader

    // Map base headers case-insensitively & trimmed
    baseHeaders.forEach((bHeader) => {
      const bKey = bHeader.toLowerCase().trim();
      const matched = file.headers.find((fH) => fH.toLowerCase().trim() === bKey);
      if (matched) {
        headerMapping.set(bHeader, matched);
      }
    });

    // Track columns present in base file but missing in this file
    const missingCols = baseHeaders.filter((bh) => !headerMapping.has(bh));
    if (fileIdx > 0 && missingCols.length > 0) {
      missingInOtherFiles[file.name] = missingCols;
    }

    // Process rows
    file.rawRows.forEach((rawRow) => {
      const newRow: Record<string, any> = {};

      if (options.includeFileNameColumn) {
        newRow[options.fileNameColumnHeader] = file.name;
      }

      let hasAnyValue = false;
      baseHeaders.forEach((bHeader) => {
        const sourceKey = headerMapping.get(bHeader);
        if (sourceKey && rawRow[sourceKey] !== undefined && rawRow[sourceKey] !== null) {
          const val = rawRow[sourceKey];
          newRow[bHeader] = val;
          if (String(val).trim() !== '') {
            hasAnyValue = true;
          }
        } else {
          // "동일 컬럼이 없으면 비워주면 돼"
          newRow[bHeader] = '';
        }
      });

      if (!options.skipEmptyRows || hasAnyValue) {
        mergedRows.push(newRow);
      }
    });
  });

  return {
    mergedHeaders: finalHeaders,
    mergedRows,
    stats: {
      totalFiles: files.length,
      totalRows: mergedRows.length,
      matchedColumnsCount: baseHeaders.length,
      missingInOtherFiles,
    },
  };
}

/**
 * Export merged rows to XLSX file
 */
export function exportToXLSX(headers: string[], rows: Record<string, any>[], filename = 'Merged_Data.xlsx'): void {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });

  // Auto-calculate column widths
  const colWidths = headers.map((header) => {
    let maxLen = header.length;
    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      const val = rows[i][header];
      if (val !== null && val !== undefined) {
        const str = String(val);
        maxLen = Math.max(maxLen, Math.min(str.length, 50));
      }
    }
    return { wch: Math.max(maxLen + 3, 10) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Merged_Data');
  XLSX.writeFile(workbook, filename);
}

/**
 * Export merged rows to CSV with UTF-8 BOM for flawless Korean support in Microsoft Excel
 */
export function exportToCSV(headers: string[], rows: Record<string, any>[], filename = 'Merged_Data.csv'): void {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const csvContent = XLSX.utils.sheet_to_csv(worksheet);

  // Prepend UTF-8 BOM (\uFEFF) so Excel opens Korean characters without scrambling
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
