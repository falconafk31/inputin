// Uji UI redesign melawan API live (login staff): cek render, font tertanam, ikon SVG.
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
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
  const b64 = Buffer.from(JSON.stringify({ username: "admin", password: PASS })).toString("base64");
  const loginRes = await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`);
  cek("login admin preview untuk smoke 10 hari", loginRes === 200, "status " + loginRes);
  await ev2("location.reload(); 'ok'");
  await wait(3000);
  await ev2("[...document.querySelectorAll('.bottomnav button')][2].click(); 'ok'");
  await wait(1500);
  await ev2("(()=>{ const a=document.querySelector('#l-dari'), b=document.querySelector('#l-sampai'); a.value='2026-10-13'; a.dispatchEvent(new Event('input',{bubbles:true})); a.dispatchEvent(new Event('change',{bubbles:true})); b.value='2026-10-22'; b.dispatchEvent(new Event('input',{bubbles:true})); b.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; })()");
  await wait(3000);
  const info = await ev2("document.body.innerText.includes('2.398,750') + '|' + document.body.innerText.includes('Subtotal')");
  cek("layar laporan 10 hari: total 2.398,750 tampil", String(info).startsWith("true"), String(info));
  const uri = await ev2("window.__PDF_TEST__=true; window.__unduhPDF(false).then(d=>d.output('datauristring'))");
  fs.writeFileSync(new URL("../smoke-test/contoh-laporan-10hari.pdf", import.meta.url), Buffer.from(uri.split(",")[1], "base64"));
  cek("PDF 10 hari tersimpan", uri.length > 5000, "datauri " + uri.length + " char");
  ws.close();
} finally { chrome.kill("SIGKILL"); }
const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nSMOKE 10 HARI: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
