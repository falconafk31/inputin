#!/usr/bin/env python3
"""Deploy Worker PREVIEW ui-modern-inputin lewat Cloudflare API (untuk smoke sebelum push).

Deploy produksi jangka panjang = Cloudflare Workers Builds dari GitHub
(Hades menyambungkan repo ke Cloudflare). Script ini untuk deploy awal
dan pengujian end-to-end sebelum koneksi Git dibuat.
"""
import json
import os
import sys
import urllib.request
import urllib.error
import uuid as uuidlib

sys.path.insert(0, os.path.expanduser("~/workspace/skills/_shared/bin"))
from dynamic_credentials import add_surrogate_to_request, read_response_body

ACC = "d0efa75b9b53fbce00665c28f31a319c"
DB = "fb418a18-0da5-4799-858e-40474919ab7c"
SCRIPT = "ui-modern-inputin"
BASE = "https://api.cloudflare.com/client/v4"
ROOT = os.path.expanduser("~/workspace/app-tambang-emas")

modules = ["worker.js", "frontend.js", "pdfassets.js"]
metadata = {
    "main_module": "worker.js",
    "bindings": [{"type": "d1", "name": "DB", "id": DB}],
    "compatibility_date": "2024-11-01",
}
boundary = "----cfdeploy" + uuidlib.uuid4().hex
parts = []
parts.append(("--" + boundary + "\r\n").encode())
parts.append(b'Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n')
parts.append(json.dumps(metadata).encode() + b"\r\n")
for name in modules:
    code = open(os.path.join(ROOT, "src", name), "rb").read()
    parts.append(("--" + boundary + "\r\n").encode())
    parts.append(('Content-Disposition: form-data; name="%s"; filename="%s"\r\nContent-Type: application/javascript+module\r\n\r\n' % (name, name)).encode())
    parts.append(code + b"\r\n")
parts.append(("--" + boundary + "--\r\n").encode())
body = b"".join(parts)

req = urllib.request.Request(
    f"{BASE}/accounts/{ACC}/workers/scripts/{SCRIPT}",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="PUT",
)
add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=["api.cloudflare.com"])
try:
    resp = urllib.request.urlopen(req)
    out = read_response_body(resp)
    print(out if isinstance(out, str) else out.decode("utf-8", "replace"))
except urllib.error.HTTPError as e:
    print("HTTP", e.code)
    print(e.read().decode("utf-8", "replace")[:1200])
    sys.exit(1)

req2 = urllib.request.Request(
    f"{BASE}/accounts/{ACC}/workers/scripts/{SCRIPT}/subdomain",
    data=json.dumps({"enabled": True}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
add_surrogate_to_request(req2, "custom.cloudflare", allowed_hosts=["api.cloudflare.com"])
try:
    resp2 = urllib.request.urlopen(req2)
    out2 = read_response_body(resp2)
    print(out2 if isinstance(out2, str) else out2.decode("utf-8", "replace"))
except urllib.error.HTTPError as e:
    print("subdomain HTTP", e.code, e.read().decode("utf-8", "replace")[:400])
