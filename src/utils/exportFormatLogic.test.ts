import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParentCall } from '../types/sibk';
import {
  buildTablePdfSummaryText,
  computeExcelSummaryRow,
  extractCityPrefixFromAddress,
  getParentCallLetterMinutes,
  inferPdfColumnStyles,
  resolveSignatureCounselorName,
  sanitizeExportFileName,
} from './exportFormatLogic';

test('computeExcelSummaryRow totals aggregable numeric columns while skipping NIS/No/Tahun Masuk', () => {
  const headers = ['NIS', 'Nama Siswa', 'Kelas', 'Sakit', 'Izin', 'Alpa', 'Total'];
  const rows = [
    { NIS: '12345', 'Nama Siswa': 'Andi', Kelas: '8.1', Sakit: 2, Izin: 1, Alpa: 3, Total: 6 },
    { NIS: '12346', 'Nama Siswa': 'Budi', Kelas: '8.2', Sakit: 1, Izin: 0, Alpa: 2, Total: 3 },
  ];

  const summary = computeExcelSummaryRow(headers, rows);
  assert.deepEqual(summary, [
    'TOTAL / REKAPITULASI (2 data)',
    '',
    '',
    3,
    1,
    5,
    9,
  ]);
});

test('computeExcelSummaryRow returns null when no aggregable numeric columns exist', () => {
  const headers = ['Tanggal', 'Nama Siswa', 'Uraian'];
  const rows = [{ Tanggal: '2026-11-21', 'Nama Siswa': 'Andi', Uraian: 'Terlambat' }];
  assert.equal(computeExcelSummaryRow(headers, rows), null);
});

test('buildTablePdfSummaryText and inferPdfColumnStyles align and summarize table reports', () => {
  const columns = ['No', 'NIS', 'Nama Siswa', 'Kelas', 'Sakit', 'Alpa', 'Total'];
  const rows = [
    [1, '1001', 'Ani', '7.1', 2, 1, 3],
    [2, '1002', 'Budi', '7.2', 0, 4, 4],
  ];

  const text = buildTablePdfSummaryText(columns, rows);
  assert.ok(text.includes('Total Data: 2 baris'));
  assert.ok(text.includes('Sakit: 2'));
  assert.ok(text.includes('Alpa: 5'));
  assert.ok(text.includes('Total: 7'));

  const styles = inferPdfColumnStyles(columns);
  assert.equal(styles[0].halign, 'center');
  assert.equal(styles[1].halign, 'center');
  assert.equal(styles[3].halign, 'center');
  assert.equal(styles[4].halign, 'right');
  assert.equal(styles[6].halign, 'right');
});

test('getParentCallLetterMinutes detects completed meeting minutes and formats structured schedule', () => {
  const completedCall: ParentCall = {
    id: 'pc_1',
    letterNumber: '005/BK/SMPN6/XI/2026',
    studentId: 's1',
    studentName: 'Ivan',
    className: '8.1',
    parentName: 'Bapak Wayan',
    parentPhone: '08123456789',
    callDate: '2026-11-20',
    meetingDate: '2026-11-21',
    meetingTime: '09:30',
    meetingSchedule: '',
    reason: 'Ketidakhadiran berulang',
    meetingResult: 'Wali hadir dan berkomitmen mendampingi',
    agreement: 'Pemantauan 2 minggu',
    followUpNote: 'Cek ulang Senin depan',
    status: 'Selesai',
  };

  const minutes = getParentCallLetterMinutes(completedCall);
  assert.equal(minutes.hasMeetingMinutes, true);
  assert.ok(minutes.formattedSchedule.includes('Sabtu'));
  assert.ok(minutes.formattedSchedule.includes('09:30 WIB'));

  const scheduledOnly = getParentCallLetterMinutes({
    ...completedCall,
    status: 'Sudah dijadwalkan',
  });
  assert.equal(scheduledOnly.hasMeetingMinutes, false);
});

test('resolveSignatureCounselorName, extractCityPrefixFromAddress, and sanitizeExportFileName format cleanly', () => {
  assert.equal(resolveSignatureCounselorName('Sari Wulandari, S.Pd.'), 'Sari Wulandari, S.Pd.');
  assert.equal(resolveSignatureCounselorName('  '), '( ........................................ )');
  assert.equal(extractCityPrefixFromAddress('Jl. Bisma No. 5, Singaraja, Bali'), 'Singaraja');
  assert.equal(sanitizeExportFileName('Surat Panggilan / Ivan (8.1)'), 'Surat_Panggilan_Ivan_8.1');
});
