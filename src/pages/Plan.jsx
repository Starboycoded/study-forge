import React, { useState } from 'react';
import { C, card, btn, inp } from '../theme';
import { ai, parseJSON } from '../utils/ai';

export default function Plan({ courses, plan, setPlan, examWeeks, setExamWeeks, notify, isMobile }) {
    const [loading, setLoading] = useState(false);
    const [hpd, setHpd] = useState(2);
    const [online, setOnline] = useState(false);

    const gen = async () => {
        if (!courses.length) { notify('Upload files first!'); return; }
        setLoading(true);
        try {
            const courseList = courses.map(c =>
                `Course: ${c.name}\nFiles: ${c.files.map(f => f.name).join(', ')}\nContent: ${c.files[0]?.text?.slice(0, 300) || '[PDF file]'}`
            ).join('\n\n');
            const prompt = `Student has ${examWeeks} weeks until exam, studies ${hpd} hours/day.
Course materials:\n${courseList}

Make a reading schedule from today (${new Date().toISOString().split('T')[0]}).
Return ONLY a JSON array, no extra text:
[{"date":"YYYY-MM-DD","course":"name","topic":"chapter/topic","pages":"Pages X-Y","duration":"Xh","done":false}]`;
            const text = await ai([{ role: 'user', content: prompt }], 'Return only valid JSON array.', online);
            const parsed = parseJSON(text);
            if (parsed?.length) {
                setPlan(parsed.map((p, i) => ({ ...p, id: 'p' + i })));
                notify(`✓ ${parsed.length}-item plan created!`);
            } else notify("Couldn't generate plan, try again");
        } catch (e) { notify('Error: ' + e.message); }
        setLoading(false);
    };

    const toggle = id => setPlan(p => p.map(x => x.id === id ? { ...x, done: !x.done } : x));
    const pct = plan.length ? Math.round(plan.filter(p => p.done).length / plan.length * 100) : 0;

    const grouped = {};
    plan.forEach(p => {
        const k = new Date(p.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        (grouped[k] = grouped[k] || []).push(p);
    });

    return (
        <div style={{ paddingBottom: 40 }}>
            {/* Header */}
            <div style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: C.a, marginBottom: 8, letterSpacing: '-0.02em' }}>Study Plan</div>
                <div style={{ width: 48, height: 4, background: C.a, borderRadius: 2 }}></div>
            </div>

            {/* GENERATE SCHEDULE PANEL */}
            <div style={{ ...card(), padding: isMobile ? 24 : 32, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 18, fontWeight: 700, color: C.wh, marginBottom: 24 }}>
                    <div style={{ background: C.s, color: C.a, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚙</div>
                    Generate Schedule
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, marginBottom: 24 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.mu, letterSpacing: '0.05em', marginBottom: 8 }}>HOURS / DAY</div>
                        <div style={{ position: 'relative' }}>
                            <input type="number" value={hpd} min={0.5} max={12} step={0.5} onChange={e => setHpd(+e.target.value)} style={{ ...inp(), padding: '14px 60px 14px 16px', background: C.s, border: `1px solid ${C.b}`, fontSize: 15, width: '100%' }} />
                            <div style={{ position: 'absolute', right: 38, top: '50%', transform: 'translateY(-50%)', color: C.mu, pointerEvents: 'none' }}>⏱</div>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.mu, letterSpacing: '0.05em', marginBottom: 8 }}>WEEKS TO EXAM</div>
                        <div style={{ position: 'relative' }}>
                            <input type="number" value={examWeeks} min={1} max={52} onChange={e => setExamWeeks(+e.target.value)} style={{ ...inp(), padding: '14px 60px 14px 16px', background: C.s, border: `1px solid ${C.b}`, fontSize: 15, width: '100%' }} />
                            <div style={{ position: 'absolute', right: 38, top: '50%', transform: 'translateY(-50%)', color: C.mu, pointerEvents: 'none' }}>📅</div>
                        </div>
                    </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 24, fontSize: 14, color: C.tx }}>
                    <input type="checkbox" checked={online} onChange={e => setOnline(e.target.checked)} style={{ width: 16, height: 16 }} />
                    Cross-reference online data <span style={{ color: C.mu, fontStyle: 'italic' }}>(uses more tokens)</span>
                </label>
                
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 16 }}>
                    <button onClick={gen} style={{ ...btn('p'), padding: '14px 24px', fontSize: 15 }} disabled={loading || !courses.length}>
                        {loading ? '⏳ Generating...' : '✦ Generate My Plan'}
                    </button>
                    {!courses.length && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2a0d0d', color: C.re, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                            <span>⚠</span> Upload files first
                        </div>
                    )}
                </div>
            </div>

            {/* RESULTS OR EMPTY STATE */}
            {plan.length > 0 ? (
                <div style={{ ...card(), padding: isMobile ? 20 : 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 14, color: C.mu }}>
                        <span style={{ fontWeight: 600 }}>{plan.filter(p => p.done).length}/{plan.length} sessions completed · {pct}%</span>
                        <button onClick={() => { if (confirm('Clear plan?')) setPlan([]); }} style={{ ...btn('d'), padding: '6px 14px', fontSize: 12 }}>Clear</button>
                    </div>
                    <div style={{ background: C.s2, borderRadius: 8, height: 8, marginBottom: 24 }}>
                        <div style={{ background: `linear-gradient(90deg,${C.a},${C.gr})`, borderRadius: 8, height: 8, width: pct + '%', transition: 'width .6s' }} />
                    </div>
                    {Object.entries(grouped).map(([date, items]) => (
                        <div key={date} style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 13, color: C.wh, fontWeight: 700, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                                📅 {date}
                                {items.every(i => i.done) && (
                                    <span style={{ color: C.gr, fontSize: 10, background: '#0d2a1a', padding: '2px 8px', borderRadius: 10 }}>✓ Done</span>
                                )}
                            </div>
                            {items.map(item => (
                                <div
                                    key={item.id}
                                    style={{ background: C.s, border: `1px solid ${item.done ? '#0d2a1a' : C.b}`, padding: 16, borderRadius: 8, marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 16, opacity: item.done ? 0.6 : 1, transition: 'all 0.2s', cursor: 'pointer' }}
                                    onClick={() => toggle(item.id)}
                                >
                                    <input type="checkbox" checked={item.done} onChange={() => toggle(item.id)} style={{ marginTop: 4, flexShrink: 0, width: 16, height: 16 }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, textDecoration: item.done ? 'line-through' : 'none', fontSize: 15, color: C.wh, marginBottom: 4 }}>{item.course}</div>
                                        <div style={{ fontSize: 13, color: C.mu, marginBottom: 6 }}>{item.topic}</div>
                                        <div style={{ fontSize: 12 }}>
                                            <span style={{ color: C.a }}>{item.pages}</span> · <span style={{ color: C.mu }}>{item.duration}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: 24 }}>
                    {/* Left Empty State Panel */}
                    <div style={{ 
                        ...card(), background: 'transparent', border: `1px dashed ${C.b}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textAlign: 'center', padding: isMobile ? '40px 20px' : '60px 40px', minHeight: 300
                    }}>
                        <div style={{ 
                            width: 80, height: 80, borderRadius: 40, background: C.s, border: `1px solid ${C.b}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: C.mu,
                            marginBottom: 24, boxShadow: `0 0 40px rgba(0,0,0,0.3)`
                        }}>
                            📋
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.wh, marginBottom: 12 }}>No plan yet</div>
                        <div style={{ color: C.mu, fontSize: 15, lineHeight: 1.6, maxWidth: 300 }}>
                            Click Generate to create your personalized study schedule based on your uploaded resources.
                        </div>
                    </div>

                    {/* Right Panels */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div style={{ ...card(), background: `linear-gradient(135deg, rgba(99,91,255,0.06) 0%, transparent 100%)`, border: `1px solid ${C.aD}`, padding: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.a, fontWeight: 700, marginBottom: 12, fontSize: 15 }}>
                                💡 Atelier Tip
                            </div>
                            <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.6 }}>
                                The most effective plans account for <strong style={{ color: C.wh }}>interleaving</strong>—mixing different subjects in one day to improve long-term retention.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
