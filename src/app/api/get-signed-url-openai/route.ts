import { NextResponse } from "next/server";

// OpenAI Realtime API configuration — locked into ephemeral token server-side.
// The client cannot see or modify these values.
const OPENAI_CONFIG = {
  model: "gpt-realtime",
  voice: "marin",
  systemMessage:
    "You are a friendly assistant. Keep responses brief and conversational. Start by greeting the user when conversation starts.",
};

export async function GET() {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const mascotBotApiKey = process.env.MASCOT_BOT_API_KEY;
    if (!mascotBotApiKey) {
      return NextResponse.json(
        { error: "Mascot Bot API key not configured" },
        { status: 500 }
      );
    }

    // 1. Create OpenAI ephemeral token with locked config (instructions, voice, model)
    // This keeps system instructions server-side — client only gets the token
    const tokenResponse = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: OPENAI_CONFIG.model,
            instructions: OPENAI_CONFIG.systemMessage,
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
              output: {
                voice: OPENAI_CONFIG.voice,
              },
            },
          },
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Failed to create ephemeral token:", errorText);
      throw new Error(`Failed to create ephemeral token: ${errorText}`);
    }

    const clientSecret = await tokenResponse.json();

    // 2. Get Mascot Bot proxy signed URL (wraps the OpenAI ephemeral token)
    const response = await fetch("https://api.mascot.bot/v1/get-signed-url", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mascotBotApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        config: {
          provider: "openai",
          provider_config: {
            ephemeral_token: clientSecret.value,
            model: OPENAI_CONFIG.model,
            voice: OPENAI_CONFIG.voice,
          },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to get signed URL:", errorText);
      throw new Error("Failed to get signed URL");
    }

    const data = await response.json();

    // 3. Return connection info — config is NOT exposed to the client
    return NextResponse.json({
      signedUrl: data.signed_url,
      model: OPENAI_CONFIG.model,
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
