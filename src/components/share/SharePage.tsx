import React, { useState, useMemo, useEffect } from 'react';
import { initialDocuments, initialSharedLinks } from '../../data/mockData';
import type { DocumentItem, SharedLink } from '../../types';
import { loadSharedLinks, saveSharedLinks, subscribeToSharedLinks } from '../../lib/shareStore';
import { supabase } from '../../lib/supabase';
import { hashShareToken } from '../../lib/shareToken';
import { mapSupabaseDocument, type SupabaseDocumentRow } from '../../lib/documents';
import { mapShareAccessRows } from '../../lib/shareAccess';
import { fetchRecordsFromBackend, fetchDocumentsFromBackend } from '../../lib/api';
import { StatusBadge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { SharePageSkeleton } from '../ui/SkeletonLoader';
import {
  Share2,
  Plus,
  Search,
  Check,
  Copy,
  ExternalLink,
  X,
  Lock,
  ChevronDown,
  ChevronUp,
  Eye,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileText,
  Key,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

export interface SelectableItem {
  id: string;
  type: 'document' | 'record';
  category: string;
  categoryLabel: string;
  label: string;
  value: string;
  signature: string;
  fileType?: string;
  fileSize?: string;
  extractedFieldsCount?: number;
  document?: DocumentItem;
}

const DEFAULT_VAULT_RECORDS: SelectableItem[] = [
  // Social / Identity
  {
    id: 'soc-github',
    type: 'record',
    category: 'social',
    categoryLabel: 'Identity & Social',
    label: 'GitHub Profile',
    value: 'https://github.com/indresh404/SYNDEO',
    signature: '0x9a8f...4e1',
  },
  {
    id: 'soc-linkedin',
    type: 'record',
    category: 'social',
    categoryLabel: 'Identity & Social',
    label: 'LinkedIn Profile',
    value: 'https://linkedin.com/in/indresh-suresh-093646399',
    signature: '0x81bd...2c4',
  },
  {
    id: 'soc-email',
    type: 'record',
    category: 'social',
    categoryLabel: 'Identity & Social',
    label: 'Verified Email',
    value: 'indresh404@gmail.com',
    signature: '0x27fc...88a',
  },
  {
    id: 'soc-twitter',
    type: 'record',
    category: 'social',
    categoryLabel: 'Identity & Social',
    label: 'Twitter / X',
    value: '@indresh404',
    signature: '0x14ea...559',
  },
  {
    id: 'soc-discord',
    type: 'record',
    category: 'social',
    categoryLabel: 'Identity & Social',
    label: 'Discord Tag',
    value: '@indresh404',
    signature: '0x5b33...7d1',
  },
  {
    id: 'soc-portfolio',
    type: 'record',
    category: 'social',
    categoryLabel: 'Identity & Social',
    label: 'Portfolio Website',
    value: 'https://github.com/indresh404/SYNDEO',
    signature: '0x6e9a...3f0',
  },

  // Education
  {
    id: 'edu-school',
    type: 'record',
    category: 'education',
    categoryLabel: 'Education',
    label: 'University / Institute',
    value: 'SLRTCE (Shree L. R. Tiwari College of Engineering)',
    signature: '0xec21...8b7',
  },
  {
    id: 'edu-degree',
    type: 'record',
    category: 'education',
    categoryLabel: 'Education',
    label: 'Degree & Major',
    value: 'Bachelor of Engineering in Computer Science',
    signature: '0x77d2...9c1',
  },
  {
    id: 'edu-cgpa',
    type: 'record',
    category: 'education',
    categoryLabel: 'Education',
    label: 'GPA / CGPA',
    value: '8.45 / 10.0 (Top 5% Merit)',
    signature: '0x33e1...12a',
  },
  {
    id: 'edu-gradyear',
    type: 'record',
    category: 'education',
    categoryLabel: 'Education',
    label: 'Graduation Year',
    value: 'Class of 2024',
    signature: '0x992b...a0f',
  },

  // Finance
  {
    id: 'fin-bank',
    type: 'record',
    category: 'finance',
    categoryLabel: 'Finance',
    label: 'Bank Account & IFSC',
    value: 'HDFC Bank (IFSC: HDFC0000128) ****0128',
    signature: '0xbb04...8e2',
  },
  {
    id: 'fin-tax',
    type: 'record',
    category: 'finance',
    categoryLabel: 'Finance',
    label: 'Tax ID / PAN',
    value: 'ABCPS9821K (ITD Verified)',
    signature: '0x88f1...19a',
  },
  {
    id: 'fin-income',
    type: 'record',
    category: 'finance',
    categoryLabel: 'Finance',
    label: 'Monthly Income',
    value: '₹85,000 / month (Verified Deposit)',
    signature: '0x49a2...61b',
  },

  // Health
  {
    id: 'hlth-blood',
    type: 'record',
    category: 'health',
    categoryLabel: 'Healthcare',
    label: 'Blood Group',
    value: 'O Positive (O+)',
    signature: '0x32ba...11f',
  },
  {
    id: 'hlth-vaccine',
    type: 'record',
    category: 'health',
    categoryLabel: 'Healthcare',
    label: 'Vaccine Records',
    value: 'COVID-19 Booster & MMR Complete',
    signature: '0x99ea...72c',
  },
  {
    id: 'hlth-emergency',
    type: 'record',
    category: 'health',
    categoryLabel: 'Healthcare',
    label: 'Emergency Contact',
    value: 'Ankita (+91 98201 55910)',
    signature: '0x18db...44b',
  },
];

export const SharePage: React.FC = () => {
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [vaultDocuments, setVaultDocuments] = useState<DocumentItem[]>([]);
  const [vaultRecords, setVaultRecords] = useState<SelectableItem[]>(DEFAULT_VAULT_RECORDS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [recipientInput, setRecipientInput] = useState('Acme University Postgraduate Admissions');
  const [expiryOption, setExpiryOption] = useState<'1h' | '24h' | '7d' | 'never'>('24h');

  // Modals & Drawers
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isShareSuccessModalOpen, setIsShareSuccessModalOpen] = useState(false);
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>('link-1');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [newShareToken, setNewShareToken] = useState('share-78b10f2c');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shareCreationError, setShareCreationError] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);

  // Link History
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>(() => loadSharedLinks([]));

  useEffect(() => {
    saveSharedLinks(sharedLinks);
  }, [sharedLinks]);

  useEffect(() => subscribeToSharedLinks(setSharedLinks), []);

  // Fetch Live Backend Graph Records & Documents
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [backendRecs, backendDocs] = await Promise.all([
          fetchRecordsFromBackend(),
          fetchDocumentsFromBackend(),
        ]);

        if (!active) return;

        if (Array.isArray(backendRecs) && backendRecs.length > 0) {
          const mappedRecords: SelectableItem[] = backendRecs.map((rec: any) => {
            const rawCategory = (rec.category || 'social').toLowerCase();
            const catLabel =
              rawCategory === 'social' || rawCategory === 'identity'
                ? 'Identity & Social'
                : rawCategory === 'education'
                ? 'Education'
                : rawCategory === 'finance'
                ? 'Finance'
                : rawCategory === 'health' || rawCategory === 'healthcare'
                ? 'Healthcare'
                : 'General';

            const signatureHash = rec.evidenceDocHash
              ? `0x${rec.evidenceDocHash.slice(0, 4)}...${rec.evidenceDocHash.slice(-3)}`
              : `0x${(rec.id || 'sec').slice(0, 4)}...${(rec.id || '99a').slice(-3)}`;

            return {
              id: rec.id || `claim-${rec.fieldName}`,
              type: 'record' as const,
              category: rawCategory,
              categoryLabel: catLabel,
              label: rec.fieldName || rec.label || 'Attribute',
              value: rec.fieldValue || rec.value || '',
              signature: signatureHash,
            };
          });

          // Merge deduplicating by label
          const mergedRecords = [...mappedRecords];
          for (const defRec of DEFAULT_VAULT_RECORDS) {
            if (!mergedRecords.some((r) => r.label.toLowerCase() === defRec.label.toLowerCase())) {
              mergedRecords.push(defRec);
            }
          }
          setVaultRecords(mergedRecords);
        }

        if (Array.isArray(backendDocs) && backendDocs.length > 0) {
          const docs: DocumentItem[] = backendDocs.map((doc: any) => ({
            id: doc.id || crypto.randomUUID(),
            name: doc.fileName || doc.name || 'Document',
            category: (doc.category || 'education') as any,
            fileType: (doc.fileType || 'pdf').toLowerCase(),
            fileSize: doc.fileSize || '1.2 MB',
            uploadDate: doc.createdAt || 'Recently',
            status: 'Parsed' as const,
            extractedFieldsCount: doc.extractedFieldsCount || 4,
            sha256Hash: doc.sha256Hash || '0x4a9b...7e1',
          }));
          setVaultDocuments((prev) => (prev.length === 0 ? docs : prev));
        }
      } catch (err) {
        console.warn('Backend live graph sync info:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Supabase Access Activity Polling
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    const refreshAccessActivity = async () => {
      const persistedLinks = loadSharedLinks(initialSharedLinks).filter((link) => link.shareId);
      const updates = await Promise.all(persistedLinks.map(async (link) => {
        const { data: share, error: shareError } = await client
          .from('shares')
          .select('status, expires_at')
          .eq('id', link.shareId)
          .maybeSingle();
        if (shareError || !share) return null;

        const { data: events, error: eventsError } = await client
          .from('share_access')
          .select('id, organization_id, organization_member_id, action, accessed_at, created_at, organizations(id, name, type, purpose, website), organization_members(full_name, work_email, role, department)')
          .eq('share_id', link.shareId)
          .order('created_at', { ascending: true });
        if (eventsError || !events) return null;

        const activity = mapShareAccessRows(events, link.fieldsShared);
        const expired = share.status === 'EXPIRED' || new Date(share.expires_at).getTime() <= Date.now();
        return {
          ...link,
          status: share.status === 'REVOKED' ? 'Revoked' as const : expired ? 'Expired' as const : 'Active' as const,
          accessCount: activity.accessCount,
          viewers: activity.viewers,
          accessRequests: activity.accessRequests,
        };
      }));

      if (!active) return;
      const synced = new Map(updates.filter((link): link is NonNullable<typeof link> => link !== null).map((link) => [link.id, link]));
      setSharedLinks((previous) => previous.map((link) => synced.get(link.id) || link));
    };

    void refreshAccessActivity();
    const timer = window.setInterval(() => void refreshAccessActivity(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  // Supabase Documents Loading
  useEffect(() => {
    let active = true;

    void (async () => {
      if (!supabase) {
        const sampleDocuments = initialDocuments.slice(0, 2);
        setVaultDocuments(sampleDocuments);
        setSelectedItemIds(new Set(sampleDocuments.map((document) => document.id)));
        setIsInitialLoading(false);
        return;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        if (active) {
          const sampleDocuments = initialDocuments.slice(0, 2);
          setVaultDocuments(sampleDocuments);
          setSelectedItemIds(new Set(sampleDocuments.map((document) => document.id)));
          setIsInitialLoading(false);
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      if (profileError) {
        if (active) {
          const sampleDocuments = initialDocuments.slice(0, 2);
          setVaultDocuments(sampleDocuments);
          setSelectedItemIds(new Set(sampleDocuments.map((document) => document.id)));
          setIsInitialLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from('documents')
        .select('id, file_name, category, document_type, mime_type, file_size, processing_status, created_at')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        setIsInitialLoading(false);
        return;
      }

      const savedDocuments = (data || []).map((row) => mapSupabaseDocument(row as SupabaseDocumentRow));
      setVaultDocuments(savedDocuments);
      setSelectedItemIds(new Set(savedDocuments.slice(0, 2).map((document) => document.id)));
      setIsInitialLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  // Sync Supabase Shares with Local State
  useEffect(() => {
    let active = true;

    void (async () => {
      const client = supabase;
      if (!client) return;
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const { data: profile } = await client.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle();
      if (!profile) return;

      const { data: shares, error: sharesError } = await client
        .from('shares')
        .select('id, recipient_name, recipient_organization, allowed_claims, status, expires_at, created_at')
        .eq('profile_id', profile.id);
      if (!active || sharesError || !shares?.length) return;

      const knownLinks = loadSharedLinks(initialSharedLinks);
      const syncedLinks = await Promise.all(shares.map(async (share) => {
        const localLink = knownLinks.find((link) => link.shareId === share.id);
        if (!localLink) return null;

        const { data: events, error: eventsError } = await client
          .from('share_access')
          .select('id, organization_id, organization_member_id, action, accessed_at, created_at, organizations(id, name, type, purpose, website), organization_members(full_name, work_email, role, department)')
          .eq('share_id', share.id)
          .order('created_at', { ascending: true });
        const claims = Array.isArray(share.allowed_claims)
          ? share.allowed_claims as Array<{ document_id?: string; file_name?: string; document?: DocumentItem; label?: string; value?: string }>
          : [];
        const requestedDocuments = claims.map((claim) => claim.file_name || claim.label || claim.document_id || '').filter(Boolean);
        const activity = eventsError || !events
          ? { viewers: localLink.viewers || [], accessRequests: localLink.accessRequests || [], accessCount: localLink.accessCount }
          : mapShareAccessRows(events, requestedDocuments);
        const expiresAt = new Date(share.expires_at);
        const expired = expiresAt.getTime() <= Date.now() || share.status === 'EXPIRED';

        return {
          ...localLink,
          recipient: share.recipient_organization || share.recipient_name || localLink.recipient,
          fieldsShared: requestedDocuments,
          sharedDocumentIds: claims.map((claim) => claim.document_id).filter((id): id is string => Boolean(id)),
          sharedDocuments: claims.flatMap((claim) => claim.document ? [claim.document] : []),
          status: share.status === 'REVOKED' ? 'Revoked' as const : expired ? 'Expired' as const : 'Active' as const,
          expiry: share.status === 'REVOKED' ? 'Revoked by user' : expired ? 'Expired' : `Expires ${expiresAt.toLocaleString()}`,
          createdAt: new Date(share.created_at).toLocaleString(),
          viewers: activity.viewers,
          accessRequests: activity.accessRequests,
          accessCount: activity.accessCount,
        };
      }));

      if (!active) return;
      const updates = new Map(syncedLinks.filter((link): link is NonNullable<typeof link> => link !== null).map((link) => [link.shareId, link]));
      setSharedLinks((previous) => previous.map((link) => updates.get(link.shareId) || link));
    })();

    return () => {
      active = false;
    };
  }, [vaultDocuments]);

  // Combine Documents and Records into unified selectable list
  const allSelectableItems = useMemo<SelectableItem[]>(() => {
    const docItems: SelectableItem[] = vaultDocuments.map((doc) => ({
      id: doc.id,
      type: 'document',
      category: 'documents',
      categoryLabel: 'Documents & Files',
      label: doc.name,
      value: `${doc.fileType.toUpperCase()} · ${doc.fileSize} · ${doc.extractedFieldsCount || 1} records`,
      signature: doc.sha256Hash || '0x88f2...10c',
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      extractedFieldsCount: doc.extractedFieldsCount,
      document: doc,
    }));

    return [...docItems, ...vaultRecords];
  }, [vaultDocuments, vaultRecords]);

  // Filtered Selectable Items in Create Share Modal
  const filteredSelectableItems = useMemo(() => {
    return allSelectableItems.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTab =
        selectedCategoryTab === 'all' ||
        (selectedCategoryTab === 'documents' && item.type === 'document') ||
        (selectedCategoryTab === item.category);

      return matchesSearch && matchesTab;
    });
  }, [allSelectableItems, searchQuery, selectedCategoryTab]);

  // Quick Add Drawer State
  const [activeDrawerLinkId, setActiveDrawerLinkId] = useState<string | null>(null);
  const [searchAddDrawerQuery, setSearchAddDrawerQuery] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const toggleItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedItemIds(new Set(allSelectableItems.map((item) => item.id)));
  };

  const clearAll = () => {
    setSelectedItemIds(new Set());
  };

  const handleGenerateShare = async () => {
    if (selectedItemIds.size === 0) return;
    setShareCreationError(null);

    const selectedItems = allSelectableItems.filter((item) => selectedItemIds.has(item.id));
    const selectedDocuments = selectedItems.filter((i) => i.type === 'document' && i.document).map((i) => i.document!);
    const selectedRecords = selectedItems.filter((i) => i.type === 'record');
    const selectedFieldsList = selectedItems.map((item) => item.label);
    setIsCreatingShare(true);

    try {
      const token = crypto.randomUUID();
      const tokenHash = await hashShareToken(token);
      const expiresAt = expiryOption === 'never'
        ? '9999-12-31T23:59:59.000Z'
        : new Date(Date.now() + (expiryOption === '1h' ? 1 : expiryOption === '24h' ? 24 : 24 * 7) * 60 * 60 * 1000).toISOString();

      const allowedClaimsPayload = [
        ...selectedDocuments.map((doc) => ({
          type: 'document',
          document_id: doc.id,
          file_name: doc.name,
          category: doc.category,
          document: doc,
        })),
        ...selectedRecords.map((rec) => ({
          type: 'field',
          field_id: rec.id,
          label: rec.label,
          value: rec.value,
          category: rec.category,
          signature: rec.signature,
        })),
      ];

      let savedShareId: string | undefined = undefined;

      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

          if (ownerProfile) {
            const { data: savedShare, error: shareError } = await supabase
              .from('shares')
              .insert({
                profile_id: ownerProfile.id,
                recipient_name: recipientInput || null,
                recipient_organization: recipientInput || null,
                purpose: 'Organization verified credentials access',
                allowed_claims: allowedClaimsPayload,
                token_hash: tokenHash,
                expires_at: expiresAt,
              })
              .select('id')
              .single();

            if (!shareError && savedShare) {
              savedShareId = savedShare.id;
            }
          }
        }
      }

      const newLink: SharedLink = {
        id: token,
        shareId: savedShareId,
        recipient: recipientInput || 'Verified Partner Review',
        fieldsShared: selectedFieldsList,
        createdAt: 'Just now',
        expiry:
          expiryOption === '1h'
            ? 'Expires in 1 hour'
            : expiryOption === '24h'
            ? 'Expires in 24 hours'
            : expiryOption === '7d'
            ? 'Expires in 7 days'
            : 'Permanent (Until revoked)',
        status: 'Active',
        accessCount: 0,
        viewers: [],
        accessRequests: [],
        sharedDocumentIds: selectedDocuments.map((doc) => doc.id),
        sharedDocuments: selectedDocuments,
        sharedFields: selectedRecords.map((r) => ({
          id: r.id,
          label: r.label,
          value: r.value,
          category: r.category,
          signature: r.signature,
        })),
      };

      setNewShareToken(token);
      setSharedLinks([newLink, ...sharedLinks]);
      setExpandedLinkId(token);
      setIsCreatePanelOpen(false);
      setIsShareSuccessModalOpen(true);
      showToast('New cryptographic share link generated successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create share link.';
      setShareCreationError(message);
      showToast(message);
    } finally {
      setIsCreatingShare(false);
    }
  };

  const openShareLinkInNewTab = (tokenId: string) => {
    const url = `${window.location.origin}/?share=${tokenId}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyUrl = (tokenId: string) => {
    const url = `${window.location.origin}/?share=${tokenId}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(tokenId);
    showToast('Share link copied to clipboard!');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleRevoke = async (id: string) => {
    const link = sharedLinks.find((item) => item.id === id);
    if (link?.shareId && supabase) {
      await supabase
        .from('shares')
        .update({ status: 'REVOKED', revoked_at: new Date().toISOString() })
        .eq('id', link.shareId);
    }
    setSharedLinks((previous) => previous.map((item) => item.id === id ? { ...item, status: 'Revoked', expiry: 'Revoked by user' } : item));
    showToast('Link access revoked.');
  };

  const handleRestore = async (id: string) => {
    const link = sharedLinks.find((item) => item.id === id);
    if (link?.shareId && supabase) {
      await supabase
        .from('shares')
        .update({ status: 'ACTIVE', revoked_at: null })
        .eq('id', link.shareId);
    }
    setSharedLinks((previous) => previous.map((item) => item.id === id ? { ...item, status: 'Active', expiry: 'Active' } : item));
    showToast('Link reactivated.');
  };

  // Live Field/Item Removal from Link Drawer
  const handleRemoveFieldFromLink = async (linkId: string, itemLabel: string) => {
    const link = sharedLinks.find((item) => item.id === linkId);
    if (!link) return;

    const remainingLabels = link.fieldsShared.filter((f) => f !== itemLabel);
    const remainingDocuments = (link.sharedDocuments || []).filter((d) => d.name !== itemLabel);
    const remainingFields = (link.sharedFields || []).filter((f) => f.label !== itemLabel);

    if (link.shareId && supabase) {
      const allowedClaimsPayload = [
        ...remainingDocuments.map((doc) => ({
          type: 'document',
          document_id: doc.id,
          file_name: doc.name,
          category: doc.category,
          document: doc,
        })),
        ...remainingFields.map((rec) => ({
          type: 'field',
          field_id: rec.id,
          label: rec.label,
          value: rec.value,
          category: rec.category,
          signature: rec.signature,
        })),
      ];
      await supabase.from('shares').update({ allowed_claims: allowedClaimsPayload }).eq('id', link.shareId);
    }

    setSharedLinks((prev) =>
      prev.map((l) => {
        if (l.id !== linkId) return l;
        return {
          ...l,
          fieldsShared: remainingLabels,
          sharedDocuments: remainingDocuments,
          sharedDocumentIds: remainingDocuments.map((d) => d.id),
          sharedFields: remainingFields,
        };
      })
    );
    showToast(`Removed "${itemLabel}" from this share.`);
  };

  // Live Item Addition to Link
  const handleAddItemToLink = async (linkId: string, item: SelectableItem) => {
    const link = sharedLinks.find((l) => l.id === linkId);
    if (!link) return;

    if (link.fieldsShared.includes(item.label)) {
      showToast(`"${item.label}" is already included in this share.`);
      return;
    }

    const nextLabels = [...link.fieldsShared, item.label];
    const nextDocuments = item.type === 'document' && item.document
      ? [...(link.sharedDocuments || []), item.document]
      : (link.sharedDocuments || []);
    const nextFields = item.type === 'record'
      ? [...(link.sharedFields || []), { id: item.id, label: item.label, value: item.value, category: item.category, signature: item.signature }]
      : (link.sharedFields || []);

    if (link.shareId && supabase) {
      const allowedClaimsPayload = [
        ...nextDocuments.map((doc) => ({
          type: 'document',
          document_id: doc.id,
          file_name: doc.name,
          category: doc.category,
          document: doc,
        })),
        ...nextFields.map((rec) => ({
          type: 'field',
          field_id: rec.id,
          label: rec.label,
          value: rec.value,
          category: rec.category,
          signature: rec.signature,
        })),
      ];
      await supabase.from('shares').update({ allowed_claims: allowedClaimsPayload }).eq('id', link.shareId);
    }

    setSharedLinks((prev) =>
      prev.map((l) => {
        if (l.id !== linkId) return l;
        return {
          ...l,
          fieldsShared: nextLabels,
          sharedDocuments: nextDocuments,
          sharedDocumentIds: nextDocuments.map((d) => d.id),
          sharedFields: nextFields,
        };
      })
    );
    setActiveDrawerLinkId(null);
    showToast(`Added "${item.label}" to this live link.`);
  };

  // Access Request Event Handler
  const appendAccessEvent = async (
    linkId: string,
    requestId: string,
    action: 'APPROVED' | 'DENIED' | 'REVOKED',
    status: 'approved' | 'declined' | 'revoked',
    successMessage: string,
  ) => {
    const link = sharedLinks.find((item) => item.id === linkId);
    const request = link?.accessRequests?.find((item) => item.id === requestId);
    if (!link?.shareId || !request?.organizationId || !request.organizationMemberId || !supabase) {
      // Local fallback & immediate store synchronization
      setSharedLinks((previous) => {
        const next = previous.map((item) => {
          if (item.id !== linkId) return item;
          const updatedRequests = item.accessRequests?.map((entry) => entry.id === requestId ? { ...entry, status } : entry);
          let updatedViewers = item.viewers || [];
          if (status === 'approved' && request) {
            const targetEmail = request.profile?.workEmail;
            const existingIndex = updatedViewers.findIndex((v) => (targetEmail && v.email === targetEmail) || v.userName === request.requesterName);
            if (existingIndex >= 0) {
              updatedViewers = updatedViewers.map((v, idx) => idx === existingIndex ? { ...v, verificationStatus: 'authorized' as const, viewedAt: 'Just now (Approved)' } : v);
            } else {
              updatedViewers = [
                ...updatedViewers,
                {
                  id: `v-${Date.now()}`,
                  userName: request.requesterName,
                  roleOrOrg: request.organization,
                  email: targetEmail,
                  viewedAt: 'Just now (Approved)',
                  verificationStatus: 'authorized' as const,
                  ipLocation: 'Mumbai, MH (Campus Network)',
                },
              ];
            }
          }
          return {
            ...item,
            accessRequests: updatedRequests,
            viewers: updatedViewers,
          };
        });
        saveSharedLinks(next);
        return next;
      });
      return showToast(successMessage);
    }

    const { data, error } = await supabase
      .from('share_access')
      .insert({
        share_id: link.shareId,
        organization_id: request.organizationId,
        organization_member_id: request.organizationMemberId,
        action,
      })
      .select('id, created_at')
      .single();
    if (error) return showToast(error.message);

    setSharedLinks((previous) => {
      const next = previous.map((item) => {
        if (item.id !== linkId) return item;
        return {
          ...item,
          accessRequests: item.accessRequests?.map((entry) => entry.organizationMemberId === request.organizationMemberId
            ? { ...entry, id: data.id, status, requestedAt: new Date(data.created_at).toLocaleString() }
            : entry),
        };
      });
      saveSharedLinks(next);
      return next;
    });
    showToast(successMessage);
  };

  const handleApproveRequest = (linkId: string, requestId: string) => {
    void appendAccessEvent(linkId, requestId, 'APPROVED', 'approved', 'Organization access approved.');
  };

  const handleDeclineRequest = (linkId: string, requestId: string) => {
    void appendAccessEvent(linkId, requestId, 'DENIED', 'declined', 'Access request declined.');
  };

  const handleRevokeOrganizationAccess = (linkId: string, requestId: string) => {
    void appendAccessEvent(linkId, requestId, 'REVOKED', 'revoked', 'Organization access removed.');
  };

  const handleApproveAllPending = () => {
    let approvedCount = 0;
    const nextLinks = sharedLinks.map((link) => {
      const pendingReqs = (link.accessRequests || []).filter((r) => r.status === 'pending');
      if (pendingReqs.length === 0) return link;
      approvedCount += pendingReqs.length;

      const updatedRequests = (link.accessRequests || []).map((r) =>
        r.status === 'pending' ? { ...r, status: 'approved' as const } : r
      );

      let updatedViewers = [...(link.viewers || [])];
      for (const req of pendingReqs) {
        const targetEmail = req.profile?.workEmail;
        const existingIdx = updatedViewers.findIndex((v) => (targetEmail && v.email === targetEmail) || v.userName === req.requesterName);
        if (existingIdx >= 0) {
          updatedViewers[existingIdx] = {
            ...updatedViewers[existingIdx],
            verificationStatus: 'authorized' as const,
            viewedAt: 'Just now (Approved)',
          };
        } else {
          updatedViewers.push({
            id: `v-${Date.now()}-${req.id}`,
            userName: req.requesterName,
            roleOrOrg: req.organization,
            email: targetEmail,
            viewedAt: 'Just now (Approved)',
            verificationStatus: 'authorized' as const,
            ipLocation: 'Mumbai, MH (Campus Network)',
          });
        }
      }

      return {
        ...link,
        accessRequests: updatedRequests,
        viewers: updatedViewers,
      };
    });

    setSharedLinks(nextLinks);
    saveSharedLinks(nextLinks);
    showToast(`Approved ${approvedCount} pending verification request(s) across all links.`);
  };

  if (isInitialLoading) {
    return <SharePageSkeleton />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-6 right-6 z-50 p-4 rounded-xl bg-[#5a25eb] text-white text-xs font-semibold shadow-2xl flex items-center gap-2 border border-white/20"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimalist Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-[#23222a]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-[#e4e1e8]">
              Share Information
            </h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-[#8c879a] mt-1">
            Choose specific documents & vault credentials, manage scopes, and review organization access requests.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              if (sharedLinks.length > 0) {
                setSharedLinks([]);
                saveSharedLinks([]);
              } else {
                setSharedLinks(initialSharedLinks);
                saveSharedLinks(initialSharedLinks);
              }
            }}
            className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-[#2b2b3a] bg-zinc-100 dark:bg-[#161622] hover:bg-zinc-200 dark:hover:bg-[#202030] text-zinc-700 dark:text-[#cbbeff] text-xs font-semibold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{sharedLinks.length > 0 ? 'Reset To Defaults' : 'Load Sample Shares'}</span>
          </button>

          <button
            onClick={() => {
              setShareCreationError(null);
              setIsCreatePanelOpen(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-[#5a25eb] hover:bg-[#6b37fa] text-white font-semibold text-sm transition-all shadow-md shadow-[#5a25eb]/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Share Link</span>
          </button>
        </div>
      </div>

      {/* Real-time Watchers & Access Verification Hub */}
      {sharedLinks.length > 0 && (() => {
        const allViewers = sharedLinks.flatMap((l) => (l.viewers || []).map((v) => ({ ...v, linkId: l.id, recipient: l.recipient })));
        const allPendingRequests = sharedLinks.flatMap((l) => (l.accessRequests || []).filter((r) => r.status === 'pending').map((r) => ({ ...r, linkId: l.id, recipient: l.recipient })));

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Active Viewers Widget */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/[0.04] to-transparent dark:from-emerald-500/[0.07] border border-emerald-500/20 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" />
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Live Viewers & Active Sessions ({allViewers.length})
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Real-Time Merkle Audited
                </span>
              </div>

              <div className="space-y-2">
                {allViewers.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic py-2">No active sessions currently viewing your envelopes.</p>
                ) : (
                  allViewers.slice(0, 3).map((viewer, index) => (
                    <div
                      key={viewer.id || index}
                      className="p-3 rounded-xl bg-white/80 dark:bg-[#121217]/90 border border-emerald-500/15 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center border border-emerald-500/30 shrink-0">
                          {viewer.userName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                            {viewer.userName}
                            {viewer.userName.toLowerCase().includes('divya') && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-[#5a25eb]/15 text-[#5a25eb] dark:text-[#cbbeff] font-semibold border border-[#5a25eb]/20">
                                Lead Reviewer
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            {viewer.roleOrOrg} • <span className="text-emerald-600 dark:text-emerald-400 font-medium">{viewer.viewedAt}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                          {viewer.ipLocation || 'Verified IP'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pending Approvals & Requests Widget */}
            <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-[#121217] border border-zinc-200 dark:border-[#262535] shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#5a25eb] dark:text-[#cbbeff]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-[#c4bfcf]">
                    Pending Verification Requests ({allPendingRequests.length})
                  </h3>
                </div>
                {allPendingRequests.length > 0 && (
                  <button
                    onClick={handleApproveAllPending}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Approve All ({allPendingRequests.length})</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {allPendingRequests.length === 0 ? (
                  <div className="p-3 rounded-xl bg-white dark:bg-[#181822] border border-dashed border-zinc-200 dark:border-[#282738] text-center text-xs text-zinc-400">
                    All incoming organization requests are reviewed and approved.
                  </div>
                ) : (
                  allPendingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-xl bg-white dark:bg-[#181822] border border-amber-500/30 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          {req.requesterName}
                          <span className="text-zinc-400 font-normal">({req.organization})</span>
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          Purpose: <span className="font-medium text-zinc-700 dark:text-zinc-300">{req.purpose}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleApproveRequest(req.linkId, req.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(req.linkId, req.id)}
                          className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-[#383645] text-zinc-600 dark:text-[#c4bfcf] hover:bg-zinc-100 dark:hover:bg-[#252430] text-[11px] font-medium cursor-pointer transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Active & Past Shared Links List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600 dark:text-[#8c879a] flex items-center gap-2">
            <span>Active & Past Shared Links ({sharedLinks.length})</span>
            <span className="text-xs font-normal font-sans text-zinc-400">
              • Click any link to inspect viewers & access requests
            </span>
          </h2>
        </div>

        {sharedLinks.length === 0 ? (
          <div className="p-10 text-center rounded-3xl bg-white dark:bg-[#0c0c12] border border-dashed border-zinc-300 dark:border-[#242330] space-y-4">
            <Share2 className="w-8 h-8 text-zinc-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">No active share links</p>
              <p className="text-xs text-zinc-500 dark:text-[#8c879a] max-w-md mx-auto">
                You have not shared any credentials yet. Click "Create Share Link" to select documents and personal claims to generate a cryptographic envelope.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                onClick={() => {
                  setSharedLinks(initialSharedLinks);
                  saveSharedLinks(initialSharedLinks);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold cursor-pointer shadow-2xs hover:scale-[1.02] transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Load Sample Shares</span>
              </button>
              <button
                onClick={() => {
                  setShareCreationError(null);
                  setIsCreatePanelOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-medium cursor-pointer shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Share Link</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sharedLinks.map((link) => {
              const isExpanded = expandedLinkId === link.id;
              const viewers = link.viewers || [];
              const requests = link.accessRequests || [];
              const pendingRequests = requests.filter((r) => r.status === 'pending');

              return (
                <div
                  key={link.id}
                  className="rounded-2xl border border-zinc-200 dark:border-[#201f2b] bg-white dark:bg-[#121217] overflow-hidden transition-all shadow-xs"
                >
                  {/* Top Accordion Trigger Card */}
                  <div
                    onClick={() => setExpandedLinkId(isExpanded ? null : link.id)}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#181720] transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#5a25eb]/10 border border-[#5a25eb]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Share2 className="w-5 h-5 text-[#5a25eb] dark:text-[#cbbeff]" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-[#e4e1e8]">
                            {link.recipient}
                          </h3>
                          <StatusBadge
                            type={link.status === 'Active' ? 'active' : link.status === 'Revoked' ? 'revoked' : 'expired'}
                          />
                          {pendingRequests.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {pendingRequests.length} Pending Approval
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-[#8c879a] flex-wrap">
                          <span>Created {link.createdAt}</span>
                          <span>•</span>
                          <span>{link.expiry}</span>
                          <span>•</span>
                          <span className="text-[#5a25eb] dark:text-[#cbbeff] font-semibold">
                            {link.fieldsShared.length} items shared
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyUrl(link.id);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-[#2d2c3a] hover:bg-zinc-100 dark:hover:bg-[#20202e] text-zinc-700 dark:text-[#c4bfcf] text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        {copiedToken === link.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedToken === link.id ? 'Copied' : 'Copy Link'}</span>
                      </button>

                      <div className="text-zinc-400 p-1">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {/* Accordion Expanded Detail Drawer */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-zinc-200 dark:border-[#201f2b] p-6 space-y-6 bg-zinc-50/50 dark:bg-[#15151c]/60"
                      >
                        {/* Section 1: Real-time Access Activity & Viewers */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-[#c4bfcf] flex items-center gap-2">
                              <Eye className="w-4 h-4 text-[#5a25eb]" />
                              <span>Live Activity & Verification Events ({viewers.length} views)</span>
                            </h4>
                          </div>

                          {viewers.length === 0 ? (
                            <div className="p-4 rounded-xl bg-white dark:bg-[#181822] border border-zinc-200 dark:border-[#262534] text-center text-xs text-zinc-500">
                              No external entity has viewed or queried this link yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {viewers.map((viewer) => (
                                <div
                                  key={viewer.id}
                                  className="p-3.5 rounded-xl bg-white dark:bg-[#181822] border border-zinc-200 dark:border-[#272635] flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-[11px] border border-emerald-500/20">
                                      {viewer.userName.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="font-semibold text-zinc-900 dark:text-white">
                                        {viewer.userName}
                                      </p>
                                      <p className="text-[11px] text-zinc-500 dark:text-[#8c879a]">
                                        {viewer.roleOrOrg} {viewer.email ? `(${viewer.email})` : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                      {viewer.verificationStatus}
                                    </span>
                                    <p className="text-[10px] text-zinc-400 mt-0.5">{viewer.viewedAt}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Section 2: Organization Access Requests */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-[#c4bfcf] flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-emerald-500" />
                            <span>Organization Access Requests ({requests.length})</span>
                          </h4>

                          {requests.length === 0 ? (
                            <div className="p-4 rounded-xl bg-white dark:bg-[#181822] border border-zinc-200 dark:border-[#262534] text-center text-xs text-zinc-500">
                              No explicit organization access requests submitted for this link yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {requests.map((req) => (
                                <div
                                  key={req.id}
                                  className="p-4 rounded-xl bg-white dark:bg-[#181822] border border-zinc-200 dark:border-[#272635] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-zinc-900 dark:text-white">
                                        {req.requesterName}
                                      </span>
                                      <span className="text-zinc-400">•</span>
                                      <span className="text-zinc-700 dark:text-[#cbbeff] font-medium">
                                        {req.organization}
                                      </span>
                                      {req.profile?.website && (
                                        <span className="text-[10px] font-mono text-zinc-400">
                                          ({req.profile.website})
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-zinc-500">
                                      Purpose: <strong className="text-zinc-700 dark:text-zinc-300">{req.purpose}</strong> • Requested {req.requestedAt}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {req.status === 'pending' ? (
                                      <>
                                        <button
                                          onClick={() => handleApproveRequest(link.id, req.id)}
                                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors"
                                        >
                                          Approve Access
                                        </button>
                                        <button
                                          onClick={() => handleDeclineRequest(link.id, req.id)}
                                          className="px-3.5 py-1.5 rounded-lg border border-zinc-300 dark:border-[#383645] text-zinc-600 dark:text-[#c4bfcf] hover:bg-zinc-200 dark:hover:bg-[#252430] text-xs font-medium cursor-pointer transition-colors"
                                        >
                                          Decline
                                        </button>
                                      </>
                                    ) : req.status === 'approved' ? (
                                      <button
                                        onClick={() => handleRevokeOrganizationAccess(link.id, req.id)}
                                        className="px-3.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold cursor-pointer transition-colors hover:bg-red-500/20"
                                      >
                                        Remove Access
                                      </button>
                                    ) : req.status === 'revoked' ? (
                                      <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                        Access Removed
                                      </span>
                                    ) : (
                                      <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-zinc-200 dark:bg-[#201f2b] text-zinc-500">
                                        Declined
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Section 3: Disclosed Items Management */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-[#c4bfcf] flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-emerald-500" />
                              <span>Currently Disclosed Vault Items ({link.fieldsShared.length})</span>
                            </h4>

                            <button
                              onClick={() => setActiveDrawerLinkId(link.id)}
                              className="text-xs text-[#5a25eb] dark:text-[#cbbeff] hover:underline cursor-pointer flex items-center gap-1 font-medium"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Vault Item to this Live Link
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {link.fieldsShared.map((field, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-[#1a1924] border border-zinc-200 dark:border-[#2e2c3b] text-zinc-800 dark:text-[#e4e1e8] flex items-center gap-2 shadow-sm"
                              >
                                <span>{field}</span>
                                <button
                                  onClick={() => handleRemoveFieldFromLink(link.id, field)}
                                  className="text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                                  title={`Remove ${field} from this link`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Section 4: Link Controls */}
                        <div className="pt-3 border-t border-zinc-200 dark:border-[#22212d] flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                            <span>LINK URL:</span>
                            <span className="text-zinc-800 dark:text-[#cbbeff] truncate max-w-xs sm:max-w-md">
                              {window.location.origin}/?share={link.id}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openShareLinkInNewTab(link.id)}
                              className="px-4 py-2 rounded-xl bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open In New Tab
                            </button>

                            {link.status === 'Active' ? (
                              <button
                                onClick={() => handleRevoke(link.id)}
                                className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium cursor-pointer transition-colors"
                              >
                                Revoke Access
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRestore(link.id)}
                                className="px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium cursor-pointer transition-colors"
                              >
                                Restore Link
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE SHARE MODAL / SLIDE-OVER PANEL */}
      <Modal
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        title="Create Selective Share Link"
        subtitle="Choose the specific documents and verified vault records this organization may access."
      >
        <div className="space-y-5 max-h-[78vh] overflow-y-auto pr-1">
          {shareCreationError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {shareCreationError}
            </p>
          )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents, degrees, GitHub, PAN, skills, bank..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-[#2d2b38] bg-zinc-50 dark:bg-[#18171f] text-zinc-900 dark:text-white placeholder-zinc-400 text-xs focus:outline-none focus:ring-2 focus:ring-[#5a25eb]/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            {[
              { key: 'all', label: 'All Vault Data' },
              { key: 'documents', label: 'Documents' },
              { key: 'social', label: 'Identity & Social' },
              { key: 'education', label: 'Education' },
              { key: 'finance', label: 'Finance' },
              { key: 'health', label: 'Healthcare' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSelectedCategoryTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategoryTab === tab.key
                    ? 'bg-[#5a25eb] text-white shadow-xs'
                    : 'bg-zinc-100 dark:bg-[#1a1924] text-zinc-600 dark:text-[#a29db0] hover:bg-zinc-200 dark:hover:bg-[#242330]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Quick Select Controls */}
          <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-200 dark:border-[#22212b]">
            <span className="font-semibold text-zinc-700 dark:text-[#a29db0]">
              Selected: <strong className="text-[#5a25eb] dark:text-[#cbbeff]">{selectedItemIds.size}</strong> items
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={selectAll}
                className="text-xs text-[#5a25eb] dark:text-[#cbbeff] hover:underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-zinc-400">•</span>
              <button
                onClick={clearAll}
                className="text-xs text-zinc-500 hover:text-red-500 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* List of Selectable Items (Documents + Credentials) */}
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {filteredSelectableItems.map((item) => {
              const isSelected = selectedItemIds.has(item.id);
              const isDoc = item.type === 'document';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#5a25eb]/60 bg-[#5a25eb]/5 dark:bg-[#5a25eb]/10'
                      : 'border-zinc-200 dark:border-[#2d2b38] hover:border-zinc-400 dark:hover:border-[#4b4858]'
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isSelected ? 'border-[#5a25eb] bg-[#5a25eb] text-white' : 'border-zinc-400'}`}>
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </span>

                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-zinc-100 dark:bg-[#1f1e2b] border border-zinc-200 dark:border-[#2b2a38]">
                    {isDoc ? (
                      <FileText className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Key className="w-4 h-4 text-[#5a25eb] dark:text-[#cbbeff]" />
                    )}
                  </div>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="block truncate text-xs font-semibold text-zinc-900 dark:text-white">
                        {item.label}
                      </span>
                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-[#201f2c] text-zinc-500 dark:text-[#a29db0] border border-zinc-200 dark:border-[#2a2936]">
                        {item.categoryLabel}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-[#8c879a] truncate font-mono">
                      {item.value}
                    </span>
                  </span>

                  <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                    {item.signature}
                  </span>
                </button>
              );
            })}

            {filteredSelectableItems.length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-500">
                No vault documents or records match your search or filter.
              </p>
            )}
          </div>

          {/* Recipient & Expiry Inputs */}
          <div className="pt-4 border-t border-zinc-200 dark:border-[#23222a] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-[#a29db0]">
                Recipient / Organization Name
              </label>
              <input
                type="text"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder="e.g. Acme University Admissions"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-[#2d2b38] bg-zinc-50 dark:bg-[#18171f] text-zinc-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#5a25eb]/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-[#a29db0]">
                Link Expiry
              </label>
              <select
                value={expiryOption}
                onChange={(e) => setExpiryOption(e.target.value as '1h' | '24h' | '7d' | 'never')}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-[#2d2b38] bg-zinc-50 dark:bg-[#18171f] text-zinc-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#5a25eb]/50 cursor-pointer"
              >
                <option value="1h">1 Hour</option>
                <option value="24h">24 Hours (Recommended)</option>
                <option value="7d">7 Days</option>
                <option value="never">Permanent (Until Revoked)</option>
              </select>
            </div>
          </div>

          {/* Bottom Submit Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              onClick={() => setIsCreatePanelOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-[#2d2b38] text-zinc-700 dark:text-[#c4bfcf] hover:bg-zinc-100 dark:hover:bg-[#201f2b] text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateShare}
              disabled={selectedItemIds.size === 0 || isCreatingShare}
              className={`px-6 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer ${
                selectedItemIds.size > 0
                  ? 'bg-[#5a25eb] hover:bg-[#6b37fa] text-white shadow-[#5a25eb]/25'
                  : 'bg-zinc-300 dark:bg-[#252430] text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Share2 className="w-4 h-4" />
              {isCreatingShare ? 'Generating Envelope...' : `Generate & Share (${selectedItemIds.size} items)`}
            </button>
          </div>
        </div>
      </Modal>

      {/* POPUP MODAL ON CREATION: QR + DIRECT SHARE LINK */}
      <Modal
        isOpen={isShareSuccessModalOpen}
        onClose={() => setIsShareSuccessModalOpen(false)}
        title="Share Link & Cryptographic QR Generated"
        subtitle="The selected documents & records remain locked until the requesting organization is approved."
      >
        <div className="space-y-6 text-center py-2">
          <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <QRCodeSVG value={`${window.location.origin}/?share=${encodeURIComponent(newShareToken)}`} size={192} level="H" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-600 dark:text-[#9e9aa8]">
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              <span>Credentials unlock after organization authorization</span>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-100 dark:bg-[#181720] border border-zinc-200 dark:border-[#2c2a38]">
              <span className="text-xs font-mono text-zinc-800 dark:text-[#cbbeff] truncate px-2 flex-1 text-left">
                {window.location.origin}/?share={newShareToken}
              </span>
              <button
                onClick={() => copyUrl(newShareToken)}
                className="px-3 py-1.5 rounded-lg bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1"
              >
                {copiedToken === newShareToken ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedToken === newShareToken ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <button
              onClick={() => {
                setIsShareSuccessModalOpen(false);
                openShareLinkInNewTab(newShareToken);
              }}
              className="px-5 py-2.5 rounded-xl bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-semibold transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open Link in New Tab
            </button>
            <button
              onClick={() => setIsShareSuccessModalOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-[#2d2c38] text-zinc-700 dark:text-[#c4bfcf] hover:bg-zinc-100 dark:hover:bg-[#1f1e27] text-xs font-medium transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* QUICK ADD ITEM MODAL FOR ACTIVE LINK ACCORDION */}
      <Modal
        isOpen={!!activeDrawerLinkId}
        onClose={() => setActiveDrawerLinkId(null)}
        title="Add Vault Item to Active Share Link"
        subtitle="Select any document or credential record from your vault to disclose in this active link."
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchAddDrawerQuery}
              onChange={(e) => setSearchAddDrawerQuery(e.target.value)}
              placeholder="Search available documents or records..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-[#2d2b38] bg-zinc-50 dark:bg-[#18171f] text-zinc-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#5a25eb]/50"
            />
          </div>

          <div className="space-y-2">
            {allSelectableItems
              .filter((item) => {
                const currentLink = sharedLinks.find((l) => l.id === activeDrawerLinkId);
                return !currentLink?.fieldsShared.includes(item.label);
              })
              .filter((item) => {
                if (!searchAddDrawerQuery.trim()) return true;
                const q = searchAddDrawerQuery.toLowerCase();
                return (
                  item.label.toLowerCase().includes(q) ||
                  item.value.toLowerCase().includes(q) ||
                  item.category.toLowerCase().includes(q)
                );
              })
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => activeDrawerLinkId && handleAddItemToLink(activeDrawerLinkId, item)}
                  className="flex w-full items-center justify-between rounded-xl border border-zinc-200 dark:border-[#282733] p-3 text-left hover:border-[#5a25eb] hover:bg-[#5a25eb]/5 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-[#201f2c] flex items-center justify-center shrink-0">
                      {item.type === 'document' ? (
                        <FileText className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Key className="w-3.5 h-3.5 text-[#5a25eb] dark:text-[#cbbeff]" />
                      )}
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-zinc-900 dark:text-white">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500 font-mono">{item.value}</span>
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-emerald-600 shrink-0" />
                </button>
              ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};
