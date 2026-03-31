import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production'

    return {
        // Must match the GitHub Pages repo path exactly
        base: isProd ? '/AI-Data-Science-Research-Assistant/' : '/',
        plugins: [ react() ],
        build: {
            rollupOptions: {
                output: {
                    manualChunks: {
                        'vendor-react': [ 'react', 'react-dom', 'react-router-dom' ],
                        'vendor-recharts': [ 'recharts' ],
                        'vendor-icons': [ 'lucide-react' ],
                    }
                }
            }
        },
        server: {
            port: 3000,
            proxy: {
                '/api': {
                    target: 'http://localhost:8000',
                    changeOrigin: true
                },
                '/health': {
                    target: 'http://localhost:8000',
                    changeOrigin: true
                }
            }
        }
    }
})
