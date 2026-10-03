import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigation, type RoutePath } from '../../context/NavigationContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeToggle } from '../ui/ThemeToggle';
import {
  MessageSquare,
  Folder,
  Share2,
  Bell,
  Settings,
  Menu,
  ChevronRight,
  X,
  LogOut,
  ShieldCheck,
  Sparkles,
  Plus,
} from 'lucide-react';

interface NavItemDef {
  path: RoutePath;
  label: string;
  icon: React.FC<{ className?: string }>;
  desc: string;
  shortcut?: string;
}

interface FloatingSidebarProps {
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
}

export const FloatingSidebar: React.FC<FloatingSidebarProps> = ({
  isExpanded: controlledExpanded,
  onToggleExpand,
  onClose,
}) => {
  const { currentPath, navigate, userName, userEmail, signOut } = useNavigation();
  const { theme } = useTheme();
  const [internalExpanded, setInternalExpanded] = useState<boolean>(false);

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = onToggleExpand || (() => setInternalExpanded((prev) => !prev));
  const handleClose = onClose || (() => (onToggleExpand ? onToggleExpand() : setInternalExpanded(false)));

  const isDark = theme === 'dark';

  const navItems: NavItemDef[] = [
    { path: '/chat', label: 'AI Memory Chat', icon: MessageSquare, desc: 'Zero-Knowledge Retrieval', shortcut: '⌘1' },
    { path: '/memory', label: 'Life-Stage Store', icon: Folder, desc: 'Obsidian Graph Vault', shortcut: '⌘2' },
    { path: '/share', label: 'Selective Share', icon: Share2, desc: 'Scoped zk-SNARK Links', shortcut: '⌘3' },
    { path: '/reminders', label: 'Vault Reminders', icon: Bell, desc: 'Expiries & Actions', shortcut: '⌘4' },
    { path: '/settings', label: 'Vault Settings', icon: Settings, desc: 'Keys & Cryptography', shortcut: '⌘5' },
  ];

  const handleNav = (path: RoutePath) => {
    navigate(path);
  };

  const handleLogout = async () => {
    handleClose();
    await signOut();
  };

  const displayName = userName?.trim() || 'Indresh Suresh';
  const displayEmail = userEmail || 'indresh@syndeo.vault';
  const displayInitials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* =========================================================================
          BACKDROP OVERLAY (When expanded, click outside to close)
         ========================================================================= */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 backdrop-blur-xs"
          />
        )}
      </AnimatePresence>

      {/* =========================================================================
          DESKTOP FLOATING SIDEBAR (Frosted deep capsule with luminous borders)
         ========================================================================= */}
      <motion.nav
        initial={false}
        animate={{
          width: isExpanded ? 300 : 76,
          height: isExpanded ? 540 : 345,
        }}
        transition={{
          duration: 0.4,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={`fixed left-4 sm:left-5 top-[52%] -translate-y-1/2 z-50 hidden md:flex flex-col p-2.5 sm:p-3 rounded-[30px] sm:rounded-[34px]
                   backdrop-blur-[32px] backdrop-saturate-[180%]
                   select-none overflow-hidden justify-between transition-colors duration-300 ${
                     isDark
                       ? 'bg-[#100f1c]/94 text-white border border-white/20 shadow-[0_22px_60px_rgba(0,0,0,0.7),0_0_24px_rgba(255,255,255,0.06)]'
                       : 'bg-[#0d0d14]/96 text-white border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08)]'
                   }`}
        aria-label="Sidebar Navigation"
      >
        {/* TOP / PROFILE HEADER (Visible & Staggered when expanded) */}
        <div className="w-full flex flex-col">
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                className="w-full pb-2.5 flex items-center justify-between border-b border-white/10"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative w-8.5 h-8.5 rounded-2xl flex items-center justify-center text-xs font-bold shadow-xs shrink-0 bg-white text-[#111111]">
                    {displayInitials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold truncate text-white">
                      {displayName}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="truncate max-w-[110px] text-zinc-400">
                        {displayEmail}
                      </span>
                      <span className="text-emerald-400 font-medium flex items-center gap-0.5 shrink-0">
                        <ShieldCheck className="w-3 h-3" /> #8921
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  className="w-6.5 h-6.5 rounded-lg flex items-center justify-center transition-all cursor-pointer bg-white/10 text-zinc-300 hover:text-white hover:bg-white/20"
                  title="Close Side Panel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Section Header & New Chat Button */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="pt-2 pb-1 px-1 flex items-center justify-between"
              >
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                  Navigation
                </span>
                <button
                  onClick={() => {
                    handleNav('/chat');
                    handleClose();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer bg-white/10 hover:bg-white text-[#cbbeff] hover:text-[#111111]"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Chat</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Item Stack */}
          <div className="relative flex flex-col gap-1 w-full mt-1">
            {navItems.map((item, index) => {
              const isActive = currentPath === item.path;
              const Icon = item.icon;

              return (
                <div key={item.path} className="relative flex items-center">
                  {/* Single Persistent Moving Capsule Pointer (Attached to Left Edge) */}
                  {isActive && (
                    <motion.div
                      layoutId="activeSidebarPointer"
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 32,
                      }}
                      className="absolute -left-[14px] w-[4px] h-6 rounded-full z-20 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                    />
                  )}

                  {/* Main Navigation Capsule Row */}
                  <motion.button
                    onClick={() => handleNav(item.path)}
                    whileHover={{ x: 2, scale: 1.015 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className={`relative w-full h-[44px] rounded-[16px] flex items-center px-2.5 transition-all duration-200 cursor-pointer overflow-hidden ${
                      isActive
                        ? 'bg-white text-[#111111] shadow-sm font-bold'
                        : 'text-zinc-300 hover:text-white hover:bg-white/10'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.label}
                  >
                    {/* Icon Container */}
                    <div className="w-7 h-7 flex items-center justify-center shrink-0">
                      <Icon
                        className={`w-[18px] h-[18px] transition-transform duration-200 ${
                          isActive ? 'scale-[1.12] stroke-[2.2]' : 'group-hover:scale-105 stroke-[1.8]'
                        }`}
                      />
                    </div>

                    {/* Progressive Staggered Label Animation */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -4 }}
                          transition={{
                            duration: 0.22,
                            delay: 0.05 + index * 0.03,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="ml-2.5 flex-1 flex items-center justify-between min-w-0 overflow-hidden text-left"
                        >
                          <div className="flex flex-col min-w-0 pr-1.5">
                            <span className="text-xs font-bold truncate leading-tight tracking-tight">
                              {item.label}
                            </span>
                            <span
                              className={`text-[9px] truncate leading-tight mt-0.5 ${
                                isActive ? 'text-zinc-600' : 'text-zinc-400'
                              }`}
                            >
                              {item.desc}
                            </span>
                          </div>

                          {item.shortcut && (
                            <span
                              className={`text-[8.5px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                                isActive
                                  ? 'bg-zinc-200 text-zinc-900'
                                  : 'bg-white/10 text-zinc-400'
                              }`}
                            >
                              {item.shortcut}
                            </span>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </div>
              );
            })}
          </div>
        </div>

        {/* BOTTOM SECTION (Preferences, Theme Switch, Settings & Logout) */}
        <div className="w-full flex flex-col pt-1">
          {/* Expanded Bottom Controls */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="space-y-2 pb-1"
              >
                {/* Preferences Divider */}
                <div className="pt-1.5 border-t border-white/10">
                  <div className="px-1 pb-1.5 text-[9px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                    Preferences
                  </div>

                  {/* Theme Switch Row */}
                  <div className="p-2 rounded-xl flex items-center justify-between border bg-white/5 border-white/10">
                    <div className="flex items-center gap-2">
                      <div className="w-5.5 h-5.5 rounded-md flex items-center justify-center bg-white/10">
                        <Sparkles className="w-3 h-3 text-[#cbbeff]" />
                      </div>
                      <span className="text-[11px] font-semibold text-zinc-200">
                        {isDark ? 'Dark Mode' : 'Light Mode'}
                      </span>
                    </div>
                    <ThemeToggle size="sm" />
                  </div>
                </div>

                {/* Settings & Logout Action Buttons */}
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    onClick={() => handleNav('/settings')}
                    className={`py-1.5 rounded-lg text-[11px] font-semibold text-center transition-all cursor-pointer border shadow-2xs flex items-center justify-center gap-1 ${
                      currentPath === '/settings'
                        ? 'bg-white text-[#111111] border-white font-bold'
                        : 'text-zinc-200 bg-white/10 hover:bg-white/15 border-transparent'
                    }`}
                  >
                    <Settings className="w-3 h-3" />
                    <span>Settings</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="py-1.5 rounded-lg text-[11px] font-semibold text-center text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 transition-colors cursor-pointer shadow-2xs flex items-center justify-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Logout</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Subtle Divider */}
          <div className="w-full my-0.5 h-px bg-white/10" />

          {/* Expand / Collapse Toggle Button */}
          <motion.button
            onClick={toggleExpand}
            whileHover={{ x: 2, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`relative w-full h-[38px] rounded-[14px] flex items-center px-2.5 transition-all duration-200 cursor-pointer overflow-hidden ${
              isExpanded
                ? 'bg-white/10 text-white font-bold'
                : 'text-zinc-300 hover:text-white hover:bg-white/10'
            }`}
            title={isExpanded ? 'Collapse Side Panel' : 'Expand Side Panel'}
          >
            <div className="w-7 h-7 flex items-center justify-center shrink-0">
              <Menu className="w-4 h-4 stroke-[1.9]" />
            </div>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{
                    duration: 0.22,
                    delay: 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="ml-2.5 flex-1 flex items-center justify-between text-xs font-bold text-left text-white"
                >
                  <span>Collapse Panel</span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.nav>

      {/* =========================================================================
          MOBILE EXPANDED SLIDING SHEET / PANEL (When open on mobile)
         ========================================================================= */}
      <AnimatePresence>
        {isExpanded && (
          <div className="fixed inset-0 z-[120] flex md:hidden justify-start">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={handleClose}
              className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm"
            />

            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className={`relative w-[85vw] max-w-[310px] h-[82vh] my-auto ml-3 rounded-[30px] overflow-hidden shadow-2xl flex flex-col justify-between z-10 p-4 backdrop-blur-[32px] ${
                isDark
                  ? 'bg-[#100f1c]/96 text-white border border-white/20'
                  : 'bg-[#0d0d14]/96 text-white border border-white/15'
              }`}
            >
              {/* Header */}
              <div className="w-full pb-3 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8.5 h-8.5 rounded-2xl flex items-center justify-center text-xs font-bold shadow-xs shrink-0 bg-white text-[#111111]">
                    {displayInitials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold truncate text-white">{displayName}</h3>
                    <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Vault #8921
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="w-7 h-7 rounded-xl flex items-center justify-center bg-white/10 text-zinc-300 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Navigation Items */}
              <div className="flex-1 overflow-y-auto py-3 space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider font-bold px-1 text-zinc-400">
                  Navigation
                </div>
                {navItems.map((item) => {
                  const isActive = currentPath === item.path;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        handleNav(item.path);
                        handleClose();
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white text-[#111111] font-bold shadow-sm'
                          : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <div className="flex flex-col items-start min-w-0 text-left">
                        <span className="text-xs font-bold truncate">{item.label}</span>
                        <span className={`text-[10px] truncate ${isActive ? 'text-zinc-600' : 'text-zinc-400'}`}>{item.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="p-2 rounded-xl flex items-center justify-between bg-white/5 border border-white/10">
                  <span className="text-xs font-semibold text-zinc-200">
                    {isDark ? 'Dark Mode' : 'Light Mode'}
                  </span>
                  <ThemeToggle size="sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      handleNav('/settings');
                      handleClose();
                    }}
                    className="py-2 rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5 bg-white/10 text-zinc-200 hover:bg-white/15"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Settings</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="py-2 rounded-xl text-xs font-semibold text-center text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FloatingSidebar;
