// SYNDEO API Client - Connects React Frontend to FastAPI Production Graph Backend

const API_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const FALLBACK_BACKEND = 'https://syndeo-backend-wks3.onrender.com';

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const primaryUrl = API_BASE ? `${API_BASE}${path}` : path;
  try {
    const res = await fetch(primaryUrl, init);
    if (!res.ok && (res.status === 500 || res.status === 502 || res.status === 504) && !primaryUrl.startsWith(FALLBACK_BACKEND)) {
      return await fetch(`${FALLBACK_BACKEND}${path}`, init);
    }
    return res;
  } catch (err) {
    if (!primaryUrl.startsWith(FALLBACK_BACKEND)) {
      return await fetch(`${FALLBACK_BACKEND}${path}`, init);
    }
    throw err;
  }
}

export async function fetchHealthStatus() {
  try {
    const res = await apiFetch('/api/health');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchNeo4jStatus() {
  try {
    const res = await apiFetch('/api/neo4j/status');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchMemoryStore() {
  try {
    const res = await apiFetch('/api/memory');
    if (!res.ok) throw new Error('Failed to fetch memory store');
    return await res.json();
  } catch (err) {
    console.warn('Backend API unavailable, using local memory store.', err);
    return null;
  }
}

export async function clearMemoryStore() {
  try {
    const res = await apiFetch('/api/memory/clear', {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to clear memory store');
    return await res.json();
  } catch (err) {
    console.warn('Backend API unavailable to clear store.', err);
    return null;
  }
}

export async function fetchGraphTopology() {
  try {
    const res = await apiFetch('/api/graph/topology');
    if (!res.ok) throw new Error('Failed to fetch topology');
    return await res.json();
  } catch (err) {
    console.warn('Backend topology unavailable.', err);
    return null;
  }
}

export async function fetchRecordsFromBackend() {
  try {
    const res = await apiFetch('/api/graph/records');
    if (!res.ok) throw new Error('Failed to fetch records');
    const data = await res.json();
    return data.records;
  } catch (err) {
    console.warn('Backend API unavailable, using local memory store.', err);
    return null;
  }
}

export async function fetchDocumentsFromBackend() {
  try {
    const res = await apiFetch('/api/graph/documents');
    if (!res.ok) throw new Error('Failed to fetch documents');
    const data = await res.json();
    return data.documents;
  } catch (err) {
    console.warn('Backend API unavailable, using local document store.', err);
    return null;
  }
}

export async function addClaimToBackend(claim: {
  category: string;
  fieldName: string;
  value: string;
  source?: string;
  evidenceDocName?: string;
  isSingular?: boolean;
  rawNumericValue?: number;
}) {
  try {
    const res = await apiFetch('/api/graph/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(claim),
    });
    if (!res.ok) throw new Error('Failed to save claim');
    const data = await res.json();
    if (data && data.record && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('syndeo_vault_records');
        const existing = cached ? JSON.parse(cached) : [];
        const filtered = Array.isArray(existing)
          ? existing.filter((r: any) => r.id !== data.record.id && (r.fieldName.toLowerCase().trim() !== data.record.fieldName.toLowerCase().trim() || r.category !== data.record.category))
          : [];
        localStorage.setItem('syndeo_vault_records', JSON.stringify([data.record, ...filtered]));
      } catch {
        // Ignore localStorage error
      }
    }
    return data;
  } catch (err) {
    console.warn('Backend API unavailable, saving locally.', err);
    if (typeof window !== 'undefined') {
      try {
        const localRec = {
          id: `rec-${Date.now()}`,
          category: claim.category || 'identity',
          fieldName: claim.fieldName,
          value: claim.value,
          source: claim.source || 'Confirmed by you',
          confidence: 'user-confirmed',
          assuranceLevel: 'LEVEL_1_USER_ASSERTED',
          lastUpdated: 'Just now',
          status: 'ACTIVE',
        };
        const cached = localStorage.getItem('syndeo_vault_records');
        const existing = cached ? JSON.parse(cached) : [];
        const filtered = Array.isArray(existing)
          ? existing.filter((r: any) => r.fieldName.toLowerCase().trim() !== claim.fieldName.toLowerCase().trim() || r.category !== claim.category)
          : [];
        localStorage.setItem('syndeo_vault_records', JSON.stringify([localRec, ...filtered]));
        return { record: localRec, conflict: null };
      } catch {
        // Ignore localStorage error
      }
    }
    return null;
  }
}

export async function uploadDocumentToBackend(file: File, category?: string, extractedText?: string) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    if (category) formData.append('category', category);
    if (extractedText) formData.append('extracted_text', extractedText);

    const res = await apiFetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Document upload failed');
    }
    return await res.json();
  } catch (err) {
    console.warn('Backend API unavailable, processing locally.', err);
    throw err;
  }
}

export async function fetchDocumentProposal(documentId: string) {
  try {
    const res = await apiFetch(`/api/documents/proposals/${documentId}`);
    if (!res.ok) throw new Error('Failed to fetch document proposal');
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch proposal.', err);
    return null;
  }
}

export async function confirmDocumentClaims(
  documentId: string,
  acceptedClaims: Array<{
    field: string;
    value: string;
    category?: string;
    is_singular?: boolean;
    is_sensitive?: boolean;
    raw_numeric_value?: number;
  }>,
  rejectedFields?: string[]
) {
  try {
    const res = await apiFetch('/api/documents/confirm-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_id: documentId,
        accepted_claims: acceptedClaims,
        rejected_claim_fields: rejectedFields || [],
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to confirm claims');
    }
    return await res.json();
  } catch (err) {
    console.warn('Failed to confirm claims with backend.', err);
    throw err;
  }
}

export async function queryGraphMemory(question: string) {
  try {
    const res = await apiFetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error('Query failed');
    return await res.json();
  } catch (err) {
    console.warn('Backend API unavailable, processing query locally.', err);
    return null;
  }
}

export async function fetchPrivacyAdvice(request: {
  recipient: string;
  purpose: string;
  requestedFields: Record<string, unknown>[];
}) {
  try {
    const res = await apiFetch('/api/privacy/advise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error('Privacy advice failed');
    return await res.json();
  } catch (err) {
    console.warn('Privacy Advisor unavailable locally.', err);
    return null;
  }
}

export async function composeSelectiveProof(shareRequest: {
  recipient: string;
  purpose: string;
  requestedFields: Record<string, unknown>[];
  expiryHours?: number;
}) {
  try {
    const res = await apiFetch('/api/proofs/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shareRequest),
    });
    if (!res.ok) throw new Error('Proof composition failed');
    return await res.json();
  } catch (err) {
    console.warn('Backend API unavailable, composing proof locally.', err);
    return null;
  }
}

export async function revokeShareLinkBackend(shareId: string) {
  try {
    const res = await apiFetch(`/api/proofs/revoke/${shareId}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Revocation failed');
    return await res.json();
  } catch (err) {
    console.warn('Backend API unavailable, revoking locally.', err);
    return null;
  }
}

export async function fetchAuditLogs() {
  try {
    const res = await apiFetch('/api/audit');
    if (!res.ok) throw new Error('Failed to fetch audit log');
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Reminder API ─────────────────────────────────────────────────────────────

const REMINDERS_KEY = 'syndeo_reminders';

const DEFAULT_INITIAL_REMINDERS: import('../types').Reminder[] = [
  {
    reminder_id: 'rem-share-expiry',
    person_id: 'local',
    title: 'SLRTCE Research Cell Share Envelope Expiry',
    description: 'Cryptographic zk-SNARK access envelope expires in 7 days.',
    category: 'deadline',
    priority: 'critical',
    due_at: new Date(Date.now() + 6 * 86400000).toISOString(),
    recurrence: 'none',
    remind_before: '3_days',
    status: 'ACTIVE',
    source_type: 'manual',
    source_label: 'SLRTCE Research Cell Share Link',
    notes: 'Divya Nair active session currently auditing transcript & certificates.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    reminder_id: 'rem-aws-cert',
    person_id: 'local',
    title: 'AWS Certified Solutions Architect Recertification',
    description: 'Renew AWS Solutions Architect Associate credential before validity expiration.',
    category: 'expiry',
    priority: 'high',
    due_at: new Date(Date.now() + 18 * 86400000).toISOString(),
    recurrence: 'none',
    remind_before: '7_days',
    status: 'ACTIVE',
    source_type: 'memory_claim',
    source_label: 'AWS Certificate ID: AWS-992384',
    notes: 'Exam voucher available through university partner account.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    reminder_id: 'rem-academic-transcript',
    person_id: 'local',
    title: 'SLRTCE Semester 7 Degree Marksheet Audit',
    description: 'Submit verified digital transcript for final year project accreditation.',
    category: 'task',
    priority: 'medium',
    due_at: new Date(Date.now() + 32 * 86400000).toISOString(),
    recurrence: 'monthly',
    remind_before: '1_day',
    status: 'ACTIVE',
    source_type: 'memory_claim',
    source_label: 'SLRTCE Academic Vault Record',
    notes: 'Verify CGPA 8.45 seal before final university export.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    reminder_id: 'rem-id-kyc',
    person_id: 'local',
    title: 'Periodic Identity & PAN Merkle Root Proof Verification',
    description: 'Re-anchor zero-knowledge state proof on-chain.',
    category: 'recurring',
    priority: 'low',
    due_at: new Date(Date.now() + 60 * 86400000).toISOString(),
    recurrence: 'monthly',
    remind_before: '1_day',
    status: 'ACTIVE',
    source_type: 'manual',
    source_label: 'Zero-Knowledge Trust Anchor',
    notes: 'Automated cryptographic verification heartbeat.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function loadLocalReminders(): import('../types').Reminder[] {
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as import('../types').Reminder[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  saveLocalReminders(DEFAULT_INITIAL_REMINDERS);
  return DEFAULT_INITIAL_REMINDERS;
}

function saveLocalReminders(reminders: import('../types').Reminder[]) {
  try {
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  } catch { /* ignore */ }
}

export async function fetchReminders(): Promise<import('../types').Reminder[]> {
  try {
    const res = await apiFetch('/api/reminders');
    if (!res.ok) throw new Error('Failed to fetch reminders');
    const data = await res.json();
    const reminders = (data.reminders ?? data) as import('../types').Reminder[];
    saveLocalReminders(reminders);
    return reminders;
  } catch {
    return loadLocalReminders();
  }
}

export async function createReminder(
  proposal: import('../types').ReminderProposal
): Promise<import('../types').Reminder | null> {
  const newReminder: import('../types').Reminder = {
    reminder_id: `rem-${crypto.randomUUID()}`,
    person_id: 'local',
    title: proposal.title,
    description: proposal.description,
    category: proposal.category,
    priority: proposal.priority,
    due_at: proposal.due_at,
    recurrence: proposal.recurrence,
    remind_before: proposal.remind_before,
    status: 'ACTIVE',
    source_claim_id: proposal.source_claim_id,
    source_type: proposal.source_type,
    source_label: proposal.source_label,
    notes: proposal.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  try {
    const res = await apiFetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proposal),
    });
    if (res.ok) {
      const data = await res.json();
      const saved = (data.reminder ?? data) as import('../types').Reminder;
      const all = loadLocalReminders().filter(r => r.reminder_id !== saved.reminder_id);
      saveLocalReminders([saved, ...all]);
      return saved;
    }
  } catch { /* fallback */ }
  // Optimistic local save
  const all = loadLocalReminders();
  saveLocalReminders([newReminder, ...all]);
  return newReminder;
}

export async function updateReminderStatus(
  reminderId: string,
  status: import('../types').ReminderStatus,
  extra?: { snoozed_until?: string }
): Promise<boolean> {
  // Optimistic local update
  const all = loadLocalReminders().map(r =>
    r.reminder_id === reminderId
      ? {
          ...r,
          status,
          updated_at: new Date().toISOString(),
          completed_at: status === 'COMPLETED' ? new Date().toISOString() : r.completed_at,
          snoozed_until: extra?.snoozed_until ?? r.snoozed_until,
        }
      : r
  );
  saveLocalReminders(all);
  try {
    const res = await apiFetch(`/api/reminders/${reminderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extra }),
    });
    return res.ok;
  } catch {
    return true; // already saved locally
  }
}

export async function deleteReminder(reminderId: string): Promise<boolean> {
  const all = loadLocalReminders().filter(r => r.reminder_id !== reminderId);
  saveLocalReminders(all);
  try {
    const res = await apiFetch(`/api/reminders/${reminderId}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return true;
  }
}

export async function fetchExpiryDetectedReminders(): Promise<import('../types').Reminder[]> {
  try {
    const res = await apiFetch('/api/reminders/expiry-detected');
    if (!res.ok) throw new Error('No expiry data');
    const data = await res.json();
    return (data.reminders ?? data) as import('../types').Reminder[];
  } catch {
    return [];
  }
}
