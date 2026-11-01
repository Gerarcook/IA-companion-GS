import { useEffect, useState } from 'react';
import logoUrl from '../assets/logo.png';

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

const CY = '#00d9ff';
const CY_DIM = '#0099bb';
const CY_GLOW = 'rgba(0, 217, 255, 0.4)';
const CY_SOFT = 'rgba(0, 217, 255, 0.06)';
const BG = '#03060e';
const BG_PANEL = '#060d1a';
const BG_CARD = '#0a1426';
const TEXT = '#c8e4ff';
const TEXT_DIM = '#5a7a9a';
const BORDER = 'rgba(0, 217, 255, 0.15)';
const BORDER_BRIGHT = 'rgba(0, 217, 255, 0.35)';
const RED = '#ff3b5c';
const GREEN = '#00ff9c';
const AMBER = '#ffb547';

const FONT = "'Orbitron', sans-serif";
const MONO = "'Share Tech Mono', monospace";

/** Proveedores compatibles con la API de chat de OpenAI (cualquiera sirve; el "Personalizado" acepta el resto). */
const PROVIDER_PRESETS: Record<string, { label: string; url: string; model: string; hint: string }> = {
  omniroute: { label: 'OmniRoute / Gateway local', url: 'http://localhost:20128/v1', model: 'omniroute/default', hint: 'Gateway local (OpenClaw/OmniRoute)' },
  openrouter: { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', hint: 'Cientos de modelos con una sola key' },
  openai: { label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: 'API oficial de OpenAI' },
  anthropic: { label: 'Anthropic', url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5', hint: 'Endpoint compatible con OpenAI' },
  groq: { label: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', hint: 'Modelos abiertos ultrarrápidos' },
  deepseek: { label: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: 'API económica' },
  gemini: { label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', hint: 'Endpoint compatible OpenAI' },
  ollama: { label: 'Ollama (local)', url: 'http://localhost:11434/v1', model: 'llama3.2', hint: 'Modelos locales, sin API key' },
  lmstudio: { label: 'LM Studio (local)', url: 'http://localhost:1234/v1', model: 'local-model', hint: 'Modelos locales, sin API key' },
  custom: { label: 'Personalizado', url: '', model: '', hint: 'Cualquier endpoint compatible OpenAI' },
};

export default function Settings({ onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [providers, setProviders] = useState<TtsProviderInfo[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerConfig, setProviderConfig] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const [omniToken, setOmniToken] = useState('');
  const [omniUrl, setOmniUrl] = useState('http://localhost:20128/v1');
  const [omniModel, setOmniModel] = useState('omniroute/default');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [providerPreset, setProviderPreset] = useState('omniroute');
  const [connected, setConnected] = useState(false);
  const [autoTts, setAutoTts] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'general', label: 'SISTEMA', icon: '\u2699' },
    { id: 'tts', label: 'VOZ', icon: '\u266A' },
    { id: 'folders', label: 'DATOS', icon: '\u25A3' },
    { id: 'about', label: 'INFO', icon: '\u2139' },
  ];

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    await Promise.all([loadGeneralSettings(), loadTtsSettings(), loadFolders()]);
  };

  const loadGeneralSettings = async () => {
    const token = await window.electronAPI.getSetting('omniroute_api_key');
    if (token) setOmniToken(token);
    const url = await window.electronAPI.getSetting('omniroute_url');
    setOmniUrl(url ?? 'http://localhost:20128/v1');
    const model = await window.electronAPI.getSetting('omniroute_model');
    if (model) setOmniModel(model);
    const prompt = await window.electronAPI.getSetting('system_prompt');
    if (prompt) setSystemPrompt(prompt);
    // Detectar preset según la URL guardada
    const savedUrl = url ?? '';
    for (const [id, preset] of Object.entries(PROVIDER_PRESETS)) {
      if (preset.url && preset.url === savedUrl) { setProviderPreset(id); break; }
    }
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

  const saveOmniSettings = async () => {
    setSaving(true);
    try {
      await window.electronAPI.setSetting('omniroute_url', omniUrl);
      await window.electronAPI.setSetting('omniroute_model', omniModel);
      if (systemPrompt.trim()) {
        await window.electronAPI.setSetting('system_prompt', systemPrompt);
      }
      if (omniToken.trim()) {
        const result: any = await window.electronAPI.connect(omniToken, omniUrl, omniModel);
        if (result?.ok) { showFeedback(true, '\u2713 CONEXION VERIFICADA'); setConnected(true); }
        else { showFeedback(false, `\u2717 ${result?.error ?? 'ERROR DE CONEXION'}`); setConnected(false); }
      } else {
        await window.electronAPI.disconnect();
        setConnected(false);
        showFeedback(true, 'DESCONECTADO');
      }
    } catch (err: any) {
      showFeedback(false, `\u2717 ERROR: ${err?.message ?? err}`);
    } finally { setSaving(false); }
  };

  const testConnection = async () => {
    if (!omniToken.trim()) { showFeedback(false, 'INGRESE TOKEN PRIMERO'); return; }
    setSaving(true);
    try {
      const result: any = await window.electronAPI.connect(omniToken, omniUrl, omniModel);
      if (result?.ok) { showFeedback(true, '\u2713 CONEXION VERIFICADA'); setConnected(true); }
      else { showFeedback(false, `\u2717 ${result?.error ?? 'ERROR'}`); setConnected(false); }
    } catch (err: any) {
      showFeedback(false, `\u2717 ${err?.message ?? err}`); setConnected(false);
    } finally { setSaving(false); }
  };

  const saveSystemPrompt = async () => {
    setSaving(true);
    try {
      await window.electronAPI.setSetting('system_prompt', systemPrompt);
      showFeedback(true, '\u2713 PERSONALIDAD ACTUALIZADA');
    } catch (err: any) {
      showFeedback(false, `\u2717 ERROR: ${err?.message ?? err}`);
    } finally { setSaving(false); }
  };

  const handleProviderChange = async (providerId: string) => {
    setActiveProviderId(providerId);
    const config = await window.electronAPI.tts.getProviderConfig(providerId);
    setProviderConfig(config || {});
    await window.electronAPI.tts.setActiveProvider(providerId);
    showFeedback(true, `PROVEEDOR: ${providers.find(p => p.id === providerId)?.name ?? providerId}`);
  };

  const handleConfigChange = (key: string, value: any) => {
    setProviderConfig(prev => ({ ...prev, [key]: value }));
  };

  const saveProviderConfig = async () => {
    if (!activeProviderId) return;
    setSaving(true);
    try {
      const result: any = await window.electronAPI.tts.setProviderConfig(activeProviderId, providerConfig);
      if (result?.ok) { showFeedback(true, '\u2713 CONFIGURACION GUARDADA'); await window.electronAPI.tts.setActiveProvider(activeProviderId); }
      else { showFeedback(false, `\u2717 ${result?.error ?? 'ERROR'}`); }
    } catch (err: any) { showFeedback(false, `\u2717 ${err?.message ?? err}`); }
    finally { setSaving(false); }
  };

  const testProvider = async () => {
    if (!activeProviderId) return;
    setTestingProvider(activeProviderId);
    try {
      const result: any = await window.electronAPI.tts.speak('Hola, esta es una prueba de voz desde JARVIS.');
      if (result?.ok) { showFeedback(true, '\u2713 AUDIO REPRODUCIDO'); }
      else { showFeedback(false, `\u2717 ${result?.error ?? 'ERROR'}`); }
    } catch (err: any) { showFeedback(false, `\u2717 ${err?.message ?? err}`); }
    finally { setTestingProvider(null); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 4,
    border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.4)',
    color: TEXT, fontSize: 13, fontFamily: MONO, outline: 'none',
    transition: 'all 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 12,
    letterSpacing: 1, color: CY, textTransform: 'uppercase', fontFamily: FONT,
  };

  const sectionTitle: React.CSSProperties = {
    margin: '0 0 16px', fontSize: 13, fontWeight: 700, letterSpacing: 2,
    color: CY, textTransform: 'uppercase', fontFamily: FONT,
    paddingBottom: 8, borderBottom: `1px solid ${BORDER}`,
  };

  const btnPrimary: React.CSSProperties = {
    padding: '10px 20px', borderRadius: 4, border: `1px solid ${CY}`,
    background: CY_SOFT, color: CY, fontWeight: 600, fontSize: 12,
    cursor: saving ? 'wait' : 'pointer', fontFamily: FONT, letterSpacing: 1,
    transition: 'all 0.2s',
  };

  const btnSecondary: React.CSSProperties = {
    padding: '10px 20px', borderRadius: 4, border: `1px solid ${BORDER}`,
    background: 'transparent', color: TEXT_DIM, fontWeight: 500, fontSize: 12,
    cursor: 'pointer', fontFamily: FONT, letterSpacing: 1, transition: 'all 0.2s',
  };

  const renderConfigFields = () => {
    const provider = providers.find(p => p.id === activeProviderId);
    if (!provider) return null;
    return provider.configFields.map(field => {
      const value = providerConfig[field.key] ?? field.default ?? '';
      return (
        <div key={field.key} style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            {field.label} {field.required && <span style={{ color: RED }}>*</span>}
          </label>
          {field.description && (
            <p style={{ marginBottom: 6, fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>{field.description}</p>
          )}
          {field.type === 'select' ? (
            <select
              value={value}
              onChange={e => handleConfigChange(field.key, e.target.value)}
              style={inputStyle}
            >
              {field.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          ) : field.type === 'number' ? (
            <input type="number" value={value} style={inputStyle}
              onChange={e => handleConfigChange(field.key, parseFloat(e.target.value) || 0)}
              placeholder={field.placeholder} step="0.01"
              min={field.key === 'speed' ? 0.25 : 0} max={field.key === 'speed' ? 4 : undefined}
            />
          ) : (
            <input type={field.type === 'password' ? 'password' : 'text'} value={value} style={inputStyle}
              onChange={e => handleConfigChange(field.key, e.target.value)} placeholder={field.placeholder}
            />
          )}
        </div>
      );
    });
  };

  const addFolder = async () => {
    const path = await window.electronAPI.requestFolderAccess();
    if (path) setFolders(prev => [...prev, path]);
  };

  const revokeFolder = async (path: string) => {
    await window.electronAPI.revokeFolder(path);
    setFolders(prev => prev.filter(p => p !== path));
  };

  return (
    <>
      <style>{`
        @keyframes settings-fade {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes feedback-slide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 380, maxHeight: '85vh', background: BG, borderRadius: 12,
          boxShadow: `0 0 50px rgba(0,217,255,0.1), 0 20px 60px rgba(0,0,0,0.8)`,
          border: `1px solid ${BORDER_BRIGHT}`, zIndex: 9999, overflow: 'hidden',
          fontFamily: FONT, color: TEXT, display: 'flex', flexDirection: 'column',
          animation: 'settings-fade 0.25s ease',
        }}
      >
        {/* HUD corners */}
        <div style={{ position: 'absolute', top: 6, left: 6, width: 16, height: 16, border: `2px solid ${CY}`, borderRight: 'none', borderBottom: 'none', opacity: 0.5 }} />
        <div style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, border: `2px solid ${CY}`, borderLeft: 'none', borderBottom: 'none', opacity: 0.5 }} />
        <div style={{ position: 'absolute', bottom: 6, left: 6, width: 16, height: 16, border: `2px solid ${CY}`, borderRight: 'none', borderTop: 'none', opacity: 0.5 }} />
        <div style={{ position: 'absolute', bottom: 6, right: 6, width: 16, height: 16, border: `2px solid ${CY}`, borderLeft: 'none', borderTop: 'none', opacity: 0.5 }} />

        {/* Tab bar */}
        <div style={{ display: 'flex', padding: '6px 6px 0', borderBottom: `1px solid ${BORDER}` }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px 6px', border: 'none',
                background: activeTab === tab.id ? CY_SOFT : 'transparent',
                color: activeTab === tab.id ? CY : TEXT_DIM,
                borderRadius: '4px 4px 0 0', fontSize: 10, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 4, transition: 'all 0.2s',
                fontFamily: FONT, letterSpacing: 1,
                borderBottom: activeTab === tab.id ? `2px solid ${CY}` : '2px solid transparent',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Title bar */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: 2, color: CY, fontFamily: FONT }}>
            {tabs.find(t => t.id === activeTab)?.label}
          </h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, fontSize: 16,
            cursor: 'pointer', color: TEXT_DIM, lineHeight: 1, padding: '2px 8px',
            borderRadius: 4, fontFamily: FONT, transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = RED; e.currentTarget.style.borderColor = RED; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_DIM; e.currentTarget.style.borderColor = BORDER; }}
          >
            &#215;
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {feedback && (
            <div style={{
              marginBottom: 20, padding: '10px 14px', borderRadius: 4,
              background: feedback.ok ? 'rgba(0,255,156,0.08)' : 'rgba(255,59,92,0.08)',
              border: `1px solid ${feedback.ok ? GREEN : RED}`,
              color: feedback.ok ? GREEN : RED, fontSize: 11, fontFamily: MONO,
              letterSpacing: 1, animation: 'feedback-slide 0.3s ease',
            }}>
              {feedback.msg}
            </div>
          )}

          {/* GENERAL */}
          {activeTab === 'general' && (
            <div>
              <section style={{ marginBottom: 24 }}>
                <h3 style={sectionTitle}>Conexion Gateway</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Proveedor de modelo</label>
                  <select value={providerPreset} style={inputStyle}
                    onChange={e => {
                      const id = e.target.value;
                      setProviderPreset(id);
                      const preset = PROVIDER_PRESETS[id];
                      if (preset?.url) setOmniUrl(preset.url);
                      if (preset?.model) setOmniModel(preset.model);
                    }}
                  >
                    {Object.entries(PROVIDER_PRESETS).map(([id, p]) => (
                      <option key={id} value={id}>{p.label}</option>
                    ))}
                  </select>
                  <p style={{ marginTop: 6, fontSize: 10, color: TEXT_DIM, fontFamily: MONO }}>
                    {PROVIDER_PRESETS[providerPreset]?.hint}
                  </p>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>API Key</label>
                  <input type="password" value={omniToken} style={inputStyle}
                    onChange={e => setOmniToken(e.target.value)} placeholder="sk-..."
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>URL del Gateway</label>
                  <input type="text" value={omniUrl} style={inputStyle}
                    onChange={e => setOmniUrl(e.target.value)} placeholder="http://localhost:20128/v1"
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Modelo</label>
                  <input type="text" value={omniModel} style={inputStyle}
                    onChange={e => setOmniModel(e.target.value)} placeholder="omniroute/default"
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={saveOmniSettings} disabled={saving} style={btnPrimary}>
                    {saving ? 'VERIFICANDO...' : 'CONECTAR'}
                  </button>
                  <button onClick={testConnection} disabled={saving || !omniToken.trim()} style={btnSecondary}>
                    PROBAR
                  </button>
                </div>
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 4, border: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? GREEN : RED, boxShadow: `0 0 8px ${connected ? GREEN : RED}` }} />
                    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: connected ? GREEN : RED }}>
                      {connected ? 'CONECTADO' : 'DESCONECTADO'}
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 11, fontFamily: MONO, color: TEXT_DIM }}>
                    <input type="checkbox" checked={autoTts}
                      onChange={async e => {
                        setAutoTts(e.target.checked);
                        await window.electronAPI.setSetting('auto_tts', e.target.checked ? 'true' : 'false');
                      }}
                      style={{ width: 14, height: 14, accentColor: CY }}
                    />
                    <span>AUTO-TTS (voz automatica)</span>
                  </label>
                </div>
              </section>
              <section>
                <h3 style={sectionTitle}>Personalidad</h3>
                <p style={{ marginBottom: 8, fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
                  Como responde el asistente (prompt de sistema).
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: MONO }}
                  placeholder="Eres ClawGs, un asistente IA util y conversacional..."
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button onClick={saveSystemPrompt} disabled={saving} style={btnPrimary}>
                    {saving ? 'PROCESANDO...' : 'GUARDAR'}
                  </button>
                  <button
                    onClick={async () => { setSystemPrompt(''); await window.electronAPI.setSetting('system_prompt', ''); showFeedback(true, 'PERSONALIDAD RESTABLECIDA'); }}
                    disabled={saving || !systemPrompt.trim()} style={btnSecondary}
                  >
                    RESTABLECER
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* TTS */}
          {activeTab === 'tts' && (
            <div>
              <section style={{ marginBottom: 24 }}>
                <h3 style={sectionTitle}>Proveedor de Voz</h3>
                {providers.length === 0 ? (
                  <p style={{ color: TEXT_DIM, textAlign: 'center', padding: 20, fontFamily: MONO, fontSize: 12 }}>CARGANDO...</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                    {providers.map(provider => (
                      <button key={provider.id} onClick={() => handleProviderChange(provider.id)}
                        style={{
                          padding: '12px 10px', borderRadius: 4, textAlign: 'left', transition: 'all 0.2s',
                          border: activeProviderId === provider.id ? `2px solid ${CY}` : `1px solid ${BORDER}`,
                          background: activeProviderId === provider.id ? CY_SOFT : 'transparent',
                          cursor: 'pointer', fontFamily: FONT,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: activeProviderId === provider.id ? CY : TEXT }}>
                          {provider.name}
                        </div>
                        <div style={{ fontSize: 10, color: TEXT_DIM, fontFamily: MONO }}>{provider.description}</div>
                        {activeProviderId === provider.id && (
                          <div style={{ marginTop: 4, fontSize: 9, color: CY, fontWeight: 500, letterSpacing: 1 }}>&#9655; ACTIVO</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {activeProviderId && (
                <section style={{ marginBottom: 24 }}>
                  <h3 style={sectionTitle}>Configuracion</h3>
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: 16, border: `1px solid ${BORDER}` }}>
                    {renderConfigFields()}
                    <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                      <button onClick={saveProviderConfig} disabled={saving} style={btnPrimary}>
                        {saving ? 'GUARDANDO...' : 'GUARDAR'}
                      </button>
                      <button onClick={testProvider} disabled={saving || testingProvider === activeProviderId} style={btnSecondary}>
                        {testingProvider === activeProviderId ? 'PROBANDO...' : '\u266A PROBAR'}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <h3 style={sectionTitle}>Proveedores</h3>
                <div style={{ display: 'grid', gap: 8, fontSize: 11, fontFamily: MONO }}>
                  <div style={{ padding: 12, background: 'rgba(0,217,255,0.04)', borderRadius: 4, border: `1px solid ${BORDER}` }}>
                    <strong style={{ color: CY }}>Fish Audio</strong> <span style={{ color: TEXT_DIM }}>- Clonacion de voz</span><br />
                    <small style={{ color: TEXT_DIM }}>Modelos: s2.1-pro-free, s2.1-pro, 1.4-turbo-free</small>
                  </div>
                  <div style={{ padding: 12, background: 'rgba(0,217,255,0.04)', borderRadius: 4, border: `1px solid ${BORDER}` }}>
                    <strong style={{ color: CY }}>OpenAI TTS</strong> <span style={{ color: TEXT_DIM }}>- Voces: alloy, echo, nova...</span><br />
                    <small style={{ color: TEXT_DIM }}>Modelos: tts-1, tts-1-hd, gpt-4o-mini-tts</small>
                  </div>
                  <div style={{ padding: 12, background: 'rgba(0,217,255,0.04)', borderRadius: 4, border: `1px solid ${BORDER}` }}>
                    <strong style={{ color: CY }}>ElevenLabs</strong> <span style={{ color: TEXT_DIM }}>- Voces ultra-realistas</span><br />
                    <small style={{ color: TEXT_DIM }}>Modelos: multilingual_v2, turbo_v2</small>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* FOLDERS */}
          {activeTab === 'folders' && (
            <div>
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ ...sectionTitle, margin: 0 }}>Carpetas Autorizadas</h3>
                  <button onClick={addFolder} style={btnPrimary}>+ AGREGAR</button>
                </div>
                {folders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: TEXT_DIM, fontFamily: MONO, fontSize: 12 }}>
                    <div style={{ fontSize: 32, marginBottom: 12, color: CY, opacity: 0.3 }}>&#25A3;</div>
                    <p>SIN CARPETAS</p>
                    <small style={{ opacity: 0.7 }}>Agregue carpetas para acceso a archivos</small>
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {folders.map(f => (
                      <li key={f} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 4,
                        marginBottom: 6, fontSize: 11, border: `1px solid ${BORDER}`, fontFamily: MONO,
                      }}>
                        <span style={{ wordBreak: 'break-all', flex: 1, fontSize: 10, color: TEXT }}>{f}</span>
                        <button onClick={() => revokeFolder(f)} style={{
                          background: 'transparent', border: 'none', color: RED, cursor: 'pointer',
                          fontSize: 14, padding: '2px 6px', borderRadius: 2, fontFamily: FONT,
                        }} title="Revocar">&#215;</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* ABOUT */}
          {activeTab === 'about' && (
            <div>
              <section style={{ marginBottom: 24, textAlign: 'center' }}>
                <img src={logoUrl} alt="IA-companion-GS" style={{ width: 150, margin: '0 auto 8px', display: 'block' }} />
                <h2 style={{ margin: '0 0 4px', fontSize: 17, letterSpacing: 2, color: CY, fontFamily: FONT }}>IA-companion-GS</h2>
                <p style={{ margin: 0, color: TEXT_DIM, fontSize: 11, fontFamily: MONO }}>Asistente de escritorio con IA</p>
                <p style={{ margin: '8px 0 0', color: TEXT_DIM, fontSize: 10, fontFamily: MONO, opacity: 0.6 }}>v0.2.0</p>
              </section>
              <section style={{ marginBottom: 24 }}>
                <h3 style={sectionTitle}>Tecnologias</h3>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: TEXT_DIM, lineHeight: 1.8, fontFamily: MONO }}>
                  <li>Electron + React + TypeScript</li>
                  <li>electron-vite build system</li>
                  <li>sql.js (SQLite WASM)</li>
                  <li>Cualquier proveedor compatible OpenAI</li>
                  <li>Streaming de respuestas (SSE)</li>
                  <li>Fish Audio / OpenAI / ElevenLabs TTS</li>
                </ul>
              </section>
              <section>
                <h3 style={sectionTitle}>Enlaces</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a href="https://fish.audio" target="_blank" rel="noopener" style={{ color: CY, textDecoration: 'none', fontSize: 11, fontFamily: MONO }}>Fish Audio &#8594;</a>
                  <a href="https://platform.openai.com/docs/guides/text-to-speech" target="_blank" rel="noopener" style={{ color: CY, textDecoration: 'none', fontSize: 11, fontFamily: MONO }}>OpenAI TTS &#8594;</a>
                  <a href="https://elevenlabs.io/docs" target="_blank" rel="noopener" style={{ color: CY, textDecoration: 'none', fontSize: 11, fontFamily: MONO }}>ElevenLabs &#8594;</a>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
