import React from "react";
import {
  FileText,
  Building2,
  Users,
  Layers,
  FolderArchive,
  Bot,
  Settings,
  Sparkles,
  PlusCircle,
} from "lucide-react";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenNewSK: () => void;
  schoolName: string;
  headmasterName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewSK,
  schoolName,
  headmasterName,
}) => {
  const navItems = [
    { id: "generator", label: "⚡ Buat Draf SK (Ketik Judul)", icon: Sparkles, isSpecial: true },
    { id: "arsip", label: "📂 Daftar Draf SK", icon: FolderArchive },
    { id: "ptk", label: "👥 Data Guru/PTK", icon: Users },
    { id: "sekolah", label: "🏫 Profil & KOP Sekolah", icon: Building2 },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-sm print:hidden">
      {/* Top Identity Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-900/40 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                Sistem SK Kepala Sekolah SD
              </h1>
              <span className="hidden xs:inline-flex bg-emerald-500/20 text-emerald-300 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded font-medium border border-emerald-500/30 items-center gap-1 shrink-0">
                <Sparkles className="w-3 h-3" /> AI
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate max-w-[200px] sm:max-w-md">
              {schoolName} • KS: {headmasterName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-quick-new-sk"
            onClick={onOpenNewSK}
            className="flex items-center gap-1.5 sm:gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Buat SK Baru</span>
            <span className="sm:hidden">Buat SK</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="bg-slate-800/90 border-t border-slate-700/60 overflow-x-auto scrollbar-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex space-x-1 py-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? item.isSpecial
                      ? "bg-purple-600 text-white font-semibold"
                      : "bg-emerald-600 text-white font-semibold shadow-inner"
                    : item.isSpecial
                    ? "text-purple-300 hover:bg-purple-900/40 hover:text-purple-100"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "opacity-80"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
