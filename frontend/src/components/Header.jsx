import React, { useState, useRef } from 'react'
import { Menu, Upload, Database, X } from 'lucide-react'

function Header({ dataset, setDataset, toggleSidebar, isMobile }) {
    const [ uploading, setUploading ] = useState(false)
    const fileInputRef = useRef(null)

    const handleFileUpload = async (e) => {
        const file = e.target.files[ 0 ]
        if (!file) return

        setUploading(true)

        // Parse CSV file
        const reader = new FileReader()
        reader.onload = (event) => {
            const text = event.target.result
            const lines = text.split('\n')
            const headers = lines[ 0 ].split(',').map(h => h.trim())
            const rows = lines.slice(1).filter(line => line.trim()).map(line => {
                const values = line.split(',')
                const row = {}
                headers.forEach((header, i) => {
                    row[ header ] = values[ i ]?.trim()
                })
                return row
            })

            setDataset({
                name: file.name,
                headers,
                rows,
                rowCount: rows.length,
                colCount: headers.length
            })
            setUploading(false)
        }
        reader.readAsText(file)
    }

    return (
        <header className="sticky top-0 z-30 px-4 pb-4 pt-4 md:px-6">
            <div className="surface-panel rounded-2xl px-4 py-3 md:px-6 md:py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-[260px] items-center gap-3 md:gap-4">
                        <button
                            onClick={toggleSidebar}
                            className="rounded-xl border border-slate-200 p-2 text-slate-700 transition-colors hover:bg-slate-100"
                            aria-label="Toggle sidebar"
                        >
                            <Menu size={20} />
                        </button>
                        <div>
                            <h2 className="title-display text-lg font-semibold text-slate-900 md:text-xl">
                                AI Data Science Research Assistant
                            </h2>
                            <p className="text-xs text-slate-500 md:text-sm">
                                {isMobile ? 'Mobile workspace mode' : 'Collaborative analytics workspace'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        {dataset ? (
                            <div className="flex max-w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 md:px-4">
                                <Database size={18} className="text-emerald-700" />
                                <div className="max-w-[200px] md:max-w-[260px]">
                                    <p className="truncate text-sm font-semibold text-emerald-800">{dataset.name}</p>
                                    <p className="text-xs text-emerald-700">{dataset.rowCount} rows x {dataset.colCount} cols</p>
                                </div>
                                <button
                                    onClick={() => setDataset(null)}
                                    className="rounded p-1 transition-colors hover:bg-emerald-100"
                                    aria-label="Remove dataset"
                                >
                                    <X size={16} className="text-emerald-700" />
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-500">
                                No dataset loaded
                            </div>
                        )}

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".csv"
                            className="hidden"
                        />

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            <Upload size={18} />
                            {uploading ? 'Uploading...' : 'Upload CSV'}
                        </button>
                    </div>
                </div>
            </div>
        </header>
    )
}

export default Header
