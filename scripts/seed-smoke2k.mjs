// Seed contoh realistis 2 kelompok (Operator 6% + Helper 4%), Team 1, 16-20 Okt 2026, PREVIEW.
// 18 Okt Shift 2 Operator 7% (beda antar shift -> bintang + lampiran).
import fs from "node:fs";
const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
let cookie = "";
async function api(path, opts = {}) {
  const r = await fetch(ORIGIN + path, { ...opts, headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) } });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
  return d;
}
await api("/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: PASS }) });
async function bersihkan() {
  for (let day = 16; day <= 20; day++) {
    const tgl = "2026-10-" + day;
    const d = await api(`/api/entries?team_id=1&from=${tgl}&to=${tgl}&per=10&page=1`);
    for (const dy of d.days || []) for (const s of dy.shifts || []) await api(`/api/entries/${s.id}`, { method: "DELETE" });
  }
}
if (process.argv.includes("--clean")) { await bersihkan(); console.log("Bersih."); process.exit(0); }
await bersihkan();
let n = 0;
for (let day = 16; day <= 20; day++) {
  const tgl = "2026-10-" + day;
  for (const shift of [1, 2]) {
    const op = day === 18 && shift === 2 ? 7 : 6;
    const hasil = shift === 1 ? 120 + ((day * 13) % 40) : 80 + ((day * 7) % 30);
    await api("/api/entries", { method: "POST", body: JSON.stringify({ team_id: 1, tanggal: tgl, shift, tanpa_hasil: false, hasil_gram: hasil, catatan: "Lancar", rows: [{ nama: "Operator", persentase: op, jumlah_orang: 6 }, { nama: "Helper", persentase: 4, jumlah_orang: 5 }] }) });
    n++;
  }
}
console.log("Seed 2 kelompok selesai:", n, "entri");
