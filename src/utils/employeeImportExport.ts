import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { Employee } from "../types";

export interface ParsedEmployeeResult {
  success: boolean;
  employees: Employee[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: string[];
  warnings: string[];
}

/**
 * Normalizes header keys to standard property names
 */
function normalizeKey(rawKey: string): string {
  const k = rawKey.trim().toLowerCase().replace(/[\r\n\t_]/g, " ").replace(/\s+/g, " ");
  
  if (k.includes("nama") || k === "name" || k === "ptk") return "nama";
  if (k.includes("nip") || k.includes("nipppk") || k.includes("nomor induk")) return "nip";
  if (k.includes("pangkat")) return "pangkat";
  if (k.includes("golongan") || k === "gol" || k.includes("ruang") || k === "gol/ruang") return "golongan";
  if (k.includes("jabatan") || k === "posisi") return "jabatan";
  if (k.includes("jenis") || k.includes("jenis ptk") || k.includes("kategori")) return "jenisPTK";
  if (k.includes("mapel") || k.includes("mata pelajaran") || k.includes("pelajaran") || k.includes("bidang")) return "mapel";
  if (k.includes("kelas") || k.includes("rombel")) return "kelas";
  if (k.includes("status") || k.includes("kepegawaian")) return "statusKepegawaian";
  if (k.includes("jam") || k.includes("jjm") || k.includes("beban")) return "jumlahJamAjar";
  if (k.includes("tugas") || k.includes("tambahan") || k.includes("ekstra")) return "tugasTambahan";
  if (k === "no" || k === "nomor") return "no";
  
  return k;
}

/**
 * Cleans string value from cell
 */
function cleanString(val: any): string {
  if (val === undefined || val === null) return "";
  let s = String(val).trim();
  // Remove wrapping quotes if present
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Cleans NIP cell to prevent scientific notation formatting
 */
function cleanNip(val: any): string {
  if (val === undefined || val === null) return "-";
  let s = String(val).trim();
  if (!s || s === "-" || s === "0") return "-";
  // Remove single quote often used in Excel to force text format ('1988...)
  if (s.startsWith("'")) {
    s = s.substring(1).trim();
  }
  return s;
}

/**
 * Normalizes status kepegawaian to allowed union type
 */
function normalizeStatusKepegawaian(val: string): "PNS" | "PPPK" | "Honorer Daerah" | "GTT" | "PTT" {
  const upper = val.toUpperCase().trim();
  if (upper.includes("PNS") || upper.includes("PNS DPK")) return "PNS";
  if (upper.includes("PPPK") || upper.includes("P3K")) return "PPPK";
  if (upper.includes("HONOR") || upper.includes("KONTRAK")) return "Honorer Daerah";
  if (upper.includes("GTT")) return "GTT";
  if (upper.includes("PTT")) return "PTT";
  // Default to PPPK if ambiguous
  return "PPPK";
}

/**
 * Export employees list to Excel (.xlsx) file
 */
export function exportEmployeesToExcel(employees: Employee[], schoolName = "SD"): void {
  const dataRows = employees.map((emp, idx) => ({
    "No": idx + 1,
    "Nama Lengkap & Gelar": emp.nama || "",
    "NIP / NIPPPK": emp.nip && emp.nip !== "-" ? String(emp.nip) : "-",
    "Pangkat": emp.pangkat || "-",
    "Golongan": emp.golongan || "-",
    "Jabatan": emp.jabatan || "-",
    "Jenis PTK": emp.jenisPTK || "Guru Kelas",
    "Mata Pelajaran": emp.mapel || "-",
    "Kelas Diampu": emp.kelas || "-",
    "Status Kepegawaian": emp.statusKepegawaian || "PPPK",
    "Jumlah Jam Mengajar (JJM)": emp.jumlahJamAjar ?? 0,
    "Tugas Tambahan": Array.isArray(emp.tugasTambahan) ? emp.tugasTambahan.join(", ") : "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataRows);

  // Set explicit column widths
  worksheet["!cols"] = [
    { wch: 6 },  // No
    { wch: 32 }, // Nama Lengkap
    { wch: 24 }, // NIP
    { wch: 20 }, // Pangkat
    { wch: 12 }, // Golongan
    { wch: 22 }, // Jabatan
    { wch: 22 }, // Jenis PTK
    { wch: 32 }, // Mapel
    { wch: 14 }, // Kelas
    { wch: 18 }, // Status
    { wch: 16 }, // Jam
    { wch: 36 }, // Tugas Tambahan
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data PTK");

  // Generate buffer
  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
  });

  const sanitizedSchool = schoolName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  const dateStr = new Date().toISOString().split("T")[0];
  saveAs(blob, `Data_Guru_PTK_${sanitizedSchool}_${dateStr}.xlsx`);
}

/**
 * Export employees list to CSV (.csv) file with UTF-8 BOM
 */
export function exportEmployeesToCSV(employees: Employee[], schoolName = "SD"): void {
  const headers = [
    "No",
    "Nama Lengkap & Gelar",
    "NIP / NIPPPK",
    "Pangkat",
    "Golongan",
    "Jabatan",
    "Jenis PTK",
    "Mata Pelajaran",
    "Kelas Diampu",
    "Status Kepegawaian",
    "Jumlah Jam Mengajar",
    "Tugas Tambahan",
  ];

  const escapeCSV = (val: any) => {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = employees.map((emp, idx) => [
    idx + 1,
    escapeCSV(emp.nama),
    escapeCSV(emp.nip && emp.nip !== "-" ? emp.nip : "-"),
    escapeCSV(emp.pangkat || "-"),
    escapeCSV(emp.golongan || "-"),
    escapeCSV(emp.jabatan || "-"),
    escapeCSV(emp.jenisPTK || "Guru Kelas"),
    escapeCSV(emp.mapel || "-"),
    escapeCSV(emp.kelas || "-"),
    escapeCSV(emp.statusKepegawaian || "PPPK"),
    emp.jumlahJamAjar ?? 0,
    escapeCSV(Array.isArray(emp.tugasTambahan) ? emp.tugasTambahan.join(", ") : ""),
  ]);

  const csvContent = "\uFEFF" + [headers.map(escapeCSV).join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  const sanitizedSchool = schoolName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  const dateStr = new Date().toISOString().split("T")[0];
  saveAs(blob, `Data_Guru_PTK_${sanitizedSchool}_${dateStr}.csv`);
}

/**
 * Export employees list to JSON format
 */
export function exportEmployeesToJSON(employees: Employee[], schoolName = "SD"): void {
  const payload = {
    appName: "Aplikasi SK Kepala Sekolah SD",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    schoolName,
    totalRecords: employees.length,
    employees,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8;",
  });

  const sanitizedSchool = schoolName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  const dateStr = new Date().toISOString().split("T")[0];
  saveAs(blob, `Backup_Data_Guru_PTK_${sanitizedSchool}_${dateStr}.json`);
}

/**
 * Download standard empty template for import
 */
export function downloadEmployeeTemplate(format: "xlsx" | "csv" = "xlsx"): void {
  const sampleTemplateRows = [
    {
      "No": 1,
      "Nama Lengkap & Gelar": "Susilo Fitri Yatmoko, M.Pd",
      "NIP / NIPPPK": "'19880521 201101 1 010",
      "Pangkat": "Pembina",
      "Golongan": "IV/a",
      "Jabatan": "Kepala Sekolah",
      "Jenis PTK": "Kepala Sekolah",
      "Mata Pelajaran": "Manajerial & Supervisi",
      "Kelas Diampu": "-",
      "Status Kepegawaian": "PNS",
      "Jumlah Jam Mengajar (JJM)": 0,
      "Tugas Tambahan": "Penanggung Jawab Umum, K3S Pemandu",
    },
    {
      "No": 2,
      "Nama Lengkap & Gelar": "Ketut Wina Aristadyatmika, S.Pd",
      "NIP / NIPPPK": "'19980323 202321 1 003",
      "Pangkat": "Ahli Pertama",
      "Golongan": "IX",
      "Jabatan": "Guru Kelas I",
      "Jenis PTK": "Guru Kelas",
      "Mata Pelajaran": "PPKn, Bahasa Indonesia, Matematika, Seni Rupa, IPAS",
      "Kelas Diampu": "I",
      "Status Kepegawaian": "PPPK",
      "Jumlah Jam Mengajar (JJM)": 32,
      "Tugas Tambahan": "Wali Kelas I, Koordinator UKS, Bendahara BOS",
    },
    {
      "No": 3,
      "Nama Lengkap & Gelar": "Ni Putu Suartini, S.Pd.SD",
      "NIP / NIPPPK": "'19850412 201001 2 015",
      "Pangkat": "Penata Tk. I",
      "Golongan": "III/d",
      "Jabatan": "Guru Kelas IV",
      "Jenis PTK": "Guru Kelas",
      "Mata Pelajaran": "PPKn, Bhs Indonesia, Matematika, IPAS, SBdP",
      "Kelas Diampu": "IV",
      "Status Kepegawaian": "PNS",
      "Jumlah Jam Mengajar (JJM)": 32,
      "Tugas Tambahan": "Wali Kelas IV, Pengelola Perpustakaan",
    },
    {
      "No": 4,
      "Nama Lengkap & Gelar": "I Made Sujana, S.Pd.H",
      "NIP / NIPPPK": "'19920815 202421 1 012",
      "Pangkat": "Ahli Pertama",
      "Golongan": "IX",
      "Jabatan": "Guru Pend. Agama Hindu",
      "Jenis PTK": "Guru Agama",
      "Mata Pelajaran": "Pendidikan Agama Hindu dan Budi Pekerti",
      "Kelas Diampu": "I - VI",
      "Status Kepegawaian": "PPPK",
      "Jumlah Jam Mengajar (JJM)": 24,
      "Tugas Tambahan": "Pembina Keagamaan Hindu",
    },
    {
      "No": 5,
      "Nama Lengkap & Gelar": "Ahmad Fauzi, S.Pd",
      "NIP / NIPPPK": "-",
      "Pangkat": "-",
      "Golongan": "-",
      "Jabatan": "Tenaga Administrasi Sekolah",
      "Jenis PTK": "Tenaga Kependidikan",
      "Mata Pelajaran": "-",
      "Kelas Diampu": "-",
      "Status Kepegawaian": "Honorer Daerah",
      "Jumlah Jam Mengajar (JJM)": 0,
      "Tugas Tambahan": "Operator Dapodik, Pengadministrasi Persuratan",
    },
  ];

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(sampleTemplateRows);
    worksheet["!cols"] = [
      { wch: 6 },
      { wch: 32 },
      { wch: 24 },
      { wch: 18 },
      { wch: 12 },
      { wch: 24 },
      { wch: 22 },
      { wch: 34 },
      { wch: 14 },
      { wch: 20 },
      { wch: 18 },
      { wch: 38 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Format Template Guru");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
    });
    saveAs(blob, "Template_Format_Import_Data_Guru_PTK.xlsx");
  } else {
    const headers = Object.keys(sampleTemplateRows[0]);
    const escapeCSV = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const lines = sampleTemplateRows.map((row) =>
      headers.map((h) => escapeCSV((row as any)[h])).join(";")
    );
    const content = "\uFEFF" + [headers.map(escapeCSV).join(";"), ...lines].join("\r\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "Template_Format_Import_Data_Guru_PTK.csv");
  }
}

/**
 * Parses an uploaded file (.xlsx, .xls, .csv, or .json) into an array of Employee records
 */
export async function parseEmployeesFromFile(file: File): Promise<ParsedEmployeeResult> {
  const fileName = file.name.toLowerCase();
  const result: ParsedEmployeeResult = {
    success: false,
    employees: [],
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    errors: [],
    warnings: [],
  };

  try {
    // 1. Handle JSON files
    if (fileName.endsWith(".json")) {
      const text = await file.text();
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(text);
      } catch (e: any) {
        result.errors.push(`Format file JSON tidak valid: ${e.message}`);
        return result;
      }

      let rawList: any[] = [];
      if (Array.isArray(parsedJson)) {
        rawList = parsedJson;
      } else if (parsedJson && Array.isArray(parsedJson.employees)) {
        rawList = parsedJson.employees;
      } else {
        result.errors.push("Struktur berkas JSON tidak memiliki daftar guru/PTK yang sesuai.");
        return result;
      }

      result.totalRows = rawList.length;
      const parsedEmployees: Employee[] = [];

      rawList.forEach((item, idx) => {
        const nama = cleanString(item.nama || item.name);
        if (!nama) {
          result.invalidRows++;
          result.warnings.push(`Baris ${idx + 1}: Diabaikan karena kolom Nama kosong.`);
          return;
        }

        let tugasTambahan: string[] = [];
        if (Array.isArray(item.tugasTambahan)) {
          tugasTambahan = item.tugasTambahan.map((t: any) => cleanString(t)).filter(Boolean);
        } else if (typeof item.tugasTambahan === "string") {
          tugasTambahan = item.tugasTambahan
            .split(/[,;\n]/)
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        const emp: Employee = {
          id: item.id || `emp-import-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          no: idx + 1,
          nama,
          nip: cleanNip(item.nip),
          pangkat: cleanString(item.pangkat) || "-",
          golongan: cleanString(item.golongan) || "-",
          jabatan: cleanString(item.jabatan) || "Guru",
          jenisPTK: cleanString(item.jenisPTK) || "Guru Kelas",
          mapel: cleanString(item.mapel) || "-",
          kelas: cleanString(item.kelas) || "-",
          statusKepegawaian: normalizeStatusKepegawaian(cleanString(item.statusKepegawaian)),
          jumlahJamAjar: Number(item.jumlahJamAjar) || 0,
          tugasTambahan,
        };

        parsedEmployees.push(emp);
        result.validRows++;
      });

      result.employees = parsedEmployees;
      result.success = parsedEmployees.length > 0;
      return result;
    }

    // 2. Handle Excel (.xlsx, .xls) and CSV (.csv) files via SheetJS
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, {
      type: "array",
      cellText: false,
      cellDates: true,
      raw: false, // forces formatted strings for phone numbers/NIP to avoid scientific notation
    });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      result.errors.push("Berkas spreadsheet kosong atau tidak memiliki lembar kerja (worksheet).");
      return result;
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to 2D array of strings
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
      header: 1, // raw rows as arrays
      defval: "",
      blankrows: false,
    }) as any[][];

    if (!rawData || rawData.length === 0) {
      result.errors.push("Tidak ada baris data yang ditemukan di dalam berkas.");
      return result;
    }

    // Find header row: look for row that contains "nama"
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
      const row = rawData[i];
      if (Array.isArray(row)) {
        const hasNama = row.some((cell) => {
          const s = String(cell).toLowerCase();
          return s.includes("nama") || s.includes("ptk") || s.includes("guru");
        });
        if (hasNama) {
          headerRowIndex = i;
          break;
        }
      }
    }

    if (headerRowIndex === -1) {
      // Default to first row
      headerRowIndex = 0;
    }

    const headerCells = rawData[headerRowIndex].map((c) => String(c || ""));
    const columnMapping: { [colIdx: number]: string } = {};

    headerCells.forEach((cellText, colIdx) => {
      const normKey = normalizeKey(cellText);
      if (normKey) {
        columnMapping[colIdx] = normKey;
      }
    });

    const dataRows = rawData.slice(headerRowIndex + 1);
    result.totalRows = dataRows.length;

    const parsedEmployees: Employee[] = [];

    dataRows.forEach((row, rowIdx) => {
      // Check if row is completely empty
      if (!Array.isArray(row) || row.every((c) => String(c).trim() === "")) {
        return;
      }

      const rowObj: Record<string, any> = {};
      row.forEach((cellVal, colIdx) => {
        const fieldKey = columnMapping[colIdx];
        if (fieldKey) {
          rowObj[fieldKey] = cellVal;
        }
      });

      const nama = cleanString(rowObj.nama);
      if (!nama || nama.toLowerCase().startsWith("contoh:") || nama.toLowerCase().startsWith("catatan:")) {
        result.invalidRows++;
        return;
      }

      // Parse tugas tambahan
      let tugasTambahan: string[] = [];
      const rawTugas = rowObj.tugasTambahan;
      if (typeof rawTugas === "string" && rawTugas.trim()) {
        tugasTambahan = rawTugas
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (Array.isArray(rawTugas)) {
        tugasTambahan = rawTugas.map((s) => cleanString(s)).filter(Boolean);
      }

      // Jam ajar
      let jam = Number(rowObj.jumlahJamAjar);
      if (isNaN(jam) || jam < 0) {
        // try to extract numbers like "32 Jam"
        const numMatch = String(rowObj.jumlahJamAjar || "").match(/\d+/);
        jam = numMatch ? Number(numMatch[0]) : 0;
      }

      const emp: Employee = {
        id: `emp-import-${Date.now()}-${rowIdx}-${Math.random().toString(36).slice(2, 6)}`,
        no: parsedEmployees.length + 1,
        nama,
        nip: cleanNip(rowObj.nip),
        pangkat: cleanString(rowObj.pangkat) || "-",
        golongan: cleanString(rowObj.golongan) || "-",
        jabatan: cleanString(rowObj.jabatan) || "Guru",
        jenisPTK: cleanString(rowObj.jenisPTK) || "Guru Kelas",
        mapel: cleanString(rowObj.mapel) || "-",
        kelas: cleanString(rowObj.kelas) || "-",
        statusKepegawaian: normalizeStatusKepegawaian(cleanString(rowObj.statusKepegawaian)),
        jumlahJamAjar: jam,
        tugasTambahan,
      };

      parsedEmployees.push(emp);
      result.validRows++;
    });

    if (parsedEmployees.length === 0) {
      result.errors.push(
        "Tidak ada baris data guru yang valid ditemukan. Pastikan kolom 'Nama Lengkap' terisi."
      );
      return result;
    }

    result.employees = parsedEmployees;
    result.success = true;
    return result;
  } catch (error: any) {
    console.error("Error parsing employee file:", error);
    result.errors.push(`Gagal membaca berkas: ${error.message || "Format tidak didukung"}`);
    return result;
  }
}
