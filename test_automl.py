"""End-to-end AutoML test — covers all 3 workflows: selected, compare, cluster."""
import json, urllib.request, urllib.error

BASE = "http://localhost:8000"
H = {"X-API-Key": "dev-local-9f4e1d2c7a8b3f6e", "X-Tenant-Id": "public"}
J = {**H, "Content-Type": "application/json"}

passed = failed = 0

def check(label, cond, detail=""):
    global passed, failed
    sym = "PASS" if cond else "FAIL"
    print(f"  [{sym}] {label}" + (f" — {detail}" if detail else ""))
    if cond: passed += 1
    else: failed += 1

def post(path, body):
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(), headers=J, method="POST")
    try:
        r = urllib.request.urlopen(req, timeout=120)
        return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        try: detail = json.loads(e.read().decode()).get("detail", "")
        except: detail = e.read().decode() if hasattr(e, 'read') else ""
        return None, f"HTTP {e.code}: {detail}"
    except Exception as e:
        return None, str(e)

def upload_csv(csv_text, name="test.csv"):
    b = "Bnd"
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
            f"Content-Type: text/csv\r\n\r\n").encode() + csv_text.encode() + f"\r\n--{b}--".encode()
    req = urllib.request.Request(f"{BASE}/api/datasets/upload", data=body,
        headers={**H, "Content-Type": f"multipart/form-data; boundary={b}"}, method="POST")
    r = urllib.request.urlopen(req, timeout=30)
    return json.loads(r.read())

# ── Upload dataset ────────────────────────────────────────────────────────────
print("\n=== Setup: Upload dataset ===")
csv = "\n".join([
    "TV,radio,newspaper,sales,category",
    "230,37,69,22,A", "44,39,45,10,B", "17,45,69,9,A", "151,41,58,18,B",
    "180,10,58,12,A", "8,48,75,7,B",   "57,32,23,11,A", "120,19,11,13,B",
    "8,2,1,4,A",     "199,2,21,10,B",  "66,5,24,8,A",   "214,24,4,17,B",
    "23,35,65,9,A",  "97,7,7,9,B",     "204,32,46,19,A","195,47,52,22,B",
    "67,43,45,12,A", "281,39,37,24,B", "69,9,9,9,A",    "147,6,23,11,B",
])
ds = upload_csv(csv, "ads.csv")
ds_id = ds["id"]
print(f"  Uploaded: {ds_id} rows={ds['rowCount']} cols={ds['colCount']}")

# ── 1. ml/train-selected — regression ────────────────────────────────────────
print("\n=== 1. train-selected: Linear Regression ===")
r1, e1 = post("/api/ml/train-selected", {
    "dataset_id": ds_id, "model_name": "Linear Regression",
    "x_columns": ["TV", "radio", "newspaper"], "y_columns": ["sales"],
    "task_type": "regression", "test_size": 0.2
})
if e1: print(f"  [FAIL] {e1}"); failed += 1
else:
    check("task_type=regression",   r1.get("task_type") == "regression",    r1.get("task_type"))
    check("metrics.r2 present",     r1.get("metrics", {}).get("r2") is not None, str(r1.get("metrics",{}).get("r2")))
    check("metrics.mae present",    r1.get("metrics", {}).get("mae") is not None)
    check("total_rows present",     r1.get("total_rows") is not None,       str(r1.get("total_rows")))
    check("train_rows present",     r1.get("train_rows") is not None,       str(r1.get("train_rows")))
    check("feature_count present",  r1.get("feature_count") is not None,    str(r1.get("feature_count")))
    check("trainingTime present",   r1.get("trainingTime") is not None)
    check("model_id present",       bool(r1.get("model_id")))
    check("featureImportance list", isinstance(r1.get("featureImportance"), list))

# ── 2. train-selected — classification ───────────────────────────────────────
print("\n=== 2. train-selected: Logistic Regression (classification) ===")
r2, e2 = post("/api/ml/train-selected", {
    "dataset_id": ds_id, "model_name": "Logistic Regression",
    "x_columns": ["TV", "radio", "newspaper", "sales"], "y_columns": ["category"],
    "task_type": "classification", "test_size": 0.2
})
if e2: print(f"  [FAIL] {e2}"); failed += 1
else:
    check("task_type=classification", r2.get("task_type") == "classification")
    check("metrics.accuracy present", r2.get("metrics", {}).get("accuracy") is not None,
          str(r2.get("metrics",{}).get("accuracy")))
    check("metrics.f1 present",       r2.get("metrics", {}).get("f1") is not None)
    check("total_rows present",       r2.get("total_rows") is not None)
    check("confusion_matrix present", bool(r2.get("confusion_matrix", {}).get("matrix")))

# ── 3. train-selected — Huber Regressor (was broken before) ──────────────────
print("\n=== 3. train-selected: Huber Regressor (previously broken) ===")
r3, e3 = post("/api/ml/train-selected", {
    "dataset_id": ds_id, "model_name": "Huber Regressor",
    "x_columns": ["TV", "radio", "newspaper"], "y_columns": ["sales"],
    "task_type": "regression"
})
if e3: print(f"  [FAIL] {e3}"); failed += 1
else:
    check("Huber trained OK",       r3.get("task_type") == "regression")
    check("metrics.r2 present",     r3.get("metrics", {}).get("r2") is not None,
          str(r3.get("metrics",{}).get("r2")))
    check("total_rows not None",    r3.get("total_rows") is not None, str(r3.get("total_rows")))

# ── 4. train-selected — Gradient Boosting ────────────────────────────────────
print("\n=== 4. train-selected: Gradient Boosting ===")
r4, e4 = post("/api/ml/train-selected", {
    "dataset_id": ds_id, "model_name": "Gradient Boosting",
    "x_columns": ["TV", "radio", "newspaper"], "y_columns": ["sales"],
    "task_type": "regression"
})
if e4: print(f"  [FAIL] {e4}"); failed += 1
else:
    check("Gradient Boosting OK",   r4.get("task_type") == "regression")
    check("metrics.r2 present",     r4.get("metrics", {}).get("r2") is not None)

# ── 5. ml/train — compare all models ─────────────────────────────────────────
print("\n=== 5. ml/train: compare all (regression) ===")
r5, e5 = post("/api/ml/train", {
    "datasetId": ds_id, "targetColumn": "sales", "taskType": "regression",
    "useGpu": False, "hyperparameterTuning": False, "nTrials": 10,
    "cvFolds": 3, "testSize": 0.2
})
if e5: print(f"  [FAIL] {e5}"); failed += 1
else:
    check("models list non-empty",  len(r5.get("models", [])) > 0,  f"count={len(r5.get('models',[]))}")
    check("best_model_name present",bool(r5.get("best_model_name")), r5.get("best_model_name"))
    check("total_rows present",     r5.get("total_rows") is not None, str(r5.get("total_rows")))
    check("train_rows present",     r5.get("train_rows") is not None, str(r5.get("train_rows")))
    check("feature_count present",  r5.get("feature_count") is not None, str(r5.get("feature_count")))
    check("trainingTime present",   r5.get("trainingTime") is not None)
    check("model_id present",       bool(r5.get("model_id")))
    check("x_columns present",      bool(r5.get("x_columns")))
    check("y_columns present",      bool(r5.get("y_columns")))

# ── 6. ml/train — compare all (classification) ───────────────────────────────
print("\n=== 6. ml/train: compare all (classification) ===")
r6, e6 = post("/api/ml/train", {
    "datasetId": ds_id, "targetColumn": "category", "taskType": "classification",
    "useGpu": False, "hyperparameterTuning": False, "nTrials": 10,
    "cvFolds": 3, "testSize": 0.2
})
if e6: print(f"  [FAIL] {e6}"); failed += 1
else:
    check("models list non-empty",  len(r6.get("models", [])) > 0)
    check("best_model_name present",bool(r6.get("best_model_name")))
    check("total_rows present",     r6.get("total_rows") is not None)

# ── 7. ml/cluster — kmeans ────────────────────────────────────────────────────
print("\n=== 7. ml/cluster: KMeans ===")
r7, e7 = post("/api/ml/cluster", {
    "dataset_id": ds_id, "x_columns": ["TV", "radio", "newspaper", "sales"],
    "algorithm": "kmeans", "n_clusters": 3
})
if e7: print(f"  [FAIL] {e7}"); failed += 1
else:
    check("task_type=clustering",   r7.get("task_type") == "clustering")
    check("silhouette present",     r7.get("metrics", {}).get("silhouette") is not None,
          str(r7.get("metrics",{}).get("silhouette")))
    check("cluster_preview present",bool(r7.get("cluster_preview")))
    check("total_rows present",     r7.get("total_rows") is not None)
    check("model_id present",       bool(r7.get("model_id")))

# ── 8. ml/cluster — dbscan ───────────────────────────────────────────────────
print("\n=== 8. ml/cluster: DBSCAN ===")
r8, e8 = post("/api/ml/cluster", {
    "dataset_id": ds_id, "x_columns": ["TV", "radio"],
    "algorithm": "dbscan", "eps": 30, "min_samples": 2
})
if e8: print(f"  [FAIL] {e8}"); failed += 1
else:
    check("task_type=clustering",   r8.get("task_type") == "clustering")
    check("model_id present",       bool(r8.get("model_id")))

# ── 9. Bad model name → 400 ──────────────────────────────────────────────────
print("\n=== 9. Unknown model name → 400 ===")
r9, e9 = post("/api/ml/train-selected", {
    "dataset_id": ds_id, "model_name": "NonExistentModel",
    "x_columns": ["TV"], "y_columns": ["sales"], "task_type": "regression"
})
check("rejected with 400",  e9 is not None and "400" in e9, e9)
check("error lists available models", e9 and "Available" in e9, e9)

# ── 10. Missing target column → 400 ──────────────────────────────────────────
print("\n=== 10. Missing target column → 400 ===")
r10, e10 = post("/api/ml/train-selected", {
    "dataset_id": ds_id, "model_name": "Linear Regression",
    "x_columns": ["TV"], "y_columns": ["nonexistent_col"], "task_type": "regression"
})
check("rejected with 400",  e10 is not None and "400" in e10, e10)

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed")
if failed == 0:
    print("ALL AutoML CHECKS PASSED")
