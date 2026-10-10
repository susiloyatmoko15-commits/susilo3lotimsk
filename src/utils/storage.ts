// Safe Storage, Image Optimization & IndexedDB Integration
// Solves browser LocalStorage quota limits permanently by offloading large image data to IndexedDB

import { DefaultSKParams, SKDocument } from "../types";
import { defaultKopSuratVector } from "../data/defaultKopImage";
import {
  saveKopToIndexedDB,
  getKopFromIndexedDB,
  saveAppMasterDefaultKop,
  getAppMasterDefaultKop,
  removeKopFromIndexedDB,
} from "./kopImageDB";

export function safeGetItem(key: string): string | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;

    // JIKA MENYIMPAN KOP SURAT BERUKURAN BESAR, ALIHAKAN KE INDEXEDDB
    if (key === "sd_default_kop_surat") {
      if (value && value.length > 500) {
        // Simpan ke IndexedDB yang memiliki kuota ratusan MB
        saveKopToIndexedDB(value).catch(() => {});
        // Di localStorage cukup simpan penanda ringan agar tidak memenuhi kuota
        try {
          window.localStorage.setItem(key, "indexeddb:active");
        } catch {
          // Abaikan jika quota tetap ketat
        }
        return true;
      }
    }

    // JIKA MENYIMPAN PROFIL SEKOLAH, PASTIKAN KOP TIDAK MEMBEBANI LOCALSTORAGE
    if (key === "sd_school_profile") {
      try {
        const parsed = JSON.parse(value);
        if (parsed.kopSuratUrl && parsed.kopSuratUrl.length > 500) {
          saveKopToIndexedDB(parsed.kopSuratUrl).catch(() => {});
          // Ringankan profil di localStorage
          const lightweightProfile = { ...parsed, kopSuratUrl: "indexeddb:active" };
          window.localStorage.setItem(key, JSON.stringify(lightweightProfile));
          return true;
        }
      } catch {
        // Lanjutkan simpan normal jika bukan JSON
      }
    }

    window.localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    console.warn(`[safeStorage] Kuota LocalStorage penuh untuk '${key}', mengalihkan...`);
    try {
      // Bersihkan entri duplikat lama yang membengkak
      cleanupLegacyStorageBloat();
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export function safeRemoveItem(key: string): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * Membersihkan data lama berukuran besar di localStorage
 * dan memindahkannya ke IndexedDB agar kuota localStorage kembali lega.
 */
export function cleanupLegacyStorageBloat(): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;

    // 1. Cek sd_default_kop_surat
    const oldKop = window.localStorage.getItem("sd_default_kop_surat");
    if (oldKop && oldKop.length > 500 && !oldKop.startsWith("indexeddb:")) {
      saveKopToIndexedDB(oldKop).catch(() => {});
      window.localStorage.setItem("sd_default_kop_surat", "indexeddb:active");
    }

    // 2. Cek sd_school_profile
    const oldProfileStr = window.localStorage.getItem("sd_school_profile");
    if (oldProfileStr) {
      try {
        const prof = JSON.parse(oldProfileStr);
        if (prof.kopSuratUrl && prof.kopSuratUrl.length > 500 && !prof.kopSuratUrl.startsWith("indexeddb:")) {
          saveKopToIndexedDB(prof.kopSuratUrl).catch(() => {});
          prof.kopSuratUrl = "indexeddb:active";
          window.localStorage.setItem("sd_school_profile", JSON.stringify(prof));
        }
      } catch {
        // Ignore
      }
    }

    // 3. Cek sd_custom_default_data
    const oldMasterStr = window.localStorage.getItem("sd_custom_default_data");
    if (oldMasterStr) {
      try {
        const master = JSON.parse(oldMasterStr);
        if (
          master?.schoolProfile?.kopSuratUrl &&
          master.schoolProfile.kopSuratUrl.length > 500 &&
          !master.schoolProfile.kopSuratUrl.startsWith("indexeddb:")
        ) {
          saveKopToIndexedDB(master.schoolProfile.kopSuratUrl).catch(() => {});
          master.schoolProfile.kopSuratUrl = "indexeddb:active";
          window.localStorage.setItem("sd_custom_default_data", JSON.stringify(master));
        }
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ignore
  }
}

/**
 * Mengambil kop surat aktif secara cerdas:
 * 1. Periksa IndexedDB (kop aktif pengguna).
 * 2. Periksa IndexedDB (kop master default bawaan aplikasi yang dikunci pengguna).
 * 3. Periksa localStorage / custom master data.
 * 4. Fallback ke gambar standar jika belum ada kop yang diunggah.
 */
export async function loadActiveKopImage(fallbackDefault = ""): Promise<string> {
  const isFallbackRaster =
    fallbackDefault &&
    (fallbackDefault.startsWith("data:image/png") ||
      fallbackDefault.startsWith("data:image/jpeg") ||
      fallbackDefault.startsWith("data:image/jpg"));

  try {
    // 1. Coba ambil dari IndexedDB (kop aktif)
    const fromIdb = await getKopFromIndexedDB();
    if (fromIdb && fromIdb.length > 50) {
      if (isFallbackRaster && fromIdb.includes("image/svg+xml")) {
        saveKopToIndexedDB(fallbackDefault).catch(() => {});
        saveAppMasterDefaultKop(fallbackDefault).catch(() => {});
        return fallbackDefault;
      }
      return fromIdb;
    }
  } catch {
    // Lanjutkan
  }

  try {
    // 2. Coba ambil dari master default bawaan yang disimpan pengguna di IndexedDB
    const fromMasterIdb = await getAppMasterDefaultKop();
    if (fromMasterIdb && fromMasterIdb.length > 50) {
      if (isFallbackRaster && fromMasterIdb.includes("image/svg+xml")) {
        saveKopToIndexedDB(fallbackDefault).catch(() => {});
        saveAppMasterDefaultKop(fallbackDefault).catch(() => {});
        return fallbackDefault;
      }
      saveKopToIndexedDB(fromMasterIdb).catch(() => {});
      return fromMasterIdb;
    }
  } catch {
    // Lanjutkan
  }

  // 3. Coba ambil dari localStorage jika berupa data valid (bukan penanda idb)
  const fromStorage = safeGetItem("sd_default_kop_surat");
  if (fromStorage && !fromStorage.startsWith("indexeddb:") && fromStorage.length > 50) {
    if (isFallbackRaster && fromStorage.includes("image/svg+xml")) {
      saveKopToIndexedDB(fallbackDefault).catch(() => {});
      saveAppMasterDefaultKop(fallbackDefault).catch(() => {});
      safeSetItem("sd_default_kop_surat", "indexeddb:active");
      return fallbackDefault;
    }
    saveKopToIndexedDB(fromStorage).catch(() => {});
    saveAppMasterDefaultKop(fromStorage).catch(() => {});
    safeSetItem("sd_default_kop_surat", "indexeddb:active");
    return fromStorage;
  }

  // 4. Cek sd_custom_default_data
  const customDataRaw = safeGetItem("sd_custom_default_data");
  if (customDataRaw) {
    try {
      const custom = JSON.parse(customDataRaw);
      if (
        custom?.schoolProfile?.kopSuratUrl &&
        !custom.schoolProfile.kopSuratUrl.startsWith("indexeddb:") &&
        custom.schoolProfile.kopSuratUrl.length > 50
      ) {
        if (isFallbackRaster && custom.schoolProfile.kopSuratUrl.includes("image/svg+xml")) {
          saveKopToIndexedDB(fallbackDefault).catch(() => {});
          saveAppMasterDefaultKop(fallbackDefault).catch(() => {});
          return fallbackDefault;
        }
        saveKopToIndexedDB(custom.schoolProfile.kopSuratUrl).catch(() => {});
        saveAppMasterDefaultKop(custom.schoolProfile.kopSuratUrl).catch(() => {});
        return custom.schoolProfile.kopSuratUrl;
      }
    } catch {}
  }

  return fallbackDefault;
}

/**
 * Menyimpan gambar kop surat ke IndexedDB secara aman dan sinkronkan penanda.
 */
export async function saveActiveKopImage(dataUrl: string): Promise<void> {
  try {
    await saveKopToIndexedDB(dataUrl);
    safeSetItem("sd_default_kop_surat", "indexeddb:active");
  } catch (err) {
    console.warn("Gagal menyimpan ke IndexedDB:", err);
  }
}

/**
 * Menyimpan gambar kop surat sebagai bawaan aplikasi permanen (Master Default Kop).
 * Digunakan baik untuk sesi aktif saat ini maupun saat aplikasi di-reset ke data bawaan.
 */
export async function saveKopAsAppDefault(dataUrl: string): Promise<boolean> {
  try {
    // 1. Simpan ke IndexedDB untuk aktif dan master bawaan
    await saveKopToIndexedDB(dataUrl);
    await saveAppMasterDefaultKop(dataUrl);

    // 2. Tandai di localStorage
    safeSetItem("sd_default_kop_surat", "indexeddb:active");
    safeSetItem("sd_has_custom_default_kop", "true");

    // 3. Sinkronkan ke master data bawaan sd_custom_default_data
    const masterRaw = safeGetItem("sd_custom_default_data");
    let master: any = {};
    if (masterRaw) {
      try {
        master = JSON.parse(masterRaw);
      } catch {}
    }
    if (!master.schoolProfile) {
      master.schoolProfile = {};
    }
    master.schoolProfile.kopSuratUrl = "indexeddb:active";
    master.schoolProfile.kopMode = "gambar";
    master.hasCustomKop = true;
    safeSetItem("sd_custom_default_data", JSON.stringify(master));

    return true;
  } catch (err) {
    console.error("Gagal menyimpan kop sebagai bawaan aplikasi:", err);
    return false;
  }
}

/**
 * Mengambil kop master default bawaan aplikasi yang tersimpan
 */
export async function getAppMasterKopImage(): Promise<string | null> {
  try {
    const fromMasterIdb = await getAppMasterDefaultKop();
    if (fromMasterIdb && fromMasterIdb.length > 50) {
      return fromMasterIdb;
    }
  } catch {}
  return null;
}

/**
 * Mengoptimalkan ukuran gambar Kop Surat (JPG/PNG).
 * Menyesuaikan resolusi agar tajam untuk cetak A4 (lebar 1200px)
 * namun menjaga ukuran data base64 tetap kecil (~50KB-120KB).
 */
export async function optimizeKopImage(
  fileOrBase64: File | string,
  maxWidth = 1200,
  maxHeight = 350
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Jika input adalah string SVG, tidak perlu kompresi canvas
    if (typeof fileOrBase64 === "string" && fileOrBase64.includes("image/svg+xml")) {
      resolve(fileOrBase64);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(width, 100);
        canvas.height = Math.max(height, 50);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          if (typeof fileOrBase64 === "string") resolve(fileOrBase64);
          else {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(fileOrBase64);
          }
          return;
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const optimizedUrl = canvas.toDataURL("image/png");
        resolve(optimizedUrl);
      } catch (err) {
        console.warn("Gagal optimasi canvas, menggunakan gambar asli:", err);
        if (typeof fileOrBase64 === "string") {
          resolve(fileOrBase64);
        } else {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(fileOrBase64);
        }
      }
    };

    img.onerror = () => {
      reject(new Error("Gagal membaca berkas gambar"));
    };

    if (typeof fileOrBase64 === "string") {
      img.src = fileOrBase64;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrBase64);
    }
  });
}

export const initialDefaultSKParams: DefaultSKParams = {
  tahunAjaran: "2025/2026",
  tanggalTetap: "19 Juni 2025",
  tempatTetap: "Loloan Timur",
  tanggalRapat: "18 Juni 2025 tentang Pembagian Tugas Guru dalam kegiatan proses belajar mengajar atau bimbingan dan tugas tenaga kependidikan di SD Negeri 3 Loloan Timur Tahun Ajaran 2025/2026",
  memperhatikan: "Saran, usul dan Keputusan Rapat Dewan Guru SD Negeri 3 Loloan Timur tanggal 18 Juni 2025 tentang Pembagian Tugas Guru dalam kegiatan proses belajar mengajar atau bimbingan dan tugas tenaga kependidikan di SD Negeri 3 Loloan Timur Tahun Ajaran 2025/2026",
};

/**
 * Mengambil parameter bawaan SK (Tahun Ajaran, Tanggal Penetapan, Tanggal & Rapat Dewan Guru)
 * dengan urutan prioritas:
 * 1. sd_default_sk_params di localStorage
 * 2. sd_custom_default_data jika pernah disimpan pengguna
 * 3. fallbackDoc (dokumen SK pertama pengguna yang ada di sistem)
 * 4. initialDefaultSKParams
 */
export function getSavedDefaultSKParams(fallbackDoc?: SKDocument): DefaultSKParams {
  // 1. Cek penyimpanan parameter bawaan spesifik
  const raw = safeGetItem("sd_default_sk_params");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.tahunAjaran || parsed.tanggalTetap || parsed.tanggalRapat) {
        return {
          ...initialDefaultSKParams,
          ...parsed,
        };
      }
    } catch {}
  }

  // 2. Cek dari master default (sd_custom_default_data)
  const masterRaw = safeGetItem("sd_custom_default_data");
  if (masterRaw) {
    try {
      const master = JSON.parse(masterRaw);
      if (master.defaultSKParams) {
        return {
          ...initialDefaultSKParams,
          ...master.defaultSKParams,
        };
      }
      if (master.documents && master.documents.length > 0) {
        const d0 = master.documents[0];
        return {
          tahunAjaran: d0.tahunAjaran || initialDefaultSKParams.tahunAjaran,
          tanggalTetap: d0.tanggalTetap || initialDefaultSKParams.tanggalTetap,
          tempatTetap: d0.tempatTetap || initialDefaultSKParams.tempatTetap,
          tanggalRapat: d0.tanggalRapat || d0.memperhatikan || initialDefaultSKParams.tanggalRapat,
          memperhatikan: d0.memperhatikan || initialDefaultSKParams.memperhatikan,
        };
      }
    } catch {}
  }

  // 3. Cek dari dokumen pertama user yang tersimpan di sd_sk_documents
  if (fallbackDoc) {
    return {
      tahunAjaran: fallbackDoc.tahunAjaran || initialDefaultSKParams.tahunAjaran,
      tanggalTetap: fallbackDoc.tanggalTetap || initialDefaultSKParams.tanggalTetap,
      tempatTetap: fallbackDoc.tempatTetap || initialDefaultSKParams.tempatTetap,
      tanggalRapat: fallbackDoc.tanggalRapat || fallbackDoc.memperhatikan || initialDefaultSKParams.tanggalRapat,
      memperhatikan: fallbackDoc.memperhatikan || initialDefaultSKParams.memperhatikan,
    };
  }

  return initialDefaultSKParams;
}

/**
 * Menyimpan parameter bawaan SK secara persisten agar selalu menjadi nilai bawaan
 * saat membuat SK baru maupun saat reset ke default.
 */
export function saveDefaultSKParams(params: Partial<DefaultSKParams>): void {
  const current = getSavedDefaultSKParams();
  const updated: DefaultSKParams = {
    ...current,
    ...params,
  };
  safeSetItem("sd_default_sk_params", JSON.stringify(updated));

  // Sinkronkan ke sd_custom_default_data jika ada
  const masterRaw = safeGetItem("sd_custom_default_data");
  if (masterRaw) {
    try {
      const master = JSON.parse(masterRaw);
      master.defaultSKParams = updated;
      safeSetItem("sd_custom_default_data", JSON.stringify(master));
    } catch {}
  }
}

/**
 * Sinkronisasi data sekolah, guru/PTK, dan gambar kop surat aktif
 * secara permanen ke server filesystem (agar tetap bawaan default saat dipublikasikan).
 */
export async function syncMasterDefaultsToServer(data: {
  schoolProfile?: any;
  employees?: any[];
  numberingConfig?: any;
  documents?: any[];
  defaultSKParams?: any;
  kopSuratUrl?: string;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/master-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    return Boolean(result?.success);
  } catch (err) {
    console.warn("[syncMasterDefaultsToServer] Gagal:", err);
    return false;
  }
}

/**
 * Mengambil master default tersimpan di server
 */
export async function fetchServerMasterDefaults(): Promise<any | null> {
  try {
    const res = await fetch("/api/master-defaults");
    const json = await res.json();
    if (json?.success && json?.data) {
      return json.data;
    }
  } catch {}
  return null;
}

/**
 * Memproses dan mengunci gambar kop surat ke server secara instan
 * sehingga langsung tersimpan permanen sebagai bawaan resmi aplikasi.
 */
export async function setKopAsPermanentDefaultServer(
  kopSuratUrl: string,
  schoolProfile?: any
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Simpan ke IndexedDB & LocalStorage
    await saveKopAsAppDefault(kopSuratUrl);

    // 2. Kirim ke endpoint khusus server
    const res = await fetch("/api/set-default-kop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kopSuratUrl, schoolProfile }),
    });
    const json = await res.json();
    return {
      success: Boolean(json?.success),
      message:
        json?.message ||
        "✓ Gambar kop surat berhasil diproses dan dikunci permanen sebagai bawaan aplikasi.",
    };
  } catch (err: any) {
    console.warn("[setKopAsPermanentDefaultServer] Gagal:", err);
    return {
      success: false,
      message: "Gagal menyimpan ke server: " + (err?.message || String(err)),
    };
  }
}



