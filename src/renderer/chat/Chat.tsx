import { useCallback, useEffect, useRef, useState } from 'react';
import './Chat.css';
import ImageViewer from '../image-viewer/ImageViewer';
import MessageBubble from './MessageBubble';
import EmptyState from './EmptyState';
import Composer from './Composer';
import { AttachedFile, formatFileSize, formatTime, getFileIcon } from './utils';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  imageUrl?: string;
  attachments?: AttachedFile[];
  streaming?: boolean;
}

interface ChatProps {
  onClose: () => void;
  onOpenSettings: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

/* ---------- Dictado por voz (tipos mínimos, no disponibles en lib.dom) ---------- */
type AnyRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export default function Chat({ onClose, onOpenSettings, expanded, onToggleExpand }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showImageViewer, setShowImageViewer] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lastAudioPath, setLastAudioPath] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recSupported, setRecSupported] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<AnyRecognition | null>(null);
  const isRecordingRef = useRef(false);

  /* ---------- Dictado por voz (sin closures vencidas) ---------- */
  useEffect(() => {
    const SRC = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
    if (!SRC) return;

    const recog: AnyRecognition = new SRC();
    recog.lang = 'es-AR';
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
      }
      if (finalTranscript) {
        setInput(prev => (prev ? prev + ' ' : '') + finalTranscript.trim());
      }
    };

    recog.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        isRecordingRef.current = false;
        setIsRecording(false);
      }
    };

    // Reinicia automáticamente mientras el usuario siga en modo dictado
    recog.onend = () => {
      if (isRecordingRef.current) {
        try { recog.start(); } catch { isRecordingRef.current = false; setIsRecording(false); }
      }
    };

    recognitionRef.current = recog;
    setRecSupported(true);

    return () => {
      isRecordingRef.current = false;
      recog.onend = null;
      try { recog.stop(); } catch {}
    };
  }, []);

  /* ---------- Mensajes entrantes, streaming y estado de conexión ---------- */
  useEffect(() => {
    const unsubMsg = window.electronAPI.onMessage((msg: any) => {
      setIsTyping(false);
      const payload = msg?.payload ?? {};
      if (payload.text) {
        setMessages((prev) => {
          const copy = [...prev];
          // Finalizar el mensaje en streaming corriendo (si lo hay)
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant' && last.streaming) {
            copy[copy.length - 1] = { ...last, text: payload.text, ts: Date.now(), streaming: false };
            return copy;
          }
          copy.push({ role: 'assistant', text: payload.text, ts: Date.now() });
          return copy;
        });
      }
      if (payload.imageUrl) {
        setMessages((prev) => [...prev, { role: 'assistant', text: '', ts: Date.now(), imageUrl: payload.imageUrl }]);
      }
      if (payload.tts) {
        setIsSpeaking(true);
        window.electronAPI.tts.speak(payload.tts).catch(() => setIsSpeaking(false));
      }
    });

    const unsubDelta = window.electronAPI.onDelta(({ text }: { text: string }) => {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant' && last.streaming) {
          copy[copy.length - 1] = { ...last, text: last.text + text };
        } else {
          copy.push({ role: 'assistant', text, ts: Date.now(), streaming: true });
        }
        return copy;
      });
    });

    const unsubStatus = window.electronAPI.onStatus((status) => {
      setConnected(status.connected);
      setConnError(status.error ?? null);
    });

    const unsubErr = window.electronAPI.onError((err) => {
      if (err.includes('[fatal]')) {
        setConnected(false);
        setMessages((prev) => [...prev, {
          role: 'assistant',
          text: `CONEXION PERDIDA\n${err.replace('[fatal] ', '')}\n\nVerifique URL y conexion.`,
          ts: Date.now(),
        }]);
      } else {
        console.warn('[openclaw]', err);
      }
    });

    const unsubTts = window.electronAPI.tts.onTtsPlay((ttsUrl: string) => {
      if (audioRef.current) {
        setIsSpeaking(true);
        setLastAudioPath(ttsUrl);
        audioRef.current.src = ttsUrl;
        audioRef.current.play().catch(() => setIsSpeaking(false));
        audioRef.current.onended = () => setIsSpeaking(false);
      }
    });

    window.electronAPI.isConnected().then(setConnected);

    return () => { unsubMsg(); unsubDelta(); unsubStatus(); unsubErr(); unsubTts(); };
  }, []);

  /* ---------- Historial persistente: restaurar conversación ---------- */
  useEffect(() => {
    window.electronAPI.chat.getHistory().then((rows) => {
      if (rows.length > 0) {
        setMessages(rows.map(r => ({ role: r.role as Message['role'], text: r.content, ts: r.timestamp })));
      }
    }).catch(err => console.error('[chat] Error cargando historial:', err));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ---------- Escape cierra, enfocar el composer al abrir ---------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showImageViewer) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    composerInputRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, showImageViewer]);

  /* ---------- Dictado ---------- */
  const toggleRecording = useCallback(() => {
    const recog = recognitionRef.current;
    if (!recog) return;
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      try { recog.stop(); } catch {}
    } else {
      isRecordingRef.current = true;
      setIsRecording(true);
      try { recog.start(); } catch (e) { isRecordingRef.current = false; setIsRecording(false); console.error(e); }
    }
  }, []);

  /* ---------- Adjuntos ---------- */
  const handleFileSelect = async () => { fileInputRef.current?.click(); };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const electronFiles = await window.electronAPI.selectFiles();
    if (electronFiles.length > 0) {
      setAttachments(prev => [...prev, ...electronFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  /* ---------- Enviar ---------- */
  const send = async () => {
    if (!connected || sending) {
      if (!connected) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          text: 'SISTEMA OFFLINE\nNo hay conexion al Gateway.\nConfigure su token en Configuracion.',
          ts: Date.now(),
        }]);
      }
      return;
    }
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const userMsg: Message = {
      role: 'user',
      text,
      ts: Date.now(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (composerInputRef.current) composerInputRef.current.style.height = 'auto';
    setAttachments([]);
    setSending(true);
    setIsTyping(true);

    try {
      await window.electronAPI.send('userMessage', {
        text: userMsg.text,
        attachments: userMsg.attachments,
      });
    } catch (err: any) {
      setIsTyping(false);
      setMessages((prev) => [...prev, {
        role: 'assistant', text: `ERROR: ${err?.message ?? err}`, ts: Date.now(),
      }]);
    } finally {
      setSending(false);
    }
  };

  /* ---------- Utilidades de chat ---------- */
  const clearConversation = async () => {
    try {
      await window.electronAPI.chat.clear();
      setMessages([]);
    } catch (err) {
      console.error('[chat] Error limpiando historial:', err);
    }
  };

  const copyMessage = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(index);
      setTimeout(() => setCopiedMsg(null), 1500);
    } catch (err) {
      console.error('[chat] Error copiando:', err);
    }
  };

  const replayLastAudio = () => {
    if (audioRef.current && lastAudioPath) {
      setIsSpeaking(true);
      audioRef.current.src = lastAudioPath;
      audioRef.current.play().catch(() => setIsSpeaking(false));
      audioRef.current.onended = () => setIsSpeaking(false);
    }
  };

  return (
    <div className={`app ${expanded ? 'expanded' : ''}`}>
      {/* HUD corner brackets */}
      <div className="hud-corners">
        <div className="hud-corner tl" />
        <div className="hud-corner tr" />
        <div className="hud-corner bl" />
        <div className="hud-corner br" />
      </div>

      {/* Header */}
      <header className="jarvis-header">
        <h1 className="jarvis-title">
          IA&#8209;companion&#8209;GS
          <span className="subtitle">v0.2</span>
        </h1>
        <div className="status-cluster">
          {isSpeaking && (
            <div className="speaking-indicator">
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
            </div>
          )}
          <span className="status-label">{connected ? 'ONLINE' : 'OFFLINE'}</span>
          <span className={`status-dot ${connected ? '' : 'offline'}`} />
          {isTyping && (
            <div className="typing-indicator">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          )}
          {lastAudioPath && (
            <button
              className="header-btn"
              onClick={replayLastAudio}
              title="Reproducir ultima respuesta"
              aria-label="Reproducir última respuesta"
              disabled={isSpeaking}
              style={{ opacity: isSpeaking ? 0.5 : 1 }}
            >
              &#9655;
            </button>
          )}
          <button
            className="header-btn"
            onClick={clearConversation}
            title="Limpiar conversacion"
            aria-label="Limpiar conversación"
            disabled={sending}
          >
            &#128465;
          </button>
          <button
            className="header-btn"
            onClick={onToggleExpand}
            title={expanded ? 'Minimizar (ventana chica)' : 'Agrandar (ventana grande)'}
            aria-label={expanded ? 'Minimizar ventana' : 'Agrandar ventana'}
          >
            {expanded ? '\u2916' : '\u2914'}
          </button>
          <button className="header-btn" onClick={onOpenSettings} title="Configuracion" aria-label="Configuración">
            &#9881;
          </button>
          <button className="header-btn" onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar">
            &#215;
          </button>
        </div>
      </header>

      {/* Pending attachments */}
      {attachments.length > 0 && (
        <div className="attachments-bar">
          {attachments.map((file, index) => (
            <div key={index} className="attachment-chip">
              <span>{getFileIcon(file.type)}</span>
              <span className="attachment-name">{file.name}</span>
              <span style={{ opacity: 0.5 }}>{formatFileSize(file.size)}</span>
              <button className="remove" onClick={() => removeAttachment(index)} title="Quitar" aria-label="Quitar adjunto">
                &#215;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="messages">
        {messages.length === 0 && (
          <EmptyState connected={connected} connError={connError} />
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={`${msg.ts}-${i}`}
            msg={msg}
            index={i}
            copiedMsg={copiedMsg}
            onCopyMessage={copyMessage}
            onViewImage={(url: string) => setShowImageViewer(url)}
            formatTime={formatTime}
            getFileIcon={getFileIcon}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <Composer
        composerInputRef={composerInputRef}
        fileInputRef={fileInputRef}
        audioRef={audioRef}
        input={input}
        onInputChange={(value: string) => setInput(value)}
        attachments={attachments}
        onRemoveAttachment={removeAttachment}
        onAddFiles={handleFilesSelected}
        formatFileSize={formatFileSize}
        getFileIcon={getFileIcon}
        connected={connected}
        sending={sending}
        isRecording={isRecording}
        recSupported={recSupported}
        onToggleRecording={toggleRecording}
        onSend={send}
        isSpeaking={isSpeaking}
        lastAudioPath={lastAudioPath}
        onReplayAudio={replayLastAudio}
      />

      <audio ref={audioRef} style={{ display: 'none' }} />

      {showImageViewer && (
        <ImageViewer src={showImageViewer} onClose={() => setShowImageViewer(null)} />
      )}
    </div>
  );
}
