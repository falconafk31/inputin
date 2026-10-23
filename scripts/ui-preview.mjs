// Uji UI redesign melawan API live (login staff): cek render, font tertanam, ikon SVG.
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("staff1")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://inputin.hadesxyz.workers.dev";
const URL_LOCAL = "http://127.0.0.1:8899/index.html";
const PORT = 9335;
const chrome = spawn(process.env.CHROME_BIN || "/home/hatch/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome", ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${PORT}`, "--window-size=430,900", "about:blank"], { stdio: "ignore" });
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, ok, det || ""]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };
try {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets && targets.length) break; } catch {} await wait(400); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  let mid = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push(m.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 150)); if (m.method === "Runtime.exceptionThrown") errs.push("EXC: " + (m.params.exceptionDetails.exception?.description || "").slice(0, 150)); };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const id = ++mid; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setRequestInterception", { patterns: [{ urlPattern: ORIGIN + "/*", requestStage: "Request" }] });
  const cookies = {};
  ws.addEventListener("message", async (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method !== "Fetch.requestPaused") {
      if (m.method === "Network.requestWillBeSent") { const u = m.params.request.url; if (u.startsWith(ORIGIN + "/api/")) { const h = m.params.request.headers || {}; const c = h.Cookie || h.cookie; if (c) cookies.last = c; } }
      return;
    }
    const { requestId, request } = m.params;
    if (request.url.startsWith(ORIGIN + "/api/")) {
      try {
        let pd = request.postData || "";
        if (request.hasPostData && pd.length < 30 && request.method === "POST") {
          const full = await send("Fetch.getRequestPostData", { requestId });
          if (full.result && full.result.postData) pd = Buffer.from(full.result.postData, full.result.base64Encoded ? "base64" : "utf8").toString("utf8");
        }
        const r = await fetch(request.url, { method: request.method, headers: { "Content-Type": "application/json", ...(request.headers.Cookie ? { Cookie: request.headers.Cookie } : {}) }, body: request.method === "POST" ? pd : undefined, redirect: "manual" });
        const buf = Buffer.from(await r.arrayBuffer());
        const rh = {}; r.headers.forEach((v, k) => { if (!["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())) rh[k] = v; });
        console.log("API", request.method, request.url.replace(ORIGIN, ""), "->", r.status, "| pdLen:", pd.length);
        await send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: Object.entries(rh).map(([name, value]) => ({ name, value })), body: buf.toString("base64") });
      } catch (e) { console.log("API ERR", e.message); await send("Fetch.failRequest", { requestId, errorReason: "Failed" }); }
      return;
    }
    const target = request.url.replace(ORIGIN, "http://127.0.0.1:8899");
    try {
      const headers = { ...request.headers }; delete headers.host; delete headers.Host; delete headers["Accept-Encoding"]; delete headers["accept-encoding"];
      const r = await fetch(target, { method: request.method, headers, body: request.postData || undefined, redirect: "manual" });
      const buf = Buffer.from(await r.arrayBuffer());
      const rh = {}; r.headers.forEach((v, k) => { if (!["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())) rh[k] = v; });
      await send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: Object.entries(rh).map(([name, value]) => ({ name, value })), body: buf.toString("base64") });
    } catch (e) { await send("Fetch.failRequest", { requestId, errorReason: "Failed" }); }
  });
  await send("Fetch.enable", { patterns: [{ urlPattern: ORIGIN + "/*", requestStage: "Request" }] });
  await send("Page.navigate", { url: ORIGIN + "/" });
  await wait(3500);
  const ev2 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error"); return r.result?.result?.value; };
  cek("halaman login tampil (redesign)", (await ev2("!!document.querySelector('.login-card')")) === true);
  const shotLogin = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(new URL("../smoke-test/ui-v2-login.png", import.meta.url), Buffer.from(shotLogin.result.data, "base64"));
  cek("tombol Bersihkan Cache ada di layar login", (await ev2("[...document.querySelectorAll('.login-card button')].some(b=>b.innerText.includes('Bersihkan Cache'))")) === true);
  const b64 = Buffer.from(JSON.stringify({ username: "staff1", password: PASS })).toString("base64");
  const loginRes = await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`);
  cek("login API dari halaman (untuk masuk sesi uji)", loginRes === 200, "status " + loginRes);
  await ev2("location.reload(); 'ok'");
  await wait(3000);
  cek("login staff masuk form Input", (await ev2("!!document.querySelector('input.big')")) === true);
  const dbg = await ev2("JSON.stringify({topnavBtns:document.querySelectorAll('.topnav button').length, bottomBtns:document.querySelectorAll('.bottomnav button').length, inputs:document.querySelectorAll('input').length, big:!!document.querySelector('input.big'), sections:[...document.querySelectorAll('section')].length, innerW:innerWidth, appLen:document.querySelector('#app').innerHTML.length})");
  console.log('DEBUG', dbg);
  cek("tombol avatar profil ada di topbar", (await ev2("!!document.querySelector('.topbar .avatar')")) === true);
  await ev2("document.querySelector('.topbar .avatar').click(); 'ok'");
  await wait(500);
  const sheetIsi = await ev2("document.querySelector('.psheet') ? document.querySelector('.psheet').innerText : ''");
  cek("sheet profil berisi Ganti Password + Perbaiki Aplikasi + versi", sheetIsi.includes("Ganti Password") && sheetIsi.includes("Perbaiki Aplikasi (Bersihkan Cache)") && sheetIsi.includes("Versi 3.4.3"), sheetIsi.slice(0, 90));
  await ev2("document.querySelector('.sheet-bg').dispatchEvent(new MouseEvent('click',{bubbles:true})); 'ok'");
  await wait(400);
  cek("sheet profil tertutup lagi", (await ev2("!!document.querySelector('.psheet')")) === false);
  const fontCheck = await ev2("Promise.all([document.fonts.load('700 16px \"Plus Jakarta Sans\"'),document.fonts.load('600 16px \"Fira Code\"')]).then(()=>document.fonts.check('700 16px \"Plus Jakarta Sans\"') + '/' + document.fonts.check('600 16px \"Fira Code\"'))");
  cek("font asli termuat: PJS + Fira Code (document.fonts)", fontCheck === "true/true", fontCheck);
  const fontFam = await ev2("getComputedStyle(document.body).fontFamily");
  cek("font-family body = Plus Jakarta Sans", String(fontFam).includes("Plus Jakarta Sans"), String(fontFam).slice(0, 60));
  const iconCount = await ev2("document.querySelectorAll('.bottomnav .nav-ic svg').length");
  cek("ikon SVG navigasi bawah tampil", iconCount >= 3, "jumlah svg: " + iconCount + " | html: " + (iconCount ? "" : await ev2("document.querySelector('.bottomnav button') ? document.querySelector('.bottomnav button').innerHTML.slice(0,120) : 'no-btn'")));
  const baseSize = await ev2("getComputedStyle(document.body).fontSize");
  cek("font dasar 15px (paket final)", baseSize === "15px", baseSize);
  await ev2(`document.querySelector('input.big').value='100'; document.querySelector('input.big').dispatchEvent(new Event('input',{bubbles:true})); 'ok'`);
  await wait(600);
  const ringkasan = await ev2("document.body.innerText.includes('90,000')");
  cek("ringkasan tetap benar 90,000", ringkasan === true);
  cek("stepper langkah form tampil (3 titik)", (await ev2("document.querySelectorAll('.stepper .dot').length")) === 3);
  cek("bilah alokasi persen v2 tampil", (await ev2("!!document.querySelector('.alloc-fill')")) === true);
  cek("bilah simpan sticky HP v2 tampil", (await ev2("getComputedStyle(document.querySelector('.savebar')).display")) === "flex");
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(new URL("../smoke-test/ui-v2-form.png", import.meta.url), Buffer.from(shot.result.data, "base64"));
  await ev2("[...document.querySelectorAll('.bottomnav button')][2].click(); 'ok'");
  await wait(2200);
  const shotLap = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(new URL("../smoke-test/ui-v2-laporan.png", import.meta.url), Buffer.from(shotLap.result.data, "base64"));
  const lazyOk = await ev2("typeof window.jspdf === 'undefined'");
  cek("bundle PDF belum dimuat sebelum unduh pertama (lazy)", lazyOk === true);
  const pdfInfo = await ev2("window.__PDF_TEST__=true; window.__unduhPDF(false).then(doc=>{ const b = doc.output('blob'); return JSON.stringify({pages: doc.getNumberOfPages(), size: b.size, type: b.type}); })");
  const pi = JSON.parse(pdfInfo);
  cek("PDF unduh langsung ter-generate (jsPDF)", pi.type === "application/pdf" && pi.size > 4000 && pi.pages >= 1, pdfInfo);
  cek("tanpa error JS relevan", errs.filter((e) => !e.includes("favicon")).length === 0, errs.slice(0, 2).join(" ;; "));
  ws.close();
} finally { chrome.kill("SIGKILL"); }
const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nHASIL: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
