import React, { useState, useEffect } from "react";
import {
  SchoolProfile,
  Employee,
  SKDocument,
  NumberingConfig,
} from "../types";
import { generateNextSKNumber } from "../utils/numberGenerator";
import { cleanSKJudul } from "../utils/skFormatter";
import { exportSKToDocx } from "../utils/docxGenerator";
import { loadActiveKopImage, getSavedDefaultSKParams, saveDefaultSKParams } from "../utils/storage";
import { defaultKopSuratSDN3LoloanTimur } from "../data/defaultKopImage";
import {
  FileText,
  Sparkles,
  Download,
  Printer,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  PlusCircle,
  Building2,
  Users,
  Calendar,
  Save,
  FolderArchive,
  ArrowRight,
  ShieldCheck,
  Check,
} from "lucide-react";

interface QuickSKGeneratorViewProps {
  schoolProfile: SchoolProfile;
  employees: Employee[];
  numberingConfig: NumberingConfig;
  initialDoc?: SKDocument | null;
  onSaveToArchive: (doc: SKDocument) => void;
  onNavigateToArchive: () => void;
  onOpenEmployeeManager: () => void;
  onOpenSchoolProfile: () => void;
}

// Rekomendasi judul SK populer di SD
const POPULAR_SK_SUGGESTIONS = [
  {
    kategori: "KBM",
    judul: "Pembagian Tugas Guru Dalam Proses Belajar Mengajar dan Tenaga Kependidikan",
    badge: "Utama",
  },
  {
    kategori: "Manajemen",
    judul: "Tim Pengelola Bantuan Operasional Satuan Pendidikan (BOSP)",
    badge: "Keuangan",
  },
  {
    kategori: "Kesiswaan",
    judul: "Tim Pencegahan dan Penanganan Kekerasan (TPPK)",
    badge: "Wajib Kemendikbud",
  },
  {
    kategori: "Asesmen",
    judul: "Panitia Pelaksana Asesmen Nasional Berbasis Komputer (ANBK)",
    badge: "Asesmen",
  },
  {
    kategori: "Kesehatan",
    judul: "Tim Pelaksana Usaha Kesehatan Sekolah (UKS)",
    badge: "Kesehatan",
  },
  {
    kategori: "Kurikulum",
    judul: "Tim Pengembang Kurikulum Satuan Pendidikan (KSP)",
    badge: "Akademik",
  },
  {
    kategori: "Pengembangan",
    judul: "Pembina Kegiatan Ekstrakurikuler dan Kepramukaan",
    badge: "Kesiswaan",
  },
  {
    kategori: "Literasi",
    judul: "Tim Gerakan Literasi Sekolah (GLS) dan Pojok Baca",
    badge: "Literasi",
  },
  {
    kategori: "Kombel",
    judul: "Tim Kerja Komunitas Belajar (Kombel) Guru Satuan Pendidikan",
    badge: "Guru",
  },
  {
    kategori: "PPDB",
    judul: "Panitia Penerimaan Peserta Didik Baru (PPDB)",
    badge: "Penerimaan Siswa",
  },
];

export const QuickSKGeneratorView: React.FC<QuickSKGeneratorViewProps> = ({
  schoolProfile,
  employees,
  numberingConfig,
  initialDoc,
  onSaveToArchive,
  onNavigateToArchive,
  onOpenEmployeeManager,
  onOpenSchoolProfile,
}) => {
  // Input Utama Kepala Sekolah: Cukup Ketik Judul SK
  const [judulInput, setJudulInput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStage, setGenerationStage] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Status Draf Hasil
  const [activeDoc, setActiveDoc] = useState<SKDocument | null>(initialDoc || null);
  const [isExportingWord, setIsExportingWord] = useState<boolean>(false);
  const [isSavedSuccess, setIsSavedSuccess] = useState<boolean>(false);

  // Mode Edit Cepat di Tempat
  const [isEditingInline, setIsEditingInline] = useState<boolean>(false);

  // Pengaturan Cepat / Lanjutan (Opsional & Cerdas)
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const defaultParams = getSavedDefaultSKParams();
  const nextNum = generateNextSKNumber(numberingConfig).formattedNumber;

  const [nomorSK, setNomorSK] = useState<string>(nextNum);
  const [tahunAjaran, setTahunAjaran] = useState<string>(defaultParams.tahunAjaran || "2024/2025");
  const [tanggalTetap, setTanggalTetap] = useState<string>(defaultParams.tanggalTetap || "14 Juli 2025");
  const [tempatTetap, setTempatTetap] = useState<string>(
    defaultParams.tempatTetap || schoolProfile.desa || "Loloan Timur"
  );
  const [tanggalRapat, setTanggalRapat] = useState<string>(
    defaultParams.tanggalRapat || "10 Juli 2025"
  );

  // KOP Surat Cache
  const [kopUrl, setKopUrl] = useState<string>(() => {
    return schoolProfile.kopSuratUrl && !schoolProfile.kopSuratUrl.startsWith("indexeddb:")
      ? schoolProfile.kopSuratUrl
      : defaultKopSuratSDN3LoloanTimur;
  });

  useEffect(() => {
    loadActiveKopImage(schoolProfile.kopSuratUrl || defaultKopSuratSDN3LoloanTimur).then((resolved) => {
      if (resolved && resolved !== "indexeddb:active") {
        setKopUrl(resolved);
      }
    });
  }, [schoolProfile.kopSuratUrl]);

  useEffect(() => {
    if (initialDoc) {
      setActiveDoc(initialDoc);
      setJudulInput(initialDoc.judul);
    }
  }, [initialDoc]);

  // Handler Generate Draf SK Otomatis dari Judul
  const handleGenerateDraf = async (customTitleToUse?: string) => {
    const rawTitle = (customTitleToUse || judulInput).trim();
    if (!rawTitle) {
      setErrorMsg("Silakan ketikkan judul SK yang ingin dibuat terlebih dahulu.");
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setIsSavedSuccess(false);
    setIsEditingInline(false);

    // Animasi tahapan pembuatan yang ramah
    setGenerationStage("Menyiapkan struktur tata naskah dinas SK...");
    const timer1 = setTimeout(() => {
      setGenerationStage("Menyusun konsiderans Menimbang dan dasar hukum Mengingat...");
    }, 700);
    const timer2 = setTimeout(() => {
      setGenerationStage("Menata Diktum Memutuskan dan Tanda Tangan Kepala Sekolah...");
    }, 1500);
    const timer3 = setTimeout(() => {
      setGenerationStage(`Memadukan ${employees.length} data Guru/PTK ke tabel lampiran...`);
    }, 2200);

    try {
      const cleanTitle = cleanSKJudul(rawTitle, tahunAjaran);
      const res = await fetch("/api/gemini/generate-sk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jenisSK: cleanTitle,
          judulSK: cleanTitle,
          tahunAjaran: tahunAjaran,
          sekolah: schoolProfile,
          kepalaSekolah: schoolProfile.kepalaSekolah,
          dataKhusus: {
            tanggalRapat: tanggalRapat,
          },
          employees: employees,
          userPrompt: `Buat draft SK lengkap untuk judul: ${cleanTitle}`,
        }),
      });

      const resJson = await res.json();
      if (!resJson.success || !resJson.data) {
        throw new Error(resJson.error || "Gagal memproses draf SK");
      }

      const generated = resJson.data;

      // Bentuk dokumen SK resmi lengkap
      const fullDoc: SKDocument = {
        id: `sk-${Date.now()}`,
        nomor: nomorSK,
        judul: cleanTitle || generated.judul,
        jenisSK: cleanTitle,
        tahunAjaran: tahunAjaran,
        tanggalTetap: tanggalTetap,
        tempatTetap: tempatTetap,
        tanggalRapat: tanggalRapat,
        perihalRapat: `Rapat Dewan Guru tentang ${cleanTitle}`,
        menimbang: generated.menimbang && generated.menimbang.length > 0
          ? generated.menimbang
          : [
              `Bahwa dalam rangka mendukung kelancaran pelaksanaan tugas dan peningkatan mutu layanan pendidikan di ${schoolProfile.nama}, dipandang perlu menetapkan pembagian tugas melalui Surat Keputusan Kepala Sekolah.`,
              `Bahwa mereka yang namanya tercantum dalam lampiran keputusan ini dianggap cakap, mampu, dan memenuhi syarat untuk melaksanakan tugas yang diamanahkan.`,
              `Bahwa berdasarkan pertimbangan sebagaimana dimaksud, perlu menetapkan Keputusan Kepala Sekolah tentang ${cleanTitle}.`,
            ],
        mengingat: generated.mengingat && generated.mengingat.length > 0
          ? generated.mengingat
          : [
              "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
              "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Standar Nasional Pendidikan;",
              "Peraturan Menteri Pendidikan Dasar dan Menengah RI Nomor 12 Tahun 2025 tentang Standar Isi;",
              "Peraturan Menteri Pendidikan Dasar dan Menengah RI Nomor 13 Tahun 2025 tentang Kurikulum;",
              "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 47 Tahun 2023 tentang Standar Pengelolaan;",
              `Keputusan Kepala Dinas Pendidikan tentang Kalender Pendidikan bagi Satuan Pendidikan Tahun Ajaran ${tahunAjaran};`,
            ],
        memperhatikan: generated.memperhatikan || `Hasil Keputusan Rapat Dewan Guru ${schoolProfile.nama} pada tanggal ${tanggalRapat} tentang ${cleanTitle}.`,
        diktum: generated.diktum && generated.diktum.length > 0
          ? generated.diktum
          : [
              {
                poin: "KESATU",
                isi: `Membentuk dan menetapkan susunan pelaksana ${cleanTitle} sebagaimana tercantum dalam lampiran keputusan ini.`,
              },
              {
                poin: "KEDUA",
                isi: "Masing-masing personil yang ditunjuk wajib melaksanakan tugas dengan penuh rasa tanggung jawab serta melaporkan pelaksanaannya secara berkala kepada Kepala Sekolah.",
              },
              {
                poin: "KETIGA",
                isi: "Segala biaya yang timbul akibat pelaksanaan keputusan ini dibebankan kepada anggaran sekolah yang relevan dan sah.",
              },
              {
                poin: "KEEMPAT",
                isi: "Keputusan ini mulai berlaku sejak tanggal ditetapkan, dan apabila terdapat kekeliruan di kemudian hari akan diadakan perbaikan sebagaimana mestinya.",
              },
            ],
        tembusan: generated.tembusan && generated.tembusan.length > 0
          ? generated.tembusan
          : [
              `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${schoolProfile.kabupaten}`,
              `Korwil Satuan Pendidikan Formal (SPF) Kecamatan ${schoolProfile.kecamatan}`,
              "Pengawas Sekolah Pembina",
              "Ketua Komite Sekolah",
              "Arsip Sekolah",
            ],
        lampiranList: generated.lampiranList && generated.lampiranList.length > 0
          ? generated.lampiranList.map((att: any, idx: number) => ({
              id: `att-${idx + 1}`,
              nomorLampiran: att.nomorLampiran || `Lampiran ${idx + 1}`,
              judul: att.judul || `Susunan Pelaksana ${cleanTitle}`,
              jenisLampiran: att.jenisLampiran || "susunan_tim",
              headers: att.headers || ["No", "Nama / NIP", "Pangkat / Golongan", "Jabatan Kedinasan", "Jabatan dalam Tim", "Uraian Tugas"],
              rows: att.rows || [],
              footerNote: att.footerNote || "",
            }))
          : [
              {
                id: "att-1",
                nomorLampiran: "Lampiran I",
                judul: `Susunan Pelaksana ${cleanTitle}`,
                jenisLampiran: "susunan_tim",
                headers: ["No", "Nama / NIP", "Pangkat / Golongan", "Jabatan Kedinasan", "Jabatan dalam Tim", "Uraian Tugas"],
                rows: employees.slice(0, 6).map((e, idx) => [
                  String(idx + 1),
                  `${e.nama}\n${e.nip && e.nip !== "-" ? (e.statusKepegawaian === "PPPK" ? `NIPPPK. ${e.nip}` : `NIP. ${e.nip}`) : "NIP. -"}`,
                  e.pangkat && e.golongan ? `${e.pangkat}\n/${e.golongan}` : "-",
                  e.jabatan || "Guru Kelas",
                  idx === 0 ? "Ketua Tim" : idx === 1 ? "Sekretaris" : idx === 2 ? "Bendahara" : "Anggota Pelaksana",
                  "Melaksanakan tugas kepanitiaan dan operasional",
                ]),
                footerNote: "Semua anggota tim bertanggung jawab langsung kepada Kepala Sekolah.",
              },
            ],
        status: "draft",
        kepalaSekolah: schoolProfile.kepalaSekolah,
        sekolah: {
          nama: schoolProfile.nama,
          alamat: schoolProfile.alamat,
          kabupaten: schoolProfile.kabupaten,
          kecamatan: schoolProfile.kecamatan,
        },
        aiNotes: generated.aiNotes || ["Draf SK otomatis siap diedit dan diekspor ke Microsoft Word (.docx)."],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Simpan parameter agar konsisten
      saveDefaultSKParams({
        tahunAjaran,
        tanggalTetap,
        tempatTetap,
        tanggalRapat,
      });

      setActiveDoc(fullDoc);
      // Otomatis simpan ke arsip
      onSaveToArchive(fullDoc);
      setIsSavedSuccess(true);
    } catch (err: any) {
      console.error("Gagal menyusun SK:", err);
      setErrorMsg(err.message || "Terjadi kendala saat menyusun draf SK. Silakan coba lagi.");
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setIsGenerating(false);
      setGenerationStage("");
    }
  };

  // Handler Download Word (.docx) - Aksi Utama yang Diinginkan Kepala Sekolah
  const handleDownloadWordDocx = async () => {
    if (!activeDoc) return;
    try {
      setIsExportingWord(true);
      await exportSKToDocx(activeDoc, {
        ...schoolProfile,
        kopSuratUrl: kopUrl,
      });
    } catch (err) {
      console.error("Gagal unduh word:", err);
      alert("Gagal mengekspor draf SK ke Word (.docx). Silakan periksa kembali data.");
    } finally {
      setIsExportingWord(false);
    }
  };

  // Handler Cetak / PDF
  const handlePrintDocument = () => {
    window.print();
  };

  // Handler Simpan Perubahan Edit
  const handleSaveInlineEdit = () => {
    if (!activeDoc) return;
    onSaveToArchive(activeDoc);
    setIsEditingInline(false);
    setIsSavedSuccess(true);
    setTimeout(() => setIsSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Kartu Hero Generator Kilat (Hanya Ketik Judul) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
        {/* Banner Identitas Sekolah */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Penyusun Draf SK Kilat Kepala Sekolah SD</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Buat Draf SK & Hasilkan File Word (.docx)
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
                Cukup ketikkan judul SK yang Anda inginkan. Sistem otomatis menyusun konsiderans Menimbang, dasar hukum Mengingat, Diktum Putusan, dan tabel lampiran {employees.length} guru/PTK.
              </p>
            </div>

            {/* Tombol Pintas Ringkas */}
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <button
                onClick={onOpenEmployeeManager}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                title="Kelola data 11 guru/PTK SD Negeri 3 Loloan Timur"
              >
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>{employees.length} Guru/PTK</span>
              </button>
              <button
                onClick={onOpenSchoolProfile}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                title="Atur profil sekolah & KOP Surat"
              >
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span>KOP Sekolah</span>
              </button>
            </div>
          </div>
        </div>

        {/* Form Input Judul SK */}
        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <label
              htmlFor="sk-title-input"
              className="block text-sm font-bold text-slate-800 mb-1.5"
            >
              Ketik Judul SK yang Ingin Dibuat:
            </label>
            <div className="relative">
              <input
                id="sk-title-input"
                type="text"
                value={judulInput}
                onChange={(e) => {
                  setJudulInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isGenerating) {
                    handleGenerateDraf();
                  }
                }}
                placeholder="Contoh: Pembagian Tugas Guru Semester Genap TP 2024/2025, atau Tim Pelaksana UKS, atau Panitia ANBK..."
                className="w-full text-sm sm:text-base px-4 py-3.5 rounded-xl border-2 border-emerald-500/50 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/20 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 font-medium outline-none transition-all shadow-inner"
                disabled={isGenerating}
              />
              {judulInput && (
                <button
                  type="button"
                  onClick={() => setJudulInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded bg-slate-200/60 cursor-pointer"
                >
                  Bersihkan
                </button>
              )}
            </div>
            {errorMsg && (
              <div className="flex items-center gap-2 text-rose-600 text-xs font-semibold mt-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Rekomendasi Judul SK 1-Klik Populer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Atau pilih rekomendasi judul SK umum sekolah:</span>
              <span className="text-[11px] text-emerald-600">Klik untuk langsung isi</span>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {POPULAR_SK_SUGGESTIONS.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setJudulInput(sug.judul);
                    handleGenerateDraf(sug.judul);
                  }}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 text-xs font-medium cursor-pointer transition-all text-left disabled:opacity-50"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>{sug.judul}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Opsi Ringkas (Accordion Tersembunyi: Nomor & Tanggal) */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>
                {showAdvanced
                  ? "Tutup Pengaturan Nomor & Tanggal"
                  : "Sesuaikan Nomor Surat & Tanggal Penetapan (Opsional)"}
              </span>
            </button>

            {showAdvanced && (
              <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nomor SK Otomatis:
                  </label>
                  <input
                    type="text"
                    value={nomorSK}
                    onChange={(e) => setNomorSK(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tahun Ajaran:
                  </label>
                  <input
                    type="text"
                    value={tahunAjaran}
                    onChange={(e) => setTahunAjaran(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tanggal Penetapan:
                  </label>
                  <input
                    type="text"
                    value={tanggalTetap}
                    onChange={(e) => setTanggalTetap(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tempat Penetapan:
                  </label>
                  <input
                    type="text"
                    value={tempatTetap}
                    onChange={(e) => setTempatTetap(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tombol Utama: Buat Draf SK Sekarang */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={() => handleGenerateDraf()}
              disabled={isGenerating || !judulInput.trim()}
              className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-md shadow-emerald-700/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>{generationStage || "Sedang Menyusun Draf SK..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-emerald-200" />
                  <span>Buat Draf SK Sekarang</span>
                </>
              )}
            </button>

            {activeDoc && (
              <button
                type="button"
                onClick={onNavigateToArchive}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm border border-slate-300 cursor-pointer transition-colors"
              >
                <FolderArchive className="w-4 h-4 text-slate-600" />
                <span>Lihat Daftar Draf Tersimpan</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bagian Hasil Draf SK & Tombol Aksi Download Word (.docx) */}
      {activeDoc ? (
        <div className="space-y-4">
          {/* Action Bar Atas Utama (Paling Menonjol) */}
          <div className="bg-white rounded-2xl border-2 border-emerald-500/40 p-4 sm:p-5 shadow-lg shadow-emerald-950/5 print:hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    Draf SK Siap Digunakan
                  </span>
                  {isSavedSuccess && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      <Check className="w-3 h-3" /> Tersimpan
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1 line-clamp-1">
                  {activeDoc.judul}
                </h3>
                <p className="text-xs text-slate-500">
                  Nomor: <span className="font-mono font-semibold text-slate-700">{activeDoc.nomor}</span> • Tahun Ajaran: {activeDoc.tahunAjaran}
                </p>
              </div>

              {/* Tombol Utama: Unduh File Word (.docx) */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  id="btn-download-word-primary"
                  onClick={handleDownloadWordDocx}
                  disabled={isExportingWord}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-extrabold text-sm shadow-md shadow-emerald-800/30 cursor-pointer transition-all disabled:opacity-60"
                  title="Unduh draf SK ini dalam format Microsoft Word (.docx) untuk langsung dibuka dan diedit di Word"
                >
                  {isExportingWord ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyiapkan Dokumen Word...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Unduh File Word (.docx)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handlePrintDocument}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm border border-slate-300 cursor-pointer transition-colors"
                  title="Cetak langsung atau simpan PDF"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>Cetak / PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingInline(!isEditingInline)}
                  className={`flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-xl font-semibold text-xs sm:text-sm border cursor-pointer transition-colors ${
                    isEditingInline
                      ? "bg-amber-100 text-amber-900 border-amber-300"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
                  }`}
                  title="Ubah teks konsiderans atau diktum langsung di web"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{isEditingInline ? "Tutup Editor" : "Edit Teks Draf"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveDoc(null);
                    setJudulInput("");
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-medium border border-slate-200 cursor-pointer transition-colors"
                  title="Buat SK baru"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">SK Baru</span>
                </button>
              </div>
            </div>
          </div>

          {/* Form Edit Cepat (Jika Mode Edit Diaktifkan) */}
          {isEditingInline && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-4 print:hidden">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-700" />
                  <span>Edit Redaksi Dokumen Surat Keputusan</span>
                </h4>
                <button
                  type="button"
                  onClick={handleSaveInlineEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Judul SK:
                  </label>
                  <textarea
                    rows={2}
                    value={activeDoc.judul}
                    onChange={(e) =>
                      setActiveDoc({ ...activeDoc, judul: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Nomor SK:
                  </label>
                  <input
                    type="text"
                    value={activeDoc.nomor}
                    onChange={(e) =>
                      setActiveDoc({ ...activeDoc, nomor: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <label className="block font-bold text-slate-800">
                  Konsiderans Menimbang (Poin a, b, c):
                </label>
                {activeDoc.menimbang.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="font-bold text-slate-600 pt-1">
                      {String.fromCharCode(97 + idx)}.
                    </span>
                    <textarea
                      rows={2}
                      value={item}
                      onChange={(e) => {
                        const next = [...activeDoc.menimbang];
                        next[idx] = e.target.value;
                        setActiveDoc({ ...activeDoc, menimbang: next });
                      }}
                      className="flex-1 p-2 rounded-lg border border-slate-300 bg-white text-slate-800"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-xs">
                <label className="block font-bold text-slate-800">
                  Diktum Keputusan (MEMUTUSKAN):
                </label>
                {activeDoc.diktum.map((d, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="font-bold text-slate-600 pt-1 w-16">
                      {d.poin}:
                    </span>
                    <textarea
                      rows={2}
                      value={d.isi}
                      onChange={(e) => {
                        const next = [...activeDoc.diktum];
                        next[idx] = { ...d, isi: e.target.value };
                        setActiveDoc({ ...activeDoc, diktum: next });
                      }}
                      className="flex-1 p-2 rounded-lg border border-slate-300 bg-white text-slate-800"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pratinjau Lembar Dokumen A4 Resmi */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-10 text-slate-900 font-serif leading-relaxed text-sm print:shadow-none print:border-none print:p-0">
            {/* KOP SURAT RESMI */}
            <div className="text-center mb-6">
              {kopUrl ? (
                <div className="w-full flex justify-center mb-2">
                  <img
                    src={kopUrl}
                    alt="KOP Surat Resmi SD"
                    className="max-h-36 w-auto object-contain mx-auto"
                  />
                </div>
              ) : (
                <div className="border-b-4 border-double border-slate-900 pb-3 mb-4">
                  <h3 className="text-sm font-bold tracking-widest text-slate-700 uppercase">
                    PEMERINTAH KABUPATEN {schoolProfile.kabupaten.toUpperCase()}
                  </h3>
                  <h4 className="text-xs font-bold text-slate-700 uppercase">
                    DINAS PENDIDIKAN KEPEMUDAAN DAN OLAHRAGA
                  </h4>
                  <h2 className="text-base sm:text-lg font-black tracking-wide text-slate-950 uppercase mt-0.5">
                    {schoolProfile.nama.toUpperCase()}
                  </h2>
                  <p className="text-[11px] text-slate-600 font-sans mt-0.5">
                    {schoolProfile.alamat}, {schoolProfile.desa}, Kec. {schoolProfile.kecamatan}, Kab. {schoolProfile.kabupaten}
                  </p>
                </div>
              )}
            </div>

            {/* JUDUL DAN NOMOR SK */}
            <div className="text-center my-6 space-y-1">
              <h2 className="font-bold text-base sm:text-lg tracking-wide uppercase">
                KEPUTUSAN KEPALA {schoolProfile.nama.toUpperCase()}
              </h2>
              <p className="text-xs font-bold font-sans">
                NOMOR : {activeDoc.nomor}
              </p>
              <div className="py-2">
                <p className="text-xs font-bold uppercase tracking-wider">TENTANG</p>
                <h3 className="font-bold text-sm sm:text-base uppercase max-w-2xl mx-auto mt-1 leading-snug">
                  {activeDoc.judul}
                </h3>
                <p className="text-xs font-bold uppercase mt-1">
                  TAHUN AJARAN {activeDoc.tahunAjaran}
                </p>
              </div>
              <p className="font-bold text-xs uppercase pt-2">
                DENGAN RAHMAT TUHAN YANG MAHA ESA
              </p>
              <p className="font-bold text-xs uppercase">
                KEPALA {schoolProfile.nama.toUpperCase()},
              </p>
            </div>

            {/* KONSIDERANS MENIMBANG */}
            <div className="my-4 space-y-1.5 text-xs sm:text-sm">
              <div className="flex gap-4">
                <span className="font-bold w-24 shrink-0">Menimbang</span>
                <span className="font-bold">:</span>
                <div className="flex-1 space-y-1.5">
                  {activeDoc.menimbang.map((m, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="shrink-0">{String.fromCharCode(97 + idx)}.</span>
                      <p className="text-justify leading-relaxed">{m}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* DASAR HUKUM MENGINGAT */}
            <div className="my-4 space-y-1.5 text-xs sm:text-sm">
              <div className="flex gap-4">
                <span className="font-bold w-24 shrink-0">Mengingat</span>
                <span className="font-bold">:</span>
                <div className="flex-1 space-y-1.5">
                  {activeDoc.mengingat.map((m, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="shrink-0">{idx + 1}.</span>
                      <p className="text-justify leading-relaxed">{m}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* MEMPERHATIKAN */}
            {activeDoc.memperhatikan && (
              <div className="my-4 text-xs sm:text-sm">
                <div className="flex gap-4">
                  <span className="font-bold w-24 shrink-0">Memperhatikan</span>
                  <span className="font-bold">:</span>
                  <div className="flex-1">
                    <p className="text-justify leading-relaxed">{activeDoc.memperhatikan}</p>
                  </div>
                </div>
              </div>
            )}

            {/* MEMUTUSKAN */}
            <div className="text-center my-6">
              <h3 className="font-bold text-xs sm:text-sm tracking-widest uppercase">
                MEMUTUSKAN :
              </h3>
            </div>

            {/* MENETAPKAN & DIKTUM */}
            <div className="my-4 space-y-3 text-xs sm:text-sm">
              <div className="flex gap-4">
                <span className="font-bold w-24 shrink-0">Menetapkan</span>
                <span className="font-bold">:</span>
                <div className="flex-1">
                  <p className="font-bold uppercase">
                    KEPUTUSAN KEPALA {schoolProfile.nama.toUpperCase()} TENTANG {activeDoc.judul} TAHUN AJARAN {activeDoc.tahunAjaran}.
                  </p>
                </div>
              </div>

              {activeDoc.diktum.map((d, idx) => (
                <div key={idx} className="flex gap-4">
                  <span className="font-bold w-24 shrink-0 uppercase">{d.poin}</span>
                  <span className="font-bold">:</span>
                  <div className="flex-1">
                    <p className="text-justify leading-relaxed">{d.isi}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* TANDA TANGAN KEPALA SEKOLAH */}
            <div className="mt-10 flex justify-end text-xs sm:text-sm font-sans">
              <div className="w-72 text-left space-y-1">
                <p>Ditetapkan di : {activeDoc.tempatTetap || schoolProfile.desa || "Loloan Timur"}</p>
                <p>Pada tanggal : {activeDoc.tanggalTetap}</p>
                <p className="font-bold mt-2">
                  Kepala {schoolProfile.nama},
                </p>
                <div className="h-20 flex items-center text-slate-300 italic text-[11px]">
                  (Tanda Tangan & Cap Sekolah)
                </div>
                <p className="font-bold text-slate-950 underline decoration-slate-900">
                  {schoolProfile.kepalaSekolah.nama}
                </p>
                <p className="text-slate-700 text-xs">
                  {schoolProfile.kepalaSekolah.pangkat && schoolProfile.kepalaSekolah.golongan
                    ? `${schoolProfile.kepalaSekolah.pangkat} / ${schoolProfile.kepalaSekolah.golongan}`
                    : "Pembina / IV/a"}
                </p>
                <p className="text-slate-700 font-mono text-xs">
                  NIP. {schoolProfile.kepalaSekolah.nip}
                </p>
              </div>
            </div>

            {/* TEMBUSAN */}
            {activeDoc.tembusan && activeDoc.tembusan.length > 0 && (
              <div className="mt-8 pt-4 border-t border-slate-200 text-xs font-sans">
                <p className="font-bold text-slate-800 mb-1">Tembusan disampaikan kepada Yth:</p>
                <ol className="list-decimal pl-5 space-y-0.5 text-slate-600">
                  {activeDoc.tembusan.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* LAMPIRAN DOKUMEN */}
            {activeDoc.lampiranList && activeDoc.lampiranList.length > 0 && (
              <div className="mt-12 pt-8 border-t-2 border-dashed border-slate-300 space-y-8">
                {activeDoc.lampiranList.map((att, attIdx) => (
                  <div key={att.id || attIdx} className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs font-sans">
                      <div>
                        <span className="font-bold uppercase text-slate-900">{att.nomorLampiran}</span>
                        <h4 className="font-bold text-sm text-slate-900 uppercase mt-0.5">
                          {att.judul}
                        </h4>
                      </div>
                      <div className="text-right text-[11px] text-slate-500">
                        <p>Nomor : {activeDoc.nomor}</p>
                        <p>Tanggal : {activeDoc.tanggalTetap}</p>
                      </div>
                    </div>

                    {/* Tabel Lampiran */}
                    <div className="overflow-x-auto border border-slate-300 rounded-lg">
                      <table className="w-full text-left text-xs font-sans border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                            {att.headers.map((h, hIdx) => (
                              <th
                                key={hIdx}
                                className="px-3 py-2 border-r border-slate-300 last:border-r-0 text-center"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {att.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50">
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={`px-3 py-2 border-r border-slate-200 last:border-r-0 whitespace-pre-line ${
                                    cIdx === 0 ? "text-center font-semibold" : ""
                                  }`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {att.footerNote && (
                      <p className="text-[11px] text-slate-500 italic font-sans">
                        Catatan: {att.footerNote}
                      </p>
                    )}

                    {/* TTD Lampiran */}
                    <div className="flex justify-end text-xs font-sans pt-4">
                      <div className="w-64 text-left">
                        <p>Kepala {schoolProfile.nama},</p>
                        <div className="h-16"></div>
                        <p className="font-bold underline text-slate-900">
                          {schoolProfile.kepalaSekolah.nama}
                        </p>
                        <p className="font-mono text-slate-700 text-[11px]">
                          NIP. {schoolProfile.kepalaSekolah.nip}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
