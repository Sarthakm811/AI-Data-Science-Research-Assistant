import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
    LayoutDashboard,
    Search,
    BarChart3,
    Brain,
    MessageSquare,
    FileText,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    TrendingUp
} from 'lucide-react'

const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/search', icon: Search, label: 'Dataset Search' },
    { path: '/eda', icon: BarChart3, label: 'Auto EDA' },
    { path: '/ml', icon: Brain, label: 'Auto ML' },
    { path: '/anomaly', icon: AlertTriangle, label: 'Anomaly Detection' },
    { path: '/timeseries', icon: TrendingUp, label: 'Time Series' },
    { path: '/chat', icon: MessageSquare, label: 'AI Chat' },
    { path: '/reports', icon: FileText, label: 'Reports' },
]

function Sidebar({ isOpen, setIsOpen }) {
    const location = useLocation()

    return (
        <>
            <div
                className={`fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                    }`}
                onClick={() => setIsOpen(false)}
            />

            <aside
                className={`fixed left-0 top-0 z-50 h-full overflow-hidden border-r border-white/10 bg-slate-950 text-slate-100 transition-all duration-300 ${isOpen ? 'w-72 translate-x-0' : 'w-24 -translate-x-full lg:translate-x-0'
                    }`}
            >
                <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-slate-800 p-4">
                        {isOpen && (
                            <div>
                                <h1 className="title-display text-xl font-bold gradient-text">Project Navigator</h1>
                                <p className="mt-1 text-xs text-slate-400">Data science command center</p>
                            </div>
                        )}
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="rounded-lg border border-slate-700 p-2 text-slate-300 transition-colors hover:bg-slate-800"
                            aria-label="Toggle sidebar"
                        >
                            {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                        </button>
                    </div>

                    <nav className="mt-4 space-y-1 px-3">
                        {menuItems.map((item) => {
                            const Icon = item.icon
                            const isActive = location.pathname === item.path

                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => window.innerWidth < 1024 && setIsOpen(false)}
                                    className={`group flex items-center rounded-xl px-3 py-2.5 transition-all duration-200 ${isActive
                                            ? 'bg-gradient-to-r from-teal-600/80 to-blue-700/85 text-white shadow-md shadow-blue-900/30'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                        }`}
                                >
                                    <Icon size={20} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-100'} />
                                    {isOpen && <span className="ml-3 text-sm font-medium">{item.label}</span>}
                                </Link>
                            )
                        })}
                    </nav>

                    <div className="mt-auto p-4">
                        {isOpen && (
                            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-400">Workspace</p>
                                <p className="mt-2 text-sm font-semibold text-slate-100">AI + ML Suite</p>
                                <p className="mt-1 text-xs text-slate-400">Fast insights, cleaner workflow</p>
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    )
}

export default Sidebar
