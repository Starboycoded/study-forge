import React, { useState, useRef } from 'react';
import { C, card, btn, inp } from '../theme';
import { processImage } from '../utils/images';

export default function ProfileModal({ profile, onSave, onClose }) {
    const [name, setName] = useState(profile.name || '');
    const [bio, setBio] = useState(profile.bio || '');
    const [avatar, setAvatar] = useState(profile.avatar || '');
    const [category, setCategory] = useState(profile.category || 'wm');
    const [mode, setMode] = useState(profile.avatar?.startsWith('data:') ? 'upload' : 'avatar'); 
    const [preview, setPreview] = useState(profile.avatar || '');
    const [showSelector, setShowSelector] = useState(false);
    const [error, setError] = useState('');
    const fileRef = useRef(null);

    const CATS = {
        wm: { skin: 'f9c9b6', hair: 'short' },
        bm: { skin: '8d5524', hair: 'short' },
        wf: { skin: 'f9c9b6', hair: 'long' },
        bf: { skin: '8d5524', hair: 'long' },
    };

    const PRESETS = [
        { id: 'wm1', label: 'Male 1', cat: 'wm', seed: 'Felix' },
        { id: 'bm1', label: 'Male 2', cat: 'bm', seed: 'Jack' },
        { id: 'wm2', label: 'Male 3', cat: 'wm', seed: 'Bear' },
        { id: 'bm2', label: 'Male 4', cat: 'bm', seed: 'Max' },
        { id: 'wf1', label: 'Female 1', cat: 'wf', seed: 'Sasha' },
        { id: 'bf1', label: 'Female 2', cat: 'bf', seed: 'Luna' },
        { id: 'wf2', label: 'Female 3', cat: 'wf', seed: 'Mia' },
        { id: 'bf2', label: 'Female 4', cat: 'bf', seed: 'Nala' },
    ];

    const avatarUrl = (seed, cat) => {
        const c = CATS[cat || 'wm'];
        const params = new URLSearchParams({
            seed: seed || 'StudyForge',
            backgroundColor: 'transparent',
            baseColor: c.skin,
            hair: c.hair
        });
        return `https://api.dicebear.com/7.x/micah/svg?${params.toString()}`;
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const compressed = await processImage(file);
            setPreview(compressed);
            setAvatar(compressed);
        } catch (err) {
            setError('Failed to process image.');
        }
    };

    const handleSave = () => {
        onSave({ name, bio, avatar, category });
    };

    const getCurrentPreview = () => {
        if (mode === 'avatar') return avatarUrl(avatar.startsWith('data:') ? 'StudyForge' : avatar, category);
        return preview.startsWith('data:') ? preview : avatarUrl('StudyForge', category);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            backdropFilter: 'blur(12px)', padding: 20
        }} onClick={onClose}>
            <div 
                style={{ ...card(), width: '100%', maxWidth: 480, padding: '40px 32px 32px', position: 'relative' }} 
                onClick={e => e.stopPropagation()}
            >
                <button 
                    onClick={onClose}
                    style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: C.mu, fontSize: 24, cursor: 'pointer', opacity: 0.5 }}
                >
                    &times;
                </button>

                <h2 style={{ fontSize: 24, fontWeight: 800, color: C.wh, marginBottom: 8, letterSpacing: '-0.5px' }}>My Profile</h2>
                <p style={{ fontSize: 13, color: C.mu, marginBottom: 32 }}>Personalize your academic workspace</p>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, position: 'relative' }}>
                    <div 
                        onClick={() => mode === 'avatar' && setShowSelector(!showSelector)}
                        style={{ 
                            width: 140, height: 140, borderRadius: 70, 
                            background: '#fff', border: `4px solid ${mode === 'avatar' ? C.a : C.b}`, 
                            padding: 0, marginBottom: 16, overflow: 'hidden',
                            boxShadow: `0 10px 40px ${mode === 'avatar' ? 'rgba(99,91,255,0.4)' : 'rgba(0,0,0,0.5)'}`,
                            cursor: mode === 'avatar' ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                            position: 'relative',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <img src={getCurrentPreview()} alt="avatar preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {mode === 'avatar' && (
                             <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '4px 0', textAlign: 'center' }}>
                                 CHANGE STYLE
                             </div>
                        )}
                    </div>

                    {showSelector && mode === 'avatar' && (
                        <div style={{
                            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                            background: C.s, border: `1px solid ${C.b}`, borderRadius: 20,
                            padding: 16, width: 280, zIndex: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
                        }}>
                             {PRESETS.map(p => (
                                 <div 
                                    key={p.id}
                                    onClick={() => { setAvatar(p.seed); setCategory(p.cat); setShowSelector(false); }}
                                    style={{ 
                                        width: 54, height: 54, borderRadius: 12, background: '#fff', cursor: 'pointer',
                                        border: `2px solid ${avatar === p.seed ? C.a : 'transparent'}`,
                                        overflow: 'hidden', transition: 'transform 0.2s'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                 >
                                     <img src={avatarUrl(p.seed, p.cat)} style={{ width: '100%', height: '100%' }} alt={p.label} />
                                 </div>
                             ))}
                        </div>
                    )}
                    
                    {mode === 'avatar' && !showSelector && (
                         <div style={{ fontSize: 11, color: C.a, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 12 }}>
                             TAP TO SELECT AVATAR
                         </div>
                    )}

                    <div style={{ display: 'flex', gap: 4, background: C.s, padding: 4, borderRadius: 12, border: `1px solid ${C.b}`, marginTop: 8 }}>
                        {['avatar', 'upload'].map(m => (
                            <button 
                                key={m}
                                onClick={() => { setMode(m); setShowSelector(false); }}
                                style={{ 
                                    padding: '6px 16px', borderRadius: 8, border: 'none', 
                                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                    background: mode === m ? C.s2 : 'transparent',
                                    color: mode === m ? C.wh : C.mu, transition: 'all 0.2s'
                                }}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {mode === 'avatar' && (
                        <div>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: C.mu, letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>
                                Randomize Personality (Seed)
                            </label>
                            <input 
                                style={inp()} 
                                value={avatar.startsWith('data:') ? '' : avatar} 
                                onChange={e => { setAvatar(e.target.value); setPreview(e.target.value); }} 
                                placeholder="Type anything to redraw..."
                            />
                        </div>
                    )}

                    {mode === 'upload' && (
                        <div style={{ textAlign: 'center' }}>
                            <input type="file" ref={fileRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileUpload} />
                            <button style={{ ...btn('s2'), width: '100%', border: `1px dashed ${C.a}` }} onClick={() => fileRef.current?.click()}>
                                📁 Select Photo from Device
                            </button>
                        </div>
                    )}

                    {error && <div style={{ color: C.re, fontSize: 12, textAlign: 'center' }}>{error}</div>}

                    <div style={{ height: 1, background: C.b }}></div>

                    <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.mu, letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase' }}>Full Name</label>
                        <input style={inp()} value={name} onChange={e => setName(e.target.value)} placeholder="Desire..." />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.mu, letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase' }}>Bio / Major</label>
                        <textarea style={{ ...inp(), height: 60, resize: 'none', fontSize: 13 }} value={bio} onChange={e => setBio(e.target.value)} placeholder="AI Research..." />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
                    <button style={{ ...btn('s2'), flex: 1 }} onClick={onClose}>Cancel</button>
                    <button style={{ ...btn('p'), flex: 1, boxShadow: `0 4px 15px rgba(99,91,255,0.3)` }} onClick={handleSave}>Save Profile</button>
                </div>
            </div>
        </div>
    );
}
