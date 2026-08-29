import { useState, useEffect } from 'react';

interface BubbleProps {
  onClick: () => void;
}

export default function Bubble({ onClick }: BubbleProps) {
  const [hover, setHover] = useState(false);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        boxShadow: hover 
          ? '0 8px 25px rgba(102, 126, 234, 0.5)' 
          : '0 4px 15px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: hover ? 'scale(1.1)' : 'scale(1)',
        border: '2px solid rgba(255,255,255,0.2)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      title="Abrir chat con ClawGs"
    >
      <span 
        style={{
          fontSize: '30px',
          filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.4))',
          animation: pulse ? 'pulse 2s infinite' : 'none',
        }}
      >
       ✍
      </span>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}