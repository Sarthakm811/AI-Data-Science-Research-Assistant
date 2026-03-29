import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, AlertCircle, Loader, Sparkles } from 'lucide-react'
import { chatAPI, sessionAPI, handleApiError } from '../services/api'

function AIChat({ dataset }) {
    const [ messages, setMessages ] = useState([
        {
            role: 'assistant',
            content: 'Hello! I\'m your AI Data Science Assistant. Upload a dataset and ask me anything about your data!'
        }
    ])
    const [ input, setInput ] = useState('')
    const [ loading, setLoading ] = useState(false)
    const [ error, setError ] = useState(null)
    const [ sessionId, setSessionId ] = useState(null)
    const messagesEndRef = useRef(null)

    // Initialize session
    useEffect(() => {
        const initSession = async () => {
            try {
                const session = await sessionAPI.createSession()
                setSessionId(session.session_id)
            } catch (err) {
                console.log('Session initialization skipped (optional)')
            }
        }
        initSession()
    }, [])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [ messages ])

    const sendMessage = useCallback(async () => {
        if (!input.trim()) return

        const userMessage = { role: 'user', content: input }
        setMessages(prev => [ ...prev, userMessage ])
        setInput('')
        setLoading(true)
        setError(null)

        try {
            const response = await chatAPI.sendMessage(
                input,
                dataset?.id || dataset?.datasetId,
                sessionId || 'demo'
            )

            const assistantMessage = {
                role: 'assistant',
                content: response.response || response.message || 'I understood your question'
            }
            setMessages(prev => [ ...prev, assistantMessage ])
        } catch (err) {
            const errMsg = handleApiError(err)
            setError(errMsg)
            setMessages(prev => [ ...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${errMsg}` } ])
        } finally {
            setLoading(false)
        }
    }, [ input, dataset, sessionId ])

    return (
        <div className="fade-up flex h-[calc(100vh-200px)] flex-col">
            {/* Header */}
            <div className="card hero-contrast lift-hover mb-4 bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-white/20 p-3">
                            <Sparkles size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="title-display text-xl font-bold">AI Chat</h1>
                            <p className="text-sm text-cyan-100">Ask questions about your data</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="rounded-lg border border-white/30 bg-white/15 px-3 py-2">
                            <p className="text-sm text-green-700">AI Ready</p>
                        </div>
                        {dataset && (
                            <div className="rounded-lg border border-white/30 bg-white/15 px-3 py-2">
                                <p className="text-sm text-cyan-50">{dataset.name}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="card mb-4 flex-1 overflow-y-auto">
                <div className="space-y-4">
                    {messages.map((msg, i) => (
                        <div key={i} style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }} className={`fade-up flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${msg.role === 'user' ? 'bg-gradient-to-r from-teal-600 to-blue-700' : 'bg-slate-200'
                                }`}>
                                {msg.role === 'user' ? (
                                    <User size={20} className="text-white" />
                                ) : (
                                    <Bot size={20} className="text-slate-700" />
                                )}
                            </div>
                            <div className={`max-w-[70%] rounded-xl p-4 ${msg.role === 'user'
                                ? 'bg-gradient-to-r from-teal-600 to-blue-700 text-white'
                                : 'bg-slate-100 text-slate-800'
                                }`}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                                <Bot size={20} className="text-slate-700" />
                            </div>
                            <div className="rounded-lg bg-slate-100 p-4">
                                <div className="mb-2 flex gap-1">
                                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.1s' }} />
                                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.2s' }} />
                                </div>
                                <div className="skeleton h-3 w-48" />
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input */}
            <div className="card">
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        placeholder="Ask a question about your data..."
                        className="input-field flex-1"
                        disabled={loading}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={loading || !input.trim()}
                        className="btn-primary flex items-center gap-2 disabled:opacity-70"
                    >
                        <Send size={18} />
                        Send
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AIChat
