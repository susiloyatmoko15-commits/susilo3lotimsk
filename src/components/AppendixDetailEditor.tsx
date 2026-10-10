import React, { useState } from "react";
import { Employee, SKAttachment } from "../types";
import {
  APPENDIX_PRESETS,
  AppendixPresetTemplate,
  createNewAppendix,
  addRowFromEmployee,
  addColumnToAppendix,
  removeColumnFromAppendix,
} from "../utils/skAppendixPresets";
import {
  Table,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Layers,
  Sparkles,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Edit2,
  Check,
  X,
  Copy,
  BookOpen,
  Info,
} from "lucide-react";

interface AppendixDetailEditorProps {
  lampiranList: SKAttachment[];
  onChange: (updatedList: SKAttachment[]) => void;
  employees: Employee[];
  kepalaSekolah?: any;
  schoolName?: string;
  isCompact?: boolean;
}

export const AppendixDetailEditor: React.FC<AppendixDetailEditorProps> = ({
  lampiranList,
  onChange,
  employees,
  kepalaSekolah,
  schoolName = "SD Negeri 3 Loloan Timur",
  isCompact = false,
}) => {
  const [activeAttIndex, setActiveAttIndex] = useState<number>(0);
  const [showPresetModal, setShowPresetModal] = useState<boolean>(false);
  const [showAddPTKModal, setShowAddPTKModal] = useState<boolean>(false);
  const [selectedPTKId, setSelectedPTKId] = useState<string>("");
  const [ptkCustomTugas, setPtkCustomTugas] = useState<string>("");
  const [newColName, setNewColName] = useState<string>("");
  const [showAddColInput, setShowAddColInput] = useState<boolean>(false);
  const [editingHeaderIdx, setEditingHeaderIdx] = useState<number | null>(null);
  const [headerDraftValue, setHeaderDraftValue] = useState<string>("");

  const currentAtt = lampiranList[activeAttIndex] || lampiranList[0];

  // Helper untuk update lampiran aktif
  const updateCurrentAtt = (updated: Partial<SKAttachment>) => {
    const newList = [...lampiranList];
    if (newList[activeAttIndex]) {
      newList[activeAttIndex] = { ...newList[activeAttIndex], ...updated };
      onChange(newList);
    }
  };

  // Tambah Lampiran Baru
  const handleAddNewAppendix = () => {
    const nextNum = `Lampiran ${lampiranList.length + 1}`;
    const newAtt = createNewAppendix(nextNum, `Rincian Lampiran ${lampiranList.length + 1}`);
    const newList = [...lampiranList, newAtt];
    onChange(newList);
    setActiveAttIndex(newList.length - 1);
  };

  // Hapus Lampiran
  const handleDeleteAppendix = (idx: number) => {
    if (lampiranList.length <= 1) {
      alert("Minimal dokumen memiliki satu lampiran.");
      return;
    }
    const newList = lampiranList.filter((_, i) => i !== idx);
    onChange(newList);
    if (activeAttIndex >= newList.length) {
      setActiveAttIndex(newList.length - 1);
    }
  };

  // Duplikasi Lampiran
  const handleDuplicateAppendix = (idx: number) => {
    const source = lampiranList[idx];
    const copyAtt: SKAttachment = {
      ...source,
      id: `att-${Date.now()}`,
      nomorLampiran: `Lampiran ${lampiranList.length + 1}`,
      judul: `${source.judul} (Salinan)`,
      rows: source.rows.map((r) => [...r]),
      headers: [...source.headers],
    };
    const newList = [...lampiranList, copyAtt];
    onChange(newList);
    setActiveAttIndex(newList.length - 1);
  };

  // Terapkan Template Preset
  const handleApplyPreset = (preset: AppendixPresetTemplate) => {
    if (!currentAtt) return;
    const generatedRows = preset.generateRows(employees, kepalaSekolah);
    updateCurrentAtt({
      judul: preset.judul,
      jenisLampiran: preset.jenisLampiran,
      headers: [...preset.headers],
      rows: generatedRows,
      footerNote: preset.footerNote,
    });
    setShowPresetModal(false);
  };

  // Ubah cell data baris
  const handleCellChange = (rowIdx: number, colIdx: number, value: string) => {
    if (!currentAtt) return;
    const newRows = currentAtt.rows.map((row, rI) => {
      if (rI !== rowIdx) return row;
      const newCols = [...row];
      newCols[colIdx] = value;
      return newCols;
    });
    updateCurrentAtt({ rows: newRows });
  };

  // Tambah baris kosong
  const handleAddEmptyRow = () => {
    if (!currentAtt) return;
    const newRowNumber = String(currentAtt.rows.length + 1);
    const newRow = currentAtt.headers.map((_, i) => (i === 0 ? newRowNumber : "-"));
    updateCurrentAtt({ rows: [...currentAtt.rows, newRow] });
  };

  // Tambah baris dari Guru/PTK terpilih
  const handleAddRowFromPTK = () => {
    if (!currentAtt || !selectedPTKId) return;
    const emp = employees.find((e) => e.id === selectedPTKId);
    if (!emp) return;

    const updated = addRowFromEmployee(currentAtt, emp, ptkCustomTugas);
    updateCurrentAtt(updated);
    setSelectedPTKId("");
    setPtkCustomTugas("");
    setShowAddPTKModal(false);
  };

  // Isi semua guru ke dalam tabel sekaligus
  const handleFillAllEmployees = () => {
    if (!currentAtt) return;
    if (employees.length === 0) {
      alert("Data guru belum tersedia.");
      return;
    }
    const confirmFill = window.confirm(
      `Tambahkan seluruh data (${employees.length} Guru/PTK) ke dalam tabel lampiran ini?`
    );
    if (!confirmFill) return;

    let updatedAtt = { ...currentAtt };
    employees.forEach((emp) => {
      updatedAtt = addRowFromEmployee(updatedAtt, emp);
    });
    updateCurrentAtt(updatedAtt);
  };

  // Hapus baris
  const handleDeleteRow = (rowIdx: number) => {
    if (!currentAtt) return;
    const updatedRows = currentAtt.rows
      .filter((_, i) => i !== rowIdx)
      .map((row, i) => {
        // Otomatis rapikan kembali nomor urut kolom pertama jika berupa angka
        const copy = [...row];
        if (copy[0] && !isNaN(Number(copy[0]))) {
          copy[0] = String(i + 1);
        }
        return copy;
      });
    updateCurrentAtt({ rows: updatedRows });
  };

  // Geser baris ke atas/bawah
  const handleMoveRow = (rowIdx: number, direction: "up" | "down") => {
    if (!currentAtt) return;
    const targetIdx = direction === "up" ? rowIdx - 1 : rowIdx + 1;
    if (targetIdx < 0 || targetIdx >= currentAtt.rows.length) return;

    const newRows = [...currentAtt.rows];
    const temp = newRows[rowIdx];
    newRows[rowIdx] = newRows[targetIdx];
    newRows[targetIdx] = temp;

    // Perbarui penomoran kolom 1
    const renumbered = newRows.map((row, i) => {
      const copy = [...row];
      if (copy[0] && !isNaN(Number(copy[0]))) {
        copy[0] = String(i + 1);
      }
      return copy;
    });

    updateCurrentAtt({ rows: renumbered });
  };

  // Tambah Kolom
  const handleAddColumn = () => {
    if (!newColName.trim() || !currentAtt) return;
    const updated = addColumnToAppendix(currentAtt, newColName.trim(), "-");
    updateCurrentAtt(updated);
    setNewColName("");
    setShowAddColInput(false);
  };

  // Hapus Kolom
  const handleDeleteColumn = (colIdx: number) => {
    if (!currentAtt) return;
    if (currentAtt.headers.length <= 2) {
      alert("Tabel wajib memiliki minimal 2 kolom.");
      return;
    }
    const updated = removeColumnFromAppendix(currentAtt, colIdx);
    updateCurrentAtt(updated);
  };

  // Edit Header
  const handleSaveHeader = (colIdx: number) => {
    if (!currentAtt || !headerDraftValue.trim()) {
      setEditingHeaderIdx(null);
      return;
    }
    const newHeaders = [...currentAtt.headers];
    newHeaders[colIdx] = headerDraftValue.trim();
    updateCurrentAtt({ headers: newHeaders });
    setEditingHeaderIdx(null);
    setHeaderDraftValue("");
  };

  if (!currentAtt) {
    return (
      <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <p className="text-xs text-slate-600">Belum ada lampiran pada SK ini.</p>
        <button
          onClick={handleAddNewAppendix}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Lampiran Pertama</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Header & Tab Lampiran Selector */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
              <Table className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Pengaturan Lampiran & Matriks Rincian Penugasan
              </h4>
              <p className="text-[11px] text-slate-500">
                Total {lampiranList.length} Lampiran Resmi • Menyesuaikan format dinas pendidikan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowPresetModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ganti Template Preset Resmi</span>
            </button>

            <button
              type="button"
              onClick={handleAddNewAppendix}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tambah Lampiran Baru</span>
            </button>
          </div>
        </div>

        {/* Tab Selector untuk Lampiran I, II, III, IV... */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 border-t border-slate-200/80">
          {lampiranList.map((att, idx) => {
            const isActive = idx === activeAttIndex;
            return (
              <div
                key={att.id || idx}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-emerald-700 text-white font-bold border-emerald-700 shadow-xs"
                    : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                }`}
                onClick={() => setActiveAttIndex(idx)}
              >
                <span>{att.nomorLampiran || `Lampiran ${idx + 1}`}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? "bg-emerald-800 text-emerald-100" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {att.rows.length} baris
                </span>

                {lampiranList.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAppendix(idx);
                    }}
                    title="Hapus lampiran ini"
                    className={`ml-1 p-0.5 rounded hover:bg-rose-500/20 text-rose-300 hover:text-white transition-colors ${
                      isActive ? "text-emerald-100" : "text-slate-400 hover:text-rose-600"
                    }`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Pengaturan Lampiran Aktif */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-2xs">
        {/* Baris Judul & Nomor */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Nomor Lampiran:
            </label>
            <input
              type="text"
              value={currentAtt.nomorLampiran}
              onChange={(e) => updateCurrentAtt({ nomorLampiran: e.target.value })}
              placeholder="Contoh: Lampiran I"
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Judul / Tentang Lampiran:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={currentAtt.judul}
                onChange={(e) => updateCurrentAtt({ judul: e.target.value })}
                placeholder="Contoh: Pembagian Tugas Guru Dalam Proses Pembelajaran"
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={() => handleDuplicateAppendix(activeAttIndex)}
                title="Duplikasi Lampiran Ini"
                className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Salin</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Toolbar untuk Manipulasi Tabel */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleAddEmptyRow}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-md font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>+ Tambah Baris Manual</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddPTKModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
              <span>+ Masukkan Guru / PTK</span>
            </button>

            <button
              type="button"
              onClick={handleFillAllEmployees}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 rounded-md font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Muat Seluruh Guru ({employees.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!showAddColInput ? (
              <button
                type="button"
                onClick={() => setShowAddColInput(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-semibold text-[11px] transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3 text-slate-500" />
                <span>Tambah Kolom</span>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddColumn();
                    if (e.key === "Escape") setShowAddColInput(false);
                  }}
                  placeholder="Nama kolom baru..."
                  className="p-1 px-2 border border-slate-300 rounded text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none w-36"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                  title="Simpan Kolom"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddColInput(false)}
                  className="p-1 text-slate-500 hover:bg-slate-200 rounded cursor-pointer"
                  title="Batal"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabel Data Dinamis dengan Kontrol Kolom & Baris */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[420px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100/90 text-slate-800 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
              <tr>
                {currentAtt.headers.map((header, colIdx) => (
                  <th
                    key={colIdx}
                    className="p-2.5 border-r border-slate-200 relative group min-w-[120px] first:min-w-[50px] first:text-center"
                  >
                    {editingHeaderIdx === colIdx ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={headerDraftValue}
                          onChange={(e) => setHeaderDraftValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveHeader(colIdx);
                            if (e.key === "Escape") setEditingHeaderIdx(null);
                          }}
                          className="w-full p-1 border border-emerald-400 rounded text-xs bg-white text-slate-900 outline-none font-normal"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveHeader(colIdx)}
                          className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{header}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingHeaderIdx(colIdx);
                              setHeaderDraftValue(header);
                            }}
                            className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-white rounded cursor-pointer"
                            title="Edit nama kolom"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {currentAtt.headers.length > 2 && colIdx !== 0 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteColumn(colIdx)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded cursor-pointer"
                              title="Hapus kolom ini"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </th>
                ))}
                <th className="p-2.5 w-16 text-center text-slate-500 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {currentAtt.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={currentAtt.headers.length + 1}
                    className="p-8 text-center text-slate-500 text-xs italic"
                  >
                    Tabel masih kosong. Klik "+ Tambah Baris Manual" atau "+ Masukkan Guru / PTK" di
                    atas.
                  </td>
                </tr>
              ) : (
                currentAtt.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/70 transition-colors">
                    {row.map((cellText, colIdx) => (
                      <td
                        key={colIdx}
                        className={`p-1.5 border-r border-slate-200 ${
                          colIdx === 0 ? "w-12 text-center" : ""
                        }`}
                      >
                        <textarea
                          rows={cellText.includes("\n") ? 2 : 1}
                          value={cellText}
                          onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                          className={`w-full p-1.5 rounded border border-transparent hover:border-slate-300 focus:border-emerald-500 focus:bg-white text-xs text-slate-900 resize-y outline-none transition-all ${
                            colIdx === 0
                              ? "text-center font-bold text-slate-600"
                              : colIdx === 1
                              ? "font-medium"
                              : ""
                          }`}
                        />
                      </td>
                    ))}

                    <td className="p-1.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => handleMoveRow(rowIdx, "up")}
                            disabled={rowIdx === 0}
                            className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                            title="Geser ke atas"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRow(rowIdx, "down")}
                            disabled={rowIdx === currentAtt.rows.length - 1}
                            className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                            title="Geser ke bawah"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(rowIdx)}
                          className="p-1 text-rose-400 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                          title="Hapus baris ini"
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

        {/* Catatan Kaki (Footer Note) Lampiran */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Catatan Kaki Tabel (Footer Note / Keterangan Total):
          </label>
          <input
            type="text"
            value={currentAtt.footerNote || ""}
            onChange={(e) => updateCurrentAtt({ footerNote: e.target.value })}
            placeholder="Contoh: Jumlah beban kerja telah memenuhi syarat pemenuhan sertifikasi 24-40 jam."
            className="w-full p-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* --- MODAL PILIH PRESET TEMPLATE RESMI --- */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Pilih Template Format Lampiran Resmi
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Pilih format tabel baku sesuai kebutuhan Surat Keputusan (SK)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
              {APPENDIX_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className="p-3 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 rounded-xl transition-all cursor-pointer space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono">
                        {preset.nomorLampiran}
                      </span>
                      {preset.judul}
                    </span>
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase">
                      {preset.categoryKey}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{preset.deskripsi}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {preset.headers.map((h, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL MASUKKAN GURU / PTK DARI DATABASE --- */}
      {showAddPTKModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                  <UserPlus className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Pilih Guru / PTK dari Database
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Data akan otomatis dimasukkan ke dalam baris tabel
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPTKModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih Guru / Tenaga Kependidikan:
                </label>
                <select
                  value={selectedPTKId}
                  onChange={(e) => setSelectedPTKId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">-- Pilih Guru/PTK --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nama} ({emp.nip && emp.nip !== "-" ? emp.nip : "Non-NIP"} - {emp.jabatan})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Uraian Penugasan / Peran Khusus (Opsional):
                </label>
                <input
                  type="text"
                  value={ptkCustomTugas}
                  onChange={(e) => setPtkCustomTugas(e.target.value)}
                  placeholder="Misal: Bendahara BOS, Koordinator Tim, Wali Kelas, dll."
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Kosongkan jika ingin menggunakan penugasan bawaan dari profil guru.
                </span>
              </div>
            </div>

            <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddPTKModal(false)}
                className="px-3.5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-semibold text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleAddRowFromPTK}
                disabled={!selectedPTKId}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold text-xs shadow-xs"
              >
                Tambahkan ke Tabel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
