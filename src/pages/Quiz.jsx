import React, { useState } from 'react';
import { C, card, btn, inp } from '../theme';
import { ai, parseJSON } from '../utils/ai';

export default function Quiz({ courses, qHist, setQHist, notify, isMobile }) {
    const [quiz, setQuiz] = useState(null);
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [selC, setSelC] = useState('');
    const [loading, setLoading] = useState(false);
    const [online, setOnline] = useState(false);

    const gen = async () => {
        const course = courses.find(c => c.name === selC) || courses[0];
        if (!course) { notify('Select a course'); return; }
        setLoading(true); setQuiz(null); setAnswers({}); setSubmitted(false);
        try {
            const fileContent = course.files.slice(0, 2).map(f => f.text ? (f.text || '').slice(0, 3000) : '[PDF content]').join('\n---\n');
            const prompt = `Create 6 multiple-choice questions from:\n${fileContent}\n${online ? 'Search online for current info on these topics.' : ''}\nReturn ONLY JSON array: [{"q":"question","options":["A","B","C","D"],"answer":0,"explanation":"why"}]`;
            const text = await ai([{ role: 'user', content: prompt }], 'Return only valid JSON array.', online);
            const parsed = parseJSON(text);
            if (parsed?.length) { setQuiz({ questions: parsed, course: course.name }); notify('✓ Quiz ready!'); }
            else notify("Couldn't generate quiz, try again");
        } catch (e) { notify('Error: ' + e.message); }
        setLoading(false);
    };

    const submit = () => {
        setSubmitted(true);
        const correct = quiz.questions.filter((q, i) => answers[i] === q.answer).length;
        const pct = Math.round(correct / quiz.questions.length * 100);
        setQHist(h => [...h, { course: quiz.course, correct, total: quiz.questions.length, pct, date: new Date().toISOString() }]);
    };

    const score = quiz ? quiz.questions.filter((q, i) => answers[i] === q.answer).length : 0;
    const answered = Object.keys(answers).length;

    return (
        <div style={{ paddingBottom: 40 }}>
            <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: C.a, marginBottom: 8, letterSpacing: '-0.02em' }}>Quiz Mode</div>
                  <div style={{ width: 48, height: 4, background: C.a, borderRadius: 2 }}></div>
                </div>
            </div>

            {!quiz ? (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 32 }}>
                    
                    {/* LEFT COLUMN: GEN QUIZ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div style={{ ...card(), padding: 32, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', right: -20, bottom: -40, fontSize: 160, opacity: 0.03, pointerEvents: 'none' }}>
                                🧠
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 700, color: C.wh, marginBottom: 24, position: 'relative' }}>
                                <span style={{ color: C.a }}>✦</span> AI Quiz Generator
                            </div>
                            <div style={{ marginBottom: 20, position: 'relative' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.mu, letterSpacing: '0.05em', marginBottom: 8 }}>TARGET COURSE</div>
                                <select value={selC} onChange={e => setSelC(e.target.value)} style={{ ...inp(), padding: '14px', background: C.s, border: `1px solid ${C.b}`, fontSize: 15, width: '100%' }}>
                                    <option value="">Select course...</option>
                                    {courses.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 24, fontSize: 14, color: C.tx, position: 'relative' }}>
                                <input type="checkbox" checked={online} onChange={e => setOnline(e.target.checked)} style={{ width: 16, height: 16 }} />
                                Include online context <span style={{ color: C.mu, fontStyle: 'italic' }}>(uses more tokens)</span>
                            </label>
                            <button onClick={gen} style={{ ...btn('p'), width: '100%', padding: '14px', fontSize: 16, position: 'relative' }} disabled={loading || !courses.length}>
                                {loading ? '⏳ Generating Quiz...' : 'Start 6-Question Quiz'}
                            </button>
                            {!courses.length && <div style={{ fontSize: 13, color: C.re, marginTop: 12, fontWeight: 600, textAlign: 'center' }}>⚠ Upload files first</div>}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: RECENT QUIZZES */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {qHist.length > 0 ? (
                            <div style={{ ...card(), padding: 24 }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.wh, marginBottom: 16 }}>Recent Performance</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[...qHist].reverse().slice(0, 5).map((h, i) => (
                                        <div key={i} style={{ padding: 16, background: C.s2, borderRadius: 8, border: `1px solid ${C.b}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 15, color: C.wh, marginBottom: 4 }}>{h.course}</div>
                                                <div style={{ fontSize: 12, color: C.mu }}>{new Date(h.date).toLocaleDateString()} · {h.correct}/{h.total} correct</div>
                                            </div>
                                            <div style={{ fontSize: 24, color: h.pct >= 70 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{h.pct}%</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div style={{ 
                                ...card(), background: 'transparent', border: `1px dashed ${C.b}`,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                textAlign: 'center', padding: '60px 40px', minHeight: 300
                            }}>
                                <div style={{ 
                                    width: 80, height: 80, borderRadius: 40, background: C.s, border: `1px solid ${C.b}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: C.mu,
                                    marginBottom: 24, boxShadow: `0 0 40px rgba(0,0,0,0.3)`
                                }}>
                                    🏆
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: C.wh, marginBottom: 12 }}>No Quizzes Yet</div>
                                <div style={{ color: C.mu, fontSize: 15, lineHeight: 1.6, maxWidth: 300 }}>
                                    Generate your first quiz to test your knowledge.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {/* QUIZ ACTIVE VIEW */}
            {quiz && !submitted && (
                <div style={{ maxWidth: 760, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: '0 8px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.a, letterSpacing: '0.05em' }}>{quiz.course.toUpperCase()}</div>
                        <div style={{ fontSize: 14, color: C.mu, fontWeight: 600 }}>{answered} / {quiz.questions.length} Answered</div>
                    </div>
                    
                    <div style={{ background: C.s, borderRadius: 4, height: 6, marginBottom: 32, overflow: 'hidden' }}>
                        <div style={{ background: `linear-gradient(90deg, ${C.a}, #9d4edd)`, height: '100%', width: ((answered / quiz.questions.length) * 100) + '%', transition: 'width 0.4s ease-out' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
                        {quiz.questions.map((q, qi) => (
                            <div key={qi} style={{ ...card(), padding: isMobile ? 20 : 32, border: `1px solid ${answers[qi] !== undefined ? C.a : C.b}`, transition: 'border-color 0.3s' }}>
                                <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                                    <div style={{ color: C.a, fontWeight: 700, fontSize: 18 }}>{qi + 1}.</div>
                                    <div style={{ fontWeight: 600, fontSize: 18, color: C.wh, lineHeight: 1.5 }}>{q.q}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: isMobile ? 0 : 34 }}>
                                    {q.options.map((opt, oi) => {
                                        const isSel = answers[qi] === oi;
                                        return (
                                            <button
                                                key={oi}
                                                onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                                                style={{
                                                    display: 'flex', width: '100%', textAlign: 'left',
                                                    padding: '16px 20px', background: isSel ? 'rgba(99,91,255,0.1)' : C.s2,
                                                    border: `1px solid ${isSel ? C.a : C.b}`,
                                                    borderRadius: 12, color: isSel ? C.wh : C.tx, fontSize: 15, cursor: 'pointer',
                                                    transition: 'all 0.2s', alignItems: 'center'
                                                }}
                                            >
                                                <div style={{ 
                                                    width: 24, height: 24, borderRadius: 12, border: `2px solid ${isSel ? C.a : C.mu}`, 
                                                    marginRight: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    background: isSel ? C.a : 'transparent'
                                                }}>
                                                    {isSel && <div style={{ width: 10, height: 10, borderRadius: 5, background: C.wh }} />}
                                                </div>
                                                <span style={{ fontWeight: isSel ? 600 : 400, flex: 1, lineHeight: 1.4 }}>{opt}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div style={{ display: 'flex', gap: 16, padding: '0 8px' }}>
                        <button onClick={submit} style={{ ...btn('p'), flex: 2, padding: '16px', fontSize: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} disabled={answered < quiz.questions.length}>
                            Submit Quiz ({answered}/{quiz.questions.length})
                        </button>
                        <button onClick={() => setQuiz(null)} style={{ ...btn('s2'), flex: 1, border: `1px solid ${C.b}` }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* QUIZ RESULTS VIEW */}
            {quiz && submitted && (
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div style={{ 
                        ...card(), padding: isMobile ? 24 : 40, textAlign: 'center', marginBottom: 32,
                        background: score / quiz.questions.length >= 0.7 ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                        border: `1px solid ${score / quiz.questions.length >= 0.7 ? '#10b981' : '#ef4444'}`
                    }}>
                        <div style={{ fontSize: 64, fontWeight: 700, color: score / quiz.questions.length >= 0.7 ? '#10b981' : '#ef4444', marginBottom: 8, letterSpacing: '-0.03em' }}>
                            {Math.round(score / quiz.questions.length * 100)}%
                        </div>
                        <div style={{ fontSize: 16, color: C.tx, fontWeight: 600 }}>{score} out of {quiz.questions.length} correct · {quiz.course}</div>
                        <div style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: score / quiz.questions.length >= 0.7 ? '#10b981' : '#ef4444' }}>
                            {score / quiz.questions.length >= 0.9 ? '🏆 Excellent work!' : score / quiz.questions.length >= 0.7 ? '🎯 Good job!' : '📖 Needs more review!'}
                        </div>
                        <button onClick={() => { setQuiz(null); setAnswers({}); setSubmitted(false); }} style={{ ...btn('p'), marginTop: 24, padding: '12px 32px' }}>Take Another Quiz</button>
                    </div>

                    <div style={{ fontSize: 20, fontWeight: 700, color: C.wh, marginBottom: 20, paddingLeft: 8 }}>Review Answers</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {quiz.questions.map((q, qi) => {
                            const ok = answers[qi] === q.answer;
                            return (
                                <div key={qi} style={{ ...card(), padding: isMobile ? 20 : 24, borderLeft: `4px solid ${ok ? '#10b981' : '#ef4444'}`, borderTop: `1px solid ${C.b}`, borderRight: `1px solid ${C.b}`, borderBottom: `1px solid ${C.b}` }}>
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                                        <div style={{ color: ok ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: 16 }}>{qi + 1}.</div>
                                        <div style={{ fontWeight: 600, fontSize: 16, color: C.wh, lineHeight: 1.5 }}>{q.q}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: isMobile ? 0 : 24, marginBottom: 16 }}>
                                        {q.options.map((opt, oi) => (
                                            <div key={oi} style={{
                                                padding: '12px 16px', borderRadius: 8, fontSize: 14,
                                                background: oi === q.answer ? 'rgba(16,185,129,0.1)' : oi === answers[qi] && !ok ? 'rgba(239,68,68,0.1)' : C.s2,
                                                color: oi === q.answer ? '#10b981' : oi === answers[qi] && !ok ? '#ef4444' : C.tx,
                                                border: `1px solid ${oi === q.answer ? '#10b981' : oi === answers[qi] && !ok ? '#ef4444' : C.b}`,
                                                display: 'flex', gap: 12, alignItems: 'center'
                                            }}>
                                                <span style={{ fontWeight: 700, fontSize: 16, width: 24, textAlign: 'center' }}>
                                                    {oi === q.answer ? '✓' : oi === answers[qi] && !ok ? '✗' : ''}
                                                </span>
                                                <span style={{ fontWeight: 600, flex: 1, lineHeight: 1.4 }}>{opt}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {q.explanation && (
                                        <div style={{ paddingLeft: 24 }}>
                                            <div style={{ padding: '12px 16px', background: C.s2, border: `1px solid ${C.b}`, borderRadius: 8, fontSize: 13, color: C.tx, lineHeight: 1.6, display: 'flex', gap: 12 }}>
                                                <span style={{ fontSize: 16 }}>💡</span>
                                                <div style={{ flex: 1 }}>{q.explanation}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
