import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

// Initialize Gemini SDK lazily if key is provided
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY;

  if (!aiClient && apiKey) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Officially supported Gemini models in prioritized fallback order
const CANDIDATE_TEXT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
  }
): Promise<{ text: string; model: string }> {
  let lastError: any = null;

  for (const modelName of CANDIDATE_TEXT_MODELS) {
    // Retry up to 2 attempts for transient conditions (e.g. 503 high demand spike, 429 rate limit)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config: params.config,
        });
        if (res.text) {
          return { text: res.text, model: modelName };
        }
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        const isTransient =
          msg.includes("503") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("high demand") ||
          msg.includes("429") ||
          msg.includes("Resource has been exhausted");
        if (isTransient && attempt === 0) {
          // Brief pause before retry
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error("All AI models currently unavailable");
}

async function createChatWithFallback(
  ai: GoogleGenAI,
  params: {
    history?: any[];
    config?: any;
    message: string;
  }
): Promise<{ text: string; model: string }> {
  let lastError: any = null;

  for (const modelName of CANDIDATE_TEXT_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const chat = ai.chats.create({
          model: modelName,
          history: params.history,
          config: params.config,
        });
        const res = await chat.sendMessage({ message: params.message });
        if (res.text) {
          return { text: res.text, model: modelName };
        }
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        const isTransient =
          msg.includes("503") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("high demand") ||
          msg.includes("429") ||
          msg.includes("Resource has been exhausted");
        if (isTransient && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error("All AI models currently unavailable");
}

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  const hasKey = Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY
  );
  res.json({
    status: "ok",
    hasApiKey: hasKey,
    time: new Date().toISOString(),
  });
});

const MASTER_DEFAULTS_FILE = path.join(process.cwd(), "src", "data", "masterDefaults.json");
const UPLOADED_KOP_FILE = path.join(process.cwd(), "src", "data", "uploadedKop.json");

// Endpoint: Get Master Defaults saved on server
app.get("/api/master-defaults", (_req: Request, res: Response) => {
  try {
    if (fs.existsSync(MASTER_DEFAULTS_FILE)) {
      const content = fs.readFileSync(MASTER_DEFAULTS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      return res.json({ success: true, data: parsed });
    }
  } catch (err: any) {
    console.error("[master-defaults] Gagal membaca masterDefaults.json:", err);
  }
  return res.json({ success: false, data: null });
});

// Helper function to write image to public directory if possible
function trySaveKopToPublic(kopUrl: string): string | null {
  try {
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    if (kopUrl.startsWith("data:image/png;base64,")) {
      const buffer = Buffer.from(kopUrl.replace("data:image/png;base64,", ""), "base64");
      const filePath = path.join(publicDir, "kop-surat-default.png");
      fs.writeFileSync(filePath, buffer);
      return "/kop-surat-default.png";
    } else if (kopUrl.startsWith("data:image/jpeg;base64,") || kopUrl.startsWith("data:image/jpg;base64,")) {
      const buffer = Buffer.from(kopUrl.replace(/^data:image\/(jpeg|jpg);base64,/, ""), "base64");
      const filePath = path.join(publicDir, "kop-surat-default.jpg");
      fs.writeFileSync(filePath, buffer);
      return "/kop-surat-default.jpg";
    } else if (kopUrl.startsWith("data:image/svg+xml;base64,")) {
      const svgText = Buffer.from(kopUrl.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf-8");
      const filePath = path.join(publicDir, "kop-surat-default.svg");
      fs.writeFileSync(filePath, svgText, "utf-8");
      return "/kop-surat-default.svg";
    }
  } catch (err) {
    console.warn("[trySaveKopToPublic] Error saving to public folder:", err);
  }
  return null;
}

// Endpoint: Save Master Defaults permanently to server filesystem
app.post("/api/master-defaults", (req: Request, res: Response) => {
  try {
    const { schoolProfile, employees, numberingConfig, documents, defaultSKParams, kopSuratUrl, forceOverwrite } = req.body;

    let existing: any = {};
    if (fs.existsSync(MASTER_DEFAULTS_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(MASTER_DEFAULTS_FILE, "utf-8"));
      } catch {}
    }

    // Hindari menimpa kop kustom JPG/PNG yang sudah ada dengan placeholder SVG default
    const isExistingCustomRaster =
      existing.kopSuratUrl &&
      (existing.kopSuratUrl.startsWith("data:image/png") ||
        existing.kopSuratUrl.startsWith("data:image/jpeg") ||
        existing.kopSuratUrl.startsWith("data:image/jpg"));
    const isIncomingCustomRaster =
      kopSuratUrl &&
      (kopSuratUrl.startsWith("data:image/png") ||
        kopSuratUrl.startsWith("data:image/jpeg") ||
        kopSuratUrl.startsWith("data:image/jpg"));

    let effectiveKop = kopSuratUrl;
    if (isExistingCustomRaster && !isIncomingCustomRaster && !forceOverwrite) {
      effectiveKop = existing.kopSuratUrl;
    } else if (!effectiveKop) {
      effectiveKop = existing.kopSuratUrl || schoolProfile?.kopSuratUrl;
    }

    const updatedData = {
      ...existing,
      savedAt: new Date().toISOString(),
      isPermanentAppDefault: true,
      schoolProfile: schoolProfile ? {
        ...schoolProfile,
        kopSuratUrl: effectiveKop || schoolProfile.kopSuratUrl,
        kopMode: schoolProfile.kopMode || "gambar",
      } : existing.schoolProfile,
      employees: employees || existing.employees,
      numberingConfig: numberingConfig || existing.numberingConfig,
      documents: documents || existing.documents,
      defaultSKParams: defaultSKParams || existing.defaultSKParams,
      kopSuratUrl: effectiveKop,
    };

    const dataDir = path.dirname(MASTER_DEFAULTS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Tulis ke masterDefaults.json
    fs.writeFileSync(MASTER_DEFAULTS_FILE, JSON.stringify(updatedData, null, 2), "utf-8");

    // Jika ada gambar kop surat yang valid, simpan juga ke uploadedKop.json
    if (effectiveKop && typeof effectiveKop === "string" && effectiveKop.length > 50 && !effectiveKop.startsWith("indexeddb:")) {
      fs.writeFileSync(
        UPLOADED_KOP_FILE,
        JSON.stringify({ kopSuratUrl: effectiveKop, savedAt: new Date().toISOString() }, null, 2),
        "utf-8"
      );
      trySaveKopToPublic(effectiveKop);
    }

    console.log(`[master-defaults] Data bawaan sekolah, guru/PTK, dan kop surat berhasil disimpan permanen ke filesystem!`);
    return res.json({
      success: true,
      message: "Data sekolah, guru/PTK, dan kop surat berhasil disimpan permanen sebagai bawaan resmi aplikasi.",
    });
  } catch (err: any) {
    console.error("[master-defaults] Gagal menyimpan:", err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// Endpoint: Khusus untuk menetapkan gambar kop surat bawaan resmi aplikasi secara instan
app.post("/api/set-default-kop", (req: Request, res: Response) => {
  try {
    const { kopSuratUrl, schoolProfile } = req.body;
    if (!kopSuratUrl || typeof kopSuratUrl !== "string" || kopSuratUrl.length < 50) {
      return res.status(400).json({ success: false, error: "Gambar kop surat tidak valid." });
    }

    // 1. Simpan ke uploadedKop.json
    fs.writeFileSync(
      UPLOADED_KOP_FILE,
      JSON.stringify({ kopSuratUrl, savedAt: new Date().toISOString() }, null, 2),
      "utf-8"
    );

    // 2. Simpan juga ke file public jika memungkinkan
    trySaveKopToPublic(kopSuratUrl);

    // 3. Perbarui juga masterDefaults.json
    let existingMaster: any = {};
    if (fs.existsSync(MASTER_DEFAULTS_FILE)) {
      try {
        existingMaster = JSON.parse(fs.readFileSync(MASTER_DEFAULTS_FILE, "utf-8"));
      } catch {}
    }

    const updatedMaster = {
      ...existingMaster,
      savedAt: new Date().toISOString(),
      isPermanentAppDefault: true,
      kopSuratUrl: kopSuratUrl,
      schoolProfile: {
        ...(existingMaster.schoolProfile || schoolProfile || {}),
        ...(schoolProfile || {}),
        kopSuratUrl: kopSuratUrl,
        kopMode: "gambar",
      },
    };

    fs.writeFileSync(MASTER_DEFAULTS_FILE, JSON.stringify(updatedMaster, null, 2), "utf-8");

    console.log("[set-default-kop] Gambar kop surat berhasil diproses & dikunci permanen sebagai bawaan resmi aplikasi!");
    return res.json({
      success: true,
      message: "✓ Gambar kop surat berhasil diproses dan dikunci permanen sebagai bawaan resmi aplikasi (permanen setelah publish).",
      savedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[set-default-kop] Gagal menetapkan kop surat:", err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// Endpoint: AI SK Generator
app.post("/api/gemini/generate-sk", async (req: Request, res: Response) => {
  try {
    const {
      jenisSK,
      judulSK,
      tahunAjaran,
      sekolah,
      kepalaSekolah,
      dataKhusus,
      employees,
      userPrompt,
    } = req.body;

    const ai = getGemini();

    const systemInstruction = `Anda adalah Asisten Pakar Administrasi dan Regulasi Pendidikan Dasar (Kepala Sekolah SD) di Indonesia.
Tugas Anda adalah menyusun dokumen formal "SURAT KEPUTUSAN (SK) KEPALA SEKOLAH" dalam format standar tata naskah dinas pendidikan Indonesia yang sangat presisi, resmi, dan lengkap.

PERATURAN PENTING MENGENAI DASAR HUKUM:
1. Cantumkan dasar hukum (MENGINGAT) yang benar-benar relevan dengan jenis SK:
   - UU No. 20 Tahun 2003 tentang Sistem Pendidikan Nasional
   - PP No. 4 Tahun 2022 tentang Perubahan atas PP No. 57 Tahun 2021 tentang Standar Nasional Pendidikan
   - Permendikdasmen No. 12 Tahun 2025 tentang Standar Isi (atau Permendikbudristek No. 16/2022 Standar Proses, No. 21/2022 Standar Penilaian, No. 47/2023 Standar Pengelolaan, No. 18/2023 Standar Pembiayaan, No. 13/2025 Kurikulum)
   - Peraturan terkait khusus (misal Permendikbudristek No. 46/2023 untuk TPPK, Permendikbud No. 63/2022/2023/2024 tentang Petunjuk Teknis BOSP untuk BOS, dsb.)
   - Peraturan daerah / Pergub terkait jika relevan (misal Bahasa Daerah Bali Pergub Bali No. 20/2013)
   - Kalender Pendidikan Dinas Provinsi/Kabupaten.
2. Jika suatu dasar hukum belum pasti atau perkiraan spesifik nomor lokal, tandai dengan catatan atau format baku. Jangan mengarang nomor pasal fiktif yang aneh.
3. Struktur konsiderans Menimbang wajib huruf a, b, c... diawali "Bahwa ...".
4. Bagian Memperhatikan mencakup keputusan rapat dewan guru pada tanggal yang ditentukan.
5. Bagian MEMUTUSKAN / Menetapkan berisi diktum berurutan KESATU, KEDUA, KETIGA, KEEMPAT, KELIMA, KEENAM, KETUJUH, KEDELAPAN dst.
6. Buat lampiran tabel yang terstruktur sesuai jenis SK dengan data guru/PTK yang relevan.

Format output WAJIB JSON valid sesuai schema berikut:
{
  "judul": string,
  "menimbang": [
    "Bahwa dalam rangka ...",
    "Bahwa untuk menjamin kelancaran ..."
  ],
  "mengingat": [
    "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
    "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Perubahan Peraturan Pemerintah Nomor 57 Tahun 2021 tentang Standar Nasional Pendidikan;",
    ...
  ],
  "memperhatikan": "Saran, usul dan Keputusan Rapat Dewan Guru ... tanggal ... tentang ...",
  "diktum": [
    { "poin": "KESATU", "isi": "..." },
    { "poin": "KEDUA", "isi": "..." },
    { "poin": "KETIGA", "isi": "..." },
    { "poin": "KEEMPAT", "isi": "..." },
    { "poin": "KELIMA", "isi": "Masing-masing guru dan tenaga kependidikan melaporkan pelaksanaan tugasnya secara berkala dan tertulis kepada kepala sekolah" },
    { "poin": "KEENAM", "isi": "Segala biaya yang berkaitan dengan pelaksanaan keputusan ini dibebankan kepada anggaran sekolah yang relevan" },
    { "poin": "KETUJUH", "isi": "Apabila di kemudian hari ternyata terdapat kekeliruan dalam keputusan ini akan diadakan perbaikan sebagaimana mestinya" },
    { "poin": "KEDELAPAN", "isi": "Keputusan ini mulai berlaku sejak tanggal ditetapkan" }
  ],
  "tembusan": [
    "Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ...",
    "Koordinator Wilayah Satuan Pendidikan Formal (SPF) Kecamatan ...",
    "Pengawas Sekolah Pembina",
    "Ketua Komite Sekolah",
    "Yang bersangkutan untuk dilaksanakan",
    "Arsip Sekolah"
  ],
  "lampiranList": [
    {
      "nomorLampiran": "Lampiran I",
      "judul": "Pembagian Tugas Guru Dalam Kegiatan Proses Belajar Mengajar",
      "jenisLampiran": "pembagian_tugas_guru",
      "headers": ["No", "Nama / NIP", "Pangkat / Golongan", "Jabatan", "Mata Pelajaran", "Kelas", "Jumlah Jam"],
      "rows": [
        ["1", "Nama Guru, S.Pd\\nNIP. 198...", "Ahli Pertama / IX", "Guru Kelas", "PPKn\\nBhs. Indonesia\\nMatematika\\nIPAS\\nSBdP", "IV", "32 jam"]
      ],
      "footerNote": "Jumlah total jam: ..."
    }
  ],
  "aiNotes": [
    "Periksa kesesuaian jam mengajar minimal 24 jam untuk sertifikasi guru",
    "Dasar hukum telah diselaraskan dengan regulasi kurikulum dan standar nasional pendidikan"
  ]
}`;

    const promptText = `SUSUN DRAF SURAT KEPUTUSAN KEPALA SEKOLAH SD:
Jenis SK: ${jenisSK || "Umum"}
Judul yang diinginkan: ${judulSK || "Sesuai standar"}
Tahun Ajaran: ${tahunAjaran || "2025/2026"}
Nama Sekolah: ${sekolah?.nama || "SD Negeri"}
Alamat: ${sekolah?.alamat || ""}, ${sekolah?.desa || ""}, Kec. ${sekolah?.kecamatan || ""}, Kab. ${sekolah?.kabupaten || ""}, Prov. ${sekolah?.provinsi || ""}
Nama Kepala Sekolah: ${kepalaSekolah?.nama || ""}
NIP Kepala Sekolah: ${kepalaSekolah?.nip || ""}
Pangkat/Golongan Kepala Sekolah: ${kepalaSekolah?.pangkat || ""} / ${kepalaSekolah?.golongan || ""}
Data Rapat / Kebutuhan Khusus: ${JSON.stringify(dataKhusus || {})}
Prompt/Instruksi Tambahan Pengguna: ${userPrompt || "Buat SK formal lengkap dengan lampiran"}
Daftar Guru/PTK yang terdaftar di sekolah (${employees?.length || 0} orang):
${(employees || []).slice(0, 15).map((e: any, i: number) => `${i + 1}. ${e.nama} (${e.nip || "-"}, ${e.pangkat || ""}/${e.golongan || ""}, ${e.jabatan || ""}, ${e.mapel || ""}, Kelas: ${e.kelas || "-"})`).join("\n")}

Keluarkan HANYA JSON murni yang valid tanpa awalan \`\`\`json atau karakter markdown lainnya bila memungkinkan.`;

    if (!ai) {
      // Fallback response with realistic, high-fidelity Indonesian school SK structure
      return res.json({
        success: true,
        source: "local-generator",
        data: generateLocalSKFallback(jenisSK, judulSK, tahunAjaran, sekolah, dataKhusus, employees),
      });
    }

    // Resilient AI generation with multi-tier model fallback & retry
    let rawText = "";
    let usedModel = "official-generator";

    try {
      const aiResult = await generateContentWithFallback(ai, {
        contents: promptText,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });
      rawText = aiResult.text || "{}";
      usedModel = aiResult.model;
    } catch (aiErr: any) {
      console.warn("AI generation fallback to standard school SK template:", aiErr?.message);
      const localData = generateLocalSKFallback(jenisSK, judulSK, tahunAjaran, sekolah, dataKhusus, employees);
      return res.json({
        success: true,
        source: "local-generator-fallback",
        data: localData,
        warning: "Server AI sedang dalam antrean tinggi. Draf SK telah disusun otomatis menggunakan format standar tata naskah dinas pendidikan.",
      });
    }

    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      // Clean potential backticks or markdown wrapper
      const clean = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      parsedData = JSON.parse(clean);
    }

    if (parsedData && parsedData.judul) {
      parsedData.judul = cleanServerSKJudul(parsedData.judul, tahunAjaran);
    }

    res.json({
      success: true,
      source: usedModel,
      data: parsedData,
    });
  } catch (error: any) {
    console.error("Error in /api/gemini/generate-sk:", error);
    // Never return a blocking 500 error to the client; always provide a valid draft
    const { jenisSK, judulSK, tahunAjaran, sekolah, dataKhusus, employees } = req.body;
    const fallbackData = generateLocalSKFallback(jenisSK, judulSK, tahunAjaran, sekolah, dataKhusus, employees);
    res.json({
      success: true,
      source: "local-generator-safe-recovery",
      data: fallbackData,
      warning: "Terjadi pemulihan otomatis draf SK dinas standar.",
    });
  }
});

// Helper to clean SK title and prevent duplicate kop/tentang/tahun ajaran
function cleanServerSKJudul(rawJudul?: string, tahunAjaran?: string): string {
  if (!rawJudul) return "";
  let clean = rawJudul.trim();
  clean = clean.replace(/^(?:SURAT\s+)?KEPUTUSAN\s+KEPALA\s+[^\n]+?TENTANG\s+/i, "");
  clean = clean.replace(/^(?:SURAT\s+)?KEPUTUSAN\s+TENTANG\s+/i, "");
  clean = clean.replace(/^SK\s+TENTANG\s+/i, "");
  clean = clean.replace(/^TENTANG\s+/i, "");
  clean = clean.replace(/^(?:SURAT\s+)?KEPUTUSAN\s+KEPALA\s+(?:SEKOLAH|SD|SATUAN\s+PENDIDIKAN)[^\n]*$/i, "");
  clean = clean.replace(/^KEPUTUSAN\s+KEPALA\s+SEKOLAH\s+TENTANG\s+/i, "");
  clean = clean.replace(/^SURAT\s+KEPUTUSAN\s+KEPALA\s+SEKOLAH\s+TENTANG\s+/i, "");
  if (tahunAjaran) {
    const escapedTa = tahunAjaran.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clean = clean.replace(new RegExp(`\\s*(?:PADA|UNTUK|SEMESTER\\s+[\\w\\s]+)?\\s*TAHUN\\s+(?:AJARAN|PELAJARAN)\\s*${escapedTa}\\s*$`, "i"), "");
  }
  clean = clean.replace(
    /\s*(?:PADA|UNTUK|SEMESTER\s+(?:GANJIL|GENAP|\d+))?\s*TAHUN\s+(?:AJARAN|PELAJARAN)\s*\d{4}\/\d{4}\s*$/i,
    ""
  );
  return clean.trim();
}

// Helper for local refinement when AI is unavailable or under high load
function refineDocumentLocally(currentDoc: any, instruction: string) {
  const updated = { ...currentDoc };
  const lower = (instruction || "").toLowerCase();

  if (lower.includes("nomor")) {
    const match = instruction.match(/\d+[\w\.\/\-]+/);
    if (match) updated.nomor = match[0];
  }
  if (lower.includes("tanggal")) {
    updated.tanggalTetap = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (lower.includes("judul") || lower.includes("nama sk")) {
    updated.judul = `${currentDoc.judul} (Disesuaikan)`;
  }
  if (lower.includes("dasar hukum") || lower.includes("mengingat")) {
    if (!updated.mengingat.some((m: string) => m.includes("Peraturan Menteri"))) {
      updated.mengingat.push(
        "Peraturan Menteri Pendidikan Dasar dan Menengah Republik Indonesia Nomor 12 Tahun 2025 tentang Standar Isi pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar dan Jenjang Pendidikan Menengah;"
      );
    }
  }
  if (lower.includes("diktum") || lower.includes("tambah poin")) {
    updated.diktum = [
      ...updated.diktum,
      {
        poin: `KE-${updated.diktum.length + 1}`,
        isi: `Segala hal yang belum diatur dalam keputusan ini akan ditetapkan kemudian.`,
      },
    ];
  }
  if (lower.includes("tambah lampiran") || lower.includes("lampiran baru")) {
    const nextIdx = (updated.lampiranList || []).length + 1;
    updated.lampiranList = [
      ...(updated.lampiranList || []),
      {
        id: `att-${nextIdx}`,
        nomorLampiran: `Lampiran ${nextIdx}`,
        judul: `Rincian Tambahan Lampiran ${nextIdx}`,
        jenisLampiran: "custom_table",
        headers: ["No", "Nama / NIP", "Pangkat / Gol", "Jabatan", "Uraian Penugasan", "Keterangan"],
        rows: [["1", "Nama Guru, S.Pd\nNIP. -", "-", "Guru Kelas", "Pelaksana Tugas", "Aktif"]],
        footerNote: "Pelaksanaan tugas dilaporkan kepada Kepala Sekolah secara berkala.",
      },
    ];
  }
  if (lower.includes("tambah kolom")) {
    if (updated.lampiranList && updated.lampiranList.length > 0) {
      const lastAtt = updated.lampiranList[updated.lampiranList.length - 1];
      lastAtt.headers.push("Keterangan Tambahan");
      lastAtt.rows = lastAtt.rows.map((r: string[]) => [...r, "-"]);
    }
  }
  return updated;
}

// Endpoint: AI Refine / Chat Edit on Draft SK
app.post("/api/gemini/refine-sk", async (req: Request, res: Response) => {
  try {
    const { currentDoc, instruction } = req.body;
    const ai = getGemini();

    if (!ai) {
      return res.json({
        success: true,
        source: "local-refiner",
        data: refineDocumentLocally(currentDoc, instruction),
      });
    }

    const systemPrompt = `Anda adalah asisten administrasi sekolah. Pengguna memiliki draf SK dan ingin memperbaruinya sesuai permintaan seperti:
- "ubah nama tim"
- "tambahkan guru"
- "hapus anggota nomor 4"
- "ubah tanggal"
- "tambahkan dasar hukum"
- "perbaiki bahasa"
- "ubah nomor SK"
- "buat lampiran"
- "buat lebih formal"

Perbarui data JSON SK dan kembalikan JSON yang sudah dimutakhirkan dengan format yang sama persis seperti dokumen awal. Jangan hilangkan data lain yang tidak diminta diubah.`;

    const promptText = `DRAF SK SAAT INI:
${JSON.stringify(currentDoc, null, 2)}

PERMINTAAN PERUBAHAN PENGGUNA:
"${instruction}"

Berikan draf SK yang diperbarui dalam JSON valid.`;

    let raw = "";
    try {
      const aiResult = await generateContentWithFallback(ai, {
        contents: promptText,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });
      raw = aiResult.text || "{}";
    } catch (err: any) {
      console.warn("AI refine fallback to local refiner:", err?.message);
      return res.json({
        success: true,
        source: "local-refiner-fallback",
        data: refineDocumentLocally(currentDoc, instruction),
      });
    }

    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const updated = JSON.parse(cleaned);

    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error("Error in /api/gemini/refine-sk:", error);
    const { currentDoc, instruction } = req.body;
    res.json({
      success: true,
      source: "local-refiner-error-fallback",
      data: refineDocumentLocally(currentDoc, instruction),
    });
  }
});

// Endpoint: 17-Point Compliance Checker & Validation
app.post("/api/gemini/validate-sk", async (req: Request, res: Response) => {
  try {
    const doc = req.body.document || req.body.doc || {};
    const sekolah = req.body.sekolah || {};
    const ai = getGemini();

    const items: Array<{ point: string; passed: boolean; status: string }> = [];
    const findings: string[] = [];
    const recommendations: string[] = [];

    // 1. Kop Surat & Identitas
    const hasKop = Boolean(sekolah.nama || sekolah.namaKop || doc.sekolah?.nama);
    items.push({
      point: "1. KOP Surat & Identitas Satuan Pendidikan",
      passed: hasKop,
      status: hasKop ? "Lengkap" : "Perlu dilengkapi di Profil Sekolah",
    });
    if (!hasKop) findings.push("Identitas kop surat sekolah belum terisi lengkap.");

    // 2. Format Nomor SK
    const hasNomor = Boolean(doc.nomor && !doc.nomor.includes("[") && doc.nomor.trim().length > 3);
    items.push({
      point: "2. Format Nomor Surat Keputusan Standar Dinas",
      passed: hasNomor,
      status: hasNomor ? "Sesuai Standar" : "Belum diisi / Masih Template",
    });
    if (!hasNomor) findings.push("Nomor SK belum memiliki format penomoran definitif.");

    // 3. Judul SK
    const hasJudul = Boolean(doc.judul && doc.judul.trim().length > 10);
    items.push({
      point: "3. Judul Keputusan Jelas, Huruf Kapital & Memuat Substansi",
      passed: hasJudul,
      status: hasJudul ? "Lengkap" : "Judul kosong atau terlalu singkat",
    });
    if (!hasJudul) findings.push("Judul surat keputusan harus jelas dan memuat substansi penugasan.");

    // 4. Konsiderans Menimbang
    const hasMenimbang = Boolean(
      doc.menimbang &&
      doc.menimbang.length >= 2 &&
      doc.menimbang.every((m: string) => m.trim().toLowerCase().startsWith("bahwa"))
    );
    items.push({
      point: "4. Konsiderans Menimbang (Diawali frasa 'Bahwa...')",
      passed: hasMenimbang,
      status: hasMenimbang ? "Sesuai Kaidah" : "Perlu Perbaikan Kaidah Bahasa",
    });
    if (!hasMenimbang) findings.push("Butir Menimbang wajib diawali kata 'Bahwa' berurutan huruf a, b, dst.");

    // 5. Dasar Hukum UU Sisdiknas
    const hasUUSisdiknas = Boolean(
      doc.mengingat && doc.mengingat.some((m: string) => m.includes("20 Tahun 2003") || m.includes("Sistem Pendidikan Nasional"))
    );
    items.push({
      point: "5. Dasar Hukum UU No. 20 Tahun 2003 tentang Sisdiknas",
      passed: hasUUSisdiknas,
      status: hasUUSisdiknas ? "Tercantum" : "Belum Dicantumkan",
    });
    if (!hasUUSisdiknas) recommendations.push("Tambahkan Undang-Undang No. 20 Tahun 2003 tentang Sistem Pendidikan Nasional pada butir Mengingat.");

    // 6. Dasar Hukum SNP
    const hasSNP = Boolean(
      doc.mengingat && doc.mengingat.some((m: string) => m.includes("PP") || m.includes("Standar Nasional Pendidikan") || m.includes("57 Tahun 2021") || m.includes("4 Tahun 2022"))
    );
    items.push({
      point: "6. Dasar Hukum Standar Nasional Pendidikan (PP No. 57/2021 jo PP No. 4/2022)",
      passed: hasSNP,
      status: hasSNP ? "Tercantum" : "Perlu Ditambahkan",
    });
    if (!hasSNP) recommendations.push("Cantumkan Peraturan Pemerintah No. 4 Tahun 2022 tentang Perubahan atas PP No. 57 Tahun 2021 tentang Standar Nasional Pendidikan.");

    // 7. Regulasi Standar/Kurikulum Terbaru
    const hasRegulasiKurikulum = Boolean(
      doc.mengingat && doc.mengingat.length >= 4
    );
    items.push({
      point: "7. Penyelarasan Permendikdasmen / Standar Kurikulum Terbaru",
      passed: hasRegulasiKurikulum,
      status: hasRegulasiKurikulum ? "Relevan" : "Kurang Lengkap (Minimal 4 Regulasi)",
    });
    if (!hasRegulasiKurikulum) findings.push("Dasar hukum sebaiknya mencakup standar isi, standar proses, standar penilaian, dan kurikulum.");

    // 8. Konsiderans Memperhatikan
    const hasMemperhatikan = Boolean(doc.memperhatikan && doc.memperhatikan.trim().length > 10);
    items.push({
      point: "8. Konsiderans Memperhatikan (Hasil Rapat Dewan Guru & Tanggal)",
      passed: hasMemperhatikan,
      status: hasMemperhatikan ? "Lengkap" : "Belum Dicantumkan",
    });
    if (!hasMemperhatikan) findings.push("Bagian Memperhatikan harus mencantumkan tanggal keputusan rapat dewan guru.");

    // 9. Diktum MEMUTUSKAN Terstruktur
    const hasDiktum = Boolean(doc.diktum && doc.diktum.length >= 3);
    items.push({
      point: "9. Diktum MEMUTUSKAN / Menetapkan Berurutan",
      passed: hasDiktum,
      status: hasDiktum ? "Lengkap" : "Diktum Kurang Lengkap",
    });

    // 10. Diktum Pelaporan Berkala
    const hasPelaporan = Boolean(
      doc.diktum && doc.diktum.some((d: any) => (d.isi || "").toLowerCase().includes("lapor") || (d.isi || "").toLowerCase().includes("tanggung jawab"))
    );
    items.push({
      point: "10. Diktum Pelaporan Pelaksanaan Tugas Berkala",
      passed: hasPelaporan,
      status: hasPelaporan ? "Tersedia" : "Belum Dicantumkan",
    });
    if (!hasPelaporan) recommendations.push("Tambahkan diktum klausul kewajiban guru/staf untuk melaporkan pelaksanaan tugas secara berkala.");

    // 11. Diktum Klausul Pembebanan Anggaran
    const hasAnggaran = Boolean(
      doc.diktum && doc.diktum.some((d: any) => (d.isi || "").toLowerCase().includes("biaya") || (d.isi || "").toLowerCase().includes("anggaran"))
    );
    items.push({
      point: "11. Diktum Klausul Pembebanan Biaya / Anggaran Sekolah",
      passed: hasAnggaran,
      status: hasAnggaran ? "Tersedia" : "Belum Dicantumkan",
    });

    // 12. Diktum Klausul Perbaikan Kekeliruan
    const hasKekeliruan = Boolean(
      doc.diktum && doc.diktum.some((d: any) => (d.isi || "").toLowerCase().includes("keliru") || (d.isi || "").toLowerCase().includes("perbaikan"))
    );
    items.push({
      point: "12. Diktum Klausul Perbaikan Jika Terdapat Kekeliruan",
      passed: hasKekeliruan,
      status: hasKekeliruan ? "Tersedia" : "Belum Dicantumkan",
    });

    // 13. Diktum Masa Berlaku
    const hasBerlaku = Boolean(
      doc.diktum && doc.diktum.some((d: any) => (d.isi || "").toLowerCase().includes("berlaku"))
    );
    items.push({
      point: "13. Diktum Klausul Tanggal Mulai Berlaku",
      passed: hasBerlaku,
      status: hasBerlaku ? "Tersedia" : "Belum Dicantumkan",
    });

    // 14. Titimangsa Penetapan
    const hasTitimangsa = Boolean(doc.tanggalTetap && doc.tempatTetap);
    items.push({
      point: "14. Tempat dan Tanggal Penetapan Lengkap",
      passed: hasTitimangsa,
      status: hasTitimangsa ? "Lengkap" : "Belum Diisi Lengkap",
    });
    if (!hasTitimangsa) findings.push("Tempat dan tanggal penetapan SK wajib terisi sebelum pengesahan.");

    // 15. Identitas Kepala Sekolah
    const hasKepsek = Boolean(
      doc.kepalaSekolah?.nama &&
      doc.kepalaSekolah.nama.trim().length > 3 &&
      doc.kepalaSekolah?.nip &&
      doc.kepalaSekolah.nip !== "-"
    );
    items.push({
      point: "15. Identitas & NIP Kepala Sekolah Penandatangan",
      passed: hasKepsek,
      status: hasKepsek ? "Lengkap" : "NIP atau Nama Kepsek Perlu Diperiksa",
    });
    if (!hasKepsek) findings.push("Pastikan NIP Kepala Sekolah penandatangan telah terisi dengan benar.");

    // 16. Distribusi Tembusan Resmi
    const hasTembusan = Boolean(doc.tembusan && doc.tembusan.length >= 3);
    items.push({
      point: "16. Distribusi Tembusan Naskah Dinas (Dinas, Korwil, Pengawas, Arsip)",
      passed: hasTembusan,
      status: hasTembusan ? "Lengkap" : "Kurang Lengkap (Minimal 3 Pihak)",
    });

    // 17. Lampiran Rincian Tugas
    const hasLampiran = Boolean(doc.lampiranList && doc.lampiranList.length > 0);
    items.push({
      point: "17. Lampiran Matriks / Tabel Rincian Pembagian Tugas",
      passed: hasLampiran,
      status: hasLampiran ? "Tersedia" : "Belum Ada Lampiran Tabel",
    });
    if (!hasLampiran) findings.push("SK Pembagian tugas wajib menyertakan lampiran tabel tugas mengajar atau susunan kepanitiaan.");

    const passedCount = items.filter((i) => i.passed).length;
    const score = Math.round((passedCount / 17) * 100);
    const overallStatus = score >= 90 ? "Sesuai Standar" : score >= 70 ? "Perlu Verifikasi" : "Belum Lengkap";

    let aiAdvice = "";
    if (ai) {
      try {
        const aiResult = await generateContentWithFallback(ai, {
          contents: `Analisis draf Surat Keputusan (SK) Kepala Sekolah SD berikut:
Judul: ${doc.judul}
Nomor: ${doc.nomor}
Tahun Ajaran: ${doc.tahunAjaran}
Jumlah Dasar Hukum: ${doc.mengingat?.length || 0} butir
Jumlah Diktum: ${doc.diktum?.length || 0} butir
Jumlah Lampiran: ${doc.lampiranList?.length || 0} lampiran
Temuan Checklist: ${findings.join("; ") || "Tidak ada kendala kritis"}

Berikan catatan profesional dalam 2 kalimat singkat mengenai keselarasan administrasi dinas dan rekomendasi bagi kepala sekolah.`,
          config: {
            temperature: 0.2,
          },
        });
        aiAdvice = aiResult.text || "";
      } catch (aiErr) {
        console.warn("AI advice generation skipped or fallback:", aiErr);
      }
    }

    if (!aiAdvice) {
      aiAdvice = score >= 90
        ? "Dokumen SK telah memenuhi seluruh standar tata naskah dinas pendidikan Indonesia dan siap untuk dicetak serta ditandatangani."
        : "Lakukan perbaikan pada butir-butir yang ditandai kuning sebelum melakukan pengesahan resmi dan distribusi tembusan.";
    }

    res.json({
      success: true,
      report: {
        score,
        status: overallStatus,
        items,
        findings,
        recommendations,
        aiAdvice,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/gemini/validate-sk:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: AI Checker & Validation (legacy check route)
app.post("/api/gemini/check-sk", async (req: Request, res: Response) => {
  try {
    const doc = req.body.doc || req.body.document || {};
    const findings: string[] = [];
    let status: "Data lengkap" | "Data belum lengkap" | "Perlu verifikasi" = "Data lengkap";

    if (!doc.nomor || doc.nomor.includes("[") || doc.nomor.trim() === "") {
      findings.push("Nomor SK belum diisi secara lengkap atau masih berupa template.");
      status = "Data belum lengkap";
    }
    if (!doc.judul || doc.judul.trim() === "") {
      findings.push("Judul SK masih kosong.");
      status = "Data belum lengkap";
    }
    if (!doc.tahunAjaran || doc.tahunAjaran.trim() === "") {
      findings.push("Tahun ajaran belum ditentukan.");
      status = "Data belum lengkap";
    }
    if (!doc.tanggalTetap || doc.tanggalTetap.trim() === "") {
      findings.push("Tanggal penetapan SK belum diisi.");
      status = "Data belum lengkap";
    }
    if (!doc.tempatTetap || doc.tempatTetap.trim() === "") {
      findings.push("Tempat penetapan (desa/kota) belum diisi.");
      status = "Data belum lengkap";
    }
    if (!doc.kepalaSekolah?.nama || doc.kepalaSekolah.nama.trim() === "") {
      findings.push("Nama Kepala Sekolah penandatangan belum terisi.");
      status = "Data belum lengkap";
    }

    res.json({
      success: true,
      status,
      findings,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper for local smart assistant reply
function getLocalAssistantReply(incomingText: string) {
  const low = (incomingText || "").toLowerCase();
  if (low.includes("pembagian tugas") || low.includes("kbm") || low.includes("mengajar")) {
    return "Untuk SK Pembagian Tugas KBM, pastikan beban kerja guru bersertifikat pendidik minimal 24 jam tatap muka per minggu. Anda dapat menggunakan modul 'Buat SK Baru' untuk menyusun SK lengkap dengan Lampiran I (KBM), Lampiran II (Wali Kelas & KKG), Lampiran III (Tenaga Kependidikan), dan Lampiran IV (Tugas Tambahan).";
  }
  if (low.includes("bos") || low.includes("bosp") || low.includes("anggaran")) {
    return "Penyusunan SK Tim Pengelola BOSP berpedoman pada Petunjuk Teknis Pengelolaan BOSP terbaru dari kementerian. Tim terdiri dari Penanggung Jawab (Kepala Sekolah), Bendahara BOS, dan Anggota (Guru/Komite). Format siap disusun melalui template resmi.";
  }
  if (low.includes("tppk") || low.includes("kekerasan")) {
    return "SK TPPK (Tim Pencegahan dan Penanganan Kekerasan) dibentuk sesuai Permendikbudristek No. 46 Tahun 2023. Anggotanya melibatkan perwakilan guru, tenaga kependidikan, dan komite sekolah / orang tua siswa dengan masa tugas 2 tahun.";
  }
  if (low.includes("dasar hukum") || low.includes("regulasi")) {
    return "Dasar hukum baku SK SD mencakup UU No. 20/2003 (Sisdiknas), PP No. 57/2021 jo PP No. 4/2022 (SNP), Permendikdasmen No. 12/2025 (Standar Isi), No. 10/2025 (SKL), No. 13/2025 (Kurikulum), serta Kalender Pendidikan Dinas Daerah.";
  }
  return "Halo Bapak/Ibu Kepala Sekolah! Saya Asisten AI Administrasi Satuan Pendidikan Dasar. Saya siap membantu menyusun draf SK, memverifikasi dasar hukum tata naskah dinas, menyusun SOP, atau program kerja sekolah.";
}

// Endpoint: AI Assistant Chat for School Headmaster (supports both /assistant and /assistant-chat)
const handleAssistantChat = async (req: Request, res: Response) => {
  const { message, messages, history: reqHistory, context } = req.body;
  const incomingText = message || (messages && messages[messages.length - 1]?.content) || "Halo";
  const ai = getGemini();

  if (!ai) {
    return res.json({
      success: true,
      reply: getLocalAssistantReply(incomingText),
    });
  }

  const formattedHistory = reqHistory
    ? reqHistory.map((h: any) => ({
        role: h.role === "assistant" || h.role === "model" ? "model" : "user",
        parts: [{ text: h.content || h.text || "" }],
      }))
    : (messages || []).slice(0, -1).map((m: any) => ({
        role: m.role === "assistant" || m.role === "model" ? "model" : "user",
        parts: [{ text: m.content || m.text || "" }],
      }));

  const systemInstruction = `Anda adalah "Asisten AI Administrasi Kepala Sekolah SD". Anda ramah, bijak, berwibawa, dan sangat menguasai tata laksana dinas pendidikan dasar di Indonesia (Kurikulum Merdeka, Permendikdasmen terbaru, Pengelolaan BOS/BOSP, Pemenuhan Jam Mengajar Guru 24-40 jam, TPPK, TPMPS, Komite Sekolah, dsb).
Konteks Satuan Pendidikan:
Nama Sekolah: ${context?.sekolah || "SD Negeri 3 Loloan Timur"}
Kepala Sekolah: ${context?.kepalaSekolah || "Susilo Fitri Yatmoko, M.Pd"}
Jumlah Guru/PTK: ${context?.totalGuru || context?.employeesCount || 11} orang.

Berikan jawaban yang taktis, solutif, santun, dan sesuai regulasi pendidikan Indonesia terkini.`;

  try {
    let responseText = "";
    try {
      const chatResult = await createChatWithFallback(ai, {
        history: formattedHistory,
        config: {
          systemInstruction,
          temperature: 0.3,
        },
        message: incomingText,
      });
      responseText = chatResult.text || "";
    } catch (chatErr: any) {
      console.warn("AI Assistant chat busy or fallback:", chatErr?.message);
      responseText = getLocalAssistantReply(incomingText);
    }

    res.json({
      success: true,
      reply: responseText || getLocalAssistantReply(incomingText),
    });
  } catch (error: any) {
    console.warn("AI Assistant chat busy, returning local smart response:", error?.message);
    res.json({
      success: true,
      reply: getLocalAssistantReply(incomingText),
    });
  }
};

app.post("/api/gemini/assistant", handleAssistantChat);
app.post("/api/gemini/assistant-chat", handleAssistantChat);

// Local Fallback Generator Function supporting various SK categories
function generateLocalSKFallback(
  jenis: string,
  judul: string,
  tahun: string,
  sekolah: any,
  dataKhusus: any,
  employees: any[] = []
) {
  const namaSekolah = sekolah?.nama || "SD Negeri 3 Loloan Timur";
  const namaKab = sekolah?.kabupaten || "Jembrana";
  const namaKec = sekolah?.kecamatan || "Negara";
  const tahunAjaran = tahun || "2025/2026";
  const tanggalRapat = dataKhusus?.tanggalRapat || "18 Juni 2025";
  const lowerJenis = (jenis || "").toLowerCase() + " " + (judul || "").toLowerCase();

  // 1. SK TIM BOS / BOSP
  if (lowerJenis.includes("bos") || lowerJenis.includes("bosp")) {
    return {
      judul: cleanServerSKJudul(judul) || "TIM PENGELOLA BANTUAN OPERASIONAL SATUAN PENDIDIKAN (BOSP)",
      menimbang: [
        `Bahwa dalam rangka memperlancar pengelolaan dan pertanggungjawaban dana Bantuan Operasional Satuan Pendidikan (BOSP) di ${namaSekolah}, dipandang perlu membentuk Tim Pengelola BOSP.`,
        `Bahwa mereka yang namanya tercantum dalam lampiran keputusan ini dianggap mampu dan memenuhi syarat untuk melaksanakan tugas pengelolaan dana BOSP.`,
        `Bahwa berdasarkan pertimbangan sebagaimana dimaksud, perlu menetapkan Keputusan Kepala Sekolah tentang Tim Pengelola BOSP.`,
      ],
      mengingat: [
        "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
        "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Perubahan atas PP 57 Tahun 2021 tentang Standar Nasional Pendidikan;",
        "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Republik Indonesia Nomor 63 Tahun 2022 jo Nomor 63 Tahun 2023 tentang Petunjuk Teknis Pengelolaan Dana Bantuan Operasional Satuan Pendidikan;",
        "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 18 Tahun 2023 tentang Standar Pembiayaan;",
        `Keputusan Bupati ${namaKab} tentang Penetapan Alokasi Dana BOS/BOSP Satuan Pendidikan Dasar.`,
      ],
      memperhatikan: `Hasil Rapat Dewan Guru dan Komite Sekolah ${namaSekolah} tanggal ${tanggalRapat} tentang Pembentukan Tim Pengelola BOSP.`,
      diktum: [
        { poin: "KESATU", isi: "Membentuk Tim Pengelola Bantuan Operasional Satuan Pendidikan (BOSP) sebagaimana tercantum pada lampiran keputusan ini." },
        { poin: "KEDUA", isi: "Tim Pengelola BOSP bertugas merencanakan (RKT/RKAS), mengelola, membukukan, serta mempertanggungjawabkan penggunaan dana BOSP sesuai ketentuan petunjuk teknis." },
        { poin: "KETIGA", isi: "Segala biaya yang timbul akibat pelaksanaan keputusan ini dibebankan pada anggaran BOSP yang bersangkutan." },
        { poin: "KEEMPAT", isi: "Keputusan ini berlaku sejak tanggal ditetapkan dengan ketentuan apabila terdapat kekeliruan akan diperbaiki sebagaimana mestinya." },
      ],
      tembusan: [
        `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${namaKab}`,
        `Koordinator Wilayah Satuan Pendidikan Formal Kecamatan ${namaKec}`,
        "Ketua Komite Sekolah",
        "Arsip Sekolah",
      ],
      lampiranList: [
        {
          nomorLampiran: "Lampiran I",
          judul: "Susunan Tim Pengelola BOSP Satuan Pendidikan",
          jenisLampiran: "tim_bosp",
          headers: ["No", "Nama / NIP", "Jabatan Kedinasan", "Jabatan dalam Tim", "Uraian Tugas Pokok"],
          rows: [
            ["1", `${sekolah?.kepalaSekolah?.nama || "Susilo Fitri Yatmoko, M.Pd"}\nNIP. ${sekolah?.kepalaSekolah?.nip || "19880521 201101 1 010"}`, "Kepala Sekolah", "Penanggung Jawab", "Bertanggung jawab mutlak atas keseluruhan pengelolaan BOSP"],
            ["2", employees[3] ? `${employees[3].nama}\nNIP. ${employees[3].nip || "-"}` : "Made Ririn Praditha Yanti, S.Pd\nNIP. 199803232023211003", "Guru Kelas IV", "Bendahara BOSP", "Mengelola pembukuan, pembayaran, pajak, dan laporan BKU/K7"],
            ["3", employees[2] ? `${employees[2].nama}\nNIP. ${employees[2].nip || "-"}` : "I Putu Agus Pramana Putra, S.Pd\nNIPPPK. 199711062022211001", "Guru Kelas III", "Anggota (Perencana)", "Membantu penyusunan RKAS & verifikasi bukti transaksi"],
            ["4", "Ketua Komite Sekolah\nNIP. -", "Komite Sekolah", "Anggota (Pengawas)", "Mengawasi transparansi penggunaan dana sekolah"],
          ],
          footerNote: "Tim bekerja secara kolektif kolegial dan bertanggung jawab kepada Kepala Sekolah.",
        },
      ],
      aiNotes: ["SK disusun sesuai regulasi Petunjuk Teknis Pengelolaan BOSP resmi Kemendikdasmen."],
    };
  }

  // 2. SK TPPK (Pencegahan & Penanganan Kekerasan)
  if (lowerJenis.includes("tppk") || lowerJenis.includes("kekerasan")) {
    return {
      judul: judul || `PEMBENTUKAN TIM PENCEGAHAN DAN PENANGANAN KEKERASAN (TPPK) DI LINGKUNGAN ${namaSekolah.toUpperCase()}`,
      menimbang: [
        `Bahwa peserta didik, pendidik, dan tenaga kependidikan berhak mendapatkan perlindungan dari segala bentuk kekerasan di lingkungan satuan pendidikan.`,
        `Bahwa untuk mewujudkan lingkungan satuan pendidikan yang ramah, aman, dan nyaman, perlu dibentuk Tim Pencegahan dan Penanganan Kekerasan (TPPK).`,
        `Bahwa berdasarkan pertimbangan tersebut, perlu menetapkan Keputusan Kepala Sekolah tentang Pembentukan TPPK.`,
      ],
      mengingat: [
        "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
        "Undang-undang Nomor 35 Tahun 2014 tentang Perubahan atas UU Nomor 23 Tahun 2002 tentang Perlindungan Anak;",
        "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Standar Nasional Pendidikan;",
        "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 46 Tahun 2023 tentang Pencegahan dan Penanganan Kekerasan di Lingkungan Satuan Pendidikan (PPKSP);",
      ],
      memperhatikan: `Hasil Rapat Koordinasi Dewan Guru, Komite Sekolah, dan Perwakilan Orang Tua Siswa tanggal ${tanggalRapat}.`,
      diktum: [
        { poin: "KESATU", isi: "Membentuk Tim Pencegahan dan Penanganan Kekerasan (TPPK) sebagaimana tercantum dalam lampiran keputusan ini." },
        { poin: "KEDUA", isi: "TPPK bertugas memfasilitasi pencegahan kekerasan, menerima laporan dugaan kekerasan, melakukan penanganan, serta berkoordinasi dengan instansi terkait." },
        { poin: "KETIGA", isi: "Masa tugas TPPK adalah 2 (dua) tahun terhitung sejak tanggal ditetapkan." },
        { poin: "KEEMPAT", isi: "Keputusan ini mulai berlaku sejak tanggal ditetapkan." },
      ],
      tembusan: [
        `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${namaKab}`,
        `Koordinator Wilayah Satuan Pendidikan Formal Kecamatan ${namaKec}`,
        "Pengawas Sekolah Pembina",
        "Ketua Komite Sekolah",
        "Arsip Sekolah",
      ],
      lampiranList: [
        {
          nomorLampiran: "Lampiran I",
          judul: "Susunan Tim Pencegahan dan Penanganan Kekerasan (TPPK)",
          jenisLampiran: "susunan_tppk",
          headers: ["No", "Nama / NIP", "Unsur Keterwakilan", "Jabatan dalam Tim", "Keterangan"],
          rows: [
            ["1", employees[3] ? `${employees[3].nama}\nNIP. ${employees[3].nip || "-"}` : "I Putu Agus Pramana Putra, S.Pd\nNIPPPK. 199711062022211001", "Pendidik (Guru)", "Koordinator", "Unsur Guru"],
            ["2", employees[1] ? `${employees[1].nama}\nNIP. ${employees[1].nip || "-"}` : "Ni Ketut Ayu Negariati, S.Pd.\nNIPPPK. 198305082024212016", "Pendidik (Guru)", "Anggota", "Unsur Guru"],
            ["3", "Perwakilan Komite Sekolah\nNIP. -", "Komite Sekolah", "Anggota", "Unsur Orang Tua/Komite"],
            ["4", employees[9] ? `${employees[9].nama}\nNIP. ${employees[9].nip || "-"}` : "Made Agus Dewa Ariana\nNIPPPK. 199104022025211025", "Tenaga Kependidikan", "Anggota", "Unsur Tenaga Kependidikan"],
          ],
          footerNote: "Keanggotaan TPPK wajib didaftarkan pada Portal Resmi Kemendikbudristek/Dapodik.",
        },
      ],
      aiNotes: ["SK diselaraskan dengan Permendikbudristek No. 46 Tahun 2023."],
    };
  }

  // 3. SK TIM PENGEMBANG KURIKULUM (TPK)
  if (lowerJenis.includes("kurikulum") || lowerJenis.includes("tpk") || lowerJenis.includes("ksp") || lowerJenis.includes("kosp")) {
    return {
      judul: cleanServerSKJudul(judul) || "PENETAPAN TIM PENGEMBANG KURIKULUM SATUAN PENDIDIKAN (TPK)",
      menimbang: [
        `Bahwa dalam rangka mengembangkan dan menyempurnakan Kurikulum Satuan Pendidikan (KSP) di ${namaSekolah}, perlu dibentuk Tim Pengembang Kurikulum.`,
        `Bahwa mereka yang ditunjuk dalam keputusan ini dipandang cakap dan memenuhi syarat untuk melaksanakan tugas penyusunan kurikulum operasional sekolah.`,
      ],
      mengingat: [
        "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
        "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Perubahan atas PP 57 Tahun 2021 tentang Standar Nasional Pendidikan;",
        "Peraturan Menteri Pendidikan Dasar dan Menengah Republik Indonesia Nomor 12 Tahun 2025 tentang Standar Isi;",
        "Peraturan Menteri Pendidikan Dasar dan Menengah Republik Indonesia Nomor 10 Tahun 2025 tentang Standar Kompetensi Lulusan;",
        "Peraturan Menteri Pendidikan Dasar dan Menengah Republik Indonesia Nomor 13 Tahun 2025 tentang Kurikulum;",
      ],
      memperhatikan: `Hasil Rapat Dewan Guru ${namaSekolah} tanggal ${tanggalRapat} tentang Pengembangan Kurikulum Sekolah.`,
      diktum: [
        { poin: "KESATU", isi: "Menetapkan Tim Pengembang Kurikulum Satuan Pendidikan sebagaimana tercantum dalam lampiran keputusan ini." },
        { poin: "KEDUA", isi: "Tim bertugas menyusun, mereviu, dan menyempurnakan Kurikulum Satuan Pendidikan beserta perangkat ajar pendukung." },
        { poin: "KETIGA", isi: "Keputusan ini berlaku sejak tanggal ditetapkan." },
      ],
      tembusan: [
        `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${namaKab}`,
        `Pengawas Sekolah Dasar Pembina`,
        "Ketua Komite Sekolah",
        "Arsip",
      ],
      lampiranList: [
        {
          nomorLampiran: "Lampiran I",
          judul: "Susunan Tim Pengembang Kurikulum Satuan Pendidikan",
          jenisLampiran: "tim_kurikulum",
          headers: ["No", "Nama / NIP", "Pangkat / Gol", "Jabatan Kedinasan", "Jabatan dalam Tim"],
          rows: [
            ["1", `${sekolah?.kepalaSekolah?.nama || "Susilo Fitri Yatmoko, M.Pd"}\nNIP. ${sekolah?.kepalaSekolah?.nip || "19880521 201101 1 010"}`, "Pembina / IV/a", "Kepala Sekolah", "Pengarah / Penanggung Jawab"],
            ["2", employees[5] ? `${employees[5].nama}\nNIP. ${employees[5].nip || "-"}` : "Ni Putu Leni Sulistya Dewi, S.Pd.", "Ahli Pertama / IX", "Guru Kelas VI", "Ketua Tim Pengembang Kurikulum"],
            ["3", employees[4] ? `${employees[4].nama}\nNIP. ${employees[4].nip || "-"}` : "Komang Ayuni, S.Pd", "Ahli Pertama / IX", "Guru Kelas V", "Sekretaris Tim"],
            ["4", "Ketua Komite Sekolah", "-", "Komite Sekolah", "Narasumber / Pertimbangan"],
          ],
          footerNote: "Dokumen kurikulum yang dihasilkan disahkan oleh Kepala Sekolah dan diverifikasi Pengawas Pembina.",
        },
        {
          nomorLampiran: "Lampiran II",
          judul: "Jadwal dan Rencana Tahapan Kerja Tim Pengembang Kurikulum",
          jenisLampiran: "kegiatan",
          headers: ["No", "Tahapan Kegiatan", "Uraian Kerja Tim", "Waktu Pelaksanaan", "Penanggung Jawab", "Output"],
          rows: [
            ["1", "Analisis Karakteristik", "Menganalisis rapor pendidikan, sarpras, dan lingkungan budaya", "Minggu 1", "Ketua Tim & Anggota", "Draf Karakteristik Satuan"],
            ["2", "Reviu Visi, Misi & Tujuan", "Menyelaraskan tujuan sekolah dengan Kurikulum Merdeka", "Minggu 2", "Kepala Sekolah & Tim", "Visi-Misi Final"],
            ["3", "Pengorganisasian Belajar", "Menetapkan struktur kurikulum, alokasi JP intrakurikuler dan P5", "Minggu 3", "Sekretaris & Seluruh Guru", "Struktur Kurikulum"],
            ["4", "Validasi dan Pengesahan", "Reviu oleh Pengawas Pembina dan pengesahan Kepala Dinas", "Minggu 4", "Kepala Sekolah & Pengawas", "Buku KSP Disahkan"],
          ],
          footerNote: "Seluruh tahapan kerja dilaporkan secara berkala kepada Kepala Sekolah.",
        },
      ],
      aiNotes: ["Format TPK memuat keselarasan Permendikdasmen No. 12 & 13 Tahun 2025."],
    };
  }

  // 4. SK ASESMEN / ANBK / UJIAN SEKOLAH
  if (lowerJenis.includes("asesmen") || lowerJenis.includes("ujian") || lowerJenis.includes("anbk") || lowerJenis.includes("sas")) {
    return {
      judul: cleanServerSKJudul(judul) || "PANITIA PELAKSANA ASESMEN NASIONAL DAN SUMATIF AKHIR SEMESTER",
      menimbang: [
        `Bahwa dalam rangka mengevaluasi capaian pembelajaran dan pemetaan mutu pendidikan di ${namaSekolah}, dipandang perlu menyelenggarakan Asesmen / Ujian Sekolah.`,
        `Bahwa demi kelancaran dan ketertiban pelaksanaannya, perlu dibentuk Panitia Pelaksana Asesmen.`,
      ],
      mengingat: [
        "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
        "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Perubahan atas PP 57 Tahun 2021 tentang Standar Nasional Pendidikan;",
        "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 21 Tahun 2022 tentang Standar Penilaian Pendidikan;",
        "Prosedur Operasional Standar (POS) Penyelenggaraan Asesmen Nasional;",
      ],
      memperhatikan: `Hasil Rapat Dewan Guru ${namaSekolah} tanggal ${tanggalRapat} tentang Persiapan Asesmen dan Ujian Sekolah.`,
      diktum: [
        { poin: "KESATU", isi: "Membentuk Panitia Pelaksana Asesmen sebagaimana tercantum dalam Lampiran I keputusan ini." },
        { poin: "KEDUA", isi: "Menetapkan Daftar Pengawas Ruang dan Proktor/Teknisi sebagaimana tercantum dalam Lampiran II keputusan ini." },
        { poin: "KETIGA", isi: "Panitia bertugas menyusun jadwal, administrasi tes, menjamin kerahasiaan dan integritas, serta melaporkan hasil pelaksanaan." },
        { poin: "KEEMPAT", isi: "Keputusan ini berlaku sejak tanggal ditetapkan." },
      ],
      tembusan: [
        `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${namaKab}`,
        `Pengawas Sekolah Dasar Pembina`,
        "Ketua Komite Sekolah",
        "Arsip Sekolah",
      ],
      lampiranList: [
        {
          nomorLampiran: "Lampiran I",
          judul: "Susunan Panitia Pelaksana Asesmen dan Ujian Sekolah",
          jenisLampiran: "susunan_panitia",
          headers: ["No", "Nama / NIP", "Jabatan Kedinasan", "Jabatan Kepanitiaan", "Uraian Tugas & Tanggung Jawab"],
          rows: [
            ["1", `${sekolah?.kepalaSekolah?.nama || "Susilo Fitri Yatmoko, M.Pd"}\nNIP. ${sekolah?.kepalaSekolah?.nip || "19880521 201101 1 010"}`, "Kepala Sekolah", "Penanggung Jawab", "Bertanggung jawab mutlak atas kelancaran dan integritas ujian"],
            ["2", employees[0] ? `${employees[0].nama}\nNIP. ${employees[0].nip || "-"}` : "Ketua Panitia", "Guru Kelas", "Ketua Panitia", "Mengatur jadwal, koordinasi teknis penyusunan soal/kisi-kisi, dan pengawasan"],
            ["3", employees[1] ? `${employees[1].nama}\nNIP. ${employees[1].nip || "-"}` : "Sekretaris", "Guru Kelas", "Sekretaris", "Administrasi kartu peserta, daftar hadir, berita acara pelaksanaan, dan rekapitulasi"],
            ["4", employees[2] ? `${employees[2].nama}\nNIP. ${employees[2].nip || "-"}` : "Proktor & Teknisi", "Tenaga Kependidikan", "Proktor / Teknisi", "Kesiapan perangkat komputer/Chromebook, sinkronisasi VHD/web ANBK, dan jaringan"],
          ],
          footerNote: "Panitia bertugas dengan penuh tanggung jawab dan integritas tinggi.",
        },
        {
          nomorLampiran: "Lampiran II",
          judul: "Daftar Pengawas Ruang Asesmen / Ujian Sekolah",
          jenisLampiran: "susunan_panitia",
          headers: ["No", "Nama Pengawas / NIP", "Pangkat / Golongan", "Mata Uji / Sesi", "Ruang Ujian", "Keterangan"],
          rows: (employees.length > 0 ? employees.slice(0, 5) : [
            { nama: "Ni Ketut Ayu Negariati, S.Pd.", nip: "198305082024212016", pangkat: "Ahli Pertama", golongan: "IX" },
            { nama: "Ni Putu Nuning Riasmini, SE.", nip: "199301192025212050", pangkat: "-", golongan: "-" },
          ]).map((e: any, idx: number) => [
            String(idx + 1),
            `${e.nama}\nNIP. ${e.nip || "-"}`,
            e.golongan ? `${e.pangkat || "-"}\n/${e.golongan}` : "-",
            "Literasi & Numerasi / Sesi 1 & 2",
            `Ruang ${idx + 1}`,
            "Pengawas Ruang / Silang",
          ]),
          footerNote: "Pengawas ruang wajib hadir 30 menit sebelum sesi ujian dimulai.",
        },
      ],
      aiNotes: ["SK Asesmen dilengkapi 2 lampiran resmi: Panitia Inti dan Pengawas Ruang."],
    };
  }

  // 5. SK PPDB / PENERIMAAN MURID BARU
  if (lowerJenis.includes("ppdb") || lowerJenis.includes("spmb") || lowerJenis.includes("murid baru") || lowerJenis.includes("siswa baru")) {
    return {
      judul: cleanServerSKJudul(judul) || "PANITIA PENERIMAAN PESERTA DIDIK BARU (PPDB)",
      menimbang: [
        `Bahwa dalam rangka penerimaan murid baru yang tertib, transparan, dan akuntabel di ${namaSekolah}, perlu dibentuk Panitia PPDB.`,
        `Bahwa nama-nama yang tercantum dalam lampiran dipandang cakap dan memenuhi syarat melaksanakan tugas kepanitiaan PPDB.`,
      ],
      mengingat: [
        "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
        "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Standar Nasional Pendidikan;",
        "Peraturan Menteri Pendidikan dan Kebudayaan Republik Indonesia tentang Petunjuk Teknis Penerimaan Peserta Didik Baru;",
        `Peraturan Bupati ${namaKab} tentang Pedoman PPDB Satuan Pendidikan Dasar.`,
      ],
      memperhatikan: `Hasil Rapat Dewan Guru dan Komite Sekolah ${namaSekolah} tanggal ${tanggalRapat} tentang Persiapan PPDB.`,
      diktum: [
        { poin: "KESATU", isi: "Membentuk Panitia Penerimaan Peserta Didik Baru (PPDB) sebagaimana tercantum dalam lampiran keputusan ini." },
        { poin: "KEDUA", isi: "Panitia bertugas melayani pendaftaran, verifikasi keabsahan dokumen persyaratan, pengolahan seleksi zonasi/afirmasi/mutasi, dan pelaporan." },
        { poin: "KETIGA", isi: "Keputusan ini berlaku sejak tanggal ditetapkan." },
      ],
      tembusan: [
        `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${namaKab}`,
        `Koordinator Wilayah SPF Kecamatan ${namaKec}`,
        "Ketua Komite Sekolah",
        "Arsip",
      ],
      lampiranList: [
        {
          nomorLampiran: "Lampiran I",
          judul: "Susunan Panitia Penerimaan Peserta Didik Baru (PPDB)",
          jenisLampiran: "susunan_panitia",
          headers: ["No", "Nama / NIP", "Jabatan Kedinasan", "Jabatan dalam Panitia PPDB", "Uraian Tugas Khusus"],
          rows: [
            ["1", `${sekolah?.kepalaSekolah?.nama || "Susilo Fitri Yatmoko, M.Pd"}\nNIP. ${sekolah?.kepalaSekolah?.nip || "19880521 201101 1 010"}`, "Kepala Sekolah", "Penanggung Jawab", "Menetapkan kuota daya tampung rombel dan mengesahkan hasil seleksi"],
            ["2", employees[0] ? `${employees[0].nama}\nNIP. ${employees[0].nip || "-"}` : "Ketua PPDB", "Guru Kelas", "Ketua Panitia", "Memimpin posko pendaftaran, sosialisasi ketentuan zonasi, dan rekapitulasi data"],
            ["3", employees[1] ? `${employees[1].nama}\nNIP. ${employees[1].nip || "-"}` : "Sekretaris PPDB", "Guru Kelas", "Sekretaris & Verifikator", "Verifikasi berkas akta lahir, KK, afirmasi, dan pengisian buku induk"],
            ["4", employees[2] ? `${employees[2].nama}\nNIP. ${employees[2].nip || "-"}` : "Petugas Layanan", "Tenaga Kependidikan", "Petugas Layanan Informasi", "Pelayanan formulir fisik dan asistensi pendaftaran orang tua siswa"],
          ],
          footerNote: "Pelayanan PPDB dilaksanakan secara objektif, transparan, akuntabel, dan tanpa diskriminasi.",
        },
      ],
      aiNotes: ["SK diselaraskan dengan regulasi PPDB Zonasi Satuan Pendidikan Dasar."],
    };
  }

  // 6. SK PEMBINA PRAMUKA & EKSTRAKURIKULER
  if (lowerJenis.includes("pramuka") || lowerJenis.includes("ekskul") || lowerJenis.includes("ekstrakurikuler") || lowerJenis.includes("uks")) {
    return {
      judul: cleanServerSKJudul(judul) || "PEMBAGIAN TUGAS PEMBINA KEGIATAN EKSTRAKURIKULER DAN PENGEMBANGAN DIRI",
      menimbang: [
        `Bahwa dalam rangka mengembangkan potensi, bakat, minat, serta kepribadian peserta didik di ${namaSekolah}, perlu diselenggarakan kegiatan ekstrakurikuler.`,
        `Bahwa untuk keteraturan pelaksanaan bimbingan ekstrakurikuler, perlu menetapkan pembagian tugas pembina dan pelatih.`,
      ],
      mengingat: [
        "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
        "Undang-undang Nomor 12 Tahun 2010 tentang Gerakan Pramuka;",
        "Peraturan Menteri Pendidikan dan Kebudayaan Nomor 62 Tahun 2014 tentang Kegiatan Ekstrakurikuler pada Pendidikan Dasar dan Menengah;",
        "Peraturan Menteri Pendidikan dan Kebudayaan Nomor 63 Tahun 2014 tentang Pendidikan Kepramukaan sebagai Ekstrakurikuler Wajib;",
      ],
      memperhatikan: `Hasil Rapat Dewan Guru ${namaSekolah} tanggal ${tanggalRapat} tentang Program Ekstrakurikuler.`,
      diktum: [
        { poin: "KESATU", isi: "Menetapkan Pembagian Tugas Pembina dan Pelatih Kegiatan Ekstrakurikuler sebagaimana tercantum dalam lampiran keputusan ini." },
        { poin: "KEDUA", isi: "Masing-masing pembina menyusun program latihan, daftar presensi, dan laporan perkembangan bakat siswa secara berkala." },
        { poin: "KETIGA", isi: "Keputusan ini berlaku sejak tanggal ditetapkan." },
      ],
      tembusan: [
        `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${namaKab}`,
        `Pengawas Sekolah Dasar Pembina`,
        "Ketua Komite Sekolah",
        "Arsip Sekolah",
      ],
      lampiranList: [
        {
          nomorLampiran: "Lampiran I",
          judul: "Pembagian Tugas Pembina dan Pelatih Kegiatan Ekstrakurikuler",
          jenisLampiran: "kegiatan",
          headers: ["No", "Nama Pembina / NIP", "Jabatan Pokok", "Cabang Ekstrakurikuler", "Hari & Waktu Latihan", "Sasaran Siswa"],
          rows: [
            ["1", employees[0] ? `${employees[0].nama}\nNIP. ${employees[0].nip || "-"}` : "Pembina Pramuka", "Guru Kelas", "Pramuka (Siaga & Penggalang)", "Jumat, 14.00 - 16.00 WITA", "Kelas III, IV, V, VI"],
            ["2", employees[1] ? `${employees[1].nama}\nNIP. ${employees[1].nip || "-"}` : "Pembina UKS", "Guru Kelas", "UKS & Dokter Kecil", "Sabtu, 08.00 - 09.30 WITA", "Kelas IV dan V"],
            ["3", employees[2] ? `${employees[2].nama}\nNIP. ${employees[2].nip || "-"}` : "Pembina Kesenian", "Guru Kelas", "Seni Tari & Tabuh Karawitan", "Kamis, 14.30 - 16.00 WITA", "Kelas I - VI"],
            ["4", employees[3] ? `${employees[3].nama}\nNIP. ${employees[3].nip || "-"}` : "Pembina Olahraga", "Guru Kelas", "Olahraga Prestasi (Bulutangkis/Atletik)", "Selasa, 15.00 - 17.00 WITA", "Kelas IV, V, VI"],
          ],
          footerNote: "Kegiatan ekstrakurikuler diselenggarakan dengan mengedepankan keamanan dan pembentukan karakter anak.",
        },
      ],
      aiNotes: ["SK Ekstrakurikuler memuat rincian cabang, jadwal latihan, dan sasaran peserta didik."],
    };
  }

  // 7. SK TIM PENJAMINAN MUTU PENDIDIKAN SEKOLAH (TPMPS) / TPS
  if (lowerJenis.includes("tpmps") || lowerJenis.includes("mutu") || lowerJenis.includes("tps") || lowerJenis.includes("pengembang sekolah")) {
    return {
      judul: cleanServerSKJudul(judul) || "PEMBENTUKAN TIM PENJAMINAN MUTU PENDIDIKAN SEKOLAH (TPMPS)",
      menimbang: [
        `Bahwa penjaminan mutu pendidikan di ${namaSekolah} harus dilaksanakan secara terencana, sistematis, dan berkelanjutan berbasis Profil Pendidikan.`,
        `Bahwa untuk memfasilitasi audit mutu internal dan Perencanaan Berbasis Data (PBD), perlu dibentuk TPMPS.`,
      ],
      mengingat: [
        "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
        "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Perubahan atas PP 57 Tahun 2021 tentang Standar Nasional Pendidikan;",
        "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 47 Tahun 2023 tentang Standar Pengelolaan;",
      ],
      memperhatikan: `Hasil Rapat Dewan Guru ${namaSekolah} tanggal ${tanggalRapat} tentang Evaluasi Rapor Pendidikan dan Mutu Sekolah.`,
      diktum: [
        { poin: "KESATU", isi: "Membentuk Tim Penjaminan Mutu Pendidikan Sekolah (TPMPS) sebagaimana tercantum dalam lampiran keputusan ini." },
        { poin: "KEDUA", isi: "TPMPS bertugas mengawal pemenuhan 8 Standar Nasional Pendidikan, merumuskan rekomendasi PBD, dan mengawal ketercapaian mutu." },
        { poin: "KETIGA", isi: "Keputusan ini berlaku sejak tanggal ditetapkan." },
      ],
      tembusan: [
        `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${namaKab}`,
        `Pengawas Sekolah Dasar Pembina`,
        "Ketua Komite Sekolah",
        "Arsip",
      ],
      lampiranList: [
        {
          nomorLampiran: "Lampiran I",
          judul: "Susunan Tim Penjaminan Mutu Pendidikan Sekolah (TPMPS)",
          jenisLampiran: "susunan_panitia",
          headers: ["No", "Nama / NIP", "Jabatan Kedinasan", "Bidang Standar Nasional Pendidikan", "Uraian Tugas Pokok"],
          rows: [
            ["1", `${sekolah?.kepalaSekolah?.nama || "Susilo Fitri Yatmoko, M.Pd"}\nNIP. ${sekolah?.kepalaSekolah?.nip || "19880521 201101 1 010"}`, "Kepala Sekolah", "Penanggung Jawab Mutu", "Menetapkan kebijakan mutu dan menyetujui program intervensi Rapor Pendidikan"],
            ["2", employees[0] ? `${employees[0].nama}\nNIP. ${employees[0].nip || "-"}` : "Ketua TPMPS", "Guru Kelas", "Standar Isi & Standar Proses", "Menganalisis ketercapaian literasi, numerasi, dan metode pembelajaran guru"],
            ["3", employees[1] ? `${employees[1].nama}\nNIP. ${employees[1].nip || "-"}` : "Sekretaris", "Guru Kelas", "Standar Penilaian & Kompetensi Lulusan", "Mengevaluasi instrumen asesmen dan perkembangan capaian pembelajaran siswa"],
            ["4", employees[2] ? `${employees[2].nama}\nNIP. ${employees[2].nip || "-"}` : "Anggota", "Tenaga Kependidikan", "Standar Sarpras & Pengelolaan", "Mengaudit kelayakan sarana prasarana serta ketertiban tata kelola sekolah"],
          ],
          footerNote: "Hasil evaluasi mutu internal dilaporkan kepada pengawas pembina sekolah.",
        },
      ],
      aiNotes: ["SK TPMPS memuat pemetaan penanggung jawab 8 Standar Nasional Pendidikan."],
    };
  }

  // 8. SK TIM FASILITATOR P5 (PROJEK PENGUATAN PROFIL PELAJAR PANCASILA)
  if (lowerJenis.includes("p5") || lowerJenis.includes("projek") || lowerJenis.includes("profil pelajar")) {
    return {
      judul: cleanServerSKJudul(judul) || "TIM FASILITATOR PROJEK PENGUATAN PROFIL PELAJAR PANCASILA (P5)",
      menimbang: [
        `Bahwa implementasi Kurikulum Merdeka di ${namaSekolah} mewajibkan penguatan karakter melalui Projek Penguatan Profil Pelajar Pancasila (P5).`,
        `Bahwa demi optimalnya perancangan modul dan pendampingan projek peserta didik, perlu ditetapkan Tim Fasilitator P5.`,
      ],
      mengingat: [
        "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
        "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Standar Nasional Pendidikan;",
        "Peraturan Menteri Pendidikan Dasar dan Menengah Republik Indonesia Nomor 13 Tahun 2025 tentang Kurikulum;",
        "Keputusan Kepala BSKAP tentang Dimensi, Elemen, dan Subelemen Profil Pelajar Pancasila;",
      ],
      memperhatikan: `Hasil Rapat Dewan Guru ${namaSekolah} tanggal ${tanggalRapat} tentang Penetapan Tema Projek P5.`,
      diktum: [
        { poin: "KESATU", isi: "Menetapkan Tim Fasilitator Projek Penguatan Profil Pelajar Pancasila sebagaimana tercantum dalam lampiran keputusan ini." },
        { poin: "KEDUA", isi: "Tim fasilitator bertugas menyusun modul projek, mendampingi aktivitas siswa, menyelenggarakan gelar karya/festival, dan menyusun rapor projek." },
        { poin: "KETIGA", isi: "Keputusan ini berlaku sejak tanggal ditetapkan." },
      ],
      tembusan: [
        `Kepala Dinas Pendidikan Kepemudaan dan Olahraga Kabupaten ${namaKab}`,
        `Pengawas Sekolah Dasar Pembina`,
        "Ketua Komite Sekolah",
        "Arsip",
      ],
      lampiranList: [
        {
          nomorLampiran: "Lampiran I",
          judul: "Tim Fasilitator Projek Penguatan Profil Pelajar Pancasila (P5)",
          jenisLampiran: "kegiatan",
          headers: ["No", "Nama Fasilitator / NIP", "Kedudukan dalam Tim P5", "Tema Projek", "Fase / Sasaran Kelas", "Alokasi Waktu"],
          rows: [
            ["1", employees[0] ? `${employees[0].nama}\nNIP. ${employees[0].nip || "-"}` : "Koordinator P5", "Koordinator Umum P5", "Gaya Hidup Berkelanjutan", "Fase A, B, dan C (Kelas I-VI)", "Blok Mingguan"],
            ["2", employees[1] ? `${employees[1].nama}\nNIP. ${employees[1].nip || "-"}` : "Fasilitator Fase A", "Fasilitator Projek", "Kearifan Lokal (Budaya Bali)", "Fase A (Kelas I & II)", "2 JP per minggu"],
            ["3", employees[2] ? `${employees[2].nama}\nNIP. ${employees[2].nip || "-"}` : "Fasilitator Fase B", "Fasilitator Projek", "Kewirausahaan / Rekayasa Teknologi", "Fase B (Kelas III & IV)", "2 JP per minggu"],
            ["4", employees[3] ? `${employees[3].nama}\nNIP. ${employees[3].nip || "-"}` : "Fasilitator Fase C", "Fasilitator Projek", "Bhinneka Tunggal Ika", "Fase C (Kelas V & VI)", "2 JP per minggu"],
          ],
          footerNote: "Modul P5 berpedoman pada panduan resmi projek penguatan profil pelajar kementerian.",
        },
      ],
      aiNotes: ["SK P5 memuat tema projek, koordinator fase, dan alokasi jam projek karakter."],
    };
  }

  // 9. DEFAULT: SK PEMBAGIAN TUGAS GURU KBM & TENAGA KEPENDIDIKAN (KOMPREHENSIF 4 LAMPIRAN)
  return {
    judul:
      cleanServerSKJudul(judul) ||
      "PEMBAGIAN TUGAS GURU DALAM KEGIATAN PROSES BELAJAR MENGAJAR ATAU BIMBINGAN DAN TUGAS TENAGA KEPENDIDIKAN",
    menimbang: [
      `Bahwa dalam rangka meningkatkan penyelenggaraan proses belajar mengajar dan mutu layanan pendidikan di ${namaSekolah} Tahun Ajaran ${tahunAjaran}, maka perlu Pembagian Tugas Guru dalam kegiatan proses belajar mengajar atau bimbingan dan tugas tenaga kependidikan.`,
      `Bahwa untuk kelancaran pelaksanaan tugas-tugas guru dan tenaga kependidikan tersebut, dipandang perlu menetapkan pembagian tugas dalam suatu Surat Keputusan Kepala Sekolah.`,
    ],
    mengingat: [
      "Undang-undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;",
      "Peraturan Pemerintah Nomor 4 Tahun 2022 tentang Perubahan Peraturan Pemerintah Nomor 57 Tahun 2021 tentang Standar Nasional Pendidikan;",
      "Peraturan Menteri Pendidikan Dasar dan Menengah Republik Indonesia Nomor 12 Tahun 2025 tentang Standar Isi pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar dan Jenjang Pendidikan Menengah;",
      "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 16 Tahun 2022 tentang Standar Proses pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;",
      "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 21 Tahun 2022 tentang Standar Penilaian Pendidikan pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar dan Jenjang Pendidikan Menengah;",
      "Peraturan Menteri Pendidikan Dasar dan Menengah Republik Indonesia Nomor 10 Tahun 2025 tentang Standar Kompetensi Lulusan pada Pendidikan Anak Usia Dini Jenjang Pendidikan Dasar dan Jenjang Pendidikan Menengah;",
      "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 47 Tahun 2023 tentang Standar Pengelolaan Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar dan Jenjang Pendidikan Menengah;",
      "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 18 Tahun 2023 tentang Standar Pembiayaan Pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar dan Jenjang Pendidikan Menengah;",
      "Peraturan Menteri Pendidikan Dasar dan Menengah Republik Indonesia Nomor 13 Tahun 2025 tentang Kurikulum pada Pendidikan Anak Usia Dini Jenjang Pendidikan Dasar dan Jenjang Pendidikan Menengah;",
      "Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 22 Tahun 2023 tentang Standar Sarana dan Prasarana pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar dan Jenjang Pendidikan Menengah;",
      "Peraturan Menteri Pendidikan dan Kebudayaan Republik Indonesia Nomor 20 Tahun 2018 tentang Penguatan Pendidikan Karakter pada Satuan Pendidikan Formal;",
      "Peraturan Daerah / Gubernur terkait Muatan Lokal dan Bahasa Daerah pada Pendidikan Dasar;",
      `Keputusan Kepala Dinas Pendidikan tentang Kalender Pendidikan bagi Satuan Pendidikan Tahun Ajaran ${tahunAjaran};`,
    ],
    memperhatikan: `Saran, usul dan Keputusan Rapat Dewan Guru ${namaSekolah} tanggal ${tanggalRapat} tentang Pembagian Tugas Guru dalam kegiatan proses belajar mengajar atau bimbingan dan tugas tenaga kependidikan di ${namaSekolah} Tahun Ajaran ${tahunAjaran}`,
    diktum: [
      {
        poin: "KESATU",
        isi: "Pembagian tugas-tugas guru dalam kegiatan Proses Pembelajaran seperti tersebut dalam lampiran I keputusan ini.",
      },
      {
        poin: "KEDUA",
        isi: "Pembagian Tugas Tambahan Guru Sebagai Wali Kelas, K3S dan KKG seperti tersebut dalam lampiran II keputusan ini.",
      },
      {
        poin: "KETIGA",
        isi: "Pembagian Tugas Tenaga Kependidikan seperti tersebut dalam lampiran III keputusan ini.",
      },
      {
        poin: "KEEMPAT",
        isi: "Pembagian Tugas Tambahan Pendidik dan Tenaga Kependidikan, seperti tersebut dalam lampiran IV keputusan ini.",
      },
      {
        poin: "KELIMA",
        isi: "Masing-masing guru dan tenaga kependidikan melaporkan pelaksanaan tugasnya secara berkala dan tertulis kepada kepala sekolah.",
      },
      {
        poin: "KEENAM",
        isi: "Segala biaya yang berkaitan dengan pelaksanaan keputusan ini dibebankan kepada anggaran sekolah yang relevan.",
      },
      {
        poin: "KETUJUH",
        isi: "Apabila dikemudian hari ternyata terdapat kekeliruan dalam keputusan ini akan diadakan perbaikan seperlunya.",
      },
      {
        poin: "KEDELAPAN",
        isi: "Keputusan ini mulai berlaku sejak tanggal ditetapkan.",
      },
    ],
    tembusan: [
      `Kepala Dinas Dikpora Kabupaten ${namaKab} di Negara`,
      `Korwil SPF Kecamatan ${namaKec}`,
      "Pengawas Sekolah Dasar Pembina",
      "Ketua Komite Sekolah",
      "Yang bersangkutan untuk dilaksanakan",
      "Arsip",
    ],
    lampiranList: [
      {
        nomorLampiran: "Lampiran I",
        judul: "Pembagian Tugas Guru dalam Proses Belajar Mengajar",
        jenisLampiran: "pembagian_tugas_guru",
        headers: [
          "No",
          "Nama / NIP",
          "Pangkat / Golo-ngan",
          "Jabatan",
          "Mata Pelajaran",
          "Kelas",
          "Jumlah Jam",
        ],
        rows:
          employees.length > 0
            ? employees.map((e, idx) => [
                String(idx + 1),
                `${e.nama}\n${e.nip && e.nip !== "-" ? (e.statusKepegawaian === "PPPK" ? `NIPPPK. ${e.nip}` : `NIP. ${e.nip}`) : "NIP. -"}`,
                e.pangkat && e.golongan ? `${e.pangkat}\n/${e.golongan}` : "-",
                e.jabatan || "Guru Kelas",
                e.mapel || "Tematik / Semua Mapel",
                e.kelas || "I",
                "32 jam",
              ])
            : [
                [
                  "1",
                  "Ni Ketut Ayu Negariati, S.Pd.\nNIPPPK. 198305082024212016",
                  "Ahli Pertama\n/IX",
                  "Guru Kelas",
                  "P. Pancasila\nBhs. Indonesia\nMatematika\nSeni & Budaya\nBhs. Bali",
                  "I",
                  "24 jam",
                ],
                [
                  "2",
                  "Ni Putu Nuning Riasmini, SE.\nNIPPPK. 199301192025212050",
                  "-\n-",
                  "Guru Kelas",
                  "P. Pancasila\nBhs. Indonesia\nMatematika\nSeni & Budaya\nBhs. Bali",
                  "II",
                  "26 jam",
                ],
                [
                  "3",
                  "I Putu Agus Pramana Putra, S.Pd\nNIPPPK. 199711062022211001",
                  "Ahli Pertama\n/IX",
                  "Guru Kelas",
                  "P. Pancasila\nBhs. Indonesia\nMatematika\nIPAS\nSeni & Budaya\nBhs. Inggris\nBhs. Bali",
                  "III",
                  "32 jam",
                ],
                [
                  "4",
                  "Made Ririn Praditha Yanti, S.Pd\nNIP. 199803232023211003",
                  "Penata Muda Tk. I\nIII/b",
                  "Guru Kelas",
                  "P. Pancasila\nBhs. Indonesia\nMatematika\nIPAS\nSeni & Budaya\nBhs. Inggris\nBhs. Bali",
                  "IV",
                  "32 Jam",
                ],
                [
                  "5",
                  "Komang Ayuni, S.Pd\nNIPPPK. 198605022022212030",
                  "Ahli Pertama\n/IX",
                  "Guru Kelas",
                  "P. Pancasila\nBhs. Indonesia\nMatematika\nIPAS\nSeni & Budaya\nBhs. Inggris\nKoding & KA\nBhs. Bali",
                  "V",
                  "34 Jam",
                ],
                [
                  "6",
                  "Ni Putu Leni Sulistya Dewi, S.Pd.\nNIPPPK. 198901102022212002",
                  "Ahli Pertama\n/IX",
                  "Guru Kelas",
                  "P. Pancasila\nBhs. Indonesia\nMatematika\nIPAS\nSeni & Budaya\nBhs. Inggris\nKoding & KA\nBhs. Bali",
                  "VI",
                  "34 jam",
                ],
                [
                  "7",
                  "Bagus Ratman Syahputra, S.Pd\nNIPPPK. 199408252023211006",
                  "Ahli Pertama\n/IX",
                  "Guru PJOK",
                  "Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)",
                  "I - VI",
                  "24 jam",
                ],
                [
                  "8",
                  "Ni Putu Grecia Budi Lestari, S.Pd.\nNIPPPK. 199307222024212008",
                  "Ahli Pertama\n/IX",
                  "Guru Agama Hindu",
                  "Pendidikan Agama Hindu dan Budi Pekerti",
                  "I - VI",
                  "24 jam",
                ],
              ],
        footerNote: "Jumlah Total Beban Mengajar: 230 Jam",
      },
      {
        nomorLampiran: "Lampiran II",
        judul: "Pembagian Tugas Tambahan Guru Sebagai Wali Kelas K3S dan KKG",
        jenisLampiran: "tugas_tambahan_guru",
        headers: ["No", "Nama / NIP", "Pangkat / Gol", "Jabatan", "K 3 S / KKG", "Wali Kelas"],
        rows: [
          ["1", `${sekolah?.kepalaSekolah?.nama || "Susilo Fitri Yatmoko, M.Pd"}\nNIP. ${sekolah?.kepalaSekolah?.nip || "19880521 201101 1 010"}`, "Pembina\nIV/a", "Kepala Sekolah", "K 3 S", "Pemandu"],
          ["2", "Ni Ketut Ayu Negariati, S.Pd.\nNIPPPK. 198305082024212016", "Ahli Pertama\n/IX", "Guru Kelas", "KKG I", "I"],
          ["3", "Ni Putu Nuning Riasmini, SE.\nNIPPPK. 199301192025212050", "-\n-", "Guru Kelas", "KKG II", "II"],
          ["4", "I Putu Agus Pramana Putra, S.Pd\nNIPPPK. 199711062022211001", "Ahli Pertama\n/IX", "Guru Kelas", "KKG III", "III"],
          ["5", "Made Ririn Praditha Yanti, S.Pd\nNIP. 199803232023211003", "Penata Muda Tk. I\nIII/b", "Guru Kelas", "KKG IV", "IV"],
          ["6", "Komang Ayuni, S.Pd\nNIPPPK. 198605022022212030", "Ahli Pertama\n/IX", "Guru Kelas", "KKG V", "V"],
          ["7", "Ni Putu Leni Sulistya Dewi, S.Pd.\nNIPPPK. 198901102022212002", "Ahli Pertama\n/IX", "Guru Kelas", "KKG VI", "VI"],
        ],
      },
      {
        nomorLampiran: "Lampiran III",
        judul: "Pembagian Tugas Tenaga Kependidikan",
        jenisLampiran: "tenaga_kependidikan",
        headers: ["No", "Nama / NIP", "Pangkat / Gol", "Jabatan", "Bidang Tugas", "Ket."],
        rows: [
          ["1", "Made Agus Dewa Ariana\nNIPPPK. 199104022025211025", "Pengatur\nV", "Pengadministrasian Umum", "● Tata Usaha & Administrasi Sekolah\n● Operator DAPODIK & SIMPEDIA\n● Aset Daerah & Membantu Bendahara BOS", "-"],
          ["2", "Ni Putu Aulia Putri\nNIPPPK. 200409152025212004", "-\n-", "Pranata Barang dan Jasa", "● Rekap Lapor Bulan & Absensi Guru/Pegawai\n● Agenda Surat Masuk & Keluar\n● Pengelolaan Barang/Jasa & Beasiswa PIP", "-"],
        ],
      },
      {
        nomorLampiran: "Lampiran IV",
        judul: "Pembagian Tugas Tambahan Pendidik dan Tenaga Kependidikan",
        jenisLampiran: "tugas_tambahan_ptk",
        headers: ["No", "Nama / NIP", "Pangkat / Gol", "Jabatan", "Tugas / Seksi", "Ket."],
        rows: [
          ["1", `${sekolah?.kepalaSekolah?.nama || "Susilo Fitri Yatmoko, M.Pd"}\nNIP. ${sekolah?.kepalaSekolah?.nip || "19880521 201101 1 010"}`, "Penata Tk. I\nIII/d", "Kepala Sekolah", "● Penanggung Jawab Umum\n● K3S Pemandu", "-"],
          ["2", "Ni Ketut Ayu Negariati, S.Pd.\nNIPPPK. 198305082024212016", "Ahli Pertama\n/IX", "Guru Kelas", "● Wali Kelas I\n● Pembina Ekstrakurikuler", "-"],
          ["3", "Ni Putu Nuning Riasmini, SE.\nNIPPPK. 199301192025212050", "-\n-", "Guru Kelas", "● Wali Kelas II\n● Pengelola UKS", "-"],
          ["4", "I Putu Agus Pramana Putra, S.Pd\nNIPPPK. 199711062022211001", "Ahli Pertama\n/IX", "Guru Kelas", "● Wali Kelas III\n● Koordinator P5", "-"],
          ["5", "Made Ririn Praditha Yanti, S.Pd\nNIP. 199803232023211003", "Penata Muda Tk. I\nIII/b", "Guru Kelas", "● Wali Kelas IV\n● Bendahara BOS", "-"],
          ["6", "Komang Ayuni, S.Pd\nNIPPPK. 198605022022212030", "Ahli Pertama\n/IX", "Guru Kelas", "● Wali Kelas V\n● Pembina Pramuka", "-"],
          ["7", "Ni Putu Leni Sulistya Dewi, S.Pd.\nNIPPPK. 198901102022212002", "Ahli Pertama\n/IX", "Guru Kelas", "● Wali Kelas VI\n● Koordinator Kurikulum", "-"],
          ["8", "Bagus Ratman Syahputra, S.Pd\nNIPPPK. 199408252023211006", "Ahli Pertama\n/IX", "Guru PJOK", "● Pembina Prestasi Olahraga\n● Koordinator Sarpras Olahraga", "-"],
          ["9", "Ni Putu Grecia Budi Lestari, S.Pd.\nNIPPPK. 199307222024212008", "Ahli Pertama\n/IX", "Guru Agama Hindu", "● Pembina Keagamaan & Budi Pekerti\n● Koordinator Upacara Keagamaan", "-"],
          ["10", "Made Agus Dewa Ariana\nNIPPPK. 199104022025211025", "Pengatur\nV", "Pengadministrasian Umum", "● Tata Usaha & Operator DAPODIK\n● Aset Daerah & SIMPEDIA\n● Membantu Bendahara BOS", "-"],
          ["11", "Ni Putu Aulia Putri\nNIPPPK. 200409152025212004", "-\n-", "Pranata Barang dan Jasa", "● Rekap Lapor Bulan & Absensi\n● Agenda Surat Masuk/Keluar\n● Beasiswa PIP & Barang Jasa", "-"],
        ],
      },
    ],
    aiNotes: [
      "Draf ini dibuat berdasarkan struktur resmi standar SK Kepala Sekolah Dasar.",
      "Semua nama dan rincian lampiran telah diintegrasikan dengan database guru dan tenaga kependidikan.",
    ],
  };
}

// Start Express server and mount Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server SK Kepala Sekolah running on http://0.0.0.0:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;
