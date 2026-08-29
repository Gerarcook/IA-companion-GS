# ClawGS Companion

Aplicación de escritorio (Electron + React + Vite) que actúa como cliente del **Gateway de OpenClaw**.

## Características
- 🌐 Conexión WebSocket al Gateway de OpenClaw.
- 💬 Burbuja flotante + ventana de chat completa.
- 🔊 TTS automático con **Fish.audio** (voz configurable).
- 📁 Gestor de permisos de carpetas (diálogo nativo + SQLite).
- 🖼️ Visor de imágenes integrado.
- ⚙️ Ventana de configuración (token, API keys, carpetas).

## Requisitos
- **Node.js ≥ 24** (LTS recomendado)
- **npm** (o pnpm/yarn)
- Cuenta en [OpenClaw](https://openclaw.ai) → token de Gateway
- Cuenta en [Fish.audio](https://fish.audio) → API Key y Reference ID (opcional, para TTS)

## Instalación
```bash
# 1. Clona / abre la carpeta del proyecto
cd C:\Users\Administrator\clawgs-wc

# 2. Instala dependencias
npm install

# 3. Copia el archivo de entorno y edita tus claves
cp .env.example .env
# Edita .env con tu editor favorito y completa:
# OPENCLAW_TOKEN=...
# FISH_API_KEY=...
# FISH_REFERENCE_ID=...

# 4. Desarrollo (hot-reload)
npm run dev

# 5. Build de producción
npm run build
```

## Estructura del proyecto
```
clawgs-wc/
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── .env.example
├── src/
│   ├── main/                 # Proceso principal (Electron)
│   │   ├── index.ts          # Entry point
│   │   ├── window-manager.ts # Burbuja flotante
│   │   ├── openclaw-client.ts# Cliente WebSocket
│   │   ├── tts-engine.ts     # Motor TTS (Fish.audio)
│   │   ├── file-permissions.ts
│   │   ├── db.ts             # SQLite (better-sqlite3)
│   │   └── ipc-handlers.ts   # Puente main ↔ renderer
│   ├── preload/
│   │   └── index.ts          # contextBridge seguro
│   └── renderer/             # UI React + Vite
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── bubble/
│       ├── chat/
│       ├── image-viewer/
│       └── settings/
├── assets/voices/            # Voces locales (fallback)
└── docs/README.md
```

## Variables de entorno (`.env`)
| Variable | Descripción |
|----------|-------------|
| `OPENCLAW_TOKEN` | Token del Gateway de OpenClaw (obligatorio). |
| `FISH_API_KEY` | API Key de Fish.audio (para TTS). |
| `FISH_REFERENCE_ID` | ID de voz de Fish.audio (opcional). |

## Scripts disponibles
| Script | Qué hace |
|--------|----------|
| `npm run dev` | Inicia Vite + Electron en modo desarrollo. |
| `npm run build` | Compila para producción (carpeta `dist/`). |
| `npm run preview` | Previsualiza el build de producción. |
| `npm run lint` | ESLint sobre todo el código. |
| `npm run type-check` | `tsc --noEmit`. |
| `npm run test` | Ejecuta tests con Vitest. |

## Seguridad
- `contextIsolation: true` y `nodeIntegration: false` en todas las ventanas.
- El preload expone **solo** la API necesaria vía `contextBridge`.
- El token del gateway se guarda en SQLite (carpeta `userData`) y **no** en el repositorio.

## Licencia
MIT – Úsalo, modifícalo y compártelo libremente.