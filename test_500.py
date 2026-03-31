import urllib.request, json, io, csv

API = 'http://localhost:8000'
KEY = 'dev-local-9f4e1d2c7a8b3f6e'

# Upload dataset
buf = io.StringIO()
csv.writer(buf).writerows([
    ['age', 'salary', 'dept', 'hired'],
    [25, 50000, 'Eng', 1], [30, 60000, 'Mkt', 0], [35, 70000, 'Eng', 1],
    [40, 80000, 'HR', 1],  [45, 55000, 'Mkt', 0], [28, 45000, 'Eng', 0],
    [33, 75000, 'HR', 1],  [50, 90000, 'Eng', 1], [22, 35000, 'Mkt', 0],
    [38, 65000, 'HR', 1],  [26, 48000, 'Eng', 0], [31, 62000, 'Mkt', 1],
    [44, 85000, 'HR', 1],  [29, 52000, 'Eng', 0], [37, 72000, 'Mkt', 1],
])
csv_bytes = buf.getvalue().encode()
boundary = 'b123'
crlf = b'\r\n'
disp = b'Content-Disposition: form-data; name="file"; filename="t.csv"'
body = (b'--' + boundary.encode() + crlf + disp + crlf
        + b'Content-Type: text/csv' + crlf + crlf
        + csv_bytes + crlf + b'--' + boundary.encode() + b'--' + crlf)
req = urllib.request.Request(API + '/api/datasets/upload', data=body, method='POST')
req.add_header('Content-Type', 'multipart/form-data; boundary=' + boundary)
req.add_header('X-API-Key', KEY)
req.add_header('X-Tenant-Id', 'public')
with urllib.request.urlopen(req, timeout=10) as r:
    ds = json.loads(r.read())
did = ds['id']
print('dataset:', did, '| rows:', ds['rowCount'])


def post(path, payload_dict):
    data = json.dumps(payload_dict).encode()
    req2 = urllib.request.Request(API + path, data=data, method='POST')
    req2.add_header('Content-Type', 'application/json')
    req2.add_header('X-API-Key', KEY)
    req2.add_header('X-Tenant-Id', 'public')
    try:
        with urllib.request.urlopen(req2, timeout=90) as r:
            resp = json.loads(r.read())
            models = resp.get('models', [])
            print(f'OK   {path} | task={resp.get("task_type", resp.get("taskType", "?"))} | models={len(models)}')
            if models:
                m = models[0]
                print(f'     best={m.get("type","?")} acc={m.get("accuracy")} r2={m.get("r2")}')
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'ERR  {path} [{e.code}]: {body[:300]}')
    except Exception as ex:
        print(f'EXC  {path}: {ex}')


print('\n--- ml/train classification ---')
post('/api/ml/train', {
    'datasetId': did, 'targetColumn': 'hired', 'taskType': 'classification',
    'useGpu': False, 'hyperparameterTuning': False, 'nTrials': 5, 'cvFolds': 3, 'testSize': 0.2
})

print('\n--- ml/train regression ---')
post('/api/ml/train', {
    'datasetId': did, 'targetColumn': 'salary', 'taskType': 'regression',
    'useGpu': False, 'hyperparameterTuning': False, 'nTrials': 5, 'cvFolds': 3, 'testSize': 0.2
})

print('\n--- ml/train-selected classification ---')
post('/api/ml/train-selected', {
    'dataset_id': did, 'model_name': 'random forest',
    'x_columns': ['age', 'salary'], 'y_columns': ['hired'], 'task_type': 'classification'
})

print('\n--- ml/train-selected regression ---')
post('/api/ml/train-selected', {
    'dataset_id': did, 'model_name': 'random forest',
    'x_columns': ['age', 'dept'], 'y_columns': ['salary'], 'task_type': 'regression'
})

print('\n--- ml/cluster ---')
post('/api/ml/cluster', {
    'dataset_id': did, 'x_columns': ['age', 'salary'], 'algorithm': 'kmeans', 'n_clusters': 2
})

print('\n--- analysis/auto eda ---')
post('/api/analysis/auto', {
    'session_id': 'test', 'dataset_id': did, 'analysis_type': 'eda'
})
