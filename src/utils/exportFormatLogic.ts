import type { ParentCall } from '../types/sibk';
import { formatMeetingScheduleText, isParentCallCompleted } from './parentCallLogic';

const NON_AGGREGABLE_NUMERIC_HEADERS = new Set([
  'no',
  'nis',
  'nisn',
  'kelas',
  'hp siswa',
  'hp orang tua',
  'tahun masuk',
  'tahun',
  'nomor',
  'kode',
  'urutan',
]);

export function isAggregableNumericColumn(
  header: string,
  values: Array<unknown>
): boolean {
  const normalized = header.trim().toLowerCase();
  if (NON_AGGREGABLE_NUMERIC_HEADERS.has(normalized)) return false;
  if (values.length === 0) return false;

  let hasNumber = false;
  for (const val of values) {
    if (val === '' || val === null || val === undefined) continue;
    if (typeof val === 'number' && Number.isFinite(val)) {
      hasNumber = true;
    } else {
      return false;
    }
  }
  return hasNumber;
}

export function computeExcelSummaryRow(
  headers: string[],
  rows: Array<Record<string, unknown>>
): Array<string | number> | null {
  if (headers.length === 0 || rows.length === 0) return null;

  const summableCols = headers.map((header) => {
    const colValues = rows.map((r) => r[header]);
    return isAggregableNumericColumn(header, colValues);
  });

  if (!summableCols.some(Boolean)) return null;

  const summary: Array<string | number> = headers.map((header, idx) => {
    if (!summableCols[idx]) return '';
    let total = 0;
    for (const row of rows) {
      const raw = row[header];
      const num = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
      if (Number.isFinite(num)) total += num;
    }
    return total;
  });

  const labelIdx = summableCols.findIndex((isSum) => !isSum);
  summary[labelIdx >= 0 ? labelIdx : 0] = `TOTAL / REKAPITULASI (${rows.length} data)`;
  return summary;
}

export function buildTablePdfSummaryText(
  columns: string[],
  rows: Array<Array<string | number>>
): string {
  if (rows.length === 0) return 'Total Data: 0 baris';

  const parts: string[] = [`Total Data: ${rows.length} baris`];
  const sums: string[] = [];

  columns.forEach((col, idx) => {
    const colValues = rows.map((r) => r[idx]);
    if (!isAggregableNumericColumn(col, colValues)) return;
    const sum = colValues.reduce<number>((acc, val) => {
      const n = typeof val === 'number' ? val : Number(String(val ?? '').trim());
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);
    sums.push(`${col}: ${sum}`);
  });

  if (sums.length > 0) {
    parts.push(`Rekapitulasi — ${sums.join(' · ')}`);
  }
  return parts.join('  |  ');
}

export interface PdfColumnAlignmentHint {
  halign: 'left' | 'center' | 'right';
  cellWidth?: number;
}

export function inferPdfColumnStyles(
  columns: string[]
): Record<number, PdfColumnAlignmentHint> {
  const styles: Record<number, PdfColumnAlignmentHint> = {};

  columns.forEach((col, idx) => {
    const norm = col.trim().toLowerCase();
    if (norm === 'no') {
      styles[idx] = { halign: 'center', cellWidth: 10 };
    } else if (norm === 'nis' || norm === 'nisn') {
      styles[idx] = { halign: 'center', cellWidth: 22 };
    } else if (norm === 'kelas') {
      styles[idx] = { halign: 'center', cellWidth: 16 };
    } else if (norm === 'h/s/i/a' || norm === 'hadir') {
      styles[idx] = { halign: 'center' };
    } else if (
      norm === 'sakit' ||
      norm === 'izin' ||
      norm === 'alpa' ||
      norm === 'total' ||
      norm === 'jumlah kasus' ||
      norm === 'kasus' ||
      norm === 'konseling'
    ) {
      styles[idx] = { halign: 'right' };
    }
  });

  return styles;
}

export function resolveSignatureCounselorName(counselorName?: string): string {
  const clean = (counselorName || '').trim();
  return clean || '( ........................................ )';
}

export function extractCityPrefixFromAddress(address?: string): string {
  const clean = (address || '').trim();
  if (!clean) return '';
  const match = clean.match(/\b(Singaraja|Denpasar|Jakarta|Bandung|Surabaya|Yogyakarta|Semarang|Medan|Makassar|Malang|Bali)\b/i);
  if (match) {
    const word = match[1];
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return '';
}

export interface ParentCallLetterMinutes {
  formattedSchedule: string;
  hasMeetingMinutes: boolean;
  meetingResult: string;
  agreement: string;
  followUpNote: string;
}

export function getParentCallLetterMinutes(call: ParentCall): ParentCallLetterMinutes {
  const formattedSchedule = formatMeetingScheduleText(
    call.meetingDate,
    call.meetingTime,
    call.meetingSchedule
  );
  const completed = isParentCallCompleted(call.status);
  const meetingResult = (call.meetingResult || '').trim();
  const agreement = (call.agreement || '').trim();
  const followUpNote = (call.followUpNote || '').trim();
  const hasMeetingMinutes =
    completed && Boolean(meetingResult || agreement || followUpNote);

  return {
    formattedSchedule: formattedSchedule || 'Menyesuaikan konfirmasi dengan Guru BK',
    hasMeetingMinutes,
    meetingResult,
    agreement,
    followUpNote,
  };
}

export function sanitizeExportFileName(raw: string): string {
  return (
    raw
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Dokumen_SIBK'
  );
}
