export type LifeStageCategory = 'identity' | 'education' | 'employment' | 'finance' | 'healthcare';

export type ConfidenceType = 'evidence-backed' | 'user-confirmed' | 'unverified' | 'unknown';

export interface RecordField {
  id: string;
  category: LifeStageCategory;
  fieldName: string;
  value: string;
  source: 'Extracted from document' | 'Confirmed by you' | 'Not provided';
  evidenceDocName?: string;
  evidenceDocHash?: string;
  lastUpdated: string;
  confidence: ConfidenceType;
  isSensitive?: boolean;
}

export interface DocumentItem {
  id: string;
  name: string;
  category: LifeStageCategory;
  fileType: string;
  fileSize: string;
  uploadDate: string;
  extractedFieldsCount: number;
  status: 'Parsed' | 'Processing' | 'Needs Review' | 'Stored locally';
  sha256Hash?: string;
}

export interface CandidateClaim {
  id: string;
  category: LifeStageCategory;
  fieldName: string;
  value: string;
  status: 'pending' | 'accepted' | 'rejected';
  isEditing?: boolean;
  editedValue?: string;
  evidenceDocName?: string;
  evidenceDocHash?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sourceType?: 'evidence-backed' | 'user-confirmed' | 'unknown';
  sourceNote?: string;
  evidenceDoc?: string;
  attachment?: {
    name: string;
    size: string;
    type: string;
  };
  candidateClaims?: CandidateClaim[];
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messages: ChatMessage[];
}

export interface AccessViewer {
  id: string;
  userName: string;
  roleOrOrg: string;
  avatar?: string;
  viewedAt: string;
  ipLocation: string;
  verificationStatus: 'zk-verified' | 'authorized';
  email?: string;
}

export type OrganizationType =
  | 'Company'
  | 'University/College'
  | 'Hospital/Healthcare'
  | 'Bank/Financial'
  | 'Government'
  | 'NGO'
  | 'Other';

export type SharePurpose = 'Hiring' | 'Verification' | 'Admissions' | 'Healthcare' | 'Financial services' | 'Other';

export interface OrganizationAccessProfile {
  fullName: string;
  workEmail: string;
  organizationName: string;
  organizationType: OrganizationType;
  role: string;
  department: string;
  website: string;
  purpose: SharePurpose;
}

export interface AccessRequestItem {
  id: string;
  requesterName: string;
  organization: string;
  requestedFields: string[];
  purpose: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'declined' | 'revoked';
  profile?: OrganizationAccessProfile;
  organizationId?: string;
  organizationMemberId?: string;
}

export interface SharedLink {
  id: string;
  shareId?: string;
  recipient: string;
  recipientLogo?: string;
  fieldsShared: string[];
  createdAt: string;
  expiry: string;
  status: 'Active' | 'Revoked' | 'Expired';
  accessCount: number;
  viewers?: AccessViewer[];
  accessRequests?: AccessRequestItem[];
  sharedDocumentIds?: string[];
  sharedDocuments?: DocumentItem[];
  sharedFields?: Array<{
    id: string;
    label: string;
    value: string;
    category: string;
    signature?: string;
  }>;
}

export interface ShareRequest {
  id: string;
  requesterName: string;
  requesterType: string;
  purpose: string;
  requestedFields: {
    key: string;
    label: string;
    category: LifeStageCategory;
    isRequired: boolean;
    defaultValue: string;
    isEvidenceBacked: boolean;
  }[];
}

export interface OCRTextBlock {
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface OCRPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  blocks: OCRTextBlock[];
  method?: 'ocr' | 'document-text';
}

export interface OCRDocumentResult {
  documentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  status: 'processing' | 'completed' | 'failed';
  pages: OCRPageResult[];
  fullText: string;
  extractionMethod?: 'ocr' | 'document-text' | 'mixed';
  processingTimeMs?: number;
  error?: string;
}

// ─── Reminder System Types ────────────────────────────────────────────────────

export type ReminderStatus = 'ACTIVE' | 'COMPLETED' | 'SNOOZED' | 'DISMISSED' | 'OVERDUE';

export type ReminderPriority = 'critical' | 'high' | 'medium' | 'low';

export type ReminderCategory =
  | 'expiry'
  | 'appointment'
  | 'birthday'
  | 'anniversary'
  | 'task'
  | 'medication'
  | 'deadline'
  | 'recurring'
  | 'special'
  | 'other';

export type ReminderRecurrence =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

export type ReminderSourceType = 'memory_claim' | 'manual' | 'chat';

export interface Reminder {
  reminder_id: string;
  person_id: string;
  title: string;
  description?: string;
  category: ReminderCategory;
  priority: ReminderPriority;
  due_at: string; // ISO 8601
  timezone?: string;
  recurrence: ReminderRecurrence;
  remind_before?: string; // e.g. '7_days', '1_hour', '30_minutes'
  status: ReminderStatus;
  source_claim_id?: string;
  source_type: ReminderSourceType;
  source_label?: string; // e.g. "Personal Memory → Driving License"
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  snoozed_until?: string;
}

export interface ReminderProposal {
  title: string;
  description?: string;
  due_at: string;
  remind_before?: string;
  recurrence: ReminderRecurrence;
  priority: ReminderPriority;
  category: ReminderCategory;
  notes?: string;
  source_claim_id?: string;
  source_type: ReminderSourceType;
  source_label?: string;
}

export interface ReminderAuditEvent {
  event: string;
  reminder_id: string;
  timestamp: string;
}
