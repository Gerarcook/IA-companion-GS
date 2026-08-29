import { useEffect, useState, useRef } from 'react';

interface SettingsProps {
  onClose: () => void;
}

interface TtsProviderInfo {
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

type TabId = 'general' | 'tts' | 'folders' | 'about';

export default function Settings({ onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [providers, setProviders] = useState<TtsProviderInfo[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerConfig, setProviderConfig] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  // General settings
  const [omniToken, setOmniToken] = useState('');
  const [omniUrl, setOmniUrl] = useState('http://localhost:20128');
  const [omniModel, setOmniModel] = useState('omniroute/default');
  const [connected, setConnected] = useState(false);
  const [autoTts, setAutoTts] = useState(false);

  // Folders
  const [folders, setFolders] = useState<string[]>([]);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: '⚙' },
    { id: 'tts', label: 'Voz (TTS)', icon: '🔊' },
    { id: 'folders', label: 'Carpetas', icon: '📁' },
    { id: 'about', label: 'Acerca de', icon: 'ℹ' },
  ];

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    await Promise.all([
      loadGeneralSettings(),
      loadTtsSettings(),
      loadFolders(),
    ]);
  };

  const loadGeneralSettings = async () => {
    const token = await window.electronAPI.getSetting('omniroute_api_key');
    if (token) setOmniToken(token);
    const url = await window.electronAPI.getSetting('omniroute_url');
    if (url) setOmniUrl(url);
    const model = await window.electronAPI.getSetting('omniroute_model');
    if (model) setOmniModel(model);
    const auto = await window.electronAPI.getSetting('auto_tts');
    setAutoTts(auto === 'true');
    const conn = await window.electronAPI.isConnected();
    setConnected(conn);
  };

  const loadTtsSettings = async () => {
    const providerList = await window.electronAPI.tts.getProviders();
    setProviders(providerList);

    const activeId = await window.electronAPI.tts.getActiveProvider();
    if (activeId) {
      setActiveProviderId(activeId);
      const config = await window.electronAPI.tts.getProviderConfig(activeId);
      if (config) setProviderConfig(config);
    }
  };

  const loadFolders = async () => {
    const list = await window.electronAPI.listAuthorizedFolders();
    setFolders(list);
  };

  const showFeedback = (ok: boolean, msg: string) => {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  // General tab handlers
  const saveOmniSettings = async () => {
    setSaving(true);
    try {
      await window.electronAPI.setSetting('omniroute_url', omniUrl);
      await window.electronAPI.setSetting('omniroute_model', omniModel);
      if (omniToken.trim()) {
        const result: any = await window.electronAPI.connect(omniToken);
        if (result?.ok) {
          showFeedback(true, '✓ Conectado a OmniRoute');
          setConnected(true);
        } else {
          showFeedback(false, `✗ ${result?.error ?? 'Error conectando'}`);
        }
      } else {
        await window.electronAPI.disconnect();
        setConnected(false);
        showFeedback(true, 'Desconectado');
      }
    } catch (err: any) {
      showFeedback(false, `✗ Error: ${err?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!omniToken.trim()) {
      showFeedback(false, 'Pegá un token primero');
      return;
    }
    setSaving(true);
    try {
      const result: any = await window.electronAPI.connect(omniToken);
      if (result?.ok) {
        showFeedback(true, '✓ Conexión exitosa');
        setConnected(true);
      } else {
        showFeedback(false, `✗ ${result?.error ?? 'Error'}`);
        setConnected(false);
      }
    } catch (err: any) {
      showFeedback(false, `✗ ${err?.message ?? err}`);
      setConnected(false);
    } finally {
      setSaving(false);
    }
  };

  // TTS tab handlers
  const handleProviderChange = async (providerId: string) => {
    setActiveProviderId(providerId);
    const config = await window.electronAPI.tts.getProviderConfig(providerId);
    setProviderConfig(config || {});
    await window.electronAPI.tts.setActiveProvider(providerId);
    showFeedback(true, `Proveedor activo: ${providerList?.find(p => p.id === providerId)?.name ?? providerId}`);
  };

  const providerList = providers;

  const handleConfigChange = (key: string, value: any) => {
    setProviderConfig(prev => ({ ...prev, [key]: value }));
  };

  const saveProviderConfig = async () => {
    if (!activeProviderId) return;
    setSaving(true);
    try {
      const result: any = await window.electronAPI.tts.setProviderConfig(activeProviderId, providerConfig);
      if (result?.ok) {
        showFeedback(true, '✓ Configuración guardada');
        // Re-inicializar
        await window.electronAPI.tts.setActiveProvider(activeProviderId);
      } else {
        showFeedback(false, `✗ ${result?.error ?? 'Error guardando'}`);
      }
    } catch (err: any) {
      showFeedback(false, `✗ ${err?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  const testProvider = async () => {
    if (!activeProviderId) return;
    setTestingProvider(activeProviderId);
    try {
      const result: any = await window.electronAPI.tts.speak('Hola, esta es una prueba de voz desde ClawGS.');
      if (result?.ok) {
        showFeedback(true, '✓ Audio de prueba reproducido');
      } else {
        showFeedback(false, `✗ ${result?.error ?? 'Error reproduciendo'}`);
      }
    } catch (err: any) {
      showFeedback(false, `✗ ${err?.message ?? err}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const renderConfigFields = () => {
    const provider = providers.find(p => p.id === activeProviderId);
    if (!provider) return null;

    return provider.configFields.map(field => {
      const value = providerConfig[field.key] ?? field.default ?? '';
      const isPassword = field.type === 'password';

      return (
        <div key={field.key} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
            {field.label} {field.required && <span style={{ color: '#e53e3e' }}>*</span>}
          </label>
          {field.description && (
            <p style={{ marginBottom: 6, fontSize: 12, color: '#888' }}>{field.description}</p>
          )}
          {field.type === 'select' ? (
            <select
              value={value}
              onChange={e => handleConfigChange(field.key, e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #ddd',
                fontSize: 14,
                background: 'white',
              }}
            >
              {field.options?.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : field.type === 'number' ? (
            <input
              type="number"
              value={value}
              onChange={e => handleConfigChange(field.key, parseFloat(e.target.value) || 0)}
              placeholder={field.placeholder}
              step="0.01"
              min={field.key === 'speed' ? 0.25 : 0}
              max={field.key === 'speed' ? 4 : undefined}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #ddd',
                fontSize: 14,
              }}
            />
          ) : (
            <input
              type={isPassword ? 'password' : 'text'}
              value={value}
              onChange={e => handleConfigChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #ddd',
                fontSize: 14,
              }}
            />
          )}
        </div>
      );
    });
  };

  // Folders tab handlers
  const addFolder = async () => {
    const path = await window.electronAPI.requestFolderAccess();
    if (path) {
      setFolders(prev => [...prev, path]);
    }
  };

  const revokeFolder = async (path: string) => {
    await window.electronAPI.revokeFolder(path);
    setFolders(prev => prev.filter(p => p !== path));
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 350,
        maxHeight: '85vh',
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        zIndex: 9999,
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header with tabs */}
      <div style={{ borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', padding: '4px 8px 0' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                background: activeTab === tab.id ? '#667eea' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#666',
                borderRadius: '8px 8px 0 0',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.2s',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {tabs.find(t => t.id === activeTab)?.label}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#999',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

        {feedback && (
          <div
            style={{
              marginBottom: 20,
              padding: '12px 16px',
              borderRadius: 8,
              background: feedback.ok ? 'rgba(0,200,100,0.1)' : 'rgba(255,80,80,0.1)',
              color: feedback.ok ? '#1a7f4d' : '#b03030',
              fontSize: 13,
              animation: 'slideIn 0.3s ease',
            }}
          >
            {feedback.msg}
          </div>
        )}

        {/* GENERAL TAB */}
        {activeTab === 'general' && (
          <div>
            <section style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Conexión OmniRoute / OpenClaw</h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
                  API Key OmniRoute
                </label>
                <input
                  type="password"
                  value={omniToken}
                  onChange={e => setOmniToken(e.target.value)}
                  placeholder="sk-..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    fontSize: 14,
                  }}
                />
                <p style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
                  Obtené tu key en <a href="https://github.com/omniroute" target="_blank" rel="noopener">OmniRoute</a> o tu gateway OpenClaw
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
                  URL del Gateway
                </label>
                <input
                  type="text"
                  value={omniUrl}
                  onChange={e => setOmniUrl(e.target.value)}
                  placeholder="http://localhost:20128"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
                  Modelo
                </label>
                <input
                  type="text"
                  value={omniModel}
                  onChange={e => setOmniModel(e.target.value)}
                  placeholder="omniroute/default"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={saveOmniSettings}
                  disabled={saving}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: saving ? '#999' : '#667eea',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  {saving ? 'Guardando…' : 'Guardar y Conectar'}
                </button>
                <button
                  onClick={testConnection}
                  disabled={saving || !omniToken.trim()}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    background: 'white',
                    color: '#333',
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: saving || !omniToken.trim() ? 'not-allowed' : 'pointer',
                    opacity: saving || !omniToken.trim() ? 0.6 : 1,
                  }}
                >
                  Probar Conexión
                </button>
              </div>

              <div style={{ marginTop: 16, padding: 12, background: '#f7f7f7', borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      background: connected ? '#00cc88' : '#ff4d4d',
                    }}
                  />
                  <strong>{connected ? 'Conectado' : 'Desconectado'}</strong>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={autoTts}
                    onChange={async e => {
                      setAutoTts(e.target.checked);
                      await window.electronAPI.setSetting('auto_tts', e.target.checked ? 'true' : 'false');
                    }}
                    style={{ width: 16, height: 16, accentColor: '#667eea' }}
                  />
                  <span>Auto-TTS (reproducir voz automáticamente al recibir respuesta)</span>
                </label>
              </div>
            </section>
          </div>
        )}

        {/* TTS TAB */}
        {activeTab === 'tts' && (
          <div>
            <section style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Proveedor de Voz Activo</h3>

              {providers.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', padding: 20 }}>Cargando proveedores...</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {providers.map(provider => (
                    <button
                      key={provider.id}
                      onClick={() => handleProviderChange(provider.id)}
                      style={{
                        padding: '14px 12px',
                        borderRadius: 10,
                        border: activeProviderId === provider.id ? '2px solid #667eea' : '1px solid #ddd',
                        background: activeProviderId === provider.id ? 'rgba(102,126,234,0.08)' : 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{provider.name}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{provider.description}</div>
                      {activeProviderId === provider.id && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#667eea', fontWeight: 500 }}>✓ Activo</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {activeProviderId && (
              <section style={{ marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Configuración del Proveedor</h3>
                <div style={{ background: '#fafafa', borderRadius: 10, padding: 20 }}>
                  {renderConfigFields()}
                  <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                    <button
                      onClick={saveProviderConfig}
                      disabled={saving}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 8,
                        border: 'none',
                        background: saving ? '#999' : '#667eea',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: saving ? 'wait' : 'pointer',
                      }}
                    >
                      {saving ? 'Guardando…' : 'Guardar Configuración'}
                    </button>
                    <button
                      onClick={testProvider}
                      disabled={saving || testingProvider === activeProviderId}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 8,
                        border: '1px solid #ddd',
                        background: testingProvider === activeProviderId ? '#fff3e0' : 'white',
                        color: testingProvider === activeProviderId ? '#e67e22' : '#333',
                        fontWeight: 500,
                        fontSize: 14,
                        cursor: saving || testingProvider ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {testingProvider === activeProviderId ? 'Probando…' : '🔊 Probar Voz'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Proveedores Soportados</h3>
              <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                <div style={{ padding: '12px', background: '#f0f7ff', borderRadius: 8, border: '1px solid #d6eaff' }}>
                  <strong>🐟 Fish Audio</strong> - Clonación de voz con reference_id. Modelos: s2.1-pro-free, s2.1-pro, 1.4-turbo-free.
                  <br /><small>Requiere API key de <a href="https://fish.audio" target="_blank" rel="noopener">fish.audio</a></small>
                </div>
                <div style={{ padding: '12px', background: '#fff0f7', borderRadius: 8, border: '1px solid #ffd6ea' }}>
                  <strong>🤖 OpenAI TTS</strong> - Voces: alloy, echo, fable, onyx, nova, shimmer. Modelos: tts-1, tts-1-hd, gpt-4o-mini-tts.
                  <br /><small>Requiere API key de <a href="https://platform.openai.com" target="_blank" rel="noopener">OpenAI</a></small>
                </div>
                <div style={{ padding: '12px', background: '#f0fff4', borderRadius: 8, border: '1px solid #c6f6d5' }}>
                  <strong>🎭 ElevenLabs</strong> - Miles de voces ultra-realistas. Modelos: multilingual_v2, turbo_v2.
                  <br /><small>Requiere API key de <a href="https://elevenlabs.io" target="_blank" rel="noopener">ElevenLabs</a></small>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* FOLDERS TAB */}
        {activeTab === 'folders' && (
          <div>
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Carpetas Autorizadas</h3>
                <button
                  onClick={addFolder}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#667eea',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  + Agregar Carpeta
                </button>
              </div>

              {folders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
                  <p>Sin carpetas autorizadas</p>
                  <small>Agregá carpetas para permitir acceso a archivos</small>
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {folders.map(f => (
                    <li
                      key={f}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 14px',
                        background: '#fafafa',
                        borderRadius: 8,
                        marginBottom: 8,
                        fontSize: 13,
                        border: '1px solid #eee',
                      }}
                    >
                      <span style={{ wordBreak: 'break-all', flex: 1, fontFamily: 'monospace', fontSize: 12 }}>{f}</span>
                      <button
                        onClick={() => revokeFolder(f)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#e53e3e',
                          cursor: 'pointer',
                          fontSize: 16,
                          padding: '4px 8px',
                          borderRadius: 4,
                        }}
                        title="Revocar acceso"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* ABOUT TAB */}
        {activeTab === 'about' && (
          <div>
            <section style={{ marginBottom: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🦸</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>ClawGS</h2>
              <p style={{ margin: 0, color: '#888', fontSize: 14 }}>Compañero de escritorio para chatear con IAs</p>
              <p style={{ margin: '12px 0 0', color: '#aaa', fontSize: 12 }}>Versión 0.1.0</p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Tecnologías</h3>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#555', lineHeight: 1.8 }}>
                <li>Electron + React + TypeScript</li>
                <li>electron-vite para desarrollo</li>
                <li>sql.js (SQLite en WASM) para persistencia local</li>
                <li>OmniRoute / OpenClaw Gateway para chat</li>
                <li>Fish Audio / OpenAI / ElevenLabs para TTS</li>
              </ul>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Enlaces</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a href="https://github.com/fish-audio" target="_blank" rel="noopener" style={{ color: '#667eea', textDecoration: 'none', fontSize: 13 }}>
                  Fish Audio →
                </a>
                <a href="https://platform.openai.com/docs/guides/text-to-speech" target="_blank" rel="noopener" style={{ color: '#667eea', textDecoration: 'none', fontSize: 13 }}>
                  OpenAI TTS Docs →
                </a>
                <a href="https://elevenlabs.io/docs" target="_blank" rel="noopener" style={{ color: '#667eea', textDecoration: 'none', fontSize: 13 }}>
                  ElevenLabs Docs →
                </a>
                <a href="https://github.com/omniroute" target="_blank" rel="noopener" style={{ color: '#667eea', textDecoration: 'none', fontSize: 13 }}>
                  OmniRoute →
                </a>
              </div>
            </section>

            <section>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Datos de la App</h3>
              <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace', background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
                <div>User Data: disponible</div>
                <div>Base de datos: clawgs-wc.sqlite</div>
                <div>Caché TTS: {`${(navigator as any).userDataPath || 'N/A'}/tts-cache`}</div>
              </div>
            </section>
          </div>
        )}

      </div>
    </div>

    );
}