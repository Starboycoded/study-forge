import React, { useState, useRef } from 'react';
import { C, card, btn, inp } from '../theme';
import { ai } from '../utils/ai';
import { readFileData } from '../utils/sm2';
import { parseJSON } from '../utils/ai';

export default function Files({ files, setFiles, courses, notify, isMobile }) {
    const folderRef = useRef();
    const filesRef = useRef();
    const [loading, setLoading] = useState(false);
    const [ytUrl, setYtUrl] = useState('');
    const [ytLoad, setYtLoad] = useState(false);
    const [ytCards, setYtCards] = useState(null);

    const process = async (list) => {
        const ok = list.filter(f => f.name.match(/\.(txt|md|pdf|csv|json|html|py|js|jsx|c|cpp|java)$/i));
        if (!ok.length) { notify('No supported files found (PDF, TXT, MD, etc)'); return; }
        setLoading(true);
        const processed = await Promise.all(ok.map(async file => {
            const path = file.webkitRelativePath || file.name;
            const data = await readFileData(file);
            return { id: Math.random().toString(36).slice(2), name: file.name, path, ...data, size: file.size };
        }));
        setFiles(prev => {
            const paths = new Set(prev.map(f => f.path));
            return [...prev, ...processed.filter(f => !paths.has(f.path))];
        });
        setLoading(false);
        notify(`✓ Loaded ${processed.length} file${processed.length !== 1 ? 's' : ''}`);
    };

    const handleYT = async () => {
        if (!ytUrl.trim()) return;
        setYtLoad(true); setYtCards(null);
        try {
            const text = await ai(
                [{ role: 'user', content: `Search online for information about this YouTube video: ${ytUrl}\nGenerate 6 flashcards from what you find. Return ONLY JSON array: [{"q":"...","a":"..."}]` }],
                'Return only JSON array.',
                true,
            );
            const parsed = parseJSON(text);
            if (parsed?.length) { setYtCards(parsed); notify(`✓ ${parsed.length} flashcards from video`); }
            else notify("Couldn't extract content, try again");
        } catch (e) { notify('Error: ' + e.message); }
        setYtLoad(false);
    };

    return (
        <div style={{ paddingBottom: 40 }}>
            {/* Header */}
            <div style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: C.a, marginBottom: 8, letterSpacing: '-0.02em' }}>Study Files</div>
                <div style={{ width: 48, height: 4, background: C.a, borderRadius: 2 }}></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 32 }}>
                
                {/* LEFT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    <div style={{ ...card(), padding: isMobile ? 24 : 32, position: 'relative', overflow: 'hidden' }}>
                        {/* Background subtle icon */}
                        <div style={{ position: 'absolute', right: -20, bottom: -40, fontSize: 160, opacity: 0.02, pointerEvents: 'none' }}>
                            📄
                        </div>
                        
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.wh, marginBottom: 12 }}>Upload Files</div>
                        <div style={{ fontSize: 14, color: C.mu, lineHeight: 1.6, marginBottom: 32, position: 'relative' }}>
                            Upload your school folder or individual files. Tip: name your folders after your courses (e.g. COSC101/, MATH201/) so the app organises them automatically.
                        </div>
                        
                        <input ref={folderRef} type="file" style={{ display: 'none' }} onChange={e => process(Array.from(e.target.files))} webkitdirectory="" multiple />
                        <input ref={filesRef} type="file" style={{ display: 'none' }} multiple onChange={e => process(Array.from(e.target.files))} accept=".txt,.md,.pdf,.csv,.json,.html,.py,.js" />
                        
                        <div style={{ display: 'flex', gap: 16 }}>
                            <button onClick={() => folderRef.current?.click()} style={{ ...btn('p'), flex: 1, padding: '14px 0', fontSize: 14 }} disabled={loading}>
                                <span style={{ marginRight: 8 }}>📁</span>{loading ? 'Reading...' : 'Choose Folder'}
                            </button>
                            <button onClick={() => filesRef.current?.click()} style={{ ...btn('s2'), flex: 1, padding: '14px 0', fontSize: 14, border: `1px solid ${C.b}` }} disabled={loading}>
                                <span style={{ color: C.a, marginRight: 8 }}>⊕</span>+ Individual Files
                            </button>
                        </div>
                    </div>

                    <div style={{ ...card(), padding: isMobile ? 24 : 32 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 700, color: C.wh, marginBottom: 24 }}>
                            <span style={{ color: C.re, fontSize: 18 }}>▶</span> YouTube → Flashcards
                        </div>
                        
                        <input value={ytUrl} onChange={e => setYtUrl(e.target.value)} placeholder="Paste YouTube link..." style={{ ...inp(), marginBottom: 16, padding: '16px', background: C.s, border: `1px solid ${C.b}` }} />
                        <button onClick={handleYT} style={{ ...btn('s2'), width: '100%', padding: '14px 0', fontSize: 14, border: `1px solid ${C.b}` }} disabled={ytLoad || !ytUrl.trim()}>
                            <span style={{ color: C.a }}>{ytLoad ? '⏳ Searching...' : 'Generate Cards'}</span>
                        </button>
                        {ytCards && <div style={{ marginTop: 12, fontSize: 13, color: C.gr }}>✓ {ytCards.length} cards ready — go to Flashcards to review them</div>}
                    </div>

                </div>

                {/* RIGHT COLUMN */}
                <div>
                    {courses.length > 0 ? (
                        <div style={{ ...card(), background: 'transparent', border: `1px dashed ${C.b}`, height: '100%', padding: isMobile ? 16 : 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.wh }}>Library — {files.length} files</div>
                                <button onClick={() => { if (confirm('Remove all files?')) setFiles([]); }} style={{ ...btn('d'), padding: '6px 14px', fontSize: 12 }}>Clear</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {courses.map(c => (
                                    <div key={c.name} style={{ background: C.s2, borderRadius: 8, padding: 16, border: `1px solid ${C.b}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <div style={{ color: C.wh, fontWeight: 700, fontSize: 15 }}>📚 {c.name}</div>
                                            <span style={{ background: C.s, color: C.mu, borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{c.files.length} items</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {c.files.map(f => (
                                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: C.s, borderRadius: 6, fontSize: 13 }}>
                                                    <span style={{ color: C.mu }}>{f.b64 ? '📄' : '📝'}</span>
                                                    <span style={{ flex: 1, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {f.path.split('/').slice(1).join('/') || f.name}
                                                    </span>
                                                    <span style={{ color: C.mu, fontSize: 11, flexShrink: 0 }}>{(f.size / 1024).toFixed(0)}KB</span>
                                                    <button onClick={() => setFiles(p => p.filter(x => x.id !== f.id))} style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0, padding: 0 }}>×</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{ 
                            ...card(), background: 'transparent', border: `1px dashed ${C.b}`,
                            height: '100%', minHeight: 400, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: isMobile ? 24 : 40,
                            position: 'relative'
                        }}>
                            <div style={{ 
                                width: 80, height: 80, borderRadius: 40, background: C.s, border: `1px solid ${C.b}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: C.mu,
                                marginBottom: 24, boxShadow: `0 0 40px rgba(0,0,0,0.5)`
                            }}>
                                🗂️
                            </div>
                            <div style={{ color: C.mu, fontSize: 16, lineHeight: 1.5, maxWidth: 260, marginBottom: 32 }}>
                                No files yet — upload your course folder to get started
                            </div>
                            
                            {/* Skeleton lines mockup exactly matching image */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: 0.5 }}>
                                <div style={{ width: 160, height: 8, borderRadius: 4, background: C.s }}></div>
                                <div style={{ width: 120, height: 8, borderRadius: 4, background: C.s }}></div>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
