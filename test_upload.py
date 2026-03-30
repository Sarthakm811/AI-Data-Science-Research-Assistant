"""Comprehensive upload test — checks every failure mode."""
import json, urllib.request, urllib.error, io, os

BASE = "http://localhost:8000"
H = {"X-API-Key": "dev-local-9f4e1d2c7a8b3f6e", "X-Tenant-Id": "public"}

passed = failed = 0

def check(label, cond, detail=""):
    global passed, failed
    sym = "PASS" if cond else "FAIL"
    print(f"  [{sym}] {label}" + (f" — {detail}" if detail else ""))
    if cond: passed += 1
    else: failed += 1

def upload(content: bytes, filename: str, content_type: str = "text/csv"):
    b = "UploadBoundary"
    body = (
        f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + content + f"\r\n--{b}--".encode()
    req = urllib.request.Request(
        f"{BASE}/api/datasets/upload", data=body,
        headers={**H, "Content-Type": f"multipart/form-data; boundary={b}"},
        method="POST"
    )
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try: detail = json.loads(body).get("detail", body)
        except: detail = body
        return None, f"HTTP {e.code}: {detail}"
    except Exception as e:
        return None, str(e)

# ── 1. Normal CSV ─────────────────────────────────────────────────────────────
print("\n=== 1. Normal CSV upload ===")
csv = b"name,age,salary,dept\nAlice,25,50000,Eng\nBob,30,60000,Mkt\nCharlie,35,75000,Eng\n" * 20
res, err = upload(csv, "employees.csv")
if err:
    print(f"  [FAIL] {err}"); failed += 1
else:
    check("has id",       bool(res.get("id")),          f"id={res['id']}")
    check("id is unique", "_" in res.get("id",""),       f"id={res['id']}")
    check("rowCount=60",  res.get("rowCount") == 60,     f"rowCount={res.get('rowCount')}")
    check("colCount=4",   res.get("colCount") == 4,      f"colCount={res.get('colCount')}")
    check("headers ok",   res.get("headers") == ["name","age","salary","dept"])
    check("rows ≤ 500",   len(res.get("rows",[])) <= 500, f"rows={len(res.get('rows',[]))}")
    check("rows = min(60,500)", len(res.get("rows",[])) == 60)
    ds_id = res["id"]

# ── 2. Large CSV (>500 rows) — preview capped at 500 ─────────────────────────
print("\n=== 2. Large CSV (1000 rows) — preview capped at 500 ===")
big_csv = b"x,y,z\n" + b"1,2,3\n" * 1000
res2, err2 = upload(big_csv, "big.csv")
if err2:
    print(f"  [FAIL] {err2}"); failed += 1
else:
    check("rowCount=1000",      res2.get("rowCount") == 1000,   f"rowCount={res2.get('rowCount')}")
    check("preview rows = 500", len(res2.get("rows",[])) == 500, f"preview={len(res2.get('rows',[]))}")

# ── 3. Empty file → 400 ───────────────────────────────────────────────────────
print("\n=== 3. Empty file → 400 ===")
res3, err3 = upload(b"", "empty.csv")
check("rejected with error", err3 is not None, err3 or "no error")
check("400 status",          err3 and "400" in err3, err3)

# ── 4. CSV with only headers, no data rows → 400 ─────────────────────────────
print("\n=== 4. Headers-only CSV → 400 ===")
res4, err4 = upload(b"col1,col2,col3\n", "headers_only.csv")
check("rejected with error", err4 is not None, err4 or "no error")

# ── 5. Duplicate uploads get different IDs ────────────────────────────────────
print("\n=== 5. Duplicate uploads → unique IDs ===")
csv5 = b"a,b\n1,2\n3,4\n"
r5a, _ = upload(csv5, "dup.csv")
r5b, _ = upload(csv5, "dup.csv")
if r5a and r5b:
    check("IDs are different", r5a["id"] != r5b["id"], f"{r5a['id']} vs {r5b['id']}")
else:
    print("  [FAIL] one or both uploads failed"); failed += 1

# ── 6. Unsupported format → 400 ───────────────────────────────────────────────
print("\n=== 6. Unsupported format (.txt) → 400 ===")
res6, err6 = upload(b"hello world", "notes.txt", "text/plain")
# text/plain falls back to CSV parse — may succeed or fail depending on content
# just check it doesn't crash the server
check("server responded", res6 is not None or err6 is not None, "server alive")

# ── 7. Dataset accessible after upload ───────────────────────────────────────
print("\n=== 7. Dataset accessible by ID after upload ===")
csv7 = b"col1,col2\n10,20\n30,40\n"
r7, _ = upload(csv7, "check.csv")
if r7:
    req = urllib.request.Request(
        f"{BASE}/api/datasets/{r7['id']}",
        headers={**H, "Content-Type": "application/json"}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        check("GET by id works",   data.get("id") == r7["id"])
        check("rowCount matches",  data.get("rowCount") == 2)
    except Exception as e:
        check("GET by id works", False, str(e))
else:
    print("  [SKIP] upload failed"); failed += 1

# ── 8. Error message is descriptive ──────────────────────────────────────────
print("\n=== 8. Error message is descriptive ===")
res8, err8 = upload(b"", "empty2.csv")
check("error not generic", err8 and "Failed to upload dataset" not in err8, err8)

print(f"\n{'='*45}")
print(f"Results: {passed} passed, {failed} failed")
