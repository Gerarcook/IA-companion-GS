import { useEffect, useState } from 'react';
import Bubble from './bubble/Bubble';
import Chat from './chat/Chat';
import Settings from './settings/Settings';

export default function App() {
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const unsub = window.electronAPI.onToggleChat(() => {
      setShowChat((prev) => !prev);
    });
    return unsub;
  }, []);

  return (
    <>
      <Bubble onClick={() => setShowChat(true)} />
      {showChat && (
        <Chat
          onClose={() => setShowChat(false)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </>
  );
}
