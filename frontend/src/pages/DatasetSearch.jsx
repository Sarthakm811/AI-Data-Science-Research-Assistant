import React, { useState, useCallback } from 'react'
import { Search, Download, Upload, Loader, AlertCircle, CheckCircle, Key, Settings, Eye, EyeOff } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

function DatasetSearch({ setDataset }) {
    const [ searchQuery, setSearchQuery ] = useState('')
    const [ results, setResults ] = useState([])
    const [ loading, setLoading ] = useState(false)
    const [ downloading, setDownloading ] = useState(null)
    const [ error, setError ] = useState(null)
    const [ page, setPage ] = useState(1)
    const [ selectedFile, setSelectedFile ] = useState(null)
    const [ uploading, setUploading ] = useState(false)
    const [ uploadError, setUploadError ] = useState(null)
    const [ uploadSuccess, setUploadSuccess ] = useState(false)

    // Kaggle API credentials
    const [ kaggleUsername, setKaggleUsername ] = useState(localStorage.getItem('kaggle_username') || '')
    const [ kaggleKey, setKaggleKey ] = useState(localStorage.getItem('kaggle_key') || '')
    const [ showKey, setShowKey ] = useState(false)
    const [ showSettings, setShowSettings ] = useState(false)
    const [ credentialsSaved, setCredentialsSaved ] = useState(false)

    // Save Kaggle credentials
    const saveCredentials = () => {
        localStorage.setItem('kaggle_username', kaggleUsername)
        localStorage.setItem('kaggle_key', kaggleKey)
        setCredentialsSaved(true)
        setTimeout(() => setCredentialsSaved(false), 2000)
    }

    // Clear credentials
    const clearCredentials = () => {
        localStorage.removeItem('kaggle_username')
        localStorage.removeItem('kaggle_key')
        setKaggleUsername('')
        setKaggleKey('')
    }

    // Search datasets on Kaggle
    const handleSearch = useCallback(async (e) => {
        e.preventDefault()
        if (!searchQuery.trim()) {
            setError('Please enter a search query')
            return
        }

        setLoading(true)
        setError(null)
        setResults([])

        try {
            const response = await fetch(`${API_BASE_URL}/api/kaggle/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: searchQuery,
                    page,
                    kaggle_username: kaggleUsername,
                    kaggle_key: kaggleKey
                })
            })

            if (!response.ok) throw new Error('Search failed')
            const data = await response.json()
            setResults(data.datasets || data || [])
        } catch (err) {
            setError(err.message || 'Failed to search datasets')
        } finally {
            setLoading(false)
        }
    }, [ searchQuery, page, kaggleUsername, kaggleKey ])

    // Download dataset from Kaggle
    const handleDownloadDataset = async (dataset) => {
        if (!kaggleUsername || !kaggleKey) {
            setError('Please configure your Kaggle API credentials first')
            setShowSettings(true)
            return
        }

        setDownloading(dataset.id)
        setError(null)

        try {
            const response = await fetch(`${API_BASE_URL}/api/kaggle/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataset_ref: dataset.ref || dataset.id,
                    kaggle_username: kaggleUsername,
                    kaggle_key: kaggleKey
                })
            })

            if (!response.ok) throw new Error('Download failed')
            const data = await response.json()

            if (data.headers && data.rows) {
                setDataset(data)
                setUploadSuccess(true)
                setTimeout(() => setUploadSuccess(false), 3000)
            } else {
                throw new Error('Invalid dataset format')
            }
        } catch (err) {
            setError(err.message || 'Failed to download dataset')
        } finally {
            setDownloading(null)
        }
    }

    // Upload local file
    const handleFileChange = (e) => {
        const file = e.target.files[ 0 ]
        if (file) {
            if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
                setUploadError('Please select a CSV or XLSX file')
                return
            }
            setSelectedFile(file)
            setUploadError(null)
        }
    }

    const handleUpload = async () => {
        if (!selectedFile) {
            setUploadError('Please select a file first')
            return
        }

        setUploading(true)
        setUploadError(null)

        try {
            const formData = new FormData()
            formData.append('file', selectedFile)

            const response = await fetch(`${API_BASE_URL}/api/dataset/upload`, {
                method: 'POST',
                body: formData
            })

            if (!response.ok) throw new Error('Upload failed')
            const data = await response.json()

            setDataset(data)
            setSelectedFile(null)
            setUploadSuccess(true)
            setTimeout(() => setUploadSuccess(false), 3000)
        } catch (err) {
            setUploadError(err.message || 'Failed to upload dataset')
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="space-y-6 fade-up">
            {/* Header */}
            <div className="card lift-hover bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="title-display mb-2 text-3xl font-bold">Dataset Search & Upload</h1>
                        <p className="text-cyan-100">Search Kaggle datasets or upload your own CSV/XLSX files</p>
                    </div>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2 transition ${showSettings ? 'bg-white text-blue-700' : 'bg-white/20 text-white hover:bg-white/30'
                            }`}
                    >
                        <Settings size={18} />
                        Kaggle Settings
                    </button>
                </div>
            </div>

            {/* Kaggle API Settings */}
            {showSettings && (
                <div className="card fade-up border border-blue-200/70 bg-gradient-to-r from-blue-50 to-teal-50">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-purple-100 p-2 rounded-lg">
                            <Key size={24} className="text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Kaggle API Credentials</h2>
                            <p className="text-sm text-gray-600">Enter your Kaggle username and API key to search and download datasets</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Kaggle Username
                            </label>
                            <input
                                type="text"
                                value={kaggleUsername}
                                onChange={(e) => setKaggleUsername(e.target.value)}
                                placeholder="your_kaggle_username"
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Kaggle API Key
                            </label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={kaggleKey}
                                    onChange={(e) => setKaggleKey(e.target.value)}
                                    placeholder="your_api_key"
                                    className="input-field pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                >
                                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex gap-3">
                            <button
                                onClick={saveCredentials}
                                className="btn-primary flex items-center gap-2"
                            >
                                <CheckCircle size={16} />
                                Save Credentials
                            </button>
                            <button
                                onClick={clearCredentials}
                                className="px-4 py-2 text-gray-600 hover:text-red-600 transition"
                            >
                                Clear
                            </button>
                        </div>
                        {credentialsSaved && (
                            <span className="text-green-600 text-sm flex items-center gap-1">
                                <CheckCircle size={14} /> Saved!
                            </span>
                        )}
                    </div>

                    <div className="mt-4 p-4 bg-white rounded-lg border border-purple-100">
                        <h4 className="font-semibold text-gray-800 text-sm mb-2">How to get your Kaggle API Key:</h4>
                        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                            <li>Go to <a href="https://www.kaggle.com/settings" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">kaggle.com/settings</a></li>
                            <li>Scroll to "API" section</li>
                            <li>Click "Create New Token"</li>
                            <li>Open the downloaded kaggle.json file</li>
                            <li>Copy your username and key from the file</li>
                        </ol>
                    </div>
                </div>
            )}

            {/* Alerts */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-red-900">Error</h3>
                        <p className="text-red-700 text-sm">{error}</p>
                    </div>
                </div>
            )}

            {uploadSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-green-900">Success</h3>
                        <p className="text-green-700 text-sm">Dataset loaded successfully!</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Search Section */}
                <div className="card lift-hover">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Search Kaggle Datasets</h2>

                    {/* Credentials Status */}
                    <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${kaggleUsername && kaggleKey
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                        }`}>
                        {kaggleUsername && kaggleKey ? (
                            <>
                                <CheckCircle size={16} />
                                <span>Connected as <strong>{kaggleUsername}</strong></span>
                            </>
                        ) : (
                            <>
                                <AlertCircle size={16} />
                                <span>Configure Kaggle API credentials above to enable search</span>
                            </>
                        )}
                    </div>

                    <form onSubmit={handleSearch} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Dataset Name or Keyword
                            </label>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="e.g., titanic, housing, customer-churn, mnist"
                                className="input-field"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
                        >
                            {loading ? (
                                <>
                                    <Loader className="w-4 h-4 animate-spin" />
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <Search className="w-4 h-4" />
                                    Search Kaggle
                                </>
                            )}
                        </button>
                    </form>

                    {loading && (
                        <div className="mt-6 space-y-3">
                            {[ 1, 2, 3 ].map((idx) => (
                                <div key={idx} className="rounded-xl border border-slate-200 p-4">
                                    <div className="skeleton mb-3 h-4 w-3/4" />
                                    <div className="skeleton mb-2 h-3 w-full" />
                                    <div className="skeleton h-3 w-2/3" />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Search Results */}
                    {results.length > 0 && (
                        <div className="mt-6 space-y-3 stagger">
                            <h3 className="font-semibold text-gray-900">Found {results.length} datasets</h3>
                            <div className="max-h-96 overflow-y-auto space-y-3">
                                {results.map((dataset, idx) => (
                                    <div
                                        key={dataset.id || idx}
                                        className="lift-hover rounded-lg border border-gray-200 p-4 transition hover:border-blue-400"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-gray-900 truncate">{dataset.title || dataset.name}</h4>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    {dataset.size && `Size: ${dataset.size}`}
                                                    {dataset.downloads && ` • ${dataset.downloads} downloads`}
                                                </p>
                                                {dataset.ref && (
                                                    <p className="text-xs text-gray-500 mt-1 truncate">{dataset.ref}</p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleDownloadDataset(dataset)}
                                                disabled={downloading === dataset.id || !kaggleUsername || !kaggleKey}
                                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 whitespace-nowrap transition"
                                            >
                                                {downloading === dataset.id ? (
                                                    <Loader className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Download className="w-4 h-4" />
                                                )}
                                                {downloading === dataset.id ? 'Loading...' : 'Load'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Pagination */}
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1 || loading}
                                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition"
                                >
                                    Previous
                                </button>
                                <span className="px-4 py-2 text-gray-600">Page {page}</span>
                                <button
                                    onClick={() => setPage(page + 1)}
                                    disabled={loading}
                                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Upload Section */}
                <div className="card lift-hover">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Local Dataset</h2>
                    <div className="space-y-4">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition">
                            <input
                                type="file"
                                onChange={handleFileChange}
                                accept=".csv,.xlsx"
                                className="hidden"
                                id="file-input"
                            />
                            <label
                                htmlFor="file-input"
                                className="cursor-pointer inline-flex flex-col items-center gap-2"
                            >
                                <Upload className="w-8 h-8 text-gray-400" />
                                <span className="text-sm font-medium text-gray-700">
                                    {selectedFile ? selectedFile.name : 'Click to upload or drag and drop'}
                                </span>
                                <span className="text-xs text-gray-500">CSV or XLSX (max 100MB)</span>
                            </label>
                        </div>

                        {uploadError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-red-700 text-sm">{uploadError}</p>
                            </div>
                        )}

                        <button
                            onClick={handleUpload}
                            disabled={!selectedFile || uploading || loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition"
                        >
                            {uploading ? (
                                <>
                                    <Loader className="w-4 h-4 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Upload Dataset
                                </>
                            )}
                        </button>

                        <div className="bg-blue-50 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 text-sm mb-2">Supported Formats</h4>
                            <ul className="text-sm text-blue-800 space-y-1">
                                <li>• CSV (.csv)</li>
                                <li>• Excel (.xlsx, .xls)</li>
                                <li>• Maximum file size: 100 MB</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default DatasetSearch
