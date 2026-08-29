import { useEffect, useRef, useState } from 'react';
import './Chat.css';
import ImageViewer from '../image-viewer/ImageViewer';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
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
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubMsg = window.electronAPI.onMessage((msg: any) => {
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

    window.electronAPI.isConnected().then(setConnected);

    return () => {
      unsubMsg();
      unsubStatus();
      unsubErr();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;

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

    const userMsg: Message = { role: 'user', text: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      await window.electronAPI.send('userMessage', { text: userMsg.text });
    } catch (err: any) {
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
        width: 350,
        height: 430,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 10px 35px rgba(0,0,0,0.5)',
        zIndex: 9994,
      }}
    >
      <header>
        <h1>
          ClawGS
          <span className={`speaking-indicator ${isSpeaking ? '' : 'hidden'}`}> ●</span>
          <span
            className="status-dot"
            title={connected ? 'Conectado' : 'Desconectado'}
            style={{
              marginLeft: 8,
              width: 8,
              height: 8,
              borderRadius: 4,
              background: connected ? '#00ffcc' : '#ff4d4d',
              display: 'inline-block',
            }}
          />
        </h1>
        <div className="controls">
          <button className="minimize-btn" onClick={onOpenSettings} title="Configuración">🛠</button>
          <button className="minimize-btn" onClick={onClose}>_</button>
        </div>
      </header>

      <div className="folders-bar">
        <span className="folder-tag">🏠 Root</span>
        <span className="folder-tag">📁 Workspace</span>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p>Bienvenido</p>
            <small>
              {connected
                ? 'Escribí algo para arrancar la conversación'
                : 'Conectate desde ⚙ antes de chatear'}
            </small>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`bubble ${msg.role === 'user' ? 'user' : 'agent'}`}>
            {msg.text && <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>}
            {msg.imageUrl && (
              <img
                src={msg.imageUrl}
                alt="Adjunto"
                className="attached-image"
                onClick={() => setShowImageViewer(msg.imageUrl!)}
              />
            )}
            <small>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="composer">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={connected ? 'Escribí un mensaje...' : 'Conectate primero desde ⚙'}
          disabled={!connected}
        />
        <button className="send-btn" onClick={send} disabled={!connected || sending}>
          {sending ? '...' : 'Enviar'}
        </button>
      </div>

      {showImageViewer && (
        <ImageViewer
          src={showImageViewer}
          onClose={() => setShowImageViewer(null)}
        />
      )}
    </div>
  );
}
