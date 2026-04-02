import React, { useState, useEffect } from 'react';
import { C, inp, btn } from './theme';
import { LS } from './utils/storage';
import Toast from './components/Toast';
import ApiKeyScreen from './components/ApiKeyScreen';
import ProfileModal from './components/ProfileModal';
import Dash from './pages/Dash';
import Files from './pages/Files';
import Plan from './pages/Plan';
import Cards from './pages/Cards';
import Quiz from './pages/Quiz';
import Prog from './pages/Prog';

export default function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(() => !!LS.get('sf_apikey', ''));
    const [pg, setPg] = useState('dash');
    const [files, setFiles] = useState(() => LS.get('sf_files', []));
    const [plan, setPlan] = useState(() => LS.get('sf_plan', []));
    const [cards, setCards] = useState(() => LS.get('sf_cards', []));
    const [qHist, setQHist] = useState(() => LS.get('sf_qhist', []));
    const [examWeeks, setExamWeeks] = useState(() => LS.get('sf_weeks', 4));
    const [toast, setToast] = useState('');
    const [theme, setTheme] = useState(() => LS.get('sf_theme', 'dark'));
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
    const [profile, setProfile] = useState(() => LS.get('sf_profile', { name: 'Desire', bio: 'AI Researcher', avatar: 'Desire' }));
    const [showProfile, setShowProfile] = useState(false);

    const notify = (msg, dur = 3500) => { setToast(msg); setTimeout(() => setToast(''), dur); };

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => LS.set('sf_files', files), [files]);
    useEffect(() => LS.set('sf_plan', plan), [plan]);
    useEffect(() => LS.set('sf_cards', cards), [cards]);
    useEffect(() => LS.set('sf_qhist', qHist), [qHist]);
    useEffect(() => LS.set('sf_weeks', examWeeks), [examWeeks]);
    useEffect(() => {
        LS.set('sf_theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);
    useEffect(() => LS.set('sf_profile', profile), [profile]);

    if (!isLoggedIn) return <ApiKeyScreen onSave={() => setIsLoggedIn(true)} />;

    // Derive courses from files
    const courseMap = {};
    files.forEach(f => {
        const c = f.path.includes('/') ? f.path.split('/')[0] : 'General';
        (courseMap[c] = courseMap[c] || []).push(f);
    });
    const courses = Object.entries(courseMap).map(([name, fs]) => ({ name, files: fs }));
    const dueCards = cards.filter(c => !c.due || new Date(c.due) <= new Date());
    const todayPlan = plan.filter(p => new Date(p.date).toDateString() === new Date().toDateString());
    const p = { profile, files, setFiles, courses, plan, setPlan, cards, setCards, qHist, setQHist, examWeeks, setExamWeeks, dueCards, todayPlan, notify, setPg, isMobile };

    const NAV = [
        { id: 'dash', icon: '⌂', label: 'Home' },
        { id: 'files', icon: '⊞', label: 'Files', badge: files.length || null },
        { id: 'plan', icon: '◎', label: 'Plan', badge: todayPlan.filter(x => !x.done).length || null },
        { id: 'cards', icon: '◇', label: 'Cards', badge: dueCards.length || null },
        { id: 'quiz', icon: '◉', label: 'Quiz' },
        { id: 'prog', icon: '▲', label: 'Stats' },
    ];

    return (
        <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.tx }}>
            <Toast msg={toast} />
            {showProfile && (
                <ProfileModal 
                    profile={profile} 
                    onSave={(np) => { setProfile(np); setShowProfile(false); notify('Profile updated!'); }} 
                    onClose={() => setShowProfile(false)} 
                />
            )}

            {/* Sidebar Desktop */}
            {!isMobile && (
                <aside style={{ width: 240, background: C.s, borderRight: `1px solid ${C.b}`, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '24px 20px', marginBottom: 20 }}>
                        <div style={{ fontSize: 20, color: C.a, fontWeight: 700 }}>StudyForge</div>
                        <div style={{ fontSize: 12, color: C.mu, marginTop: 4 }}>Academic Atelier</div>
                    </div>

                    <nav style={{ flex: 1, padding: '0 12px' }}>
                        {NAV.map(n => (
                            <button
                                key={n.id}
                                onClick={() => setPg(n.id)}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 14px', borderRadius: 8, background: pg === n.id ? C.s2 : 'transparent',
                                    border: 'none', color: pg === n.id ? C.wh : C.mu, cursor: 'pointer',
                                    textAlign: 'left', marginBottom: 4, fontWeight: pg === n.id ? 600 : 400
                                }}
                            >
                                <span style={{ fontSize: 18, color: pg === n.id ? C.wh : C.mu }}>{n.icon}</span>
                                <span style={{ flex: 1, fontSize: 14 }}>{n.label}</span>
                                {n.badge > 0 && (
                                    <span style={{
                                        background: C.re, color: '#ffffff', borderRadius: 12,
                                        padding: '2px 8px', fontSize: 11, fontWeight: 700
                                    }}>{n.badge}</span>
                                )}
                            </button>
                        ))}
                    </nav>

                    <div style={{ padding: 20 }}>
                        <button style={{ ...btn('p'), width: '100%' }}>Start Study Session</button>
                    </div>
                </aside>
            )}

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <header style={{
                    height: 64, borderBottom: `1px solid ${C.b}`,
                    display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end',
                    padding: '0 24px', gap: 16
                }}>
                    {isMobile && <div style={{ fontSize: 20, color: C.a, fontWeight: 700 }}>StudyForge</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <button style={{ 
                            background: 'none', border: 'none', color: C.mu, cursor: 'pointer', 
                            fontSize: 18, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 4, borderRadius: 8, transition: 'background 0.2s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                            </svg>
                            {/* Notification Dot */}
                            <div style={{ 
                                position: 'absolute', top: 4, right: 4, width: 8, height: 8, 
                                background: C.re, borderRadius: '50%', border: `2px solid ${C.bg}`
                            }} />
                        </button>
                        <button 
                            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                            style={{ 
                                background: 'none', border: 'none', color: C.a, cursor: 'pointer', 
                                fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: 6, borderRadius: 8, transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseOut={e => e.currentTarget.style.background = 'none'}
                        >
                            {theme === 'dark' ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="5"></circle>
                                    <line x1="12" y1="1" x2="12" y2="3"></line>
                                    <line x1="12" y1="21" x2="12" y2="23"></line>
                                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                    <line x1="1" y1="12" x2="3" y2="12"></line>
                                    <line x1="21" y1="12" x2="23" y2="12"></line>
                                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={() => { if (confirm('Log out and change API key?')) { LS.set('sf_apikey', ''); setIsLoggedIn(false); } }}
                            style={{ 
                                background: 'none', border: 'none', color: C.mu, cursor: 'pointer', 
                                fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: 6, borderRadius: 8, transition: 'all 0.2s'
                            }}
                            title="Logout / Change API Key"
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseOut={e => e.currentTarget.style.background = 'none'}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                        </button>
                        <div 
                            onClick={() => setShowProfile(true)}
                            style={{ 
                                width: 34, height: 34, borderRadius: 17, 
                                border: `2px solid ${C.s2}`, 
                                boxShadow: `0 0 15px rgba(99,91,255,0.2)`,
                                padding: 2, background: C.bg,
                                cursor: 'pointer', transition: 'transform 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                            title="My Profile"
                        >
                            <div style={{ width: '100%', height: '100%', borderRadius: 15, background: C.s2, overflow: 'hidden' }}>
                                <img 
                                    src={profile.avatar?.startsWith('data:') ? profile.avatar : `https://api.dicebear.com/7.x/micah/svg?seed=${profile.avatar || 'StudyForge'}&backgroundColor=transparent`} 
                                    alt="avatar" 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '32px', paddingBottom: isMobile ? 80 : 32 }}>
                    <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
                        {pg === 'dash' && <Dash  {...p} />}
                        {pg === 'files' && <Files {...p} />}
                        {pg === 'plan' && <Plan  {...p} />}
                        {pg === 'cards' && <Cards {...p} />}
                        {pg === 'quiz' && <Quiz  {...p} />}
                        {pg === 'prog' && <Prog  {...p} />}
                    </div>
                </main>
            </div>

            {/* Bottom Nav Mobile */}
            {isMobile && (
                <nav style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0,
                    height: 64, background: C.bg, borderTop: `1px solid ${C.b}`,
                    display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100
                }}>
                    {NAV.map(n => (
                        <button
                            key={n.id}
                            onClick={() => setPg(n.id)}
                            style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                color: pg === n.id ? C.a : C.mu, position: 'relative'
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{n.icon}</span>
                            <span style={{ fontSize: 10, fontWeight: pg === n.id ? 700 : 500 }}>{n.label}</span>
                            {n.badge > 0 && (
                                <span style={{
                                    position: 'absolute', top: -4, right: -4,
                                    background: C.re, color: '#ffffff', borderRadius: 10,
                                    padding: '2px 5px', fontSize: 9, fontWeight: 700
                                }}>{n.badge}</span>
                            )}
                        </button>
                    ))}
                </nav>
            )}
        </div>
    );
}
