import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useSibk } from '../context/SibkContext';
import type { AttendanceStatus } from '../types/sibk';
import { formatDateShort } from '../utils/sibkLogic';
import { exportToExcel } from '../utils/exportUtils';

export const AttendanceRecapView: React.FC = () => {
  const { attendance, classes, settings } = useSibk();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'absent' | AttendanceStatus>('absent');

  const filtered = useMemo(() => {
    return attendance
      .filter((a) => {
        if (startDate && a.date < startDate) return false;
        if (endDate && a.date > endDate) return false;
        if (classFilter !== 'all' && a.classId !== classFilter) return false;
        if (statusFilter === 'absent') return a.status !== 'Hadir';
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.className.localeCompare(b.className));
  }, [attendance, startDate, endDate, classFilter, statusFilter]);

  const frequentAbsentees = useMemo(() => {
    const map = new Map<
      string,
      { name: string; nis: string; className: string; sakit: number; izin: number; alpa: number; total: number }
    >();
    attendance.forEach((a) => {
      if (a.status === 'Hadir' || a.status === 'Dispensasi') return;
      const curr = map.get(a.studentId) || {
        name: a.studentName,
        nis: a.nis,
        className: a.className,
        sakit: 0,
        izin: 0,
        alpa: 0,
        total: 0,
      };
      if (a.status === 'Sakit') curr.sakit++;
      if (a.status === 'Izin') curr.izin++;
      if (a.status === 'Alpa') curr.alpa++;
      curr.total++;
      map.set(a.studentId, curr);
    });
    return Array.from(map.values())
      .sort((a, b) => b.alpa - a.alpa || b.total - a.total)
      .slice(0, 6);
  }, [attendance]);

  const handleExport = () => {
    const rows = filtered.map((a) => ({
      Tanggal: formatDateShort(a.date),
      NIS: a.nis,
      'Nama Siswa': a.studentName,
      Kelas: a.className,
      Status: a.status,
      Keterangan: a.note,
      Pencatat: a.recordedBy,
    }));
    exportToExcel(rows, `Rekap_Absensi_${settings.activeAcademicYear.replace('/', '-')}`, 'Absensi', {
      title: 'Rekapitulasi Absensi Seluruh Kelas',
      subtitle: `${filtered.length} catatan kehadiran`,
      settings,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rekap Absensi Seluruh Kelas</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Otomatis mengumpulkan data kehadiran dari seluruh kelas · {filtered.length} catatan
            ditampilkan
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg self-start sm:self-auto whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" /> Export Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="block text-slate-500 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Kelas</label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
          >
            <option value="all">Semua Kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                Kelas {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Status Kehadiran</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'absent' | AttendanceStatus)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
          >
            <option value="absent">Tidak Hadir (Sakit / Izin / Alpa)</option>
            <option value="all">Semua Status</option>
            <option value="Sakit">Sakit</option>
            <option value="Izin">Izin</option>
            <option value="Alpa">Alpa</option>
            <option value="Dispensasi">Dispensasi</option>
            <option value="Hadir">Hadir</option>
          </select>
        </div>
      </div>

      {/* Main Recap Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                <th className="px-4 py-3 font-semibold">Kelas</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada catatan absensi pada filter ini.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                      {formatDateShort(a.date)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {a.studentName}
                      <span className="text-[11px] font-mono text-slate-400 ml-2">{a.nis}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{a.className}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      <span
                        className={
                          a.status === 'Alpa'
                            ? 'text-red-700'
                            : a.status === 'Sakit'
                            ? 'text-sky-700'
                            : a.status === 'Izin'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Frequent Absentees */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Siswa dengan Ketidakhadiran Terbanyak
        </h2>
        <div className="divide-y divide-slate-100 text-xs">
          {frequentAbsentees.length === 0 ? (
            <p className="text-slate-400 py-3">Belum ada data ketidakhadiran.</p>
          ) : (
            frequentAbsentees.map((item) => (
              <div key={item.nis} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <span className="font-semibold text-slate-900">{item.name}</span>
                  <span className="text-slate-500 ml-2">
                    · Kelas {item.className} · NIS {item.nis}
                  </span>
                </div>
                <div className="font-mono tabular-nums text-slate-700 whitespace-nowrap">
                  Sakit {item.sakit} · Izin {item.izin} ·{' '}
                  <strong className="text-red-700">Alpa {item.alpa}</strong>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
