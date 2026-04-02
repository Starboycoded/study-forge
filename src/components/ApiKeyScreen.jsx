import React, { useState } from 'react';
import { LS } from '../utils/storage';
import { ai } from '../utils/ai';

const S = {
    wrap: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#0d0f1e',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    },
    card: {
        background: '#13162b',
        borderRadius: 24,
        padding: '40px 32px 32px',
        width: '100%',
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        position: 'relative',
        overflow: 'hidden',
    },
    tabs: {
        display: 'flex',
        width: '100%',
        background: '#0d0f1e',
        borderRadius: 12,
        padding: 4,
        marginBottom: 32,
    },
    tab: active => ({
        flex: 1,
        padding: '10px 0',
        borderRadius: 8,
        border: 'none',
        background: active ? '#1e2240' : 'transparent',
        color: active ? '#fff' : '#5a607a',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
    }),
    iconWrap: {
        width: 60,
        height: 60,
        borderRadius: 18,
        background: 'linear-gradient(135deg, #4f5ef7, #6c4fff)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        marginBottom: 20,
        boxShadow: '0 8px 20px rgba(79, 94, 247, 0.3)',
    },
    title: {
        color: '#fff',
        fontSize: 28,
        fontWeight: 800,
        letterSpacing: '-0.5px',
        marginBottom: 4,
    },
    subtitle: {
        color: '#5a607a',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.05em',
        marginBottom: 32,
        textAlign: 'center',
    },
    fieldWrap: {
        width: '100%',
        marginBottom: 20,
    },
    label: {
        color: '#5a607a',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 10,
        display: 'block',
    },
    inputRow: {
        position: 'relative',
        width: '100%',
    },
    input: {
        width: '100%',
        background: '#1a1d35',
        border: '1px solid #2d325a',
        borderRadius: 14,
        padding: '14px 44px 14px 16px',
        color: '#fff',
        fontSize: 15,
        outline: 'none',
        fontFamily: 'inherit',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:focus': {
            borderColor: '#4f5ef7',
            boxShadow: '0 0 0 4px rgba(79, 94, 247, 0.1)',
        }
    },
    eyeBtn: {
        position: 'absolute',
        right: 14,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#5a607a',
        fontSize: 18,
        padding: 4,
        display: 'flex',
        alignItems: 'center',
    },
    submitBtn: {
        width: '100%',
        background: 'linear-gradient(135deg, #4f5ef7, #6c4fff)',
        color: '#fff',
        border: 'none',
        borderRadius: 50,
        padding: '16px 24px',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        marginTop: 8,
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: '0 4px 15px rgba(79, 94, 247, 0.3)',
    },
    err: {
        color: '#f87171',
        fontSize: 12,
        marginTop: 10,
        background: 'rgba(248, 113, 113, 0.1)',
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid rgba(248, 113, 113, 0.2)',
        width: '100%',
    },
    regInfo: {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
    },
    infoText: {
        color: '#c8ceea',
        fontSize: 14,
        lineHeight: 1.6,
        textAlign: 'center',
    },
    extLink: {
        width: '100%',
        background: '#1e2240',
        color: '#fff',
        textDecoration: 'none',
        borderRadius: 14,
        padding: '14px 20px',
        fontSize: 14,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        transition: 'background 0.2s',
        border: '1px solid #2d325a',
    },
    brand: {
        marginTop: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        opacity: 0.6,
    }
};

export default function ApiKeyScreen({ onSave }) {
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [key, setKey] = useState('');
    const [show, setShow] = useState(false);
    const [err, setErr] = useState('');
    const [testing, setTesting] = useState(false);

    const test = async () => {
        if (!key.trim()) { setErr('Please enter your API key to continue'); return; }
        if (!key.startsWith('sk-ant-')) { setErr('Invalid format. Key should start with sk-ant-'); return; }
        
        setTesting(true); setErr('');
        try {
            LS.set('sf_apikey', key.trim());
            // Test with a lightweight call
            await ai([{ role: 'user', content: 'Connection test. Reply exactly with: READY' }], '');
            onSave();
        } catch (e) {
            setErr("Authentication failed: " + (e.message.includes('401') ? 'Invalid API Key' : e.message));
            LS.set('sf_apikey', '');
        }
        setTesting(false);
    };

    const handleKey = e => { if (e.key === 'Enter') test(); };

    return (
        <div style={S.wrap}>
            <div style={S.card}>
                <div style={S.iconWrap}>📚</div>
                <div style={S.title}>StudyForge</div>
                <div style={S.subtitle}>Professional AI Academic Suite</div>

                <div style={S.tabs}>
                    <button style={S.tab(mode === 'login')} onClick={() => setMode('login')}>Login</button>
                    <button style={S.tab(mode === 'register')} onClick={() => setMode('register')}>Get Started</button>
                </div>

                {mode === 'login' ? (
                    <div style={{ width: '100%' }}>
                        <div style={S.fieldWrap}>
                            <label style={S.label}>Your Anthropic API Key</label>
                            <div style={S.inputRow}>
                                <input
                                    value={key}
                                    onChange={e => setKey(e.target.value)}
                                    onKeyDown={handleKey}
                                    placeholder="sk-ant-..."
                                    type={show ? 'text' : 'password'}
                                    style={S.input}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                <button 
                                    style={S.eyeBtn} 
                                    onClick={() => setShow(s => !s)} 
                                    tabIndex={-1} 
                                    type="button"
                                    title={show ? "Hide key" : "Show key"}
                                >
                                    {show ? '🔒' : '👁'}
                                </button>
                            </div>
                            {err && <div style={S.err}>⚠️ {err}</div>}
                        </div>

                        <button
                            onClick={test}
                            style={{ 
                                ...S.submitBtn, 
                                opacity: testing || !key.trim() ? 0.6 : 1, 
                                cursor: testing || !key.trim() ? 'not-allowed' : 'pointer',
                                transform: testing ? 'scale(0.98)' : 'none'
                            }}
                            disabled={testing || !key.trim()}
                        >
                            {testing ? 'Authenticating...' : 'Sign In'} {!testing && '→'}
                        </button>
                    </div>
                ) : (
                    <div style={S.regInfo}>
                        <p style={S.infoText}>
                            StudyForge uses your own Anthropic API key to ensure privacy and provide direct access to Claude at cost.
                        </p>
                        
                        <a 
                            href="https://console.anthropic.com/" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={S.extLink}
                        >
                            <span>Create Anthropic Account</span>
                            <span style={{ fontSize: 16 }}>↗</span>
                        </a>

                        <div style={{ ...S.infoText, fontSize: 12, opacity: 0.7 }}>
                            1. Sign up at Anthropic Console<br/>
                            2. Add a small credit balance ($5 min)<br/>
                            3. Create an API Key and paste it here
                        </div>

                        <button 
                            onClick={() => setMode('login')}
                            style={{ ...S.extLink, background: 'transparent', border: 'none', color: '#4f5ef7' }}
                        >
                            Already have a key? Login
                        </button>
                    </div>
                )}
            </div>

            <div style={S.brand}>
                <span style={{ color: '#5a607a', fontSize: 12 }}>Powered by</span>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em' }}>ANTHROPIC</span>
            </div>
        </div>
    );
}

