import React from 'react';
import { C } from '../theme';

export default function Toast({ msg }) {
    if (!msg) return null;
    return (
        <div style={{
            position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: C.a, color: C.bg, padding: '10px 20px', borderRadius: 20,
            fontWeight: 700, fontSize: 14, zIndex: 9999,
            boxShadow: '0 4px 24px #0009', maxWidth: '90vw',
            textAlign: 'center', whiteSpace: 'pre-wrap',
        }}>
            {msg}
        </div>
    );
}
