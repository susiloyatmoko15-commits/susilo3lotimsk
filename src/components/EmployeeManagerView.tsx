import React, { useState, useRef, useEffect } from "react";
import { Employee } from "../types";
import {
  Users,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  X,
  FileSpreadsheet,
  Clock,
  Download,
  Upload,
  FileText,
  FileDown,
  FileUp,
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HelpCircle,
  Info,
  BookmarkCheck,
} from "lucide-react";
import { syncMasterDefaultsToServer } from "../utils/storage";
import {
  exportEmployeesToExcel,
  exportEmployeesToCSV,
  exportEmployeesToJSON,
  downloadEmployeeTemplate,
  parseEmployeesFromFile,
  ParsedEmployeeResult,
} from "../utils/employeeImportExport";

interface EmployeeManagerViewProps {
  employees: Employee[];
  onUpdateEmployees: (updated: Employee[]) => void;
  schoolName?: string;
}

export const EmployeeManagerView: React.FC<EmployeeManagerViewProps> = ({
  employees,
  onUpdateEmployees,
  schoolName = "SD Negeri 3 Loloan Timur",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPTK, setFilterPTK] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  // Export dropdown state
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Import modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedEmployeeResult | null>(null);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Click outside to close export dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(event.target as Node)
      ) {
        setIsExportDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  const handleLockAsDefaultPTK = async () => {
    try {
      await syncMasterDefaultsToServer({ employees });
      showToast(`✓ ${employees.length} Data Guru & PTK berhasil dikunci sebagai data bawaan resmi aplikasi (permanen setelah publish)!`, "success");
    } catch {
      showToast("Gagal menyimpan data ke server", "error");
    }
  };

  // Form state for single PTK
  const [formData, setFormData] = useState<Partial<Employee>>({
    nama: "",
    nip: "",
    pangkat: "",
    golongan: "",
    jabatan: "Guru Kelas",
    jenisPTK: "Guru Kelas",
    mapel: "",
    kelas: "",
    statusKepegawaian: "PPPK",
    jumlahJamAjar: 24,
    tugasTambahan: [],
  });

  const [tugasTambahanInput, setTugasTambahanInput] = useState("");

  const filtered = employees.filter((emp) => {
    const matchesSearch =
      emp.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.nip.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.jabatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.mapel.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      filterPTK === "ALL" ||
      (filterPTK === "GURU" && emp.jenisPTK.toLowerCase().includes("guru")) ||
      (filterPTK === "TENDIK" &&
        (emp.jenisPTK.toLowerCase().includes("tenaga") ||
          emp.jenisPTK.toLowerCase().includes("administrasi") ||
          emp.jenisPTK.toLowerCase().includes("pranata")));

    return matchesSearch && matchesFilter;
  });

  // Export handlers
  const handleExport = (type: "excel" | "csv" | "json") => {
    setIsExportDropdownOpen(false);
    try {
      if (type === "excel") {
        exportEmployeesToExcel(employees, schoolName);
        showToast(`Berhasil mengekspor ${employees.length} data guru ke format Excel (.xlsx)`);
      } else if (type === "csv") {
        exportEmployeesToCSV(employees, schoolName);
        showToast(`Berhasil mengekspor ${employees.length} data guru ke format CSV (.csv)`);
      } else if (type === "json") {
        exportEmployeesToJSON(employees, schoolName);
        showToast(`Cadangan data ${employees.length} guru berhasil diekspor ke format JSON`);
      }
    } catch (err: any) {
      console.error(err);
      showToast("Gagal melakukan ekspor: " + (err.message || "Kesalahan tak terduga"), "error");
    }
  };

  // Template download handler
  const handleDownloadTemplate = (format: "xlsx" | "csv") => {
    setIsExportDropdownOpen(false);
    try {
      downloadEmployeeTemplate(format);
      showToast(`Format template data guru (${format.toUpperCase()}) berhasil diunduh`);
    } catch (err: any) {
      console.error(err);
      showToast("Gagal mengunduh template: " + (err.message || "Kesalahan tak terduga"), "error");
    }
  };

  // Open import modal
  const handleOpenImportModal = () => {
    setImportFile(null);
    setParsedResult(null);
    setIsParsing(false);
    setImportMode("append");
    setSkipDuplicates(true);
    setIsImportModalOpen(true);
  };

  // Process file upload
  const handleFileProcess = async (file: File) => {
    setImportFile(file);
    setIsParsing(true);
    setParsedResult(null);

    try {
      const res = await parseEmployeesFromFile(file);
      setParsedResult(res);
      if (!res.success && res.errors.length > 0) {
        showToast(res.errors[0], "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast("Gagal membaca berkas: " + (err.message || "Format tidak didukung"), "error");
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  // Commit imported records
  const handleConfirmImport = () => {
    if (!parsedResult || !parsedResult.success || parsedResult.employees.length === 0) {
      return;
    }

    const importedList = parsedResult.employees;
    let finalEmployees: Employee[] = [];
    let countAdded = 0;
    let countSkipped = 0;

    if (importMode === "replace") {
      finalEmployees = importedList.map((emp, idx) => ({
        ...emp,
        no: idx + 1,
      }));
      countAdded = finalEmployees.length;
    } else {
      // Append mode
      if (skipDuplicates) {
        finalEmployees = [...employees];
        const existingNips = new Set(
          employees.map((e) => e.nip.replace(/[^0-9]/g, "")).filter(Boolean)
        );
        const existingNames = new Set(
          employees.map((e) => e.nama.trim().toLowerCase())
        );

        importedList.forEach((incoming) => {
          const cleanIncomingNip = incoming.nip.replace(/[^0-9]/g, "");
          const isNipDup = cleanIncomingNip && existingNips.has(cleanIncomingNip);
          const isNameDup = existingNames.has(incoming.nama.trim().toLowerCase());

          if (isNipDup || isNameDup) {
            countSkipped++;
          } else {
            finalEmployees.push(incoming);
            countAdded++;
            if (cleanIncomingNip) existingNips.add(cleanIncomingNip);
            existingNames.add(incoming.nama.trim().toLowerCase());
          }
        });

        // Re-number
        finalEmployees = finalEmployees.map((e, idx) => ({ ...e, no: idx + 1 }));
      } else {
        finalEmployees = [...employees, ...importedList].map((e, idx) => ({
          ...e,
          no: idx + 1,
        }));
        countAdded = importedList.length;
      }
    }

    onUpdateEmployees(finalEmployees);
    setIsImportModalOpen(false);

    if (importMode === "replace") {
      showToast(
        `Sukses! Seluruh data guru telah digantikan dengan ${countAdded} data dari berkas.`,
        "success"
      );
    } else {
      if (countSkipped > 0) {
        showToast(
          `Sukses! ${countAdded} data guru baru ditambahkan (${countSkipped} data duplikat dilewati).`,
          "success"
        );
      } else {
        showToast(`Sukses! ${countAdded} data guru berhasil ditambahkan ke daftar.`, "success");
      }
    }
  };

  const handleOpenAdd = () => {
    setEditingEmployee(null);
    setFormData({
      nama: "",
      nip: "",
      pangkat: "Ahli Pertama",
      golongan: "IX",
      jabatan: "Guru Kelas",
      jenisPTK: "Guru Kelas",
      mapel: "PPKn, Bhs. Indonesia, Matematika, IPAS, SBdP",
      kelas: "I",
      statusKepegawaian: "PPPK",
      jumlahJamAjar: 32,
      tugasTambahan: [],
    });
    setTugasTambahanInput("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({ ...emp });
    setTugasTambahanInput((emp.tugasTambahan || []).join(", "));
    setIsModalOpen(true);
  };

  const handleDeleteClick = (emp: Employee) => {
    setEmployeeToDelete(emp);
  };

  const handleConfirmDelete = () => {
    if (!employeeToDelete) return;
    const updated = employees
      .filter((e) => e.id !== employeeToDelete.id)
      .map((e, idx) => ({ ...e, no: idx + 1 }));
    onUpdateEmployees(updated);
    setEmployeeToDelete(null);
    showToast(`Data guru "${employeeToDelete.nama}" telah dihapus.`, "info");
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama) return;

    const parsedTugas = tugasTambahanInput
      ? tugasTambahanInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (editingEmployee) {
      const updated = employees.map((emp) =>
        emp.id === editingEmployee.id
          ? ({
              ...emp,
              ...formData,
              tugasTambahan: parsedTugas,
            } as Employee)
          : emp
      );
      onUpdateEmployees(updated);
      showToast(`Data guru "${formData.nama}" berhasil diperbarui.`);
    } else {
      const newEmp: Employee = {
        id: `emp-${Date.now()}`,
        no: employees.length + 1,
        nama: formData.nama || "",
        nip: formData.nip || "-",
        pangkat: formData.pangkat || "-",
        golongan: formData.golongan || "-",
        jabatan: formData.jabatan || "Guru",
        jenisPTK: formData.jenisPTK || "Guru Kelas",
        mapel: formData.mapel || "-",
        kelas: formData.kelas || "-",
        statusKepegawaian: (formData.statusKepegawaian as any) || "PPPK",
        jumlahJamAjar: Number(formData.jumlahJamAjar) || 0,
        tugasTambahan: parsedTugas,
      };
      onUpdateEmployees([...employees, newEmp]);
      showToast(`Guru baru "${newEmp.nama}" berhasil ditambahkan.`);
    }

    setIsModalOpen(false);
  };

  // Stats calculation
  const totalGuru = employees.filter((e) => e.jenisPTK.toLowerCase().includes("guru")).length;
  const totalTendik = employees.filter((e) => !e.jenisPTK.toLowerCase().includes("guru")).length;
  const totalJam = employees.reduce((acc, curr) => acc + (curr.jumlahJamAjar || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-fade-in transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : toast.type === "error"
              ? "bg-rose-50 text-rose-900 border-rose-200"
              : "bg-blue-50 text-blue-900 border-blue-200"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
          {toast.type === "error" && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
          {toast.type === "info" && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header & Stats Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm mb-1">
            <Users className="w-4 h-4" />
            <span>Database Pendidik & Tenaga Kependidikan (PTK)</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Daftar Guru & Tenaga Kependidikan Satuan Pendidikan
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Database ini menjadi sumber data otomatis saat menyusun Lampiran I (Pembagian Tugas
            Mengajar), Lampiran II (Wali Kelas & KKG), Lampiran III (Tenaga Kependidikan), serta
            Lampiran IV (Tugas Tambahan).
          </p>
        </div>

        {/* Action Button Group: Impor, Ekspor, Tambah */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Menu Impor */}
          <button
            id="btn-impor-ptk"
            onClick={handleOpenImportModal}
            className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold px-3.5 py-2.5 rounded-lg shadow-2xs transition-all cursor-pointer hover:border-slate-400"
            title="Impor data guru dari file Excel (.xlsx), CSV, atau JSON"
          >
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>Impor Data</span>
          </button>

          {/* Menu Ekspor Dropdown */}
          <div className="relative" ref={exportDropdownRef}>
            <button
              id="btn-ekspor-ptk"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold px-3.5 py-2.5 rounded-lg shadow-2xs transition-all cursor-pointer hover:border-slate-400"
              title="Ekspor data guru ke Excel, CSV, atau JSON"
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span>Ekspor Data</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {isExportDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 animate-fade-in text-xs">
                <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Opsi Ekspor Data Guru
                </div>

                <button
                  onClick={() => handleExport("excel")}
                  className="w-full text-left px-3.5 py-2 hover:bg-emerald-50/70 hover:text-emerald-800 flex items-center gap-2.5 text-slate-700 cursor-pointer transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-slate-800">Ekspor Excel (.xlsx)</p>
                    <p className="text-[10px] text-slate-500">Format tabel Microsoft Excel lengkap</p>
                  </div>
                </button>

                <button
                  onClick={() => handleExport("csv")}
                  className="w-full text-left px-3.5 py-2 hover:bg-blue-50/70 hover:text-blue-800 flex items-center gap-2.5 text-slate-700 cursor-pointer transition-colors"
                >
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-slate-800">Ekspor CSV (.csv)</p>
                    <p className="text-[10px] text-slate-500">Pemisah titik koma dengan UTF-8 BOM</p>
                  </div>
                </button>

                <button
                  onClick={() => handleExport("json")}
                  className="w-full text-left px-3.5 py-2 hover:bg-amber-50/70 hover:text-amber-800 flex items-center gap-2.5 text-slate-700 cursor-pointer transition-colors"
                >
                  <FileDown className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-slate-800">Cadangan JSON (.json)</p>
                    <p className="text-[10px] text-slate-500">Cadangan struktur data lengkap sistem</p>
                  </div>
                </button>

                <div className="my-1 border-t border-slate-100"></div>

                <div className="px-3 py-1 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Template Format Isi
                </div>

                <button
                  onClick={() => handleDownloadTemplate("xlsx")}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-600 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Unduh Template Excel (.xlsx)</span>
                </button>

                <button
                  onClick={() => handleDownloadTemplate("csv")}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-600 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Unduh Template CSV (.csv)</span>
                </button>
              </div>
            )}
          </div>

          {/* Tombol Kunci Jadi Bawaan Aplikasi */}
          <button
            id="btn-kunci-bawaan-ptk"
            onClick={handleLockAsDefaultPTK}
            title="Kunci seluruh daftar guru dan PTK ini sebagai data bawaan resmi aplikasi setelah dipublikasikan"
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold px-3 py-2.5 rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap"
          >
            <BookmarkCheck className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Kunci Bawaan Aplikasi</span>
            <span className="sm:hidden">Kunci Bawaan</span>
          </button>

          {/* Tombol Tambah PTK */}
          <button
            id="btn-tambah-ptk"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-xs transition-all cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah PTK Baru</span>
          </button>
        </div>
      </div>

      {/* Mini Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Guru Kelas & Mapel</p>
            <p className="text-lg font-bold text-slate-800">{totalGuru} Orang</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Tenaga Kependidikan / TU</p>
            <p className="text-lg font-bold text-slate-800">{totalTendik} Orang</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Beban Mengajar KBM</p>
            <p className="text-lg font-bold text-slate-800">{totalJam} Jam / Minggu</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="input-cari-ptk"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, NIP, jabatan, atau mapel..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 font-medium">Filter Jenis:</span>
          <select
            id="select-filter-ptk"
            value={filterPTK}
            onChange={(e) => setFilterPTK(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Semua PTK ({employees.length})</option>
            <option value="GURU">Guru ({totalGuru})</option>
            <option value="TENDIK">Tenaga Kependidikan ({totalTendik})</option>
          </select>
        </div>
      </div>

      {/* PTK Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3 w-12 text-center">No</th>
                <th className="py-3 px-4 min-w-[200px]">Nama Lengkap / NIP</th>
                <th className="py-3 px-3 min-w-[130px]">Pangkat / Golongan</th>
                <th className="py-3 px-3">Jabatan</th>
                <th className="py-3 px-3">Jenis PTK</th>
                <th className="py-3 px-3 min-w-[180px]">Mata Pelajaran</th>
                <th className="py-3 px-3 text-center">Kelas</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Beban Jam</th>
                <th className="py-3 px-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-sans">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-slate-300" />
                      <p>Tidak ditemukan data guru atau tenaga kependidikan yang sesuai.</p>
                      <button
                        onClick={handleOpenImportModal}
                        className="text-emerald-600 hover:text-emerald-700 font-semibold underline text-xs cursor-pointer"
                      >
                        Impor data guru dari Excel/CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((emp, index) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="py-3 px-3 text-center font-semibold text-slate-500">
                      {index + 1}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">{emp.nama}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {emp.nip && emp.nip !== "-"
                          ? emp.statusKepegawaian === "PPPK"
                            ? `NIPPPK. ${emp.nip}`
                            : `NIP. ${emp.nip}`
                          : "NIP. -"}
                      </p>
                      {emp.tugasTambahan && emp.tugasTambahan.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {emp.tugasTambahan.map((t, idx) => (
                            <span
                              key={idx}
                              className="bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded border border-emerald-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      <p className="font-medium">{emp.pangkat || "-"}</p>
                      <p className="text-[11px] text-slate-500">
                        {emp.golongan ? `Gol. ${emp.golongan}` : ""}
                      </p>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">{emp.jabatan}</td>
                    <td className="py-3 px-3">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                        {emp.jenisPTK}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 max-w-xs truncate" title={emp.mapel}>
                      {emp.mapel || "-"}
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-700">
                      {emp.kelas || "-"}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          emp.statusKepegawaian === "PNS"
                            ? "bg-blue-100 text-blue-800"
                            : emp.statusKepegawaian === "PPPK"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {emp.statusKepegawaian}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800">
                      {emp.jumlahJamAjar ? `${emp.jumlahJamAjar} Jam` : "-"}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          id={`btn-edit-ptk-${emp.id}`}
                          onClick={() => handleOpenEdit(emp)}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Edit PTK"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`btn-delete-ptk-${emp.id}`}
                          onClick={() => handleDeleteClick(emp)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          title="Hapus PTK"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Impor Data Guru & PTK */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <FileUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Impor Data Guru & Tenaga Kependidikan
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Unggah berkas spreadsheet Excel (.xlsx, .xls), CSV, atau file cadangan JSON
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template format bar */}
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-start gap-2 text-blue-900">
                <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Perlu Format Acuan Pengisian?</p>
                  <p className="text-[11px] text-blue-700">
                    Unduh file template resmi agar susunan kolom otomatis cocok saat diimpor.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate("xlsx")}
                  className="px-2.5 py-1.5 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Template Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate("csv")}
                  className="px-2.5 py-1.5 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Template CSV</span>
                </button>
              </div>
            </div>

            {/* Dropzone Upload */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-emerald-500 bg-emerald-50/60"
                  : importFile
                  ? "border-emerald-300 bg-emerald-50/20"
                  : "border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-400"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {isParsing ? (
                <div className="flex flex-col items-center justify-center py-4 text-slate-600 space-y-2">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  <p className="text-xs font-semibold">Sedang membaca dan memvalidasi berkas...</p>
                </div>
              ) : importFile && parsedResult ? (
                <div className="flex flex-col items-center justify-center py-2 space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{importFile.name}</p>
                    <p className="text-xs text-slate-500">
                      Ukuran: {(importFile.size / 1024).toFixed(1)} KB • Klik untuk mengganti berkas
                    </p>
                  </div>
                  {parsedResult.success && (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {parsedResult.validRows} Data Guru Valid Terdeteksi
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-3 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Klik untuk memilih berkas atau seret berkas ke sini
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Mendukung format Microsoft Excel (.xlsx, .xls), CSV, atau file JSON
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Result Preview & Strategy Options */}
            {parsedResult && parsedResult.success && parsedResult.employees.length > 0 && (
              <div className="space-y-4 text-xs">
                {/* Options: Mode Replace vs Append */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                  <p className="font-bold text-slate-900">Metode Penggabungan Data:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                        importMode === "append"
                          ? "bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-2xs"
                          : "bg-white/60 border-slate-200 hover:bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === "append"}
                        onChange={() => setImportMode("append")}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="font-bold text-slate-800">Gabungkan / Tambahkan Data</p>
                        <p className="text-[11px] text-slate-500">
                          Menambahkan data dari file ke daftar yang sudah ada tanpa menghapus data guru saat ini.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                        importMode === "replace"
                          ? "bg-white border-rose-500 ring-2 ring-rose-500/20 shadow-2xs"
                          : "bg-white/60 border-slate-200 hover:bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === "replace"}
                        onChange={() => setImportMode("replace")}
                        className="mt-0.5 text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <p className="font-bold text-rose-900">Gantikan Seluruh Data Lama</p>
                        <p className="text-[11px] text-slate-500">
                          Menghapus seluruh daftar PTK saat ini ({employees.length} guru) dan menggantikannya dengan isi file.
                        </p>
                      </div>
                    </label>
                  </div>

                  {importMode === "append" && (
                    <label className="flex items-center gap-2 pt-1 text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={(e) => setSkipDuplicates(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-medium">
                        Lewati baris jika NIP atau Nama guru sudah ada di sistem (cegah duplikasi)
                      </span>
                    </label>
                  )}
                </div>

                {/* Preview Table (5 rows) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-bold text-slate-800">
                      Tinjauan Data Terbaca ({parsedResult.employees.length} Guru):
                    </p>
                    <span className="text-[11px] text-slate-500">
                      Menampilkan sampel {Math.min(parsedResult.employees.length, 5)} data pertama
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                        <tr>
                          <th className="p-2 w-10 text-center">No</th>
                          <th className="p-2">Nama Lengkap</th>
                          <th className="p-2">NIP</th>
                          <th className="p-2">Jabatan / PTK</th>
                          <th className="p-2">Kelas</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Jam</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedResult.employees.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                            <td className="p-2 font-semibold text-slate-900">{row.nama}</td>
                            <td className="p-2 text-slate-600 font-mono text-[10px]">{row.nip}</td>
                            <td className="p-2 text-slate-600">{row.jabatan}</td>
                            <td className="p-2 text-slate-600">{row.kelas}</td>
                            <td className="p-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 font-bold">
                                {row.statusKepegawaian}
                              </span>
                            </td>
                            <td className="p-2 font-semibold text-slate-800">{row.jumlahJamAjar} Jam</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Warnings or skipped rows */}
                {parsedResult.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Catatan Pemeriksaan:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-[10px] mt-0.5">
                        {parsedResult.warnings.slice(0, 3).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                        {parsedResult.warnings.length > 3 && (
                          <li>Dan {parsedResult.warnings.length - 3} catatan lainnya...</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error Message if parsing failed */}
            {parsedResult && !parsedResult.success && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-rose-900">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Gagal Memproses Berkas</span>
                </div>
                {parsedResult.errors.map((err, i) => (
                  <p key={i} className="text-[11px] text-rose-700">
                    {err}
                  </p>
                ))}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-import-ptk"
                disabled={!parsedResult || !parsedResult.success || parsedResult.employees.length === 0}
                onClick={handleConfirmImport}
                className={`px-5 py-2 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-all ${
                  parsedResult && parsedResult.success && parsedResult.employees.length > 0
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {parsedResult && parsedResult.success
                    ? `Terapkan & Impor (${parsedResult.employees.length} Guru)`
                    : "Terapkan & Impor Data"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Add / Edit PTK */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>
                  {editingEmployee
                    ? "Edit Data Guru & Tenaga Kependidikan"
                    : "Tambah Guru & Tenaga Kependidikan"}
                </span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Lengkap & Gelar *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nama}
                    onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                    placeholder="Contoh: Ketut Wina Aristadyatmika, S.Pd"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    NIP / NIPPPK (isi - jika tidak ada)
                  </label>
                  <input
                    type="text"
                    value={formData.nip}
                    onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                    placeholder="Contoh: 199803232023211003"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Status Kepegawaian *
                  </label>
                  <select
                    value={formData.statusKepegawaian}
                    onChange={(e) =>
                      setFormData({ ...formData, statusKepegawaian: e.target.value as any })
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="PNS">PNS</option>
                    <option value="PPPK">PPPK</option>
                    <option value="Honorer Daerah">Honorer Daerah</option>
                    <option value="GTT">GTT (Guru Tidak Tetap)</option>
                    <option value="PTT">PTT (Pegawai Tidak Tetap)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pangkat</label>
                  <input
                    type="text"
                    value={formData.pangkat}
                    onChange={(e) => setFormData({ ...formData, pangkat: e.target.value })}
                    placeholder="Contoh: Ahli Pertama / Penata Muda"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Golongan Ruang
                  </label>
                  <input
                    type="text"
                    value={formData.golongan}
                    onChange={(e) => setFormData({ ...formData, golongan: e.target.value })}
                    placeholder="Contoh: IX / III/a"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jabatan *</label>
                  <input
                    type="text"
                    required
                    value={formData.jabatan}
                    onChange={(e) => setFormData({ ...formData, jabatan: e.target.value })}
                    placeholder="Contoh: Guru Kelas / Guru PJOK / TU"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jenis PTK *</label>
                  <select
                    value={formData.jenisPTK}
                    onChange={(e) => setFormData({ ...formData, jenisPTK: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="Guru Kelas">Guru Kelas</option>
                    <option value="Guru Mapel">Guru Mapel</option>
                    <option value="Guru Agama">Guru Agama</option>
                    <option value="Guru PJOK">Guru PJOK</option>
                    <option value="Tenaga Kependidikan">Tenaga Kependidikan</option>
                    <option value="Kepala Sekolah">Kepala Sekolah</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kelas Diampu
                  </label>
                  <input
                    type="text"
                    value={formData.kelas}
                    onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                    placeholder="Contoh: IV atau I-VI"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jumlah Jam Mengajar (Per Minggu)
                  </label>
                  <input
                    type="number"
                    value={formData.jumlahJamAjar}
                    onChange={(e) =>
                      setFormData({ ...formData, jumlahJamAjar: Number(e.target.value) })
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Mata Pelajaran yang Diampu
                  </label>
                  <input
                    type="text"
                    value={formData.mapel}
                    onChange={(e) => setFormData({ ...formData, mapel: e.target.value })}
                    placeholder="Contoh: PPKn, Bhs. Indonesia, Matematika, IPAS, SBdP, Bhs. Bali"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tugas Tambahan (Pisahkan dengan koma)
                  </label>
                  <input
                    type="text"
                    value={tugasTambahanInput}
                    onChange={(e) => setTugasTambahanInput(e.target.value)}
                    placeholder="Contoh: Wali Kelas IV, Bendahara BOS, Pembina Pramuka, KKG IV"
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="btn-simpan-modal-ptk"
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  Simpan PTK
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Delete PTK */}
      {employeeToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Konfirmasi Hapus Data PTK</h3>
                <p className="text-xs text-slate-500">Tindakan ini akan menghapus data guru/pegawai</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5 text-slate-700">
              <p>
                <span className="font-semibold text-slate-900">Nama Lengkap:</span>{" "}
                <span className="text-slate-950 font-bold">{employeeToDelete.nama}</span>
              </p>
              <p>
                <span className="font-semibold text-slate-900">NIP:</span> {employeeToDelete.nip || "-"}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Jabatan / PTK:</span>{" "}
                {employeeToDelete.jenisPTK} ({employeeToDelete.statusKepegawaian})
              </p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus data PTK ini dari daftar kepegawaian sekolah?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                id="btn-cancel-delete-ptk"
                onClick={() => setEmployeeToDelete(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-delete-ptk"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Data PTK</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
