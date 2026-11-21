import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

const driveProvider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => driveProvider.addScope(scope));
driveProvider.setCustomParameters({ prompt: 'select_account' });

const DRIVE_STORAGE_KEY = 'sibk_gdrive_session';
const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes (Google OAuth access token lasts 60 min)

interface StoredDriveSession {
  accessToken: string;
  email: string | null;
  expiresAt: number;
}

function loadStoredDriveSession(): StoredDriveSession | null {
  try {
    const raw = localStorage.getItem(DRIVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDriveSession;
    if (!parsed.accessToken || Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(DRIVE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredDriveSession(accessToken: string, email: string | null): void {
  try {
    const payload: StoredDriveSession = {
      accessToken,
      email,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    localStorage.setItem(DRIVE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

const initialSession = loadStoredDriveSession();
let cachedDriveAccessToken: string | null = initialSession?.accessToken ?? null;
let cachedDriveEmail: string | null = initialSession?.email ?? null;

/**
 * Extracts a Google Drive Folder ID from a full Drive folder URL or raw ID.
 */
export function extractDriveFolderId(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Match /folders/<ID>
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderMatch?.[1]) return folderMatch[1];

  // Match ?id=<ID> or &id=<ID>
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idParamMatch?.[1]) return idParamMatch[1];

  // Match raw folder ID (no slashes or spaces)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function getDriveAccessToken(): string | null {
  const stored = loadStoredDriveSession();
  if (!stored) {
    cachedDriveAccessToken = null;
    return null;
  }
  cachedDriveAccessToken = stored.accessToken;
  cachedDriveEmail = stored.email;
  return cachedDriveAccessToken;
}

export function getConnectedDriveEmail(): string | null {
  const stored = loadStoredDriveSession();
  if (!stored) {
    cachedDriveEmail = null;
    return null;
  }
  cachedDriveEmail = stored.email;
  return cachedDriveEmail;
}

export function subscribeSharedDriveSession(
  onChange?: (session: { email: string | null; connected: boolean }) => void
): () => void {
  const ref = doc(db, 'settings', 'drive_session');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange?.({ email: getConnectedDriveEmail(), connected: Boolean(getDriveAccessToken()) });
        return;
      }
      const data = snap.data() as Partial<StoredDriveSession>;
      if (data.accessToken && data.expiresAt && Date.now() < data.expiresAt) {
        cachedDriveAccessToken = data.accessToken;
        cachedDriveEmail = data.email ?? null;
        try {
          localStorage.setItem(
            DRIVE_STORAGE_KEY,
            JSON.stringify({
              accessToken: data.accessToken,
              email: data.email ?? null,
              expiresAt: data.expiresAt,
            })
          );
        } catch {
          // Ignore storage errors
        }
        onChange?.({ email: cachedDriveEmail, connected: true });
      } else {
        // Expired remotely; only clear if local is also expired
        const local = loadStoredDriveSession();
        onChange?.({ email: local?.email ?? null, connected: Boolean(local?.accessToken) });
      }
    },
    () => {
      // Ignore permission/offline errors and keep local state
    }
  );
}

export function disconnectGoogleDrive(): void {
  cachedDriveAccessToken = null;
  cachedDriveEmail = null;
  try {
    localStorage.removeItem(DRIVE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  void deleteDoc(doc(db, 'settings', 'drive_session')).catch(() => {
    // Ignore if already deleted or offline
  });
}

export async function connectGoogleDrive(): Promise<{
  accessToken: string;
  email: string | null;
}> {
  try {
    const result = await signInWithPopup(auth, driveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan akses Google Drive. Silakan coba lagi.');
    }
    cachedDriveAccessToken = credential.accessToken;
    cachedDriveEmail = result.user?.email || null;
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    saveStoredDriveSession(cachedDriveAccessToken, cachedDriveEmail);

    // Sync active Drive session to Firestore so all other devices are automatically connected
    try {
      await setDoc(doc(db, 'settings', 'drive_session'), {
        accessToken: cachedDriveAccessToken,
        email: cachedDriveEmail,
        expiresAt,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Non-fatal: local device still works even if Firestore write fails
    }

    return {
      accessToken: cachedDriveAccessToken,
      email: cachedDriveEmail,
    };
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: string }).code)
        : '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error(
        'Jendela login Google ditutup sebelum selesai. Klik "Hubungkan Google Drive" lagi, pilih akun Google Anda, lalu klik "Izinkan" sampai jendela menutup otomatis.'
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Browser memblokir jendela login Google. Izinkan pop-up pada kolom alamat browser Anda, lalu coba lagi.'
      );
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'Domain ini belum terdaftar di Firebase Authorized Domains. Tambahkan domain aplikasi di Firebase Console → Authentication → Settings → Authorized domains.'
      );
    }
    throw err instanceof Error
      ? err
      : new Error('Gagal menghubungkan Google Drive. Silakan coba lagi.');
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink: string;
  thumbnailUrl: string;
}

/**
 * Uploads a compressed image directly into the shared Google Drive folder configured by Admin,
 * using the currently connected teacher/admin Google account (supports different Google accounts
 * as long as the folder is shared with Editor access).
 */
export async function uploadPhotoToGoogleDrive(params: {
  dataUrl: string;
  fileName: string;
  folderUrlOrId?: string;
  accessToken?: string;
}): Promise<DriveUploadResult> {
  const token = params.accessToken || cachedDriveAccessToken;
  if (!token) {
    throw new Error('Akun Google Drive belum terhubung. Klik "Hubungkan Google Drive" terlebih dahulu.');
  }

  const folderId = extractDriveFolderId(params.folderUrlOrId);
  const metadata: Record<string, unknown> = {
    name: params.fileName,
    mimeType: 'image/jpeg',
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const imageBlob = dataUrlToBlob(params.dataUrl);
  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  formData.append('file', imageBlob, params.fileName);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,thumbnailLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!uploadRes.ok) {
    if (uploadRes.status === 401) {
      cachedDriveAccessToken = null;
      cachedDriveEmail = null;
      throw new Error('Sesi Google Drive berakhir. Silakan klik "Hubungkan Google Drive" kembali.');
    }
    if (uploadRes.status === 403) {
      throw new Error(
        'Akun Google ini tidak memiliki izin menulis ke folder tujuan. Pastikan Admin sudah membagikan (Share) folder Google Drive ke akun ini sebagai Editor (atau "Siapa saja yang memiliki link → Editor").'
      );
    }
    if (uploadRes.status === 404 && folderId) {
      throw new Error(
        'Folder Google Drive tidak ditemukan atau belum dibagikan (Share) ke akun Google ini sebagai Editor.'
      );
    }
    const errText = await uploadRes.text();
    throw new Error(`Gagal mengunggah foto ke Google Drive (${uploadRes.status}): ${errText}`);
  }

  const fileData = (await uploadRes.json()) as {
    id: string;
    webViewLink?: string;
    thumbnailLink?: string;
  };

  // Best-effort: make file viewable via link so all BK teachers & Admin can preview it
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions?supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      }
    );
  } catch {
    // Ignore if domain policy restricts public link sharing
  }

  return {
    fileId: fileData.id,
    webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileData.id}&sz=w1200`,
  };
}
