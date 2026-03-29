import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
    base,
    plugins: [ react() ],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': [ 'react', 'react-dom', 'react-router-dom' ],
                    'vendor-recharts': [ 'recharts' ],
                    'vendor-icons': [ 'lucide-react' ]
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
            }
        }
    }
})
