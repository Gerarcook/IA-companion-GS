import { useEffect, useState } from 'react';
import Bubble from './bubble/Bubble';
import Chat from './chat/Chat';
import Settings from './settings/Settings';

export default function App() {
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Ajusta el tamaño de la ventana según lo que está visible.
  // burbuja → ventana chica (solo la burbuja); chat → panel normal;
  // chat expandido o ajustes → ventana grande.
  useEffect(() => {
    const mode = showSettings || (showChat && expanded) ? 'expanded' : showChat ? 'chat' : 'bubble';
    window.electronAPI?.window?.setMode?.(mode);
  }, [showChat, showSettings, expanded]);

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
        <Bubble onClick={openChat} />
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
