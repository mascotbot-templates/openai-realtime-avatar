"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useMascot,
  createElementTap,
  type ElementTap,
} from "@mascotbot/react";
import {
  Alignment,
  Fit,
  Mascot,
  MascotRive,
  useMascotPlayback,
  useLipsyncStream,
} from "@mascotbot/react/rive";

type CallState = "disconnected" | "connecting" | "connected";

/**
 * Natural-lip-sync preset — a STABLE module constant. A fresh object every
 * render reinitializes the post-processor and breaks lip sync after the
 * first audio chunk (the single most common integration bug).
 */
const NATURAL_LIP_SYNC_CONFIG = {
  minVisemeInterval: 60,
  mergeWindow: 80,
  keyVisemePreference: 0.7,
  preserveSilence: true,
  similarityThreshold: 0.6,
  preserveCriticalVisemes: true,
} as const;

/** Minimal shape of the dynamically-imported @openai/agents-realtime session. */
interface RealtimeSessionLike {
  close: () => void;
  mute: (muted: boolean) => void;
}

function OpenAIRealtimeContent() {
  // ── Co-located lip-sync pipeline (the demo's RealtimePanel shape) ──
  // OpenAI Realtime over WebRTC self-plays the agent voice through an
  // <audio> element we supply. We tap that element cross-browser with
  // createElementTap(); the SDK computes visemes locally from the tapped
  // stream. WebRTC self-plays — never route it through
  // createPCMStreamPlayer (that is WebSocket-only and double-plays voice).
  const { client, status } = useMascot();
  const playback = useMascotPlayback({
    stream: true,
    enableNaturalLipSync: true,
    naturalLipSyncConfig: NATURAL_LIP_SYNC_CONFIG,
  });
  const [stream, setStream] = useState<MediaStream | null>(null);
  useLipsyncStream({
    client,
    playback,
    source: { kind: "mediaStream", stream },
  });

  const [callState, setCallState] = useState<CallState>("disconnected");
  const [isMuted, setIsMuted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const sessionRef = useRef<RealtimeSessionLike | null>(null);
  const elTapRef = useRef<ElementTap | null>(null);
  const teardownRef = useRef<null | (() => void)>(null);

  // Mobile detection (scales the avatar to fill small viewports)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Full teardown — runs on every end path ──
  const teardown = useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;
    elTapRef.current?.close();
    elTapRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {
      /* already closed */
    }
    sessionRef.current = null;
    setStream(null); // detaches the worklet from the shared client
  }, []);

  // Stabilise the unmount cleanup (see react-website-demo bug: teardown
  // identity can flip per render and re-fire endSession mid-call).
  const teardownActionRef = useRef(teardown);
  teardownActionRef.current = teardown;
  useEffect(() => () => teardownActionRef.current?.(), []);

  const startConversation = useCallback(async () => {
    if (status !== "ready" || callState !== "disconnected") return;
    try {
      setCallState("connecting");

      // 1. SYNCHRONOUSLY in the click, before any await: create the tap
      //    (AudioContext born running so it isn't auto-suspended).
      const tap = createElementTap();
      elTapRef.current = tap;
      setStream(tap.stream);

      // 2. Mint a fresh single-use client secret server-side. The standing
      //    OPENAI_API_KEY never reaches the browser.
      const tokenRes = await fetch("/api/openai/token", {
        method: "POST",
        cache: "no-store",
      });
      if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
      const { clientSecret } = (await tokenRes.json()) as {
        clientSecret: string;
      };
      if (!clientSecret) throw new Error("client secret missing");

      // 3. Build the WebRTC session. We supply our own <audio> element so
      //    createElementTap() can tap the self-played agent voice. In
      //    @openai/agents-realtime 0.4.x audioElement is a WebRTC
      //    transport option, so construct the transport explicitly.
      const { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } =
        await import("@openai/agents-realtime");

      const audioEl = new Audio();
      audioEl.autoplay = true;

      const agent = new RealtimeAgent({
        name: "Assistant",
        instructions: "Keep replies short and conversational.",
      });
      const transport = new OpenAIRealtimeWebRTC({ audioElement: audioEl });
      const session = new RealtimeSession(agent, { transport });

      session.on("error", (err: unknown) =>
        console.error("[OpenAIRealtime] session error:", err),
      );

      await session.connect({ apiKey: clientSecret });
      sessionRef.current = session as unknown as RealtimeSessionLike;

      // 4. Tap the self-playing element cross-browser (Safari has no
      //    captureStream). tap.stream is stable + silent until attach.
      tap.attach(audioEl);
      tap.resume();

      teardownRef.current = () => {
        audioEl.pause();
        audioEl.srcObject = null;
      };

      setCallState("connected");
    } catch (error) {
      console.error("[OpenAIRealtime] Failed to start:", error);
      teardown();
      setCallState("disconnected");
    }
  }, [status, callState, teardown]);

  const stopConversation = useCallback(() => {
    teardown();
    setIsMuted(false);
    setCallState("disconnected");
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const next = !isMuted;
    try {
      session.mute(next);
    } catch (e) {
      console.error("[OpenAIRealtime] mute failed:", e);
      return;
    }
    setIsMuted(next);
  }, [isMuted]);

  const isConnecting = callState === "connecting";
  const isConnected = callState === "connected";
  const sdkLoading = status !== "ready";

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
          {isConnected && (
            <div className="absolute top-4 right-4 text-white/60 text-sm z-20">
              {stream ? "lip-sync attached" : "connected"}
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 flex gap-4 z-10">
            {!isConnected ? (
              <button
                onClick={startConversation}
                disabled={isConnecting || sdkLoading}
                className="inline-flex items-center justify-center gap-x-2.5 h-16 px-8 text-lg rounded-lg bg-gradient-to-r from-[#10a37f] to-[#0d8c6d] text-white hover:from-[#0d8c6d] hover:to-[#0a755a] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                {sdkLoading
                  ? "Loading SDK…"
                  : isConnecting
                    ? "Connecting..."
                    : "Start Call"}
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
  // The notion-guy avatar is auto-downloaded to /public by the
  // fetch-avatars script (predev / prebuild). It uses the "Character"
  // artboard + the "InLesson" state machine.
  return (
          <main className="flex h-svh flex-col bg-[#080808] overflow-hidden">
        <Mascot
          src="/mascot.riv"
          artboard="Character"
          stateMachine="InLesson"
          layout={{
            fit: Fit.Contain,
            alignment: Alignment.Center,
          }}
        >
          <OpenAIRealtimeContent />
        </Mascot>
      </main>
  );
}
