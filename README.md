# IA-companion-GS

Asistente de escritorio con IA (Electron + React) para Windows: burbuja flotante siempre visible, chat con streaming, voz (TTS), dictado por voz, adjuntos multimodales y **compatibilidad con cualquier proveedor de modelos** (no depende de un único gateway).

![IA-companion-GS](build/new-project.png)

## Características

- 💬 **Chat con streaming** — las respuestas aparecen en tiempo real (SSE compatible OpenAI).
- 🌐 **Cualquier proveedor** — presets listos: OmniRoute/OpenClaw local, OpenRouter, OpenAI, Anthropic, Groq, DeepSeek, Gemini, Ollama y LM Studio. También endpoints personalizados.
- 🖼️ **Adjuntos multimodales** — imágenes (modelos con visión) y archivos de texto (txt/md/json/csv/log…) se envían al modelo.
- 🔊 **TTS multi-proveedor** — Fish Audio, OpenAI TTS y ElevenLabs, con auto-voz opcional.
- 🎙️ **Dictado por voz** — reconocimiento de voz integrado (es-AR, continua).
- 🧲 **Burbuja flotante + bandeja del sistema** — vive en segundo plano; cierre de ventana ≠ cierre de la app.
- ⌨️ **Atajo global** — `Ctrl+Alt+J` invoca / oculta el asistente desde cualquier parte.
- 🗂️ **Historial persistente** — la conversación sobrevive reinicios (SQLite); botón para limpiar.
- 🔒 **Permisos de carpetas** — la lectura de archivos solo se permite en carpetas que autorizás explícitamente.
- 🧠 **Personalidad editable** — prompt de sistema configurable desde Ajustes.

## Requisitos

- **Node.js ≥ 20** (LTS recomendado)
- **npm** (o pnpm)
- Una API key de alguno de los proveedores compatibles (o un gateway/modelo local)

## Instalación

```bash
# 1. Abrí la carpeta del proyecto
cd ia-companion-gs

# 2. Instalá dependencias
npm install

# 3. Configurá (opcional en desarrollo: todo se puede configurar desde la UI)
cp .env.example .env
# Edita .env con tus claves

# 4. Desarrollo (hot-reload)
npm run dev

# 5. Build de producción
npm run build
npm start   # ejecuta el build de dist/
```

## Proveedores de modelo

El asistente habla con **cualquier endpoint compatible con la API de chat de OpenAI**. En *Ajustes › Sistema › Proveedor de modelo* elegís el preset y completa URL + API key + modelo:

| Proveedor | URL | Ejemplo de modelo |
|-----------|-----|-------------------|
| OmniRoute (local) | `http://localhost:20128/v1` | `omniroute/default` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-5` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.2` |
| LM Studio (local) | `http://localhost:1234/v1` | nombre del modelo cargado |
| Personalizado | tu URL | tu modelo |

El botón **CONECTAR** hace una verificación real: si la URL, la key o el modelo no son válidos, te muestra el error exacto del proveedor.

También podés configurar por `.env` (se usan como valores por defecto):

```bash
LLM_URL=https://openrouter.ai/api/v1   # o OMNIROUTE_URL (compatibilidad)
LLM_API_KEY=sk-...                      # o OMNIROUTE_API_KEY
LLM_MODEL=vendor/modelo                 # o OMNIROUTE_MODEL
```

## Variables de entorno (`.env`)

| Variable | Descripción |
|----------|-------------|
| `LLM_URL` / `OMNIROUTE_URL` | URL del proveedor (compat. OpenAI). |
| `LLM_API_KEY` / `OMNIROUTE_API_KEY` | API key del proveedor. |
| `LLM_MODEL` / `OMNIROUTE_MODEL` | Modelo a usar. |
| `FISH_API_KEY` | API key de Fish Audio (TTS). |
| `FISH_REFERENCE_ID` | ID de voz clonada en Fish Audio (opcional). |
| `FISH_MODEL` | Modelo de Fish Audio (default `s2.1-pro-free`). |
| `OPENAI_API_KEY` | API key de OpenAI (TTS). |
| `ELEVENLABS_API_KEY` | API key de ElevenLabs (TTS). |

Todo esto también se configura desde la ventana de Ajustes (⚙) y se guarda en SQLite local.

## Scripts disponibles

| Script | Qué hace |
|--------|----------|
| `npm run dev` | Electron + Vite en modo desarrollo (hot-reload). |
| `npm run build` | Compila main, preload y renderer a `dist/`. |
| `npm start` | Ejecuta el build de producción (`electron .`). |
| `npm run preview` | Previsualización del build. |
| `npm run type-check` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm run test` | Vitest. |

## Uso

- **Burbuja**: clic sobre la burbuja flotante (abajo a la derecha) abre el chat.
- **Atajo**: `Ctrl+Alt+J` muestra/oculta el asistente.
- **Bandeja**: ícono en la bandeja del sistema con "Mostrar / ocultar" y "Salir".
- **Escape**: cierra el panel del chat (la app sigue en la bandeja).
- **Adjuntar**: 📎 en el composer; las imágenes van al modelo como visión, los textos se inyectan al prompt.
- **Dictado**: botón ♪ (requiere soporte de reconocimiento de voz en el sistema).
- **Ajustes (⚙)**: proveedor de modelo, personalidad, TTS, carpetas autorizadas.

## Estructura del proyecto

```
ia-companion-gs/
├── build/                      # Logo e íconos (icon.png / icon.ico / ia-logo-full.png)
├── src/
│   ├── main/                   # Proceso principal (Electron)
│   │   ├── index.ts            # Entry point, instancia única, tray, atajo global
│   │   ├── window-manager.ts   # Ventana burbuja flotante
│   │   ├── model-client.ts     # Cliente LLM (OpenAI-compatible, streaming SSE)
│   │   ├── tts-providers.ts    # Registry TTS (Fish/OpenAI/ElevenLabs)
│   │   ├── ipc-handlers.ts     # Puente main ↔ renderer, chat, historial, archivos
│   │   ├── file-permissions.ts # Autorización de carpetas
│   │   ├── db.ts               # SQLite (sql.js) ajustes + historial
│   │   └── tray.ts             # Bandeja del sistema
│   ├── preload/
│   │   └── index.ts            # contextBridge seguro
│   └── renderer/               # UI React + Vite
│       ├── assets/             # Logo (logo.png / icon-mark.png)
│       ├── bubble/             # Burbuja flotante clickeable
│       ├── chat/               # Ventana de chat
│       ├── image-viewer/       # Visor de adjuntos
│       └── settings/           # Ajustes (proveedor, voz, datos, info)
└── docs/
```

## Seguridad

- `contextIsolation: true`, `nodeIntegration: false` y preload mínimo vía `contextBridge`.
- **CSP** configurada en el renderer.
- La API key y los ajustes se guardan en SQLite en `%APPDATA%/ia-companion-gs/` (no en el repo).
- La lectura de archivos del disco exige carpetas autorizadas por el usuario.
- Instancia única (`requestSingleInstanceLock`): no se abren dos copias.

## Licencia

MIT — Úsalo, modifícalo y compártelo libremente.
