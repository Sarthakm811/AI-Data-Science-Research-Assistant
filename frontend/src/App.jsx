import React, { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import { AnalysisProvider } from './context/AnalysisContext'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const DatasetSearch = lazy(() => import('./pages/DatasetSearch'))
const DataCleaning = lazy(() => import('./pages/DataCleaning'))
const FeatureEngineering = lazy(() => import('./pages/FeatureEngineering'))
const AutoEDA = lazy(() => import('./pages/AutoEDA'))
const AutoML = lazy(() => import('./pages/AutoML'))
const StatisticsMath = lazy(() => import('./pages/StatisticsMath'))
const AIChat = lazy(() => import('./pages/AIChat'))
const Reports = lazy(() => import('./pages/Reports'))

function AppLayout({ dataset, setDataset, isMobile, sidebarOpen, setSidebarOpen }) {
    const location = useLocation()

    return (
        <div className="relative flex min-h-screen">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-28 top-20 h-72 w-72 rounded-full bg-cyan-100/50 blur-3xl" />
                <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-orange-100/60 blur-3xl" />
            </div>

            <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} isMobile={isMobile} />

            <div
                className={`relative flex min-h-screen flex-1 flex-col transition-all duration-300 ${!isMobile && sidebarOpen ? 'ml-72' : !isMobile ? 'ml-24' : 'ml-0'
                    }`}
            >
                <Header
                    dataset={dataset}
                    setDataset={setDataset}
                    toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                    isMobile={isMobile}
                />

                <main className="relative z-10 flex-1 overflow-auto p-4 md:p-6">
                    <div key={location.pathname} className="route-transition">
                        <Suspense
                            fallback={(
                                <div className="card py-12 text-center text-slate-500">
                                    Loading page...
                                </div>
                            )}
                        >
                            <Routes>
                                <Route path="/" element={<Dashboard dataset={dataset} />} />
                                <Route path="/search" element={<DatasetSearch setDataset={setDataset} />} />
                                <Route path="/cleaning" element={<DataCleaning dataset={dataset} setDataset={setDataset} />} />
                                <Route path="/features" element={<FeatureEngineering dataset={dataset} setDataset={setDataset} />} />
                                <Route path="/eda" element={<AutoEDA dataset={dataset} />} />
                                <Route path="/ml" element={<AutoML dataset={dataset} setDataset={setDataset} />} />
                                <Route path="/statistics" element={<StatisticsMath dataset={dataset} />} />
                                <Route path="/chat" element={<AIChat dataset={dataset} />} />
                                <Route path="/reports" element={<Reports dataset={dataset} />} />
                            </Routes>
                        </Suspense>
                    </div>
                </main>
            </div>
        </div>
    )
}

function App() {
    const [ dataset, setDataset ] = useState(null)
    const [ isMobile, setIsMobile ] = useState(false)
    const [ sidebarOpen, setSidebarOpen ] = useState(true)

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 1024
            setIsMobile(mobile)
            setSidebarOpen(!mobile)
        }

        handleResize()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <AnalysisProvider>
            <Router>
                <AppLayout
                    dataset={dataset}
                    setDataset={setDataset}
                    isMobile={isMobile}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                />
            </Router>
        </AnalysisProvider>
    )
}

export default App
