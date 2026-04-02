// ── SM-2 spaced repetition algorithm ──
export function sm2(card, q) {
    const ef = Math.max(1.3, (card.ef ?? 2.5) + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    const reps = q < 2 ? 0 : (card.reps ?? 0) + 1;
    const iv =
        q < 2 ? 1 :
            reps === 1 ? 1 :
                reps === 2 ? 6 :
                    Math.round((card.interval ?? 1) * ef);
    const due = new Date();
    due.setDate(due.getDate() + iv);
    return { ...card, ef, reps, interval: iv, due: due.toISOString() };
}

// ── Read a file as text or base64 ──
export async function readFileData(file) {
    return new Promise(res => {
        const reader = new FileReader();
        if (file.name.match(/\.pdf$/i)) {
            reader.onload = e => res({ b64: e.target.result.split(',')[1], text: null });
            reader.readAsDataURL(file);
        } else {
            reader.onload = e => res({ text: e.target.result || '', b64: null });
            reader.readAsText(file);
        }
    });
}
