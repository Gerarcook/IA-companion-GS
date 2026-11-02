import { useState, useEffect } from 'react';
import './Orb.css';
import orbImage from '../assets/orb.jpg';

type OrbState = 'idle' | 'speaking' | 'error';

interface OrbProps {
  onClick: () => void;
  state?: OrbState;
  /** URL de la imagen del orbe. Si no se pasa, se usa orb.jpg de assets. */
  src?: string;
  ariaLabel?: string;
}

export default function Orb({
  onClick,
  state = 'idle',
  src = orbImage,
  ariaLabel = 'Abrir IA-companion-GS',
}: OrbProps) {
  const [hover, setHover] = useState(false);

  // Avisar al proceso principal si el puntero está sobre la burbuja (click-through en modo burbuja).
  // Siempre se basa en el hover real, no en el estado de conexión, para que el orb sea clickeable
  // incluso cuando hay error y el usuario necesite abrir el chat para configurar.
  useEffect(() => {
    window.electronAPI?.window?.setPointerOverBubble?.(hover);
  }, [hover]);

  return (
    <button
      type="button"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={`orb ${state}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <img src={src} alt="Orb IA-companion-GS" />
    </button>
  );
}
