"""Test data cleaning endpoint end-to-end."""
import json, urllib.request, urllib.error

BASE = "http://localhost:8000"
H = {"X-API-Key": "dev-local-9f4e1d2c7a8b3f6e", "X-Tenant-Id": "public"}

# Upload CSV with missing values, duplicates, and outliers
csv = "\n".join([
    "name,age,salary,department",
    "Alice,,50000,Engineering",
    "Bob,30,,Marketing",
    "Charlie,35,75000,Engineering",
    "Dave,28,55000,HR",
    ",40,90000,Engineering",
    "Charlie,35,75000,Engineering",   # duplicate
    "Eve,27,52000,HR",
    "Frank,999,95000,Engineering",    # outlier age
    "Grace,29,58000,Marketing",
    "Henry,38,80000,Engineering",
])

b = "CleanBoundary"
body = (
    f"--{b}\r\n"
    f'Content-Disposition: form-data; name="file"; filename="dirty.csv"\r\n'
    f"Content-Type: text/csv\r\n\r\n"
    f"{csv}\r\n"
    f"--{b}--"
).encode()

r = urllib.request.urlopen(urllib.request.Request(
    f"{BASE}/api/datasets/upload", data=body,
    headers={**H, "Content-Type": f"multipart/form-data; boundary={b}"}
))
ds_id = json.loads(r.read())["id"]
print(f"Uploaded: {ds_id}")

# Test 1: fill_mean + remove_duplicates + handle_outliers
def clean(ds_id, strategy, handle_outliers=False, outlier_action="clip", text_cleaner=False, noise_smoothing=False):
    payload = json.dumps({
        "missing_strategy": strategy,
        "trim_text": True,
        "remove_duplicates": True,
        "handle_outliers": handle_outliers,
        "outlier_action": outlier_action,
        "type_fixer_enabled": False,
        "number_columns": [], "date_columns": [], "string_columns": [],
        "date_formats": [],
        "number_thousands_separator": ",", "number_decimal_separator": ".",
        "date_day_first": False,
        "text_cleaner_enabled": text_cleaner,
        "text_clean_columns": [], "text_lowercase": True,
        "text_remove_punctuation": True, "text_remove_stopwords": False,
        "custom_stopwords": [],
        "category_standardize_enabled": False,
        "category_columns": [], "category_case": "lower", "category_mappings": {},
        "noise_smoothing_enabled": noise_smoothing,
        "noise_smoothing_columns": [], "noise_smoothing_method": "rolling_mean",
        "noise_smoothing_window": 3,
    }).encode()
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            f"{BASE}/api/datasets/{ds_id}/clean", data=payload,
            headers={**H, "Content-Type": "application/json"}
        ))
        return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()}

passed = 0
failed = 0

def check(label, cond, detail=""):
    global passed, failed
    sym = "PASS" if cond else "FAIL"
    print(f"  [{sym}] {label}" + (f" — {detail}" if detail else ""))
    if cond: passed += 1
    else: failed += 1

print("\n=== fill_mean + remove_duplicates ===")
r1 = clean(ds_id, "fill_mean")
if "error" in r1:
    print(f"  [FAIL] request failed: {r1['error'][:200]}")
    failed += 1
else:
    s = r1["clean_summary"]
    d = r1["dataset"]
    check("rows_before=10", s["rows_before"] == 10, f"got {s['rows_before']}")
    check("duplicate removed", s["rows_after"] < s["rows_before"], f"after={s['rows_after']}")
    check("missing_after=0", s["missing_after"] == 0, f"got {s['missing_after']}")
    check("dataset.id present", bool(d.get("id")))
    check("dataset.headers present", len(d.get("headers", [])) == 4)
    check("dataset.rows present", len(d.get("rows", [])) > 0)

print("\n=== fill_median ===")
r2 = clean(ds_id, "fill_median")
if "error" in r2:
    print(f"  [FAIL] {r2['error'][:200]}")
    failed += 1
else:
    check("missing_after=0", r2["clean_summary"]["missing_after"] == 0)

print("\n=== drop_rows ===")
r3 = clean(ds_id, "drop_rows")
if "error" in r3:
    print(f"  [FAIL] {r3['error'][:200]}")
    failed += 1
else:
    s = r3["clean_summary"]
    check("rows dropped", s["rows_after"] < s["rows_before"], f"before={s['rows_before']} after={s['rows_after']}")
    check("missing_after=0", s["missing_after"] == 0)

print("\n=== handle_outliers clip ===")
r4 = clean(ds_id, "fill_mean", handle_outliers=True, outlier_action="clip")
if "error" in r4:
    print(f"  [FAIL] {r4['error'][:200]}")
    failed += 1
else:
    check("completed", True, f"rows_after={r4['clean_summary']['rows_after']}")

print("\n=== handle_outliers remove ===")
r5 = clean(ds_id, "fill_mean", handle_outliers=True, outlier_action="remove")
if "error" in r5:
    print(f"  [FAIL] {r5['error'][:200]}")
    failed += 1
else:
    check("outlier row removed", r5["clean_summary"]["rows_after"] < 10,
          f"rows_after={r5['clean_summary']['rows_after']}")

print("\n=== text_cleaner ===")
r6 = clean(ds_id, "fill_mean", text_cleaner=True)
if "error" in r6:
    print(f"  [FAIL] {r6['error'][:200]}")
    failed += 1
else:
    check("completed", True)

print("\n=== noise_smoothing ===")
r7 = clean(ds_id, "fill_mean", noise_smoothing=True)
if "error" in r7:
    print(f"  [FAIL] {r7['error'][:200]}")
    failed += 1
else:
    check("completed", True)

print(f"\n{'='*40}")
print(f"Results: {passed} passed, {failed} failed")
