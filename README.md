# OpenAI Realtime Avatar Demo

> Real-time animated avatar with the OpenAI Realtime API (WebRTC) and MascotBot SDK lip sync.

![OpenAI Realtime Avatar Demo](https://mascotbot-app.s3.amazonaws.com/rive-assets/og_images/og_gemini_liveapi.jpg)

## What This Demonstrates

- **Real-time lip sync** — frame-accurate visemes computed locally in the browser from the audio OpenAI already plays
- **WebRTC element-tap** — taps the self-playing agent `<audio>` element cross-browser (works in Safari, which has no `captureStream`)
- **OpenAI Agents SDK** — `@openai/agents-realtime` over the WebRTC transport with zero lip-sync conflicts
- **Ephemeral token security** — system instructions, voice and VAD locked into a single-use `client_secret` server-side
- **Natural mouth movements** — human-like lip sync processing that avoids robotic over-articulation
- **Microphone input** — full-duplex voice conversation with mute/unmute controls

## Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- A MascotBot API key from <https://app.mascot.bot/api-keys>
  - `mascot_dev_…` — works on `localhost` / `127.0.0.1` / `*.localhost` (no billing)
  - `mascot_pub_…` — for your allow-listed production domains
- An [OpenAI API key](https://platform.openai.com/api-keys) with Realtime API access

## SDK install (private npm registry)

The MascotBot lipsync SDK ships from the private registry `https://npm.mascot.bot/`. A `.npmrc` is already committed; it reads the token from the `MASCOT_NPM_TOKEN` environment variable, so no secret is checked in.

Before installing, export the **same** `mascot_` key you use as the lipsync license key:

```bash
export MASCOT_NPM_TOKEN=mascot_dev_xxxxxxxxxxxxxx
```

There is no `.tgz` to download and no manual SDK step — `pnpm install` pulls `@mascotbot/core` and `@mascotbot/react` from the registry.

## Avatars

The Rive avatar file is **auto-downloaded** from the public, no-auth MascotBot Avatars API by `scripts/fetch-avatars.mjs`, which runs automatically on `predev` and `prebuild`. You do **not** supply any paid `.riv` file.

This template uses the `notion-guy` avatar (artboard `Character`, state machine `InLesson`). The downloaded `.riv` lands in `public/` and stays gitignored.

## Quick Start

```bash
# 1. Clone this repository, then:
export MASCOT_NPM_TOKEN=mascot_dev_xxxxxxxxxxxxxx   # same as your lipsync key
cp .env.example .env.local                          # then fill in real keys
pnpm install
pnpm dev
```

`pnpm dev` fetches the avatar, then starts Next.js. Open <http://localhost:3000>.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmascotbot-templates%2Fopenai-realtime-avatar&env=NEXT_PUBLIC_MASCOT_KEY,OPENAI_API_KEY,MASCOT_NPM_TOKEN&envDescription=MascotBot%20lipsync%20key%2C%20OpenAI%20API%20key%2C%20and%20the%20private-registry%20install%20token&envLink=https%3A%2F%2Fdocs.mascot.bot&project-name=openai-realtime-avatar&repository-name=openai-realtime-avatar)

> On Vercel, set `MASCOT_NPM_TOKEN` as a build-time environment variable so `pnpm install` can authenticate to the private registry.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_MASCOT_KEY` | Browser-safe MascotBot license key (`mascot_dev_…` / `mascot_pub_…`) passed to `<MascotProvider>` | Yes |
| `OPENAI_API_KEY` | OpenAI API key — server-side only, used to mint the Realtime `client_secret` | Yes |
| `MASCOT_NPM_TOKEN` | Same `mascot_` key, used only by `pnpm install` for the private registry | Install only |

## Architecture

```
Browser (Client)
├── providers.tsx — <MascotProvider> (single licensed inference client)
└── page.tsx — avatar + controls
    ├── @openai/agents-realtime — RealtimeSession over the WebRTC transport
    │   └── self-plays the agent voice through an <audio> element we supply
    ├── createElementTap() — cross-browser tap of that <audio> element
    ├── useMascotPlayback + useLipsyncStream — local viseme inference
    └── MascotRive — Rive avatar renderer (WebGL2)

Server
└── /api/openai/token — POST → https://api.openai.com/v1/realtime/client_secrets
    (mints a single-use ephemeral client_secret; locks model/voice/VAD/instructions)
```

### How It Works

There is **no MascotBot proxy** in this path. OpenAI Realtime over WebRTC
self-plays the agent voice through an `<audio>` element. We supply our own
element to the WebRTC transport, then tap it with the SDK's cross-browser
`createElementTap()`. The 0.2.x SDK computes visemes locally from that tapped
stream — the audio is never sent anywhere else and the standing
`OPENAI_API_KEY` never reaches the browser.

> WebRTC self-plays and is tapped directly. Never route it through
> `createPCMStreamPlayer` (that is for the WebSocket transport only and would
> double-play the voice).

## Customization

### System Instruction & Voice

Edit the constants in `src/app/api/openai/token/route.ts`:

```typescript
const MODEL = "gpt-realtime";
const VOICE = "marin";          // OpenAI built-in voice
const INSTRUCTIONS = "Your custom system prompt here...";
```

Available voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`.

### Lip Sync Settings

Adjust the `NATURAL_LIP_SYNC_CONFIG` constant in `src/app/page.tsx` (it
**must** stay a stable module constant — a fresh object every render
reinitializes the post-processor and breaks lip sync):

```typescript
const NATURAL_LIP_SYNC_CONFIG = {
  minVisemeInterval: 60,         // ms between visemes
  mergeWindow: 80,               // merge similar shapes within window
  keyVisemePreference: 0.7,      // preference for distinctive shapes (0-1)
  preserveSilence: true,         // keep silence visemes
  similarityThreshold: 0.6,      // merge threshold (0-1)
  preserveCriticalVisemes: true, // never skip important shapes
} as const;
```

### Using Your Own Avatar

The avatar is fetched by `scripts/fetch-avatars.mjs`. Change the `id` /
`out` there, or point `<Mascot src>` in `src/app/page.tsx` at your
own `.riv`. Pass the matching `artboard` + `stateMachine` (the bundled
`notion-guy` uses artboard `Character` + state machine `InLesson`).

## Important Notes

- **Single-use tokens.** Each call mints a fresh `client_secret`; it is
  consumed on connect.
- **VAD.** Server-side Voice Activity Detection is locked into the token —
  the model detects turn boundaries automatically.
- **Audio.** WebRTC self-plays the agent voice; the SDK only taps it for
  viseme inference. The microphone is handled by the WebRTC transport.

## Links

- [MascotBot Documentation](https://docs.mascot.bot)
- [OpenAI Realtime API Guide](https://platform.openai.com/docs/guides/realtime)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [Support](mailto:support@mascot.bot)

## License

MIT License. See [LICENSE](./LICENSE).
