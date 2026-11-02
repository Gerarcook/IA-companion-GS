import { useCallback } from 'react';
import { AttachedFile, formatFileSize, getFileIcon } from './utils';

interface ComposerProps {
  composerInputRef: React.RefObject<HTMLTextAreaElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  audioRef: React.RefObject<HTMLAudioElement>;
  input: string;
  onInputChange: (value: string) => void;
  attachments: AttachedFile[];
  onRemoveAttachment: (index: number) => void;
  onAddFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formatFileSize: (bytes: number) => string;
  getFileIcon: (type: string) => string;
  connected: boolean;
  sending: boolean;
  isRecording: boolean;
  recSupported: boolean;
  onToggleRecording: () => void;
  onSend: () => void;
  isSpeaking: boolean;
  lastAudioPath: string | null;
  onReplayAudio: () => void;
}

export default function Composer({
  composerInputRef,
  fileInputRef,
  audioRef,
  input,
  onInputChange,
  attachments,
  onRemoveAttachment,
  onAddFiles,
  formatFileSize,
  getFileIcon,
  connected,
  sending,
  isRecording,
  recSupported,
  onToggleRecording,
  onSend,
  isSpeaking,
  lastAudioPath,
  onReplayAudio,
}: ComposerProps) {
  const resizeComposer = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  return (
    <div className="composer">
      <input
        type="file"
        ref={fileInputRef}
        onChange={onAddFiles}
        style={{ display: 'none' }}
        multiple
        accept="image/*,audio/*,.pdf,.txt,.md,.json,.csv,.doc,.docx,.xls,.xlsx"
      />
      <button
        className="composer-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={!connected || sending}
        title="Adjuntar archivos"
        aria-label="Adjuntar archivos"
      >
        &#128206;
      </button>
      <textarea
        ref={composerInputRef}
        className="composer-input"
        value={input}
        onChange={(e) => {
          onInputChange(e.target.value);
          resizeComposer(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={connected ? 'Escriba una instruccion...' : 'Sistema offline'}
        disabled={!connected || sending}
        rows={1}
      />
      <button
        className={`composer-btn ${isRecording ? 'recording' : ''}`}
        onClick={onToggleRecording}
        disabled={!recSupported}
        title={!recSupported ? 'Dictado no disponible en este equipo' : isRecording ? 'Detener dictado' : 'Dictado por voz'}
        aria-label={!recSupported ? 'Dictado no disponible' : isRecording ? 'Detener dictado' : 'Dictado por voz'}
      >
        {isRecording ? '\u25A0' : '\u266A'}
      </button>
      <button
        className="send-btn"
        onClick={onSend}
        disabled={!connected || sending || (!input.trim() && attachments.length === 0)}
        aria-label="Enviar mensaje"
      >
        {sending ? '...' : '\u2192'}
      </button>
    </div>
  );
}
