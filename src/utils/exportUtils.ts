import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  AttendanceRecord,
  CounselingLog,
  MonitoringNote,
  ParentCall,
  Student,
  StudentCase,
  SystemSettings,
} from '../types/sibk';
import { formatDateLong, formatDateShort, getTodayISO } from './sibkLogic';
import {
  buildTablePdfSummaryText,
  computeExcelSummaryRow,
  extractCityPrefixFromAddress,
  getParentCallLetterMinutes,
  inferPdfColumnStyles,
  resolveSignatureCounselorName,
  sanitizeExportFileName,
} from './exportFormatLogic';

export interface ExcelExportMeta {
  title?: string;
  subtitle?: string;
  settings?: SystemSettings;
}

export function exportToExcel(
  rows: Array<Record<string, unknown>>,
  fileName: string,
  sheetName = 'Data',
  meta?: ExcelExportMeta
) {
  const wb = XLSX.utils.book_new();
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const aoa: Array<Array<string | number>> = [];

  if (meta?.settings) {
    aoa.push([meta.settings.schoolName.toUpperCase()]);
    aoa.push([`${meta.settings.schoolAddress} | Telp: ${meta.settings.schoolPhone}`]);
    if (meta.title) aoa.push([meta.title.toUpperCase()]);
    aoa.push([
      `${meta.subtitle ? `${meta.subtitle} | ` : ''}Tahun Ajaran ${meta.settings.activeAcademicYear} (${meta.settings.activeSemester}) | Dicetak: ${formatDateLong(getTodayISO())}`,
    ]);
    aoa.push([]); // Blank separator row
  }

  const summaryRow = computeExcelSummaryRow(headers, rows);

  if (headers.length > 0) {
    aoa.push(headers);
    for (const row of rows) {
      aoa.push(
        headers.map((h) => {
          const val = row[h];
          return typeof val === 'number' ? val : String(val ?? '');
        })
      );
    }
    if (summaryRow) {
      aoa.push(summaryRow);
    }
  } else {
    aoa.push(['Tidak ada data untuk diekspor']);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-size columns accounting for headers, rows, and summary row
  const colCount = Math.max(headers.length, 1);
  const startRow = meta?.settings ? 5 : 0;
  const colWidths = Array.from({ length: colCount }, (_, colIdx) => {
    let maxLen = 12;
    for (let r = startRow; r < aoa.length; r += 1) {
      const cellVal = String(aoa[r]?.[colIdx] ?? '');
      if (cellVal.length > maxLen) maxLen = cellVal.length;
    }
    return { wch: Math.min(maxLen + 4, 48) };
  });
  ws['!cols'] = colWidths;

  // Merge top Kop header rows across all table columns
  if (meta?.settings && colCount > 1) {
    const mergeRows = meta.title ? [0, 1, 2, 3] : [0, 1, 2];
    ws['!merges'] = mergeRows.map((r) => ({
      s: { r, c: 0 },
      e: { r, c: colCount - 1 },
    }));
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${sanitizeExportFileName(fileName)}.xlsx`);
}

export function downloadStudentImportTemplate(className: string, academicYear: string): void {
  const wb = XLSX.utils.book_new();
  const entryYear = academicYear.split('/')[0] || String(new Date().getFullYear());

  const templateRows = [
    {
      NIS: '2026001',
      NISN: '0012345678',
      'Nama Lengkap': 'Contoh Nama Siswa (Hapus baris ini)',
      'Jenis Kelamin': 'Laki-laki',
      'Tempat Lahir': 'Jakarta',
      'Tanggal Lahir': '2012-05-14',
      Agama: 'Islam',
      Alamat: 'Jl. Merdeka No. 10',
      'HP Siswa': '081234567890',
      'Nama Ayah': 'Budi Santoso',
      'Nama Ibu': 'Siti Aminah',
      'Nama Wali': '',
      'HP Orang Tua': '081298765432',
      'Alamat Orang Tua': 'Jl. Merdeka No. 10',
      'Tahun Masuk': entryYear,
      Catatan: '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateRows);
  const headers = Object.keys(templateRows[0]);
  ws['!cols'] = headers.map((h) => ({
    wch: Math.max(h.length + 4, h === 'Nama Lengkap' || h === 'Alamat' ? 28 : 16),
  }));
  XLSX.utils.book_append_sheet(wb, ws, `Siswa_${className}`.slice(0, 31));

  const guideRows = [
    { Kolom: 'NIS', Wajib: 'Ya', Format_Contoh: '2026001', Keterangan: 'Nomor Induk Siswa (identitas utama)' },
    { Kolom: 'NISN', Wajib: 'Opsional', Format_Contoh: '0012345678', Keterangan: 'Nomor Induk Siswa Nasional' },
    { Kolom: 'Nama Lengkap', Wajib: 'Ya', Format_Contoh: 'Ahmad Fauzi', Keterangan: 'Nama lengkap sesuai dokumen resmi' },
    { Kolom: 'Jenis Kelamin', Wajib: 'Ya', Format_Contoh: 'Laki-laki / Perempuan', Keterangan: 'Isi Laki-laki atau Perempuan (L/P juga dikenali)' },
    { Kolom: 'Tempat Lahir', Wajib: 'Opsional', Format_Contoh: 'Bandung', Keterangan: 'Kota/kabupaten tempat lahir' },
    { Kolom: 'Tanggal Lahir', Wajib: 'Opsional', Format_Contoh: '2012-05-14', Keterangan: 'Format YYYY-MM-DD' },
    { Kolom: 'Agama', Wajib: 'Opsional', Format_Contoh: 'Islam', Keterangan: 'Islam, Kristen, Katolik, Hindu, Buddha, Konghucu' },
    { Kolom: 'Alamat', Wajib: 'Opsional', Format_Contoh: 'Jl. Merdeka No. 10', Keterangan: 'Alamat tempat tinggal siswa' },
    { Kolom: 'HP Siswa', Wajib: 'Opsional', Format_Contoh: '081234567890', Keterangan: 'Nomor HP/WA aktif siswa' },
    { Kolom: 'Nama Ayah / Ibu / Wali', Wajib: 'Opsional', Format_Contoh: 'Budi Santoso', Keterangan: 'Nama orang tua atau wali siswa' },
    { Kolom: 'HP Orang Tua', Wajib: 'Opsional', Format_Contoh: '081298765432', Keterangan: 'Nomor HP/WA orang tua untuk pemanggilan BK' },
    { Kolom: 'Tahun Masuk', Wajib: 'Opsional', Format_Contoh: entryYear, Keterangan: 'Tahun masuk siswa' },
    { Kolom: 'Catatan', Wajib: 'Opsional', Format_Contoh: '-', Keterangan: 'Catatan tambahan awal siswa' },
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 24 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan Pengisian');

  const safeClass = className.replace(/[^a-zA-Z0-9.-]/g, '_');
  XLSX.writeFile(wb, `Template_Import_Siswa_Kelas_${safeClass}.xlsx`);
}

export async function parseStudentsExcel(
  file: File,
  defaultClassId: string,
  defaultClassName: string,
  academicYear: string
): Promise<Array<Omit<Student, 'id'>>> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return rawRows
    .map((r) => {
      const genderRaw = String(r['Jenis Kelamin'] || r['gender'] || 'Laki-laki');
      const gender: 'Laki-laki' | 'Perempuan' = genderRaw.toLowerCase().startsWith('p')
        ? 'Perempuan'
        : 'Laki-laki';
      return {
        nis: String(r['NIS'] || r['nis'] || '').trim(),
        nisn: String(r['NISN'] || r['nisn'] || '').trim(),
        fullName: String(r['Nama Lengkap'] || r['Nama'] || r['fullName'] || '').trim(),
        gender,
        birthPlace: String(r['Tempat Lahir'] || r['birthPlace'] || '').trim(),
        birthDate: String(r['Tanggal Lahir'] || r['birthDate'] || '').trim(),
        religion: String(r['Agama'] || r['religion'] || '').trim(),
        classId: defaultClassId,
        className: defaultClassName,
        address: String(r['Alamat'] || r['address'] || '').trim(),
        studentPhone: String(r['HP Siswa'] || r['studentPhone'] || '').trim(),
        fatherName: String(r['Nama Ayah'] || r['fatherName'] || '').trim(),
        motherName: String(r['Nama Ibu'] || r['motherName'] || '').trim(),
        guardianName: String(r['Nama Wali'] || r['guardianName'] || '').trim(),
        parentPhone: String(r['HP Orang Tua'] || r['parentPhone'] || '').trim(),
        parentAddress: String(r['Alamat Orang Tua'] || r['parentAddress'] || '').trim(),
        entryYear: String(r['Tahun Masuk'] || r['entryYear'] || academicYear.split('/')[0] || '2026').trim(),
        status: 'Aktif' as const,
        notes: String(r['Catatan'] || r['notes'] || '').trim(),
        monitoringStatus: 'Normal' as const,
        caseCount: 0,
        academicYear,
      };
    })
    .filter((s) => s.nis && s.fullName);
}

/**
 * Draws a formal Indonesian school letterhead (Kop Surat) with optional school logo.
 * Returns the Y position immediately below the double divider line.
 */
function drawSchoolLetterhead(doc: jsPDF, settings: SystemSettings): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const hasLogo = Boolean(settings.schoolLogoUrl);

  if (hasLogo && settings.schoolLogoUrl) {
    try {
      const imgFormat = settings.schoolLogoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(settings.schoolLogoUrl, imgFormat, marginX, 11, 22, 22);
    } catch {
      // Ignore invalid logo image gracefully
    }
  }

  const textCenterX = hasLogo ? (pageWidth + 16) / 2 : pageWidth / 2;

  const line1 = (settings.letterheadLine1 || 'PEMERINTAH KABUPATEN BULELENG').toUpperCase();
  const line2 = (
    settings.letterheadLine2 || 'DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA'
  ).toUpperCase();
  const line3 = (settings.schoolName || 'SMP NEGERI 6 SINGARAJA').toUpperCase();

  const addrPart = (settings.schoolAddress || '').trim();
  const phonePart = (settings.schoolPhone || '').trim();
  const line4 =
    addrPart && phonePart && !addrPart.toLowerCase().includes(phonePart.toLowerCase())
      ? `${addrPart}, Telp. ${phonePart}`
      : addrPart || (phonePart ? `Telp. ${phonePart}` : '-');

  const line5 = (settings.schoolEmailSocial || '').trim();

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(line1, textCenterX, 13.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(line2, textCenterX, 18.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(line3, textCenterX, 24.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(51, 65, 85);
  doc.text(line4, textCenterX, 29.5, { align: 'center' });

  if (line5) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(line5, textCenterX, 33.8, { align: 'center' });
  }

  const dividerY = line5 ? 37 : 34;

  // Formal double-line Kop Surat divider
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.9);
  doc.line(marginX, dividerY, pageWidth - marginX, dividerY);
  doc.setLineWidth(0.25);
  doc.line(marginX, dividerY + 1.4, pageWidth - marginX, dividerY + 1.4);

  doc.setTextColor(15, 23, 42);
  return dividerY + 7;
}

/**
 * Stamps accurate "Halaman X dari Y" footers on every page after all content is rendered.
 */
function applyPdfPageFooters(doc: jsPDF, schoolName: string, marginX = 14) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${schoolName || 'Sekolah'} — Sistem Informasi Bimbingan dan Konseling (SIBK)`,
      marginX,
      pageHeight - 7.5
    );
    doc.text(`Halaman ${page} dari ${totalPages}`, pageWidth - marginX, pageHeight - 7.5, {
      align: 'right',
    });
  }
}

function drawDualSignatureBlock(params: {
  doc: jsPDF;
  startY: number;
  marginX: number;
  settings: SystemSettings;
  counselorName?: string;
  dateISO?: string;
}) {
  const { doc, marginX, settings, counselorName, dateISO } = params;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let sigY = params.startY;
  if (sigY + 38 > pageHeight - 16) {
    doc.addPage();
    sigY = 24;
  }

  const cityPrefix = extractCityPrefixFromAddress(settings.schoolAddress);
  const formattedDate = formatDateLong(dateISO || getTodayISO());
  const dateLine = cityPrefix ? `${cityPrefix}, ${formattedDate}` : formattedDate;
  const rightSigX = pageWidth - marginX - 66;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  // Left: Principal
  doc.text('Mengetahui,', marginX + 4, sigY);
  doc.text('Kepala Sekolah,', marginX + 4, sigY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.principalName || '........................................', marginX + 4, sigY + 25);
  doc.setFont('helvetica', 'normal');
  doc.text(`NIP. ${settings.principalNip || '-'}`, marginX + 4, sigY + 30);

  // Right: Active BK Counselor
  doc.text(dateLine, rightSigX, sigY);
  doc.text('Guru Bimbingan dan Konseling,', rightSigX, sigY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(resolveSignatureCounselorName(counselorName), rightSigX, sigY + 25);
}

export function exportTableToPDF(
  title: string,
  subtitle: string,
  columns: string[],
  rows: Array<Array<string | number>>,
  settings: SystemSettings,
  fileName: string,
  options?: { counselorName?: string }
) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  const afterKopY = drawSchoolLetterhead(doc, settings);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(title.toUpperCase(), pageWidth / 2, afterKopY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${subtitle}  ·  Dicetak: ${formatDateLong(getTodayISO())}`, pageWidth / 2, afterKopY + 5, {
    align: 'center',
  });

  const colHints = inferPdfColumnStyles(columns);
  const columnStyles: Record<number, { halign?: 'left' | 'center' | 'right'; cellWidth?: number }> = {};
  Object.entries(colHints).forEach(([idx, hint]) => {
    columnStyles[Number(idx)] = hint;
  });

  autoTable(doc, {
    startY: afterKopY + 10,
    margin: { left: marginX, right: marginX, bottom: 20 },
    head: [columns],
    body: rows.length > 0 ? rows : [columns.map((_, idx) => (idx === 0 ? 'Tidak ada data' : '-'))],
    styles: {
      fontSize: 8,
      cellPadding: 2.6,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles,
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const lastY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ||
    afterKopY + 30;

  // Compact report summary strip right under the table
  const summaryText = buildTablePdfSummaryText(columns, rows);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, lastY + 4, pageWidth - marginX * 2, 7.5, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 58, 95);
  doc.text(summaryText, marginX + 3, lastY + 9);

  drawDualSignatureBlock({
    doc,
    startY: lastY + 20,
    marginX,
    settings,
    counselorName: options?.counselorName,
  });

  applyPdfPageFooters(doc, settings.schoolName, marginX);
  doc.save(`${sanitizeExportFileName(fileName)}.pdf`);
}

export function exportParentCallLetterPDF(
  call: ParentCall,
  settings: SystemSettings,
  options?: { counselorName?: string }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const maxTextWidth = pageWidth - marginX * 2;
  const minutes = getParentCallLetterMinutes(call);

  let y = drawSchoolLetterhead(doc, settings) + 2;

  // Meta Surat (aligned colons + date on right)
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const metaColonX = marginX + 20;
  const metaValX = metaColonX + 3;

  doc.setFont('helvetica', 'normal');
  doc.text('Nomor', marginX, y);
  doc.text(':', metaColonX, y);
  doc.setFont('helvetica', 'bold');
  doc.text(call.letterNumber || '-', metaValX, y);

  const cityPrefix = extractCityPrefixFromAddress(settings.schoolAddress);
  const letterDateText = formatDateLong(call.callDate || getTodayISO());
  doc.setFont('helvetica', 'normal');
  doc.text(cityPrefix ? `${cityPrefix}, ${letterDateText}` : letterDateText, pageWidth - marginX, y, {
    align: 'right',
  });
  y += 5.5;

  doc.text('Lampiran', marginX, y);
  doc.text(':', metaColonX, y);
  doc.text('-', metaValX, y);
  y += 5.5;

  doc.text('Perihal', marginX, y);
  doc.text(':', metaColonX, y);
  doc.setFont('helvetica', 'bold');
  doc.text('Undangan Pemanggilan Orang Tua / Wali Siswa', metaValX, y);
  y += 12;

  // Tujuan Surat
  doc.setFont('helvetica', 'normal');
  doc.text('Kepada Yth.', marginX, y);
  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Bapak/Ibu ${call.parentName || 'Orang Tua / Wali Siswa'}`, marginX, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  const studentTargetLines = doc.splitTextToSize(
    `Orang Tua / Wali dari ${call.studentName} (Kelas ${call.className})`,
    maxTextWidth
  );
  doc.text(studentTargetLines, marginX, y);
  y += studentTargetLines.length * 5.2;
  doc.text('Di Tempat', marginX, y);
  y += 10;

  // Paragraf Pembuka
  const intro =
    'Dengan hormat,\nSehubungan dengan pembinaan, pendampingan, dan koordinasi perkembangan peserta didik di sekolah, bersama ini kami mengharap kehadiran Bapak/Ibu Orang Tua/Wali siswa pada:';
  const introLines = doc.splitTextToSize(intro, maxTextWidth);
  doc.text(introLines, marginX, y);
  y += introLines.length * 5.2 + 4;

  // Rincian Pertemuan (dynamic height & aligned colons)
  const detailLabelX = marginX + 6;
  const detailColonX = marginX + 44;
  const detailValueX = detailColonX + 3;
  const detailValueMaxWidth = pageWidth - marginX - detailValueX;

  const drawDetailRow = (label: string, value: string, boldValue = false) => {
    const lines = doc.splitTextToSize(value || '-', detailValueMaxWidth);
    if (y + lines.length * 5.2 > pageHeight - 30) {
      doc.addPage();
      y = 22;
    }
    doc.setFont('helvetica', 'normal');
    doc.text(label, detailLabelX, y);
    doc.text(':', detailColonX, y);
    doc.setFont('helvetica', boldValue ? 'bold' : 'normal');
    doc.text(lines, detailValueX, y);
    y += Math.max(lines.length * 5.2, 5.2) + 1.5;
  };

  drawDetailRow('Hari / Tanggal / Jam', minutes.formattedSchedule, true);
  drawDetailRow('Tempat', `Ruang Bimbingan dan Konseling ${settings.schoolName}`);
  drawDetailRow('Keperluan / Alasan', call.reason || '-');
  y += 4;

  // Paragraf Penutup (dynamic after reason)
  const closing =
    'Mengingat pentingnya pertemuan ini demi kebaikan dan perkembangan putra/putri Bapak/Ibu, kami sangat mengharapkan kehadiran tepat pada waktunya. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.';
  const closingLines = doc.splitTextToSize(closing, maxTextWidth);
  if (y + closingLines.length * 5.2 > pageHeight - 50) {
    doc.addPage();
    y = 22;
  }
  doc.setFont('helvetica', 'normal');
  doc.text(closingLines, marginX, y);
  y += closingLines.length * 5.2 + 8;

  // Optional Meeting Minutes Box when status is Hadir / Selesai and results exist
  if (minutes.hasMeetingMinutes) {
    const boxLines: Array<{ label: string; value: string }> = [
      { label: 'Status Kehadiran', value: call.status },
    ];
    if (minutes.meetingResult) {
      boxLines.push({ label: 'Hasil Pertemuan', value: minutes.meetingResult });
    }
    if (minutes.agreement) {
      boxLines.push({ label: 'Kesepakatan', value: minutes.agreement });
    }
    if (minutes.followUpNote) {
      boxLines.push({ label: 'Tindak Lanjut', value: minutes.followUpNote });
    }

    const boxPadding = 4;
    const labelColW = 34;
    const valMaxW = maxTextWidth - boxPadding * 2 - labelColW - 4;
    let totalLinesCount = 0;
    const wrappedEntries = boxLines.map((entry) => {
      const lines = doc.splitTextToSize(entry.value, valMaxW);
      totalLinesCount += lines.length;
      return { label: entry.label, lines };
    });
    const boxHeight = 10 + totalLinesCount * 4.8 + wrappedEntries.length * 1.5;

    if (y + boxHeight > pageHeight - 48) {
      doc.addPage();
      y = 22;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.roundedRect(marginX, y, maxTextWidth, boxHeight, 2, 2, 'FD');

    let innerY = y + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(30, 58, 95);
    doc.text('CATATAN HASIL & KESEPAKATAN PERTEMUAN', marginX + boxPadding, innerY);
    innerY += 5.5;

    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    wrappedEntries.forEach((item) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.label}:`, marginX + boxPadding, innerY);
      doc.setFont('helvetica', 'normal');
      doc.text(item.lines, marginX + boxPadding + labelColW, innerY);
      innerY += item.lines.length * 4.8 + 1.5;
    });

    y += boxHeight + 10;
  } else {
    y += 4;
  }

  drawDualSignatureBlock({
    doc,
    startY: y,
    marginX,
    settings,
    counselorName: options?.counselorName,
    dateISO: call.callDate || getTodayISO(),
  });

  applyPdfPageFooters(doc, settings.schoolName, 14);
  doc.save(
    `${sanitizeExportFileName(`Surat_Pemanggilan_${call.studentName}_${call.letterNumber || call.callDate}`)}.pdf`
  );
}

export function exportStudentProfilePDF(params: {
  student: Student;
  attendance: AttendanceRecord[];
  cases: StudentCase[];
  counselingLogs: CounselingLog[];
  parentCalls: ParentCall[];
  monitoringNotes?: MonitoringNote[];
  settings: SystemSettings;
  counselorName?: string;
}) {
  const {
    student,
    attendance,
    cases,
    counselingLogs,
    parentCalls,
    monitoringNotes = [],
    settings,
    counselorName,
  } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  let cursorY = drawSchoolLetterhead(doc, settings);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('REKAP PROFIL & RIWAYAT BIMBINGAN KONSELING SISWA', pageWidth / 2, cursorY + 3, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Tahun Ajaran ${settings.activeAcademicYear} · Semester ${settings.activeSemester} · Dicetak ${formatDateLong(getTodayISO())}`,
    pageWidth / 2,
    cursorY + 8,
    { align: 'center' }
  );
  cursorY += 13;

  // A. Biodata Siswa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 58, 95);
  doc.text('A. BIODATA SISWA', marginX, cursorY);
  cursorY += 2;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 36, fillColor: [248, 250, 252] },
      1: { cellWidth: 55 },
      2: { fontStyle: 'bold', cellWidth: 34, fillColor: [248, 250, 252] },
      3: { cellWidth: 'auto' },
    },
    body: [
      ['Nama Lengkap', student.fullName, 'NIS / NISN', `${student.nis} / ${student.nisn || '-'}`],
      ['Kelas / Status', `Kelas ${student.className} (${student.status})`, 'Jenis Kelamin', student.gender],
      [
        'Tempat, Tgl Lahir',
        `${student.birthPlace || '-'}, ${student.birthDate || '-'}`,
        'Agama',
        student.religion || '-',
      ],
      ['Alamat', student.address || '-', 'HP Siswa', student.studentPhone || '-'],
      [
        'Orang Tua / Wali',
        [student.fatherName, student.motherName, student.guardianName].filter(Boolean).join(' / ') || '-',
        'HP Orang Tua',
        student.parentPhone || '-',
      ],
    ],
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // B. Ringkasan Absensi
  const hadir = attendance.filter((a) => a.status === 'Hadir').length;
  const sakit = attendance.filter((a) => a.status === 'Sakit').length;
  const izin = attendance.filter((a) => a.status === 'Izin').length;
  const alpa = attendance.filter((a) => a.status === 'Alpa').length;
  const dispensasi = attendance.filter((a) => a.status === 'Dispensasi').length;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 58, 95);
  doc.text('B. RINGKASAN ABSENSI', marginX, cursorY);
  cursorY += 2;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8.5, halign: 'center' },
    bodyStyles: { fontSize: 9, halign: 'center', fontStyle: 'bold' },
    head: [['Hadir', 'Sakit', 'Izin', 'Alpa', 'Dispensasi', 'Total Catatan']],
    body: [[hadir, sakit, izin, alpa, dispensasi, attendance.length]],
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // C. Riwayat Kasus BK & Konseling
  if (cursorY > pageHeight - 45) {
    doc.addPage();
    cursorY = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 58, 95);
  doc.text(`C. RIWAYAT KASUS BK & KONSELING (${cases.length} Kasus)`, marginX, cursorY);
  cursorY += 2;

  const caseRows =
    cases.length === 0
      ? [['-', 'Belum ada catatan kasus BK', '-', '-', '-']]
      : cases.map((c) => {
          const logsForCase = counselingLogs.filter((l) => l.caseId === c.id);
          const logText =
            logsForCase.length === 0
              ? 'Belum ada sesi konseling'
              : logsForCase
                  .map((l) => {
                    const extras = [
                      l.solution ? `Solusi: ${l.solution}` : '',
                      l.studentCommitment ? `Komitmen: ${l.studentCommitment}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return `[${formatDateShort(l.date)}] ${l.topic}: ${l.result} (${l.progressStatus})${
                      extras ? `\n${extras}` : ''
                    }`;
                  })
                  .join('\n\n');
          return [
            `Ke-${c.caseNumber}`,
            `${formatDateShort(c.date)}\n(${c.dayName})`,
            `${c.category}\n${c.description}`,
            c.status,
            logText,
          ];
        });

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 24 },
      2: { cellWidth: 54 },
      3: { cellWidth: 26 },
      4: { cellWidth: 'auto' },
    },
    head: [['No', 'Tanggal', 'Kategori & Uraian Kasus', 'Status', 'Riwayat Konseling']],
    body: caseRows,
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // D. Riwayat Pemanggilan Orang Tua (with Results & Agreement)
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 58, 95);
  doc.text(`D. RIWAYAT PEMANGGILAN ORANG TUA (${parentCalls.length} Kali)`, marginX, cursorY);
  cursorY += 2;

  const callRows =
    parentCalls.length === 0
      ? [['-', 'Belum ada riwayat pemanggilan orang tua', '-', '-', '-']]
      : parentCalls.map((p) => {
          const minutes = [
            p.meetingResult ? `Hasil: ${p.meetingResult}` : '',
            p.agreement ? `Kesepakatan: ${p.agreement}` : '',
            p.followUpNote ? `Tindak Lanjut: ${p.followUpNote}` : '',
          ]
            .filter(Boolean)
            .join('\n');
          return [
            `${formatDateShort(p.callDate)}${p.letterNumber ? `\n${p.letterNumber}` : ''}`,
            p.parentName || '-',
            p.reason || '-',
            minutes || '-',
            p.status || '-',
          ];
        });

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 30 },
      2: { cellWidth: 42 },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 24 },
    },
    head: [['Tanggal & No. Surat', 'Orang Tua / Wali', 'Alasan / Keperluan', 'Hasil & Kesepakatan', 'Status']],
    body: callRows,
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // E. Riwayat Pemantauan Perkembangan Siswa
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }

  const sortedNotes = [...monitoringNotes].sort((a, b) => b.date.localeCompare(a.date));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 58, 95);
  doc.text(`E. RIWAYAT PEMANTAUAN PERKEMBANGAN SISWA (${sortedNotes.length} Catatan)`, marginX, cursorY);
  cursorY += 2;

  const noteRows =
    sortedNotes.length === 0
      ? [['-', 'Belum ada catatan pemantauan perkembangan', '-', '-']]
      : sortedNotes.map((n) => [
          formatDateShort(n.date),
          n.progressLevel,
          n.observation,
          n.counselorName || '-',
        ]);

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, bottom: 18 },
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 28 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 34 },
    },
    head: [['Tanggal', 'Perkembangan', 'Catatan Observasi', 'Pendamping']],
    body: noteRows,
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

  drawDualSignatureBlock({
    doc,
    startY: finalY,
    marginX,
    settings,
    counselorName,
  });

  applyPdfPageFooters(doc, settings.schoolName, marginX);
  const safeName = sanitizeExportFileName(`Rekap_BK_${student.fullName}_${student.nis}`);
  doc.save(`${safeName}.pdf`);
}
