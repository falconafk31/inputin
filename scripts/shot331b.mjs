// Screenshot verifikasi v3.3.1 dari PREVIEW (pola CDP + Fetch intercept seperti gen-pdf30).
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const PORT = 9341;
const chrome = spawn(process.env.CHROME_BIN || "/home/hatch/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome", ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${PORT}`, "--window-size=430,932", "about:blank"], { stdio: "ignore" });
try {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets && targets.length) break; } catch {} await wait(400); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  let mid = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errs.push("EXC: " + (m.params.exceptionDetails.exception?.description || "").slice(0, 140)); };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const id = ++mid; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Fetch.enable", { patterns: [{ urlPattern: ORIGIN + "/*", requestStage: "Request" }] });
  ws.addEventListener("message", async (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params;
    try {
      const r = await fetch(request.url, { method: request.method, headers: request.headers, body: request.postData || undefined, redirect: "manual" });
      const buf = Buffer.from(await r.arrayBuffer());
      const rh = {}; r.headers.forEach((v, k) => { if (!["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())) rh[k] = v; });
      await send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: Object.entries(rh).map(([name, value]) => ({ name, value })), body: buf.toString("base64") });
    } catch (e) { await send("Fetch.failRequest", { requestId, errorReason: "Failed" }); }
  });
  const ev2 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error"); return r.result?.result?.value; };
  const shot = async (nama) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync("/tmp/" + nama, Buffer.from(r.result.data, "base64")); };
  await send("Page.navigate", { url: ORIGIN + "/" });
  await wait(3000);
  const b64 = Buffer.from(JSON.stringify({ username: "admin", password: PASS })).toString("base64");
  const loginRes = await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`);
  if (loginRes !== 200) throw new Error("login gagal: " + loginRes);
  await ev2("location.reload(); 'ok'");
  await wait(3500);
  await ev2("[...document.querySelectorAll('.bottomnav button')][1].click(); 'ok'");
  await wait(2200);
  await shot("shot-riwayat.png");
  const riwTeks = await ev2("document.body.innerText.slice(0,300)");
  await ev2("[...document.querySelectorAll('.bottomnav button')][3].click(); 'ok'");
  await wait(2200);
  await shot("shot-admin.png");
  await ev2("[...document.querySelectorAll('.bottomnav button')][2].click(); 'ok'");
  await wait(2200);
  await shot("shot-laporan.png");
  await ev2("[...document.querySelectorAll('.bottomnav button')][0].click(); 'ok'");
  await wait(1800);
  await shot("shot-input.png");
  const admTeks = await ev2("document.body.innerText.slice(0,300)");
  console.log("RIWAYAT:", riwTeks.replace(/\n/g, " | ").slice(0, 220));
  console.log("ADMIN:", admTeks.replace(/\n/g, " | ").slice(0, 220));
  console.log("errors:", errs.length ? errs.join(" ;; ") : "tidak ada");
  ws.close();
} finally { chrome.kill("SIGKILL"); }
