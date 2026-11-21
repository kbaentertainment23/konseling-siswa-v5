import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useSibk } from '../context/SibkContext';
import type { MonitoringStatus, ProgressLevel, Student } from '../types/sibk';
import { formatDateShort, getStudentsNeedingAttention, getTodayISO } from '../utils/sibkLogic';

interface MonitoringViewProps {
  onSelectStudent: (student: Student) => void;
}

const MONITORING_STATUSES: MonitoringStatus[] = [
  'Normal',
  'Perlu Perhatian',
  'Dalam Pemantauan',
  'Prioritas Tinggi',
];

export const MonitoringView: React.FC<MonitoringViewProps> = ({ onSelectStudent }) => {
  const {
    classes,
    students,
    attendance,
    cases,
    monitoringNotes,
    settings,
    currentUser,
    addMonitoringNote,
    updateStudentMonitoringStatus,
  } = useSibk();

  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [noteDate, setNoteDate] = useState(getTodayISO());
  const [progressLevel, setProgressLevel] = useState<ProgressLevel>('Stabil');
  const [observation, setObservation] = useState('');

  const activeClasses = useMemo(() => classes.filter((c) => !c.archived), [classes]);

  const attentionList = useMemo(
    () => getStudentsNeedingAttention(students, attendance, cases, settings),
    [students, attendance, cases, settings]
  );

  const filteredAttentionList = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return attentionList.filter((item) => {
      const matchClass = selectedClassId === 'all' || item.student.classId === selectedClassId;
      const matchQuery =
        !q ||
        item.student.fullName.toLowerCase().includes(q) ||
        item.student.nis.toLowerCase().includes(q);
      return matchClass && matchQuery;
    });
  }, [attentionList, selectedClassId, studentSearch]);

  const selectedItem =
    filteredAttentionList.find((x) => x.student.id === selectedStudentId) ||
    filteredAttentionList[0];

  const selectedNotes = selectedItem
    ? monitoringNotes
        .filter((n) => n.studentId === selectedItem.student.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !observation.trim()) return;
    await addMonitoringNote({
      studentId: selectedItem.student.id,
      date: noteDate,
      counselorName: currentUser?.name || 'Guru BK',
      observation: observation.trim(),
      progressLevel,
    });
    setObservation('');
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pemantauan Siswa Berkebutuhan Khusus BK</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Pilih kelas terlebih dahulu, lalu pilih siswa yang ingin dipantau perkembangannya
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step-by-Step Class -> Student Selector Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 self-start">
          <div>
            <label
              htmlFor="monitoring-class-select"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              1. Pilih Kelas
            </label>
            <select
              id="monitoring-class-select"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStudentId('');
              }}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-sky-600"
            >
              <option value="all">Semua Kelas ({attentionList.length} siswa)</option>
              {activeClasses.map((cls) => {
                const countInClass = attentionList.filter((x) => x.student.classId === cls.id).length;
                return (
                  <option key={cls.id} value={cls.id}>
                    Kelas {cls.name} ({countInClass} siswa)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label
              htmlFor="monitoring-student-select"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              2. Pilih Siswa
            </label>
            <select
              id="monitoring-student-select"
              value={selectedItem?.student.id || ''}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              disabled={filteredAttentionList.length === 0}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-sky-600 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {filteredAttentionList.length === 0 ? (
                <option value="">Tidak ada siswa perlu pemantauan di kelas ini</option>
              ) : (
                filteredAttentionList.map((item) => (
                  <option key={item.student.id} value={item.student.id}>
                    {item.student.fullName} — {item.student.className} ({item.caseCount} kasus)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="relative mb-2.5">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Cari cepat nama / NIS..."
                aria-label="Cari siswa dalam pemantauan"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-sky-600"
              />
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {filteredAttentionList.length === 0 ? (
                <div className="p-4 text-xs text-slate-400 text-center">
                  Tidak ada siswa yang sesuai filter kelas/pencarian.
                </div>
              ) : (
                filteredAttentionList.map((item) => {
                  const active = selectedItem?.student.id === item.student.id;
                  return (
                    <button
                      key={item.student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(item.student.id)}
                      className={`w-full p-3 text-left transition-colors ${
                        active ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {item.student.fullName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 shrink-0">
                          {item.student.className}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {item.reasons.join(' · ')}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Monitoring Detail & Development Notes */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          {!selectedItem ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Pilih kelas dan siswa di panel kiri untuk melihat serta menambah catatan perkembangan.
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <button
                    type="button"
                    onClick={() => onSelectStudent(selectedItem.student)}
                    className="text-base font-bold text-slate-900 hover:text-sky-700"
                  >
                    {selectedItem.student.fullName}
                  </button>
                  <div className="text-xs text-slate-500 font-mono">
                    NIS {selectedItem.student.nis} · Kelas {selectedItem.student.className} ·{' '}
                    {selectedItem.caseCount} kasus · {selectedItem.absenceCount} ketidakhadiran
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <label htmlFor="mon-status" className="text-slate-500">
                    Status:
                  </label>
                  <select
                    id="mon-status"
                    value={selectedItem.student.monitoringStatus}
                    onChange={(e) =>
                      updateStudentMonitoringStatus(
                        selectedItem.student.id,
                        e.target.value as MonitoringStatus
                      )
                    }
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    {MONITORING_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Add Periodic Development Note */}
              <form
                onSubmit={handleAddNote}
                className="space-y-3 text-xs bg-slate-50/60 p-4 rounded-xl border border-slate-200"
              >
                <div className="font-semibold text-slate-900">
                  Tambah Catatan Perkembangan Berkala
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">Tanggal Observasi</label>
                    <input
                      type="date"
                      value={noteDate}
                      onChange={(e) => setNoteDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Tren Perkembangan</label>
                    <select
                      value={progressLevel}
                      onChange={(e) => setProgressLevel(e.target.value as ProgressLevel)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="Membaik">Membaik</option>
                      <option value="Stabil">Stabil</option>
                      <option value="Perlu Perhatian">Perlu Perhatian</option>
                      <option value="Menurun">Menurun</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Catatan Observasi Perilaku *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Catat perubahan perilaku, kehadiran, atau respons siswa terhadap pembinaan..."
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E3A5F] hover:bg-[#162C49] rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" /> Simpan Catatan
                  </button>
                </div>
              </form>

              {/* Notes Timeline */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-900">
                  Riwayat Perkembangan ({selectedNotes.length})
                </h3>
                {selectedNotes.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada catatan perkembangan berkala.</p>
                ) : (
                  selectedNotes.map((n) => (
                    <div key={n.id} className="border border-slate-200 rounded-xl p-3.5 text-xs">
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="font-mono">
                          {formatDateShort(n.date)} · {n.counselorName}
                        </span>
                        <span className="font-semibold text-slate-900">{n.progressLevel}</span>
                      </div>
                      <p className="text-slate-700">{n.observation}</p>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
