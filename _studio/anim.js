// NULLIUS brand animation renderer.
// Drives one headless Chrome over the DevTools Protocol (zero deps — Node 24
// has a global WebSocket + fetch), captures deterministic frames via
// window.setFrame(f), then encodes to MP4 with ffmpeg.
//
// Run: node _studio/anim.js

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pexec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCENE = join(__dirname, "anim-scene.html");
const FRAMES = join(__dirname, "frames");
const OUT = join(ROOT, "brand", "nullius-demo.mp4");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333, FPS = 30, W = 1280, H = 720;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error("devtools never came up");
}
async function pageTarget() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) throw new Error("no page target");
  return page.webSocketDebuggerUrl;
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
}

async function main() {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  await mkdir(dirname(OUT), { recursive: true });

  const url = pathToFileURL(SCENE).href;
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--force-device-scale-factor=1", `--window-size=${W},${H}`,
    `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*",
    `--user-data-dir=${join(__dirname, "tmp", "animprofile")}`,
    url,
  ], { stdio: "ignore" });

  try {
    await waitDevtools();
    const wsUrl = await pageTarget();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
    const send = cdp(ws);

    await send("Page.enable");
    await send("Runtime.enable");
    // Force an exact 1280x720 render surface (headless window-size is unreliable).
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    // let fonts settle
    await send("Runtime.evaluate", { expression: "document.fonts.ready.then(()=>1)", awaitPromise: true });
    const total = (await send("Runtime.evaluate", { expression: "window.TOTAL", returnByValue: true })).result.value;

    console.log(`rendering ${total} frames @ ${FPS}fps (${(total / FPS).toFixed(1)}s)…`);
    for (let f = 0; f < total; f++) {
      await send("Runtime.evaluate", { expression: `setFrame(${f})`, returnByValue: true });
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 }, captureBeyondViewport: true });
      await writeFile(join(FRAMES, `f_${String(f).padStart(4, "0")}.png`), Buffer.from(shot.data, "base64"));
      if (f % 30 === 0) process.stdout.write(`  ${f}/${total}\r`);
    }
    ws.close();
    console.log(`\ncaptured ${total} frames`);
  } finally {
    chrome.kill();
  }

  // encode
  console.log("encoding mp4…");
  await pexec("ffmpeg", [
    "-y", "-framerate", String(FPS), "-i", join(FRAMES, "f_%04d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
    "-movflags", "+faststart", OUT,
  ], { maxBuffer: 1 << 26 });

  const n = (await readdir(FRAMES)).length;
  console.log(`✓ ${OUT}  (${n} frames)`);
  await rm(FRAMES, { recursive: true, force: true });
}
main().catch((e) => { console.error(e); process.exit(1); });
