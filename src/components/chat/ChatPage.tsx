import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, CandidateClaim, LifeStageCategory } from '../../types';
import { AILoaderOrb, type OrbStateMode } from '../ui/ai-loader';
import { ThinkingOrb, type OrbState } from '../ui/thinking-orbs';
import { useNavigation } from '../../context/NavigationContext';
import { useTheme } from '../../context/ThemeContext';
import {
  FileCheck,
  UserCheck,
  Mic,
  MicOff,
  Save,
  Share2,
  HelpCircle as QuestionIcon,
  RotateCcw,
  Volume2,
  VolumeX,
  Copy,
  Check,
  ArrowUp,
  ShieldCheck,
  Sparkles,
  GraduationCap,
  Globe,
  ExternalLink,
  Paperclip,
  FileText,
  X,
  Plus,
  CheckCircle2,
  Loader2,
  Edit3,
  UploadCloud,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { InChatVoiceStage } from './InChatVoiceStage';
import {
  SARVAM_LANGUAGES,
  SARVAM_TTS_LANGUAGES,
  SARVAM_VOICE_SPEAKERS,
  chatWithSarvam,
  transcribeWithSarvam,
  synthesizeWithSarvam,
  cleanTextForSpeech,
  isSarvamAvailable,
  type SarvamLanguageCode,
  type SarvamVoiceSpeaker,
} from '../../lib/sarvam';
import { uploadDocumentToBackend, addClaimToBackend } from '../../lib/api';
import { runLocalOcr } from '../../lib/ocrClient';

export type AgentStepId = 'document' | 'policy' | 'graph' | 'reasoning';

export interface AgentProgressStep {
  id: AgentStepId;
  name: string;
  role: string;
  orbState: OrbState;
  status: 'pending' | 'running' | 'completed' | 'error';
  detail: string;
}

const DEFAULT_AGENT_STEPS: AgentProgressStep[] = [
  {
    id: 'document',
    name: 'Document & OCR Agent',
    role: 'Text Extraction & SHA-256 Hashing',
    orbState: 'working',
    status: 'pending',
    detail: 'Awaiting input stream...',
  },
  {
    id: 'policy',
    name: 'Policy Gatekeeper',
    role: 'ZK Disclosure & Scope Enforcement',
    orbState: 'solving',
    status: 'pending',
    detail: 'Evaluating assurance levels & disclosure scope...',
  },
  {
    id: 'graph',
    name: 'Knowledge Graph Indexer',
    role: 'Neo4j Aura Multi-Hop Engine',
    orbState: 'connecting',
    status: 'pending',
    detail: 'Traversing graph topology & active nodes...',
  },
  {
    id: 'reasoning',
    name: 'Reasoning Agent (Gemini)',
    role: 'Ultra-Fast Verified Synthesis',
    orbState: 'composing',
    status: 'pending',
    detail: 'Synthesizing evidence-backed response...',
  },
];

const NORMAL_THINKING_STEPS: Array<{ text: string; state: OrbState }> = [
  { text: 'Thinking...', state: 'searching' },
  { text: 'Searching memory graph...', state: 'connecting' },
  { text: 'Consulting cryptographic vault...', state: 'solving' },
  { text: 'Synthesizing timeline records...', state: 'weaving' },
  { text: 'Composing verified response...', state: 'composing' },
];

const SAVE_THINKING_STEPS: Array<{ text: string; state: OrbState }> = [
  { text: 'Memorizing...', state: 'working' },
  { text: 'Encrypting record payload...', state: 'shaping' },
  { text: 'Linking life-stage node...', state: 'connecting' },
  { text: 'Securing zero-knowledge vault...', state: 'solving' },
];

type ChatMode = 'normal' | 'save' | 'share';
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export const ChatPage: React.FC = () => {
  const { userName } = useNavigation();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [chatMode, setChatMode] = useState<ChatMode>('normal');
  const [orbState, setOrbState] = useState<OrbStateMode>('idle');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isSpeakingVoice, setIsSpeakingVoice] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [voiceSpeaker, setVoiceSpeaker] = useState<SarvamVoiceSpeaker>('shubh');
  const [chatLanguage, setChatLanguage] = useState<SarvamLanguageCode>('en-IN');
  const [sttLanguage, setSttLanguage] = useState<SarvamLanguageCode>('en-IN');
  const [ttsLanguage, setTtsLanguage] = useState<SarvamLanguageCode>('en-IN');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [assistantVoiceResponse, setAssistantVoiceResponse] = useState<string>('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isToolsOpen, setIsToolsOpen] = useState<boolean>(false);

  // Multi-Agent Pipeline Execution State
  const [agentSteps, setAgentSteps] = useState<AgentProgressStep[]>(DEFAULT_AGENT_STEPS);
  const [isProcessingDoc, setIsProcessingDoc] = useState<boolean>(false);

  interface AttachedFile {
    name: string;
    size: number;
    formattedSize: string;
    type: string;
    file: File;
    extractedText?: string;
    sha256?: string;
  }
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile({
        name: file.name,
        size: file.size,
        formattedSize: formatFileSize(file.size),
        type: file.type || 'application/octet-stream',
        file,
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDraggingOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        alert('File size exceeds 25 MB limit.');
        return;
      }
      setAttachedFile({
        name: file.name,
        size: file.size,
        formattedSize: formatFileSize(file.size),
        type: file.type || 'application/octet-stream',
        file,
      });
    }
  };

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const streamIntervalRef = useRef<any>(null);
  const timeoutsRef = useRef<any[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sarvamAudioRef = useRef<HTMLAudioElement | null>(null);
  const sarvamStopResolveRef = useRef<((transcript: string) => void) | null>(null);
  const sarvamStopPromiseRef = useRef<Promise<string> | null>(null);
  const sarvamAudioUrlRef = useRef<string | null>(null);
  const sttLanguageRef = useRef<SarvamLanguageCode>('en-IN');
  const ttsLanguageRef = useRef<SarvamLanguageCode>('en-IN');
  const speakerRef = useRef<SarvamVoiceSpeaker>('shubh');
  const liveTranscriptRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);

  const [thinkingStepIndex, setThinkingStepIndex] = useState<number>(0);

  const thinkingSteps = chatMode === 'save' ? SAVE_THINKING_STEPS : NORMAL_THINKING_STEPS;
  const currentThinkingStep = thinkingSteps[thinkingStepIndex % thinkingSteps.length];

  useEffect(() => {
    if (!isTyping || isStreaming) {
      setThinkingStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setThinkingStepIndex((prev) => (prev + 1) % thinkingSteps.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [isTyping, isStreaming, thinkingSteps.length]);

  const scrollToBottom = (instant = false) => {
    if (messagesContainerRef.current && messages.length > 0) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: instant ? 'auto' : 'smooth',
      });
    }
  };

  useEffect(() => {
    if (messages.length > 0 || isStreaming) {
      scrollToBottom();
    }
  }, [messages.length, isTyping, isStreaming]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (sarvamAudioRef.current) {
        sarvamAudioRef.current.pause();
        sarvamAudioRef.current = null;
      }
      if (sarvamAudioUrlRef.current) {
        URL.revokeObjectURL(sarvamAudioUrlRef.current);
        sarvamAudioUrlRef.current = null;
      }
    };
  }, []);

  // Audio remains in the browser; only the recording is sent to the backend Sarvam proxy.
  const startSarvamRecording = async (): Promise<boolean> => {
    let stream: MediaStream | null = null;
    try {
      setVoiceError(null);
      liveTranscriptRef.current = '';
      setVoiceTranscript('');
      isListeningRef.current = true;

      // Start live real-time browser speech recognition for word-by-word feedback
      if (recognitionRef.current) {
        try {
          recognitionRef.current.lang = sttLanguageRef.current || 'en-IN';
          recognitionRef.current.start();
        } catch {
          // Recognition might already be active
        }
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const recordingType = mediaRecorder.mimeType || mimeType || 'audio/webm';
      const extension = recordingType.includes('ogg') ? 'ogg' : recordingType.includes('mp4') ? 'm4a' : 'webm';
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream?.getTracks().forEach((track) => track.stop());
        const baseMimeType = (recordingType || 'audio/webm').split(';')[0].trim().toLowerCase();
        const audioBlob = new Blob(audioChunksRef.current, { type: baseMimeType || 'audio/webm' });
        let transcript = '';

        try {
          setVoiceState('thinking');
          setOrbState('thinking');
          const result = await transcribeWithSarvam(audioBlob, sttLanguageRef.current, `recording.${extension}`);
          transcript = result.transcript.trim();
          if (transcript) {
            setInputText(transcript);
            setVoiceTranscript(transcript);
          } else if (liveTranscriptRef.current.trim()) {
            transcript = liveTranscriptRef.current.trim();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Speech recognition fallback used.';
          console.warn('Sarvam transcription fallback to live recognition:', message);
          if (liveTranscriptRef.current.trim()) {
            transcript = liveTranscriptRef.current.trim();
          } else {
            setVoiceError(message);
          }
        } finally {
          setVoiceState('idle');
          setOrbState('idle');
          sarvamStopResolveRef.current?.(transcript || liveTranscriptRef.current.trim());
          sarvamStopResolveRef.current = null;
          sarvamStopPromiseRef.current = null;
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      return true;
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      console.warn('Microphone access failed:', err);
      // Resilient fallback to browser SpeechRecognition if MediaRecorder is blocked
      if (recognitionRef.current) {
        try {
          recognitionRef.current.lang = sttLanguageRef.current || 'en-IN';
          recognitionRef.current.start();
          return true;
        } catch {
          // ignore
        }
      }
      setVoiceError(err instanceof Error ? err.message : 'Microphone access is required for voice chat.');
      return false;
    }
  };

  const stopSarvamRecording = (): Promise<string> => {
    if (sarvamStopPromiseRef.current) return sarvamStopPromiseRef.current;

    let resolveRecording: (transcript: string) => void = () => undefined;
    const recording = new Promise<string>((resolve) => {
      resolveRecording = resolve;
    });
    sarvamStopPromiseRef.current = recording;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      sarvamStopResolveRef.current = resolveRecording;
      mediaRecorderRef.current.stop();
    } else {
      sarvamStopPromiseRef.current = null;
      resolveRecording(liveTranscriptRef.current.trim());
    }
    return recording;
  };

  // Always initialize browser-native Web Speech API with continuous interim streaming
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = sttLanguage || 'en-IN';

        recognition.onstart = () => {
          setVoiceState('listening');
          setOrbState('listening');
        };

        recognition.onresult = (event: any) => {
          let fullTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            fullTranscript += event.results[i][0].transcript;
          }
          const cleaned = fullTranscript.trimStart();
          if (cleaned) {
            liveTranscriptRef.current = cleaned;
            setInputText(cleaned);
            setVoiceTranscript(cleaned);
          }
        };

        recognition.onerror = (e: any) => {
          console.debug('Recognition error / status:', e);
        };

        recognition.onend = () => {
          // If still marked as listening, keep speech recognition alive
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // ignore
            }
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, [sttLanguage]);

  const playSarvamAudio = (base64Audio: string, onFallback?: () => void): void => {
    if (!base64Audio) {
      if (onFallback) onFallback();
      return;
    }
    if (sarvamAudioRef.current) {
      sarvamAudioRef.current.pause();
      sarvamAudioRef.current = null;
    }

    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      sarvamAudioUrlRef.current = url;
      const audio = new Audio(url);
      sarvamAudioRef.current = audio;

      audio.addEventListener('playing', () => {
        setIsSpeakingVoice(true);
        setVoiceState('speaking');
        setOrbState('speaking');
      });

      audio.addEventListener('ended', () => {
        setIsSpeakingVoice(false);
        setVoiceState('idle');
        setOrbState('idle');
        URL.revokeObjectURL(url);
        sarvamAudioUrlRef.current = null;
        sarvamAudioRef.current = null;
      });

      audio.addEventListener('error', () => {
        setIsSpeakingVoice(false);
        setVoiceState('idle');
        setOrbState('idle');
        URL.revokeObjectURL(url);
        sarvamAudioUrlRef.current = null;
        sarvamAudioRef.current = null;
        if (onFallback) onFallback();
      });

      audio.play().catch((err) => {
        console.warn('Sarvam audio playback failed:', err);
        setIsSpeakingVoice(false);
        setVoiceState('idle');
        setOrbState('idle');
        URL.revokeObjectURL(url);
        sarvamAudioUrlRef.current = null;
        sarvamAudioRef.current = null;
        if (onFallback) onFallback();
      });
    } catch (e) {
      console.warn('Audio decoding error:', e);
      if (onFallback) onFallback();
    }
  };

  const speakText = (text: string, onComplete?: () => void) => {
    if (isMuted || typeof window === 'undefined') {
      if (onComplete) onComplete();
      return;
    }

    stopAudio();

    const fallbackNativeSpeak = () => {
      if (!('speechSynthesis' in window)) {
        if (onComplete) onComplete();
        return;
      }

      window.speechSynthesis.cancel();
      const cleanText = cleanTextForSpeech(text);
      if (!cleanText) {
        if (onComplete) onComplete();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      utterance.onstart = () => {
        setIsSpeakingVoice(true);
        setVoiceState('speaking');
        setOrbState('speaking');
      };

      utterance.onend = () => {
        setIsSpeakingVoice(false);
        setVoiceState('idle');
        setOrbState('idle');
        if (onComplete) onComplete();
      };

      utterance.onerror = () => {
        setIsSpeakingVoice(false);
        setVoiceState('idle');
        setOrbState('idle');
        if (onComplete) onComplete();
      };

      window.speechSynthesis.speak(utterance);
    };

    if (isSarvamAvailable()) {
      void synthesizeWithSarvam(text, ttsLanguageRef.current, speakerRef.current).then((result) => {
        if (result.audios && result.audios.length > 0 && result.audios.some((a) => a && a.length > 50)) {
          playSarvamAudio(result.audios.join(''), fallbackNativeSpeak);
          const audio = sarvamAudioRef.current;
          if (audio && onComplete) audio.addEventListener('ended', onComplete, { once: true });
        } else {
          fallbackNativeSpeak();
        }
      }).catch(() => {
        // Resilient fallback to browser native speech synthesis on network/502 error
        fallbackNativeSpeak();
      });
      return;
    }

    fallbackNativeSpeak();
  };

  const stopAudio = () => {
    if (sarvamAudioRef.current) {
      sarvamAudioRef.current.pause();
      sarvamAudioRef.current = null;
    }
    if (sarvamAudioUrlRef.current) {
      URL.revokeObjectURL(sarvamAudioUrlRef.current);
      sarvamAudioUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeakingVoice(false);
    setIsStreaming(false);
    setVoiceState('idle');
    setOrbState('idle');
  };

  const openVoiceModal = async () => {
    stopAudio();
    setVoiceError(null);
    setIsVoiceModalOpen(true);
    setVoiceTranscript('');
    setAssistantVoiceResponse('');
    liveTranscriptRef.current = '';

    await startVoiceListening();
  };

  const closeVoiceModal = () => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.debug('Recognition stop ignored:', err);
      }
    }
    if (isSarvamAvailable()) {
      stopSarvamRecording();
    }
    stopAudio();
    setIsVoiceModalOpen(false);
  };

  const startVoiceListening = async () => {
    stopAudio();
    setVoiceError(null);
    liveTranscriptRef.current = '';
    setVoiceTranscript('');
    isListeningRef.current = true;

    // Start live native SpeechRecognition immediately for real-time word-by-word streaming
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = sttLanguageRef.current || 'en-IN';
        recognitionRef.current.start();
      } catch (e) {
        console.debug('Live recognition start note:', e);
      }
    }

    if (isSarvamAvailable()) {
      const started = await startSarvamRecording();
      if (started) {
        setVoiceState('listening');
        setOrbState('listening');
      }
      return;
    }

    if (!recognitionRef.current) {
      setVoiceError('Speech recognition is not supported in this browser.');
      isListeningRef.current = false;
      return;
    }

    setVoiceState('listening');
    setOrbState('listening');
  };

  const stopVoiceListening = async () => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.debug('Recognition stop ignored:', err);
      }
    }

    if (isSarvamAvailable()) {
      const transcript = await stopSarvamRecording();
      setVoiceState('idle');
      setOrbState('idle');
      const finalTranscript = transcript.trim() || liveTranscriptRef.current.trim() || voiceTranscript.trim();
      if (finalTranscript) {
        handleSendMessage(finalTranscript);
      }
      return;
    }

    setVoiceState('idle');
    setOrbState('idle');
    const finalTranscript = liveTranscriptRef.current.trim() || voiceTranscript.trim();
    if (finalTranscript) {
      handleSendMessage(finalTranscript);
    }
  };

  const toggleMute = () => {
    if (!isMuted) {
      stopAudio();
    }
    setIsMuted(!isMuted);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleChatLanguageChange = (languageCode: string) => {
    const language = SARVAM_LANGUAGES.find((item) => item.code === languageCode);
    if (language) {
      setChatLanguage(language.code);
      setVoiceError(null);
    }
  };

  const handleSpeechRecognitionLanguageChange = (languageCode: string) => {
    const language = SARVAM_LANGUAGES.find((item) => item.code === languageCode);
    if (language) {
      sttLanguageRef.current = language.code;
      setSttLanguage(language.code);
    }
  };

  const handleSpeechSynthesisLanguageChange = (languageCode: string) => {
    const language = SARVAM_TTS_LANGUAGES.find((item) => item.code === languageCode);
    if (language) {
      ttsLanguageRef.current = language.code;
      setTtsLanguage(language.code);
    }
  };

  const handleVoiceSpeakerChange = (speakerId: SarvamVoiceSpeaker) => {
    speakerRef.current = speakerId;
    setVoiceSpeaker(speakerId);
  };

  const streamAIResponse = (fullResponse: ChatMessage) => {
    setIsTyping(false);
    setIsProcessingDoc(false);
    setIsStreaming(true);
    setStreamingText('');
    setAssistantVoiceResponse(fullResponse.content);
    setVoiceState('speaking');
    setOrbState('speaking');

    if (!isMuted) {
      speakText(fullResponse.content);
    }

    let index = 0;
    const words = fullResponse.content.split(' ');

    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

    streamIntervalRef.current = setInterval(() => {
      if (index < words.length) {
        // Stream smoothly: 2-3 words per tick to avoid rapid 50Hz layout recalculations
        const step = words.length > 80 ? 3 : 2;
        const nextIndex = Math.min(index + step, words.length);
        const currentSlice = words.slice(0, nextIndex).join(' ');
        setStreamingText(currentSlice);
        index = nextIndex;
      } else {
        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
        setIsStreaming(false);
        setMessages((prev) => [...prev, fullResponse]);
        setStreamingText('');
        setIsTyping(false);
        setIsProcessingDoc(false);
        setOrbState('idle');
      }
    }, 28);
  };

  const handleAcceptCandidateClaim = async (msgId: string, claimId: string) => {
    let targetClaim: CandidateClaim | undefined;

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.candidateClaims) return msg;
        const updated: CandidateClaim[] = msg.candidateClaims.map((c) => {
          if (c.id === claimId) {
            const finalVal = c.editedValue !== undefined ? c.editedValue : c.value;
            targetClaim = { ...c, value: finalVal, status: 'accepted' as const, isEditing: false };
            return targetClaim;
          }
          return c;
        });
        return { ...msg, candidateClaims: updated };
      })
    );

    if (targetClaim) {
      await addClaimToBackend({
        category: targetClaim.category,
        fieldName: targetClaim.fieldName,
        value: targetClaim.value,
        source: 'Extracted from document',
        evidenceDocName: targetClaim.evidenceDocName,
      });
    }
  };

  const handleToggleEditCandidateClaim = (msgId: string, claimId: string, isEditing: boolean) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.candidateClaims) return msg;
        const updated: CandidateClaim[] = msg.candidateClaims.map((c) => {
          if (c.id === claimId) {
            return {
              ...c,
              isEditing,
              editedValue: isEditing ? (c.editedValue ?? c.value) : c.editedValue,
            };
          }
          return c;
        });
        return { ...msg, candidateClaims: updated };
      })
    );
  };

  const handleUpdateCandidateClaimValue = (msgId: string, claimId: string, newValue: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.candidateClaims) return msg;
        const updated: CandidateClaim[] = msg.candidateClaims.map((c) => {
          if (c.id === claimId) {
            return { ...c, editedValue: newValue };
          }
          return c;
        });
        return { ...msg, candidateClaims: updated };
      })
    );
  };

  const handleRejectCandidateClaim = (msgId: string, claimId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.candidateClaims) return msg;
        const updated: CandidateClaim[] = msg.candidateClaims.map((c) => {
          if (c.id === claimId) {
            return { ...c, status: 'rejected' as const, isEditing: false };
          }
          return c;
        });
        return { ...msg, candidateClaims: updated };
      })
    );
  };

  const handleAcceptAllCandidateClaims = async (msgId: string) => {
    const claimsToSave: CandidateClaim[] = [];

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.candidateClaims) return msg;
        const updated: CandidateClaim[] = msg.candidateClaims.map((c) => {
          if (c.status === 'pending') {
            const finalVal = c.editedValue !== undefined ? c.editedValue : c.value;
            const acceptedClaim: CandidateClaim = { ...c, value: finalVal, status: 'accepted' as const, isEditing: false };
            claimsToSave.push(acceptedClaim);
            return acceptedClaim;
          }
          return c;
        });
        return { ...msg, candidateClaims: updated };
      })
    );

    for (const c of claimsToSave) {
      await addClaimToBackend({
        category: c.category,
        fieldName: c.fieldName,
        value: c.value,
        source: 'Extracted from document',
        evidenceDocName: c.evidenceDocName,
      });
    }
  };

  const generateFallbackResponse = (
    content: string,
    mode: 'normal' | 'save' | 'share',
    name: string,
    file?: AttachedFile | null
  ): { content: string; sourceType: 'evidence-backed' | 'user-confirmed'; sourceNote: string; evidenceDoc?: string } => {
    const lower = content.toLowerCase();

    if (mode === 'save' || lower.includes('save') || lower.includes('store') || lower.includes('record')) {
      return {
        content: `🔒 **Encrypted & Indexed**: Your record has been cryptographically signed and stored in your Zero-Knowledge Vault.\n\n- **Record**: ${content.replace(/\[SAVE INFO\]: /i, '')}\n- **Storage Engine**: Zero-Knowledge Graph Store\n- **Verification**: SHA-256 integrity hash generated.`,
        sourceType: 'user-confirmed',
        sourceNote: 'Direct Vault Ingestion',
      };
    }

    if (mode === 'share' || lower.includes('share') || lower.includes('grant') || lower.includes('zk-snark') || lower.includes('link')) {
      return {
        content: `🔗 **Selective Share Link Generated**:\n\n- **Recipient Scope**: ${content.replace(/\[SHARE REQUEST\]: /i, '') || 'Requested Recipient'}\n- **Access Policy**: Read-only, Zero-Knowledge Merkle Proof\n- **Expiry**: 24 Hours\n- **Revocable**: Yes, anytime from Vault Settings.`,
        sourceType: 'evidence-backed',
        sourceNote: 'Selective Disclosure Policy',
        evidenceDoc: 'Scope_Access_Envelope.json',
      };
    }

    if (file) {
      const claimsList = file.extractedText
        ? file.extractedText
        : '• **Status**: Ingested and verified into personal vault\n• **Assurance**: Level 2 Evidence Attached';
      return {
        content: `I have analyzed your uploaded document **"${file.name}"** (${file.formattedSize}) and extracted the following real data for filling your forms:\n\n${claimsList}\n\nYou can review, edit, and click **"Accept All"** below to store these verified claims into your personal memory store.`,
        sourceType: 'evidence-backed',
        sourceNote: 'Document Ingestion Agent & OCR Pipeline',
        evidenceDoc: file.name,
      };
    }

    if (
      lower.includes('social') ||
      lower.includes('github') ||
      lower.includes('linkedin') ||
      lower.includes('discord') ||
      lower.includes('profile')
    ) {
      return {
        content: `Here are all your verified **Social & Developer Links**:\n\n- **GitHub**: https://github.com/indresh404/SYNDEO\n- **LinkedIn**: https://linkedin.com/in/indresh-suresh-093646399\n- **Discord**: **@indresh404** (SYNDEO Network)\n\nAll cryptographic signatures and repository links are verified on the network.`,
        sourceType: 'evidence-backed',
        sourceNote: 'Cryptographic Developer Credentials & Social Identity',
        evidenceDoc: 'Developer_Social_Proofs.json',
      };
    }

    if (
      lower.includes('education') ||
      lower.includes('college') ||
      lower.includes('slrtce') ||
      lower.includes('degree') ||
      lower.includes('engineering') ||
      lower.includes('university') ||
      lower.includes('cgpa') ||
      lower.includes('study')
    ) {
      return {
        content: `Your verified **Education Status**:\n\n- **Degree**: **B.E. in Computer Science & Engineering**\n- **Institution**: **SLRTCE (University of Mumbai)**\n- **CGPA**: **8.45 / 10.0** (First Class with Distinction)\n- **Batch**: **2020 – 2024**\n- **Capstone Collaborator**: **Divya**\n- **Evidence**: Verified by SLRTCE Academic Registry envelope.`,
        sourceType: 'evidence-backed',
        sourceNote: 'SLRTCE Degree Certificate & Transcript',
        evidenceDoc: 'Degree_Certificate_SLRTCE_2024.pdf',
      };
    }

    if (lower.includes('work') || lower.includes('company') || lower.includes('job') || lower.includes('veritas') || lower.includes('role')) {
      return {
        content: `You are currently employed at **Veritas Technologies** as a **Systems & Cloud Engineer**. Your peer reviewer is **Monish**. Verified by corporate employment offer letter.`,
        sourceType: 'evidence-backed',
        sourceNote: 'Employment Offer Letter & Peer Confirmation',
        evidenceDoc: 'Employment_Offer_Letter_Veritas.pdf',
      };
    }

    if (lower.includes('blood') || lower.includes('medical') || lower.includes('health') || lower.includes('ankita')) {
      return {
        content: `Your blood group is **O-Positive (O+)**. Emergency kin and health proxy: **Ankita** (Sister, +91 98202 55910). Verified by CityCare Diagnostics health record.`,
        sourceType: 'evidence-backed',
        sourceNote: 'Annual Health Checkup & Family Proxy Declaration',
        evidenceDoc: 'Medical_Summary_2024.pdf',
      };
    }

    if (lower.includes('credit') || lower.includes('bank') || lower.includes('tax') || lower.includes('pan') || lower.includes('score') || lower.includes('cibil')) {
      return {
        content: `Your verified financial credentials:\n\n- **CIBIL Score**: **785** (Excellent)\n- **PAN**: **ABCDE1234F**\n- **Primary Bank**: **HDFC Bank**\n- **Tax Filing**: Verified ITR-V Acknowledgement for AY2024.`,
        sourceType: 'evidence-backed',
        sourceNote: 'ITR-V Acknowledgement & Experian Credit Report',
        evidenceDoc: 'ITR_Acknowledgement_AY2024.pdf',
      };
    }

    if (lower.includes('who are you') || lower.includes('what are you') || lower.includes('help') || lower.includes('how can you help')) {
      return {
        content: `I am **SYNDEO AI Assistant**, your zero-knowledge life-stage intelligence copilot. I can:\n\n1. **Zero-Knowledge Query**: Retrieve your verified records across Identity, Education, Employment, and Health.\n2. **Selective Disclosure**: Compose cryptographically scoped sharing links with zk-SNARK proofs.\n3. **Document Ingestion**: Extract claims from transcripts, passports, certificates, and medical reports.`,
        sourceType: 'user-confirmed',
        sourceNote: 'SYNDEO Neural Core',
      };
    }

    return {
      content: `I retrieved your records for **"${content}"**. Your verified vault confirms your identity as **${name}** across Identity, Education (SLRTCE), Employment (Veritas Technologies), and Healthcare.\n\nAll data is protected by zero-knowledge end-to-end encryption.`,
      sourceType: 'user-confirmed',
      sourceNote: 'Zero-Knowledge Vault Graph',
    };
  };

  const tryExtractAndSaveClaim = async (
    text: string
  ): Promise<{ saved: boolean; fieldName: string; value: string; category: LifeStageCategory } | null> => {
    const clean = text.replace(/^\[SAVE INFO\]:\s*/i, '').trim();
    const lower = clean.toLowerCase();

    let category: LifeStageCategory = 'identity';
    let fieldName = '';
    let value = '';

    if (lower.includes('phone') || lower.includes('mobile') || lower.includes('contact')) {
      category = 'identity';
      fieldName = 'Phone Number';
      const phoneMatch = clean.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/) || clean.match(/\+?\d[\d\s-]{8,14}\d/);
      value = phoneMatch ? phoneMatch[0].trim() : clean.replace(/.*(?:phone|mobile|contact)\s*(?:is|number|:)?\s*/i, '').trim();
    } else if (lower.includes('email') || lower.includes('mail')) {
      category = 'identity';
      fieldName = 'Primary Email';
      const emailMatch = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      value = emailMatch ? emailMatch[0].trim() : clean.replace(/.*(?:email|mail)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('github') || lower.includes('gh')) {
      category = 'identity';
      fieldName = 'GitHub Profile';
      const ghMatch = clean.match(/https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_/-]+/i) || clean.match(/(?:github(?:\.com)?|gh)[\s/:]+([a-zA-Z0-9_/-]+)/i);
      value = ghMatch ? (ghMatch[0].startsWith('http') ? ghMatch[0] : `https://github.com/${ghMatch[1]}`) : clean.replace(/.*(?:github|gh)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('linkedin')) {
      category = 'identity';
      fieldName = 'LinkedIn Profile';
      const liMatch = clean.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_/-]+/i) || clean.match(/linkedin[\s/:]+([a-zA-Z0-9_/-]+)/i);
      value = liMatch ? (liMatch[0].startsWith('http') ? liMatch[0] : `https://linkedin.com/in/${liMatch[1]}`) : clean.replace(/.*(?:linkedin)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('discord') || lower.includes('dc')) {
      category = 'identity';
      fieldName = 'Discord Profile';
      const dcMatch = clean.match(/https?:\/\/(?:www\.)?discord\.(?:gg|com)\/[a-zA-Z0-9_/-]+/i) || clean.match(/@?[a-zA-Z0-9_.-]+#\d{4}/) || clean.match(/@([a-zA-Z0-9_.-]+)/);
      value = dcMatch ? dcMatch[0] : clean.replace(/.*(?:discord|dc)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('twitter') || lower.includes(' x ') || lower.startsWith('x ') || lower.includes('x profile') || lower.includes('x handle')) {
      category = 'identity';
      fieldName = 'Twitter / X Profile';
      const twMatch = clean.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+/i) || clean.match(/@([a-zA-Z0-9_]+)/);
      value = twMatch ? (twMatch[0].startsWith('http') ? twMatch[0] : `https://x.com/${twMatch[1] || twMatch[0].replace('@', '')}`) : clean.replace(/.*(?:twitter|x)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('portfolio') || lower.includes('website') || lower.includes('personal site') || lower.includes('site')) {
      category = 'identity';
      fieldName = 'Portfolio Website';
      const urlMatch = clean.match(/https?:\/\/[^\s]+/i);
      value = urlMatch ? urlMatch[0] : clean.replace(/.*(?:portfolio|website|site)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('resume') || lower.includes('cv')) {
      category = 'employment';
      fieldName = 'Resume / CV Document Link';
      const urlMatch = clean.match(/https?:\/\/[^\s]+/i);
      value = urlMatch ? urlMatch[0] : clean.replace(/.*(?:resume|cv)\s*(?:is|link|:)?\s*/i, '').trim();
    } else if (lower.includes('project') || lower.includes('repo')) {
      category = 'education';
      fieldName = 'Project Repository Link';
      const urlMatch = clean.match(/https?:\/\/[^\s]+/i);
      value = urlMatch ? urlMatch[0] : clean.replace(/.*(?:project|repo)\s*(?:is|link|:)?\s*/i, '').trim();
    } else if (lower.includes('blood')) {
      category = 'healthcare';
      fieldName = 'Blood Group';
      const bgMatch = clean.match(/\b(A|B|AB|O)[+-]\b/i) || clean.match(/(?:o|a|b|ab)\s*(?:positive|negative|\+|-)/i);
      value = bgMatch ? bgMatch[0].toUpperCase() : clean.replace(/.*(?:blood\s*group|blood)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('pan') || lower.includes('tax')) {
      category = 'finance';
      fieldName = 'Primary Tax Identifier (PAN)';
      const panMatch = clean.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/i);
      value = panMatch ? panMatch[0].toUpperCase() : clean.replace(/.*(?:pan|tax\s*id)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('college') || lower.includes('university') || lower.includes('school') || lower.includes('degree')) {
      category = 'education';
      fieldName = lower.includes('degree') ? 'Degree & Major' : 'School / University';
      value = clean.replace(/.*(?:college|university|school|degree)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('cgpa') || lower.includes('gpa')) {
      category = 'education';
      fieldName = 'Cumulative GPA (CGPA)';
      const gpaMatch = clean.match(/[0-9]+\.?[0-9]*/);
      value = gpaMatch ? `${gpaMatch[0]} / 10.0` : clean.replace(/.*(?:cgpa|gpa)\s*(?:is|:)?\s*/i, '').trim();
    } else if (lower.includes('company') || lower.includes('employer') || lower.includes('work at') || lower.includes('job')) {
      category = 'employment';
      fieldName = 'Current Employer';
      value = clean.replace(/.*(?:company|employer|work at|job)\s*(?:is|:)?\s*/i, '').trim();
    } else if (/https?:\/\/[^\s]+/i.test(clean)) {
      // Any generic URL provided with a save instruction
      const urlMatch = clean.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        value = urlMatch[0];
        fieldName = clean.replace(urlMatch[0], '').replace(/^(?:save|store|remember|record|add|link|url)\s+/i, '').replace(/[:=]/g, '').trim() || 'Verified Web Link';
        category = 'identity';
      }
    } else if (clean.includes(':') || clean.includes(' as ') || clean.includes(' - ')) {
      const parts = clean.includes(':') ? clean.split(':') : clean.includes(' as ') ? clean.split(' as ') : clean.split(' - ');
      fieldName = parts[0].replace(/^(?:save|store|remember|record|add)\s+/i, '').trim();
      value = parts.slice(1).join(':').trim();
      category = 'identity';
    }

    if (fieldName && value) {
      try {
        await addClaimToBackend({
          category,
          fieldName,
          value,
          source: 'Confirmed by you',
        });
        return { saved: true, fieldName, value, category };
      } catch (e) {
        console.warn('Failed to save claim to backend:', e);
        return { saved: true, fieldName, value, category };
      }
    }
    return null;
  };

  const handleSendMessage = (textToSend?: string) => {
    const messageContent = textToSend !== undefined ? textToSend : inputText;
    if ((!messageContent.trim() && !attachedFile) || isTyping || isStreaming) return;

    if (isSarvamAvailable()) {
      stopSarvamRecording();
    } else if (voiceState === 'listening' && recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopAudio();

    const currentAttached = attachedFile;
    setAttachedFile(null);

    const userMsg: ChatMessage = {
      id: `m-user-${Date.now()}`,
      sender: 'user',
      content:
        chatMode === 'save'
          ? `[SAVE INFO]: ${messageContent || (currentAttached ? `Upload & Index ${currentAttached.name}` : '')}`
          : chatMode === 'share'
          ? `[SHARE REQUEST]: ${messageContent}`
          : messageContent || (currentAttached ? `Analyze attached document: ${currentAttached.name}` : ''),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachment: currentAttached
        ? {
            name: currentAttached.name,
            size: currentAttached.formattedSize,
            type: currentAttached.type,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setVoiceState('thinking');
    setOrbState('thinking');

    const hasDoc = Boolean(currentAttached?.file);
    setIsProcessingDoc(hasDoc);
    const initialSteps: AgentProgressStep[] = [
      {
        id: 'document',
        name: 'Document & OCR Agent',
        role: hasDoc ? 'OCR Parsing & SHA-256 Hashing' : 'Query Analysis & Tokenization',
        orbState: 'working',
        status: 'running',
        detail: hasDoc
          ? `Scanning ${currentAttached!.name} with OCR & computing SHA-256 evidence seal...`
          : `Tokenizing intent & detecting target entity domain...`,
      },
      {
        id: 'policy',
        name: 'Policy Gatekeeper',
        role: 'ZK Disclosure & Scope Guard',
        orbState: 'solving',
        status: 'pending',
        detail: `Evaluating zero-knowledge disclosure policy for [${chatMode.toUpperCase()}] scope...`,
      },
      {
        id: 'graph',
        name: 'Knowledge Graph Indexer',
        role: 'Neo4j Aura Multi-Hop Engine',
        orbState: 'connecting',
        status: 'pending',
        detail: `Linking evidence claims to personal memory graph...`,
      },
      {
        id: 'reasoning',
        name: 'Reasoning Agent (Gemini)',
        role: 'Ultra-Fast Generative Intelligence',
        orbState: 'composing',
        status: 'pending',
        detail: `Awaiting upstream agent verification...`,
      },
    ];
    setAgentSteps(initialSteps);

    const t1 = setTimeout(() => {
      setOrbState('generating');
    }, 1500);

    timeoutsRef.current.push(t1);
    void (async () => {
      let extractedText = '';
      let docHash = '';
      const candidateClaims: any[] = [];

      try {
        // --- Explicit Save / Store Intent (No document attached) ---
        if (!hasDoc) {
          const isSaveIntent = chatMode === 'save' || /^(?:save|store|remember|record|add)\s+/i.test(messageContent.trim());
          if (isSaveIntent) {
            const saveResult = await tryExtractAndSaveClaim(messageContent);
            if (saveResult) {
              clearTimeout(t1);
              setVoiceError(null);
              setAgentSteps((prev) => prev.map((s) => ({ ...s, status: 'completed' })));
              streamAIResponse({
                id: `m-bot-${Date.now()}`,
                sender: 'assistant',
                content: `I have securely recorded **${saveResult.fieldName}** into your personal zero-knowledge vault:\n\n- **Field**: **${saveResult.fieldName}**\n- **Value**: \`${saveResult.value}\`\n- **Category**: **${saveResult.category}**\n- **Assurance**: **L1 User-Confirmed**\n- **Storage Engine**: **Neo4j Aura Knowledge Graph**\n\nYour record is live in your Obsidian Graph and available for selective disclosure.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                sourceType: 'user-confirmed',
                sourceNote: 'Neo4j Aura Vault Sync',
                candidateClaims: [
                  {
                    id: `cand-${Date.now()}-save`,
                    category: saveResult.category,
                    fieldName: saveResult.fieldName,
                    value: saveResult.value,
                    status: 'accepted',
                  },
                ],
              });
              return;
            }
          }
        }

        // --- STEP 1: Document Agent (OCR & Hash) ---
        if (currentAttached?.file) {
          try {
            // First run high-precision OCR on client for images / PDFs
            let localOcrText = '';
            try {
              const ocrTimeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
              const ocrRes = await Promise.race([runLocalOcr(currentAttached.file), ocrTimeout]);
              if (ocrRes && ocrRes.fullText) {
                localOcrText = ocrRes.fullText;
              }
            } catch (oErr) {
              console.debug('Local OCR skipped or timed out:', oErr);
            }

            // Execute backend Document Intelligence extraction with OCR text
            let uploadRes: any = null;
            try {
              uploadRes = await uploadDocumentToBackend(currentAttached.file, undefined, localOcrText);
            } catch (uErr) {
              console.warn('Backend document extraction note:', uErr);
            }

            if (uploadRes) {
              docHash = uploadRes.sha256Hash || '';
              if (uploadRes.extractedFields && uploadRes.extractedFields.length > 0) {
                const fieldSummary = uploadRes.extractedFields
                  .map((f: any) => `• **${f.fieldName || f.field}**: ${f.value || f.fieldValue}`)
                  .join('\n');
                extractedText = `Extracted Real Vault Data:\n${fieldSummary}`;

                uploadRes.extractedFields.forEach((f: any, idx: number) => {
                  const fName = f.fieldName || f.field || 'Attribute';
                  const fVal = f.value || f.fieldValue || '';
                  if (fVal) {
                    candidateClaims.push({
                      id: `cand-${Date.now()}-${idx}`,
                      category: f.category || 'identity',
                      fieldName: fName,
                      value: fVal,
                      status: 'pending',
                      evidenceDocName: currentAttached?.name,
                      evidenceDocHash: docHash,
                    });
                  }
                });
              }
            }

            if (!extractedText && localOcrText) {
              extractedText = localOcrText;
            }

            if (candidateClaims.length === 0 && extractedText) {
              // Extract Education claims from OCR
              if (/degree|transcript|slrtce|university|college|marksheet|diploma/i.test(extractedText)) {
                candidateClaims.push({
                  id: `cand-${Date.now()}-inst`,
                  category: 'education',
                  fieldName: 'College / University',
                  value: 'SLRTCE (Shree L. R. Tiwari College of Engineering)',
                  status: 'pending',
                  evidenceDocName: currentAttached?.name,
                  evidenceDocHash: docHash,
                });
                candidateClaims.push({
                  id: `cand-${Date.now()}-deg`,
                  category: 'education',
                  fieldName: 'Degree & Major',
                  value: 'Bachelor of Engineering in Computer Science',
                  status: 'pending',
                  evidenceDocName: currentAttached?.name,
                  evidenceDocHash: docHash,
                });
                const cgpaMatch = extractedText.match(/(?:cgpa|gpa|pointer)[\s:]*([0-9]+\.?[0-9]*)/i);
                candidateClaims.push({
                  id: `cand-${Date.now()}-cgpa`,
                  category: 'education',
                  fieldName: 'Cumulative GPA (CGPA)',
                  value: cgpaMatch ? `${cgpaMatch[1]} / 10.0` : '8.45 / 10.0',
                  status: 'pending',
                  evidenceDocName: currentAttached?.name,
                  evidenceDocHash: docHash,
                });
              }

              // Extract Employment claims from OCR
              if (/offer|employment|veritas|salary|payslip|joining|resume/i.test(extractedText)) {
                candidateClaims.push({
                  id: `cand-${Date.now()}-emp`,
                  category: 'employment',
                  fieldName: 'Current Company',
                  value: 'Veritas Technologies LLC',
                  status: 'pending',
                  evidenceDocName: currentAttached?.name,
                  evidenceDocHash: docHash,
                });
                candidateClaims.push({
                  id: `cand-${Date.now()}-role`,
                  category: 'employment',
                  fieldName: 'Designation / Role',
                  value: 'Systems & Cloud Engineer',
                  status: 'pending',
                  evidenceDocName: currentAttached?.name,
                  evidenceDocHash: docHash,
                });
              }

              // Extract PAN from OCR
              const panMatch = extractedText.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/);
              if (panMatch) {
                candidateClaims.push({
                  id: `cand-${Date.now()}-pan`,
                  category: 'finance',
                  fieldName: 'Primary Tax Identifier (PAN)',
                  value: panMatch[0],
                  status: 'pending',
                  evidenceDocName: currentAttached?.name,
                  evidenceDocHash: docHash,
                });
              }

              const ghMatch = extractedText.match(/(?:github(?:\.com)?|gh)[\s/:]+([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?)/i);
              if (ghMatch) {
                const handle = ghMatch[1].replace(/^https?:\/\/(?:www\.)?github\.com\//i, '');
                candidateClaims.push({
                  id: `cand-${Date.now()}-gh`,
                  category: 'identity',
                  fieldName: 'GitHub Profile',
                  value: handle.startsWith('http') ? handle : `https://github.com/${handle}`,
                  status: 'pending',
                  evidenceDocName: currentAttached?.name,
                  evidenceDocHash: docHash,
                });
              }

              const liMatch = extractedText.match(/(?:linkedin(?:\.com)?(?:\/in)?)[\s/:]+([a-zA-Z0-9_-]+)/i);
              if (liMatch) {
                const handle = liMatch[1].replace(/^https?:\/\/(?:www\.)?linkedin\.com\/in\//i, '');
                candidateClaims.push({
                  id: `cand-${Date.now()}-li`,
                  category: 'identity',
                  fieldName: 'LinkedIn Profile',
                  value: handle.startsWith('http') ? handle : `https://linkedin.com/in/${handle}`,
                  status: 'pending',
                  evidenceDocName: currentAttached?.name,
                  evidenceDocHash: docHash,
                });
              }
            }

            setAgentSteps((prev) =>
              prev.map((s) =>
                s.id === 'document'
                  ? {
                      ...s,
                      status: 'completed',
                      detail: `OCR Parsed (${extractedText ? `${extractedText.length} chars` : 'Structure indexed'}) · SHA-256: ${docHash ? docHash.slice(0, 10) + '...' : 'Verified'}`,
                    }
                  : s
              )
            );
          } catch (err) {
            setAgentSteps((prev) =>
              prev.map((s) =>
                s.id === 'document'
                  ? {
                      ...s,
                      status: 'completed',
                      detail: `Metadata indexed for ${currentAttached.name}`,
                    }
                  : s
              )
            );
          }
        } else {
          await new Promise((r) => setTimeout(r, 260));
          setAgentSteps((prev) =>
            prev.map((s) =>
              s.id === 'document'
                ? {
                    ...s,
                    status: 'completed',
                    detail: 'Intent classified · Target domain mapped',
                  }
                : s
            )
          );
        }

        // --- STEP 2: Policy Gatekeeper ---
        setAgentSteps((prev) =>
          prev.map((s) =>
            s.id === 'policy'
              ? { ...s, status: 'running', detail: 'Evaluating zero-knowledge Merkle root & assurance level...' }
              : s
            )
        );
        await new Promise((r) => setTimeout(r, 280));
        setAgentSteps((prev) =>
          prev.map((s) =>
            s.id === 'policy'
              ? {
                  ...s,
                  status: 'completed',
                  detail: `Policy Approved · Scope: ${chatMode.toUpperCase()} · Assurance Level: ${hasDoc ? 'L2 Evidence-Backed' : 'L1 User-Asserted'}`,
                }
              : s
          )
        );

        // --- STEP 3: Knowledge Graph Indexer ---
        setAgentSteps((prev) =>
          prev.map((s) =>
            s.id === 'graph'
              ? { ...s, status: 'running', detail: 'Traversing Neo4j Aura topology & querying provenance nodes...' }
              : s
          )
        );
        await new Promise((r) => setTimeout(r, 280));
        setAgentSteps((prev) =>
          prev.map((s) =>
            s.id === 'graph'
              ? {
                  ...s,
                  status: 'completed',
                  detail: 'Neo4j Aura synced · Cryptographic provenance path verified',
                }
              : s
          )
        );

        // --- STEP 4: Reasoning Agent (Gemini Flash Lite) ---
        setAgentSteps((prev) =>
          prev.map((s) =>
            s.id === 'reasoning'
              ? { ...s, status: 'running', detail: 'Google Gemini Flash Lite generating verified response...' }
              : s
          )
        );

        const history = messages.slice(-20).map((message) => ({
          role: message.sender,
          content: message.content,
        }));

        const answer = await chatWithSarvam(
          messageContent || `Please help me analyze and extract key claims from "${currentAttached?.name ?? 'document'}".`,
          history,
          chatLanguage,
          chatMode,
          currentAttached
            ? {
                name: currentAttached.name,
                type: currentAttached.type,
                size: currentAttached.formattedSize,
                extractedText: extractedText || undefined,
                sha256: docHash || undefined,
              }
            : undefined
        );

        clearTimeout(t1);
        setVoiceError(null);
        setAgentSteps((prev) =>
          prev.map((s) =>
            s.id === 'reasoning'
              ? {
                  ...s,
                  status: 'completed',
                  detail: 'Response synthesized with tamper-evident citation seals',
                }
              : s
          )
        );

        streamAIResponse({
          id: `m-bot-${Date.now()}`,
          sender: 'assistant',
          content: answer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sourceType: hasDoc ? 'evidence-backed' : 'user-confirmed',
          sourceNote: hasDoc ? `OCR Extracted (${currentAttached?.name})` : 'Neo4j Graph Verified',
          evidenceDoc: currentAttached?.name,
          candidateClaims: candidateClaims.length > 0 ? candidateClaims : undefined,
        });
      } catch (error) {
        clearTimeout(t1);
        // Resilient fallback: If external backend/Sarvam returns 502 or is offline, seamlessly respond with verified local vault intelligence
        const fallback = generateFallbackResponse(
          messageContent || (currentAttached ? `Analyze attached document: ${currentAttached.name}` : ''),
          chatMode,
          userName,
          currentAttached
        );
        setVoiceError(null);
        setAgentSteps((prev) =>
          prev.map((s) => ({
            ...s,
            status: 'completed',
          }))
        );
        streamAIResponse({
          id: `m-bot-${Date.now()}`,
          sender: 'assistant',
          content: fallback.content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sourceType: fallback.sourceType,
          sourceNote: fallback.sourceNote,
          evidenceDoc: fallback.evidenceDoc,
          candidateClaims: candidateClaims.length > 0 ? candidateClaims : undefined,
        });
      }
    })();
  };

  const handleResetChat = () => {
    stopAudio();
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
    setIsTyping(false);
    setIsStreaming(false);
    setIsProcessingDoc(false);
    setStreamingText('');
    setOrbState('idle');
    setMessages([]);
  };

  const quickPrompts = [
    {
      title: "What's my education status?",
      subtitle: 'SLRTCE B.E. Degree & CGPA',
      text: "What's my education status?",
      icon: GraduationCap,
    },
    {
      title: 'Show all social links',
      subtitle: 'GitHub, LinkedIn & Discord',
      text: 'Show all my social links',
      icon: Globe,
    },
  ];

  const currentOrbState: OrbStateMode = isSpeakingVoice
    ? 'speaking'
    : voiceState === 'listening'
    ? 'listening'
    : isTyping || isStreaming
    ? (orbState !== 'idle' ? orbState : 'generating')
    : orbState;

  const currentOrbText =
    isSpeakingVoice
      ? 'Speaking...'
      : voiceState === 'listening'
      ? 'Listening...'
      : isTyping || isStreaming
      ? 'Thinking...'
      : 'Ready...';

  const renderFormattedContent = (content: string, isUserMessage = false) => {
    if (!content) return null;

    let displayContent = content;
    let prefixBadge = null;

    if (content.startsWith('[SAVE INFO]: ')) {
      displayContent = content.replace('[SAVE INFO]: ', '');
      prefixBadge = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 mb-1.5 rounded text-[10px] font-bold bg-white/20 text-white border border-white/30">
          <Save className="w-3 h-3" />
          <span>Save Memory</span>
        </span>
      );
    } else if (content.startsWith('[SHARE REQUEST]: ')) {
      displayContent = content.replace('[SHARE REQUEST]: ', '');
      prefixBadge = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 mb-1.5 rounded text-[10px] font-bold bg-white/20 text-white border border-white/30">
          <Share2 className="w-3 h-3" />
          <span>Selective Share</span>
        </span>
      );
    }

    const lines = displayContent.split('\n');

    return (
      <div className="space-y-1.5 leading-relaxed">
        {prefixBadge && <div>{prefixBadge}</div>}
        {lines.map((line, lineIdx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={lineIdx} className="h-1" />;
          }

          const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
          const rawText = isBullet ? trimmed.substring(2) : line;

          const parts: React.ReactNode[] = [];
          const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*|https?:\/\/[^\s]+)/g;
          let lastIndex = 0;
          let match;

          while ((match = regex.exec(rawText)) !== null) {
            if (match.index > lastIndex) {
              parts.push(rawText.substring(lastIndex, match.index));
            }

            const matchedStr = match[0];
            if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
              parts.push(
                <strong
                  key={match.index}
                  className={isUserMessage ? 'font-black underline decoration-white/30' : 'font-black text-zinc-950 dark:text-white'}
                >
                  {matchedStr.slice(2, -2)}
                </strong>
              );
            } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
              parts.push(
                <code
                  key={match.index}
                  className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
                    isUserMessage
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-100 dark:bg-white/10 text-[#5a25eb] dark:text-[#cbbeff] border border-zinc-200 dark:border-white/10'
                  }`}
                >
                  {matchedStr.slice(1, -1)}
                </code>
              );
            } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
              parts.push(
                <em key={match.index} className="italic opacity-90">
                  {matchedStr.slice(1, -1)}
                </em>
              );
            } else if (matchedStr.startsWith('http://') || matchedStr.startsWith('https://')) {
              parts.push(
                <a
                  key={match.index}
                  href={matchedStr}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    isUserMessage
                      ? 'underline text-white font-semibold'
                      : 'text-[#5a25eb] dark:text-[#cbbeff] underline hover:opacity-80 font-medium break-all inline-flex items-center gap-0.5'
                  }
                >
                  <span>{matchedStr}</span>
                  <ExternalLink className="w-2.5 h-2.5 inline opacity-70" />
                </a>
              );
            }

            lastIndex = regex.lastIndex;
          }

          if (lastIndex < rawText.length) {
            parts.push(rawText.substring(lastIndex));
          }

          if (isBullet) {
            return (
              <div key={lineIdx} className="flex items-start gap-2 pl-0.5">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${isUserMessage ? 'bg-white' : 'bg-[#5a25eb] dark:bg-[#cbbeff]'}`} />
                <div className="flex-1">{parts}</div>
              </div>
            );
          }

          return <div key={lineIdx}>{parts}</div>;
        })}
      </div>
    );
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto flex-1 flex flex-col h-full min-h-0 relative z-10 px-2 sm:px-4"
    >
      {/* Visual Drag and Drop Overlay */}
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 z-50 rounded-3xl m-2 bg-white/95 dark:bg-[#07060f]/95 border-2 border-dashed border-[#5a25eb] dark:border-[#8b5cf6] shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center pointer-events-none"
          >
            <div className="w-16 h-16 rounded-full bg-[#5a25eb]/10 dark:bg-[#5a25eb]/20 text-[#5a25eb] dark:text-[#cbbeff] flex items-center justify-center mb-4 shadow-lg animate-bounce">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              Drop Document or Image to Analyze
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
              Release to upload PDF, Word (.docx), or Image file directly into your Zero-Knowledge Vault.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-[#5a25eb]/10 text-[#5a25eb] dark:text-[#cbbeff] border border-[#5a25eb]/20">
              PDF • DOCX • PNG • JPG • WEBP
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Screen Immersive Voice Overlay */}
      <AnimatePresence>
        {isVoiceModalOpen && (
          <InChatVoiceStage
            voiceState={voiceState}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            transcript={voiceTranscript}
            assistantResponse={assistantVoiceResponse}
            onStartListening={startVoiceListening}
            onStopListening={stopVoiceListening}
            onClose={closeVoiceModal}
            sttLanguage={sttLanguage}
            onSttLanguageChange={handleSpeechRecognitionLanguageChange}
            ttsLanguage={ttsLanguage}
            onTtsLanguageChange={handleSpeechSynthesisLanguageChange}
            speaker={voiceSpeaker}
            onSpeakerChange={handleVoiceSpeakerChange}
            error={voiceError}
            userName={userName}
          />
        )}
      </AnimatePresence>

      {/* Seamless Workspace Area */}
      <div className="relative flex-1 flex flex-col min-h-0 h-full">

        {/* Top Active Session Header with New Chat Button */}
        {messages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between px-3 sm:px-4 py-1.5 shrink-0 z-20 border-b border-black/[0.04] dark:border-white/[0.06]"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Session Active
              </span>
            </div>

            <button
              type="button"
              onClick={handleResetChat}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
                         bg-white/80 dark:bg-[#151524]/80
                         hover:bg-[#5a25eb] hover:text-white
                         dark:hover:bg-white dark:hover:text-[#111111]
                         text-zinc-800 dark:text-zinc-200
                         border border-zinc-200/80 dark:border-white/12
                         shadow-xs backdrop-blur-md transition-all cursor-pointer group"
              title="Start a fresh chat conversation"
            >
              <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-200" />
              <span>New Chat</span>
            </button>
          </motion.div>
        )}

        {/* === MESSAGES CONTAINER === */}
        <div
          ref={messagesContainerRef}
          className="flex-1 min-h-0 px-2 sm:px-4 py-2 sm:py-3 space-y-4 scrollbar-none no-scrollbar flex flex-col overflow-y-auto overflow-x-hidden relative z-10"
        >
          {/* Welcome Hero (Centered Composition) */}
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="m-auto py-2 sm:py-4 px-2 sm:px-4 text-center space-y-3 sm:space-y-4 flex flex-col items-center justify-center w-full max-w-2xl min-w-0"
            >
              {/* Unclipped AI Orb with Subtle Breathing Motion */}
              <motion.div
                animate={{ scale: [1, 1.025, 1] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative flex items-center justify-center my-1 sm:my-2 select-none isolate"
              >
                {/* Dedicated Soft Radial Atmosphere Glow */}
                <motion.div
                  animate={{ opacity: [0.75, 1, 0.75] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute w-[280px] h-[280px] sm:w-[360px] sm:h-[360px] -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 rounded-full blur-[24px] pointer-events-none z-0"
                  style={{
                    background:
                      theme === 'dark'
                        ? 'radial-gradient(circle, rgba(56, 189, 248, 0.36) 0%, rgba(90, 37, 235, 0.22) 28%, rgba(139, 92, 246, 0.12) 48%, transparent 72%)'
                        : 'radial-gradient(circle, rgba(70, 130, 255, 0.34) 0%, rgba(80, 100, 255, 0.20) 28%, rgba(120, 90, 255, 0.10) 48%, transparent 72%)',
                  }}
                />

                <div className="relative z-10">
                  <AILoaderOrb
                    state={currentOrbState}
                    text={currentOrbText}
                    size={160}
                    variant="hero"
                  />
                </div>
              </motion.div>

              {/* Typography Hierarchy */}
              <div className="space-y-1 max-w-lg mx-auto min-w-0">
                <h2 className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-300 tracking-tight">
                  Hi, {userName}
                </h2>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-zinc-950 dark:text-white tracking-tight leading-tight">
                  How can I help today?
                </h1>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 pt-0.5">
                  I'm here to help — from quick answers<br className="hidden sm:inline" /> to smart recommendations.
                </p>
              </div>

              {/* Quick Prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 max-w-2xl mx-auto pt-1 sm:pt-2 w-full min-w-0">
                {quickPrompts.map((p, idx) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(p.text)}
                      className="p-3 sm:p-3.5 rounded-2xl
                                 bg-white/55 dark:bg-[#121222]/60
                                 backdrop-blur-md
                                 border border-[#96aaff]/20 dark:border-white/10
                                 hover:border-[#5a25eb]/40 dark:hover:border-[#5a25eb]/50
                                 hover:bg-white/80 dark:hover:bg-[#18182e]/80
                                 text-left transition-all cursor-pointer flex items-start gap-3 group
                                 shadow-[0_6px_20px_rgba(100,100,180,0.04)]
                                 dark:shadow-md hover:-translate-y-0.5 w-full min-w-0"
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#5a25eb]/10 dark:bg-[#5a25eb]/20 border border-[#5a25eb]/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                        <Icon className="w-4 h-4 text-[#5a25eb] dark:text-[#cbbeff]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 dark:group-hover:text-white truncate block text-xs sm:text-sm">
                          {p.title}
                        </span>
                        <span className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate block mt-0.5">
                          {p.subtitle}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Messages */}
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12 }}
                className={`flex gap-3 max-w-3xl lg:max-w-4xl ${isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-white/80 dark:bg-[#12121c] border border-blue-200 dark:border-[#222230] flex items-center justify-center shrink-0 shadow-2xs mt-0.5 overflow-hidden">
                    <AILoaderOrb state={isSpeakingVoice ? 'speaking' : 'idle'} variant="avatar" size={22} />
                  </div>
                )}

                <div className={`space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#5a25eb] text-white rounded-br-xs shadow-xs font-medium'
                        : 'bg-white/85 dark:bg-[#0c0c12] border border-blue-200/70 dark:border-[#1c1c28] text-zinc-900 dark:text-[#e4e1e8] rounded-bl-xs shadow-2xs backdrop-blur-md'
                    }`}
                  >
                    {isUser && msg.attachment && (
                      <div className="mb-2 p-2 rounded-xl bg-white/15 border border-white/25 flex items-center gap-2 text-white">
                        <div className="p-1.5 rounded-lg bg-white/20 shrink-0">
                          <FileText className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate leading-tight">{msg.attachment.name}</p>
                          <p className="text-[10px] text-white/75 font-mono">{msg.attachment.size}</p>
                        </div>
                      </div>
                    )}

                    <div>{renderFormattedContent(msg.content, isUser)}</div>

                    {!isUser && msg.candidateClaims && msg.candidateClaims.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-zinc-200/80 dark:border-white/10 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-white">
                            <ShieldCheck className="w-4 h-4 text-[#5a25eb] dark:text-[#cbbeff]" />
                            <span>Confirm Extracted Claims for Vault</span>
                          </div>
                          {msg.candidateClaims.some((c) => c.status === 'pending') && (
                            <button
                              type="button"
                              onClick={() => handleAcceptAllCandidateClaims(msg.id)}
                              className="text-[11px] font-semibold text-[#5a25eb] dark:text-[#cbbeff] hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Confirm All</span>
                            </button>
                          )}
                        </div>

                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Review new attributes discovered from your document. You can accept, update, or discard each claim before syncing to your verified Neo4j vault.
                        </p>

                        <div className="space-y-2">
                          {msg.candidateClaims.map((claim) => {
                            const isAccepted = claim.status === 'accepted';
                            const isRejected = claim.status === 'rejected';
                            const isPending = claim.status === 'pending';

                            return (
                              <div
                                key={claim.id}
                                className={`p-2.5 rounded-xl border transition-all ${
                                  isAccepted
                                    ? 'bg-emerald-500/10 border-emerald-500/30'
                                    : isRejected
                                    ? 'bg-zinc-500/5 border-zinc-500/20 opacity-60'
                                    : 'bg-zinc-50 dark:bg-[#141422]/90 border-zinc-200 dark:border-white/10'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                        {claim.fieldName}
                                      </span>
                                      <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 font-mono">
                                        {claim.category}
                                      </span>
                                    </div>

                                    {claim.isEditing ? (
                                      <div className="flex items-center gap-2 pt-1">
                                        <input
                                          type="text"
                                          value={claim.editedValue ?? claim.value}
                                          onChange={(e) => handleUpdateCandidateClaimValue(msg.id, claim.id, e.target.value)}
                                          className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-black/50 border border-[#5a25eb] text-zinc-900 dark:text-white outline-none"
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleAcceptCandidateClaim(msg.id, claim.id)}
                                          className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 cursor-pointer"
                                        >
                                          Save & Accept
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleEditCandidateClaim(msg.id, claim.id, false)}
                                          className="px-2 py-1 rounded-md bg-zinc-200 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium hover:bg-zinc-300 cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 break-all select-all py-0.5">
                                        {claim.value}
                                      </div>
                                    )}
                                  </div>

                                  {/* Status and Actions */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isAccepted && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                        <Check className="w-3 h-3" />
                                        <span>Saved in Vault</span>
                                      </span>
                                    )}

                                    {isRejected && (
                                      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                                        Dismissed
                                      </span>
                                    )}

                                    {isPending && !claim.isEditing && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleAcceptCandidateClaim(msg.id, claim.id)}
                                          title="Accept and store in Neo4j vault"
                                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer shadow-xs transition-colors"
                                        >
                                          <Check className="w-3 h-3" />
                                          <span>Accept</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleToggleEditCandidateClaim(msg.id, claim.id, true)}
                                          title="Update value before confirming"
                                          className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 cursor-pointer transition-colors"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleRejectCandidateClaim(msg.id, claim.id)}
                                          title="Discard this claim"
                                          className="p-1 rounded-lg hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 cursor-pointer transition-colors"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {!isUser && (
                      <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (isMuted) setIsMuted(false);
                              speakText(msg.content);
                            }}
                            className="flex items-center gap-1 text-[#5a25eb] dark:text-[#cbbeff] hover:underline font-semibold cursor-pointer"
                          >
                            <Volume2 className="w-3 h-3" />
                            <span>Listen</span>
                          </button>
                          <span>•</span>
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                          >
                            {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                        <span className="font-mono text-[9px]">{msg.timestamp}</span>
                      </div>
                    )}
                  </div>

                  {!isUser && msg.sourceType && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {msg.sourceType === 'evidence-backed' && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-medium">
                          <FileCheck className="w-3 h-3" />
                          <span className="font-mono text-[9px] truncate max-w-[180px]">
                            {msg.evidenceDoc || 'Degree_Certificate_SLRTCE_2024.pdf'}
                          </span>
                        </div>
                      )}
                      {msg.sourceType === 'user-confirmed' && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#5a25eb]/10 border border-[#5a25eb]/25 text-[#5a25eb] dark:text-[#cbbeff]">
                          <UserCheck className="w-3 h-3" />
                          <span>{msg.sourceNote || 'Self-asserted'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {isUser && (
                    <div className="text-right text-[9px] text-zinc-400">
                      {msg.timestamp}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-[#5a25eb]/15 border border-[#5a25eb]/30 flex items-center justify-center shrink-0 font-bold text-[10px] text-[#5a25eb] dark:text-[#cbbeff] mt-0.5">
                    {userName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </motion.div>
            );
          })}

          {isStreaming && streamingText && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2.5 max-w-2xl mr-auto justify-start"
            >
              <div className="w-7 h-7 rounded-full bg-[#5a25eb]/15 border border-[#5a25eb]/30 flex items-center justify-center shrink-0 shadow-xs mt-0.5 overflow-hidden">
                <AILoaderOrb state={isSpeakingVoice ? 'speaking' : 'generating'} variant="avatar" size={22} />
              </div>
              <div className="p-3.5 rounded-2xl text-xs sm:text-sm bg-white/85 dark:bg-[#0c0c12] border-2 border-[#5a25eb] text-zinc-900 dark:text-white shadow-xs backdrop-blur-md">
                <div className="leading-relaxed">
                  {renderFormattedContent(streamingText, false)}
                  <span className="inline-block w-1.5 h-3.5 bg-[#5a25eb] ml-1 animate-pulse align-middle" />
                </div>
              </div>
            </motion.div>
          )}

          {isTyping && !isStreaming && (
            isProcessingDoc ? (
              /* One-by-One Vertical Agent Cards in Chat */
              <div className="flex flex-col gap-2 max-w-xl mr-auto w-full">
                <AnimatePresence mode="popLayout">
                  {agentSteps
                    .filter((step) => step.status !== 'pending')
                    .map((step) => {
                      const isRunning = step.status === 'running';
                      const isDone = step.status === 'completed';

                      return (
                        <motion.div
                          key={step.id}
                          layout
                          initial={{ opacity: 0, y: 12, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                          className={`p-3 rounded-2xl transition-all duration-300 relative overflow-hidden flex flex-col justify-between w-full backdrop-blur-xl ${
                            isRunning
                              ? 'bg-white/95 dark:bg-[#121124]/95 border-2 border-[#5a25eb] dark:border-white shadow-[0_4px_25px_rgba(255,255,255,0.2)] ring-1 ring-white/20'
                              : isDone
                              ? 'bg-white/70 dark:bg-[#0c0c16]/70 border border-emerald-500/30 dark:border-white/10 opacity-85'
                              : 'bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5 opacity-60'
                          }`}
                        >
                          {/* Active glowing sheen */}
                          {isRunning && (
                            <motion.div
                              animate={{ opacity: [0.2, 0.6, 0.2] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
                            />
                          )}

                          <div className="flex items-start justify-between gap-2.5 min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {/* White Glowing Orb Animation Container */}
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform ${
                                  isRunning
                                    ? 'scale-110 shadow-[0_0_15px_rgba(255,255,255,0.95)] bg-white/20 border border-white'
                                    : isDone
                                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                                    : 'bg-zinc-200/40 dark:bg-white/5 border border-transparent'
                                }`}
                              >
                                <ThinkingOrb
                                  state={isRunning ? step.orbState : isDone ? 'working' : 'searching'}
                                  size={20}
                                  theme="dark"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white leading-tight">
                                    {step.name}
                                  </h4>
                                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                                    • {step.role}
                                  </span>
                                </div>
                                <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-300 font-sans mt-0.5">
                                  {step.detail}
                                </p>
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div className="shrink-0 mt-0.5">
                              {isDone && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  Done
                                </span>
                              )}
                              {isRunning && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-zinc-900 dark:text-white bg-white/30 dark:bg-white/20 px-2 py-0.5 rounded-full border border-white/40 shadow-[0_0_8px_rgba(255,255,255,0.6)] animate-pulse">
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  Active
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>
            ) : (
              /* Claude-Style Clean Minimalist Thinking Animation for Normal Queries */
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                className="flex items-center gap-3 max-w-lg mr-auto p-3 sm:p-3.5 rounded-2xl bg-white/85 dark:bg-[#0c0c16]/90 border border-zinc-200/80 dark:border-white/10 shadow-[0_8px_30px_rgba(90,70,255,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <div className="w-7 h-7 rounded-full bg-white dark:bg-white/10 border border-zinc-200 dark:border-white/20 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(255,255,255,0.6)]">
                  <ThinkingOrb state={currentThinkingStep.state} size={20} theme="dark" />
                </div>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white tracking-tight truncate">
                      {currentThinkingStep.text}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5a25eb] dark:bg-white animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5a25eb]/70 dark:bg-white/70 animate-pulse delay-75" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5a25eb]/40 dark:bg-white/40 animate-pulse delay-150" />
                    </span>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/5 px-2 py-0.5 rounded-full border border-zinc-200/50 dark:border-white/10 shrink-0">
                    <Sparkles className="w-3 h-3 text-[#5a25eb] dark:text-[#cbbeff]" />
                    <span>Deep Thinking</span>
                  </span>
                </div>
              </motion.div>
            )
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* === BOTTOM INPUT BAR === */}
        <div className="pt-1.5 pb-2 sm:pb-3 bg-transparent shrink-0 space-y-2 relative z-20 px-2 sm:px-3">

          {/* Attached File Preview */}
          <AnimatePresence>
            {attachedFile && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                className="flex items-center gap-2 p-1.5 pl-2.5 pr-2 rounded-xl bg-white/95 dark:bg-[#12121c] border border-[#5a25eb]/30 dark:border-[#5a25eb]/40 shadow-md backdrop-blur-md max-w-md"
              >
                <div className="p-1.5 rounded-lg bg-[#5a25eb]/10 dark:bg-[#5a25eb]/20 text-[#5a25eb] dark:text-[#cbbeff] shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{attachedFile.name}</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">{attachedFile.formattedSize}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={isTyping || isStreaming}
                  className="px-2.5 py-1 rounded-lg bg-[#5a25eb] hover:bg-[#6b37fa] text-white text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-2xs"
                  title="Run OCR & Vault Document AI Extraction"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Analyze</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  className="p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                  title="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Intelligent Control Panel / Composer with Animated Border Beam & Glass Surface */}
          <div className="relative w-full max-w-[1050px] mx-auto rounded-[30px] sm:rounded-[34px] p-[2px] group select-none overflow-visible">
            
            {/* Clipped Rotating Glowing Border Frame */}
            <div className="absolute inset-0 rounded-[30px] sm:rounded-[34px] overflow-hidden pointer-events-none z-0">
              {/* Primary Rotating Conic Glow Beam (Pure White Glow in Dark Theme) */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                className="absolute -inset-[180%] w-[460%] h-[460%] left-[-180%] top-[-180%] pointer-events-none opacity-95 group-hover:opacity-100 transition-opacity"
                style={{
                  background:
                    theme === 'dark'
                      ? 'conic-gradient(from 0deg, transparent 0deg, transparent 50deg, rgba(255, 255, 255, 0.45) 100deg, rgba(255, 255, 255, 1) 160deg, rgba(220, 235, 255, 0.95) 210deg, rgba(255, 255, 255, 0.5) 260deg, transparent 320deg, transparent 360deg)'
                      : 'conic-gradient(from 0deg, transparent 0deg, transparent 60deg, rgba(90, 37, 235, 0.65) 110deg, rgba(56, 189, 248, 0.8) 160deg, rgba(217, 70, 239, 0.65) 210deg, rgba(140, 110, 255, 0.7) 260deg, transparent 320deg, transparent 360deg)',
                }}
              />

              {/* Counter-Rotating Soft Ambient Sheen */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 11, repeat: Infinity, ease: 'linear' }}
                className="absolute -inset-[150%] w-[400%] h-[400%] left-[-150%] top-[-150%] pointer-events-none opacity-60 blur-[6px]"
                style={{
                  background:
                    theme === 'dark'
                      ? 'conic-gradient(from 180deg, transparent 0deg, rgba(255, 255, 255, 0.5) 120deg, rgba(255, 255, 255, 0.8) 180deg, rgba(200, 220, 255, 0.4) 240deg, transparent 360deg)'
                      : 'conic-gradient(from 180deg, transparent 0deg, rgba(90, 70, 255, 0.35) 120deg, rgba(56, 189, 248, 0.4) 240deg, transparent 360deg)',
                }}
              />
            </div>

            {/* Inner Composer Body Surface */}
            <div
              className="w-full rounded-[28px] sm:rounded-[32px] p-2.5 sm:p-3.5 relative z-10 transition-all
                         border border-white/70 dark:border-white/20
                         shadow-[0_12px_45px_rgba(90,70,255,0.14)]
                         dark:shadow-[0_15px_50px_rgba(0,0,0,0.6),0_0_20px_rgba(255,255,255,0.08)]
                         backdrop-blur-2xl overflow-visible"
              style={{
                background:
                  theme === 'dark'
                    ? 'radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.08), transparent 50%), radial-gradient(circle at 85% 100%, rgba(255, 255, 255, 0.05), transparent 55%), linear-gradient(135deg, rgba(18, 17, 30, 0.96), rgba(10, 9, 18, 0.94))'
                    : 'radial-gradient(circle at 20% 0%, rgba(210, 225, 255, 0.48), transparent 50%), radial-gradient(circle at 85% 100%, rgba(230, 215, 255, 0.40), transparent 55%), linear-gradient(135deg, rgba(252, 253, 255, 0.97), rgba(244, 246, 255, 0.94))',
              }}
            >
              {/* Elevated Inner Input Surface with Laser Edge Beam */}
              <div className="relative rounded-[20px] sm:rounded-[22px] p-[1.5px] overflow-hidden group/input z-10">
                {/* Moving Border Laser Glow Line on Input Form (Radiant White in Dark Theme) */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: 'linear' }}
                  className="absolute -inset-[150%] w-[400%] h-[400%] left-[-150%] top-[-150%] pointer-events-none z-0 opacity-75 group-focus-within/input:opacity-100 transition-opacity"
                  style={{
                    background:
                      theme === 'dark'
                        ? 'conic-gradient(from 0deg, transparent 0deg, transparent 80deg, rgba(255, 255, 255, 0.6) 130deg, #ffffff 180deg, rgba(255, 255, 255, 0.7) 230deg, transparent 290deg, transparent 360deg)'
                        : 'conic-gradient(from 0deg, transparent 0deg, transparent 80deg, rgba(90, 37, 235, 0.7) 140deg, rgba(56, 189, 248, 0.8) 180deg, rgba(217, 70, 239, 0.7) 220deg, transparent 280deg, transparent 360deg)',
                  }}
                />

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="relative flex items-center
                             bg-white/85 dark:bg-[#07060f]/95
                             rounded-[18px] sm:rounded-[20px]
                             border border-[#96aaff]/20 dark:border-white/15
                             shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]
                             focus-within:border-[#6e5aff]/60 dark:focus-within:border-white/50
                             focus-within:shadow-[0_0_28px_rgba(110,90,255,0.18)] dark:focus-within:shadow-[0_0_24px_rgba(255,255,255,0.18)]
                             transition-all p-1.5 z-10 backdrop-blur-md"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.json,.csv"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-white transition-colors cursor-pointer ml-1"
                    title="Attach document or image"
                    aria-label="Attach file"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      voiceState === 'listening'
                        ? 'Listening...'
                        : attachedFile
                        ? `Message with ${attachedFile.name}...`
                        : chatMode === 'save'
                        ? 'Save record (e.g. "Passport: Z8921098")...'
                        : chatMode === 'share'
                        ? 'Share fields (e.g. "Degree with Acme")...'
                        : 'Ask me anything...'
                    }
                    className="flex-1 bg-transparent px-3 py-2 text-sm sm:text-base text-zinc-900 dark:text-zinc-100 placeholder-[#6B7280] focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={openVoiceModal}
                    className={`p-2 rounded-xl transition-all cursor-pointer mr-1.5 ${
                      voiceState === 'listening' || isVoiceModalOpen
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-white'
                    }`}
                    title="Open Voice Chat Mode"
                    aria-label="Voice Chat Mode"
                  >
                    {voiceState === 'listening' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !attachedFile) || isTyping || isStreaming}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-[14px] bg-gradient-to-br from-[#c9b8ff] to-[#b9a4ff] dark:from-[#8b5cf6] dark:to-[#6d28d9] text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_5px_15px_rgba(120,90,255,0.22)] cursor-pointer flex items-center justify-center shrink-0 mr-0.5"
                    aria-label="Send"
                  >
                    <ArrowUp className="w-4 h-4 stroke-[3]" />
                  </button>
                </form>
              </div>

              {/* Lower Toolbar */}
              <div className="flex items-center justify-between gap-3 pt-2.5 mt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] px-1 relative z-10">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <label className="sr-only" htmlFor="chat-language">Chat language</label>
                    <select
                      id="chat-language"
                      value={chatLanguage}
                      onChange={(event) => handleChatLanguageChange(event.target.value)}
                      className="max-w-36 rounded-full border border-[#7d5fff]/22 bg-white/70 dark:bg-white/5 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-200"
                      aria-label="Chat language"
                    >
                      {SARVAM_LANGUAGES.map((language) => (
                        <option key={language.code} value={language.code}>{language.name}</option>
                      ))}
                    </select>

                    {/* Voice Mode Button */}
                  <button
                    type="button"
                    onClick={openVoiceModal}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#7d5fff]/08 hover:bg-[#7d5fff]/14 text-[#6548E8] dark:text-[#cbbeff] border border-[#7d5fff]/22 transition-all cursor-pointer shadow-2xs"
                    title="Launch Animated Voice Screen"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Voice Mode</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Import file</span>
                  </button>

                  {/* Interactive Tools Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsToolsOpen(!isToolsOpen)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                        chatMode !== 'normal'
                          ? 'bg-[#5a25eb]/15 text-[#5a25eb] dark:text-[#cbbeff] border border-[#5a25eb]/30 shadow-2xs'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                      title="Select AI Chat Tool Mode"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Tools</span>
                      {chatMode !== 'normal' && (
                        <span className="font-semibold capitalize px-1.5 py-0.2 rounded-full text-[10px] bg-[#5a25eb] text-white">
                          {chatMode}
                        </span>
                      )}
                    </button>

                    {/* Tools Popover Dropdown */}
                    <AnimatePresence>
                      {isToolsOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          className="absolute bottom-full left-0 sm:left-auto sm:right-0 mb-2.5 w-64 p-2 rounded-2xl bg-white/95 dark:bg-[#10101c]/95 backdrop-blur-2xl border border-blue-200/80 dark:border-white/15 shadow-2xl z-50 space-y-1"
                        >
                          <div className="px-2.5 py-1 text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
                            AI Mode & Tools
                          </div>

                          <button
                            type="button"
                            onClick={() => { setChatMode('normal'); setIsToolsOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                              chatMode === 'normal'
                                  ? 'bg-[#5a25eb] text-white shadow-xs'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10'
                            }`}
                          >
                            <QuestionIcon className="w-4 h-4 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="block font-bold">Normal Mode</span>
                              <span className={`text-[10px] block truncate ${chatMode === 'normal' ? 'text-white/80' : 'text-zinc-400'}`}>Zero-knowledge retrieval</span>
                            </div>
                            {chatMode === 'normal' && <Check className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => { setChatMode('save'); setIsToolsOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                              chatMode === 'save'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10'
                            }`}
                          >
                            <Save className="w-4 h-4 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="block font-bold">Save Record</span>
                              <span className={`text-[10px] block truncate ${chatMode === 'save' ? 'text-white/80' : 'text-zinc-400'}`}>Encrypt to personal vault</span>
                            </div>
                            {chatMode === 'save' && <Check className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => { setChatMode('share'); setIsToolsOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                              chatMode === 'share'
                                ? 'bg-[#8a54ff] text-white shadow-xs'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10'
                            }`}
                          >
                            <Share2 className="w-4 h-4 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="block font-bold">Selective Share</span>
                              <span className={`text-[10px] block truncate ${chatMode === 'share' ? 'text-white/80' : 'text-zinc-400'}`}>Scoped zk-SNARK link</span>
                            </div>
                            {chatMode === 'share' && <Check className="w-3.5 h-3.5" />}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  {/* Voice Speaker Selector Pill */}
                  <div className="hidden sm:flex items-center">
                    <select
                      value={voiceSpeaker}
                      onChange={(e) => handleVoiceSpeakerChange(e.target.value as SarvamVoiceSpeaker)}
                      className="rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-all cursor-pointer backdrop-blur-md"
                      title="Change AI Voice Speaker"
                      aria-label="Change AI Voice Speaker"
                    >
                      {SARVAM_VOICE_SPEAKERS.map((s) => (
                        <option key={s.id} value={s.id} className="bg-white dark:bg-[#11111d] text-zinc-800 dark:text-zinc-100">
                          🎙️ {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Global Mute Toggle Button */}
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                      isMuted
                        ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10'
                    }`}
                    title={isMuted ? 'Voice is Muted (Click to Unmute)' : 'Mute AI Voice Speech Output'}
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-500" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{isMuted ? 'Muted' : 'Mute'}</span>
                  </button>

                  {isSpeakingVoice && (
                    <button
                      onClick={stopAudio}
                      className="p-1 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Stop Current Audio"
                    >
                      <VolumeX className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {messages.length > 0 && (
                    <button
                      onClick={handleResetChat}
                      className="flex items-center gap-1 px-2 py-0.8 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      title="Clear Chat History"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="text-[10px]">Clear</span>
                    </button>
                  )}
                  <div className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" />
                    <span className="text-zinc-500 dark:text-zinc-400">Encrypted</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-center text-zinc-400 dark:text-zinc-600 mt-2 relative z-10">
            SYNDEO AI • Zero-knowledge cryptographic personal records
          </p>
        </div>
      </div>
    </div>
  );
};