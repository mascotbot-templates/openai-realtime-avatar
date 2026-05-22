// Download the ready-made MascotBot avatar this template renders from the
// public Avatars API (no auth) into ./public. Pinned, immutable versions —
// safe to cache forever. Runs automatically via `predev` / `prebuild`.
//
// Docs: https://docs.mascot.bot  ·  API: https://license.mascot.bot/v1/avatars
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.MASCOT_AVATARS_API || "https://license.mascot.bot";
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// id @ pinned version → filename referenced by src/app/page.tsx.
// notion-guy uses artboard "Character" + state machine "InLesson".
const AVATARS = [{ id: "notion-guy", version: "1.0.0", out: "mascot.riv" }];

async function exists(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

async function fetchOne({ id, version, out }) {
  const dest = join(PUBLIC, out);
  if (await exists(dest)) {
    console.log(`✓ ${out} (cached)`);
    return;
  }
  const url = `${API}/v1/avatars/${id}/download?version=${version}`;
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${id}@${version}: HTTP ${res.status}`);
  }
  await mkdir(PUBLIC, { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`✓ ${out}  ←  ${id}@${res.headers.get("x-avatar-version") || version}`);
}

try {
  await Promise.all(AVATARS.map(fetchOne));
  console.log("All avatars ready in ./public");
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  console.error("  The Avatars API is public; check your network and retry.");
  process.exit(1);
}
