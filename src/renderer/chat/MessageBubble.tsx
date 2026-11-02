import { AttachedFile, formatTime, getFileIcon } from './utils';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  imageUrl?: string;
  attachments?: AttachedFile[];
  streaming?: boolean;
}

interface MessageBubbleProps {
  msg: Message;
  index: number;
  copiedMsg: number | null;
  onCopyMessage: (text: string, index: number) => void;
  onViewImage: (url: string) => void;
  formatTime: (ts: number) => string;
  getFileIcon: (type: string) => string;
}

export default function MessageBubble({
  msg,
  index,
  copiedMsg,
  onCopyMessage,
  onViewImage,
  formatTime,
  getFileIcon,
}: MessageBubbleProps) {
  const roleLabel = msg.role === 'user' ? 'USER' : 'GS';

  return (
    <div
      key={`${msg.ts}-${index}`}
      className={`bubble ${msg.role === 'user' ? 'user' : 'agent'}`}
    >
      <span className="msg-role">{roleLabel}</span>
      {msg.attachments && msg.attachments.length > 0 && (
        <div className="bubble-attachments">
          {msg.attachments.map((file, idx) => (
            <div key={idx} className="bubble-attachment">
              <span>{getFileIcon(file.type)}</span>
              <span className="attachment-name">{file.name}</span>
              {file.type.startsWith('image/') && (
                <button
                  onClick={() => onViewImage(file.dataUrl)}
                  title="Ver"
                  aria-label="Ver imagen"
                >
                  &#128065;
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {msg.text && <div className="msg-text">{msg.text}</div>}
      {msg.imageUrl && (
        <img
          src={msg.imageUrl}
          alt="Adjunto"
          className="attached-image"
          onClick={() => onViewImage(msg.imageUrl!)}
        />
      )}
      <div className="bubble-footer">
        {msg.text && msg.role === 'assistant' && (
          <button
            className="msg-copy"
            onClick={() => onCopyMessage(msg.text, index)}
            title="Copiar mensaje"
            aria-label="Copiar mensaje"
          >
            {copiedMsg === index ? '\u2713 copiado' : '\u29C9 copiar'}
          </button>
        )}
        <span className="msg-time">{formatTime(msg.ts)}</span>
      </div>
    </div>
  );
}
