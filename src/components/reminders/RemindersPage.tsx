import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Eye,
  X,
  Check,
  Repeat,
  HeartPulse,
  AlarmClock,
  Timer,
  Star,
  TrendingUp,
  Edit3,
  ChevronRight,
  Shield,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRemainingLabel(dueAt: string) {
  const now = new Date();
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMs < 0) return { label: `${Math.abs(diffDays)} days overdue`, urgent: true, overdue: true, days: diffDays };
  if (diffMins < 60) return { label: `${diffMins}m remaining`, urgent: true, overdue: false, days: 0 };
  if (diffHours < 24) return { label: `${diffHours}h remaining`, urgent: true, overdue: false, days: 0 };
  if (diffDays === 0) return { label: 'Due today', urgent: true, overdue: false, days: 0 };
  if (diffDays === 1) return { label: '1 day remaining', urgent: true, overdue: false, days: 1 };
  if (diffDays <= 7) return { label: `${diffDays} days remaining`, urgent: true, overdue: false, days: diffDays };
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays <= 30) return { label: `${diffDays} days remaining`, urgent: false, overdue: false, days: diffDays };
  return { label: `${diffMonths} month${diffMonths > 1 ? 's' : ''} remaining`, urgent: false, overdue: false, days: diffDays };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  if (h === 0 && m === 0) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const CAT_META: Record<ReminderCategory, { label: string; icon: React.FC<{ className?: string }>; color: string }> = {
  expiry:      { label: 'Expiry',      icon: AlertTriangle, color: 'text-orange-400' },
  appointment: { label: 'Appointment', icon: Calendar,      color: 'text-blue-400'   },
  birthday:    { label: 'Birthday',    icon: Star,          color: 'text-pink-400'   },
  anniversary: { label: 'Anniversary', icon: Sparkles,      color: 'text-violet-400' },
  task:        { label: 'Task',        icon: CheckCircle2,  color: 'text-emerald-400'},
  medication:  { label: 'Medication',  icon: HeartPulse,    color: 'text-red-400'    },
  deadline:    { label: 'Deadline',    icon: Timer,         color: 'text-amber-400'  },
  recurring:   { label: 'Recurring',   icon: Repeat,        color: 'text-cyan-400'   },
  special:     { label: 'Special',     icon: Star,          color: 'text-yellow-400' },
  other:       { label: 'Other',       icon: Bell,          color: 'text-zinc-400'   },
};

const PRI_META: Record<ReminderPriority, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'Critical', color: 'text-red-400',    bg: 'bg-red-500/15',    border: 'border-red-500/30'    },
  high:     { label: 'High',     color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30' },
  medium:   { label: 'Medium',   color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/30'  },
  low:      { label: 'Low',      color: 'text-zinc-400',   bg: 'bg-zinc-500/15',   border: 'border-zinc-500/20'   },
};

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: Reminder['status'] }) {
  const map = {
    ACTIVE:    { label: 'Active',    c: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    COMPLETED: { label: 'Completed', c: 'text-zinc-400',    bg: 'bg-zinc-500/15'    },
    SNOOZED:   { label: 'Snoozed',   c: 'text-amber-400',   bg: 'bg-amber-500/15'   },
    DISMISSED: { label: 'Dismissed', c: 'text-zinc-500',    bg: 'bg-zinc-600/10'    },
    OVERDUE:   { label: 'Overdue',   c: 'text-red-400',     bg: 'bg-red-500/15'     },
  }[status];
  return <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${map.c} ${map.bg}`}>{map.label}</span>;
}

// ─── QuickCreate Modal ────────────────────────────────────────────────────────

const CATS: ReminderCategory[] = ['expiry','appointment','birthday','anniversary','task','medication','deadline','recurring','special','other'];
const PRIS: ReminderPriority[] = ['critical','high','medium','low'];
const RECS: ReminderRecurrence[] = ['none','daily','weekly','monthly','yearly'];
const BEFORE_OPTS = [
  { v: '', l: 'At due time' }, { v: '15_minutes', l: '15 min before' },
  { v: '1_hour', l: '1 hr before' }, { v: '3_hours', l: '3 hrs before' },
  { v: '1_day', l: '1 day before' }, { v: '3_days', l: '3 days before' },
  { v: '7_days', l: '1 week before' }, { v: '14_days', l: '2 weeks before' },
  { v: '30_days', l: '1 month before' },
];

interface CreateModalProps { onClose: () => void; onCreate: (p: ReminderProposal) => Promise<void>; saving: boolean; }

const CreateModal: React.FC<CreateModalProps> = ({ onClose, onCreate, saving }) => {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [dateStr, setDate] = useState('');
  const [timeStr, setTime] = useState('');
  const [cat, setCat] = useState<ReminderCategory>('task');
  const [pri, setPri] = useState<ReminderPriority>('medium');
  const [rec, setRec] = useState<ReminderRecurrence>('none');
  const [before, setBefore] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr('Title is required'); return; }
    if (!dateStr) { setErr('Date is required'); return; }
    const due = new Date(`${dateStr}T${timeStr || '09:00'}:00`);
    if (isNaN(due.getTime())) { setErr('Invalid date'); return; }
    setErr('');
    await onCreate({ title: title.trim(), description: desc || undefined, category: cat, priority: pri, due_at: due.toISOString(), recurrence: rec, remind_before: before || undefined, notes: notes || undefined, source_type: 'manual' });
  };

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#5a25eb]/50 transition-colors";
  const selectClass = `${inputClass} cursor-pointer`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }} className="relative z-10 w-full max-w-lg bg-[#0c0c14] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-[#5a25eb]/20 flex items-center justify-center"><Bell className="w-3.5 h-3.5 text-[#cbbeff]" /></div>
            <span className="text-sm font-bold text-white">New Reminder</span>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-lg flex items-center justify-center bg-white/8 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto max-h-[72vh]">
          {field('Title *', <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. License Renewal" className={inputClass} />)}
          {field('Description', <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description" className={inputClass} />)}
          <div className="grid grid-cols-2 gap-3">
            {field('Date *', <input type="date" value={dateStr} onChange={e => setDate(e.target.value)} className={inputClass} style={{ colorScheme: 'dark' }} />)}
            {field('Time', <input type="time" value={timeStr} onChange={e => setTime(e.target.value)} className={inputClass} style={{ colorScheme: 'dark' }} />)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('Category', <select value={cat} onChange={e => setCat(e.target.value as ReminderCategory)} className={selectClass} style={{ colorScheme: 'dark' }}>{CATS.map(c => <option key={c} value={c}>{CAT_META[c].label}</option>)}</select>)}
            {field('Priority', <select value={pri} onChange={e => setPri(e.target.value as ReminderPriority)} className={selectClass} style={{ colorScheme: 'dark' }}>{PRIS.map(p => <option key={p} value={p}>{PRI_META[p].label}</option>)}</select>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('Repeat', <select value={rec} onChange={e => setRec(e.target.value as ReminderRecurrence)} className={selectClass} style={{ colorScheme: 'dark' }}>{RECS.map(r => <option key={r} value={r}>{r === 'none' ? 'No repeat' : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</select>)}
            {field('Remind me before', <select value={before} onChange={e => setBefore(e.target.value)} className={selectClass} style={{ colorScheme: 'dark' }}>{BEFORE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>)}
          </div>
          {field('Notes', <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} className={`${inputClass} resize-none`} />)}
          {err && <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/25"><AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" /><span className="text-xs text-red-300">{err}</span></div>}
          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#5a25eb] hover:bg-[#6b35f0] disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
              {saving ? 'Creating…' : 'Create Reminder'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailProps { reminder: Reminder; onClose: () => void; onComplete: (id: string) => void; onSnooze: (id: string) => void; onDismiss: (id: string) => void; onDelete: (id: string) => void; }

const DetailPanel: React.FC<DetailProps> = ({ reminder, onClose, onComplete, onSnooze, onDismiss, onDelete }) => {
  const catM = CAT_META[reminder.category];
  const priM = PRI_META[reminder.priority];
  const CatIcon = catM.icon;
  const { label: remLabel, overdue } = getRemainingLabel(reminder.due_at);
  const timeStr = formatTime(reminder.due_at);
  const isActive = reminder.status === 'ACTIVE' || reminder.status === 'OVERDUE';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 40, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, scale: 0.95 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }} className="relative z-10 w-full max-w-md bg-[#0c0c14] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${overdue ? 'bg-red-500/20' : 'bg-white/8'}`}>
              <CatIcon className={`w-4.5 h-4.5 ${overdue ? 'text-red-400' : catM.color}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white leading-tight">{reminder.title}</h3>
              <div className={`text-xs mt-0.5 font-medium ${overdue ? 'text-red-400' : 'text-zinc-400'}`}>{remLabel}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-lg flex items-center justify-center bg-white/8 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>

        <div className="p-5 space-y-3">
          <Row icon={Calendar} label="When"><span className="text-white text-xs font-medium">{formatDate(reminder.due_at)}{timeStr && ` at ${timeStr}`}</span></Row>
          {reminder.recurrence !== 'none' && <Row icon={Repeat} label="Repeat"><span className="text-white text-xs font-medium capitalize">{reminder.recurrence}</span></Row>}
          {reminder.remind_before && <Row icon={AlarmClock} label="Notify"><span className="text-white text-xs font-medium">{reminder.remind_before.replace(/_/g, ' ')}</span></Row>}
          {reminder.source_label && <Row icon={Link2} label="Source"><span className="text-[#cbbeff] text-xs font-medium">{reminder.source_label}</span></Row>}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${priM.bg} ${priM.color} ${priM.border}`}><TrendingUp className="w-2.5 h-2.5" />{priM.label}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white/5 border border-white/10 ${catM.color}`}><CatIcon className="w-2.5 h-2.5" />{catM.label}</span>
          </div>
          {reminder.notes && <div className="p-3 rounded-xl bg-white/4 border border-white/8"><p className="text-xs text-zinc-300 leading-relaxed">{reminder.notes}</p></div>}
          <div className="flex items-center gap-2"><span className="text-[10px] font-mono text-zinc-400">Status:</span><StatusPill status={reminder.status} /></div>
        </div>

        {isActive ? (
          <div className="px-5 pb-5 grid grid-cols-2 gap-2">
            <button onClick={() => onComplete(reminder.reminder_id)} className="py-2.5 rounded-xl text-xs font-bold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 transition-colors flex items-center justify-center gap-1.5"><Check className="w-3.5 h-3.5" />Complete</button>
            <button onClick={() => onSnooze(reminder.reminder_id)} className="py-2.5 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 transition-colors flex items-center justify-center gap-1.5"><Clock className="w-3.5 h-3.5" />Snooze 1d</button>
            <button onClick={() => onDismiss(reminder.reminder_id)} className="py-2.5 rounded-xl text-xs font-semibold text-zinc-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center justify-center gap-1.5"><BellOff className="w-3.5 h-3.5" />Dismiss</button>
            <button onClick={() => onDelete(reminder.reminder_id)} className="py-2.5 rounded-xl text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <button onClick={() => onDelete(reminder.reminder_id)} className="w-full py-2.5 rounded-xl text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

function Row({ icon: Icon, label, children }: { icon: React.FC<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="text-[10px] font-mono text-zinc-500 uppercase shrink-0">{label}</span>
        {children}
      </div>
    </div>
  );
}

// ─── Reminder Card ────────────────────────────────────────────────────────────

interface CardProps { reminder: Reminder; onView: (r: Reminder) => void; onComplete: (id: string) => void; onSnooze: (id: string) => void; onDismiss: (id: string) => void; onDelete: (id: string) => void; }

const ReminderCard: React.FC<CardProps> = ({ reminder, onView, onComplete, onSnooze, onDismiss }) => {
  const catM = CAT_META[reminder.category];
  const priM = PRI_META[reminder.priority];
  const CatIcon = catM.icon;
  const { label: remLabel, urgent, overdue } = getRemainingLabel(reminder.due_at);
  const timeStr = formatTime(reminder.due_at);
  const isActive = reminder.status === 'ACTIVE' || reminder.status === 'OVERDUE';
  const stripeColor = reminder.priority === 'critical' ? 'bg-red-500' : reminder.priority === 'high' ? 'bg-orange-500' : reminder.priority === 'medium' ? 'bg-amber-500' : 'bg-zinc-600';

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} whileHover={{ y: -1 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative bg-white/[0.035] hover:bg-white/[0.055] border rounded-2xl transition-all duration-200 cursor-pointer overflow-hidden ${overdue ? 'border-red-500/30 shadow-[0_0_18px_rgba(239,68,68,0.07)]' : urgent ? 'border-amber-500/20' : 'border-white/8'}`}
      onClick={() => onView(reminder)}>
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl ${stripeColor}`} />
      <div className="pl-4 pr-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${overdue ? 'bg-red-500/20' : 'bg-white/6'}`}>
            <CatIcon className={`w-4 h-4 ${overdue ? 'text-red-400' : catM.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-white truncate leading-tight">{reminder.title}</h4>
              <StatusPill status={reminder.status} />
            </div>
            {reminder.description && <p className="text-xs text-zinc-400 truncate mt-0.5">{reminder.description}</p>}
            <div className="flex items-center gap-2.5 mt-2 flex-wrap">
              <span className={`flex items-center gap-1 text-[11px] font-bold ${overdue ? 'text-red-400' : urgent ? 'text-amber-400' : 'text-zinc-400'}`}><Clock className="w-3 h-3" />{remLabel}</span>
              <span className="flex items-center gap-1 text-[11px] text-zinc-500"><Calendar className="w-3 h-3" />{formatDate(reminder.due_at)}{timeStr && ` · ${timeStr}`}</span>
              <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-white/5 ${catM.color}`}>{catM.label}</span>
              <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${priM.bg} ${priM.color}`}>{priM.label}</span>
              {reminder.recurrence !== 'none' && <span className="flex items-center gap-0.5 text-[9px] text-cyan-400 font-bold uppercase"><Repeat className="w-2.5 h-2.5" />{reminder.recurrence}</span>}
            </div>
            {reminder.source_label && <div className="flex items-center gap-1.5 mt-2"><Link2 className="w-2.5 h-2.5 text-[#cbbeff]/60" /><span className="text-[10px] text-[#cbbeff]/80 font-medium">{reminder.source_label}</span></div>}
          </div>
        </div>
        {isActive && (
          <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-white/6" onClick={e => e.stopPropagation()}>
            <button onClick={() => onView(reminder)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-zinc-300 bg-white/6 hover:bg-white/12 hover:text-white transition-colors"><Eye className="w-2.5 h-2.5" />View</button>
            <button onClick={() => onComplete(reminder.reminder_id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"><Check className="w-2.5 h-2.5" />Complete</button>
            <button onClick={() => onSnooze(reminder.reminder_id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"><Clock className="w-2.5 h-2.5" />Snooze</button>
            <button onClick={() => onDismiss(reminder.reminder_id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-zinc-500 bg-white/4 hover:bg-white/8 transition-colors ml-auto"><BellOff className="w-2.5 h-2.5" />Dismiss</button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ─── Proposal Preview (for ChatPage) ─────────────────────────────────────────

export interface ReminderProposalPreviewProps {
  proposal: ReminderProposal;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
  saving?: boolean;
}

export const ReminderProposalPreview: React.FC<ReminderProposalPreviewProps> = ({ proposal, onConfirm, onEdit, onCancel, saving }) => {
  const catM = CAT_META[proposal.category];
  const priM = PRI_META[proposal.priority];
  const CatIcon = catM.icon;
  const timeStr = formatTime(proposal.due_at);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="w-full bg-[#0d0d18] border border-[#5a25eb]/25 rounded-2xl overflow-hidden shadow-lg">
      <div className="px-4 py-2.5 bg-[#5a25eb]/10 border-b border-[#5a25eb]/15 flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-[#cbbeff]" />
        <span className="text-[10px] font-bold text-[#cbbeff] uppercase tracking-wider">Reminder Preview · Pending Confirmation</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/6 flex items-center justify-center shrink-0"><CatIcon className={`w-4 h-4 ${catM.color}`} /></div>
          <div><h4 className="text-sm font-bold text-white">{proposal.title}</h4>{proposal.description && <p className="text-xs text-zinc-400">{proposal.description}</p>}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white/4 rounded-xl p-2.5"><div className="text-[9px] text-zinc-500 uppercase font-mono mb-1">Date</div><div className="text-white font-medium">📅 {formatDate(proposal.due_at)}</div>{timeStr && <div className="text-zinc-400 text-[10px] mt-0.5">🕐 {timeStr}</div>}</div>
          <div className="bg-white/4 rounded-xl p-2.5"><div className="text-[9px] text-zinc-500 uppercase font-mono mb-1">Notify Before</div><div className="text-white font-medium">{proposal.remind_before ? proposal.remind_before.replace(/_/g, ' ') : 'At due time'}</div></div>
          <div className="bg-white/4 rounded-xl p-2.5"><div className="text-[9px] text-zinc-500 uppercase font-mono mb-1">Priority</div><div className={`font-bold ${priM.color}`}>{priM.label}</div></div>
          <div className="bg-white/4 rounded-xl p-2.5"><div className="text-[9px] text-zinc-500 uppercase font-mono mb-1">Category</div><div className={`font-medium ${catM.color}`}>{catM.label}</div></div>
        </div>
        {proposal.source_label && <div className="flex items-center gap-2 px-2.5 py-2 bg-[#5a25eb]/8 border border-[#5a25eb]/15 rounded-xl"><Link2 className="w-3 h-3 text-[#cbbeff]/70 shrink-0" /><span className="text-[10px] text-[#cbbeff] font-medium">{proposal.source_label}</span></div>}
        {proposal.recurrence !== 'none' && <div className="flex items-center gap-2"><Repeat className="w-3 h-3 text-cyan-400" /><span className="text-xs text-cyan-400 font-medium capitalize">Repeats {proposal.recurrence}</span></div>}
      </div>
      <div className="px-4 pb-4 flex gap-2.5">
        <button onClick={onConfirm} disabled={saving} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#5a25eb] hover:bg-[#6b35f0] disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}{saving ? 'Saving…' : 'Confirm Reminder'}
        </button>
        <button onClick={onEdit} className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 bg-white/6 hover:bg-white/12 border border-white/10 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
        <button onClick={onCancel} className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 bg-white/4 hover:bg-white/8 transition-colors"><X className="w-3.5 h-3.5" /></button>
      </div>
    </motion.div>
  );
};

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-sm mx-auto">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.1 }}
        className="w-16 h-16 rounded-3xl bg-[#5a25eb]/12 border border-[#5a25eb]/20 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(90,37,235,0.12)]">
        <Bell className="w-7 h-7 text-[#cbbeff]" />
      </motion.div>
      <h3 className="text-base font-bold text-white mb-1.5">You're all caught up.</h3>
      <p className="text-sm text-zinc-400 mb-1">No upcoming reminders</p>
      <p className="text-xs text-zinc-500 mb-6 leading-relaxed">Create one by typing something like:<br /><em className="text-zinc-400">"Remind me 7 days before my license expires."</em></p>
      <button onClick={onCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white bg-[#5a25eb] hover:bg-[#6b35f0] shadow-lg shadow-[#5a25eb]/25 transition-colors"><Plus className="w-4 h-4" />Create Reminder</button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export const RemindersPage: React.FC = () => {
  const { navigate } = useNavigation();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Reminder | null>(null);
  const [tab, setTab] = useState<'needs_attention' | 'upcoming' | 'recurring' | 'completed' | 'memory'>('needs_attention');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReminders();
      const now = new Date();
      setReminders(data.map(r => ({ ...r, status: r.status === 'ACTIVE' && new Date(r.due_at) < now ? 'OVERDUE' as const : r.status })));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const needsAttn = reminders.filter(r => r.status === 'OVERDUE' || (r.status === 'ACTIVE' && new Date(r.due_at).getTime() - now.getTime() < 30 * 86400000)).sort((a, b) => { if (a.status === 'OVERDUE' && b.status !== 'OVERDUE') return -1; if (b.status === 'OVERDUE' && a.status !== 'OVERDUE') return 1; return new Date(a.due_at).getTime() - new Date(b.due_at).getTime(); });
  const upcoming = reminders.filter(r => r.status === 'ACTIVE').sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const recurring = reminders.filter(r => r.recurrence !== 'none' && (r.status === 'ACTIVE' || r.status === 'SNOOZED'));
  const completed = reminders.filter(r => r.status === 'COMPLETED' || r.status === 'DISMISSED');
  const fromMem = reminders.filter(r => r.source_type === 'memory_claim');
  const badge = reminders.filter(r => r.status === 'ACTIVE' || r.status === 'OVERDUE').length;

  const TABS = [
    { id: 'needs_attention' as const, label: 'Needs Attention', icon: AlertTriangle, count: needsAttn.length, ac: needsAttn.some(r => r.status === 'OVERDUE') ? 'text-red-400' : 'text-amber-400' },
    { id: 'upcoming' as const, label: 'Upcoming', icon: Calendar, count: upcoming.length, ac: 'text-blue-400' },
    { id: 'recurring' as const, label: 'Recurring', icon: Repeat, count: recurring.length, ac: 'text-cyan-400' },
    { id: 'completed' as const, label: 'Completed', icon: CheckCircle2, count: completed.length, ac: 'text-zinc-400' },
    { id: 'memory' as const, label: 'From Memory', icon: Link2, count: fromMem.length, ac: 'text-[#cbbeff]' },
  ];

  const list = { needs_attention: needsAttn, upcoming, recurring, completed, memory: fromMem }[tab];

  const doStatus = async (id: string, status: Reminder['status'], extra?: { snoozed_until?: string }) => {
    setReminders(p => p.map(r => r.reminder_id === id ? { ...r, status, updated_at: new Date().toISOString(), ...(extra ?? {}) } : r));
    setSelected(null);
    await updateReminderStatus(id, status, extra);
    showToast(status === 'COMPLETED' ? '✓ Complete' : status === 'SNOOZED' ? '⏰ Snoozed' : 'Dismissed');
  };

  const snooze = (id: string) => { const t = new Date(); t.setDate(t.getDate() + 1); void doStatus(id, 'SNOOZED', { snoozed_until: t.toISOString() }); };

  const del = async (id: string) => {
    setReminders(p => p.filter(r => r.reminder_id !== id));
    setSelected(null);
    await deleteReminder(id);
    showToast('Deleted');
  };

  const handleCreate = async (p: ReminderProposal) => {
    setCreating(true);
    try {
      const r = await createReminder(p);
      if (r) { setReminders(prev => [r, ...prev]); showToast('Reminder created!'); setShowCreate(false); }
    } catch { showToast('Failed', 'error'); }
    finally { setCreating(false); }
  };

  const emptyMsg: Record<typeof tab, string> = {
    needs_attention: "You're all caught up!",
    upcoming: 'No upcoming reminders.',
    recurring: 'No recurring reminders.',
    completed: 'Nothing completed yet.',
    memory: 'No memory-linked reminders.',
  };

  return (
    <div className="relative min-h-screen w-full px-4 sm:px-6 md:pl-24 lg:pl-28 max-w-4xl mx-auto pb-16">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className={`fixed top-24 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-xl text-sm font-semibold backdrop-blur-md ${toast.type === 'success' ? 'bg-emerald-600/90 text-white' : 'bg-red-600/90 text-white'}`}>
            {toast.type === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="pt-2 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-2xl bg-[#5a25eb]/15 border border-[#5a25eb]/20 flex items-center justify-center"><Bell className="w-4 h-4 text-[#cbbeff]" /></div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Reminders</h1>
              {badge > 0 && <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-[9px] font-bold text-white shadow-lg shadow-red-500/30">{badge}</span>}
            </div>
            <p className="text-xs text-zinc-400">Smart reminders from your Personal Memory vault</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold text-white bg-[#5a25eb] hover:bg-[#6b35f0] shadow-lg shadow-[#5a25eb]/25 transition-colors shrink-0">
            <Plus className="w-3.5 h-3.5" /><span className="hidden sm:inline">New Reminder</span><span className="sm:hidden">New</span>
          </button>
        </div>

        {!loading && reminders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
            {[
              { l: 'Active', v: reminders.filter(r => r.status === 'ACTIVE').length, c: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { l: 'Overdue', v: reminders.filter(r => r.status === 'OVERDUE').length, c: 'text-red-400', bg: 'bg-red-500/10' },
              { l: 'Snoozed', v: reminders.filter(r => r.status === 'SNOOZED').length, c: 'text-amber-400', bg: 'bg-amber-500/10' },
              { l: 'Completed', v: reminders.filter(r => r.status === 'COMPLETED').length, c: 'text-zinc-400', bg: 'bg-white/5' },
            ].map(s => (
              <div key={s.l} className={`px-3 py-2.5 rounded-xl ${s.bg} border border-white/6`}>
                <div className={`text-lg font-bold ${s.c}`}>{s.v}</div>
                <div className="text-[10px] text-zinc-500 font-medium">{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5 scrollbar-none">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${active ? 'bg-white text-[#111] shadow-sm font-bold' : 'text-zinc-400 bg-white/5 hover:bg-white/10 hover:text-zinc-200'}`}>
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#333]' : t.ac}`} />
              {t.label}
              {t.count > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-black/10 text-[#333]' : 'bg-white/8 text-zinc-400'}`}>{t.count}</span>}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 rounded-2xl bg-[#5a25eb]/15 flex items-center justify-center"><Loader2 className="w-5 h-5 text-[#cbbeff] animate-spin" /></div>
          <p className="text-sm text-zinc-400">Loading reminders…</p>
        </div>
      ) : reminders.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : list.length === 0 ? (
        <div className="py-14 text-center">
          <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3"><BellOff className="w-5 h-5 text-zinc-500" /></div>
          <p className="text-sm text-zinc-400 font-medium">Nothing here</p>
          <p className="text-xs text-zinc-600 mt-1">{emptyMsg[tab]}</p>
        </div>
      ) : (
        <motion.div layout className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {list.map(r => (
              <ReminderCard key={r.reminder_id} reminder={r}
                onView={setSelected}
                onComplete={id => void doStatus(id, 'COMPLETED')}
                onSnooze={snooze}
                onDismiss={id => void doStatus(id, 'DISMISSED')}
                onDelete={del}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Chat hint */}
      {!loading && (
        <div className="mt-8 p-4 rounded-2xl bg-[#5a25eb]/6 border border-[#5a25eb]/15">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-xl bg-[#5a25eb]/20 flex items-center justify-center shrink-0 mt-0.5"><Sparkles className="w-3.5 h-3.5 text-[#cbbeff]" /></div>
            <div>
              <p className="text-xs font-bold text-[#cbbeff] mb-1">Create reminders through AI Chat</p>
              <p className="text-xs text-zinc-400 leading-relaxed">Try: <em className="text-zinc-300">"Remind me 7 days before my driving license expires"</em> or <em className="text-zinc-300">"Remind me about my medicine at 8 PM."</em></p>
              <button onClick={() => navigate('/chat')} className="mt-2.5 flex items-center gap-1.5 text-[10px] font-bold text-[#cbbeff] hover:text-white transition-colors">Open AI Chat <ChevronRight className="w-3 h-3" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} saving={creating} />}
        {selected && <DetailPanel reminder={selected} onClose={() => setSelected(null)} onComplete={id => void doStatus(id, 'COMPLETED')} onSnooze={snooze} onDismiss={id => void doStatus(id, 'DISMISSED')} onDelete={del} />}
      </AnimatePresence>
    </div>
  );
};

export default RemindersPage;

