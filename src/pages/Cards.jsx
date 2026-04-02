import React, { useState } from 'react';
import { C, card, btn, inp } from '../theme';
import { ai, parseJSON } from '../utils/ai';
import { sm2 } from '../utils/sm2';

export default function Cards({ cards, setCards, courses, dueCards, notify, isMobile }) {
    const [mode, setMode] = useState('home');
    const [selC, setSelC] = useState('');
    const [loading, setLoading] = useState(false);
    const [rIdx, setRIdx] = useState(0);
    const [showA, setShowA] = useState(false);
    const [online, setOnline] = useState(false);
    const [newQ, setNewQ] = useState('');
    const [newA, setNewA] = useState('');
    const [newC, setNewC] = useState('');

    const queue = [...dueCards].sort((a, b) => (a.due || '') < (b.due || '') ? -1 : 1);
    const curr = queue[rIdx];

    const genCards = async () => {
        const course = courses.find(c => c.name === selC) || courses[0];
        if (!course) { notify('Select a course'); return; }
        setLoading(true);
        try {
            const fileContent = course.files.slice(0, 2).map(f =>
                f.b64
                    ? JSON.stringify([{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.b64 } }, { type: 'text', text: `File: ${f.path}` }])
                    : `File: ${f.path}\n${(f.text || '').slice(0, 3000)}`
            ).join('\n\n---\n\n');
            const prompt = `Generate 10 comprehensive flashcards from these study materials.\n${fileContent}\n${online ? 'Search online for additional context on the topics.' : ''}\nReturn ONLY JSON array: [{"q":"question","a":"answer","course":"${course.name}"}]`;
            const msgs = course.files[0]?.b64
                ? [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: course.files[0].b64 } }, { type: 'text', text: prompt }] }]
                : [{ role: 'user', content: prompt }];
            const text = await ai(msgs, 'Return only valid JSON array.', online);
            const parsed = parseJSON(text);
            if (parsed?.length) {
                setCards(p => [...p, ...parsed.map((c, i) => ({ ...c, id: 'c' + Date.now() + i, ef: 2.5, reps: 0, interval: 1, due: null }))]);
                notify(`✓ Added ${parsed.length} cards for ${course.name}`);
                setMode('home');
            } else notify("Couldn't parse cards, try again");
        } catch (e) { notify('Error: ' + e.message); }
        setLoading(false);
    };

    const rate = q => {
        setCards(p => p.map(c => c.id === curr.id ? sm2(c, q) : c));
        setShowA(false);
        if (rIdx + 1 >= queue.length) { setMode('home'); notify('✓ Review done!'); }
        else setRIdx(i => i + 1);
    };

    const addCustom = () => {
        if (!newQ.trim() || !newA.trim()) return;
        setCards(p => [...p, { id: 'cc' + Date.now(), q: newQ, a: newA, course: newC || 'Custom', ef: 2.5, reps: 0, interval: 1, due: null }]);
        setNewQ(''); setNewA(''); setNewC('');
        notify('✓ Card added');
    };

    // ── Review mode ──
    if (mode === 'review') {
        if (!queue.length) return (
            <div style={{ paddingBottom: 40, textAlign: 'center', paddingTop: 80 }}>
                <div style={{ 
                    width: 80, height: 80, borderRadius: 40, background: C.s, border: `1px solid ${C.b}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: C.mu,
                    margin: '0 auto 24px', boxShadow: `0 0 40px rgba(0,0,0,0.3)`
                }}>
                    🎉
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.wh, marginBottom: 12 }}>All caught up!</div>
                <div style={{ color: C.mu, margin: '8px 0 24px' }}>No more cards due right now.</div>
                <button onClick={() => setMode('home')} style={{ ...btn('s2'), padding: '12px 24px' }}>← Back to Flashcards</button>
            </div>
        );

        return (
            <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 60 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, fontSize: 13, color: C.mu }}>
                    <button onClick={() => { setMode('home'); setRIdx(0); }} style={{ background: C.s2, border: `1px solid ${C.b}`, borderRadius: 6, padding: '6px 12px', color: C.tx, cursor: 'pointer', fontWeight: 600 }}>← Quit Session</button>
                    <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>{rIdx + 1} / {queue.length}</span>
                    <span style={{ background: C.s, color: C.a, padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700, border: `1px solid ${C.b}` }}>{curr?.course || 'General'}</span>
                </div>
                
                <div style={{ background: C.s, borderRadius: 4, height: 6, marginBottom: 32, overflow: 'hidden' }}>
                    <div style={{ background: `linear-gradient(90deg, ${C.a}, #9d4edd)`, height: '100%', width: ((rIdx / queue.length) * 100) + '%', transition: 'width 0.4s ease-out' }} />
                </div>
                
                <div onClick={() => setShowA(true)} style={{ 
                    ...card({ 
                        minHeight: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center', 
                        textAlign: 'center', cursor: showA ? 'default' : 'pointer', 
                        borderColor: showA ? C.b : C.a,
                        boxShadow: showA ? 'none' : `0 0 0 1px ${C.a}33, 0 8px 24px rgba(0,0,0,0.4)`,
                        transition: 'all .3s ease', marginBottom: 24, padding: 40,
                        background: showA ? C.s2 : `linear-gradient(180deg, ${C.s2} 0%, rgba(99,91,255,0.03) 100%)`
                    }) 
                }}>
                    <div style={{ fontSize: 11, color: C.a, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 24 }}>QUESTION</div>
                    <div style={{ fontSize: 24, lineHeight: 1.6, fontWeight: 600, color: C.wh }}>{curr?.q}</div>
                    {!showA && <div style={{ fontSize: 13, color: C.mu, marginTop: 32, fontWeight: 500, opacity: 0.7 }}>Tap card to reveal answer</div>}
                </div>
                
                {showA && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        <div style={{ ...card({ background: 'transparent', textAlign: 'center', border: `1px solid ${C.b}`, marginBottom: 32, padding: 32 }) }}>
                            <div style={{ fontSize: 11, color: '#10b981', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 24 }}>ANSWER</div>
                            <div style={{ fontSize: 18, lineHeight: 1.7, color: C.tx }}>{curr?.a}</div>
                        </div>
                        
                        <div style={{ fontSize: 11, color: C.mu, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 12, textAlign: 'center' }}>HOW WELL DID YOU KNOW THIS?</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
                            {[
                                ['Again', 0, '#ef4444', '< 1 day'],
                                ['Hard', 1, '#f97316', '~1 day'],
                                ['Good', 3, '#3b82f6', '~' + Math.round((curr?.interval || 1) * 2.5) + 'd'],
                                ['Easy', 5, '#10b981', '~' + Math.round((curr?.interval || 1) * 3) + 'd'],
                            ].map(([l, q, col, sub]) => (
                                <button key={l} onClick={() => rate(q)} style={{ 
                                    background: C.s2, border: `1px solid ${C.b}`, borderTop: `4px solid ${col}`, 
                                    padding: isMobile ? '12px 0' : '16px 8px', textAlign: 'center', borderRadius: 8, cursor: 'pointer',
                                    transition: 'background 0.2s, transform 0.1s'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = C.s}
                                onMouseOut={e => e.currentTarget.style.background = C.s2}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <div style={{ color: C.wh, fontWeight: 700, fontSize: 16 }}>{l}</div>
                                    <div style={{ fontSize: 12, color: C.mu, marginTop: 6 }}>{sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                <style>{`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        );
    }

    // ── Home mode ──
    const byCourse = {};
    cards.forEach(c => (byCourse[c.course] = byCourse[c.course] || []).push(c));

    return (
        <div style={{ paddingBottom: 40 }}>
            {/* Header */}
            <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: C.a, marginBottom: 8, letterSpacing: '-0.02em' }}>Flashcards</div>
                  <div style={{ width: 48, height: 4, background: C.a, borderRadius: 2 }}></div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 32 }}>
                
                {/* LEFT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* Review Hero Card */}
                    <div style={{ ...card(), background: dueCards.length > 0 ? `linear-gradient(135deg, ${C.a} 0%, #3026a1 100%)` : 'transparent', border: dueCards.length > 0 ? 'none' : `1px dashed ${C.b}`, padding: isMobile ? '24px' : '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                        {dueCards.length > 0 && <div style={{ position: 'absolute', right: -30, top: -30, fontSize: 180, opacity: 0.1, pointerEvents: 'none' }}>🎯</div>}
                        {dueCards.length > 0 ? (
                            <>
                                <div style={{ fontSize: 48, marginBottom: 16, position: 'relative' }}>🎯</div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: C.wh, marginBottom: 8, position: 'relative' }}>{dueCards.length} Cards Due</div>
                                <div style={{ fontSize: 15, color: C.tx, marginBottom: 24, position: 'relative' }}>You have knowledge to review!</div>
                                <button onClick={() => { setRIdx(0); setShowA(false); setMode('review'); }} style={{ ...btn('p'), background: C.wh, color: C.bg, padding: '14px 32px', fontSize: 16, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', position: 'relative' }}>
                                    ▶ Start Review Session
                                </button>
                            </>
                        ) : (
                            <>
                                <div style={{ 
                                    width: 80, height: 80, borderRadius: 40, background: C.s, border: `1px solid ${C.b}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: C.mu,
                                    marginBottom: 24, boxShadow: `0 0 40px rgba(0,0,0,0.3)`
                                }}>
                                    🎉
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: C.wh, marginBottom: 8 }}>All caught up!</div>
                                <div style={{ fontSize: 15, color: C.mu }}>No more cards due right now.</div>
                            </>
                        )}
                    </div>

                    {/* Generate Flashcards from Files */}
                    <div style={{ ...card(), padding: 32 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700, color: C.wh, marginBottom: 24 }}>
                            <span style={{ color: C.a }}>✦</span> AI Generator
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.mu, letterSpacing: '0.05em', marginBottom: 8 }}>SELECT COURSE FILES</div>
                            <select value={selC} onChange={e => setSelC(e.target.value)} style={{ ...inp(), padding: '14px', background: C.s, border: `1px solid ${C.b}`, fontSize: 15, width: '100%' }}>
                                <option value="">Select course...</option>
                                {courses.map(c => <option key={c.name} value={c.name}>{c.name} ({c.files.length} files)</option>)}
                            </select>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 24, fontSize: 14, color: C.tx }}>
                            <input type="checkbox" checked={online} onChange={e => setOnline(e.target.checked)} style={{ width: 16, height: 16 }} />
                            Cross-reference online data <span style={{ color: C.mu, fontStyle: 'italic' }}>(uses more tokens)</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <button onClick={genCards} style={{ ...btn('p'), padding: '14px 24px', fontSize: 15, flex: 1 }} disabled={loading || !courses.length}>
                                {loading ? '⏳ Generating 10 cards...' : 'Generate Flashcards'}
                            </button>
                        </div>
                        {!courses.length && <div style={{ fontSize: 13, color: C.re, marginTop: 12, fontWeight: 600 }}>⚠ Upload files first to generate</div>}
                    </div>

                </div>

                {/* RIGHT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* Add Custom Card */}
                    <div style={{ ...card(), padding: 24 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.mu, letterSpacing: '0.05em', marginBottom: 16 }}>+ ADD CARD MANUALLY</div>
                        <input value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="Question..." style={{ ...inp(), padding: '12px', background: C.s, border: `1px solid ${C.b}`, marginBottom: 12, width: '100%' }} />
                        <textarea value={newA} onChange={e => setNewA(e.target.value)} placeholder="Answer..." rows={2} style={{ ...inp(), padding: '12px', background: C.s, border: `1px solid ${C.b}`, marginBottom: 12, fontFamily: 'inherit', resize: 'vertical', width: '100%' }} />
                        <div style={{ display: 'flex', gap: 12 }}>
                            <input value={newC} onChange={e => setNewC(e.target.value)} placeholder="Deck name" style={{ ...inp(), padding: '12px', background: C.s, border: `1px solid ${C.b}`, flex: 1 }} />
                            <button onClick={addCustom} style={{ ...btn('s2'), padding: '0 20px', border: `1px solid ${C.b}` }} disabled={!newQ || !newA}>Add</button>
                        </div>
                    </div>

                    {/* Decks Library */}
                    <div style={{ ...card(), background: 'transparent', border: cards.length ? 'none' : `1px dashed ${C.b}`, padding: cards.length ? 0 : 40, textAlign: cards.length ? 'left' : 'center' }}>
                        {!cards.length ? (
                            <>
                                <div style={{ fontSize: 32, marginBottom: 16 }}>📚</div>
                                <div style={{ color: C.mu, fontSize: 15 }}>No flashcards yet. Generate some or add them manually!</div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.wh, marginBottom: 16 }}>Card Library</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {Object.entries(byCourse).map(([course, cds]) => {
                                        const numDue = cds.filter(c => !c.due || new Date(c.due) <= new Date()).length;
                                        return (
                                            <div key={course} style={{ background: C.s2, borderRadius: 8, padding: 16, border: `1px solid ${C.b}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                    <div style={{ color: C.wh, fontWeight: 700, fontSize: 15 }}>{course}</div>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        {numDue > 0 && <span style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{numDue} due</span>}
                                                        <span style={{ background: C.s, color: C.mu, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{cds.length} total</span>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {cds.slice(0, 2).map(c => (
                                                        <div key={c.id} style={{ padding: '10px 12px', background: C.s, borderRadius: 6, fontSize: 13, border: `1px solid ${C.b}` }}>
                                                            <div style={{ color: C.a, marginBottom: 4, fontWeight: 600 }}>Q: {c.q}</div>
                                                            <div style={{ color: C.mu, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>A: {c.a}</div>
                                                        </div>
                                                    ))}
                                                    {cds.length > 2 && <div style={{ fontSize: 12, color: C.mu, marginTop: 4, textAlign: 'center', fontWeight: 600 }}>+ {cds.length - 2} more</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
