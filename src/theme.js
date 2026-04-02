export const C = {
    bg: 'var(--bg)',
    s: 'var(--s)',
    s2: 'var(--s2)',
    b: 'var(--b)',
    a: 'var(--a)',
    aD: 'var(--aD)',
    tx: 'var(--tx)',
    mu: 'var(--mu)',
    gr: 'var(--gr)',
    re: 'var(--re)',
    bl: 'var(--bl)',
    pu: 'var(--pu)',
    wh: 'var(--wh)',
    bk: 'var(--bk)',
};

export const card = (ex = {}) => ({
    background: C.s,
    border: `1px solid ${C.b}`,
    borderRadius: 12,
    padding: 16,
    ...ex,
});

export const btn = (v = 'p', ex = {}) => ({
    background:
        v === 'p' ? C.a :
            v === 'd' ? C.re :
                v === 'g' ? 'rgba(16,185,129,0.1)' : C.s2,
    color: v === 'p' ? '#ffffff' : v === 'g' ? C.gr : C.tx,
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    ...ex,
});

export const inp = (ex = {}) => ({
    background: C.s2,
    border: `1px solid ${C.b}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: C.tx,
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
    ...ex,
});
