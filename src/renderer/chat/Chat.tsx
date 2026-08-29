import { useEffect, useRef, useState, useCallback } from 'react';
import './Chat.css';
import ImageViewer from '../image-viewer/ImageViewer';

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  path?: string;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
  attachments?: AttachedFile[];
}

interface ChatProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

export default function Chat({ onClose, onOpenSettings }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showImageViewer, setShowImageViewer] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastAudioPath, setLastAudioPath] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inicializar Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recog = new SpeechRecognition();
      recog.lang = 'es-AR';
      recog.continuous = true;
      recog.interimResults = true;
      recog.maxAlternatives = 1;

      recog.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setInput(prev => prev + ' ' + finalTranscript);
        }
      };

      recog.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          setIsRecording(false);
        }
      };

      recog.onend = () => {
        if (isRecording) {
          // Reiniciar si se detuvo inesperadamente
          try {
            recog.start();
          } catch (e) {
            setIsRecording(false);
          }
        }
      };

      setRecognition(recog);
    }

    return () => {
      if (recognition) {
        recognition.onend = null;
        try { recognition.stop(); } catch {}
      }
    };
  }, []);

  useEffect(() => {
    const unsubMsg = window.electronAPI.onMessage((msg: any) => {
      setIsTyping(false);
      const payload = msg.payload;
      if (payload?.text) {
        setMessages((prev) => [...prev, { role: 'assistant', text: payload.text }]);
      }
      if (payload?.imageUrl) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: '', imageUrl: payload.imageUrl },
        ]);
      }
      if (payload?.tts) {
        setIsSpeaking(true);
        window.electronAPI.tts.speak(payload.tts).catch(() => {
          setIsSpeaking(false);
        });
        setTimeout(() => setIsSpeaking(false), 5000);
      }
    });

    const unsubStatus = window.electronAPI.onStatus((status) => {
      setConnected(status.connected);
    });

    const unsubErr = window.electronAPI.onError((err) => {
      if (err.includes('[fatal]')) {
        setConnected(false);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `🔌 No se puede conectar al Gateway.\n${err.replace('[fatal] ', '')}\n\nVerificá la URL y tu conexión.`,
          },
        ]);
      } else {
        console.warn('[openclaw]', err);
      }
    });

    // Listener para reproducir audio TTS
    const unsubTts = window.electronAPI.tts.onTtsPlay((ttsUrl: string) => {
      if (audioRef.current) {
        setIsSpeaking(true);
        setLastAudioPath(ttsUrl);
        audioRef.current.src = ttsUrl;
        console.log('Reproduciendo TTS:', audioRef.current.src);
        audioRef.current.play().catch((err) => {
          console.error('Error reproduciendo audio:', err);
          setIsSpeaking(false);
        });
        audioRef.current.onended = () => setIsSpeaking(false);
      }
    });

    window.electronAPI.isConnected().then(setConnected);

    return () => {
      unsubMsg();
      unsubStatus();
      unsubErr();
      unsubTts();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleRecording = useCallback(() => {
    if (!recognition) return;

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      try {
        recognition.start();
        setIsRecording(true);
      } catch (e) {
        console.error('Error starting recognition:', e);
      }
    }
  }, [recognition, isRecording]);

  const handleFileSelect = async () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Usar el diálogo nativo de Electron para mejor UX
    const electronFiles = await window.electronAPI.selectFiles();
    if (electronFiles.length > 0) {
      setAttachments(prev => [...prev, ...electronFiles]);
    }

    // Limpiar input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type === 'application/pdf') return '📄';
    if (type.startsWith('text/')) return '📝';
    return '📎';
  };

  const send = async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (!connected) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: '⚠️ No estoy conectado al Gateway. Pegá tu token en Configuración (🛠).',
        },
      ]);
      return;
    }

    const userMsg: Message = {
      role: 'user',
      text: input,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachments([]);
    setSending(true);
    setIsTyping(true);

    try {
      // Enviar mensaje con archivos adjuntos
      await window.electronAPI.send('userMessage', {
        text: userMsg.text,
        attachments: userMsg.attachments,
      });
    } catch (err: any) {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `❌ Error enviando: ${err?.message ?? err}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="app"
      style={{
        position: 'fixed',
        bottom: 90,
        right: 15,
        width: 380,
        height: 520,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 10px 35px rgba(0,0,0,0.5)',
        zIndex: 9994,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
      }}
    >
      <header style={{
        padding: '12px 14px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          ClawGS
          <span className={`speaking-indicator ${isSpeaking ? '' : 'hidden'}`} style={{
            animation: isSpeaking ? 'pulse 1s infinite' : 'none',
          }}>●</span>
          <span
            className="status-dot"
            title={connected ? 'Conectado' : 'Desconectado'}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: connected ? '#00ffcc' : '#ff4d4d',
              display: 'inline-block',
            }}
          />
          {isTyping && (
            <span style={{
              fontSize: '0.75em',
              color: '#00ffcc',
              animation: 'pulse 1.5s infinite',
            }}>
              escribiendo...
            </span>
          )}
        </h1>
        <div style={{ display: 'flex', gap: 4 }}>
          {lastAudioPath && (
            <button
              className="minimize-btn"
              onClick={() => {
                if (audioRef.current && lastAudioPath) {
                  setIsSpeaking(true);
                  audioRef.current.src = lastAudioPath;
                  audioRef.current.play().catch(() => setIsSpeaking(false));
                  audioRef.current.onended = () => setIsSpeaking(false);
                }
              }}
              title="Reproducir última respuesta"
              disabled={isSpeaking}
              style={{ opacity: isSpeaking ? 0.5 : 1 }}
            >
              🔊
            </button>
          )}
          <button className="minimize-btn" onClick={onOpenSettings} title="Configuración">🛠</button>
          <button className="minimize-btn" onClick={onClose}>_</button>
        </div>
      </header>

      {/* Adjuntos pendientes */}
      {attachments.length > 0 && (
        <div style={{
          padding: '8px 12px',
          background: '#f7f7f7',
          borderBottom: '1px solid #eee',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          maxHeight: 100,
          overflowY: 'auto',
        }}>
          {attachments.map((file, index) => (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'white',
              borderRadius: 20,
              border: '1px solid #e0e0e0',
              fontSize: 12,
            }}>
              <span>{getFileIcon(file.type)}</span>
              <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <span style={{ color: '#888', fontSize: 11 }}>{formatFileSize(file.size)}</span>
              <button
                onClick={() => removeAttachment(index)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 14,
                  lineHeight: 1,
                  color: '#888',
                }}
                title="Quitar"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="messages" style={{
        flex: 1,
        overflowY: 'auto',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {messages.length === 0 && (
          <div className="empty" style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888',
            textAlign: 'center',
            padding: 20,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🦸</div>
            <p style={{ margin: 0, fontWeight: 500 }}>Bienvenido</p>
            <small>
              {connected
                ? 'Escribí algo o adjuntá archivos para arrancar'
                : 'Conectate desde ⚙ antes de chatear'}
            </small>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`bubble ${msg.role === 'user' ? 'user' : 'agent'}`} style={{
            maxWidth: '85%',
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            padding: '10px 14px',
            borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            background: msg.role === 'user' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f0f0f0',
            color: msg.role === 'user' ? 'white' : '#333',
            position: 'relative',
            animation: 'fadeIn 0.3s ease',
          }}>
            {msg.attachments && msg.attachments.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 8,
              }}>
                {msg.attachments.map((file, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    background: msg.role === 'user' ? 'rgba(255,255,255,0.2)' : 'white',
                    borderRadius: 12,
                    fontSize: 11,
                    border: msg.role === 'user' ? '1px solid rgba(255,255,255,0.3)' : '1px solid #ddd',
                  }}>
                    <span>{getFileIcon(file.type)}</span>
                    <span>{file.name}</span>
                    {file.type.startsWith('image/') && (
                      <button
                        onClick={() => setShowImageViewer(file.dataUrl)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 12,
                        }}
                        title="Ver imagen"
                      >
                        👁
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {msg.text && <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.text}</div>}
            {msg.imageUrl && (
              <img
                src={msg.imageUrl}
                alt="Adjunto"
                className="attached-image"
                onClick={() => setShowImageViewer(msg.imageUrl!)}
                style={{
                  maxWidth: '100%',
                  borderRadius: 8,
                  marginTop: 8,
                  cursor: 'pointer',
                }}
              />
            )}
            <small style={{
              opacity: 0.6,
              fontSize: 10,
              display: 'block',
              marginTop: 6,
            }}>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer con botones de adjuntar y micrófono */}
      <div className="composer" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: '#fafafa',
        borderTop: '1px solid #eee',
      }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFilesSelected}
          style={{ display: 'none' }}
          multiple
          accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx"
        />

        {/* Botón adjuntar */}
        <button
          onClick={handleFileSelect}
          disabled={!connected || sending}
          title="Adjuntar archivos"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: 'none',
            background: connected ? '#667eea' : '#ddd',
            color: connected ? 'white' : '#999',
            cursor: connected ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            transition: 'all 0.2s',
          }}
        >
          📎
        </button>

        {/* Input de texto */}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={connected ? 'Escribí un mensaje...' : 'Conectate primero desde ⚙'}
          disabled={!connected}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 22,
            border: '1px solid #ddd',
            fontSize: 14,
            outline: 'none',
            background: 'white',
          }}
        />

        {/* Botón micrófono */}
        <button
          onClick={toggleRecording}
          disabled={!connected || !recognition}
          title={isRecording ? 'Detener dictado (Español)' : 'Dictado por voz (Español)'}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: 'none',
            background: isRecording ? '#ff4d4d' : (connected ? '#667eea' : '#ddd'),
            color: connected ? 'white' : '#999',
            cursor: connected ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            transition: 'all 0.2s',
            animation: isRecording ? 'pulse 1s infinite' : 'none',
          }}
        >
          {isRecording ? '⏹' : '🎤'}
        </button>

        {/* Botón enviar */}
        <button
          className="send-btn"
          onClick={send}
          disabled={!connected || sending || (!input.trim() && attachments.length === 0)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: 'none',
            background: (connected && (input.trim() || attachments.length > 0)) ? '#00cc88' : '#ddd',
            color: (connected && (input.trim() || attachments.length > 0)) ? 'white' : '#999',
            cursor: (connected && (input.trim() || attachments.length > 0)) ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
        >
          {sending ? '...' : '➤'}
        </button>
      </div>

      {/* Elemento de audio oculto para reproducir TTS */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      {showImageViewer && (
        <ImageViewer
          src={showImageViewer}
          onClose={() => setShowImageViewer(null)}
        />
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
        .attached-image {
          max-width: 100%;
          border-radius: 8px;
          margin-top: 8px;
          cursor: zoom-in;
        }
        .bubble.user .attached-image {
          border: 2px solid rgba(255,255,255,0.3);
        }
        .send-btn:hover:not(:disabled) {
          transform: scale(1.05);
        }
        button:hover:not(:disabled) {
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
}