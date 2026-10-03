import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellOff,
  Plus,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Link2,
  Trash2,
  X,
  Check,
  Repeat,
  HeartPulse,
  AlarmClock,
  Timer,
  Star,
  Search,
  ChevronRight,
} from 'lucide-react';
import type {
  Reminder,
  ReminderCategory,
  ReminderPriority,
  ReminderRecurrence,
  ReminderProposal,
} from '../../types';
import {
  fetchReminders,
  createReminder,
  updateReminderStatus,
  deleteReminder,
} from '../../lib/api';
import { useNavigation } from '../../context/NavigationContext';

// ─── Time & Date Helpers ──────────────────────────────────────────────────────

function getRemainingLabel(dueAt: string) {
  const now = new Date();
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMs < 0) {
    const daysOverdue = Math.abs(diffDays);
    return {
      label: daysOverdue === 0 ? 'Overdue today' : `${daysOverdue}d overdue`,
      urgent: true,
      overdue: true,
      days: diffDays,
      badgeText: daysOverdue === 0 ? 'Overdue' : `${daysOverdue}d Overdue`,
    };
  }
  if (diffMins < 60) {
    return {
      label: `${Math.max(1, diffMins)}m remaining`,
      urgent: true,
      overdue: false,
      days: 0,
      badgeText: 'Due Shortly',
    };
  }
  if (diffHours < 24) {
    return {
      label: `${diffHours}h remaining`,
      urgent: true,
      overdue: false,
      days: 0,
      badgeText: 'Due Today',
    };
  }
  if (diffDays === 0) {
    return {
      label: 'Due today',
      urgent: true,
      overdue: false,
      days: 0,
      badgeText: 'Due Today',
    };
  }
  if (diffDays === 1) {
    return {
      label: 'Due tomorrow',
      urgent: true,
      overdue: false,
      days: 1,
      badgeText: '1 Day Left',
    };
  }
  if (diffDays <= 7) {
    return {
      label: `Due in ${diffDays} days`,
      urgent: true,
      overdue: false,
      days: diffDays,
      badgeText: `${diffDays}d Left`,
    };
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays <= 30) {
    return {
      label: `Due in ${diffDays} days`,
      urgent: false,
      overdue: false,
      days: diffDays,
      badgeText: `${diffDays}d Left`,
    };
  }
  return {
    label: `Due in ${diffMonths} month${diffMonths > 1 ? 's' : ''}`,
    urgent: false,
    overdue: false,
    days: diffDays,
    badgeText: `${diffMonths}mo Left`,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Meta Configurations ──────────────────────────────────────────────────────

const CAT_META: Record<
  ReminderCategory,
  { label: string; icon: React.FC<{ className?: string }>; solidColor: string; bgLight: string; bgDark: string }
> = {
  expiry: {
    label: 'Document Expiry',
    icon: AlertTriangle,
    solidColor: 'text-amber-600 dark:text-amber-400',
    bgLight: 'bg-amber-100 text-amber-800 border-amber-300',
    bgDark: 'dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
  },
  appointment: {
    label: 'Appointment',
    icon: Calendar,
    solidColor: 'text-blue-600 dark:text-blue-400',
    bgLight: 'bg-blue-100 text-blue-800 border-blue-300',
    bgDark: 'dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
  },
  birthday: {
    label: 'Birthday',
    icon: Star,
    solidColor: 'text-pink-600 dark:text-pink-400',
    bgLight: 'bg-pink-100 text-pink-800 border-pink-300',
    bgDark: 'dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800/60',
  },
  anniversary: {
    label: 'Anniversary',
    icon: Sparkles,
    solidColor: 'text-purple-600 dark:text-purple-400',
    bgLight: 'bg-purple-100 text-purple-800 border-purple-300',
    bgDark: 'dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60',
  },
  task: {
    label: 'Vault Task',
    icon: CheckCircle2,
    solidColor: 'text-emerald-600 dark:text-emerald-400',
    bgLight: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    bgDark: 'dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
  },
  medication: {
    label: 'Health & Medical',
    icon: HeartPulse,
    solidColor: 'text-rose-600 dark:text-rose-400',
    bgLight: 'bg-rose-100 text-rose-800 border-rose-300',
    bgDark: 'dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
  },
  deadline: {
    label: 'Strict Deadline',
    icon: Timer,
    solidColor: 'text-red-600 dark:text-red-400',
    bgLight: 'bg-red-100 text-red-800 border-red-300',
    bgDark: 'dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60',
  },
  recurring: {
    label: 'Periodic Audit',
    icon: Repeat,
    solidColor: 'text-cyan-600 dark:text-cyan-400',
    bgLight: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    bgDark: 'dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/60',
  },
  special: {
    label: 'Special Event',
    icon: Star,
    solidColor: 'text-indigo-600 dark:text-indigo-400',
    bgLight: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    bgDark: 'dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60',
  },
  other: {
    label: 'General Notice',
    icon: Bell,
    solidColor: 'text-zinc-600 dark:text-zinc-400',
    bgLight: 'bg-zinc-100 text-zinc-800 border-zinc-300',
    bgDark: 'dark:bg-zinc-900/60 dark:text-zinc-300 dark:border-zinc-700',
  },
};

const PRI_META: Record<
  ReminderPriority,
  { label: string; badgeClass: string; barClass: string }
> = {
  critical: {
    label: 'Critical Priority',
    badgeClass: 'bg-red-600 text-white border-red-700 shadow-xs',
    barClass: 'bg-red-600',
  },
  high: {
    label: 'High Priority',
    badgeClass: 'bg-orange-500 text-white border-orange-600 shadow-xs',
    barClass: 'bg-orange-500',
  },
  medium: {
    label: 'Medium',
    badgeClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-400/40',
    barClass: 'bg-amber-500',
  },
  low: {
    label: 'Low',
    badgeClass: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700',
    barClass: 'bg-zinc-400 dark:bg-zinc-600',
  },
};

const CATS: ReminderCategory[] = [
  'expiry',
  'task',
  'deadline',
  'recurring',
  'appointment',
  'medication',
  'birthday',
  'anniversary',
  'special',
  'other',
];

const PRIS: ReminderPriority[] = ['critical', 'high', 'medium', 'low'];
const RECS: ReminderRecurrence[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const BEFORE_OPTS = [
  { v: '', l: 'At exact due time' },
  { v: '15_minutes', l: '15 minutes before' },
  { v: '1_hour', l: '1 hour before' },
  { v: '3_hours', l: '3 hours before' },
  { v: '1_day', l: '1 day before' },
  { v: '3_days', l: '3 days before' },
  { v: '7_days', l: '1 week before' },
  { v: '14_days', l: '2 weeks before' },
  { v: '30_days', l: '1 month before' },
];

// ─── Status Pill Component ────────────────────────────────────────────────────

function StatusPill({ status }: { status: Reminder['status'] }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Active
        </span>
      );
    case 'OVERDUE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-600 text-white border border-red-700 shadow-xs animate-pulse">
          <AlertTriangle className="w-3 h-3" />
          Overdue
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          Completed
        </span>
      );
    case 'SNOOZED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
          <Clock className="w-3 h-3" />
          Snoozed
        </span>
      );
    case 'DISMISSED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-900 text-zinc-400 border border-zinc-200 dark:border-zinc-800">
          <BellOff className="w-3 h-3" />
          Dismissed
        </span>
      );
  }
}

// ─── Create Reminder Modal ────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreate: (p: ReminderProposal) => Promise<void>;
  saving: boolean;
}

const CreateModal: React.FC<CreateModalProps> = ({ onClose, onCreate, saving }) => {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [dateStr, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [timeStr, setTime] = useState('09:00');
  const [cat, setCat] = useState<ReminderCategory>('expiry');
  const [pri, setPri] = useState<ReminderPriority>('high');
  const [rec, setRec] = useState<ReminderRecurrence>('none');
  const [before, setBefore] = useState('3_days');
  const [sourceLabel, setSourceLabel] = useState('Vault Credential Record');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErr('Reminder title is required.');
      return;
    }
    if (!dateStr) {
      setErr('Due date is required.');
      return;
    }
    const due = new Date(`${dateStr}T${timeStr || '09:00'}:00`);
    if (isNaN(due.getTime())) {
      setErr('Invalid date selection.');
      return;
    }
    setErr('');
    await onCreate({
      title: title.trim(),
      description: desc.trim() || undefined,
      category: cat,
      priority: pri,
      due_at: due.toISOString(),
      recurrence: rec,
      remind_before: before || undefined,
      source_type: 'manual',
      source_label: sourceLabel.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const applyPreset = (presetTitle: string, presetCat: ReminderCategory, presetPri: ReminderPriority, daysFromNow: number) => {
    setTitle(presetTitle);
    setCat(presetCat);
    setPri(presetPri);
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setDate(d.toISOString().split('T')[0]);
  };

  const inputClass =
    'w-full bg-zinc-50 dark:bg-[#161622] border border-zinc-300 dark:border-[#2f2e42] rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#5a25eb]/40 focus:border-[#5a25eb] transition-all font-medium';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, y: 15, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 15, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-xl bg-white dark:bg-[#111118] border border-zinc-200 dark:border-[#262536] rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-[#201f2e] bg-zinc-50/50 dark:bg-[#151520]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#5a25eb] text-white flex items-center justify-center shadow-xs">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Create New Reminder</h2>
              <p className="text-xs text-zinc-500 dark:text-[#8c879a]">Set alerts for vault documents, certificates & deadlines</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="px-6 pt-4 pb-2 border-b border-zinc-100 dark:border-[#1e1d2c] bg-zinc-50/30 dark:bg-[#13131d]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-[#8c879a] block mb-2">
            Quick Templates:
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              type="button"
              onClick={() => applyPreset('Academic Transcript Renewal', 'expiry', 'high', 30)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-[#1c1b29] hover:bg-[#5a25eb]/10 dark:hover:bg-[#5a25eb]/20 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-[#2f2e42] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              🎓 Academic Audit
            </button>
            <button
              type="button"
              onClick={() => applyPreset('Certification Recertification Exam', 'deadline', 'critical', 14)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-[#1c1b29] hover:bg-[#5a25eb]/10 dark:hover:bg-[#5a25eb]/20 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-[#2f2e42] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              📜 Credential Expiry
            </button>
            <button
              type="button"
              onClick={() => applyPreset('Zero-Knowledge Trust Anchor Check', 'recurring', 'low', 60)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-[#1c1b29] hover:bg-[#5a25eb]/10 dark:hover:bg-[#5a25eb]/20 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-[#2f2e42] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              🛡️ ZK Proof Heartbeat
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={submit} className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
              Reminder Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AWS Certification Recertification or Degree Verification"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
              Description / Action Details
            </label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional summary of required action"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
                Due Date *
              </label>
              <input
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
                Due Time
              </label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
                Category
              </label>
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value as ReminderCategory)}
                className={inputClass}
              >
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {CAT_META[c].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
                Priority Level
              </label>
              <select
                value={pri}
                onChange={(e) => setPri(e.target.value as ReminderPriority)}
                className={inputClass}
              >
                {PRIS.map((p) => (
                  <option key={p} value={p}>
                    {PRI_META[p].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
                Repeat Interval
              </label>
              <select
                value={rec}
                onChange={(e) => setRec(e.target.value as ReminderRecurrence)}
                className={inputClass}
              >
                {RECS.map((r) => (
                  <option key={r} value={r}>
                    {r === 'none' ? 'One-time only' : `Repeat ${r.charAt(0).toUpperCase() + r.slice(1)}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
                Advance Notification
              </label>
              <select
                value={before}
                onChange={(e) => setBefore(e.target.value)}
                className={inputClass}
              >
                {BEFORE_OPTS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
              Vault Link / Document Source
            </label>
            <input
              type="text"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="e.g. SLRTCE Academic Vault Record or AWS Certificate"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200 mb-1.5">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instructions, credential numbers, or renewal links..."
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          {err && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-[#201f2e]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-[#333246] hover:bg-zinc-100 dark:hover:bg-[#1d1c2b] text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-bold transition-all shadow-md shadow-[#5a25eb]/25 flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              <span>{saving ? 'Creating Reminder...' : 'Create Reminder'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// ─── Detail Modal ─────────────────────────────────────────────────────────────

interface DetailProps {
  reminder: Reminder;
  onClose: () => void;
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
  onDelete: (id: string) => void;
}

const DetailPanel: React.FC<DetailProps> = ({
  reminder,
  onClose,
  onComplete,
  onSnooze,
  onDelete,
}) => {
  const catM = CAT_META[reminder.category];
  const priM = PRI_META[reminder.priority];
  const CatIcon = catM.icon;
  const { label: remLabel, overdue, badgeText } = getRemainingLabel(reminder.due_at);
  const timeStr = formatTime(reminder.due_at);
  const isActive = reminder.status === 'ACTIVE' || reminder.status === 'OVERDUE';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xs" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, y: 15, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 15, opacity: 0 }}
        className="relative z-10 w-full max-w-lg bg-white dark:bg-[#111118] border border-zinc-200 dark:border-[#262536] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-zinc-200 dark:border-[#201f2e] flex items-start justify-between gap-4 bg-zinc-50/50 dark:bg-[#151520]">
          <div className="flex items-start gap-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${catM.bgLight} ${catM.bgDark}`}>
              <CatIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <StatusPill status={reminder.status} />
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${priM.badgeClass}`}>
                  {priM.label}
                </span>
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">
                {reminder.title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {reminder.description && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300 font-medium leading-relaxed bg-zinc-50 dark:bg-[#161622] p-3 rounded-xl border border-zinc-200 dark:border-[#262536]">
              {reminder.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161622] border border-zinc-200 dark:border-[#262536] space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Due Date</span>
              <span className="font-bold text-zinc-900 dark:text-white text-sm block">
                {formatDate(reminder.due_at)}
              </span>
              {timeStr && <span className="text-zinc-500 font-medium block">at {timeStr}</span>}
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161622] border border-zinc-200 dark:border-[#262536] space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Time Left</span>
              <span className={`font-bold text-sm block ${overdue ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {badgeText}
              </span>
              <span className="text-zinc-500 font-medium block">{remLabel}</span>
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-zinc-100 dark:border-[#1e1d2c]">
            {reminder.source_label && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-zinc-500 font-semibold flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" /> Source / Document
                </span>
                <span className="font-bold text-[#5a25eb] dark:text-[#cbbeff]">{reminder.source_label}</span>
              </div>
            )}

            {reminder.remind_before && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-zinc-500 font-semibold flex items-center gap-1.5">
                  <AlarmClock className="w-3.5 h-3.5" /> Alert Before
                </span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{reminder.remind_before.replace(/_/g, ' ')}</span>
              </div>
            )}

            {reminder.recurrence !== 'none' && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-zinc-500 font-semibold flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5" /> Recurrence
                </span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400 capitalize">{reminder.recurrence}</span>
              </div>
            )}
          </div>

          {reminder.notes && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs">
              <strong className="block font-bold mb-1">Notes:</strong>
              <p className="leading-relaxed">{reminder.notes}</p>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="p-6 pt-3 border-t border-zinc-200 dark:border-[#201f2e] bg-zinc-50/50 dark:bg-[#151520] flex items-center justify-between gap-2.5">
          <button
            onClick={() => onDelete(reminder.reminder_id)}
            className="px-3.5 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          <div className="flex items-center gap-2">
            {isActive ? (
              <>
                <button
                  onClick={() => onSnooze(reminder.reminder_id)}
                  className="px-3.5 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Snooze 1d</span>
                </button>
                <button
                  onClick={() => onComplete(reminder.reminder_id)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Mark Complete</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => onComplete(reminder.reminder_id)}
                className="px-4 py-2 rounded-xl bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Re-Activate Reminder
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Reminder Card Component ──────────────────────────────────────────────────

interface CardProps {
  reminder: Reminder;
  onView: (r: Reminder) => void;
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
}

const ReminderCard: React.FC<CardProps> = ({
  reminder,
  onView,
  onComplete,
  onSnooze,
  onDelete,
}) => {
  const catM = CAT_META[reminder.category];
  const priM = PRI_META[reminder.priority];
  const CatIcon = catM.icon;
  const { label: remLabel, urgent, overdue } = getRemainingLabel(reminder.due_at);
  const timeStr = formatTime(reminder.due_at);
  const isActive = reminder.status === 'ACTIVE' || reminder.status === 'OVERDUE';
  const isCompleted = reminder.status === 'COMPLETED';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15 }}
      onClick={() => onView(reminder)}
      className={`group relative rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden shadow-xs ${
        isCompleted
          ? 'bg-zinc-50 dark:bg-[#101017] border-zinc-200 dark:border-[#1d1d28] opacity-75'
          : overdue
          ? 'bg-white dark:bg-[#12121c] border-red-500/40 shadow-red-500/5'
          : urgent
          ? 'bg-white dark:bg-[#12121c] border-amber-500/30'
          : 'bg-white dark:bg-[#12121c] border-zinc-200 dark:border-[#222132] hover:border-zinc-300 dark:hover:border-[#323146]'
      }`}
    >
      {/* Solid Left Accent Stripe */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[4px] rounded-l-2xl ${
          isCompleted ? 'bg-zinc-300 dark:bg-zinc-700' : priM.barClass
        }`}
      />

      <div className="pl-5 pr-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            {/* Category Icon Capsule */}
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                isCompleted ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700' : `${catM.bgLight} ${catM.bgDark}`
              }`}
            >
              <CatIcon className="w-4.5 h-4.5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h4
                  className={`text-sm font-bold truncate leading-tight ${
                    isCompleted
                      ? 'line-through text-zinc-500 dark:text-zinc-500'
                      : 'text-zinc-900 dark:text-white'
                  }`}
                >
                  {reminder.title}
                </h4>
                <StatusPill status={reminder.status} />
              </div>

              {reminder.description && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 mb-2">
                  {reminder.description}
                </p>
              )}

              {/* Metadata Badges */}
              <div className="flex items-center gap-2.5 flex-wrap pt-0.5">
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                    overdue
                      ? 'text-red-600 dark:text-red-400'
                      : urgent
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {remLabel}
                </span>

                <span className="text-zinc-300 dark:text-zinc-700">•</span>

                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  <Calendar className="w-3 h-3" />
                  {formatDate(reminder.due_at)}
                  {timeStr && ` (${timeStr})`}
                </span>

                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${priM.badgeClass}`}>
                  {priM.label}
                </span>

                {reminder.source_label && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#5a25eb] dark:text-[#cbbeff] bg-[#5a25eb]/10 px-2 py-0.5 rounded-md border border-[#5a25eb]/20 truncate max-w-[200px]">
                    <Link2 className="w-3 h-3 shrink-0" />
                    {reminder.source_label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div
            className="flex items-center gap-2 shrink-0 self-center"
            onClick={(e) => e.stopPropagation()}
          >
            {isActive ? (
              <>
                <button
                  onClick={() => onComplete(reminder.reminder_id)}
                  title="Mark as Completed"
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="hidden sm:inline">Complete</span>
                </button>
                <button
                  onClick={() => onSnooze(reminder.reminder_id)}
                  title="Snooze 1 Day"
                  className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-[#333246] hover:bg-zinc-100 dark:hover:bg-[#1d1c2b] text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Snooze</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => onComplete(reminder.reminder_id)}
                className="px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Re-open
              </button>
            )}

            <button
              onClick={() => onDelete(reminder.reminder_id)}
              title="Delete Reminder"
              className="p-1.5 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Main Reminders Page Component ────────────────────────────────────────────

export const RemindersPage: React.FC = () => {
  const { navigate } = useNavigation();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Reminder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tab, setTab] = useState<'all' | 'needs_attention' | 'upcoming' | 'recurring' | 'completed'>('all');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReminders();
      const now = new Date();
      setReminders(
        data.map((r) => ({
          ...r,
          status: r.status === 'ACTIVE' && new Date(r.due_at) < now ? ('OVERDUE' as const) : r.status,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = new Date();
  const needsAttn = reminders
    .filter(
      (r) =>
        r.status === 'OVERDUE' ||
        (r.status === 'ACTIVE' && new Date(r.due_at).getTime() - now.getTime() < 14 * 86400000)
    )
    .sort((a, b) => {
      if (a.status === 'OVERDUE' && b.status !== 'OVERDUE') return -1;
      if (b.status === 'OVERDUE' && a.status !== 'OVERDUE') return 1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });

  const upcoming = reminders
    .filter((r) => r.status === 'ACTIVE')
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  const recurring = reminders.filter(
    (r) => r.recurrence !== 'none' && (r.status === 'ACTIVE' || r.status === 'SNOOZED')
  );

  const completed = reminders.filter((r) => r.status === 'COMPLETED' || r.status === 'DISMISSED');

  const activeCount = reminders.filter((r) => r.status === 'ACTIVE').length;
  const overdueCount = reminders.filter((r) => r.status === 'OVERDUE').length;
  const snoozedCount = reminders.filter((r) => r.status === 'SNOOZED').length;
  const completedCount = completed.length;

  const TABS = [
    { id: 'all' as const, label: 'All Reminders', count: reminders.length },
    { id: 'needs_attention' as const, label: 'Needs Attention', count: needsAttn.length, isUrgent: overdueCount > 0 },
    { id: 'upcoming' as const, label: 'Upcoming', count: upcoming.length },
    { id: 'recurring' as const, label: 'Recurring', count: recurring.length },
    { id: 'completed' as const, label: 'Completed', count: completed.length },
  ];

  const filteredList = useMemo(() => {
    let baseList =
      tab === 'all'
        ? reminders
        : tab === 'needs_attention'
        ? needsAttn
        : tab === 'upcoming'
        ? upcoming
        : tab === 'recurring'
        ? recurring
        : completed;

    if (categoryFilter !== 'all') {
      baseList = baseList.filter((r) => r.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      baseList = baseList.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.source_label?.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
      );
    }

    return baseList;
  }, [tab, reminders, needsAttn, upcoming, recurring, completed, categoryFilter, searchQuery]);

  const doStatus = async (
    id: string,
    status: Reminder['status'],
    extra?: { snoozed_until?: string }
  ) => {
    setReminders((p) =>
      p.map((r) =>
        r.reminder_id === id
          ? { ...r, status, updated_at: new Date().toISOString(), ...(extra ?? {}) }
          : r
      )
    );
    setSelected(null);
    await updateReminderStatus(id, status, extra);
    showToast(status === 'COMPLETED' ? 'Reminder marked as completed.' : status === 'SNOOZED' ? 'Reminder snoozed by 1 day.' : 'Reminder updated.');
  };

  const snooze = (id: string) => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    void doStatus(id, 'SNOOZED', { snoozed_until: t.toISOString() });
  };

  const del = async (id: string) => {
    setReminders((p) => p.filter((r) => r.reminder_id !== id));
    setSelected(null);
    await deleteReminder(id);
    showToast('Reminder deleted.');
  };

  const handleCreate = async (p: ReminderProposal) => {
    setCreating(true);
    try {
      const r = await createReminder(p);
      if (r) {
        setReminders((prev) => [r, ...prev]);
        showToast('New reminder successfully created!');
        setShowCreate(false);
      }
    } catch {
      showToast('Failed to create reminder.', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`fixed top-6 right-6 z-[300] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold text-white border ${
              toast.type === 'success'
                ? 'bg-emerald-600 border-emerald-500'
                : 'bg-red-600 border-red-500'
            }`}
          >
            {toast.type === 'success' ? <Check className="w-4 h-4 stroke-[2.5]" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-[#232230]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#5a25eb] text-white flex items-center justify-center shadow-md shadow-[#5a25eb]/20">
              <Bell className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Vault Reminders
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
              Automated Lifecycle
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-[#8c879a] mt-1">
            Track document expiries, verification renewal deadlines, and academic accreditation tasks.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 rounded-xl bg-[#5a25eb] hover:bg-[#6b37fa] text-white font-semibold text-sm transition-all shadow-md shadow-[#5a25eb]/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Reminder</span>
          </button>
        </div>
      </div>

      {/* Solid KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#12121a] border border-zinc-200 dark:border-[#232232] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 dark:text-[#8c879a] uppercase tracking-wider">Active</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{activeCount}</p>
          <span className="text-[11px] text-zinc-500">Live vault schedules</span>
        </div>

        <div className={`p-4 rounded-2xl border shadow-xs space-y-1 ${overdueCount > 0 ? 'bg-red-500/[0.06] border-red-500/30' : 'bg-white dark:bg-[#12121a] border-zinc-200 dark:border-[#232232]'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 dark:text-[#8c879a] uppercase tracking-wider">Overdue</span>
            <AlertTriangle className={`w-3.5 h-3.5 ${overdueCount > 0 ? 'text-red-500' : 'text-zinc-400'}`} />
          </div>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-white'}`}>{overdueCount}</p>
          <span className="text-[11px] text-zinc-500">Requires prompt action</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#12121a] border border-zinc-200 dark:border-[#232232] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 dark:text-[#8c879a] uppercase tracking-wider">Snoozed</span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{snoozedCount}</p>
          <span className="text-[11px] text-zinc-500">Postponed alerts</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#12121a] border border-zinc-200 dark:border-[#232232] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 dark:text-[#8c879a] uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{completedCount}</p>
          <span className="text-[11px] text-zinc-500">Resolved items</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Segmented Tab Controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-zinc-100 dark:bg-[#161622] rounded-xl border border-zinc-200 dark:border-[#28273a] scrollbar-none">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? 'bg-white dark:bg-[#252436] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-[#8c879a] hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      t.isUrgent
                        ? 'bg-red-600 text-white'
                        : active
                        ? 'bg-[#5a25eb] text-white'
                        : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reminders..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-[#12121a] border border-zinc-200 dark:border-[#2b2a3a] rounded-xl text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-[#5a25eb]"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white dark:bg-[#12121a] border border-zinc-200 dark:border-[#2b2a3a] rounded-xl text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-[#5a25eb] cursor-pointer"
          >
            <option value="all">All Categories</option>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {CAT_META[c].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Reminder Cards Feed */}
      {loading ? (
        <div className="p-16 text-center space-y-3 bg-white dark:bg-[#12121a] rounded-3xl border border-zinc-200 dark:border-[#232232]">
          <Loader2 className="w-8 h-8 text-[#5a25eb] animate-spin mx-auto" />
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Synchronizing Vault Reminders...</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-14 text-center rounded-3xl bg-white dark:bg-[#12121a] border border-dashed border-zinc-300 dark:border-[#252436] space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#5a25eb]/10 text-[#5a25eb] flex items-center justify-center mx-auto">
            <Bell className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">No reminders found</h3>
            <p className="text-xs text-zinc-500 dark:text-[#8c879a] max-w-sm mx-auto">
              {searchQuery || categoryFilter !== 'all'
                ? 'No reminders match your current search and filter criteria.'
                : 'You have no scheduled reminders in this section. Create one to keep track of critical document validity.'}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Reminder</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredList.map((reminder) => (
              <ReminderCard
                key={reminder.reminder_id}
                reminder={reminder}
                onView={setSelected}
                onComplete={(id) => void doStatus(id, reminder.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED')}
                onSnooze={snooze}
                onDismiss={(id) => void doStatus(id, 'DISMISSED')}
                onDelete={del}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* AI Memory Chat Prompt Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#5a25eb]/[0.07] to-transparent dark:from-[#5a25eb]/[0.12] border border-[#5a25eb]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#5a25eb] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Natural Language AI Reminder Commands</h4>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              Type in AI Chat: <em className="text-zinc-800 dark:text-zinc-200">"Remind me 7 days before my SLRTCE project submission"</em>
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/chat')}
          className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1a1928] hover:bg-zinc-100 dark:hover:bg-[#252438] text-[#5a25eb] dark:text-[#cbbeff] border border-zinc-200 dark:border-white/10 text-xs font-bold transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <span>Open AI Chat</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreate && (
          <CreateModal
            onClose={() => setShowCreate(false)}
            onCreate={handleCreate}
            saving={creating}
          />
        )}
        {selected && (
          <DetailPanel
            reminder={selected}
            onClose={() => setSelected(null)}
            onComplete={(id: string) => void doStatus(id, selected.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED')}
            onSnooze={snooze}
            onDelete={del}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default RemindersPage;
