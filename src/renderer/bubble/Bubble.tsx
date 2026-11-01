import { useState, useEffect } from 'react';

interface BubbleProps {
  onClick: () => void;
}

export default function Bubble({ onClick }: BubbleProps) {
  const [hover, setHover] = useState(false);

  return (
    <>
      <style>{`
        @keyframes arc-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes arc-rotate-rev {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes arc-pulse {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 15px rgba(0,217,255,0.5), inset 0 0 15px rgba(0,217,255,0.3); }
          50% { opacity: 1; box-shadow: 0 0 30px rgba(0,217,255,0.8), inset 0 0 25px rgba(0,217,255,0.5); }
        }
        @keyframes arc-core {
          0%, 100% { transform: scale(0.7); opacity: 0.6; }
          50% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: hover ? 'scale(1.1)' : 'scale(1)',
          background: '#03060e',
          border: '2px solid #00d9ff',
          animation: 'arc-pulse 3s ease-in-out infinite',
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        title="IA-companion-GS"
      >
        {/* Outer rotating ring */}
        <div style={{
          position: 'absolute',
          inset: 3,
          borderRadius: '50%',
          border: '1px solid rgba(0,217,255,0.3)',
          borderTopColor: '#00d9ff',
          animation: 'arc-rotate 4s linear infinite',
        }} />
        {/* Inner counter-rotating ring */}
        <div style={{
          position: 'absolute',
          inset: 8,
          borderRadius: '50%',
          border: '1px solid rgba(0,217,255,0.2)',
          borderBottomColor: '#00d9ff',
          animation: 'arc-rotate-rev 3s linear infinite',
        }} />
        {/* Core */}
        <div style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#00d9ff',
          boxShadow: '0 0 12px #00d9ff, 0 0 24px rgba(0,217,255,0.5)',
          animation: 'arc-core 2s ease-in-out infinite',
        }} />
      </div>
    </>
  );
}
