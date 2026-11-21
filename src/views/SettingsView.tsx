import React, { useEffect, useState } from 'react';
import {
  Save,
  Plus,
  X,
  Download,
  HardDrive,
  CheckCircle2,
  ExternalLink,
  Building2,
  ShieldAlert,
  Users,
  Database,
  Copy,
  Check,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { useSibk } from '../context/SibkContext';
import type { SystemSettings } from '../types/sibk';
import {
  connectGoogleDrive,
  extractDriveFolderId,
  getConnectedDriveEmail,
  getDriveAccessToken,
  subscribeSharedDriveSession,
  uploadPhotoToGoogleDrive,
} from '../lib/googleDrive';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { ErrorToast } from '../components/ErrorToast';

type SettingsTab = 'school' | 'rules' | 'counselors' | 'storage';

export const SettingsView: React.FC = () => {
  const {
    settings,
    students,
    classes,
    attendance,
    cases,
    counselingLogs,
    parentCalls,
    monitoringNotes,
    schedules,
    users,
    auditLogs,
    saveSettings,
    restoreFromBackupJSON,
  } = useSibk();

  const [activeTab, setActiveTab] = useState<SettingsTab>('school');
  const [form, setForm] = useState<SystemSettings>({
    ...settings,
    schoolLogoUrl: settings.schoolLogoUrl || '',
    counselors: settings.counselors || [],
    driveFolderUrl: settings.driveFolderUrl || '',
  });

  useEffect(() => {
    setForm({
      ...settings,
      schoolLogoUrl: settings.schoolLogoUrl || '',
      counselors: settings.counselors || [],
      driveFolderUrl: settings.driveFolderUrl || '',
    });
  }, [settings]);

  const [logoError, setLogoError] = useState('');
  const [errorToast, setErrorToast] = useState('');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');
    setErrorToast('');

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (file.size === 0) {
      const msg = `File logo "${file.name}" kosong (0 KB) dan tidak dapat dimuat.`;
      setLogoError(msg);
      setErrorToast(msg);
      e.target.value = '';
      return;
    }
    if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
      const msg = 'Format HEIC/HEIF tidak didukung. Gunakan logo berformat PNG, JPG, atau WEBP.';
      setLogoError(msg);
      setErrorToast(msg);
      e.target.value = '';
      return;
    }
    if (file.type && !file.type.startsWith('image/')) {
      const msg = `File "${file.name}" bukan file gambar yang valid. Pilih file PNG, JPG, atau WEBP.`;
      setLogoError(msg);
      setErrorToast(msg);
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const msg = `Ukuran file logo terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maksimal 10 MB.`;
      setLogoError(msg);
      setErrorToast(msg);
      e.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const msg = `Logo "${file.name}" gagal dimuat. Pastikan file gambar tidak rusak dan berformat PNG/JPG/WEBP.`;
      setLogoError(msg);
      setErrorToast(msg);
    };
    img.onload = () => {
      try {
        const maxDim = 220;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          setForm((prev) => ({
            ...prev,
            schoolLogoUrl: canvas.toDataURL(mime, 0.85),
          }));
        }
      } catch {
        const msg = 'Gagal memproses logo sekolah. Coba pilih gambar dengan ukuran lebih kecil.';
        setLogoError(msg);
        setErrorToast(msg);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.src = objectUrl;
    e.target.value = '';
  };

  const [newCategory, setNewCategory] = useState('');
  const [newCounselor, setNewCounselor] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{
    type: 'category' | 'counselor';
    value: string;
  } | null>(null);
  const [restorePayload, setRestorePayload] = useState<Record<string, unknown> | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(
    getDriveAccessToken() ? getConnectedDriveEmail() : null
  );

  useEffect(() => {
    return subscribeSharedDriveSession(({ email, connected }) => {
      setDriveEmail(connected ? email : null);
    });
  }, []);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [testingUpload, setTestingUpload] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    link?: string;
  } | null>(null);

  const parsedFolderId = extractDriveFolderId(form.driveFolderUrl);

  const handleConnectDrive = async (): Promise<string | null> => {
    setDriveError('');
    setDriveConnecting(true);
    try {
      const res = await connectGoogleDrive();
      setDriveEmail(res.email || 'Akun Google Terhubung');
      return res.accessToken;
    } catch (err) {
      setDriveError(
        err instanceof Error ? err.message : 'Gagal menghubungkan akun Google Drive.'
      );
      return null;
    } finally {
      setDriveConnecting(false);
    }
  };

  const handleTestDriveUpload = async () => {
    setTestingUpload(true);
    setTestResult(null);
    setDriveError('');
    try {
      let token = getDriveAccessToken();
      if (!token) {
        token = await handleConnectDrive();
      }
      if (!token) {
        setTestingUpload(false);
        return;
      }
      const tinyJpeg =
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      const res = await uploadPhotoToGoogleDrive({
        dataUrl: tinyJpeg,
        fileName: `Tes_Koneksi_SIBK_${Date.now()}.jpg`,
        folderUrlOrId: form.driveFolderUrl,
        accessToken: token,
      });
      setTestResult({
        ok: true,
        message: 'Tes upload berhasil! File tes sudah masuk ke folder Google Drive tujuan.',
        link: res.webViewLink,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Tes upload gagal.',
      });
    } finally {
      setTestingUpload(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await saveSettings(form);
      setSavedMsg('Pengaturan sistem berhasil disimpan.');
      setTimeout(() => setSavedMsg(''), 3500);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = () => {
    const val = newCategory.trim();
    if (!val || form.categories.includes(val)) return;
    setForm({ ...form, categories: [...form.categories, val] });
    setNewCategory('');
  };

  const handleRemoveCategory = (cat: string) => {
    setForm({ ...form, categories: form.categories.filter((c) => c !== cat) });
  };

  const handleAddCounselor = () => {
    const val = newCounselor.trim();
    const list = form.counselors || [];
    if (!val || list.includes(val)) return;
    setForm({ ...form, counselors: [...list, val] });
    setNewCounselor('');
  };

  const handleRemoveCounselor = (name: string) => {
    setForm({
      ...form,
      counselors: (form.counselors || []).filter((c) => c !== name),
    });
  };

  const handleBackupJSON = () => {
    const payload = {
      backupVersion: 2,
      exportedAt: new Date().toISOString(),
      settings,
      classes,
      students,
      attendance,
      cases,
      counselingLogs,
      parentCalls,
      monitoringNotes,
      schedules,
      users,
      auditLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_SIBK_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const hasKnownKey = [
        'settings',
        'classes',
        'students',
        'attendance',
        'cases',
        'counselingLogs',
        'parentCalls',
        'monitoringNotes',
        'schedules',
        'users',
      ].some((k) => k in parsed);
      if (!hasKnownKey) {
        setRestorePayload(null);
        setRestoreFileName('');
        setRestoreError('Format file JSON tidak dikenali sebagai file backup SIBK.');
        return;
      }
      setRestorePayload(parsed);
      setRestoreFileName(file.name);
    } catch {
      setRestorePayload(null);
      setRestoreFileName('');
      setRestoreError('Gagal membaca file JSON. Pastikan file backup valid dan tidak rusak.');
    } finally {
      e.target.value = '';
    }
  };

  const handleExecuteRestore = async () => {
    if (!restorePayload) return;
    setRestoring(true);
    setRestoreError('');
    try {
      const count = await restoreFromBackupJSON(restorePayload);
      setRestorePayload(null);
      setRestoreFileName('');
      setSavedMsg(
        `Pemulihan selesai! ${count} data berhasil dipulihkan ke Firebase Firestore (termasuk pengaturan Google Drive & tautan foto kasus).`
      );
      setTimeout(() => setSavedMsg(''), 6000);
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : 'Gagal memulihkan data ke database.'
      );
    } finally {
      setRestoring(false);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'school',
      label: 'Identitas Sekolah',
      icon: <Building2 className="w-4 h-4" />,
    },
    {
      id: 'rules',
      label: 'Batas & Kategori BK',
      icon: <ShieldAlert className="w-4 h-4" />,
      badge: String(form.categories.length),
    },
    {
      id: 'counselors',
      label: 'Guru BK Pendamping',
      icon: <Users className="w-4 h-4" />,
      badge: String((form.counselors || []).length),
    },
    {
      id: 'storage',
      label: 'Google Drive & Backup',
      icon: <Database className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-5 w-full">
      {/* Header with primary Save action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pengaturan Sistem SIBK</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola identitas sekolah, aturan kasus BK, daftar guru BK, dan penyimpanan Google Drive
            dalam tab terstruktur.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSave()}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1E3A5F] hover:bg-[#162C49] rounded-lg self-start sm:self-auto shadow-xs disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}
        </button>
      </div>

      {savedMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {/* Clean Tab Navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-[#1E3A5F] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <form onSubmit={handleSave} className="text-xs">
        {/* TAB 1: Identitas Sekolah & Tahun Ajaran */}
        {activeTab === 'school' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Identitas Sekolah & Tahun Ajaran Aktif
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Informasi dan logo ini digunakan otomatis sebagai Kop Surat resmi pada laporan PDF,
                Excel, dan surat pemanggilan orang tua.
              </p>
            </div>

            {/* School Logo Uploader */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                {form.schoolLogoUrl ? (
                  <img
                    src={form.schoolLogoUrl}
                    alt="Logo Sekolah"
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <Building2 className="w-7 h-7 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="font-semibold text-slate-900">Logo Sekolah (Kop Laporan PDF)</div>
                <p className="text-[11px] text-slate-500">
                  Unggah logo sekolah format PNG atau JPG. Logo otomatis tampil di sisi kiri Kop
                  Surat saat mencetak laporan PDF &amp; surat pemanggilan.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{form.schoolLogoUrl ? 'Ganti Logo' : 'Unggah Logo Sekolah'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                  {form.schoolLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, schoolLogoUrl: '' })}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-700 hover:bg-red-50 font-medium"
                    >
                      <X className="w-3.5 h-3.5" /> Hapus Logo
                    </button>
                  )}
                </div>
                {logoError && (
                  <div
                    role="alert"
                    className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-[11px] text-red-800"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                    <span className="flex-1 font-medium">{logoError}</span>
                    <button
                      type="button"
                      onClick={() => setLogoError('')}
                      aria-label="Tutup pesan error logo"
                      className="text-red-500 hover:text-red-800"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Baris 1 Kop Surat (Pemerintah Daerah)
                </label>
                <input
                  placeholder="PEMERINTAH KABUPATEN BULELENG"
                  value={form.letterheadLine1 || ''}
                  onChange={(e) => setForm({ ...form, letterheadLine1: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Baris 2 Kop Surat (Dinas Pendidikan)
                </label>
                <input
                  placeholder="DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA"
                  value={form.letterheadLine2 || ''}
                  onChange={(e) => setForm({ ...form, letterheadLine2: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Baris 3 Kop Surat (Nama Sekolah)
                </label>
                <input
                  placeholder="SMP NEGERI 6 SINGARAJA"
                  value={form.schoolName}
                  onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Telepon Sekolah</label>
                <input
                  placeholder="(0362) 21xxx"
                  value={form.schoolPhone}
                  onChange={(e) => setForm({ ...form, schoolPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Baris 4 Kop Surat (Jalan, Kode Pos, Provinsi)
                </label>
                <input
                  placeholder="Jl. ..., Kode Pos 81119, Bali"
                  value={form.schoolAddress}
                  onChange={(e) => setForm({ ...form, schoolAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Baris 5 Kop Surat (Alamat Email &amp; Sosial Media)
                </label>
                <input
                  placeholder="Email: smpn6singaraja@gmail.com · Website/IG: @smpn6singaraja"
                  value={form.schoolEmailSocial || ''}
                  onChange={(e) => setForm({ ...form, schoolEmailSocial: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div className="sm:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                  Pratinjau Kop Surat PDF
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-4">
                    {form.schoolLogoUrl && (
                      <img
                        src={form.schoolLogoUrl}
                        alt="Logo Kop"
                        className="w-14 h-14 object-contain shrink-0"
                      />
                    )}
                    <div className="flex-1 text-center leading-tight space-y-0.5">
                      <div className="text-xs font-bold text-slate-900 uppercase">
                        {form.letterheadLine1 || 'PEMERINTAH KABUPATEN BULELENG'}
                      </div>
                      <div className="text-xs font-bold text-slate-900 uppercase">
                        {form.letterheadLine2 || 'DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA'}
                      </div>
                      <div className="text-sm font-extrabold text-slate-950 uppercase">
                        {form.schoolName || 'SMP NEGERI 6 SINGARAJA'}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {form.schoolAddress || 'Alamat sekolah...'}
                        {form.schoolPhone &&
                        !(form.schoolAddress || '')
                          .toLowerCase()
                          .includes(form.schoolPhone.toLowerCase())
                          ? `, Telp. ${form.schoolPhone}`
                          : ''}
                      </div>
                      {form.schoolEmailSocial && (
                        <div className="text-[11px] text-slate-500">{form.schoolEmailSocial}</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 border-t-2 border-slate-900 pt-0.5">
                    <div className="border-t border-slate-900" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nama Kepala Sekolah</label>
                <input
                  value={form.principalName}
                  onChange={(e) => setForm({ ...form, principalName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">NIP Kepala Sekolah</label>
                <input
                  value={form.principalNip}
                  onChange={(e) => setForm({ ...form, principalNip: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tahun Ajaran Aktif</label>
                <input
                  value={form.activeAcademicYear}
                  onChange={(e) => setForm({ ...form, activeAcademicYear: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Semester Aktif</label>
                <select
                  value={form.activeSemester}
                  onChange={(e) =>
                    setForm({ ...form, activeSemester: e.target.value as 'Ganjil' | 'Genap' })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-sky-600"
                >
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  Format Nomor Surat / Laporan
                </label>
                <input
                  value={form.reportNumberFormat}
                  onChange={(e) => setForm({ ...form, reportNumberFormat: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Batas Peringatan & Kategori Permasalahan */}
        {activeTab === 'rules' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Batas Peringatan Kasus & Pemanggilan Orang Tua
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Notifikasi otomatis muncul di Dashboard saat jumlah kasus baru siswa mencapai
                  batas berikut.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
                  <label className="block font-medium text-slate-700 mb-1.5">
                    Peringatan Pertama (Kasus ke-)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.warningThreshold1}
                    onChange={(e) =>
                      setForm({ ...form, warningThreshold1: Number(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-mono"
                  />
                </div>
                <div className="p-3.5 rounded-lg bg-amber-50/50 border border-amber-200/70">
                  <label className="block font-medium text-amber-900 mb-1.5">
                    Peringatan Kedua (Kasus ke-)
                  </label>
                  <input
                    type="number"
                    min={2}
                    value={form.warningThreshold2}
                    onChange={(e) =>
                      setForm({ ...form, warningThreshold2: Number(e.target.value) || 2 })
                    }
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg bg-white font-mono"
                  />
                </div>
                <div className="p-3.5 rounded-lg bg-red-50/50 border border-red-200/70">
                  <label className="block font-medium text-red-900 mb-1.5">
                    Batas Maksimal / Panggil Ortu
                  </label>
                  <input
                    type="number"
                    min={2}
                    value={form.maxCaseThreshold}
                    onChange={(e) =>
                      setForm({ ...form, maxCaseThreshold: Number(e.target.value) || 4 })
                    }
                    className="w-full px-3 py-2 border border-red-200 rounded-lg bg-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Batas Ketidakhadiran Siswa (Pemanggilan ke BK)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jika jumlah Sakit, Izin, atau Alfa siswa mencapai/melewati batas berikut, sistem
                  otomatis menampilkan notifikasi peringatan pemanggilan siswa ke BK di Dashboard
                  beserta angka notifikasi di samping menu Dashboard.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-lg bg-sky-50/50 border border-sky-200/70">
                  <label className="block font-medium text-sky-900 mb-1.5">
                    Batas Maksimal Sakit (hari)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxSickThreshold ?? 5}
                    onChange={(e) =>
                      setForm({ ...form, maxSickThreshold: Number(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-sky-200 rounded-lg bg-white font-mono"
                  />
                </div>
                <div className="p-3.5 rounded-lg bg-amber-50/50 border border-amber-200/70">
                  <label className="block font-medium text-amber-900 mb-1.5">
                    Batas Maksimal Izin (hari)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxPermissionThreshold ?? 5}
                    onChange={(e) =>
                      setForm({ ...form, maxPermissionThreshold: Number(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-amber-200 rounded-lg bg-white font-mono"
                  />
                </div>
                <div className="p-3.5 rounded-lg bg-red-50/50 border border-red-200/70">
                  <label className="block font-medium text-red-900 mb-1.5">
                    Batas Maksimal Alfa (hari)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxAlphaThreshold ?? 3}
                    onChange={(e) =>
                      setForm({ ...form, maxAlphaThreshold: Number(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-red-200 rounded-lg bg-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Kategori Permasalahan Siswa
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar kategori yang tersedia saat mencatat kasus baru.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="Tambah kategori baru (contoh: Perundungan, Kedisiplinan)..."
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {form.categories.map((cat) => (
                  <div
                    key={cat}
                    className="px-3 py-2 flex items-center justify-between border border-slate-200 rounded-lg bg-slate-50/60"
                  >
                    <span className="text-slate-800 font-medium truncate">{cat}</span>
                    <button
                      type="button"
                      aria-label={`Hapus kategori ${cat}`}
                      onClick={() => setPendingDelete({ type: 'category', value: cat })}
                      className="p-1 text-slate-400 hover:text-red-700 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Daftar Guru BK Pendamping */}
        {activeTab === 'counselors' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Daftar Nama Guru BK Pendamping
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Nama-nama di bawah ini akan muncul sebagai pilihan Guru BK Pendamping saat mencatat
                kasus dan sesi konseling.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Tambah nama guru BK (contoh: Drs. Agus Salim, M.Pd.)..."
                value={newCounselor}
                onChange={(e) => setNewCounselor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCounselor();
                  }
                }}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                onClick={handleAddCounselor}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Guru BK
              </button>
            </div>
            {(form.counselors || []).length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                Belum ada nama guru BK terdaftar. Tambahkan nama guru BK di atas.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(form.counselors || []).map((name) => (
                  <div
                    key={name}
                    className="px-3.5 py-2.5 flex items-center justify-between border border-slate-200 rounded-lg bg-slate-50/60"
                  >
                    <span className="text-slate-800 font-medium">{name}</span>
                    <button
                      type="button"
                      aria-label={`Hapus guru BK ${name}`}
                      onClick={() => setPendingDelete({ type: 'counselor', value: name })}
                      className="p-1 text-slate-400 hover:text-red-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Google Drive & Backup Data */}
        {activeTab === 'storage' && (
          <div className="space-y-5">
            {/* Google Drive Photo Storage Settings */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-sky-700" />
                    Penyimpanan Foto Dokumentasi (Google Drive Bersama)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Bagikan (Share) folder Google Drive di bawah ini sebagai <strong>Editor</strong>{' '}
                    ke email guru BK (atau <em>Siapa saja yang memiliki link → Editor</em>) agar
                    guru dengan akun Google berbeda tetap bisa mengunggah foto ke folder ini.
                  </p>
                </div>
                {driveEmail ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Terhubung: {driveEmail}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={driveConnecting}
                    onClick={() => handleConnectDrive()}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium shadow-xs shrink-0 disabled:opacity-60"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                    <span>{driveConnecting ? 'Menghubungkan...' : 'Hubungkan Google Drive'}</span>
                  </button>
                )}
              </div>

              {driveError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700">
                  {driveError}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Link atau ID Folder Google Drive Tujuan
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Tempel ID Folder (misal: 1AbCdEf...) atau link https://drive.google.com/drive/folders/..."
                    value={form.driveFolderUrl || ''}
                    onChange={(e) => setForm({ ...form, driveFolderUrl: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs"
                  />
                  <button
                    type="button"
                    disabled={testingUpload}
                    onClick={handleTestDriveUpload}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 shrink-0"
                  >
                    {testingUpload ? 'Menguji...' : 'Tes Upload'}
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  {form.driveFolderUrl?.trim() ? (
                    parsedFolderId ? (
                      <span className="text-emerald-700 font-medium">
                        ID Folder terdeteksi: <code className="font-mono">{parsedFolderId}</code>
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium">
                        Format link/ID folder belum dikenali.
                      </span>
                    )
                  ) : (
                    <span className="text-slate-500">
                      Jika dikosongkan, foto disimpan di My Drive masing-masing akun Google yang
                      terhubung.
                    </span>
                  )}
                  {parsedFolderId && (
                    <a
                      href={`https://drive.google.com/drive/folders/${parsedFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-700 hover:underline font-medium"
                    >
                      Buka Folder <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${
                    testResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <span>{testResult.message}</span>
                  {testResult.link && (
                    <a
                      href={testResult.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold underline"
                    >
                      Lihat File Tes <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Backup & Restore Database JSON */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Cadangan Data Sistem (Backup JSON Lengkap)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Unduh seluruh data Firestore (pengaturan, logo &amp; link folder Google Drive,
                    kelas, siswa, absensi, kasus beserta tautan foto Google Drive, konseling,
                    pemanggilan orang tua, pemantauan, jadwal BK, pengguna, dan audit log).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleBackupJSON}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0 self-start sm:self-auto"
                >
                  <Download className="w-4 h-4" /> Unduh Backup (JSON)
                </button>
              </div>

              <div className="border-t border-slate-100 pt-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Pulihkan Data dari Backup (Restore JSON)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Unggah file <code className="font-mono">.json</code> hasil backup sebelumnya
                      jika terjadi kendala data. Seluruh data beserta tautan foto Google Drive akan
                      dipulihkan ke Firebase Firestore secara real-time.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#1E3A5F] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg cursor-pointer shrink-0 self-start sm:self-auto">
                    <Upload className="w-4 h-4" />
                    <span>Pilih File Backup (.json)</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleSelectRestoreFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {restoreError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {restoreError}
                  </div>
                )}

                {restorePayload && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-amber-950">
                        Siap Memulihkan File: <span className="font-mono">{restoreFileName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRestorePayload(null);
                          setRestoreFileName('');
                        }}
                        className="text-amber-800 hover:underline text-[11px]"
                      >
                        Batalkan
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-amber-900">
                      <div>
                        Kelas:{' '}
                        <strong>
                          {Array.isArray(restorePayload.classes) ? restorePayload.classes.length : 0}
                        </strong>
                      </div>
                      <div>
                        Siswa:{' '}
                        <strong>
                          {Array.isArray(restorePayload.students)
                            ? restorePayload.students.length
                            : 0}
                        </strong>
                      </div>
                      <div>
                        Absensi:{' '}
                        <strong>
                          {Array.isArray(restorePayload.attendance)
                            ? restorePayload.attendance.length
                            : 0}
                        </strong>
                      </div>
                      <div>
                        Kasus BK:{' '}
                        <strong>
                          {Array.isArray(restorePayload.cases) ? restorePayload.cases.length : 0}
                        </strong>
                      </div>
                      <div>
                        Konseling:{' '}
                        <strong>
                          {Array.isArray(restorePayload.counselingLogs)
                            ? restorePayload.counselingLogs.length
                            : 0}
                        </strong>
                      </div>
                      <div>
                        Panggil Ortu:{' '}
                        <strong>
                          {Array.isArray(restorePayload.parentCalls)
                            ? restorePayload.parentCalls.length
                            : 0}
                        </strong>
                      </div>
                      <div>
                        Jadwal BK:{' '}
                        <strong>
                          {Array.isArray(restorePayload.schedules)
                            ? restorePayload.schedules.length
                            : 0}
                        </strong>
                      </div>
                      <div>
                        Pengaturan &amp; Drive:{' '}
                        <strong>{restorePayload.settings ? 'Ada' : 'Tidak ada'}</strong>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={restoring}
                        onClick={handleExecuteRestore}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {restoring ? 'Memulihkan ke Firebase...' : 'Pulihkan ke Database Sekarang'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </form>

      <ConfirmDeleteModal
        open={Boolean(pendingDelete)}
        title={
          pendingDelete?.type === 'category'
            ? 'Hapus Kategori Permasalahan?'
            : 'Hapus Nama Guru BK Pendamping?'
        }
        itemName={pendingDelete?.value}
        description="Item ini akan dihapus dari daftar pengaturan. Jangan lupa klik Simpan Semua Pengaturan setelah selesai."
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.type === 'category') {
            handleRemoveCategory(pendingDelete.value);
          } else {
            handleRemoveCounselor(pendingDelete.value);
          }
          setPendingDelete(null);
        }}
      />

      <ErrorToast message={errorToast} onClose={() => setErrorToast('')} />
    </div>
  );
};
