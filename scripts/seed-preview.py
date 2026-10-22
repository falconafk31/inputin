#!/usr/bin/env python3
"""Seed database PREVIEW Inputin (inputin-db-preview): skema + data awal.

Password disamakan dengan kredensial awal produksi (credentials-awal.txt)
agar Hades bisa masuk preview dengan akun yang sama. Data preview terpisah
penuh dari produksi, aman untuk uji semua fitur.
"""
import hashlib
import json
import os
import secrets
import subprocess
import sys

ACCOUNT = "d0efa75b9b53fbce00665c28f31a319c"
DB_ID = "fb418a18-0da5-4799-858e-40474919ab7c"
BASE = os.path.expanduser("~/workspace/app-tambang-emas")
CF = os.path.expanduser("~/workspace/custom-skills/local-cloudflare/bin/cf.py")
ENV = dict(os.environ, PYTHONPATH=os.path.expanduser("~/workspace/skills/_shared/bin"))


def cf_query(sql):
    body = {"sql": sql}
    path = f"/tmp/seed-preview-body-{os.getpid()}.json"
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


def hash_password(pw):
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 100000).hex()
    return f"{salt}:{h}"


def read_cred():
    creds = {}
    with open(os.path.join(BASE, "credentials-awal.txt")) as f:
        for line in f:
            line = line.strip()
            for user in ("admin", "staff1", "staff2"):
                if line.startswith(user):
                    creds[user] = line.split("/")[1].strip().split(" ")[0]
    return creds


def main():
    with open(os.path.join(BASE, "migrations/0001_schema.sql")) as f:
        schema = f.read()
    cf_query(schema)
    print("Skema OK")

    creds = read_cred()
    now = "2026-10-22T15:45:00.000Z"
    secret = secrets.token_hex(32)
    stmts = [
        "INSERT OR IGNORE INTO teams (id, nama, aktif, created_at) VALUES (1, 'Team 1', 1, '%s'), (2, 'Team 2', 1, '%s')" % (now, now),
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('nama_perusahaan',''), ('nama_pimpinan',''), ('zona_waktu','Asia/Jakarta'), ('session_secret','%s')" % secret,
        "INSERT OR IGNORE INTO users (nama, username, password_hash, role, team_id, aktif, created_at) VALUES ('Admin','admin','%s','admin',NULL,1,'%s')" % (hash_password(creds["admin"]), now),
        "INSERT OR IGNORE INTO users (nama, username, password_hash, role, team_id, aktif, created_at) VALUES ('Staff Team 1','staff1','%s','staff',1,1,'%s')" % (hash_password(creds["staff1"]), now),
        "INSERT OR IGNORE INTO users (nama, username, password_hash, role, team_id, aktif, created_at) VALUES ('Staff Team 2','staff2','%s','staff',2,1,'%s')" % (hash_password(creds["staff2"]), now),
    ]
    for s in stmts:
        cf_query(s)
    print("Seed OK (password sama dengan kredensial awal produksi)")

    check = cf_query("SELECT (SELECT COUNT(*) FROM teams) AS teams, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM settings) AS settings")
    print("Verifikasi:", json.dumps(check["result"][0]["results"][0]))


if __name__ == "__main__":
    main()
