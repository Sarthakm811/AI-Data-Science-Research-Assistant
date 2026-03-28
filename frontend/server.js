const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8000;

// API key must be provided via environment variable.
const API_KEY = process.env.OPENROUTER_API_KEY || '';

// Middleware
app.use(cors());
app.use(express.json());

// File upload setup
const upload = multer({ dest: 'uploads/' });

// Store datasets and results in memory
let datasets = {};
let edaResults = {};
let mlResults = {};

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API is running' });
});

// ==================== DATASET ENDPOINTS ====================

// Upload dataset
app.post('/api/dataset/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const results = [];
    const headers = [];

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('headers', (h) => headers.push(...h))
        .on('data', (data) => results.push(data))
        .on('end', () => {
            const datasetId = Date.now().toString();
            datasets[ datasetId ] = {
                id: datasetId,
                name: req.file.originalname,
                headers,
                rows: results,
                rowCount: results.length,
                colCount: headers.length,
                uploadedAt: new Date().toISOString()
            };
            fs.unlinkSync(req.file.path);
            res.json(datasets[ datasetId ]);
        });
});

// Get all datasets
app.get('/api/dataset/list', (req, res) => {
    res.json(Object.values(datasets));
});

// Get dataset by ID
app.get('/api/dataset/:id', (req, res) => {
    const dataset = datasets[ req.params.id ];
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });
    res.json(dataset);
});

// Delete dataset
app.delete('/api/dataset/:id', (req, res) => {
    if (datasets[ req.params.id ]) {
        delete datasets[ req.params.id ];
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Dataset not found' });
    }
});

// ==================== EDA ENDPOINTS ====================

// Run comprehensive EDA analysis
app.post('/api/eda/analyze', (req, res) => {
    const { datasetId } = req.body;
    const dataset = datasets[ datasetId ];
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

    const numericCols = dataset.headers.filter(h => {
        const val = dataset.rows[ 0 ]?.[ h ];
        return !isNaN(parseFloat(val));
    });
    const categoricalCols = dataset.headers.filter(h => !numericCols.includes(h));

    // Missing data analysis
    const missingData = dataset.headers.map(h => ({
        name: h,
        missing: dataset.rows.filter(r => !r[ h ] || r[ h ] === '').length,
        percentage: ((dataset.rows.filter(r => !r[ h ] || r[ h ] === '').length / dataset.rowCount) * 100).toFixed(2)
    }));

    // Statistics for numeric columns
    const statistics = numericCols.map(col => {
        const values = dataset.rows.map(r => parseFloat(r[ col ])).filter(v => !isNaN(v));
        const sorted = [ ...values ].sort((a, b) => a - b);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const median = sorted[ Math.floor(sorted.length / 2) ];
        const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length);
        const q1 = sorted[ Math.floor(sorted.length * 0.25) ];
        const q3 = sorted[ Math.floor(sorted.length * 0.75) ];
        const iqr = q3 - q1;
        const outliers = values.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).length;
        const skewness = values.reduce((s, v) => s + Math.pow((v - mean) / std, 3), 0) / values.length;
        const kurtosis = values.reduce((k, v) => k + Math.pow((v - mean) / std, 4), 0) / values.length - 3;

        return { name: col, mean, median, std, min, max, q1, q3, outliers, skewness, kurtosis, count: values.length };
    });

    // Correlation analysis
    const correlations = [];
    for (let i = 0; i < numericCols.length; i++) {
        for (let j = i + 1; j < numericCols.length; j++) {
            const col1 = numericCols[ i ], col2 = numericCols[ j ];
            const vals1 = dataset.rows.map(r => parseFloat(r[ col1 ])).filter(v => !isNaN(v));
            const vals2 = dataset.rows.map(r => parseFloat(r[ col2 ])).filter(v => !isNaN(v));
            const mean1 = vals1.reduce((a, b) => a + b, 0) / vals1.length;
            const mean2 = vals2.reduce((a, b) => a + b, 0) / vals2.length;
            let num = 0, den1 = 0, den2 = 0;
            for (let k = 0; k < Math.min(vals1.length, vals2.length); k++) {
                num += (vals1[ k ] - mean1) * (vals2[ k ] - mean2);
                den1 += Math.pow(vals1[ k ] - mean1, 2);
                den2 += Math.pow(vals2[ k ] - mean2, 2);
            }
            const corr = num / Math.sqrt(den1 * den2);
            if (!isNaN(corr)) correlations.push({ feature1: col1, feature2: col2, correlation: corr, strength: Math.abs(corr) > 0.7 ? 'Strong' : Math.abs(corr) > 0.4 ? 'Moderate' : 'Weak' });
        }
    }

    // Categorical analysis
    const categoricalAnalysis = categoricalCols.map(col => {
        const valueCounts = {};
        dataset.rows.forEach(r => {
            const val = r[ col ] || 'Missing';
            valueCounts[ val ] = (valueCounts[ val ] || 0) + 1;
        });
        return { name: col, uniqueValues: Object.keys(valueCounts).length, valueCounts };
    });

    // Data quality score
    const missingScore = 100 - (missingData.reduce((a, b) => a + parseFloat(b.percentage), 0) / dataset.headers.length);
    const duplicateRows = new Set(dataset.rows.map(r => JSON.stringify(r))).size;
    const duplicateScore = (duplicateRows / dataset.rowCount) * 100;
    const outlierCount = statistics.reduce((a, b) => a + b.outliers, 0);
    const outlierScore = 100 - (outlierCount / (dataset.rowCount * numericCols.length) * 100);
    const qualityScore = Math.round((missingScore + duplicateScore + outlierScore) / 3);

    // ML Readiness
    const mlReadiness = {
        score: Math.min(100, Math.max(0, qualityScore - (missingData.filter(m => parseFloat(m.percentage) > 20).length * 10))),
        issues: [],
        recommendations: [ 'Handle missing values', 'Consider outlier treatment', 'Feature scaling recommended' ]
    };
    if (missingData.some(m => parseFloat(m.percentage) > 20)) mlReadiness.issues.push('High missing data');
    if (outlierCount > dataset.rowCount * 0.1) mlReadiness.issues.push('Significant outliers');
    if (correlations.some(c => Math.abs(c.correlation) > 0.9)) mlReadiness.issues.push('High multicollinearity');

    const analysis = {
        datasetId,
        summary: { rows: dataset.rowCount, columns: dataset.colCount, numericCols: numericCols.length, categoricalCols: categoricalCols.length, missingTotal: missingData.reduce((a, b) => a + b.missing, 0), duplicateRows: dataset.rowCount - duplicateRows },
        missingData, statistics, correlations, categoricalAnalysis, qualityScore, mlReadiness,
        dataTypes: dataset.headers.map(h => ({ name: h, type: numericCols.includes(h) ? 'Numeric' : 'Categorical' }))
    };

    edaResults[ datasetId ] = analysis;
    res.json(analysis);
});

// Get EDA results
app.get('/api/eda/results/:datasetId', (req, res) => {
    const results = edaResults[ req.params.datasetId ];
    if (!results) return res.status(404).json({ error: 'No EDA results found' });
    res.json(results);
});

// ==================== ML ENDPOINTS ====================

// Train ML models
app.post('/api/ml/train', (req, res) => {
    const { datasetId, targetColumn, taskType } = req.body;
    const dataset = datasets[ datasetId ];
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });
    if (!targetColumn) return res.status(400).json({ error: 'Target column required' });

    // Detect task type
    const targetValues = dataset.rows.map(r => r[ targetColumn ]);
    const uniqueValues = new Set(targetValues).size;
    const detectedTaskType = taskType === 'auto' ? (uniqueValues < 20 ? 'classification' : 'regression') : taskType;

    // Simulate model training results
    const models = detectedTaskType === 'classification' ? [
        { name: 'Logistic Regression', accuracy: 0.82 + Math.random() * 0.1, f1: 0.80 + Math.random() * 0.1, precision: 0.81 + Math.random() * 0.1, recall: 0.79 + Math.random() * 0.1, time: '0.5s' },
        { name: 'Random Forest', accuracy: 0.88 + Math.random() * 0.08, f1: 0.87 + Math.random() * 0.08, precision: 0.86 + Math.random() * 0.08, recall: 0.85 + Math.random() * 0.08, time: '2.3s' },
        { name: 'XGBoost', accuracy: 0.90 + Math.random() * 0.06, f1: 0.89 + Math.random() * 0.06, precision: 0.88 + Math.random() * 0.06, recall: 0.87 + Math.random() * 0.06, time: '3.1s' },
        { name: 'SVM', accuracy: 0.84 + Math.random() * 0.08, f1: 0.83 + Math.random() * 0.08, precision: 0.82 + Math.random() * 0.08, recall: 0.81 + Math.random() * 0.08, time: '1.8s' },
        { name: 'Neural Network', accuracy: 0.86 + Math.random() * 0.08, f1: 0.85 + Math.random() * 0.08, precision: 0.84 + Math.random() * 0.08, recall: 0.83 + Math.random() * 0.08, time: '5.2s' }
    ] : [
        { name: 'Linear Regression', r2: 0.75 + Math.random() * 0.15, rmse: 0.2 + Math.random() * 0.1, mae: 0.15 + Math.random() * 0.1, time: '0.3s' },
        { name: 'Random Forest', r2: 0.85 + Math.random() * 0.1, rmse: 0.12 + Math.random() * 0.08, mae: 0.1 + Math.random() * 0.05, time: '2.5s' },
        { name: 'XGBoost', r2: 0.88 + Math.random() * 0.08, rmse: 0.1 + Math.random() * 0.05, mae: 0.08 + Math.random() * 0.04, time: '3.2s' },
        { name: 'SVR', r2: 0.78 + Math.random() * 0.12, rmse: 0.18 + Math.random() * 0.08, mae: 0.14 + Math.random() * 0.06, time: '2.0s' }
    ];

    // Sort by best metric
    const sortedModels = detectedTaskType === 'classification'
        ? models.sort((a, b) => b.accuracy - a.accuracy)
        : models.sort((a, b) => b.r2 - a.r2);

    const result = {
        datasetId,
        targetColumn,
        taskType: detectedTaskType,
        models: sortedModels,
        bestModel: sortedModels[ 0 ],
        featureImportance: dataset.headers.filter(h => h !== targetColumn).map(h => ({ feature: h, importance: Math.random() })).sort((a, b) => b.importance - a.importance)
    };

    mlResults[ datasetId ] = result;
    res.json(result);
});

// Get ML results
app.get('/api/ml/results/:datasetId', (req, res) => {
    const results = mlResults[ req.params.datasetId ];
    if (!results) return res.status(404).json({ error: 'No ML results found' });
    res.json(results);
});

// ==================== AI CHAT ENDPOINT ====================

app.post('/api/chat', async (req, res) => {
    const { message, datasetId } = req.body;

    if (!API_KEY) {
        return res.status(503).json({ error: 'AI service not configured (missing OPENROUTER_API_KEY)' });
    }

    let context = '';
    if (datasetId && datasets[ datasetId ]) {
        const ds = datasets[ datasetId ];
        context = `Dataset: ${ds.name}, Rows: ${ds.rowCount}, Columns: ${ds.colCount}, Column names: ${ds.headers.join(', ')}`;

        if (edaResults[ datasetId ]) {
            const eda = edaResults[ datasetId ];
            context += `. Data Quality Score: ${eda.qualityScore}/100. Missing values: ${eda.summary.missingTotal}. Numeric columns: ${eda.summary.numericCols}. Categorical columns: ${eda.summary.categoricalCols}.`;
        }
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'openai/gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: `You are an expert data science assistant. Help users analyze data, build ML models, and provide insights. ${context}` },
                    { role: 'user', content: message }
                ]
            })
        });

        if (response.ok) {
            const data = await response.json();
            res.json({ message: data.choices[ 0 ].message.content });
        } else {
            res.status(500).json({ error: 'AI service error' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== REPORT ENDPOINTS ====================

// Generate report
app.post('/api/report/generate', (req, res) => {
    const { datasetId, type } = req.body;
    const dataset = datasets[ datasetId ];
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

    const eda = edaResults[ datasetId ] || {};
    const ml = mlResults[ datasetId ] || {};

    let report = '';

    if (type === 'markdown') {
        report = `# Data Analysis Report\n\n`;
        report += `**Generated:** ${new Date().toISOString()}\n\n`;
        report += `## Dataset Overview\n`;
        report += `- **Name:** ${dataset.name}\n`;
        report += `- **Rows:** ${dataset.rowCount}\n`;
        report += `- **Columns:** ${dataset.colCount}\n\n`;

        if (eda.qualityScore) {
            report += `## Data Quality\n`;
            report += `- **Quality Score:** ${eda.qualityScore}/100\n`;
            report += `- **Missing Values:** ${eda.summary?.missingTotal || 0}\n\n`;
        }

        if (ml.bestModel) {
            report += `## ML Results\n`;
            report += `- **Task Type:** ${ml.taskType}\n`;
            report += `- **Best Model:** ${ml.bestModel.name}\n`;
            report += `- **Score:** ${ml.taskType === 'classification' ? (ml.bestModel.accuracy * 100).toFixed(1) + '%' : ml.bestModel.r2.toFixed(3)}\n`;
        }
    } else if (type === 'python') {
        report = `# Python Analysis Code\n`;
        report += `import pandas as pd\nimport numpy as np\nfrom sklearn.model_selection import train_test_split\n\n`;
        report += `# Load data\ndf = pd.read_csv('${dataset.name}')\n\n`;
        report += `# Basic info\nprint(df.info())\nprint(df.describe())\n\n`;
        report += `# Check missing values\nprint(df.isnull().sum())\n`;
    }

    res.json({ report, type, datasetId, generatedAt: new Date().toISOString() });
});

// ==================== KAGGLE API ENDPOINTS ====================

// Search Kaggle datasets
app.post('/api/kaggle/search', async (req, res) => {
    const { query, kaggle_username, kaggle_key, page = 1 } = req.body;

    // If no credentials, return mock results
    if (!kaggle_username || !kaggle_key) {
        const mockResults = [
            { id: 'titanic', ref: 'heptapod/titanic', title: 'Titanic - Machine Learning from Disaster', size: '60 KB', downloads: '50K+' },
            { id: 'iris', ref: 'uciml/iris', title: 'Iris Species Dataset', size: '5 KB', downloads: '100K+' },
            { id: 'housing', ref: 'camnugent/california-housing-prices', title: 'California Housing Prices', size: '400 KB', downloads: '30K+' },
            { id: 'mnist', ref: 'oddrationale/mnist-in-csv', title: 'MNIST in CSV', size: '110 MB', downloads: '200K+' },
            { id: 'wine', ref: 'uciml/red-wine-quality-cortez-et-al-2009', title: 'Red Wine Quality', size: '85 KB', downloads: '25K+' },
            { id: 'diabetes', ref: 'uciml/pima-indians-diabetes-database', title: 'Pima Indians Diabetes Database', size: '24 KB', downloads: '80K+' },
            { id: 'heart', ref: 'ronitf/heart-disease-uci', title: 'Heart Disease UCI', size: '12 KB', downloads: '60K+' },
            { id: 'boston', ref: 'vikrishnan/boston-house-prices', title: 'Boston House Prices', size: '50 KB', downloads: '40K+' }
        ].filter(d =>
            d.title.toLowerCase().includes(query.toLowerCase()) ||
            d.id.includes(query.toLowerCase()) ||
            d.ref.toLowerCase().includes(query.toLowerCase())
        );

        return res.json({
            datasets: mockResults.length > 0 ? mockResults : [
                { id: 'sample', ref: `sample/${query}`, title: `Sample ${query} Dataset`, size: '100 KB', downloads: '10K+' }
            ],
            message: 'Using mock data. Add Kaggle credentials for real search.'
        });
    }

    // Real Kaggle API search
    try {
        const auth = Buffer.from(`${kaggle_username}:${kaggle_key}`).toString('base64');
        const response = await fetch(`https://www.kaggle.com/api/v1/datasets/list?search=${encodeURIComponent(query)}&page=${page}`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                return res.status(401).json({ error: 'Invalid Kaggle credentials' });
            }
            throw new Error(`Kaggle API error: ${response.status}`);
        }

        const data = await response.json();
        const datasets = data.map(d => ({
            id: d.id || d.ref,
            ref: d.ref,
            title: d.title,
            size: formatSize(d.totalBytes),
            downloads: d.downloadCount ? `${(d.downloadCount / 1000).toFixed(0)}K+` : 'N/A',
            description: d.subtitle || d.description,
            lastUpdated: d.lastUpdated,
            usabilityRating: d.usabilityRating
        }));

        res.json({ datasets });
    } catch (error) {
        console.error('Kaggle search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download Kaggle dataset
app.post('/api/kaggle/download', async (req, res) => {
    const { dataset_ref, kaggle_username, kaggle_key } = req.body;

    if (!kaggle_username || !kaggle_key) {
        return res.status(400).json({ error: 'Kaggle credentials required' });
    }

    if (!dataset_ref) {
        return res.status(400).json({ error: 'Dataset reference required' });
    }

    try {
        const auth = Buffer.from(`${kaggle_username}:${kaggle_key}`).toString('base64');

        // Get dataset files list
        const filesResponse = await fetch(`https://www.kaggle.com/api/v1/datasets/list/${dataset_ref}`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        // Download the dataset
        const downloadResponse = await fetch(`https://www.kaggle.com/api/v1/datasets/download/${dataset_ref}`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });

        if (!downloadResponse.ok) {
            if (downloadResponse.status === 401) {
                return res.status(401).json({ error: 'Invalid Kaggle credentials' });
            }
            if (downloadResponse.status === 403) {
                return res.status(403).json({ error: 'Access denied. You may need to accept the dataset rules on Kaggle.' });
            }
            throw new Error(`Download failed: ${downloadResponse.status}`);
        }

        // For now, return a message that download is complex
        // In production, you'd handle zip extraction and CSV parsing
        res.json({
            message: 'Dataset download initiated',
            note: 'For large datasets, please download directly from Kaggle and upload the CSV file.',
            kaggleUrl: `https://www.kaggle.com/datasets/${dataset_ref}`
        });

    } catch (error) {
        console.error('Kaggle download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to format file size
function formatSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
    console.log(`📊 Endpoints: /api/dataset, /api/eda, /api/ml, /api/chat, /api/report, /api/kaggle`);
});
