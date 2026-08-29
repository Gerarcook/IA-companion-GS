import { useEffect } from 'react';

interface ImageViewerProps {
  src: string;
  onClose: () => void;
}

export default function ImageViewer({ src, onClose }: ImageViewerProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <img
        src={src}
        alt="Vista previa"
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          boxShadow: '0 0 32px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          width: 40,
          height: 40,
          borderRadius: 20,
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          fontSize: 24,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  );
}