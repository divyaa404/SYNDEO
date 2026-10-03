import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Globe2,
} from 'lucide-react';
import { AILoaderOrb, type OrbStateMode } from '../ui/ai-loader';
import { useTheme } from '../../context/ThemeContext';
import {
  SARVAM_LANGUAGES,
  SARVAM_TTS_LANGUAGES,
  SARVAM_VOICE_SPEAKERS,
  type SarvamLanguageCode,
  type SarvamVoiceSpeaker,
} from '../../lib/sarvam';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface InChatVoiceStageProps {
  voiceState: VoiceState;
  isMuted: boolean;
  onToggleMute: () => void;
  transcript: string;
  assistantResponse: string;
  renderAssistantResponse: (content: string) => React.ReactNode;
  isBusy: boolean;
  onSelectSocialLinks: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onClose: () => void;
  sttLanguage: SarvamLanguageCode;
  onSttLanguageChange: (languageCode: string) => void;
  ttsLanguage: SarvamLanguageCode;
  onTtsLanguageChange: (languageCode: string) => void;
  speaker: SarvamVoiceSpeaker;
  onSpeakerChange: (speaker: SarvamVoiceSpeaker) => void;
  error: string | null;
  userName?: string;
}

export const InChatVoiceStage: React.FC<InChatVoiceStageProps> = ({
  voiceState,
  isMuted,
  onToggleMute,
  transcript,
  assistantResponse,
  renderAssistantResponse,
  isBusy,
  onSelectSocialLinks,
  onStartListening,
  onStopListening,
  onClose,
  sttLanguage,
  onSttLanguageChange,
  ttsLanguage,
  onTtsLanguageChange,
  speaker,
  onSpeakerChange,
  error,
  userName = 'You',
}) => {
  const { theme } = useTheme();
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Audio waveform calculation for smooth ripple waves
  useEffect(() => {
    let base = 0;
    const updateWaves = () => {
      base += 0.08;
      if (voiceState === 'listening') {
        setAudioLevel(0.45 + 0.45 * Math.sin(base * 3) * Math.cos(base * 2));
      } else if (voiceState === 'speaking') {
        setAudioLevel(0.5 + 0.4 * Math.sin(base * 2.5));
      } else if (voiceState === 'thinking') {
        setAudioLevel(0.25 + 0.15 * Math.sin(base * 1.5));
      } else {
        setAudioLevel(0.08);
      }
      animationFrameRef.current = requestAnimationFrame(updateWaves);
    };

    animationFrameRef.current = requestAnimationFrame(updateWaves);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [voiceState]);

  // Escape key to exit voice mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const stateLabel =
    voiceState === 'listening'
      ? 'Listening...'
      : voiceState === 'thinking'
      ? 'Thinking...'
      : voiceState === 'speaking'
      ? 'Speaking...'
      : 'Ready...';

  const loaderState: OrbStateMode =
    voiceState === 'listening'
      ? 'listening'
      : voiceState === 'thinking'
      ? 'thinking'
      : voiceState === 'speaking'
      ? 'speaking'
      : 'idle';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
      className="fixed inset-0 z-[300] h-[100dvh] w-screen overflow-hidden select-none flex flex-col justify-between items-center p-6 sm:p-10"
      style={{
        background:
          theme === 'dark'
            ? `
              radial-gradient(circle at 50% 35%, rgba(56, 189, 248, 0.22) 0%, rgba(90, 37, 235, 0.18) 35%, transparent 65%),
              radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.12), transparent 50%),
              #070712
            `
            : `
              radial-gradient(circle at 50% 35%, rgba(180, 210, 255, 0.55) 0%, rgba(220, 205, 255, 0.35) 35%, transparent 65%),
              radial-gradient(circle at 80% 80%, rgba(210, 225, 255, 0.25), transparent 50%),
              #f8f9ff
            `,
      }}
    >
      {/* Top Bar with Voice and Language Controls */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 z-20 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#5a25eb]/15 dark:bg-white/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-[#5a25eb] dark:text-[#cbbeff]" />
          </div>
          <span className="text-xs font-bold text-zinc-900 dark:text-white tracking-wide">
            SYNDEO Voice Mode
          </span>
          <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
            LIVE
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          {/* Voice Speaker Selector */}
          <div className="relative flex items-center">
            <label className="sr-only" htmlFor="voice-speaker">AI Voice Speaker</label>
            <select
              id="voice-speaker"
              value={speaker}
              onChange={(event) => onSpeakerChange(event.target.value as SarvamVoiceSpeaker)}
              className="max-w-36 sm:max-w-44 rounded-full border border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-100 backdrop-blur-md cursor-pointer hover:bg-white/90 dark:hover:bg-white/20 transition-all"
              aria-label="AI Voice Speaker"
              title="Change AI Voice Speaker"
            >
              {SARVAM_VOICE_SPEAKERS.map((s) => (
                <option key={s.id} value={s.id}>
                  🎙️ {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* STT Language Selector */}
          <label className="sr-only" htmlFor="stt-language">Speech recognition language</label>
          <select
            id="stt-language"
            value={sttLanguage}
            onChange={(event) => onSttLanguageChange(event.target.value)}
            className="max-w-28 sm:max-w-36 rounded-full border border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/10 px-2 sm:px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 backdrop-blur-md cursor-pointer"
            aria-label="Speech recognition language"
            title="Speech-to-text language"
          >
            {SARVAM_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>STT: {language.name}</option>
            ))}
          </select>

          {/* TTS Language Selector */}
          <label className="sr-only" htmlFor="tts-language">Text-to-speech language</label>
          <select
            id="tts-language"
            value={ttsLanguage}
            onChange={(event) => onTtsLanguageChange(event.target.value)}
            className="max-w-28 sm:max-w-36 rounded-full border border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/10 px-2 sm:px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 backdrop-blur-md cursor-pointer"
            aria-label="Text-to-speech language"
            title="Text-to-speech language"
          >
            {SARVAM_TTS_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>TTS: {language.name}</option>
            ))}
          </select>

          {/* Close Exit Button */}
          <button
            onClick={onClose}
            aria-label="Close voice mode"
            className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white flex items-center justify-center border border-black/10 dark:border-white/15 backdrop-blur-md transition-all cursor-pointer shadow-xs"
            title="Exit Voice Mode (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* =========================================================================
          CENTERED IMMERSIVE VOICE EXPERIENCE (Orb + State + Speech)
         ========================================================================= */}
      <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center text-center space-y-6 my-auto z-10 overflow-visible">
        
        {/* Large AI Voice Orb with Expansive Atmosphere */}
        <div className="relative flex items-center justify-center my-4 select-none overflow-visible isolate">
          {/* Layer 1: Expansive Sonic Expansion Wave */}
          <motion.div
            animate={{
              scale:
                voiceState === 'listening' || voiceState === 'speaking'
                  ? [1, 1.45 + audioLevel * 0.45, 1]
                  : [1, 1.12, 1],
              opacity:
                voiceState === 'listening' || voiceState === 'speaking'
                  ? [0.35, 0.75, 0.35]
                  : [0.15, 0.3, 0.15],
            }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute w-60 h-60 sm:w-80 sm:h-80 rounded-full border-2 border-[#5a25eb]/30 dark:border-[#38bdf8]/30 pointer-events-none z-0"
          />

          {/* Layer 2: Secondary Soft Pulsing Aura */}
          <motion.div
            animate={{
              scale:
                voiceState === 'listening' || voiceState === 'speaking'
                  ? [1, 1.8 + audioLevel * 0.5, 1]
                  : [1, 1.25, 1],
              opacity:
                voiceState === 'listening' || voiceState === 'speaking'
                  ? [0.2, 0.5, 0.2]
                  : [0.08, 0.2, 0.08],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
            className="absolute w-60 h-60 sm:w-80 sm:h-80 rounded-full border border-[#8b5cf6]/30 dark:border-[#cbbeff]/20 pointer-events-none z-0"
          />

          {/* Layer 3: Giant Ambient Glow (520px) */}
          <div
            className="absolute w-[360px] h-[360px] sm:w-[520px] sm:h-[520px] -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 rounded-full blur-[36px] pointer-events-none z-0"
            style={{
              background:
                theme === 'dark'
                  ? 'radial-gradient(circle, rgba(56, 189, 248, 0.40) 0%, rgba(90, 37, 235, 0.26) 35%, rgba(139, 92, 246, 0.12) 55%, transparent 72%)'
                  : 'radial-gradient(circle, rgba(70, 130, 255, 0.36) 0%, rgba(80, 100, 255, 0.22) 35%, rgba(120, 90, 255, 0.10) 55%, transparent 72%)',
            }}
          />

          {/* Interactive Hero Voice Orb */}
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            onClick={voiceState === 'listening' ? onStopListening : onStartListening}
            className="relative z-10 cursor-pointer transition-transform hover:scale-105 active:scale-95"
            title={voiceState === 'listening' ? 'Click to Pause' : 'Click to Speak'}
          >
            <AILoaderOrb
              state={loaderState}
              text={stateLabel}
              size={230}
              variant="hero"
            />
          </motion.div>
        </div>

        {/* State Label Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 dark:bg-white/10 border border-zinc-200/60 dark:border-white/10 shadow-xs backdrop-blur-md">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              voiceState === 'listening'
                ? 'bg-cyan-500 animate-ping'
                : voiceState === 'speaking'
                ? 'bg-purple-500 animate-pulse'
                : voiceState === 'thinking'
                ? 'bg-indigo-500 animate-spin'
                : 'bg-zinc-400'
            }`}
          />
          <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
            {stateLabel}
          </span>
        </div>

        {error && (
          <p role="alert" className="max-w-xl rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        {/* User Spoken Transcript with Live Word-by-Word Streaming */}
        <AnimatePresence>
          {transcript ? (
            <motion.div
              key="voice-transcript-card"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="max-w-xl mx-auto px-5 py-3 rounded-2xl bg-white/60 dark:bg-white/10 border border-black/5 dark:border-white/15 backdrop-blur-md shadow-sm"
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${voiceState === 'listening' ? 'bg-cyan-500 animate-ping' : 'bg-emerald-500'}`} />
                <span className="text-[11px] font-mono font-bold uppercase text-cyan-600 dark:text-cyan-400 tracking-wider">
                  {userName} {voiceState === 'listening' ? 'is speaking...' : 'said:'}
                </span>
              </div>
              <p className="text-base sm:text-lg md:text-xl font-medium text-zinc-900 dark:text-white leading-relaxed text-center">
                "{transcript}"
                {voiceState === 'listening' && (
                  <span className="inline-block w-1.5 h-4 sm:h-5 ml-1.5 align-middle bg-cyan-500 animate-pulse rounded-full" />
                )}
              </p>
            </motion.div>
          ) : voiceState === 'listening' ? (
            <motion.div
              key="voice-listening-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs sm:text-sm font-medium text-zinc-400 dark:text-zinc-500 italic flex items-center justify-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Listening... Speak naturally into your microphone</span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {assistantResponse && (
            <motion.div
              key="voice-assistant-response"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="max-w-2xl mx-auto text-sm sm:text-base text-zinc-800 dark:text-zinc-200 leading-relaxed text-center break-words"
            >
              {renderAssistantResponse(assistantResponse)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full flex justify-center px-2 pb-3 z-20">
        <button
          type="button"
          onClick={onSelectSocialLinks}
          disabled={isBusy}
          className="inline-flex items-center gap-2 rounded-full border border-[#5a25eb]/20 dark:border-white/15 bg-white/65 dark:bg-white/10 px-4 py-2 text-left text-zinc-800 dark:text-zinc-100 shadow-sm backdrop-blur-md transition-all hover:bg-white dark:hover:bg-white/15 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Show all social links: GitHub, LinkedIn, and Discord"
        >
          <Globe2 className="w-4 h-4 shrink-0 text-[#5a25eb] dark:text-[#cbbeff]" />
          <span className="flex flex-col">
            <span className="text-xs font-semibold">Show all social links</span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">GitHub, LinkedIn &amp; Discord</span>
          </span>
        </button>
      </div>

      {/* Bottom Minimal Controls (Mic Toggle & Global Mute) */}
      <div className="w-full flex items-center justify-center gap-4 z-20 pb-2">
        <button
          onClick={onToggleMute}
          aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
          className={`p-3.5 rounded-full transition-all cursor-pointer border backdrop-blur-md ${
            isMuted
              ? 'bg-red-500/15 text-red-500 border-red-500/30'
              : 'bg-white/60 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white border-zinc-200/80 dark:border-white/15'
          }`}
          title={isMuted ? 'Unmute AI Voice' : 'Mute AI Voice'}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        <button
          onClick={voiceState === 'listening' ? onStopListening : onStartListening}
          aria-label={voiceState === 'listening' ? 'Pause listening' : 'Start listening'}
          className={`p-5 rounded-full transition-all cursor-pointer shadow-xl flex items-center justify-center ${
            voiceState === 'listening'
              ? 'bg-red-500 text-white ring-4 ring-red-500/25 scale-105'
              : 'bg-[#111111] dark:bg-white text-white dark:text-[#111111] hover:scale-105 ring-4 ring-black/10 dark:ring-white/10'
          }`}
          title={voiceState === 'listening' ? 'Pause Listening' : 'Start Listening'}
        >
          {voiceState === 'listening' ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
      </div>
    </motion.div>
  );
};

export default InChatVoiceStage;
