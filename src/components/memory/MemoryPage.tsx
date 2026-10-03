import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LifeStageCategory, RecordField, DocumentItem, OCRDocumentResult } from '../../types';
import { initialRecords, initialDocuments } from '../../data/mockData';
import { fetchRecordsFromBackend, fetchDocumentsFromBackend, addClaimToBackend, uploadDocumentToBackend, confirmDocumentClaims, clearMemoryStore } from '../../lib/api';
import { runLocalOcr } from '../../lib/ocrClient';
import { StatusBadge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { ObsidianGraphView } from './ObsidianGraphView';
import { useNavigation } from '../../context/NavigationContext';
import {
  Database,
  FileText,
  Layers,
  Sparkles,
  Plus,
  UploadCloud,
  Fingerprint,
  GraduationCap,
  Briefcase,
  Wallet,
  HeartPulse,
  Search,
  FileCheck,
  Network,
  LayoutGrid,
  Copy,
  Check,
  X,
  Loader2,
  Eye,
  ShieldCheck,
  MessageSquare,
  AlertTriangle,
  Cpu,
} from 'lucide-react';

type ViewMode = 'graph' | 'cards' | 'documents';
type OCRRecordField = RecordField & { ocrDocument: OCRDocumentResult };
type LocalDocument = DocumentItem & { fileUrl: string; ocrResult: OCRDocumentResult };

export interface ProposedClaimItem {
  field: string;
  value: string;
  originalValue: string;
  confidence: number;
  category: LifeStageCategory;
  sourceRegion?: { page?: number };
  extractionMethod?: string;
  status: string;
  assuranceLevel: string;
  conflictInfo?: {
    fieldName: string;
    existingValue: string;
    conflictingValue: string;
  };
  isSingular?: boolean;
  isSensitive?: boolean;
  rawNumericValue?: number;
  accepted: boolean;
}

export interface DocumentProposalState {
  documentId: string;
  fileName: string;
  fileSize: string;
  sha256Hash: string;
  documentType: string;
  provider: string;
  model: string;
  status: string;
  claims: ProposedClaimItem[];
}

export const MemoryPage: React.FC = () => {
  const { navigate } = useNavigation();
  const [records, setRecords] = useState<RecordField[]>(() => {
    try {
      const cached = localStorage.getItem('syndeo_vault_records');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore localStorage read error
    }
    return [];
  });
  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    try {
      const cached = localStorage.getItem('syndeo_vault_documents');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore localStorage read error
    }
    return [];
  });
  const [localDocuments, setLocalDocuments] = useState<LocalDocument[]>([]);
  const [ocrRecords, setOcrRecords] = useState<OCRRecordField[]>([]);
  const localFileUrls = useRef<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<LifeStageCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedOcrRecord, setSelectedOcrRecord] = useState<OCRRecordField | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<RecordField | null>(null);
  const [isProvenanceModalOpen, setIsProvenanceModalOpen] = useState(false);
  const [isOcrViewerOpen, setIsOcrViewerOpen] = useState(false);
  const [isLoadingVault, setIsLoadingVault] = useState<boolean>(true);

  // Hugging Face Extraction Proposal Review State
  const [currentProposal, setCurrentProposal] = useState<DocumentProposalState | null>(null);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState<boolean>(false);
  const [isProcessingHf, setIsProcessingHf] = useState<boolean>(false);
  const [isSavingConfirmedClaims, setIsSavingConfirmedClaims] = useState<boolean>(false);

  // Sync state changes with localStorage
  useEffect(() => {
    if (records && records.length > 0) {
      try {
        localStorage.setItem('syndeo_vault_records', JSON.stringify(records));
      } catch {
        // Ignore localStorage write error
      }
    }
  }, [records]);

  useEffect(() => {
    if (documents && documents.length > 0) {
      try {
        localStorage.setItem('syndeo_vault_documents', JSON.stringify(documents));
      } catch {
        // Ignore localStorage write error
      }
    }
  }, [documents]);

  // Sync with live Neo4j backend graph store
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        setIsLoadingVault(true);
        // 1. Fetch live claims from Neo4j Aura
        const backendRecs = await fetchRecordsFromBackend();
        if (active && backendRecs && Array.isArray(backendRecs) && backendRecs.length > 0) {
          setRecords(backendRecs);
        }

        // 2. Fetch live documents
        const backendDocs = await fetchDocumentsFromBackend();
        if (active && backendDocs && Array.isArray(backendDocs) && backendDocs.length > 0) {
          setDocuments(backendDocs);
        }
      } finally {
        if (active) {
          setIsLoadingVault(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleClearVault = async () => {
    if (!window.confirm('Are you sure you want to clear your Personal Memory Store? All claims and documents will be wiped from Neo4j Aura.')) {
      return;
    }
    setRecords([]);
    setDocuments([]);
    setLocalDocuments([]);
    setOcrRecords([]);
    try {
      localStorage.removeItem('syndeo_vault_records');
      localStorage.removeItem('syndeo_vault_documents');
    } catch {
      // Ignore localStorage remove error
    }
    await clearMemoryStore();
  };

  const handleLoadDemoVault = () => {
    setRecords(initialRecords);
    setDocuments(initialDocuments);
    try {
      localStorage.setItem('syndeo_vault_records', JSON.stringify(initialRecords));
      localStorage.setItem('syndeo_vault_documents', JSON.stringify(initialDocuments));
    } catch {
      // Ignore localStorage write error
    }
  };


  // Modals state
  const [isAddInfoOpen, setIsAddInfoOpen] = useState<boolean>(false);
  const [isUploadDocOpen, setIsUploadDocOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOverPage, setIsDragOverPage] = useState<boolean>(false);
  const [isDragOverModal, setIsDragOverModal] = useState<boolean>(false);
  const pageDragCounterRef = useRef<number>(0);
  const modalDragCounterRef = useRef<number>(0);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<LifeStageCategory>('education');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRDocumentResult | null>(null);
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  // Global window drag prevention to ensure reliable file drops without browser navigating
  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const handlePageDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pageDragCounterRef.current += 1;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOverPage(true);
  };

  const handlePageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isDragOverPage) setIsDragOverPage(true);
  };

  const handlePageDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pageDragCounterRef.current -= 1;
    if (pageDragCounterRef.current <= 0) {
      pageDragCounterRef.current = 0;
      setIsDragOverPage(false);
    }
  };

  const handlePageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pageDragCounterRef.current = 0;
    setIsDragOverPage(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        setSelectedFile(null);
        setUploadError('Choose a file that is 25 MB or smaller.');
        setIsUploadDocOpen(true);
        return;
      }
      setSelectedFile(file);
      setUploadError(null);
      setOcrResult(null);
      setIsUploadDocOpen(true);
    }
  };

  // Add Info Form state
  const [newCategory, setNewCategory] = useState<LifeStageCategory>('identity');
  const [newFieldName, setNewFieldName] = useState<string>('');
  const [newValue, setNewValue] = useState<string>('');
  const [newSourceType, setNewSourceType] = useState<'Confirmed by you' | 'Extracted from document'>('Confirmed by you');

  useEffect(() => () => {
    localFileUrls.current.forEach((fileUrl) => URL.revokeObjectURL(fileUrl));
  }, []);

  const categories: { id: LifeStageCategory; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'identity', label: 'Identity', icon: Fingerprint },
    { id: 'education', label: 'Education', icon: GraduationCap },
    { id: 'employment', label: 'Employment', icon: Briefcase },
    { id: 'finance', label: 'Finance', icon: Wallet },
    { id: 'healthcare', label: 'Healthcare', icon: HeartPulse },
  ];

  const filteredRecords = records.filter((r) => {
    const matchesCategory = selectedCategory === 'all' || r.category === selectedCategory;
    const matchesSearch =
      r.fieldName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.evidenceDocName && r.evidenceDocName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const filteredOcrRecords = ocrRecords.filter((record) => {
    const matchesCategory = selectedCategory === 'all' || record.category === selectedCategory;
    const matchesSearch = record.fieldName.toLowerCase().includes(searchQuery.toLowerCase())
      || record.value.toLowerCase().includes(searchQuery.toLowerCase())
      || Boolean(record.evidenceDocName?.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });
  const allRecords = [...filteredOcrRecords, ...filteredRecords];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim() || !newValue.trim()) return;

    const newRecord: RecordField = {
      id: `rec-${Date.now()}`,
      category: newCategory,
      fieldName: newFieldName,
      value: newValue,
      source: newSourceType,
      lastUpdated: 'Just now',
      confidence: newSourceType === 'Extracted from document' ? 'evidence-backed' : 'user-confirmed',
    };

    setRecords((prev) => [newRecord, ...prev.filter((p) => p.fieldName.trim().toLowerCase() !== newFieldName.trim().toLowerCase() || p.category !== newCategory)]);
    setIsAddInfoOpen(false);
    setNewFieldName('');
    setNewValue('');

    // Persist to backend graph store
    const res = await addClaimToBackend({
      category: newCategory,
      fieldName: newFieldName,
      value: newValue,
      source: newSourceType,
    });

    if (res && res.record) {
      setRecords((prev) => [res.record, ...prev.filter((p) => p.id !== res.record.id && (p.fieldName.trim().toLowerCase() !== res.record.fieldName.trim().toLowerCase() || p.category !== res.record.category))]);
    }
  };

  const visibleDocuments = [...localDocuments, ...documents];

  return (
    <div
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
      className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 text-zinc-900 dark:text-[#f4f4f6] relative"
    >
      {/* Page-Wide Drag & Drop Visual Overlay */}
      <AnimatePresence>
        {isDragOverPage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="fixed inset-0 z-50 m-4 bg-white/95 dark:bg-[#07060f]/95 border-2 border-dashed border-[#5a25eb] dark:border-[#8b5cf6] shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center pointer-events-none rounded-3xl"
          >
            <div className="w-16 h-16 rounded-full bg-[#5a25eb]/10 dark:bg-[#5a25eb]/20 text-[#5a25eb] dark:text-[#cbbeff] flex items-center justify-center mb-4 shadow-lg animate-bounce">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              Drop Document to Ingest into Memory Vault
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
              Release anywhere to extract structured claims from PDF, Word (.docx), or Image files.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-[#5a25eb]/10 text-[#5a25eb] dark:text-[#cbbeff] border border-[#5a25eb]/20">
              PDF • DOCX • PNG • JPG • WEBP
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Clean Minimal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-[#181820] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Personal Memory Store
            </h1>
            <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-[#5a25eb]/10 dark:bg-[#5a25eb]/20 text-[#5a25eb] dark:text-[#cbbeff] border border-[#5a25eb]/30">
              Encrypted
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-[#8c879a] mt-0.5">
            5 life stages indexed with verified proofs and Obsidian knowledge graph.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={records.length > 0 ? handleClearVault : handleLoadDemoVault}
            title={records.length > 0 ? 'Reset vault and wipe all records' : 'Load sample demo claims and documents'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-[#14141e] hover:bg-zinc-200 dark:hover:bg-[#1c1c28] border border-zinc-200 dark:border-[#272736] text-xs font-medium text-zinc-700 dark:text-[#cbbeff] transition-colors cursor-pointer shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{records.length > 0 ? 'Reset Vault' : 'Load Demo Vault'}</span>
          </button>
          <button
            onClick={() => setIsAddInfoOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-[#14141e] hover:bg-zinc-200 dark:hover:bg-[#1c1c28] border border-zinc-200 dark:border-[#272736] text-xs font-medium text-zinc-800 dark:text-[#e4e1e8] transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#5a25eb] dark:text-[#cbbeff]" />
            <span>Add Info</span>
          </button>
          <button
            onClick={() => {
              setUploadError(null);
              setIsUploadDocOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-medium transition-all shadow-xs cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload Doc</span>
          </button>
        </div>
      </div>

      {/* Minimal Top Stats Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="p-3 rounded-2xl border border-zinc-200 dark:border-[#1c1c28] bg-white dark:bg-[#07070a] shadow-2xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span>Records</span>
            <Database className="w-3.5 h-3.5 text-[#5a25eb] dark:text-[#cbbeff]" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">{records.length}</p>
        </div>

        <div className="p-3 rounded-2xl border border-zinc-200 dark:border-[#1c1c28] bg-white dark:bg-[#07070a] shadow-2xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span>Source Docs</span>
            <FileText className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">{visibleDocuments.length}</p>
        </div>

        <div className="p-3 rounded-2xl border border-zinc-200 dark:border-[#1c1c28] bg-white dark:bg-[#07070a] shadow-2xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span>Categories</span>
            <Layers className="w-3.5 h-3.5 text-cyan-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">5 Active</p>
        </div>

        <div className="p-3 rounded-2xl border border-zinc-200 dark:border-[#1c1c28] bg-white dark:bg-[#07070a] shadow-2xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span>Graph Neural</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">Synced</p>
        </div>
      </div>

      {/* View Mode Switcher & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-zinc-200 dark:border-[#181820] pb-3">
        <div className="inline-flex items-center p-0.5 rounded-full bg-zinc-100 dark:bg-[#12121c] border border-zinc-200 dark:border-[#222230] shadow-inner max-w-full overflow-x-auto scrollbar-none">
          <button
            onClick={() => setViewMode('graph')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              viewMode === 'graph'
                ? 'bg-[#5a25eb] text-white shadow-xs'
                : 'text-zinc-600 dark:text-[#8c879a] hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Obsidian Graph</span>
          </button>

          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-[#5a25eb] text-white shadow-xs'
                : 'text-zinc-600 dark:text-[#8c879a] hover:text-zinc-900 dark:hover:text-white'
            }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards Grid ({allRecords.length})</span>
              </button>

          <button
            onClick={() => setViewMode('documents')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              viewMode === 'documents'
                ? 'bg-[#5a25eb] text-white shadow-xs'
                : 'text-zinc-600 dark:text-[#8c879a] hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Evidence Files ({visibleDocuments.length})</span>
          </button>
        </div>

        {viewMode !== 'graph' && (
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 rounded-full bg-zinc-50 dark:bg-[#12121a] border border-zinc-200 dark:border-[#222230] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-[#5a25eb]"
            />
          </div>
        )}
      </div>

      {/* VIEW 1: OBSIDIAN GRAPH VIEW */}
      {viewMode === 'graph' && (
        <ObsidianGraphView
          records={allRecords}
          documents={visibleDocuments}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onOpenAddModal={() => setIsAddInfoOpen(true)}
          isLoading={isLoadingVault}
        />
      )}

      {/* VIEW 2: CARDS GRID */}
      {viewMode === 'cards' && (
        <div className="space-y-4">
          {/* Scrollable Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-[#5a25eb] text-white font-semibold'
                  : 'bg-zinc-100 dark:bg-[#12121a] text-zinc-600 dark:text-[#a29db0] hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              All ({records.length + ocrRecords.length})
            </button>
            {categories.map((cat) => {
              const Icon = cat.icon;
              const count = records.filter((r) => r.category === cat.id).length
                + ocrRecords.filter((r) => r.category === cat.id).length;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-[#5a25eb] text-white font-semibold'
                      : 'bg-zinc-100 dark:bg-[#12121a] text-zinc-600 dark:text-[#a29db0] hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cat.label}</span>
                  <span className="text-[10px] opacity-75 font-mono">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allRecords.map((record) => {
              const catMeta = categories.find((c) => c.id === record.category);
              const Icon = catMeta?.icon || FileText;

              return (
                <div
                  key={record.id}
                  onClick={() => {
                    const ocrRecord = ocrRecords.find((item) => item.id === record.id);
                    if (ocrRecord) {
                      setSelectedOcrRecord(ocrRecord);
                      setIsOcrViewerOpen(true);
                    } else {
                      setSelectedClaim(record);
                      setIsProvenanceModalOpen(true);
                    }
                  }}
                  className="p-4 rounded-2xl border border-zinc-200 dark:border-[#1c1c28] bg-white dark:bg-[#07070a] hover:border-[#5a25eb]/40 transition-all space-y-2.5 flex flex-col justify-between shadow-2xs group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-[#14141e] flex items-center justify-center shrink-0">
                          <Icon className="w-3 h-3 text-[#5a25eb] dark:text-[#cbbeff]" />
                        </div>
                        <span className="text-xs font-semibold text-zinc-500 dark:text-[#a29db0] uppercase tracking-wider truncate">
                          {record.fieldName}
                        </span>
                      </div>
                      <StatusBadge type={record.confidence} label={record.source} />
                    </div>

                    <div className="pl-8 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-[#e4e1e8] line-clamp-3">
                          {record.value}
                        </p>
                        <div className="flex items-center gap-1">
                          {ocrRecords.some((item) => item.id === record.id) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const ocrRecord = ocrRecords.find((item) => item.id === record.id);
                                if (ocrRecord) setSelectedOcrRecord(ocrRecord);
                                setIsOcrViewerOpen(true);
                              }}
                              className="p-1 rounded text-zinc-400 hover:text-[#5a25eb] cursor-pointer"
                              title="View OCR JSON"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleCopy(record.id, record.value)}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                            title="Copy"
                          >
                            {copiedId === record.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      {record.evidenceDocName && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-mono">
                          <FileCheck className="w-3 h-3" />
                          <span className="truncate">{record.evidenceDocName}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 dark:border-[#14141e] flex items-center justify-between text-[10px] text-zinc-400">
                    <span className="capitalize">{record.category}</span>
                    <span>{record.lastUpdated}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {allRecords.length === 0 && (
            <div className="p-10 text-center border border-dashed border-zinc-300 dark:border-[#2d2b38] rounded-3xl bg-white dark:bg-[#07070a] space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#5a25eb]/10 dark:bg-[#5a25eb]/20 flex items-center justify-center mx-auto text-[#5a25eb] dark:text-[#cbbeff]">
                <Database className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  Personal Memory Store is Empty
                </h3>
                <p className="text-xs text-zinc-500 dark:text-[#8c879a] max-w-md mx-auto">
                  No claims loaded in your current session. You can upload real documents, add verified attributes, or click below to load demo records safely into local view.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  onClick={handleLoadDemoVault}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold cursor-pointer shadow-2xs hover:scale-[1.02] transition-all"
                  title="Load sample static claims and documents into view without saving over real database data"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Load Demo Vault (Static)</span>
                </button>
                <button
                  onClick={() => setIsUploadDocOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#5a25eb] text-white text-xs font-medium cursor-pointer shadow-sm hover:bg-[#6b37fa] transition-all"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Real Document</span>
                </button>
                <button
                  onClick={() => setIsAddInfoOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-100 dark:bg-[#14141e] text-zinc-800 dark:text-zinc-200 text-xs font-medium cursor-pointer hover:bg-zinc-200 dark:hover:bg-[#1c1c28] transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Record</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OCR Record Viewer Modal */}
      <Modal
        isOpen={isOcrViewerOpen}
        onClose={() => {
          setIsOcrViewerOpen(false);
          setSelectedOcrRecord(null);
        }}
        title={selectedOcrRecord ? `OCR Evidence: ${selectedOcrRecord.evidenceDocName || selectedOcrRecord.fieldName}` : 'OCR Evidence'}
        subtitle="View extracted OCR text and JSON"
        maxWidth="max-w-2xl"
      >
        {selectedOcrRecord && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-[#222230] bg-zinc-50 dark:bg-[#0c0c12]">
                <span className="text-[10px] text-zinc-500">Field Name</span>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">{selectedOcrRecord.fieldName}</p>
              </div>
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-[#222230] bg-zinc-50 dark:bg-[#0c0c12]">
                <span className="text-[10px] text-zinc-500">Source</span>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">{selectedOcrRecord.source}</p>
              </div>
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-[#222230] bg-zinc-50 dark:bg-[#0c0c12]">
                <span className="text-[10px] text-zinc-500">Category</span>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white capitalize">{selectedOcrRecord.category}</p>
              </div>
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-[#222230] bg-zinc-50 dark:bg-[#0c0c12]">
                <span className="text-[10px] text-zinc-500">Last Updated</span>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">{selectedOcrRecord.lastUpdated}</p>
              </div>
            </div>
            <div className="p-3 rounded-xl border border-zinc-200 dark:border-[#222230] bg-zinc-50 dark:bg-[#0c0c12]">
              <span className="text-[10px] text-zinc-500">Extracted Value</span>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white whitespace-pre-wrap">{selectedOcrRecord.value}</p>
            </div>
            {selectedOcrRecord.evidenceDocName && (
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-[#222230] bg-zinc-50 dark:bg-[#0c0c12]">
                <span className="text-[10px] text-zinc-500">Evidence Document</span>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white font-mono">{selectedOcrRecord.evidenceDocName}</p>
              </div>
            )}
            <details className="text-[10px] text-zinc-600 dark:text-zinc-300">
              <summary className="cursor-pointer text-[#5a25eb]">View full OCR JSON</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white dark:bg-[#18171f] p-2 text-[10px] text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-[#2d2b38]">
                {JSON.stringify(selectedOcrRecord.ocrDocument, null, 2)}
              </pre>
            </details>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsOcrViewerOpen(false);
                  setSelectedOcrRecord(null);
                }}
                className="px-4 py-1.5 rounded-full bg-[#5a25eb] text-white text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* VIEW 3: EVIDENCE FILES */}
      {viewMode === 'documents' && (
        <div className="space-y-3">
          {visibleDocuments.length === 0 && (
            <div className="p-10 text-center border border-dashed border-zinc-300 dark:border-[#2d2b38] rounded-3xl bg-white dark:bg-[#07070a] space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto text-emerald-500">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                No Documents in Storage
              </h3>
              <p className="text-xs text-zinc-500 dark:text-[#8c879a] max-w-md mx-auto">
                Upload PDFs or images to extract cryptographic evidence and link them to your personal graph.
              </p>
              <button
                onClick={() => setIsUploadDocOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#5a25eb] text-white text-xs font-medium cursor-pointer shadow-sm hover:bg-[#6b37fa]"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Document</span>
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleDocuments.map((doc) => {
            const localDocument = localDocuments.find((localDoc) => localDoc.id === doc.id);
            return (
            <div
              key={doc.id}
              className="p-3.5 rounded-2xl border border-zinc-200 dark:border-[#1c1c28] bg-white dark:bg-[#07070a] flex flex-col justify-between hover:border-[#5a25eb]/40 transition-colors shadow-2xs space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-[#14141e] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-[#5a25eb] dark:text-[#cbbeff]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{doc.name}</p>
                    <p className="text-[10px] text-zinc-400">{doc.fileSize} • {doc.uploadDate}</p>
                  </div>
                </div>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                  doc.status === 'Stored locally'
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                }`}>
                  {doc.status}
                </span>
              </div>

              <div className="pt-2 border-t border-zinc-100 dark:border-[#14141e] flex items-center justify-between text-[10px] text-zinc-400">
                {localDocument ? (
                  <a
                    href={localDocument.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sky-600 dark:text-sky-400 flex items-center gap-1 hover:underline"
                  >
                    <FileText className="w-3 h-3" /> Open local file
                  </a>
                ) : (
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <FileCheck className="w-3 h-3" /> {doc.extractedFieldsCount} fields verified
                  </span>
                )}
                <span className="capitalize">{doc.category}</span>
              </div>
            </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Add Info Modal */}
      <Modal
        isOpen={isAddInfoOpen}
        onClose={() => setIsAddInfoOpen(false)}
        title="Add Memory Record"
        subtitle="Manually confirm personal attributes across any life stage."
      >
        <form onSubmit={handleAddRecord} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-zinc-700 dark:text-[#a29db0] mb-1 font-medium">Category</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as LifeStageCategory)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#222230] text-zinc-900 dark:text-white focus:outline-none focus:border-[#5a25eb]"
            >
              <option value="identity">Identity</option>
              <option value="education">Education</option>
              <option value="employment">Employment</option>
              <option value="finance">Finance</option>
              <option value="healthcare">Healthcare</option>
            </select>
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-[#a29db0] mb-1 font-medium">Field Name</label>
            <input
              type="text"
              placeholder="e.g. Master's Thesis Topic"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#222230] text-zinc-900 dark:text-white focus:outline-none focus:border-[#5a25eb]"
            />
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-[#a29db0] mb-1 font-medium">Value</label>
            <input
              type="text"
              placeholder="e.g. Distributed Consensus"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#222230] text-zinc-900 dark:text-white focus:outline-none focus:border-[#5a25eb]"
            />
          </div>

          <div>
            <label className="block text-zinc-700 dark:text-[#a29db0] mb-1 font-medium">Assurance Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewSourceType('Confirmed by you')}
                className={`p-2 rounded-xl border text-left text-xs transition-colors cursor-pointer ${
                  newSourceType === 'Confirmed by you'
                    ? 'border-[#5a25eb] bg-[#5a25eb]/10 text-[#5a25eb] dark:text-[#cbbeff] font-semibold'
                    : 'border-zinc-200 dark:border-[#222230] text-zinc-600'
                }`}
              >
                Self Confirmed
              </button>

              <button
                type="button"
                onClick={() => setNewSourceType('Extracted from document')}
                className={`p-2 rounded-xl border text-left text-xs transition-colors cursor-pointer ${
                  newSourceType === 'Extracted from document'
                    ? 'border-[#5a25eb] bg-[#5a25eb]/10 text-[#5a25eb] dark:text-[#cbbeff] font-semibold'
                    : 'border-zinc-200 dark:border-[#222230] text-zinc-600'
                }`}
              >
                Document Backed
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddInfoOpen(false)}
              className="px-3.5 py-1.5 rounded-full bg-zinc-100 dark:bg-[#14141e] text-xs text-zinc-600 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-full bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-medium cursor-pointer"
            >
              Save Record
            </button>
          </div>
        </form>
      </Modal>

      {/* Document Ingestion Flow Modal */}
      <Modal
        isOpen={isUploadDocOpen}
        onClose={() => {
          if (isOcrRunning) return;
          setIsUploadDocOpen(false);
          setUploadError(null);
          setSelectedFile(null);
          setOcrResult(null);
          setIsOcrRunning(false);
        }}
        title="Document Ingestion"
        subtitle="Add a file from your device for this page only. It will not be sent to a server."
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs">
          {uploadError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {uploadError}
            </p>
          )}
          <div className="space-y-3 text-center">
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                modalDragCounterRef.current += 1;
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                if (!isOcrRunning) setIsDragOverModal(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                if (!isOcrRunning && !isDragOverModal) setIsDragOverModal(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                modalDragCounterRef.current -= 1;
                if (modalDragCounterRef.current <= 0) {
                  modalDragCounterRef.current = 0;
                  setIsDragOverModal(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                modalDragCounterRef.current = 0;
                setIsDragOverModal(false);
                if (isOcrRunning) return;
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                if (file.size > 25 * 1024 * 1024) {
                  setSelectedFile(null);
                  setUploadError('Choose a file that is 25 MB or smaller.');
                  return;
                }
                setSelectedFile(file);
                setUploadError(null);
                setOcrResult(null);
              }}
              onClick={() => {
                if (!isOcrRunning) modalFileInputRef.current?.click();
              }}
              className={`border border-dashed rounded-2xl p-6 space-y-2 transition-all cursor-pointer ${
                isDragOverModal
                  ? 'border-[#5a25eb] bg-[#5a25eb]/10 scale-[1.01] shadow-md ring-2 ring-[#5a25eb]/20'
                  : 'border-zinc-300 dark:border-[#2d2b38] hover:border-[#5a25eb]/50 hover:bg-zinc-50 dark:hover:bg-[#1a1924]'
              }`}
            >
              <div className="pointer-events-none space-y-1">
                <UploadCloud className={`w-8 h-8 mx-auto transition-transform ${isDragOverModal ? 'scale-110 text-[#5a25eb]' : 'text-[#5a25eb]'}`} />
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {isDragOverModal ? 'Drop file here' : 'Drag & drop or click to select'}
                </p>
                <p className="text-[10px] text-zinc-500">PDF, Word (.docx) & Images · Up to 25 MB</p>
              </div>
              <input
                ref={modalFileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                disabled={isOcrRunning}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] || null;
                  event.currentTarget.value = '';
                  if (file && file.size > 25 * 1024 * 1024) {
                    setSelectedFile(null);
                    setUploadError('Choose a file that is 25 MB or smaller.');
                    return;
                  }
                  setSelectedFile(file);
                  setUploadError(null);
                  setOcrResult(null);
                }}
                className="hidden"
              />
              {selectedFile && (
                <div
                  className="flex items-center justify-center gap-2 mt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="inline-block max-w-full break-all rounded bg-zinc-100 px-2.5 py-1 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                  <button
                    type="button"
                    disabled={isOcrRunning}
                    onClick={() => {
                      setSelectedFile(null);
                      setOcrResult(null);
                      setUploadError(null);
                    }}
                    className="rounded-full p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                    title="Remove file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <label className="block space-y-1 text-left text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
              Document category
              <select
                value={uploadCategory}
                disabled={isOcrRunning}
                onChange={(event) => setUploadCategory(event.target.value as LifeStageCategory)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-[#2d2b38] dark:bg-[#18171f]"
              >
                {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
            </label>
            {(!ocrResult || ocrResult.status === 'failed') && !isOcrRunning && !isProcessingHf && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadDocOpen(false);
                    setUploadError(null);
                    setSelectedFile(null);
                  }}
                  className="px-3.5 py-2 rounded-full bg-zinc-100 dark:bg-[#14141e] text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedFile) {
                      setUploadError('Choose a file first.');
                      return;
                    }
                    setIsProcessingHf(true);
                    setUploadError(null);
                    try {
                      let localOcrText = '';
                      try {
                        const ocrTimeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
                        const ocrRes = await Promise.race([runLocalOcr(selectedFile), ocrTimeout]);
                        if (ocrRes && ocrRes.fullText) {
                          localOcrText = ocrRes.fullText;
                        }
                      } catch (oErr) {
                        console.debug('Local OCR skipped:', oErr);
                      }

                      const backendRes = await uploadDocumentToBackend(selectedFile, uploadCategory, localOcrText);
                      if (backendRes && backendRes.proposal) {
                        const rawClaims = backendRes.proposal.claims || [];
                        const formattedClaims: ProposedClaimItem[] = rawClaims.map((c: any) => ({
                          field: c.canonical_field_name || c.field,
                          value: c.value,
                          originalValue: c.value,
                          confidence: typeof c.confidence === 'number' ? c.confidence : 0.95,
                          category: c.category || uploadCategory,
                          sourceRegion: c.source_region || { page: 1 },
                          extractionMethod: c.extraction_method || `Hugging Face (${backendRes.model || 'Qwen/Qwen2.5-Coder-32B-Instruct'})`,
                          status: c.status || 'PROPOSED',
                          assuranceLevel: c.assurance_level || 'LEVEL_2_EVIDENCE_ATTACHED',
                          conflictInfo: c.conflict_info,
                          isSingular: c.is_singular,
                          isSensitive: c.is_sensitive,
                          rawNumericValue: c.raw_numeric_value,
                          accepted: true,
                        }));

                        setCurrentProposal({
                          documentId: backendRes.proposal.document_id,
                          fileName: backendRes.proposal.file_name,
                          fileSize: backendRes.proposal.file_size,
                          sha256Hash: backendRes.proposal.sha256_hash,
                          documentType: backendRes.proposal.document_type,
                          provider: backendRes.proposal.provider || 'huggingface',
                          model: backendRes.proposal.model || 'Qwen/Qwen2.5-Coder-32B-Instruct',
                          status: backendRes.proposal.status || 'NEEDS_REVIEW',
                          claims: formattedClaims,
                        });

                        // Add document to list
                        if (backendRes.document) {
                          setDocuments((prev) => [backendRes.document, ...prev.filter((d) => d.id !== backendRes.document.id)]);
                        }

                        setIsUploadDocOpen(false);
                        setIsProposalModalOpen(true);
                      } else {
                        throw new Error('No extraction proposals returned from backend.');
                      }
                    } catch (err: any) {
                      setUploadError(err.message || 'Hugging Face extraction failed.');
                    } finally {
                      setIsProcessingHf(false);
                    }
                  }}
                  disabled={!selectedFile || isProcessingHf}
                  className="px-4 py-2 rounded-full bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Extract with Hugging Face AI</span>
                </button>
              </div>
            )}
            {isProcessingHf && (
              <div className="space-y-3 py-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-[#5a25eb]" />
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Running Hugging Face Document Intelligence...
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  Extracting structured claims using Hugging Face Qwen 2.5 Coder 32B model with SHA-256 evidence hashing.
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Hugging Face Proposal Review & User Confirmation Modal */}
      <Modal
        isOpen={isProposalModalOpen && !!currentProposal}
        onClose={() => {
          if (isSavingConfirmedClaims) return;
          setIsProposalModalOpen(false);
          setCurrentProposal(null);
        }}
        title="Document Intelligence: Review Proposed Claims"
        subtitle="AI proposes → You review & approve → SYNDEO writes to secure memory."
        maxWidth="max-w-2xl"
      >
        {currentProposal && (
          <div className="space-y-4 text-xs">
            {/* Header info badge */}
            <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#222230] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#5a25eb]" />
                  <span className="font-bold text-zinc-900 dark:text-white text-xs">{currentProposal.fileName}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {currentProposal.documentType.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">
                  {currentProposal.fileSize}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                <span>Model: <strong className="text-zinc-800 dark:text-zinc-200">{currentProposal.model}</strong></span>
                <span>•</span>
                <span>Provider: <strong className="text-zinc-800 dark:text-zinc-200">{currentProposal.provider}</strong></span>
              </div>
              <div className="text-[9px] font-mono text-zinc-400 break-all bg-white dark:bg-[#14141e] p-1.5 rounded border border-zinc-200 dark:border-[#222230]">
                SHA-256: {currentProposal.sha256Hash}
              </div>
            </div>

            {/* Claims Table / List */}
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                <span>Proposed Claims ({currentProposal.claims.length})</span>
                <span className="text-[10px] font-normal text-zinc-400">Uncheck or edit any field before confirming</span>
              </div>

              {currentProposal.claims.map((claim, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all space-y-2 ${
                    claim.accepted
                      ? claim.status === 'CONFLICT'
                        ? 'border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/10'
                        : 'border-[#5a25eb]/30 bg-white dark:bg-[#07070a]'
                      : 'border-zinc-200 dark:border-[#1c1c28] opacity-50 bg-zinc-50 dark:bg-[#12121c]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={claim.accepted}
                        onChange={(e) => {
                          const updated = [...currentProposal.claims];
                          updated[idx].accepted = e.target.checked;
                          setCurrentProposal({ ...currentProposal, claims: updated });
                        }}
                        className="rounded border-zinc-300 text-[#5a25eb] focus:ring-[#5a25eb] cursor-pointer"
                      />
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">
                        {claim.field}
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {claim.status === 'CONFLICT' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          <AlertTriangle className="w-3 h-3" /> Conflict
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          Proposed
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {Math.round(claim.confidence * 100)}% conf
                      </span>
                    </div>
                  </div>

                  {/* Conflict Notice if any */}
                  {claim.conflictInfo && (
                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Singular Fact Discrepancy:
                      </p>
                      <p>Current Active: <strong>{claim.conflictInfo.existingValue}</strong></p>
                      <p>Extracted from New Doc: <strong>{claim.conflictInfo.conflictingValue}</strong></p>
                    </div>
                  )}

                  {/* Value input (editable) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Value (editable)</span>
                      <span>Assurance: <strong className="text-zinc-600 dark:text-zinc-300">EVIDENCE_ATTACHED</strong></span>
                    </div>
                    <input
                      type="text"
                      value={claim.value}
                      disabled={!claim.accepted}
                      onChange={(e) => {
                        const updated = [...currentProposal.claims];
                        updated[idx].value = e.target.value;
                        setCurrentProposal({ ...currentProposal, claims: updated });
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-[#12121a] border border-zinc-200 dark:border-[#222230] text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[#5a25eb]"
                    />
                  </div>

                  {/* Provenance Footer */}
                  <div className="pt-1.5 border-t border-zinc-100 dark:border-[#181824] flex flex-wrap items-center justify-between text-[10px] text-zinc-400">
                    <span className="capitalize">{claim.category} • Page {claim.sourceRegion?.page || 1}</span>
                    <span className="italic">Extraction confidence signal only • Needs your approval</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-[#222230]">
              <button
                type="button"
                onClick={() => {
                  setIsProposalModalOpen(false);
                  setCurrentProposal(null);
                }}
                disabled={isSavingConfirmedClaims}
                className="px-3.5 py-1.5 rounded-full bg-zinc-100 dark:bg-[#14141e] text-xs font-medium cursor-pointer"
              >
                Reject & Close
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (!currentProposal) return;
                  const acceptedItems = currentProposal.claims.filter((c) => c.accepted);
                  const rejectedFields = currentProposal.claims.filter((c) => !c.accepted).map((c) => c.field);

                  if (acceptedItems.length === 0) {
                    alert('Please select at least one claim to confirm.');
                    return;
                  }

                  setIsSavingConfirmedClaims(true);
                  try {
                    const res = await confirmDocumentClaims(
                      currentProposal.documentId,
                      acceptedItems.map((c) => ({
                        field: c.field,
                        value: c.value,
                        category: c.category,
                        is_singular: c.isSingular,
                        is_sensitive: c.isSensitive,
                        raw_numeric_value: c.rawNumericValue,
                      })),
                      rejectedFields
                    );

                    if (res && res.records) {
                      setRecords((prev) => {
                        const newRecIds = new Set(res.records.map((r: any) => r.id));
                        const newFieldKeys = new Set(res.records.map((r: any) => `${r.category}:${r.fieldName.trim().toLowerCase()}`));
                        const filteredOld = prev.filter((p) => !newRecIds.has(p.id) && !newFieldKeys.has(`${p.category}:${p.fieldName.trim().toLowerCase()}`));
                        return [...res.records, ...filteredOld];
                      });
                    }

                    if (res && res.document) {
                      setDocuments((prev) => [res.document, ...prev.filter((d) => d.id !== res.document.id)]);
                    } else {
                      const refreshedDocs = await fetchDocumentsFromBackend();
                      if (refreshedDocs && Array.isArray(refreshedDocs)) {
                        setDocuments(refreshedDocs);
                      }
                    }

                    setIsProposalModalOpen(false);
                    setCurrentProposal(null);
                    alert(`Successfully confirmed and activated ${res.confirmedCount || acceptedItems.length} claims with document evidence into memory!`);
                  } catch (err: any) {
                    alert(`Failed to save confirmed claims: ${err.message}`);
                  } finally {
                    setIsSavingConfirmedClaims(false);
                  }
                }}
                disabled={isSavingConfirmedClaims || !currentProposal.claims.some((c) => c.accepted)}
                className="px-4 py-1.5 rounded-full bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
              >
                {isSavingConfirmedClaims ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Committing to Memory...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm & Commit to Memory ({currentProposal.claims.filter((c) => c.accepted).length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cryptographic Provenance & Evidence Modal */}
      <Modal
        isOpen={isProvenanceModalOpen && !!selectedClaim}
        onClose={() => {
          setIsProvenanceModalOpen(false);
          setSelectedClaim(null);
        }}
        title="Claim Provenance & Cryptographic Assurance"
        subtitle="Deterministic evidence verification stored in Neo4j Aura knowledge graph."
        maxWidth="max-w-lg"
      >
        {selectedClaim && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#222230] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  {selectedClaim.category}
                </span>
                <StatusBadge type={selectedClaim.confidence} label={selectedClaim.source} />
              </div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                {selectedClaim.fieldName}
              </h3>
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#14141e] border border-zinc-200 dark:border-[#222230]">
                <span className="text-[10px] text-zinc-400 block mb-0.5">Stored Value:</span>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm break-words">
                  {selectedClaim.value}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#222230]">
                <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Assurance Level:
                </span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {selectedClaim.confidence === 'evidence-backed'
                    ? 'Level 2 (Cryptographic Evidence Attached)'
                    : 'Level 1 (User Self-Assertion)'}
                </span>
              </div>

              {selectedClaim.evidenceDocName && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5" /> Source Document:
                    </span>
                    <span className="font-mono text-[11px]">{selectedClaim.evidenceDocName}</span>
                  </div>
                  {selectedClaim.evidenceDocHash && (
                    <div className="pt-1 border-t border-emerald-500/20 text-[10px] font-mono break-all opacity-80">
                      SHA-256: {selectedClaim.evidenceDocHash}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#222230]">
                <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[#5a25eb] dark:text-[#cbbeff]" />
                  Graph Node:
                </span>
                <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                  Neo4j Aura Synced (Claim:{selectedClaim.id})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-[#222230]">
              <button
                type="button"
                onClick={() => handleCopy(selectedClaim.id, selectedClaim.value)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-100 dark:bg-[#14141e] hover:bg-zinc-200 dark:hover:bg-[#1c1c28] text-xs font-medium cursor-pointer"
              >
                {copiedId === selectedClaim.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Value</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsProvenanceModalOpen(false);
                  navigate('/chat');
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-medium cursor-pointer shadow-sm"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Ask AI Agent</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
