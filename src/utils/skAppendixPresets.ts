import { Employee, SKAttachment } from "../types";

export interface AppendixPresetTemplate {
  id: string;
  categoryKey: string;
  nomorLampiran: string;
  judul: string;
  jenisLampiran: SKAttachment["jenisLampiran"];
  headers: string[];
  footerNote: string;
  deskripsi: string;
  generateRows: (employees: Employee[], kepalaSekolah?: any) => string[][];
}

/**
 * Format string NIP dengan penanda NIP atau NIPPPK sesuai status kepegawaian
 */
function formatNipDisplay(emp?: Employee): string {
  if (!emp || !emp.nip || emp.nip.trim() === "" || emp.nip === "-") {
    return "NIP. -";
  }
  const cleanNip = emp.nip.trim();
  if (emp.statusKepegawaian === "PPPK") {
    return `NIPPPK. ${cleanNip}`;
  }
  return `NIP. ${cleanNip}`;
}

function formatPangkatGol(emp?: Employee): string {
  if (!emp) return "-";
  if (emp.pangkat && emp.golongan) {
    return `${emp.pangkat}\n/${emp.golongan}`;
  }
  if (emp.golongan) return emp.golongan;
  if (emp.pangkat) return emp.pangkat;
  return "-";
}

export const APPENDIX_PRESETS: AppendixPresetTemplate[] = [
  // 1. KBM - LAMPIRAN I (Proses Belajar Mengajar)
  {
    id: "kbm-pembelajaran",
    categoryKey: "kbm",
    nomorLampiran: "Lampiran I",
    judul: "Pembagian Tugas Guru Dalam Proses Pembelajaran",
    jenisLampiran: "pembagian_tugas_guru",
    headers: [
      "No",
      "Nama / NIP",
      "Pangkat / Golongan",
      "Jabatan Kedinasan",
      "Mata Pelajaran yang Diampu",
      "Kelas",
      "Jumlah Jam",
    ],
    footerNote: "Beban kerja guru disesuaikan dengan regulasi pemenuhan jam mengajar 24-40 jam tatap muka.",
    deskripsi: "Tabel pembagian jam mengajar guru kelas dan mata pelajaran.",
    generateRows: (employees) => {
      const teachers = employees.filter((e) => e.jabatan?.toLowerCase().includes("guru") || e.jenisPTK?.toLowerCase().includes("guru"));
      const list = teachers.length > 0 ? teachers : employees;
      return list.map((e, idx) => [
        String(idx + 1),
        `${e.nama}\n${formatNipDisplay(e)}`,
        formatPangkatGol(e),
        e.jabatan || "Guru Kelas",
        e.mapel || "Semua Mata Pelajaran / Tematik",
        e.kelas ? `Kelas ${e.kelas}` : "I - VI",
        e.jumlahJamAjar ? `${e.jumlahJamAjar} Jam` : "32 Jam",
      ]);
    },
  },

  // 2. KBM - LAMPIRAN II (Wali Kelas & KKG/K3S)
  {
    id: "kbm-wali-kkg",
    categoryKey: "kbm",
    nomorLampiran: "Lampiran II",
    judul: "Pembagian Tugas Tambahan Guru Sebagai Wali Kelas, K3S dan KKG",
    jenisLampiran: "tugas_tambahan_guru",
    headers: [
      "No",
      "Nama / NIP",
      "Pangkat / Golongan",
      "Jabatan",
      "K 3 S / KKG",
      "Wali Kelas",
    ],
    footerNote: "Tugas tambahan dilaksanakan beriringan dengan tugas pokok pembelajaran.",
    deskripsi: "Tabel penugasan peran guru di K3S/KKG serta penetapan wali kelas I-VI.",
    generateRows: (employees) => {
      const teachers = employees.filter((e) => e.jabatan?.toLowerCase().includes("guru") || e.jenisPTK?.toLowerCase().includes("guru"));
      const list = teachers.length > 0 ? teachers : employees;
      return list.map((e, idx) => {
        const kkgInfo = e.tugasTambahan?.find((t) => t.toUpperCase().includes("KKG")) || `KKG ${e.kelas ? `Kelas ${e.kelas}` : "Gugus"}`;
        const waliInfo = e.kelas ? `Wali Kelas ${e.kelas}` : "-";
        return [
          String(idx + 1),
          `${e.nama}\n${formatNipDisplay(e)}`,
          formatPangkatGol(e),
          e.jabatan || "Guru Kelas",
          kkgInfo,
          waliInfo,
        ];
      });
    },
  },

  // 3. KBM - LAMPIRAN III (Tenaga Kependidikan)
  {
    id: "kbm-tendik",
    categoryKey: "tendik",
    nomorLampiran: "Lampiran III",
    judul: "Pembagian Tugas Tenaga Kependidikan",
    jenisLampiran: "tenaga_kependidikan",
    headers: [
      "No",
      "Nama / NIP",
      "Pangkat / Golongan",
      "Jabatan",
      "Uraian Tugas Pokok",
      "Keterangan",
    ],
    footerNote: "Tenaga kependidikan bertanggung jawab atas ketertiban administrasi dan pelayanan sekolah.",
    deskripsi: "Tabel tugas staf tata usaha, perpustakaan, operator, dan pengelola sarpras.",
    generateRows: (employees) => {
      const tendik = employees.filter((e) => !e.jabatan?.toLowerCase().includes("guru") && !e.jabatan?.toLowerCase().includes("kepala"));
      const list = tendik.length > 0 ? tendik : employees.slice(0, 3);
      return list.map((e, idx) => [
        String(idx + 1),
        `${e.nama}\n${formatNipDisplay(e)}`,
        formatPangkatGol(e),
        e.jabatan || "Pengadministrasian Umum",
        e.tugasTambahan && e.tugasTambahan.length > 0 ? e.tugasTambahan.join("\n") : "Pelayanan Administrasi Sekolah dan Pengarsipan",
        e.statusKepegawaian || "Aktif",
      ]);
    },
  },

  // 4. KBM - LAMPIRAN IV (Tugas Tambahan Pendidik dan Tenaga Kependidikan)
  {
    id: "kbm-tugas-tambahan-ptk",
    categoryKey: "tugas_tambahan",
    nomorLampiran: "Lampiran IV",
    judul: "Pembagian Tugas Tambahan Pendidik dan Tenaga Kependidikan",
    jenisLampiran: "tugas_tambahan_ptk",
    headers: [
      "No",
      "Nama / NIP",
      "Jabatan Pokok",
      "Tugas Tambahan Khusus",
      "Uraian Tanggung Jawab",
      "Beban / Keterangan",
    ],
    footerNote: "Pelaksanaan tugas tambahan dilaporkan kepada kepala sekolah secara berkala.",
    deskripsi: "Tabel penugasan koordinator 7K, UKS, Pramuka, Bimbingan Konseling, dan Operator.",
    generateRows: (employees) => {
      return employees.slice(0, 8).map((e, idx) => {
        const tugas = e.tugasTambahan && e.tugasTambahan.length > 0 ? e.tugasTambahan.slice(0, 2).join(", ") : "Koordinator Kegiatan Siswa";
        return [
          String(idx + 1),
          `${e.nama}\n${formatNipDisplay(e)}`,
          e.jabatan || "Guru Kelas",
          tugas,
          "Melaksanakan perencanaan, pelaksanaan, serta evaluasi program penugasan khusus",
          "Ekuivalen 2 - 12 Jam",
        ];
      });
    },
  },

  // 5. TIM BOSP / BOS
  {
    id: "tim-bosp",
    categoryKey: "bos",
    nomorLampiran: "Lampiran I",
    judul: "Susunan Tim Pengelola Bantuan Operasional Satuan Pendidikan (BOSP)",
    jenisLampiran: "susunan_panitia",
    headers: [
      "No",
      "Nama / NIP",
      "Jabatan Kedinasan",
      "Jabatan dalam Tim BOSP",
      "Rincian Tugas Pokok & Kewenangan",
    ],
    footerNote: "Tim BOSP bertanggung jawab mutlak atas ketertiban administrasi dan kepatuhan Juknis BOSP.",
    deskripsi: "Tabel susunan penanggung jawab, bendahara, operator, dan pengawas komite dana BOSP.",
    generateRows: (employees, kepalaSekolah) => [
      [
        "1",
        `${kepalaSekolah?.nama || "Kepala Sekolah"}\n${kepalaSekolah?.nip ? `NIP. ${kepalaSekolah.nip}` : "NIP. -" }`,
        "Kepala Sekolah",
        "Penanggung Jawab",
        "Bertanggung jawab mutlak atas penerimaan, perencanaan, penggunaan dan pelaporan dana BOSP",
      ],
      [
        "2",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Bendahara Sekolah",
        employees[0]?.jabatan || "Guru Kelas",
        "Bendahara BOSP",
        "Mengelola buku kas umum, buku pembantu pajak, transaksi pembayaran, serta pelaporan ARKAS",
      ],
      [
        "3",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Anggota Tim",
        employees[1]?.jabatan || "Guru Kelas",
        "Anggota (Perencana & Verifikator)",
        "Membantu penyusunan RKAS tahunan, verifikasi SPJ, dan pemeriksaan fisik barang hasil belanja",
      ],
      [
        "4",
        "Ketua Komite Sekolah\nNIP. -",
        "Komite Sekolah",
        "Anggota (Pengawas)",
        "Memberikan pertimbangan dan mengawasi akuntabilitas serta transparansi penggunaan dana",
      ],
    ],
  },

  // 6. TIM PENCEGAHAN DAN PENANGANAN KEKERASAN (TPPK)
  {
    id: "tim-tppk",
    categoryKey: "tppk",
    nomorLampiran: "Lampiran I",
    judul: "Susunan Keanggotaan Tim Pencegahan dan Penanganan Kekerasan (TPPK)",
    jenisLampiran: "susunan_panitia",
    headers: [
      "No",
      "Nama Lengkap / NIP",
      "Unsur Keterwakilan",
      "Kedudukan dalam TPPK",
      "Tugas dan Fungsi",
      "Masa Tugas",
    ],
    footerNote: "Keanggotaan TPPK wajib terdaftar di Dapodik dan Portal Kemendikdasmen (Permendikbudristek No. 46/2023).",
    deskripsi: "Tabel keanggotaan TPPK dari unsur guru, tenaga kependidikan, dan orang tua/komite.",
    generateRows: (employees) => [
      [
        "1",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Koordinator TPPK",
        "Pendidik (Guru)",
        "Koordinator",
        "Memimpin koordinasi pencegahan, penanganan kasus, serta pelaporan berkala",
        "2 Tahun",
      ],
      [
        "2",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Guru Pembina",
        "Pendidik (Guru)",
        "Anggota",
        "Sosialisasi tata tertib ramah anak, mitigasi kekerasan, dan edukasi peserta didik",
        "2 Tahun",
      ],
      [
        "3",
        "Perwakilan Komite Sekolah / Tokoh Masyarakat\nNIP. -",
        "Komite / Orang Tua",
        "Anggota",
        "Penghubung kemitraan sekolah dengan wali murid dan lingkungan masyarakat",
        "2 Tahun",
      ],
      [
        "4",
        employees[2] ? `${employees[2].nama}\n${formatNipDisplay(employees[2])}` : "Tenaga Kependidikan",
        "Tenaga Kependidikan",
        "Anggota",
        "Pencatatan kanal pelaporan, pengarsipan berkas rahasia, dan dukungan teknis sarpras",
        "2 Tahun",
      ],
    ],
  },

  // 7. TIM PENGEMBANG KURIKULUM (TPK)
  {
    id: "tim-kurikulum",
    categoryKey: "kurikulum",
    nomorLampiran: "Lampiran I",
    judul: "Susunan Tim Pengembang Kurikulum Satuan Pendidikan (TPK)",
    jenisLampiran: "susunan_panitia",
    headers: [
      "No",
      "Nama / NIP",
      "Pangkat / Golongan",
      "Jabatan Kedinasan",
      "Jabatan dalam Tim",
      "Uraian Tugas dan Tanggung Jawab",
    ],
    footerNote: "Dokumen Kurikulum Satuan Pendidikan (KSP) direviu setiap awal tahun ajaran.",
    deskripsi: "Tabel susunan pengarah, ketua, sekretaris, dan tim perumus muatan kurikulum merdeka.",
    generateRows: (employees, kepalaSekolah) => [
      [
        "1",
        `${kepalaSekolah?.nama || "Kepala Sekolah"}\n${kepalaSekolah?.nip ? `NIP. ${kepalaSekolah.nip}` : "NIP. -" }`,
        kepalaSekolah?.golongan ? `${kepalaSekolah.pangkat || "Pembina"}\n/${kepalaSekolah.golongan}` : "Pembina / IV/a",
        "Kepala Sekolah",
        "Pengarah & Penanggung Jawab",
        "Menetapkan arah kebijakan, visi-misi sekolah, dan mengesahkan dokumen KSP",
      ],
      [
        "2",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Ketua TPK",
        formatPangkatGol(employees[0]),
        employees[0]?.jabatan || "Guru Kelas",
        "Ketua Tim Pengembang",
        "Mengordinasikan penyusunan analisis karakteristik sekolah, CP, TP, ATP, dan modul ajar",
      ],
      [
        "3",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Sekretaris TPK",
        formatPangkatGol(employees[1]),
        employees[1]?.jabatan || "Guru Kelas",
        "Sekretaris",
        "Menyusun draf naskah, notula rapat, dan mengompilasi lampiran kalender serta program",
      ],
      [
        "4",
        "Pengawas Sekolah Dasar Pembina\nNIP. -",
        "-",
        "Pengawas Sekolah",
        "Narasumber / Validator",
        "Melakukan reviu, verifikasi dan validasi kesesuaian dokumen dengan regulasi kementerian",
      ],
      [
        "5",
        "Ketua Komite Sekolah\nNIP. -",
        "-",
        "Komite Sekolah",
        "Anggota (Mitra Masukan)",
        "Memberikan pertimbangan kebutuhan lokal, aspirasi orang tua, dan nilai budaya daerah",
      ],
    ],
  },

  // 8. PANITIA ASESMEN / UJIAN / ANBK / SAS
  {
    id: "panitia-asesmen",
    categoryKey: "ujian",
    nomorLampiran: "Lampiran I",
    judul: "Susunan Panitia Pelaksana Asesmen dan Ujian Sekolah",
    jenisLampiran: "susunan_panitia",
    headers: [
      "No",
      "Nama / NIP",
      "Jabatan Kedinasan",
      "Jabatan dalam Kepanitiaan",
      "Uraian Tugas & Tanggung Jawab",
    ],
    footerNote: "Panitia bertugas menjamin integritas, kejujuran, dan kelancaran pelaksanaan asesmen.",
    deskripsi: "Tabel susunan ketua, sekretaris, bendahara, proktor ANBK, teknisi, dan perlengkapan.",
    generateRows: (employees, kepalaSekolah) => [
      [
        "1",
        `${kepalaSekolah?.nama || "Kepala Sekolah"}\n${kepalaSekolah?.nip ? `NIP. ${kepalaSekolah.nip}` : "NIP. -" }`,
        "Kepala Sekolah",
        "Penanggung Jawab",
        "Bertanggung jawab umum atas kelancaran dan integritas asesmen",
      ],
      [
        "2",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Ketua Panitia",
        employees[0]?.jabatan || "Guru Kelas",
        "Ketua Panitia",
        "Mengatur jadwal, koordinasi teknis penyusunan soal/kisi-kisi, dan pengawasan",
      ],
      [
        "3",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Sekretaris",
        employees[1]?.jabatan || "Guru Kelas",
        "Sekretaris",
        "Administrasi kartu peserta, daftar hadir, berita acara pelaksanaan, dan pelaporan nilai",
      ],
      [
        "4",
        employees[2] ? `${employees[2].nama}\n${formatNipDisplay(employees[2])}` : "Proktor / Teknisi",
        employees[2]?.jabatan || "Guru / Tenaga Teknis",
        "Proktor & Teknisi",
        "Sinkronisasi data ANBK, persiapan perangkat Chromebook/PC, dan penanganan kendala jaringan",
      ],
    ],
  },

  // 9. PANITIA PPDB / SPMB
  {
    id: "panitia-ppdb",
    categoryKey: "ppdb",
    nomorLampiran: "Lampiran I",
    judul: "Susunan Panitia Penerimaan Peserta Didik Baru (PPDB)",
    jenisLampiran: "susunan_panitia",
    headers: [
      "No",
      "Nama / NIP",
      "Jabatan Kedinasan",
      "Jabatan dalam Panitia PPDB",
      "Tugas Khusus (Pendaftaran / Verifikasi / Pengumuman)",
    ],
    footerNote: "Pelaksanaan PPDB berpedoman pada asas non-diskriminatif, objektif, transparan, dan akuntabel.",
    deskripsi: "Tabel panitia pelayanan pendaftaran, verifikasi berkas, dan daftar ulang siswa baru.",
    generateRows: (employees, kepalaSekolah) => [
      [
        "1",
        `${kepalaSekolah?.nama || "Kepala Sekolah"}\n${kepalaSekolah?.nip ? `NIP. ${kepalaSekolah.nip}` : "NIP. -" }`,
        "Kepala Sekolah",
        "Penanggung Jawab",
        "Menetapkan kuota daya tampung rombel dan mengesahkan keputusan hasil seleksi",
      ],
      [
        "2",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Ketua Panitia",
        employees[0]?.jabatan || "Guru Kelas",
        "Ketua PPDB",
        "Memimpin posko pendaftaran, sosialisasi zonasi, dan rekapitulasi data pendaftar",
      ],
      [
        "3",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Sekretaris & Verifikator",
        employees[1]?.jabatan || "Guru Kelas",
        "Sekretaris",
        "Verifikasi keabsahan akta lahir, KK, bukti afirmasi, serta entri buku induk pendaftar",
      ],
      [
        "4",
        employees[2] ? `${employees[2].nama}\n${formatNipDisplay(employees[2])}` : "Petugas Layanan",
        employees[2]?.jabatan || "Tenaga Kependidikan",
        "Petugas Layanan Informasi",
        "Melayani formulir fisik, membantu orang tua dalam pengisian data, dan penyerahan berkas",
      ],
    ],
  },

  // 10. PEMBINA EKSTRAKURIKULER & UKS / PRAMUKA
  {
    id: "pembina-ekskul",
    categoryKey: "ekskul",
    nomorLampiran: "Lampiran I",
    judul: "Pembagian Tugas Pembina dan Pelatih Kegiatan Ekstrakurikuler",
    jenisLampiran: "kegiatan",
    headers: [
      "No",
      "Nama Pembina / NIP",
      "Jabatan Pokok",
      "Cabang Ekstrakurikuler",
      "Hari & Waktu Latihan",
      "Sasaran Peserta Didik",
    ],
    footerNote: "Kegiatan ekstrakurikuler bertujuan mengembangkan minat, bakat, dan karakter Profil Pelajar Pancasila.",
    deskripsi: "Tabel pembina pramuka, seni tari, drumband, olahraga, UKS, dan keagamaan.",
    generateRows: (employees) => [
      [
        "1",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Pembina Pramuka",
        employees[0]?.jabatan || "Guru Kelas",
        "Pramuka (Siaga & Penggalang)",
        "Jumat, 14.00 - 16.00 WITA",
        "Kelas III, IV, V, VI",
      ],
      [
        "2",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Pembina UKS",
        employees[1]?.jabatan || "Guru Kelas",
        "UKS & Dokter Kecil",
        "Sabtu, 08.00 - 09.30 WITA",
        "Kelas IV dan V",
      ],
      [
        "3",
        employees[2] ? `${employees[2].nama}\n${formatNipDisplay(employees[2])}` : "Pembina Kesenian",
        employees[2]?.jabatan || "Guru Kelas",
        "Seni Tari Bali & Seni Karawitan",
        "Kamis, 14.30 - 16.00 WITA",
        "Kelas I - VI (Berminat)",
      ],
      [
        "4",
        employees[3] ? `${employees[3].nama}\n${formatNipDisplay(employees[3])}` : "Pembina Olahraga",
        employees[3]?.jabatan || "Guru PJOK / Guru Kelas",
        "Olahraga Prestasi (Bulutangkis & Atletik)",
        "Selasa, 15.00 - 17.00 WITA",
        "Kelas IV, V, VI",
      ],
    ],
  },

  // 11. TIM PENJAMINAN MUTU PENDIDIKAN SEKOLAH (TPMPS)
  {
    id: "tim-tpmps",
    categoryKey: "mutu",
    nomorLampiran: "Lampiran I",
    judul: "Susunan Tim Penjaminan Mutu Pendidikan Sekolah (TPMPS)",
    jenisLampiran: "susunan_panitia",
    headers: [
      "No",
      "Nama / NIP",
      "Jabatan",
      "Bidang Standar Nasional Pendidikan",
      "Uraian Tugas dan Kewajiban",
    ],
    footerNote: "Hasil evaluasi TPMPS digunakan sebagai bahan Perencanaan Berbasis Data (PBD) dan RKAS.",
    deskripsi: "Tabel pembagian koordinator 8 Standar Nasional Pendidikan dan Rapor Pendidikan.",
    generateRows: (employees, kepalaSekolah) => [
      [
        "1",
        `${kepalaSekolah?.nama || "Kepala Sekolah"}\n${kepalaSekolah?.nip ? `NIP. ${kepalaSekolah.nip}` : "NIP. -" }`,
        "Kepala Sekolah",
        "Penanggung Jawab Mutu",
        "Menetapkan peta mutu sekolah dan kebijakan tindak lanjut rekomendasi Rapor Pendidikan",
      ],
      [
        "2",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Ketua TPMPS",
        employees[0]?.jabatan || "Guru Kelas",
        "Standar Isi & Standar Proses",
        "Menganalisis ketercapaian literasi, numerasi, dan kualitas proses pembelajaran",
      ],
      [
        "3",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Sekretaris",
        employees[1]?.jabatan || "Guru Kelas",
        "Standar Penilaian & Kelulusan",
        "Mengevaluasi instrumen asesmen dan pencapaian kompetensi lulusan",
      ],
      [
        "4",
        employees[2] ? `${employees[2].nama}\n${formatNipDisplay(employees[2])}` : "Koordinator Sarpras",
        employees[2]?.jabatan || "Tenaga Kependidikan",
        "Standar Sarpras & Pengelolaan",
        "Mengaudit kelayakan sarana belajar, sanitasi, dan akuntabilitas manajemen",
      ],
    ],
  },

  // 12. TIM FASILITATOR PROJEK P5 (Kurikulum Merdeka)
  {
    id: "tim-p5",
    categoryKey: "p5",
    nomorLampiran: "Lampiran I",
    judul: "Tim Fasilitator Projek Penguatan Profil Pelajar Pancasila (P5)",
    jenisLampiran: "kegiatan",
    headers: [
      "No",
      "Nama Fasilitator / NIP",
      "Kedudukan dalam Tim P5",
      "Tema Projek yang Difasilitasi",
      "Fase / Sasaran Kelas",
      "Alokasi Waktu",
    ],
    footerNote: "Pelaksanaan P5 disesuaikan dengan panduan projek profil kementerian.",
    deskripsi: "Tabel koordinator tema, modul projek, dan pembimbingan asesmen projek karakter.",
    generateRows: (employees) => [
      [
        "1",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Koordinator P5",
        "Koordinator Umum P5",
        "Gaya Hidup Berkelanjutan",
        "Fase A, B, dan C (Kelas I - VI)",
        "Blok Mingguan",
      ],
      [
        "2",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Fasilitator Fase A",
        "Fasilitator Projek",
        "Kearifan Lokal",
        "Fase A (Kelas I & II)",
        "2 JP per minggu",
      ],
      [
        "3",
        employees[2] ? `${employees[2].nama}\n${formatNipDisplay(employees[2])}` : "Fasilitator Fase B",
        "Fasilitator Projek",
        "Kewirausahaan / Rekayasa & Teknologi",
        "Fase B (Kelas III & IV)",
        "2 JP per minggu",
      ],
      [
        "4",
        employees[3] ? `${employees[3].nama}\n${formatNipDisplay(employees[3])}` : "Fasilitator Fase C",
        "Fasilitator Projek",
        "Bhinneka Tunggal Ika",
        "Fase C (Kelas V & VI)",
        "2 JP per minggu",
      ],
    ],
  },

  // 13. PENGELOLA PERPUSTAKAAN & LABORATORIUM / SARPRAS
  {
    id: "sarpras-perpustakaan",
    categoryKey: "perpustakaan",
    nomorLampiran: "Lampiran I",
    judul: "Pembagian Tugas Pengelola Perpustakaan dan Sarana Prasarana Sekolah",
    jenisLampiran: "tenaga_kependidikan",
    headers: [
      "No",
      "Nama Petugas / NIP",
      "Jabatan Kedinasan",
      "Unit Pengelolaan",
      "Rincian Tugas & Layanan",
      "Jadwal Layanan",
    ],
    footerNote: "Pengelola wajib menginventarisasi seluruh koleksi buku dan aset sarana secara tertib.",
    deskripsi: "Tabel penugasan kepala perpustakaan, staf sirkulasi buku, dan pengelola laboratorium TIK.",
    generateRows: (employees) => [
      [
        "1",
        employees[employees.length - 2] ? `${employees[employees.length - 2].nama}\n${formatNipDisplay(employees[employees.length - 2])}` : "Pengelola Perpustakaan",
        "Tenaga Kependidikan",
        "Perpustakaan Sekolah",
        "Pengadaan buku, katalogisasi, pelayanan peminjaman, serta pembinaan pojok baca kelas",
        "Senin - Sabtu (Jam Sekolah)",
      ],
      [
        "2",
        employees[employees.length - 1] ? `${employees[employees.length - 1].nama}\n${formatNipDisplay(employees[employees.length - 1])}` : "Pengelola Sarpras",
        "Tenaga Kependidikan",
        "Sarana & Laboratorium TIK",
        "Pemeliharaan Chromebook, proyektor, ruang belajar, dan pelaporan KIB/inventaris aset",
        "Setiap Hari Kerja",
      ],
    ],
  },

  // 14. PANITIA KEGIATAN UMUM / PERINGATAN HARI BESAR (PHBN / PHBI)
  {
    id: "panitia-kegiatan-umum",
    categoryKey: "kegiatan",
    nomorLampiran: "Lampiran I",
    judul: "Susunan Panitia Pelaksana Kegiatan Sekolah",
    jenisLampiran: "susunan_panitia",
    headers: [
      "No",
      "Nama / NIP",
      "Jabatan Kedinasan",
      "Seksi / Divisi Kepanitiaan",
      "Uraian Tugas Pokok",
    ],
    footerNote: "Panitia bertanggung jawab kepada kepala sekolah sampai dengan terselesaikannya laporan pertanggungjawaban.",
    deskripsi: "Tabel panitia peringatan HUT RI, Hardiknas, pelepasan murid, atau lomba sekolah.",
    generateRows: (employees, kepalaSekolah) => [
      [
        "1",
        `${kepalaSekolah?.nama || "Kepala Sekolah"}\n${kepalaSekolah?.nip ? `NIP. ${kepalaSekolah.nip}` : "NIP. -" }`,
        "Kepala Sekolah",
        "Pelindung & Penasihat",
        "Memberikan arahan dan persetujuan penyelenggaraan kegiatan",
      ],
      [
        "2",
        employees[0] ? `${employees[0].nama}\n${formatNipDisplay(employees[0])}` : "Ketua Panitia",
        employees[0]?.jabatan || "Guru Kelas",
        "Ketua Panitia",
        "Memimpin koordinasi seluruh seksi kegiatan dan bertanggung jawab atas kelancaran acara",
      ],
      [
        "3",
        employees[1] ? `${employees[1].nama}\n${formatNipDisplay(employees[1])}` : "Sekretaris",
        employees[1]?.jabatan || "Guru Kelas",
        "Sekretaris",
        "Membuat proposal, susunan acara, surat undangan, dan notula rapat kepanitiaan",
      ],
      [
        "4",
        employees[2] ? `${employees[2].nama}\n${formatNipDisplay(employees[2])}` : "Bendahara",
        employees[2]?.jabatan || "Guru Kelas",
        "Bendahara",
        "Mengelola anggaran kegiatan dan membuat laporan pertanggungjawaban keuangan",
      ],
      [
        "5",
        employees[3] ? `${employees[3].nama}\n${formatNipDisplay(employees[3])}` : "Seksi Acara",
        employees[3]?.jabatan || "Guru Kelas",
        "Seksi Acara & Perlengkapan",
        "Menyiapkan rundown, tata letak panggung, sound system, dan konsumsi",
      ],
    ],
  },

  // 15. KUSTOM SERBAGUNA
  {
    id: "kustom-matriks",
    categoryKey: "custom",
    nomorLampiran: "Lampiran I",
    judul: "Rincian Matriks Penugasan dan Uraian Tugas",
    jenisLampiran: "custom_table",
    headers: [
      "No",
      "Nama / NIP",
      "Pangkat / Golongan",
      "Jabatan",
      "Tugas yang Diberikan",
      "Keterangan",
    ],
    footerNote: "Keputusan ini berlaku untuk seluruh pihak yang namanya tercantum di atas.",
    deskripsi: "Tabel matriks serbaguna yang kolom dan barisnya dapat diubah sesuka hati.",
    generateRows: (employees) =>
      employees.slice(0, 6).map((e, idx) => [
        String(idx + 1),
        `${e.nama}\n${formatNipDisplay(e)}`,
        formatPangkatGol(e),
        e.jabatan || "Pegawai",
        e.mapel || "Melaksanakan penugasan dinas sesuai instruksi pimpinan",
        e.statusKepegawaian || "Aktif",
      ]),
  },
];

/**
 * Otomatis menghasilkan daftar lampiran detail sesuai dengan jenis SK yang dipilih.
 * Mendukung SEMUA jenis SK dengan presisi tinggi dan data guru nyata.
 */
export function generateDefaultAppendicesForSKType(
  jenisSK: string,
  employees: Employee[],
  kepalaSekolah?: any,
  sekolah?: any
): SKAttachment[] {
  const norm = (jenisSK || "").toLowerCase();

  // 1. SK Pembagian Tugas Guru (KBM) -> Standar Resmi: 4 Lampiran Lengkap
  if (norm.includes("pembagian tugas") || norm.includes("kbm") || norm.includes("mengajar")) {
    const p1 = APPENDIX_PRESETS.find((p) => p.id === "kbm-pembelajaran")!;
    const p2 = APPENDIX_PRESETS.find((p) => p.id === "kbm-wali-kkg")!;
    const p3 = APPENDIX_PRESETS.find((p) => p.id === "kbm-tendik")!;
    const p4 = APPENDIX_PRESETS.find((p) => p.id === "kbm-tugas-tambahan-ptk")!;

    return [
      {
        id: "att-1",
        nomorLampiran: p1.nomorLampiran,
        judul: p1.judul,
        jenisLampiran: p1.jenisLampiran,
        headers: [...p1.headers],
        rows: p1.generateRows(employees, kepalaSekolah),
        footerNote: p1.footerNote,
      },
      {
        id: "att-2",
        nomorLampiran: p2.nomorLampiran,
        judul: p2.judul,
        jenisLampiran: p2.jenisLampiran,
        headers: [...p2.headers],
        rows: p2.generateRows(employees, kepalaSekolah),
        footerNote: p2.footerNote,
      },
      {
        id: "att-3",
        nomorLampiran: p3.nomorLampiran,
        judul: p3.judul,
        jenisLampiran: p3.jenisLampiran,
        headers: [...p3.headers],
        rows: p3.generateRows(employees, kepalaSekolah),
        footerNote: p3.footerNote,
      },
      {
        id: "att-4",
        nomorLampiran: p4.nomorLampiran,
        judul: p4.judul,
        jenisLampiran: p4.jenisLampiran,
        headers: [...p4.headers],
        rows: p4.generateRows(employees, kepalaSekolah),
        footerNote: p4.footerNote,
      },
    ];
  }

  // 2. SK Wali Kelas
  if (norm.includes("wali kelas")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "kbm-wali-kkg")!;
    return [
      {
        id: "att-1",
        nomorLampiran: "Lampiran I",
        judul: "Penetapan Wali Kelas dan Pembimbing Siswa",
        jenisLampiran: "tugas_tambahan_guru",
        headers: ["No", "Nama / NIP", "Pangkat / Golongan", "Jabatan", "Wali Kelas", "Jumlah Siswa", "Keterangan"],
        rows: employees
          .filter((e) => e.kelas && e.kelas !== "-")
          .map((e, idx) => [
            String(idx + 1),
            `${e.nama}\n${formatNipDisplay(e)}`,
            formatPangkatGol(e),
            e.jabatan || "Guru Kelas",
            `Kelas ${e.kelas}`,
            "28 Siswa",
            "Membimbing administrasi kelas & perkembangan karakter peserta didik",
          ]),
        footerNote: "Wali kelas bertanggung jawab atas ketertiban administrasi buku rapor dan presensi kelas.",
      },
    ];
  }

  // 3. SK Tenaga Kependidikan
  if (norm.includes("tenaga kependidikan") || norm.includes("administrasi sekolah") || norm.includes("tu")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "kbm-tendik")!;
    return [
      {
        id: "att-1",
        nomorLampiran: "Lampiran I",
        judul: "Pembagian Tugas Tenaga Kependidikan",
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 4. SK Tim BOS / BOSP
  if (norm.includes("bos") || norm.includes("bosp") || norm.includes("anggaran")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "tim-bosp")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p.nomorLampiran,
        judul: p.judul,
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 5. SK Tim TPPK (Kekerasan)
  if (norm.includes("tppk") || norm.includes("kekerasan") || norm.includes("ppksp")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "tim-tppk")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p.nomorLampiran,
        judul: p.judul,
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 6. SK Tim Kurikulum / TPK / KSP
  if (norm.includes("kurikulum") || norm.includes("tpk") || norm.includes("ksp") || norm.includes("kosp")) {
    const p1 = APPENDIX_PRESETS.find((p) => p.id === "tim-kurikulum")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p1.nomorLampiran,
        judul: p1.judul,
        jenisLampiran: p1.jenisLampiran,
        headers: [...p1.headers],
        rows: p1.generateRows(employees, kepalaSekolah),
        footerNote: p1.footerNote,
      },
      {
        id: "att-2",
        nomorLampiran: "Lampiran II",
        judul: "Jadwal dan Rencana Kerja Tim Pengembang Kurikulum",
        jenisLampiran: "kegiatan",
        headers: ["No", "Tahapan Kegiatan", "Uraian Kerja Tim", "Waktu Pelaksanaan", "Penanggung Jawab", "Output"],
        rows: [
          ["1", "Analisis Karakteristik", "Menganalisis rapor pendidikan, sarpras, dan lingkungan budaya", "Minggu 1", "Ketua Tim & Anggota", "Draf Karakteristik Satuan"],
          ["2", "Reviu Visi, Misi & Tujuan", "Menyelaraskan tujuan sekolah dengan Kurikulum Merdeka", "Minggu 2", "Kepala Sekolah & Tim", "Visi-Misi Final"],
          ["3", "Penyusunan Pengorganisasian Belajar", "Menetapkan struktur kurikulum, alokasi JP intrakurikuler dan P5", "Minggu 3", "Sekretaris & Seluruh Guru", "Struktur Kurikulum"],
          ["4", "Validasi dan Pengesahan", "Reviu oleh Pengawas Pembina dan pengesahan Kepala Dinas", "Minggu 4", "Kepala Sekolah & Pengawas", "Buku KSP Disahkan"],
        ],
        footerNote: "Seluruh tahapan kerja dilaporkan secara berkala.",
      },
    ];
  }

  // 7. SK Panitia Asesmen / Ujian / ANBK
  if (norm.includes("asesmen") || norm.includes("ujian") || norm.includes("anbk") || norm.includes("sas")) {
    const p1 = APPENDIX_PRESETS.find((p) => p.id === "panitia-asesmen")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p1.nomorLampiran,
        judul: p1.judul,
        jenisLampiran: p1.jenisLampiran,
        headers: [...p1.headers],
        rows: p1.generateRows(employees, kepalaSekolah),
        footerNote: p1.footerNote,
      },
      {
        id: "att-2",
        nomorLampiran: "Lampiran II",
        judul: "Daftar Pengawas Ruang Asesmen / Ujian Sekolah",
        jenisLampiran: "susunan_panitia",
        headers: ["No", "Nama Pengawas / NIP", "Pangkat / Golongan", "Mata Uji / Sesi", "Ruang Ujian", "Keterangan"],
        rows: employees.slice(0, 4).map((e, idx) => [
          String(idx + 1),
          `${e.nama}\n${formatNipDisplay(e)}`,
          formatPangkatGol(e),
          "Literasi & Numerasi / Sesi 1 & 2",
          `Ruang ${idx + 1}`,
          "Pengawas Ruang / Silang",
        ]),
        footerNote: "Pengawas wajib hadir 30 menit sebelum asesmen dimulai.",
      },
    ];
  }

  // 8. SK Panitia PPDB
  if (norm.includes("ppdb") || norm.includes("spmb") || norm.includes("murid baru") || norm.includes("siswa baru")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "panitia-ppdb")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p.nomorLampiran,
        judul: p.judul,
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 9. SK Pembina Pramuka & Ekstrakurikuler
  if (norm.includes("pramuka") || norm.includes("ekskul") || norm.includes("ekstrakurikuler") || norm.includes("uks")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "pembina-ekskul")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p.nomorLampiran,
        judul: p.judul,
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 10. SK Penjaminan Mutu (TPMPS) / TPS
  if (norm.includes("tpmps") || norm.includes("mutu") || norm.includes("tps") || norm.includes("pengembang sekolah")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "tim-tpmps")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p.nomorLampiran,
        judul: p.judul,
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 11. SK P5 (Projek Profil Pancasila)
  if (norm.includes("p5") || norm.includes("projek") || norm.includes("profil pelajar")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "tim-p5")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p.nomorLampiran,
        judul: p.judul,
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 12. SK Perpustakaan / Sarpras
  if (norm.includes("perpustakaan") || norm.includes("sarpras") || norm.includes("sarana") || norm.includes("aset")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "sarpras-perpustakaan")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p.nomorLampiran,
        judul: p.judul,
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 13. SK Panitia Kegiatan Resmi
  if (norm.includes("panitia") || norm.includes("kegiatan") || norm.includes("phbn") || norm.includes("hari besar")) {
    const p = APPENDIX_PRESETS.find((p) => p.id === "panitia-kegiatan-umum")!;
    return [
      {
        id: "att-1",
        nomorLampiran: p.nomorLampiran,
        judul: p.judul,
        jenisLampiran: p.jenisLampiran,
        headers: [...p.headers],
        rows: p.generateRows(employees, kepalaSekolah),
        footerNote: p.footerNote,
      },
    ];
  }

  // 14. Fallback: Matriks Penugasan Kustom
  const pCustom = APPENDIX_PRESETS.find((p) => p.id === "kustom-matriks")!;
  return [
    {
      id: "att-1",
      nomorLampiran: "Lampiran I",
      judul: `Rincian Pembagian Tugas ${jenisSK}`,
      jenisLampiran: "custom_table",
      headers: [...pCustom.headers],
      rows: pCustom.generateRows(employees, kepalaSekolah),
      footerNote: pCustom.footerNote,
    },
  ];
}

/**
 * Buat lampiran kosong baru
 */
export function createNewAppendix(
  nomorLampiran = "Lampiran I",
  judul = "Daftar Rincian Penugasan",
  headers = ["No", "Nama / NIP", "Pangkat / Gol", "Jabatan", "Tugas", "Keterangan"]
): SKAttachment {
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    nomorLampiran,
    judul,
    jenisLampiran: "custom_table",
    headers,
    rows: [["1", "Nama Lengkap, S.Pd\nNIP. -", "-", "Guru Kelas", "Pelaksana Tugas", "Aktif"]],
    footerNote: "",
  };
}

/**
 * Tambah baris baru ke lampiran berdasarkan data Guru/PTK
 */
export function addRowFromEmployee(
  att: SKAttachment,
  emp: Employee,
  customTugas?: string
): SKAttachment {
  const newRowNumber = String(att.rows.length + 1);
  const rowData: string[] = [];

  // Sesuaikan nilai cell dengan banyaknya header di tabel
  att.headers.forEach((h, colIdx) => {
    const hNorm = h.toLowerCase();
    if (colIdx === 0 || hNorm === "no" || hNorm === "nomor") {
      rowData.push(newRowNumber);
    } else if (hNorm.includes("nama") || hNorm.includes("nip")) {
      rowData.push(`${emp.nama}\n${formatNipDisplay(emp)}`);
    } else if (hNorm.includes("pangkat") || hNorm.includes("gol")) {
      rowData.push(formatPangkatGol(emp));
    } else if (hNorm.includes("jabatan kedinasan") || (hNorm.includes("jabatan") && !hNorm.includes("tim"))) {
      rowData.push(emp.jabatan || "Guru Kelas");
    } else if (hNorm.includes("mapel") || hNorm.includes("mata pelajaran")) {
      rowData.push(emp.mapel || "Tematik / Semua Mapel");
    } else if (hNorm.includes("kelas")) {
      rowData.push(emp.kelas ? `Kelas ${emp.kelas}` : "-");
    } else if (hNorm.includes("jam")) {
      rowData.push(emp.jumlahJamAjar ? `${emp.jumlahJamAjar} Jam` : "32 Jam");
    } else if (hNorm.includes("tim") || hNorm.includes("kedudukan") || hNorm.includes("peran")) {
      rowData.push(customTugas || "Anggota Tim");
    } else if (hNorm.includes("tugas") || hNorm.includes("uraian")) {
      rowData.push(customTugas || (emp.tugasTambahan && emp.tugasTambahan[0]) || "Melaksanakan penugasan dinas");
    } else if (hNorm.includes("keterangan")) {
      rowData.push(emp.statusKepegawaian || "Aktif");
    } else {
      rowData.push("-");
    }
  });

  return {
    ...att,
    rows: [...att.rows, rowData],
  };
}

/**
 * Tambah kolom baru ke lampiran
 */
export function addColumnToAppendix(
  att: SKAttachment,
  colName: string,
  defaultValue = "-"
): SKAttachment {
  return {
    ...att,
    headers: [...att.headers, colName],
    rows: att.rows.map((row) => [...row, defaultValue]),
  };
}

/**
 * Hapus kolom dari lampiran
 */
export function removeColumnFromAppendix(
  att: SKAttachment,
  colIndex: number
): SKAttachment {
  if (att.headers.length <= 2) return att; // Pertahankan minimal 2 kolom
  return {
    ...att,
    headers: att.headers.filter((_, i) => i !== colIndex),
    rows: att.rows.map((row) => row.filter((_, i) => i !== colIndex)),
  };
}
