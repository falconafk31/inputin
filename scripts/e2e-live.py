#!/usr/bin/env python3
import json, re, subprocess, tempfile, os

BASE = "https://inputin.hadesxyz.workers.dev"
UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"
cred = {}
for line in open("/home/hatch/workspace/app-tambang-emas/credentials-awal.txt"):
    m = re.match(r"(\w+)\s+/\s+(\S+)", line.strip())
    if m: cred[m.group(1)] = m.group(2)

def newjar():
    return tempfile.mktemp(suffix=".cookies")

def call(jar, method, path, body=None):
    cmd = ["curl", "-s", "-A", UA, "-c", jar, "-b", jar, "-X", method, BASE + path, "-H", "content-type: application/json"]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    cmd += ["-w", "\n%{http_code}"]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    text, _, code = out.rpartition("\n")
    try: data = json.loads(text)
    except Exception: data = {"raw": text[:200]}
    return int(code), data

results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS" if ok else "FAIL"), "|", name, "|", detail)

html = subprocess.run(["curl", "-s", "-A", UA, BASE + "/"], capture_output=True, text=True).stdout
check("Halaman utama termuat (Inputin + Vue)", "Inputin" in html and "createApp" in html, f"{len(html)//1024} KB")

jar = newjar()
st, d = call(jar, "POST", "/api/login", {"username": "admin", "password": "salah-total"})
check("Login password salah ditolak 401", st == 401, str(d.get("error")))

jarA = newjar()
st, d = call(jarA, "POST", "/api/login", {"username": "admin", "password": cred["admin"]})
check("Login admin berhasil", st == 200 and d["user"]["role"] == "admin", d["user"]["nama"])
st, b = call(jarA, "GET", "/api/bootstrap")
check("Bootstrap: 2 team + zona WIB", len(b["teams"]) == 2 and b["settings"]["zona_label"] == "WIB", json.dumps(b["settings"]))
today = b["today"]
check("Tanggal hari ini dari zona usaha", today == "2026-10-22", today)

jarS = newjar()
st, d = call(jarS, "POST", "/api/login", {"username": "staff1", "password": cred["staff1"]})
check("Login staff1 berhasil (Team 1)", st == 200 and d["user"]["team_id"] == 1, d["user"]["team_nama"])
st, d = call(jarS, "POST", "/api/entries", {"team_id": 1, "tanggal": today, "shift": 1, "hasil_gram": 100,
    "catatan": "Uji end-to-end Pax.", "rows": [{"nama": "Operator", "persentase": 6, "jumlah_orang": 6}, {"nama": "Helper", "persentase": 4, "jumlah_orang": 5}]})
e = d.get("entry", {}); r0 = e.get("rows", [{}])[0]
check("Input 100 gr tersimpan, Operator total 6,000 / per orang 1,000", r0.get("total_gram") == 6 and r0.get("per_orang_gram") == 1, json.dumps(r0))
check("Pendapatan Usaha 90,000 gr", e.get("sisa") == 90, str(e.get("sisa")))
entry_id = e.get("id")

st, d = call(jarS, "POST", "/api/entries", {"team_id": 1, "tanggal": today, "shift": 2, "hasil_gram": 50,
    "rows": [{"nama": "Operator", "persentase": 80, "jumlah_orang": 1}, {"nama": "Helper", "persentase": 30, "jumlah_orang": 1}]})
check("Total persen 110% ditolak", st == 400, str(d.get("error")))

st, d = call(jarS, "POST", "/api/entries", {"team_id": 1, "tanggal": today, "shift": 1, "hasil_gram": 120,
    "catatan": "Revisi uji.", "rows": [{"nama": "Operator", "persentase": 6, "jumlah_orang": 6}, {"nama": "Helper", "persentase": 4, "jumlah_orang": 5}]})
check("Simpan ulang shift sama = update (id sama, hasil 120)", d.get("entry", {}).get("id") == entry_id and d["entry"]["hasil_gram"] == 120, str(d.get("entry", {}).get("hasil_gram")))

st, d = call(jarS, "GET", f"/api/entries?team_id=2&from={today}&to={today}")
ok_iso = st == 200 and all(s["team_id"] == 1 for day in d["days"] for s in day["shifts"])
check("Staff minta data team 2 -> dikembalikan team sendiri", ok_iso, f"days={len(d['days'])}")

st, d = call(jarS, "GET", f"/api/report?team_id=1&from={today}&to={today}")
t = d.get("totals", {})
check("Laporan: total 120, terbagi 12, sisa 108", t.get("hasil") == 120 and t.get("terbagi") == 12 and t.get("sisa") == 108, json.dumps(t))

st, d = call(jarS, "GET", f"/api/entries/{entry_id}/audit")
aksis = [a["aksi"] for a in d.get("audit", [])]
check("Audit trail ada buat + ubah", "buat" in aksis and "ubah" in aksis, str(aksis))

st, d = call(jarS, "POST", "/api/entries", {"team_id": 1, "tanggal": today, "shift": 2, "tanpa_hasil": True, "rows": []})
check("Tanpa Hasil tanpa alasan ditolak", st == 400, str(d.get("error")))
st, d = call(jarS, "POST", "/api/entries", {"team_id": 1, "tanggal": today, "shift": 2, "tanpa_hasil": True, "catatan": "Hujan seharian.", "rows": []})
check("Tanpa Hasil dengan alasan tersimpan (0 gr)", st == 200 and d["entry"]["hasil_gram"] == 0, "")
th_id = d["entry"]["id"]

for eid in (entry_id, th_id):
    st, d = call(jarS, "DELETE", f"/api/entries/{eid}")
check("Data uji terhapus (soft delete)", st == 200, "")
st, d = call(jarS, "GET", f"/api/report?team_id=1&from={today}&to={today}")
check("Setelah hapus, laporan kembali kosong", d["totals"]["hasil"] == 0 and d["totals"]["shift_tercatat"] == 0, json.dumps(d["totals"]))

st, d = call(jarA, "GET", "/api/admin/status")
check("Admin status per team termuat", st == 200 and len(d["status"]) == 2, json.dumps(d.get("status")))

st, d = call(jarS, "GET", "/api/admin/users")
check("Staff ditolak dari endpoint admin (403)", st == 403, str(d.get("error")))

print()
print(f"E2E LIVE: {sum(results)}/{len(results)} PASS")
