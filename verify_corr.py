"""Quick check that correlation scatterData is populated."""
import json, urllib.request

BASE = "http://localhost:8000"
H = {"X-API-Key": "dev-local-9f4e1d2c7a8b3f6e", "X-Tenant-Id": "public"}

# Upload advertising CSV
csv = "\n".join([
    "TV,radio,newspaper,sales",
    "230,37,69,22","44,39,45,10","17,45,69,9","151,41,58,18",
    "180,10,58,12","8,48,75,7","57,32,23,11","120,19,11,13",
    "8,2,1,4","199,2,2,10","66,5,22,9","214,24,4,16",
    "23,18,35,9","195,47,52,22","16,4,5,5",
])
b = "CorrBoundary"
body = f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"ads.csv\"\r\nContent-Type: text/csv\r\n\r\n{csv}\r\n--{b}--".encode()
ct = f"multipart/form-data; boundary={b}"
r = urllib.request.urlopen(urllib.request.Request(
    f"{BASE}/api/datasets/upload", data=body,
    headers={**H, "Content-Type": ct}
))
ds_id = json.loads(r.read())["id"]
print(f"Uploaded: {ds_id}")

# Run EDA
payload = json.dumps({"session_id": "corr-test", "dataset_id": ds_id, "analysis_type": "eda"}).encode()
r2 = urllib.request.urlopen(urllib.request.Request(
    f"{BASE}/api/analysis/auto", data=payload,
    headers={**H, "Content-Type": "application/json"}
))
eda = json.loads(r2.read())["eda"]
corrs = eda.get("correlations", [])

print(f"\nCorrelations returned: {len(corrs)}")
all_ok = True
for c in corrs:
    pts = len(c.get("scatterData", []))
    ok = pts > 0
    if not ok:
        all_ok = False
    status = "OK" if ok else "MISSING"
    print(f"  [{status}] {c['feature1']} vs {c['feature2']}  r={c['correlation']:.3f}  strength={c['strength']}  scatterPoints={pts}")

print()
if all_ok and corrs:
    print("PASS — all correlation pairs have scatterData")
else:
    print("FAIL — some pairs missing scatterData")
