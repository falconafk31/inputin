#!/usr/bin/env python3
"""Seed awal Inputin: jalankan skema + data awal ke database D1 lewat API Cloudflare.

Membuat: 2 team, settings default, akun admin + staff Team 1 + staff Team 2
dengan password acak. Password ditulis ke credentials-awal.txt (tidak di-commit).

Konfigurasi lewat environment variable:
  CF_ACCOUNT_ID  - ID akun Cloudflare
  CF_API_TOKEN   - API token Cloudflare dengan izin D1 Edit
  INPUTIN_DB_ID  - UUID database D1 tujuan

Contoh:
  CF_ACCOUNT_ID=xxx CF_API_TOKEN=yyy INPUTIN_DB_ID=zzz python3 scripts/seed.py
"""
import hashlib
import json
import os
import secrets
import string
import sys
import urllib.request
from datetime import datetime, timezone

ACCOUNT = os.environ.get("CF_ACCOUNT_ID", "")
DB_ID = os.environ.get("INPUTIN_DB_ID", "")
TOKEN = os.environ.get("CF_API_TOKEN", "")
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cf_query(sql):
    if not (ACCOUNT and DB_ID and TOKEN):
        raise SystemExit("Env CF_ACCOUNT_ID, CF_API_TOKEN, dan INPUTIN_DB_ID wajib diisi. Lihat docstring file ini.")
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DB_ID}/query",
        data=json.dumps({"sql": sql}).encode(),
        method="POST",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    if not data.get("success"):
        raise SystemExit(f"Query gagal: {json.dumps(data)[:500]}")
    return data


def gen_password(prefix):
    alphabet = string.ascii_letters + string.digits
    return prefix + "".join(secrets.choice(alphabet) for _ in range(10))


def hash_password(pw):
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 100000).hex()
    return f"{salt}:{h}"


def main():
    with open(os.path.join(BASE, "migrations/0001_schema.sql")) as f:
        schema = f.read()
    cf_query(schema)
    print("Skema OK")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    pw_admin = gen_password("Adm-")
    pw_staff1 = gen_password("Stf-")
    pw_staff2 = gen_password("Stf-")
    secret = secrets.token_hex(32)

    stmts = [
        "INSERT OR IGNORE INTO teams (id, nama, aktif, created_at) VALUES (1, 'Team 1', 1, '%s'), (2, 'Team 2', 1, '%s')" % (now, now),
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('nama_perusahaan',''), ('nama_pimpinan',''), ('zona_waktu','Asia/Jakarta'), ('session_secret','%s')" % secret,
        "INSERT OR IGNORE INTO users (nama, username, password_hash, role, team_id, aktif, created_at) VALUES ('Admin','admin','%s','admin',NULL,1,'%s')" % (hash_password(pw_admin), now),
        "INSERT OR IGNORE INTO users (nama, username, password_hash, role, team_id, aktif, created_at) VALUES ('Staff Team 1','staff1','%s','staff',1,1,'%s')" % (hash_password(pw_staff1), now),
        "INSERT OR IGNORE INTO users (nama, username, password_hash, role, team_id, aktif, created_at) VALUES ('Staff Team 2','staff2','%s','staff',2,1,'%s')" % (hash_password(pw_staff2), now),
    ]
    for s in stmts:
        cf_query(s)
    print("Seed OK")

    check = cf_query("SELECT (SELECT COUNT(*) FROM teams) AS teams, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM settings) AS settings")
    print("Verifikasi:", json.dumps(check["result"][0]["results"][0]))

    cred_path = os.path.join(BASE, "credentials-awal.txt")
    with open(cred_path, "w") as f:
        f.write("KREDENSIAL AWAL INPUTIN (ganti setelah login pertama)\n")
        f.write(f"admin   / {pw_admin}  (Admin, semua team)\n")
        f.write(f"staff1  / {pw_staff1}  (Staff Team 1)\n")
        f.write(f"staff2  / {pw_staff2}  (Staff Team 2)\n")
    print("Kredensial ditulis ke credentials-awal.txt")


if __name__ == "__main__":
    main()
