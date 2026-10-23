// Seed 30 data uji (15 hari x 2 shift, Team 1, 1-15 Okt 2026) di PREVIEW untuk smoke desain persen matriks.
// Pola: Operator naik 6->8% mulai 8 Okt; 5 Okt Shift 2 Operator 9% (beda antar shift);
// 11 Okt Shift 2 Helper 5% (beda antar shift); 9 Okt Shift 2 tanpa hasil.
// Pakai: node scripts/seed-smoke30.mjs [--clean]
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
  for (let day = 1; day <= 15; day++) {
    const tgl = "2026-10-" + String(day).padStart(2, "0");
    const d = await api(`/api/entries?team_id=1&from=${tgl}&to=${tgl}&per=10&page=1`);
    for (const dy of d.days || []) for (const s of dy.shifts || []) await api(`/api/entries/${s.id}`, { method: "DELETE" });
  }
}
if (process.argv.includes("--clean")) { await bersihkan(); console.log("Bersih."); process.exit(0); }

await bersihkan();
const ORANG = { Operator: 6, Helper: 5, Mandor: 2, Sopir: 2, Satpam: 1, Koki: 1, Tukang: 1 };
function rowsUntuk(day, shift) {
  const pct = { Operator: day >= 8 ? 8 : 6, Helper: 4, Mandor: 3, Sopir: 2, Satpam: 1, Koki: 1, Tukang: 1 };
  if (day === 5 && shift === 2) pct.Operator = 9;
  if (day === 11 && shift === 2) pct.Helper = 5;
  return Object.entries(pct).map(([nama, persentase]) => ({ nama, persentase, jumlah_orang: ORANG[nama] }));
}
let n = 0;
for (let day = 1; day <= 15; day++) {
  const tgl = "2026-10-" + String(day).padStart(2, "0");
  for (const shift of [1, 2]) {
    const tanpa = day === 9 && shift === 2;
    const hasil = shift === 1 ? 90 + ((day * 37) % 70) : 60 + ((day * 23) % 50);
    const catatan = tanpa ? "Hujan deras - alat berhenti total" : day === 3 && shift === 1 ? "Terlambat mulai - gerimis pagi" : day === 14 ? "Target tercapai lebih awal" : "Lancar";
    await api("/api/entries", { method: "POST", body: JSON.stringify({ team_id: 1, tanggal: tgl, shift, tanpa_hasil: tanpa, hasil_gram: tanpa ? 0 : hasil, catatan, rows: rowsUntuk(day, shift) }) });
    n++;
  }
}
console.log("Seed selesai:", n, "entri");
const rep = await api("/api/report?team_id=1&from=2026-10-01&to=2026-10-15");
console.log("Report: hasil", rep.totals.hasil, "| terbagi", rep.totals.terbagi, "| kolom", (rep.kelompok_kolom || []).join(","));
const d5 = rep.days.find((d) => d.tanggal === "2026-10-05");
console.log("5 Okt shift_rows:", JSON.stringify(d5.shift_rows["2"].slice(0, 2)));
