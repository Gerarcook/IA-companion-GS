import { useEffect, useState } from 'react';
import Orb from './bubble/Orb';
import Chat from './chat/Chat';
import Settings from './settings/Settings';

type OrbState = 'idle' | 'speaking' | 'error';

export default function App() {
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>('idle');

  // Ajusta el tamaño de la ventana según lo que está visible.
  // burbuja → ventana chica (solo la burbuja); chat → panel normal;
  // chat expandido o ajustes → ventana grande.
  useEffect(() => {
    const mode = showSettings || (showChat && expanded) ? 'expanded' : showChat ? 'chat' : 'bubble';
    window.electronAPI?.window?.setMode?.(mode);
  }, [showChat, showSettings, expanded]);

  // Estado del orbe según la conexión con el gateway.
  useEffect(() => {
    const unsubStatus = window.electronAPI.onStatus((status) => {
      setOrbState(status.connected ? 'idle' : 'error');
    });
    const unsubError = window.electronAPI.onError(() => setOrbState('error'));
    window.electronAPI.isConnected().then((connected) => setOrbState(connected ? 'idle' : 'error'));
    return () => { unsubStatus(); unsubError(); };
  }, []);

  useEffect(() => {
    const unsub = window.electronAPI.onToggleChat(() => {
      setShowChat((prev) => {
        const next = !prev;
        if (!next) setExpanded(false);
        return next;
      });
    });
    return unsub;
  }, []);

  const openChat = () => {
    setShowChat(true);
  };

  const closeChat = () => {
    setShowChat(false);
    setExpanded(false);
  };

  return (
    <>
      {!showChat && (
        <Orb state={orbState} onClick={openChat} />
      )}
      {showChat && (
        <Chat
          onClose={closeChat}
          onOpenSettings={() => setShowSettings(true)}
          expanded={expanded}
          onToggleExpand={() => setExpanded((prev) => !prev)}
        />
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </>
  );
}
