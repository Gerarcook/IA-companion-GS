import { contextBridge, ipcRenderer } from 'electron';

export interface OpenClawMessage {
  kind: string;
  payload: any;
}

export interface TtsProviderInfo {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  supportedModels?: string[];
  configFields: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'select' | 'number';
    required: boolean;
    placeholder?: string;
    options?: { value: string; label: string }[];
    default?: string | number;
    description?: string;
  }>;
}

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;  // base64
}

const api = {
  // OpenClaw
  connect: (token: string) => ipcRenderer.invoke('openclaw:connect', token),
  disconnect: () => ipcRenderer.invoke('openclaw:disconnect'),
  isConnected: () => ipcRenderer.invoke('openclaw:is-connected'),
  retry: () => ipcRenderer.invoke('openclaw:retry'),
  send: (event: string, payload: any) => ipcRenderer.invoke('openclaw:send', { event, payload }),
  onMessage: (callback: (msg: OpenClawMessage) => void) => {
    const listener = (_: any, msg: OpenClawMessage) => callback(msg);
    ipcRenderer.on('openclaw:message', listener);
    return () => { ipcRenderer.off('openclaw:message', listener); };
  },
  onStatus: (callback: (status: { connected: boolean }) => void) => {
    const listener = (_: any, status: { connected: boolean }) => callback(status);
    ipcRenderer.on('openclaw:status', listener);
    return () => { ipcRenderer.off('openclaw:status', listener); };
  },
  onError: (callback: (err: string) => void) => {
    const listener = (_: any, err: string) => callback(err);
    ipcRenderer.on('openclaw:error', listener);
    return () => { ipcRenderer.off('openclaw:error', listener); };
  },

  // TTS Providers
  tts: {
    getProviders: () => ipcRenderer.invoke('tts:get-providers'),
    getActiveProvider: () => ipcRenderer.invoke('tts:get-active-provider'),
    setActiveProvider: (id: string) => ipcRenderer.invoke('tts:set-active-provider', id),
    getProviderConfig: (id: string) => ipcRenderer.invoke('tts:get-provider-config', id),
    setProviderConfig: (id: string, config: Record<string, any>) => ipcRenderer.invoke('tts:set-provider-config', id, config),
    speak: (text: string, options?: Record<string, any>) => ipcRenderer.invoke('tts:speak', text, options),
    onTtsPlay: (callback: (filePath: string) => void) => {
      const listener = (_: any, filePath: string) => callback(filePath);
      ipcRenderer.on('tts:play', listener);
      return () => { ipcRenderer.off('tts:play', listener); };
    },
  },

  // Files
  requestFolderAccess: () => ipcRenderer.invoke('files:request-access'),
  listAuthorizedFolders: () => ipcRenderer.invoke('files:list-authorized'),
  revokeFolder: (path: string) => ipcRenderer.invoke('files:revoke', path),
  readFile: (filePath: string) => ipcRenderer.invoke('files:read', filePath),
  selectFiles: () => ipcRenderer.invoke('files:select'),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),

  // UI
  toggleChat: () => ipcRenderer.invoke('ui:toggle-chat'),
  onToggleChat: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('ui:toggle-chat', listener);
    return () => { ipcRenderer.off('ui:toggle-chat', listener); };
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;