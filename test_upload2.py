"""Test the exact same path the frontend uses."""
import json, urllib.request, urllib.error

BASE = "http://localhost:8000"
H = {"X-API-Key": "dev-local-9f4e1d2c7a8b3f6e", "X-Tenant-Id": "public"}

def upload(content: bytes, filename: str):
    b = "Bnd"
    body = (
        f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        f"Content-Type: text/csv\r\n\r\n"
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
        try: detail = json.loads(e.read().decode()).get("detail", "")
        except: detail = ""
        return None, f"HTTP {e.code}: {detail}"

# Realistic advertising dataset
csv = "\n".join([
    "TV,radio,newspaper,sales",
    "230.1,37.8,69.2,22.1", "44.5,39.3,45.1,10.4", "17.2,45.9,69.3,9.3",
    "151.5,41.3,58.5,18.5", "180.8,10.8,58.4,12.9", "8.7,48.9,75.0,7.2",
    "57.5,32.8,23.5,11.8", "120.2,19.6,11.6,13.2", "8.6,2.1,1.0,4.8",
    "199.8,2.6,21.2,10.6", "66.1,5.8,24.2,8.6", "214.7,24.0,4.0,17.4",
    "23.8,35.1,65.9,9.2", "97.5,7.6,7.2,9.7", "204.1,32.9,46.0,19.0",
])
res, err = upload(csv.encode(), "advertising.csv")

if err:
    print(f"FAIL: {err}")
else:
    print(f"PASS: id={res['id']} rows={res['rowCount']} cols={res['colCount']}")
    print(f"      preview_rows={len(res['rows'])} headers={res['headers']}")
    print(f"      first row: {res['rows'][0]}")

    # Now test EDA on it
    payload = json.dumps({"session_id": "test", "dataset_id": res["id"], "analysis_type": "eda"}).encode()
    r2 = urllib.request.urlopen(urllib.request.Request(
        f"{BASE}/api/analysis/auto", data=payload,
        headers={**H, "Content-Type": "application/json"}
    ))
    eda = json.loads(r2.read())["eda"]
    print(f"\nEDA on uploaded dataset:")
    print(f"  quality={eda['qualityScore']} stats={len(eda['statistics'])} corrs={len(eda['correlations'])}")
    print(f"  summary rows={eda['summary']['rows']} (should be {res['rowCount']})")
    if eda['summary']['rows'] == res['rowCount']:
        print("  PASS: EDA sees full dataset row count")
    else:
        print(f"  FAIL: EDA sees {eda['summary']['rows']} but dataset has {res['rowCount']}")
