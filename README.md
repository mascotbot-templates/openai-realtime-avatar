# OpenAI Realtime Avatar Demo

> Real-time animated avatar with OpenAI Realtime API and Mascot Bot SDK lip sync.

![OpenAI Realtime Avatar Demo](https://mascotbot-app.s3.amazonaws.com/rive-assets/og_images/og_gemini_liveapi.jpg)

## What This Demonstrates

- **Real-time lip sync** — frame-accurate viseme synchronization with OpenAI audio responses
- **OpenAI Agents SDK compatibility** — works alongside `@openai/agents-realtime` with zero conflicts
- **Ephemeral token security** — system instructions and voice config locked server-side
- **Natural mouth movements** — human-like lip sync processing that avoids robotic over-articulation
- **Token pre-fetching** — instant connection when users click "Start Call"
- **Microphone input** — full-duplex voice conversation with mute/unmute controls

## Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- [Mascot Bot SDK subscription](https://app.mascot.bot) (for `.tgz` package and `.riv` file)
- [OpenAI API key](https://platform.openai.com/api-keys) (with Realtime API access)

## Quick Start

1. Clone this repository
2. Add the required private files (see below)
3. Configure environment variables
4. Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the demo.

## Private Files You Need

### Mascot Bot SDK

- **File:** `mascotbot-sdk-react-X.X.X.tgz`
- **Where:** project root
- **How to get:** download from your [Mascot Bot dashboard](https://app.mascot.bot) after subscribing

```bash
cp /path/to/mascotbot-sdk-react-X.X.X.tgz ./
pnpm install
```

### Rive Animation File

- **File:** `mascot.riv`
- **Where:** `public/`
- **How to get:** provided with your Mascot Bot SDK subscription
- **Requirements:** must have `is_speaking` (Boolean), `gesture` (Trigger), and `character` inputs

```bash
cp /path/to/mascot.riv ./public/
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

| Variable | Description | Required |
|----------|-------------|----------|
| `MASCOT_BOT_API_KEY` | Mascot Bot API key (from [app.mascot.bot](https://app.mascot.bot)) | Yes |
| `OPENAI_API_KEY` | OpenAI API key (from [platform.openai.com](https://platform.openai.com/api-keys)) | Yes |

## Architecture

```
Browser (Client)
├── page.tsx — Main component with avatar + controls
│   ├── @openai/agents-realtime SDK — OpenAI Realtime API connection
│   ├── WavRecorder — 24kHz PCM16 microphone capture
│   ├── useMascotOpenAI() — SDK hook for lip sync + audio playback
│   └── MascotRive — Rive animation renderer (WebGL2)
│
└── /api/get-signed-url-openai — Backend route
    ├── Creates OpenAI ephemeral token (locks config server-side)
    └── Calls api.mascot.bot/v1/get-signed-url
        (wraps token and injects visemes into WebSocket stream)
```

### How It Works

The integration uses the `@openai/agents-realtime` SDK with a custom `createWebSocket` factory. Your code uses the SDK for connection management and audio sending. The factory creates a WebSocket pointing to `api.mascot.bot` instead of OpenAI directly. The proxy transparently forwards all OpenAI traffic while injecting viseme data for lip sync.

**Do not connect directly to OpenAI** — the avatar lip-sync requires viseme data that only the Mascot Bot proxy provides.

## Customization

### System Instruction & Voice

Edit the config in `src/app/api/get-signed-url-openai/route.ts`:

```typescript
const OPENAI_CONFIG = {
  model: "gpt-realtime",
  voice: "marin",              // OpenAI built-in voice
  systemMessage: "Your custom system prompt here...",
};
```

Available voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`.

### Lip Sync Settings

Adjust the `NATURAL_LIP_SYNC_CONFIG` constant in `src/app/page.tsx`:

```typescript
const NATURAL_LIP_SYNC_CONFIG = {
  minVisemeInterval: 40,        // ms between visemes
  mergeWindow: 60,              // merge similar shapes within window
  keyVisemePreference: 0.6,     // preference for distinctive shapes (0-1)
  preserveSilence: true,        // keep silence visemes
  similarityThreshold: 0.4,     // merge threshold (0-1)
  preserveCriticalVisemes: true, // never skip important shapes
  criticalVisemeMinDuration: 80, // min duration for critical visemes (ms)
} as const;
```

### Using Your Own Avatar

Update the `.riv` file path in `src/app/page.tsx`:

```typescript
const mascotUrl = "/mascot.riv"; // or a CDN URL
```

## Important Notes

- **Session limit:** OpenAI Realtime API has a 60-minute session limit per connection. After that, the WebSocket closes automatically and the user can reconnect.
- **Ephemeral tokens are single-use.** After a call ends, the cached token is consumed. The app automatically pre-fetches a fresh token on disconnect.
- **Audio:** The `useMascotOpenAI` hook handles audio playback automatically at 24kHz. Microphone input is captured at 24kHz PCM16 via `WavRecorder`.
- **VAD:** Server-side Voice Activity Detection is configured in the ephemeral token. The model detects when the user starts/stops speaking automatically.

## Links

- [Mascot Bot Documentation](https://docs.mascot.bot)
- [OpenAI Realtime API Guide](https://platform.openai.com/docs/guides/realtime)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [Support](mailto:support@mascot.bot)

## License

MIT License. See [LICENSE](./LICENSE).
