/**
 * Mint a short-lived, single-use OpenAI Realtime `client_secret`.
 *
 * New-architecture note: there is NO MascotBot endpoint in this path.
 * The legacy template proxied through api.mascot.bot so the server could
 * inject visemes into the audio stream. The 0.2.x SDK computes visemes
 * locally in the browser from the audio OpenAI already plays over WebRTC,
 * so the server only mints the ephemeral token. The standing
 * OPENAI_API_KEY never reaches the browser.
 *
 * Client secrets are short-lived / single-use — mint a fresh one per
 * session. System instructions, voice and VAD are locked into the token
 * here so the client can neither see nor modify them.
 *
 * Env: OPENAI_API_KEY.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gpt-realtime";
const VOICE = "marin";
const INSTRUCTIONS =
  "You are a friendly assistant. Keep responses brief and conversational. Start by greeting the user when the conversation starts.";

export async function POST() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ error: "OPENAI_API_KEY not set" }, { status: 400 });
  }

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: MODEL,
        instructions: INSTRUCTIONS,
        output_modalities: ["audio"],
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
          output: { voice: VOICE },
        },
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("OpenAI client_secrets failed:", res.status, detail);
    return Response.json(
      { error: `OpenAI ${res.status}`, detail: detail.slice(0, 500) },
      { status: 502 },
    );
  }

  const json = (await res.json()) as { value: string };
  return Response.json({ clientSecret: json.value, model: MODEL });
}
