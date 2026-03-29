import json, urllib.request

b = "Bnd"
csv = "TV,radio,newspaper,sales\n230,37,69,22\n44,39,45,10\n17,45,69,9\n151,41,58,18\n180,10,58,12\n8,48,75,7\n57,32,23,11\n120,19,11,13\n8,2,1,4\n199,2,2,10"
body = (
    f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"ads.csv\"\r\n"
    f"Content-Type: text/csv\r\n\r\n{csv}\r\n--{b}--"
).encode()
H = {"X-API-Key": "dev-local-9f4e1d2c7a8b3f6e", "X-Tenant-Id": "public"}
r = urllib.request.urlopen(urllib.request.Request(
    "http://localhost:8000/api/datasets/upload", data=body,
    headers={**H, "Content-Type": f"multipart/form-data; boundary={b}"}
))
ds_id = json.loads(r.read())["id"]

payload = json.dumps({"session_id": "s1", "dataset_id": ds_id, "analysis_type": "eda"}).encode()
r2 = urllib.request.urlopen(urllib.request.Request(
    "http://localhost:8000/api/analysis/auto", data=payload,
    headers={**H, "Content-Type": "application/json"}
))
eda = json.loads(r2.read())["eda"]

print("=== insights ===")
print("count:", len(eda.get("insights", [])))
for ins in eda.get("insights", []):
    print("  keys:", list(ins.keys()))
    print("  type:", ins.get("type"), "| title:", ins.get("title"))
    print("  has 'action':", "action" in ins)
    print("  has 'icon':", "icon" in ins)

print()
print("=== sub-insight arrays ===")
for key in ["trendInsights", "segmentationInsights", "behavioralInsights", "comparativeInsights"]:
    arr = eda.get(key, [])
    print(f"{key}: {len(arr)} items")
    if arr:
        print(f"  first item keys: {list(arr[0].keys())}")
        print(f"  first item: {arr[0]}")
