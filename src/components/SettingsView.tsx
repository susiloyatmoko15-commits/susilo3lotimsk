import React, { useState, useEffect } from "react";
import { NumberingConfig, SchoolProfile, Employee, SKDocument, DefaultSKParams } from "../types";
import {
  Settings,
  Save,
  CheckCircle2,
  RefreshCw,
  Download,
  Upload,
  Database,
  BookmarkCheck,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import { generateNextSKNumber } from "../utils/numberGenerator";
import {
  safeGetItem,
  safeSetItem,
  getSavedDefaultSKParams,
  saveDefaultSKParams,
  saveKopAsAppDefault,
  loadActiveKopImage,
  syncMasterDefaultsToServer,
} from "../utils/storage";
import {
  initialSchoolProfile,
  initialEmployees,
  sampleSKDocuments,
  initialNumberingConfig,
} from "../data/initialData";

interface SettingsViewProps {
  numberingConfig: NumberingConfig;
  onSaveNumbering: (config: NumberingConfig) => void;
  allData: {
    schoolProfile: SchoolProfile;
    employees: Employee[];
    documents: SKDocument[];
  };
  onRestoreData: (restored: {
    schoolProfile: SchoolProfile;
    employees: Employee[];
    documents: SKDocument[];
    numberingConfig: NumberingConfig;
  }) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  numberingConfig,
  onSaveNumbering,
  allData,
  onRestoreData,
}) => {
  const [config, setConfig] = useState<NumberingConfig>(numberingConfig);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [customDefaultSaved, setCustomDefaultSaved] = useState(false);
  const [hasSavedDefault, setHasSavedDefault] = useState(() => {
    return Boolean(safeGetItem("sd_custom_default_data"));
  });

  // State untuk parameter bawaan default SK (Tahun Ajaran, Tanggal Tetap, Rapat Guru)
  const [skParams, setSkParams] = useState<DefaultSKParams>(() => {
    return getSavedDefaultSKParams(allData.documents?.[0]);
  });
  const [skParamsSaved, setSkParamsSaved] = useState(false);

  const previewGenerated = generateNextSKNumber(config).formattedNumber;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveNumbering(config);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSaveSKParams = (e: React.FormEvent) => {
    e.preventDefault();
    saveDefaultSKParams(skParams);
    setSkParamsSaved(true);
    setTimeout(() => setSkParamsSaved(false), 3500);
  };

  const handleSaveAsDefault = async () => {
    saveDefaultSKParams(skParams);

    // Ambil gambar kop aktif asli
    const activeKop = await loadActiveKopImage(allData.schoolProfile.kopSuratUrl || "");

    // Kunci kop surat yang aktif sebagai kop bawaan utama aplikasi jika berupa gambar
    if (activeKop && !activeKop.startsWith("indexeddb:")) {
      await saveKopAsAppDefault(activeKop);
    }

    const masterData = {
      savedAt: new Date().toISOString(),
      schoolProfile: {
        ...allData.schoolProfile,
        kopSuratUrl: "indexeddb:active",
        kopMode: "gambar",
      },
      employees: allData.employees,
      documents: allData.documents,
      numberingConfig: config,
      defaultSKParams: skParams,
    };

    // Save as persistent master default in localStorage safely
    safeSetItem("sd_custom_default_data", JSON.stringify(masterData));
    // Ensure all active keys are also fully in sync
    safeSetItem("sd_school_profile", JSON.stringify(allData.schoolProfile));
    safeSetItem("sd_employees", JSON.stringify(allData.employees));
    safeSetItem("sd_sk_documents", JSON.stringify(allData.documents));
    safeSetItem("sd_numbering_config", JSON.stringify(config));

    // Sinkronkan secara permanen ke server filesystem agar tidak berubah saat dipublikasikan
    await syncMasterDefaultsToServer({
      schoolProfile: {
        ...allData.schoolProfile,
        kopSuratUrl: activeKop,
      },
      employees: allData.employees,
      documents: allData.documents,
      numberingConfig: config,
      defaultSKParams: skParams,
      kopSuratUrl: activeKop,
    });

    setHasSavedDefault(true);
    setCustomDefaultSaved(true);
    setTimeout(() => setCustomDefaultSaved(false), 6000);
  };

  const handleExportBackup = async () => {
    // Ambil base64 gambar kop surat asli agar file backup mandiri & lengkap
    const fullKopUrl = await loadActiveKopImage(allData.schoolProfile.kopSuratUrl || "");

    const fullBackup = {
      exportedAt: new Date().toISOString(),
      schoolProfile: {
        ...allData.schoolProfile,
        kopSuratUrl: fullKopUrl,
      },
      employees: allData.employees,
      documents: allData.documents,
      numberingConfig: config,
      defaultSKParams: skParams,
    };

    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Backup_Administrasi_SK_${allData.schoolProfile.nama.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.schoolProfile && parsed.employees) {
          if (parsed.defaultSKParams) {
            saveDefaultSKParams(parsed.defaultSKParams);
            setSkParams(parsed.defaultSKParams);
          }
          // Jika file backup berisi gambar kop surat, simpan sebagai kop bawaan aplikasi
          if (
            parsed.schoolProfile.kopSuratUrl &&
            !parsed.schoolProfile.kopSuratUrl.startsWith("indexeddb:") &&
            parsed.schoolProfile.kopSuratUrl.length > 50
          ) {
            await saveKopAsAppDefault(parsed.schoolProfile.kopSuratUrl);
          }
          onRestoreData({
            schoolProfile: parsed.schoolProfile,
            employees: parsed.employees,
            documents: parsed.documents || [],
            numberingConfig: parsed.numberingConfig || config,
          });
          alert("Data cadangan berhasil dipulihkan termasuk kop surat bawaan!");
        } else {
          alert("Format file cadangan tidak valid.");
        }
      } catch (err) {
        alert("Gagal membaca file JSON.");
      }
    };
    reader.readAsText(file);
  };

  const handleResetToDefault = async () => {
    const customDefaultRaw = safeGetItem("sd_custom_default_data");
    const hasCustom = Boolean(customDefaultRaw);

    const confirmMsg = hasCustom
      ? `Kembalikan seluruh data ke Data Bawaan Tersimpan (${allData.schoolProfile.nama})?`
      : `Kembalikan seluruh data ke Data Bawaan Resmi SD Negeri 3 Loloan Timur?`;

    if (window.confirm(confirmMsg)) {
      // Ambil kop bawaan tersimpan yang pernah diunggah/dikunci user
      const defaultKopImage = await loadActiveKopImage(initialSchoolProfile.kopSuratUrl);

      if (hasCustom) {
        try {
          const parsed = JSON.parse(customDefaultRaw!);
          onRestoreData({
            schoolProfile: {
              ...(parsed.schoolProfile || allData.schoolProfile),
              kopSuratUrl: defaultKopImage,
              kopMode: "gambar",
            },
            employees: parsed.employees,
            documents: parsed.documents || [],
            numberingConfig: parsed.numberingConfig || config,
          });
          alert("Data berhasil dipulihkan ke Data Bawaan tersimpan Anda.");
          return;
        } catch (e) {
          console.error(e);
        }
      }

      onRestoreData({
        schoolProfile: {
          ...initialSchoolProfile,
          kopSuratUrl: defaultKopImage,
          kopMode: "gambar",
        },
        employees: initialEmployees,
        documents: sampleSKDocuments,
        numberingConfig: initialNumberingConfig,
      });
      alert("Data berhasil dikembalikan ke standar awal SD Negeri 3 Loloan Timur.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm mb-1">
            <Settings className="w-4 h-4" />
            <span>Konfigurasi & Pengaturan Sistem</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Sistem Penomoran SK & Cadangan Data
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Atur pola penomoran surat keputusan dinas, kode registrasi sekolah, serta jadikan seluruh
            data yang telah diinput sebagai data bawaan (default) resmi sekolah.
          </p>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg border border-emerald-200 text-xs font-medium animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Pengaturan disimpan!</span>
          </div>
        )}
      </div>

      {/* Primary Action Card: Jadikan Data Saat Ini Sebagai Data Bawaan Aplikasi */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-emerald-950 rounded-xl p-6 text-white shadow-md space-y-4 border border-emerald-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              <Database className="w-3.5 h-3.5" />
              <span>Data Bawaan (Default Master) Aplikasi</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Jadikan Data Saat Ini Sebagai Data Bawaan Aplikasi</span>
              {hasSavedDefault && (
                <span className="text-[10px] bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 rounded">
                  AKTIF
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Kunci data profil <strong>{allData.schoolProfile.nama}</strong>,{" "}
              <strong>{allData.employees.length}</strong> Pendidik & Tenaga Kependidikan, serta arsip SK
              yang telah Anda input sebagai <strong>data bawaan baku</strong> aplikasi. Saat aplikasi
              dibuka kembali atau di-reset, data ini yang akan digunakan secara permanen.
            </p>
          </div>

          <button
            type="button"
            id="btn-jadikan-data-bawaan"
            onClick={handleSaveAsDefault}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-3 rounded-lg shadow-lg hover:shadow-emerald-500/20 transition-all cursor-pointer shrink-0"
          >
            <BookmarkCheck className="w-4 h-4" />
            <span>Kunci Jadi Data Bawaan</span>
          </button>
        </div>

        {customDefaultSaved && (
          <div className="flex items-center gap-2.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs px-3.5 py-2.5 rounded-lg animate-fade-in font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Berhasil!</strong> Seluruh data yang Anda input ({allData.schoolProfile.nama} & {allData.employees.length} GTK) telah tersimpan sebagai <strong>DATA BAWAAN RESMI</strong> aplikasi ini.
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Box Penomoran SK */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
            Pola & Penomoran Otomatis SK (Surat Keputusan)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Pola Nomor SK *
              </label>
              <input
                id="input-setting-pola"
                type="text"
                value={config.pattern}
                onChange={(e) => setConfig({ ...config, pattern: e.target.value })}
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Variabel: [NOMOR], [KODE_SEKOLAH], [BULAN_ROMAWI], [TAHUN]
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kode Registrasi Sekolah *
              </label>
              <input
                id="input-setting-kode-sekolah"
                type="text"
                value={config.schoolCode}
                onChange={(e) => setConfig({ ...config, schoolCode: e.target.value })}
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Contoh: SD3LT.01 atau SD01.03
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nomor Terakhir Terbit *
              </label>
              <input
                id="input-setting-nomor-terakhir"
                type="number"
                value={config.lastNumber}
                onChange={(e) =>
                  setConfig({ ...config, lastNumber: Number(e.target.value) })
                }
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                SK berikutnya akan dimulai dari nomor {config.lastNumber + 1}.
              </span>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                id="checkbox-reset-year"
                type="checkbox"
                checked={config.resetEveryYear}
                onChange={(e) =>
                  setConfig({ ...config, resetEveryYear: e.target.checked })
                }
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="checkbox-reset-year" className="font-semibold text-slate-700">
                Otomatis reset hitungan nomor ke 001 di awal tahun baru
              </label>
            </div>
          </div>

          {/* Live Preview Number */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Pratinjau Nomor SK Berikutnya:
            </span>
            <p className="text-base font-mono font-bold text-emerald-800">
              {previewGenerated}
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              id="btn-save-settings"
              type="submit"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow-sm cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Konfigurasi Penomoran</span>
            </button>
          </div>
        </div>
      </form>

      {/* Form Parameter Bawaan SK */}
      <form onSubmit={handleSaveSKParams} className="space-y-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Parameter Bawaan Default SK (Tahun Ajaran, Tanggal Penetapan, & Rapat Dewan Guru)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Nilai yang Anda simpan di sini akan menjadi data bawaan otomatis setiap kali Anda membuat surat keputusan baru.
              </p>
            </div>
            {skParamsSaved && (
              <div className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs px-3 py-1.5 rounded-lg font-medium animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Parameter bawaan SK berhasil diperbarui!</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tahun Ajaran / Periode Bawaan *
              </label>
              <input
                id="input-setting-tahun-ajaran"
                type="text"
                value={skParams.tahunAjaran}
                onChange={(e) => setSkParams({ ...skParams, tahunAjaran: e.target.value })}
                required
                placeholder="2025/2026"
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Penetapan SK Bawaan *
              </label>
              <input
                id="input-setting-tanggal-tetap"
                type="text"
                value={skParams.tanggalTetap}
                onChange={(e) => setSkParams({ ...skParams, tanggalTetap: e.target.value })}
                required
                placeholder="19 Juni 2025"
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tempat Penetapan SK *
              </label>
              <input
                id="input-setting-tempat-tetap"
                type="text"
                value={skParams.tempatTetap}
                onChange={(e) => setSkParams({ ...skParams, tempatTetap: e.target.value })}
                required
                placeholder="Loloan Timur"
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal & Pembahasan Rapat Dewan Guru (Untuk Konsiderans MEMPERHATIKAN) *
              </label>
              <textarea
                id="input-setting-tanggal-rapat"
                rows={2}
                value={skParams.tanggalRapat}
                onChange={(e) => setSkParams({ ...skParams, tanggalRapat: e.target.value })}
                required
                placeholder="18 Juni 2025 tentang Pembagian Tugas Guru dalam kegiatan proses belajar mengajar atau bimbingan dan tugas tenaga kependidikan di SD Negeri 3 Loloan Timur Tahun Ajaran 2025/2026"
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Teks ini akan otomatis disematkan pada konsiderans <strong>MEMPERHATIKAN</strong> di seluruh naskah SK yang baru dibuat.
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              id="btn-save-sk-params"
              type="submit"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow-sm cursor-pointer"
            >
              <BookmarkCheck className="w-4 h-4" />
              <span>Simpan Sebagai Parameter Bawaan SK</span>
            </button>
          </div>
        </div>
      </form>

      {/* Backup and Restore Box */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
          Cadangan & Pemulihan Data (Backup & Restore)
        </h3>
        <p className="text-xs text-slate-500">
          Unduh berkas JSON yang memuat seluruh identitas sekolah, database guru/PTK, serta arsip
          SK untuk disimpan secara aman di komputer atau flashdisk Anda.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor File Cadangan (.json)</span>
          </button>

          <label className="flex items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Pulihkan dari Cadangan</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>

          <button
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs font-medium rounded-lg cursor-pointer ml-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset ke Data Bawaan (SD Negeri 3 Loloan Timur)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
