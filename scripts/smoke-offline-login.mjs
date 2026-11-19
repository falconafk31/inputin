// Smoke login offline v3.8.1 di PREVIEW: sesi tersimpan di localStorage.
// 1) Login lewat UI menyimpan sesi + bootstrap lokal.
// 2) /api/me + /api/bootstrap diblokir (simulasi offline) lalu reload:
//    aplikasi langsung masuk TANPA form login.
// 3) /api/me dijawab 401 lalu reload: sesi lokal dihapus, form login tampil.
// 4) Tanpa sesi tersimpan + API diblokir: form login tampil (benar).
// 5) Mode normal: /api/me berhasil, aplikasi masuk dan sesi tersimpan lagi.
// Tidak mengubah data server apa pun (hanya login).
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, !!ok]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };

const PORT = 9338;
const chrome = spawn(process.env.CHROME_BIN || "/home/hatch/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome", ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${PORT}`, "--window-size=430,900", "about:blank"], { stdio: "ignore" });
let mode = "pass"; // pass | blockApi | block401
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
    const isAuth = request.url.includes("/api/me") || request.url.includes("/api/bootstrap");
    try {
      if (mode === "blockApi" && isAuth) { await send("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" }); return; }
      if (mode === "block401" && request.url.includes("/api/me")) {
        const body = Buffer.from(JSON.stringify({ ok: false, error: "Sesi tidak valid." })).toString("base64");
        await send("Fetch.fulfillRequest", { requestId, responseCode: 401, responseHeaders: [{ name: "content-type", value: "application/json" }], body });
        return;
      }
      let postData = request.postData;
      if (!postData && request.method === "POST") { try { const g = await send("Fetch.getRequestPostData", { requestId }); postData = g.postData; } catch {} }
      const r = await fetch(request.url, { method: request.method, headers: request.headers, body: postData || undefined, redirect: "manual" });
      const buf = Buffer.from(await r.arrayBuffer());
      const rh = {}; r.headers.forEach((v, k) => { if (!["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())) rh[k] = v; });
      await send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: Object.entries(rh).map(([name, value]) => ({ name, value })), body: buf.toString("base64") });
    } catch (e) { await send("Fetch.failRequest", { requestId, errorReason: "Failed" }); }
  });
  const ev2 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error"); return r.result?.result?.value; };
  const tunggu = async (sel, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev2(`!!document.querySelector("${sel}")`)) return true; await wait(200); } throw new Error("tunggu timeout: " + sel); };
  const set = (sel, v) => ev2(`(()=>{ const el=document.querySelector('${sel}'); if(!el) return 'tidak ada ${sel}'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'${v}'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; })()`);

  // 1) Login lewat UI
  await send("Page.navigate", { url: ORIGIN + "/" });
  await wait(3000);
  await set("#lg-user", "admin");
  await set("#lg-pass", PASS);
  await ev2("document.querySelector('.login-card .save-btn').click(); 'ok'");
  await tunggu(".topbar, #lg-user"); await wait(300);
  cek("login UI masuk aplikasi", await ev2("!!document.querySelector('.topbar')"), "");
  cek("sesi tersimpan di localStorage", await ev2("(()=>{ const s=JSON.parse(localStorage.getItem('inputin-sesi-v1')||'null'); return !!(s && s.user && s.user.username==='admin'); })()"), "");
  cek("bootstrap tersimpan di localStorage", await ev2("(()=>{ const b=JSON.parse(localStorage.getItem('inputin-bootstrap-v1')||'null'); return !!(b && b.teams && b.teams.length); })()"), "");

  // 2) Offline (API diblokir) + reload -> langsung masuk, tanpa form login
  mode = "blockApi";
  await ev2("location.reload(); 'ok'");
  await tunggu(".topbar, #lg-user"); await wait(300);
  cek("offline: aplikasi masuk tanpa form login", await ev2("!!document.querySelector('.topbar') && !document.querySelector('#lg-user')"), "");
  cek("offline: sesi lokal tetap ada", await ev2("(()=>{ const s=JSON.parse(localStorage.getItem('inputin-sesi-v1')||'null'); return !!(s && s.user); })()"), "");
  cek("offline: form input tampil (siap input)", await ev2("!!document.querySelector('#f-hasil')"), "");

  // 3) Sesi dicabut server (401) + reload -> form login, sesi lokal dihapus
  mode = "block401";
  await ev2("location.reload(); 'ok'");
  await tunggu(".topbar, #lg-user"); await wait(300);
  cek("401: form login tampil lagi", await ev2("!!document.querySelector('#lg-user')"), "");
  cek("401: sesi lokal dihapus", await ev2("localStorage.getItem('inputin-sesi-v1')===null"), "");

  // 4) Tanpa sesi tersimpan + offline -> form login (benar)
  await ev2("localStorage.clear(); 'ok'");
  mode = "blockApi";
  await ev2("location.reload(); 'ok'");
  await tunggu(".topbar, #lg-user"); await wait(300);
  cek("tanpa sesi + offline: form login tampil", await ev2("!!document.querySelector('#lg-user')"), "");

  // 5) Mode normal: /api/me berhasil -> masuk lagi, sesi tersimpan lagi
  mode = "pass";
  await ev2("location.reload(); 'ok'");
  await tunggu(".topbar, #lg-user"); await wait(300);
  cek("online: masuk lagi lewat /api/me", await ev2("!!document.querySelector('.topbar')"), "");
  cek("online: sesi tersimpan lagi", await ev2("(()=>{ const s=JSON.parse(localStorage.getItem('inputin-sesi-v1')||'null'); return !!(s && s.user); })()"), "");
  cek("tanpa error JS relevan", errs.length === 0, errs.slice(0, 2).join(" ;; "));
  ws.close();
} finally { chrome.kill("SIGKILL"); }

const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nSMOKE OFFLINE LOGIN: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
