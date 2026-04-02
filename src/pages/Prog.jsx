import React from 'react';
import { C, card } from '../theme';

export default function Prog({ cards, qHist, plan, files, isMobile }) {
    const total = cards.length;
    const mastered = cards.filter(c => (c.reps || 0) >= 5).length;
    const learning = cards.filter(c => (c.reps || 0) > 0 && (c.reps || 0) < 5).length;
    const planDone = plan.filter(p => p.done).length;
    const avgQ = qHist.length ? Math.round(qHist.reduce((s, q) => s + q.pct, 0) / qHist.length) : 0;

    const byCourse = {};
    cards.forEach(c => {
        if (!byCourse[c.course]) byCourse[c.course] = { total: 0, mastered: 0 };
        byCourse[c.course].total++;
        if ((c.reps || 0) >= 5) byCourse[c.course].mastered++;
    });

    return (
        <div style={{ paddingBottom: 40 }}>
            {/* Header */}
            <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: C.a, marginBottom: 8, letterSpacing: '-0.02em' }}>Progress & Stats</div>
                  <div style={{ width: 48, height: 4, background: C.a, borderRadius: 2 }}></div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? 12 : 24, marginBottom: 32 }}>
                {[
                    ['Total Cards', total, C.a, '📚'],
                    ['Mastered', mastered, '#10b981', '⭐'],
                    ['Learning', learning, '#3b82f6', '🧠'],
                    ['Plan Completion', planDone, '#9d4edd', '📖'],
                    ['Files Processed', files.length, '#f97316', '🗂️'],
                    ['Quiz Avg', avgQ + '%', avgQ >= 70 ? '#10b981' : '#ef4444', '🎯'],
                ].map(([l, v, col, icon]) => (
                    <div key={l} style={{ ...card(), padding: isMobile ? 16 : 24, display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 20 }}>
                        <div style={{ 
                            width: isMobile ? 40 : 56, height: isMobile ? 40 : 56, borderRadius: 16, 
                            background: `rgba(${parseInt(col.slice(1,3), 16) || 99}, ${parseInt(col.slice(3,5), 16) || 91}, ${parseInt(col.slice(5,7), 16) || 255}, 0.1)`, 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 18 : 24, color: col 
                        }}>
                            {icon}
                        </div>
                        <div>
                            <div style={{ fontSize: isMobile ? 20 : 28, color: C.wh, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2 }}>{v}</div>
                            <div style={{ fontSize: isMobile ? 10 : 13, color: C.mu, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{l}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 32 }}>
                
                {/* LEFT COL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {total > 0 && (
                        <div style={{ ...card(), padding: isMobile ? 24 : 32 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: C.wh, marginBottom: 24 }}>Card Mastery</div>
                            <div style={{ display: 'flex', gap: 4, height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
                                <div style={{ width: (mastered / total * 100) + '%', background: '#10b981' }} />
                                <div style={{ width: (learning / total * 100) + '%', background: '#3b82f6' }} />
                                <div style={{ flex: 1, background: C.s2 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {[['Mastered Cards', mastered, '#10b981'], ['Currently Learning', learning, '#3b82f6'], ['New / Unseen', total - mastered - learning, C.mu]].map(([l, n, col]) => (
                                    <div key={l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 12, height: 12, borderRadius: 6, background: col }} />
                                            <span style={{ color: C.mu, fontSize: 14 }}>{l}</span>
                                        </div>
                                        <span style={{ color: C.wh, fontWeight: 600, fontSize: 15 }}>{n}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {plan.length > 0 && (
                        <div style={{ ...card(), padding: isMobile ? 24 : 32 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <span style={{ fontSize: 18, fontWeight: 700, color: C.wh }}>Reading Progress</span>
                                <span style={{ color: C.a, fontWeight: 700, background: 'rgba(99,91,255,0.1)', padding: '4px 12px', borderRadius: 12, fontSize: 13 }}>{planDone} / {plan.length}</span>
                            </div>
                            <div style={{ background: C.s2, borderRadius: 8, height: 12, overflow: 'hidden' }}>
                                <div style={{ background: `linear-gradient(90deg,${C.a},${C.gr})`, height: '100%', width: (planDone / plan.length * 100) + '%', transition: 'width .6s' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {Object.keys(byCourse).length > 0 && (
                        <div style={{ ...card(), padding: isMobile ? 24 : 32 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: C.wh, marginBottom: 24 }}>Per-Course Mastery</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {Object.entries(byCourse).map(([course, d]) => (
                                    <div key={course}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                                            <span style={{ color: C.wh, fontWeight: 500 }}>{course}</span>
                                            <span style={{ color: '#10b981', fontWeight: 600 }}>{d.mastered} <span style={{ color: C.mu, fontWeight: 400 }}>/ {d.total}</span></span>
                                        </div>
                                        <div style={{ background: C.s2, borderRadius: 4, height: 8, overflow: 'hidden' }}>
                                            <div style={{ background: '#10b981', height: '100%', width: (d.mastered / d.total * 100) + '%', transition: 'width .6s' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {qHist.length > 0 && (
                        <div style={{ ...card(), padding: isMobile ? 24 : 32 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: C.wh, marginBottom: 24 }}>Quiz History</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {[...qHist].reverse().slice(0, 6).map((h, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                        <span style={{ fontSize: 12, color: C.mu, width: 50, flexShrink: 0, fontWeight: 600 }}>
                                            {new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        <span style={{ fontSize: 14, color: C.wh, width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>{h.course}</span>
                                        <div style={{ flex: 1, background: C.s2, borderRadius: 4, height: 8, overflow: 'hidden' }}>
                                            <div style={{ background: h.pct >= 70 ? '#10b981' : '#ef4444', height: '100%', width: h.pct + '%' }} />
                                        </div>
                                        <span style={{ fontSize: 14, color: h.pct >= 70 ? '#10b981' : '#ef4444', width: 44, textAlign: 'right', fontWeight: 700, flexShrink: 0 }}>{h.pct}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
