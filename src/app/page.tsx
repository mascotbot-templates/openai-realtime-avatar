"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alignment,
  Fit,
  MascotClient,
  MascotProvider,
  MascotRive,
  OpenAIRealtimeSession,
  useMascotOpenAI,
} from "@mascotbot-sdk/react";
import { OpenAIRealtimeWebSocket } from "@openai/agents-realtime";
import { WavRecorder } from "wavtools";

// Stable config object — must NOT be recreated on every render
// or MascotPlayback gets destroyed and recreated, killing active lip sync
const NATURAL_LIP_SYNC_CONFIG = {
  minVisemeInterval: 40,
  mergeWindow: 60,
  keyVisemePreference: 0.6,
  preserveSilence: true,
  similarityThreshold: 0.4,
  preserveCriticalVisemes: true,
  criticalVisemeMinDuration: 80,
  desktopTransitionDuration: 18,
  mobileTransitionDuration: 22,
} as const;

interface SignedUrlConfig {
  signedUrl: string;
  model: string;
}

async function fetchConfig(): Promise<SignedUrlConfig> {
  const res = await fetch(`/api/get-signed-url-openai?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) throw new Error(`Failed to get signed url: ${res.statusText}`);
  return res.json();
}

function OpenAIRealtimeContent() {
  const [sessionStatus, setSessionStatus] =
    useState<OpenAIRealtimeSession["status"]>("disconnected");
  const [isMuted, setIsMuted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const transportRef = useRef<OpenAIRealtimeWebSocket | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const configRef = useRef<SignedUrlConfig | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize session object to prevent unnecessary re-renders
  const session = useMemo(
    () => ({ status: sessionStatus }),
    [sessionStatus]
  );

  // Core integration hook — intercepts WebSocket and handles lip-sync + audio playback
  const { isIntercepting, messageCount } = useMascotOpenAI({
    session,
    debug: false,
    naturalLipSync: true,
    naturalLipSyncConfig: NATURAL_LIP_SYNC_CONFIG,
  });

  // Pre-fetch and periodically refresh signed URL config (10-min expiry)
  const refreshConfig = useCallback(async () => {
    try {
      configRef.current = await fetchConfig();
    } catch (err) {
      console.error("[OpenAIRealtime] Config fetch failed:", err);
      configRef.current = null;
    }
  }, []);

  useEffect(() => {
    refreshConfig();
    refreshTimerRef.current = setInterval(refreshConfig, 9 * 60 * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [refreshConfig]);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // --- Connection lifecycle ---

  const startConversation = useCallback(async () => {
    try {
      setSessionStatus("connecting");

      const config = configRef.current ?? (await fetchConfig());
      if (!config?.signedUrl) throw new Error("No signed URL");

      // SDK transport → our proxy
      // Use createWebSocket factory so the WebSocket goes through
      // the intercepted window.WebSocket (for mascot lip-sync)
      const transport = new OpenAIRealtimeWebSocket({
        model: config.model,
        apiKey: "proxy",
        useInsecureApiKey: true,
        // Browser WebSocket is used at runtime; cast needed because SDK types expect Node ws
        createWebSocket: async (_options: { url: string; apiKey: string }) =>
          new WebSocket(config.signedUrl) as any,
      });
      transportRef.current = transport;

      transport.on("connection_change", (status) => {
        if (status === "connected") {
          setSessionStatus("connected");
        } else if (status === "disconnected") {
          setSessionStatus("disconnected");
          recorderRef.current?.end().catch(() => {});
          recorderRef.current = null;
          refreshConfig();
        }
      });

      transport.on("error", (err) =>
        console.error("[OpenAIRealtime] SDK error:", err)
      );

      // Config (instructions, voice, VAD) is locked in the ephemeral token
      // created server-side — no session.update needed from the client
      await transport.connect({
        apiKey: "proxy",
      });

      // Mic capture via WavRecorder (24 kHz PCM16 — what OpenAI expects)
      const recorder = new WavRecorder({ sampleRate: 24000 });
      recorderRef.current = recorder;
      await recorder.begin();
      await recorder.record((data) => {
        if (transportRef.current?.status === "connected") {
          transportRef.current.sendAudio(data.mono as any);
        }
      });
    } catch (err) {
      console.error("[OpenAIRealtime] Failed to start:", err);
      setSessionStatus("disconnected");
      refreshConfig();
    }
  }, [refreshConfig]);

  const stopConversation = useCallback(async () => {
    transportRef.current?.close();
    transportRef.current = null;
    await recorderRef.current?.end().catch(() => {});
    recorderRef.current = null;
  }, []);

  const toggleMute = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (isMuted) {
      await recorder.record((data) => {
        if (transportRef.current?.status === "connected") {
          transportRef.current.sendAudio(data.mono as any);
        }
      });
    } else {
      await recorder.pause();
    }
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  const isConnecting = sessionStatus === "connecting";
  const isConnected = sessionStatus === "connected";

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#0d1117] to-[#1a2332] overflow-hidden">
      <div className="h-screen w-full flex items-center justify-center">
        <div className="relative w-full h-full">
          {/* Mascot */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={
              isMobile
                ? {
                    transform: "scale(1.3)",
                    width: "130%",
                    height: "130%",
                    left: "-15%",
                    top: "-15%",
                  }
                : {}
            }
          >
            <MascotRive />
          </div>

          {/* Bottom gradient overlay */}
          <div
            className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(13, 17, 23, 0.9), transparent)",
            }}
          />

          {/* Status indicator */}
          {isIntercepting && (
            <div className="absolute top-4 right-4 text-white/60 text-sm z-20">
              Messages: {messageCount}
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 flex gap-4 z-10">
            {!isConnected ? (
              <button
                onClick={startConversation}
                disabled={isConnecting}
                className="inline-flex items-center justify-center gap-x-2.5 h-16 px-8 text-lg rounded-lg bg-gradient-to-r from-[#10a37f] to-[#0d8c6d] text-white hover:from-[#0d8c6d] hover:to-[#0a755a] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                {isConnecting ? "Connecting..." : "Start Call"}
              </button>
            ) : (
              <>
                <button
                  onClick={stopConversation}
                  className="inline-flex items-center justify-center gap-x-2.5 h-16 px-8 text-lg rounded-lg bg-gradient-to-r from-[#7b68ee] to-[#6a5acd] text-white hover:from-[#6b5dd3] hover:to-[#5a4abd] transition-all shadow-lg"
                >
                  End Call
                </button>
                <button
                  onClick={toggleMute}
                  className={`inline-flex items-center justify-center gap-x-2.5 h-16 px-8 text-lg rounded-lg transition-all shadow-lg ${
                    isMuted
                      ? "bg-gradient-to-r from-[#5dade2] to-[#3498db] text-white hover:from-[#4d9fd2] hover:to-[#2488cb]"
                      : "bg-gradient-to-r from-[#34495e] to-[#2c3e50] text-white hover:from-[#2c3e50] hover:to-[#1c2e40]"
                  }`}
                >
                  {isMuted ? "Unmute" : "Mute"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  // Add your mascot .riv file to the public folder
  // Available with Mascot Bot SDK subscription
  const mascotUrl = "/mascot.riv";

  return (
    <MascotProvider>
      <main className="flex h-svh flex-col bg-[#080808] overflow-hidden">
        <MascotClient
          src={mascotUrl}
          inputs={["is_speaking", "gesture", "character"]}
          layout={{
            fit: Fit.Contain,
            alignment: Alignment.Center,
          }}
        >
          <OpenAIRealtimeContent />
        </MascotClient>
      </main>
    </MascotProvider>
  );
}
