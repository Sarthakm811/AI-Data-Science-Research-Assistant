import React from 'react'

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info.componentStack)
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '1.5rem' }}>
                        <h2 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>
                            ⚠ Page crashed: {this.state.error.message}
                        </h2>
                        <pre style={{ fontSize: '0.75rem', color: '#7f1d1d', whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '300px' }}>
                            {this.state.error.stack}
                        </pre>
                        <button
                            onClick={() => this.setState({ error: null })}
                            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}
