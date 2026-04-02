import React from 'react';
import { C, card, btn } from '../theme';

export default function Dash({ profile, courses, dueCards, todayPlan, plan, qHist, setPg, isMobile }) {
    const done = plan.filter(p => p.done).length;
    const avgQ = qHist.length
        ? Math.round(qHist.reduce((a, b) => a + b.pct, 0) / qHist.length)
        : 0;
    const h = new Date().getHours();
    const name = profile?.name || 'User';
    const greet = h < 12 ? `Good morning ${name}` : h < 17 ? `Good afternoon ${name}` : `Good evening ${name}`;

    return (
        <div style={{ paddingBottom: 40 }}>
            {/* Header */}
            <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.mu, letterSpacing: '0.05em', marginBottom: 4 }}>WORKSPACE</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: C.wh }}>{greet}!</div>
            </div>

            {/* Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
                {[
                    ['COURSES', courses.length.toString()],
                    ['DUE CARDS', dueCards.length.toString()],
                    ['DONE', done.toString()],
                    ['QUIZ AVG', avgQ + '%'],
                ].map(([l, v]) => (
                    <div key={l} style={{ ...card(), padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.mu, letterSpacing: '0.05em', marginBottom: 8 }}>{l}</div>
                        <div style={{ fontSize: 32, fontWeight: 700, color: C.wh }}>{v}</div>
                    </div>
                ))}
            </div>

            {/* Main Grid Two Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24 }}>
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* Today's Reading Hero */}
                    <div style={{
                        ...card(), padding: isMobile ? 24 : 32, position: 'relative', overflow: 'hidden', minHeight: 300, border: 'none',
                        background: `url('/hero_bg.png') center/cover no-repeat`
                    }}>
                        {/* Overlay for legibility */}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(5,3,20,0.85) 0%, rgba(5,3,20,0.5) 100%)', pointerEvents: 'none' }}></div>

                        <div style={{ position: 'relative', zIndex: 1, display: 'inline-block', background: 'rgba(99,91,255,0.25)', border: '1px solid rgba(99,91,255,0.2)', color: '#b6b1ff', padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 20 }}>
                            📖 IN FOCUS
                        </div>
                        <div style={{ position: 'relative', zIndex: 1, fontSize: isMobile ? 24 : 28, fontWeight: 700, color: '#ffffff', marginBottom: 12 }}>Today's Reading</div>
                        <div style={{ position: 'relative', zIndex: 1, fontSize: 14, color: '#ced4da', lineHeight: 1.5, maxWidth: 300, marginBottom: 32 }}>
                            Your curated study path is waiting. Sync your course materials to generate a focused reading schedule for yourself.
                        </div>
                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 12 }}>
                            <button onClick={() => setPg('plan')} style={{ ...btn('p') }}>Generate Plan</button>
                        </div>
                    </div>

                    {/* Sub-grid: Velocity and Milestone */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>
                        <div style={{ ...card(), padding: 24 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: C.wh, marginBottom: 24 }}>Study Velocity</div>
                            {/* Mock Bar Chart */}
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, borderBottom: `1px solid ${C.b}`, paddingBottom: 8, marginTop: 'auto' }}>
                                {[40, 60, 50, 80, 100, 70, 90].map((h, i) => (
                                    <div key={i} style={{
                                        flex: 1, background: i === 4 ? C.a : C.b, borderRadius: '4px 4px 0 0', height: `${h}%`
                                    }}></div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 10, color: C.mu, fontWeight: 600 }}>
                                <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span>
                            </div>
                        </div>

                        <div style={{ ...card(), padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                            <div style={{ width: 48, height: 48, borderRadius: 8, background: C.s2, border: `1px solid ${C.b}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: C.a, marginBottom: 16 }}>
                                🏆
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: C.wh, marginBottom: 8 }}>New Milestone</div>
                            <div style={{ fontSize: 12, color: C.mu, lineHeight: 1.5 }}>
                                Complete 2 more study sessions to unlock the "Master Researcher" badge.
                            </div>
                        </div>
                    </div>

                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                    {/* Quick Actions */}
                    <div style={{ ...card(), padding: 24 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.wh, marginBottom: 20 }}>Quick Actions</div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <button onClick={() => setPg('cards')} style={{
                                ...btn('s2'), width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px', border: `1px solid ${C.b}`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.s, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.a }}>🔖</div>
                                    <span>{dueCards.length ? `${dueCards.length} Cards Due` : 'No Cards Due'}</span>
                                </div>
                                <span style={{ color: C.mu }}>&gt;</span>
                            </button>

                            <button onClick={() => setPg('files')} style={{
                                ...btn('s2'), width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px', border: `1px solid ${C.b}`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.s, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.a }}>📁</div>
                                    <span>Upload Course Files</span>
                                </div>
                                <span style={{ color: C.mu }}>&gt;</span>
                            </button>

                            <button onClick={() => setPg('plan')} style={{
                                ...btn('s2'), width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px', border: `1px solid ${C.b}`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.s, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.a }}>📅</div>
                                    <span>Generate Study Plan</span>
                                </div>
                                <span style={{ color: C.mu }}>&gt;</span>
                            </button>

                            {/* Pro Tip */}
                            <div style={{ padding: 16, borderRadius: 8, border: `1px solid ${C.aD}`, background: `linear-gradient(rgba(99, 91, 255, 0.05), transparent)`, marginTop: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: C.a, letterSpacing: '0.05em', marginBottom: 8 }}>⚡ PRO TIP</div>
                                <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.5 }}>
                                    Users who set daily goals are 40% more likely to complete their courses on time. Start your first session today!
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
