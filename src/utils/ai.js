import { LS } from './storage';

// ── Anthropic API call ──
export async function ai(messages, system = '', useSearch = false) {
    const apiKey = LS.get('sf_apikey', '');
    if (!apiKey) throw new Error('No API key set');

    const body = { model: 'claude-haiku-4-5-20251001', max_tokens: 1200, messages };
    if (system) body.system = system;
    if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
    });

    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') || '';
}

// ── JSON parser (handles markdown fences) ──
export function parseJSON(text) {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try { return JSON.parse(clean); } catch { }
    const m = clean.match(/\[[\s\S]*\]/);
    if (m) try { return JSON.parse(m[0]); } catch { }
    return null;
}
