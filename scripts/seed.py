#!/usr/bin/env python3
"""Seed awal Inputin: jalankan skema + data awal ke D1 lewat cf.py.

Membuat: 2 team, settings default, akun admin + staff Team 1 + staff Team 2
dengan password acak. Password ditulis ke credentials-awal.txt (tidak di-commit).
"""
import hashlib
import json
import os
import secrets
import string
import subprocess
import sys

ACCOUNT = "d0efa75b9b53fbce00665c28f31a319c"
DB_ID = "7dc53776-ebab-417d-be8f-18d5f2942782"
BASE = os.path.expanduser("~/workspace/app-tambang-emas")
CF = os.path.expanduser("~/workspace/custom-skills/local-cloudflare/bin/cf.py")
ENV = dict(os.environ, PYTHONPATH=os.path.expanduser("~/workspace/skills/_shared/bin"))


def cf_query(sql):
    body = {"sql": sql}
    path = f"/tmp/seed-body-{os.getpid()}.json"
    with open(path, "w") as f:
        json.dump(body, f)
    out = subprocess.run(
        [sys.executable, CF, "POST", f"/accounts/{ACCOUNT}/d1/database/{DB_ID}/query", "--body", path],
        capture_output=True, text=True, env=ENV,
    )
    os.unlink(path)
    data = json.loads(out.stdout)
    if not data.get("success"):
        raise SystemExit(f"Query gagal: {out.stdout[:500]} {out.stderr[:200]}")
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

    now = "2026-10-22T13:00:00.000Z"
    pw_admin = gen_password("Adm-")
    pw_staff1 = gen_password("Stf-")
    pw_staff2 = gen_password("Stf-")
    secret = secrets.token_hex(32)

    stmts = [
        "INSERT OR IGNORE INTO teams (id, nama, aktif, created_at) VALUES (1, 'Team 1', 1, '%s'), (2, 'Team 2', 1, '%s')" % (now, now),
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('nama_perusahaan','Usaha Tambang Emas'), ('nama_pimpinan',''), ('zona_waktu','Asia/Jakarta'), ('session_secret','%s')" % secret,
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
