import React, { useState, useEffect } from "react";
import {
  SchoolProfile,
  Employee,
  SKDocument,
  NumberingConfig,
} from "./types";
import {
  initialSchoolProfile,
  initialEmployees,
  sampleSKDocuments,
  initialNumberingConfig,
} from "./data/initialData";
import {
  defaultKopSuratSDN3LoloanTimur,
  defaultKopSuratVector,
} from "./data/defaultKopImage";
import { Navbar } from "./components/Navbar";
import { QuickSKGeneratorView } from "./components/QuickSKGeneratorView";
import { SchoolProfileView } from "./components/SchoolProfileView";
import { EmployeeManagerView } from "./components/EmployeeManagerView";
import { SKPreviewView } from "./components/SKPreviewView";
import { SKArchiveView } from "./components/SKArchiveView";
import { SettingsView } from "./components/SettingsView";
import { generateNextSKNumber } from "./utils/numberGenerator";
import { cleanSKJudul } from "./utils/skFormatter";
import {
  safeGetItem,
  safeSetItem,
  cleanupLegacyStorageBloat,
  loadActiveKopImage,
  saveActiveKopImage,
  saveDefaultSKParams,
  syncMasterDefaultsToServer,
  fetchServerMasterDefaults,
} from "./utils/storage";

const getSavedMasterDefault = () => {
  const custom = safeGetItem("sd_custom_default_data");
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) {
      console.error(e);
    }
  }
  return null;
};

export default function App() {
  // --- Persistent States from LocalStorage or Defaults ---
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile>(() => {
    let profile: SchoolProfile | null = null;
    const saved = safeGetItem("sd_school_profile");
    if (saved) {
      try {
        profile = JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    if (!profile) {
      const master = getSavedMasterDefault();
      if (master?.schoolProfile) profile = master.schoolProfile;
    }
    if (!profile) {
      profile = { ...initialSchoolProfile };
    }

    // Prioritaskan gambar kop yang diunggah pengguna sebagai contoh default bawaan
    const savedDefaultKop = safeGetItem("sd_default_kop_surat");
    let activeKop =
      (savedDefaultKop && !savedDefaultKop.startsWith("indexeddb:") ? savedDefaultKop : null) ||
      (profile.kopSuratUrl && !profile.kopSuratUrl.startsWith("indexeddb:")
        ? profile.kopSuratUrl
        : null) ||
      defaultKopSuratSDN3LoloanTimur ||
      initialSchoolProfile.kopSuratUrl;

    // Jika activeKop masih berupa vector SVG lama dan sudah ada kop resmi PNG yang diunggah, utamakan kop resmi PNG
    if (
      (!activeKop || activeKop === defaultKopSuratVector || activeKop.startsWith("indexeddb:") || activeKop.includes("image/svg+xml")) &&
      defaultKopSuratSDN3LoloanTimur
    ) {
      activeKop = defaultKopSuratSDN3LoloanTimur;
    }

    if (activeKop) {
      profile = {
        ...profile,
        kopSuratUrl: activeKop,
        kopMode: "gambar",
      };
    }
    return profile;
  });

  // Pembersihan bloat storage, muat kop dari IndexedDB, dan sinkronisasi data bawaan ke server
  useEffect(() => {
    cleanupLegacyStorageBloat();
    loadActiveKopImage(defaultKopSuratSDN3LoloanTimur).then((activeKop) => {
      const kopToUse =
        activeKop && activeKop !== "indexeddb:active" ? activeKop : defaultKopSuratSDN3LoloanTimur;
      if (activeKop && activeKop !== "indexeddb:active") {
        setSchoolProfile((prev) => ({
          ...prev,
          kopSuratUrl: activeKop,
          kopMode: "gambar",
        }));
      }

      // Otomatis sinkronkan kop surat dan seluruh data sekolah & PTK ke backend filesystem
      // agar saat dipublikasikan (publish), seluruh data bawaan tetap paten tidak berubah
      syncMasterDefaultsToServer({
        schoolProfile: {
          ...schoolProfile,
          kopSuratUrl: kopToUse,
        },
        employees,
        numberingConfig,
        documents,
        kopSuratUrl: kopToUse,
      }).catch(() => {});
    });
  }, []);

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = safeGetItem("sd_employees");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const hasOldDummy =
          Array.isArray(parsed) &&
          (parsed.some((e: any) => e.nama?.includes("Sisilia Karvila")) || parsed.length < 11);
        if (!hasOldDummy && Array.isArray(parsed) && parsed.length >= 11) {
          return parsed;
        }
      } catch (e) {
        console.error(e);
      }
    }
    const master = getSavedMasterDefault();
    if (master?.employees && master.employees.length >= 11) return master.employees;
    return initialEmployees;
  });

  const [documents, setDocuments] = useState<SKDocument[]>(() => {
    const saved = safeGetItem("sd_sk_documents");
    if (saved) {
      try {
        const parsed: SKDocument[] = JSON.parse(saved);
        const hasOldDummy =
          Array.isArray(parsed) &&
          parsed.some((d) =>
            JSON.stringify(d.lampiranList || []).includes("Sisilia Karvila")
          );
        if (!hasOldDummy && Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((d) => ({
            ...d,
            judul: cleanSKJudul(d.judul, d.tahunAjaran),
          }));
        }
      } catch (e) {
        console.error(e);
      }
    }
    const master = getSavedMasterDefault();
    if (master?.documents) {
      return master.documents.map((d: SKDocument) => ({
        ...d,
        judul: cleanSKJudul(d.judul, d.tahunAjaran),
      }));
    }
    return sampleSKDocuments.map((d) => ({
      ...d,
      judul: cleanSKJudul(d.judul, d.tahunAjaran),
    }));
  });

  const [numberingConfig, setNumberingConfig] = useState<NumberingConfig>(() => {
    const saved = safeGetItem("sd_numbering_config");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    const master = getSavedMasterDefault();
    if (master?.numberingConfig) return master.numberingConfig;
    return initialNumberingConfig;
  });

  // Navigation & Sub-views: Terfokus 100% pada Generator Kilat Judul -> Docx
  const [activeTab, setActiveTab] = useState<string>("generator");
  const [archiveFilterStatus, setArchiveFilterStatus] = useState<string>("ALL");
  const [previewingDoc, setPreviewingDoc] = useState<SKDocument | null>(null);
  const [generatorDoc, setGeneratorDoc] = useState<SKDocument | null>(null);

  // Sync to LocalStorage & IndexedDB safely
  useEffect(() => {
    safeSetItem("sd_school_profile", JSON.stringify(schoolProfile));
    // Hanya simpan ke IndexedDB jika kop bukan penanda ringan dan BUKAN placeholder SVG awal
    // agar gambar unggahan pengguna tidak pernah tertimpa oleh placeholder default.
    if (
      schoolProfile.kopSuratUrl &&
      !schoolProfile.kopSuratUrl.startsWith("indexeddb:") &&
      schoolProfile.kopSuratUrl !== initialSchoolProfile.kopSuratUrl
    ) {
      saveActiveKopImage(schoolProfile.kopSuratUrl);
    }
  }, [schoolProfile]);

  useEffect(() => {
    safeSetItem("sd_employees", JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    safeSetItem("sd_sk_documents", JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    safeSetItem("sd_numbering_config", JSON.stringify(numberingConfig));
  }, [numberingConfig]);

  // Handlers
  const handleOpenNewSK = () => {
    setPreviewingDoc(null);
    setGeneratorDoc(null);
    setActiveTab("generator");
  };

  const handlePreviewSK = (doc: SKDocument) => {
    setPreviewingDoc(doc);
  };

  const handleEditSK = (doc: SKDocument) => {
    setPreviewingDoc(null);
    setGeneratorDoc(doc);
    setActiveTab("generator");
  };

  const handleDuplicateSK = (doc: SKDocument) => {
    const nextNum = generateNextSKNumber(numberingConfig).formattedNumber;
    const duplicated: SKDocument = {
      ...doc,
      id: `sk-${Date.now()}`,
      nomor: nextNum,
      judul: `${doc.judul} (Salinan)`,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDocuments((prev) => [duplicated, ...prev]);
    setNumberingConfig((prev) => ({
      ...prev,
      lastNumber: prev.lastNumber + 1,
    }));
    handlePreviewSK(duplicated);
  };

  const handleDeleteSK = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (previewingDoc?.id === id) {
      setPreviewingDoc(null);
    }
  };

  const handleSaveDraftToArchive = (doc: SKDocument) => {
    const cleanDoc: SKDocument = {
      ...doc,
      judul: cleanSKJudul(doc.judul, doc.tahunAjaran),
    };
    // Otomatis simpan nilai isian tahun ajaran, tanggal penetapan, dan memperhatikan sebagai data bawaan
    saveDefaultSKParams({
      tahunAjaran: cleanDoc.tahunAjaran,
      tanggalTetap: cleanDoc.tanggalTetap,
      tempatTetap: cleanDoc.tempatTetap,
      tanggalRapat: cleanDoc.tanggalRapat || cleanDoc.memperhatikan,
      memperhatikan: cleanDoc.memperhatikan,
    });
    // Check if doc already exists
    const exists = documents.some((d) => d.id === cleanDoc.id);
    if (exists) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === cleanDoc.id ? { ...cleanDoc, status: "published" } : d))
      );
    } else {
      setDocuments((prev) => [{ ...cleanDoc, status: "published" }, ...prev]);
      setNumberingConfig((prev) => ({
        ...prev,
        lastNumber: prev.lastNumber + 1,
      }));
    }
  };

  const handleRestoreData = async (restored: {
    schoolProfile: SchoolProfile;
    employees: Employee[];
    documents: SKDocument[];
    numberingConfig: NumberingConfig;
  }) => {
    let finalProfile = { ...restored.schoolProfile };
    if (!finalProfile.kopSuratUrl || finalProfile.kopSuratUrl.startsWith("indexeddb:")) {
      const activeKop = await loadActiveKopImage(initialSchoolProfile.kopSuratUrl);
      if (activeKop && activeKop !== "indexeddb:active") {
        finalProfile.kopSuratUrl = activeKop;
        finalProfile.kopMode = "gambar";
      }
    }
    setSchoolProfile(finalProfile);
    setEmployees(restored.employees);
    setDocuments(restored.documents);
    setNumberingConfig(restored.numberingConfig);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setPreviewingDoc(null);
          setActiveTab(tab);
        }}
        onOpenNewSK={handleOpenNewSK}
        schoolName={schoolProfile.nama}
        headmasterName={schoolProfile.kepalaSekolah.nama}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8">
        {previewingDoc ? (
          /* Pratinjau SK Format A4 Resmi dengan Download Word */
          <SKPreviewView
            document={previewingDoc}
            schoolProfile={schoolProfile}
            employees={employees}
            onEdit={handleEditSK}
            onBack={() => setPreviewingDoc(null)}
            onSaveToArchive={handleSaveDraftToArchive}
          />
        ) : (
          /* Active Views */
          <>
            {activeTab === "generator" && (
              <QuickSKGeneratorView
                schoolProfile={schoolProfile}
                employees={employees}
                numberingConfig={numberingConfig}
                initialDoc={generatorDoc}
                onSaveToArchive={handleSaveDraftToArchive}
                onNavigateToArchive={() => {
                  setPreviewingDoc(null);
                  setActiveTab("arsip");
                }}
                onOpenEmployeeManager={() => {
                  setPreviewingDoc(null);
                  setActiveTab("ptk");
                }}
                onOpenSchoolProfile={() => {
                  setPreviewingDoc(null);
                  setActiveTab("sekolah");
                }}
              />
            )}

            {activeTab === "arsip" && (
              <div className="space-y-6">
                <SKArchiveView
                  documents={documents}
                  schoolProfile={schoolProfile}
                  initialFilterStatus={archiveFilterStatus}
                  onPreviewSK={handlePreviewSK}
                  onEditSK={handleEditSK}
                  onDuplicateSK={handleDuplicateSK}
                  onDeleteSK={handleDeleteSK}
                  onOpenNewSK={handleOpenNewSK}
                />
              </div>
            )}

            {activeTab === "ptk" && (
              <EmployeeManagerView
                employees={employees}
                onUpdateEmployees={(updated) => {
                  setEmployees(updated);
                  safeSetItem("sd_employees", JSON.stringify(updated));
                  syncMasterDefaultsToServer({
                    employees: updated,
                  }).catch(() => {});
                }}
                schoolName={schoolProfile.nama}
              />
            )}

            {activeTab === "sekolah" && (
              <SchoolProfileView
                profile={schoolProfile}
                onSave={(updated) => {
                  setSchoolProfile(updated);
                  safeSetItem("sd_school_profile", JSON.stringify(updated));
                  if (updated.kopSuratUrl) {
                    safeSetItem("sd_default_kop_surat", updated.kopSuratUrl);
                  }
                  syncMasterDefaultsToServer({
                    schoolProfile: updated,
                    kopSuratUrl: updated.kopSuratUrl,
                  }).catch(() => {});
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="no-print print:hidden bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <p>
          Sistem Dokumen Surat Keputusan (SK) Kepala Sekolah Dasar • {schoolProfile.nama} •
          Didukung Ekspor Microsoft Word (.docx)
        </p>
      </footer>
    </div>
  );
}
