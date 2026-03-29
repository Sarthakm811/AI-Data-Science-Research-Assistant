"""End-to-end verification script for the local dev stack."""
import io
import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
HEADERS = {
    "X-API-Key": "dev-local-9f4e1d2c7a8b3f6e",
    "X-Tenant-Id": "public",
    "Content-Type": "application/json",
}

def req(method, path, body=None, headers=None, multipart=None):
    url = BASE + path
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    if multipart:
        data, ct = multipart
        h["Content-Type"] = ct
        req_obj = urllib.request.Request(url, data=data, headers=h, method=method)
    elif body is not None:
        payload = json.dumps(body).encode()
        req_obj = urllib.request.Request(url, data=payload, headers=h, method=method)
    else:
        req_obj = urllib.request.Request(url, headers=h, method=method)
    try:
        with urllib.request.urlopen(req_obj, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body[:300]}")
        raise

def upload_csv(csv_text, filename="test.csv"):
    boundary = "VerifyBoundary123"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: text/csv\r\n\r\n"
        f"{csv_text}\r\n"
        f"--{boundary}--"
    ).encode()
    ct = f"multipart/form-data; boundary={boundary}"
    return req("POST", "/api/datasets/upload", multipart=(body, ct))

CSV = "\n".join([
    "age,salary,department,target",
    "25,50000,Engineering,1",
    "30,60000,Marketing,0",
    "35,75000,Engineering,1",
    "28,55000,HR,0",
    "40,90000,Engineering,1",
    "32,65000,Marketing,1",
    "27,52000,HR,0",
    "45,95000,Engineering,1",
    "29,58000,Marketing,0",
    "38,80000,Engineering,1",
])

passed = 0
failed = 0

def check(label, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  [PASS] {label}" + (f" — {detail}" if detail else ""))
        passed += 1
    else:
        print(f"  [FAIL] {label}" + (f" — {detail}" if detail else ""))
        failed += 1

print("\n=== 1. Health ===")
h = req("GET", "/health")
check("status healthy", h.get("status") == "healthy", f"status={h.get('status')}")

print("\n=== 2. Upload dataset ===")
up = upload_csv(CSV)
ds_id = up.get("id")
check("has id", bool(ds_id), f"id={ds_id}")
check("rowCount=10", up.get("rowCount") == 10, f"rowCount={up.get('rowCount')}")
check("colCount=4", up.get("colCount") == 4, f"colCount={up.get('colCount')}")
check("has headers", len(up.get("headers", [])) == 4)

print("\n=== 3. Session ===")
sess = req("POST", "/api/sessions", {"user_id": None})
sid = sess.get("session_id")
check("session_id present", bool(sid), f"sid={sid}")

print("\n=== 4. EDA ===")
eda_resp = req("POST", "/api/analysis/auto", {"session_id": sid, "dataset_id": ds_id, "analysis_type": "eda"})
eda = eda_resp.get("eda", {})
check("status completed", eda_resp.get("status") == "completed", f"status={eda_resp.get('status')}")
check("qualityScore present", eda.get("qualityScore") is not None, f"score={eda.get('qualityScore')}")
check("statistics non-empty", len(eda.get("statistics", [])) > 0, f"count={len(eda.get('statistics', []))}")
check("correlations present", isinstance(eda.get("correlations"), list), f"count={len(eda.get('correlations', []))}")
check("missingData present", isinstance(eda.get("missingData"), list), f"count={len(eda.get('missingData', []))}")
check("summary has rows", eda.get("summary", {}).get("rows") == 10)

print("\n=== 5. Statistics & Math ===")
stats = req("POST", "/api/statistics-math/analyze", {
    "dataset_id": ds_id, "numeric_column": "age",
    "group_column": "department", "confidence_level": 0.95
})
check("probability.mean present", stats.get("probability", {}).get("mean") is not None,
      f"mean={stats.get('probability', {}).get('mean')}")
check("confidence_intervals present", stats.get("confidence_intervals", {}).get("lower") is not None)
check("hypothesis_testing present", isinstance(stats.get("hypothesis_testing"), dict))

print("\n=== 6. ML train-selected ===")
ml = req("POST", "/api/ml/train-selected", {
    "dataset_id": ds_id, "model_name": "Random Forest",
    "x_columns": ["age", "salary"], "y_columns": ["target"], "task_type": "classification"
})
check("task_type classification", ml.get("task_type") == "classification", f"task={ml.get('task_type')}")
check("metrics.accuracy present", ml.get("metrics", {}).get("accuracy") is not None,
      f"acc={ml.get('metrics', {}).get('accuracy')}")
check("feature_importance present", len(ml.get("feature_importance", [])) > 0)
check("model_id present", bool(ml.get("model_id")))

print("\n=== 7. ML cluster ===")
cl = req("POST", "/api/ml/cluster", {
    "dataset_id": ds_id, "x_columns": ["age", "salary"],
    "algorithm": "kmeans", "n_clusters": 3
})
check("task_type clustering", cl.get("task_type") == "clustering", f"task={cl.get('task_type')}")
check("silhouette present", cl.get("metrics", {}).get("silhouette") is not None,
      f"sil={cl.get('metrics', {}).get('silhouette')}")
check("cluster_preview present", bool(cl.get("cluster_preview")))

print("\n=== 8. ML compare all ===")
tr = req("POST", "/api/ml/train", {
    "datasetId": ds_id, "targetColumn": "target", "taskType": "classification",
    "useGpu": False, "hyperparameterTuning": False, "nTrials": 10, "cvFolds": 3, "testSize": 0.2
})
check("models list non-empty", len(tr.get("models", [])) > 0, f"count={len(tr.get('models', []))}")
check("best_model_name present", bool(tr.get("best_model_name")), f"best={tr.get('best_model_name')}")

print("\n=== 9. Chat ===")
chat = req("POST", "/api/chat", {"message": "What columns does this dataset have?", "dataset_id": ds_id})
check("response present", bool(chat.get("response")), f"len={len(chat.get('response',''))}")

print("\n=== 10. Session history ===")
hist = req("GET", f"/api/sessions/{sid}/history")
check("history is list", isinstance(hist.get("history"), list))

print("\n=== 11. Frontend reachable ===")
try:
    with urllib.request.urlopen("http://localhost:3000/", timeout=5) as r:
        check("frontend 200", r.status == 200, f"status={r.status}")
except Exception as e:
    check("frontend 200", False, str(e))

print(f"\n{'='*40}")
print(f"Results: {passed} passed, {failed} failed")
if failed == 0:
    print("ALL CHECKS PASSED — app is working correctly")
else:
    print(f"ATTENTION: {failed} check(s) failed")
sys.exit(0 if failed == 0 else 1)
