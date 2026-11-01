/** Rede LIF determinística, independente da interface e do runtime desktop. */
export const actions = ['aguardar', 'perguntar', 'propor_url'];
export const contexts = {
    'Conversa com página relevante': [1, 1, 1, 0, .5, 0],
    'Usuário ocupado': [1, 0, 0, 1, 0, 0],
    'Pedido de ajuda': [1, 1, 0, 0, 1, 0],
    'Sem atividade informada': [1, 0, 0, 0, 0, 1],
};
export const features = ['Presença', 'Conversa', 'Página relevante', 'Ocupado', 'Pedido de ajuda', 'Silêncio'];
export function validateProfile(value) {
    const p = value;
    if (!p || p.version !== 1 || !Array.isArray(p.weights) || p.weights.length !== 3 || p.weights.some(row => !Array.isArray(row) || row.length !== 6 || row.some(w => typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 1)) || !Number.isSafeInteger(p.updates) || p.updates < 0 || !p.evidence || typeof p.evidence !== 'object' || Array.isArray(p.evidence))
        throw Error('Perfil inválido. O arquivo foi preservado.');
    for (const [context, entries] of Object.entries(p.evidence)) {
        if (!Object.hasOwn(contexts, context) || !entries || typeof entries !== 'object' || Array.isArray(entries))
            throw Error('Evidências inválidas');
        for (const [action, counts] of Object.entries(entries))
            if (!['0', '1', '2'].includes(action) || !Array.isArray(counts) || counts.length !== 2 || counts.some(n => !Number.isSafeInteger(n) || n < 0))
                throw Error('Feedback inválido');
    }
    return JSON.parse(JSON.stringify(p));
}
export class Brain {
    weights;
    evidence = {};
    updates = 0;
    pending = null;
    constructor(profile) {
        let seed = 7;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        this.weights = actions.map(() => features.map(() => .08 + .2 * random()));
        if (profile) {
            const p = validateProfile(profile);
            this.weights = p.weights;
            this.evidence = p.evidence;
            this.updates = p.updates;
        }
    }
    snapshot() { return validateProfile({ version: 1, weights: this.weights, evidence: this.evidence, updates: this.updates }); }
    run(input) {
        if (input.length !== 6 || input.some(x => !Number.isFinite(x) || x < 0 || x > 1))
            throw Error('Contexto inválido');
        const voltage = [0, 0, 0], counts = [0, 0, 0], phase = Array(6).fill(0), pre = Array(6).fill(0), eligibility = actions.map(() => Array(6).fill(0));
        const raster = [];
        for (let tick = 0; tick < 80; tick++) {
            const spikes = input.map((rate, i) => { phase[i] += rate; const s = phase[i] >= 1 ? 1 : 0; phase[i] -= s; pre[i] = .8 * pre[i] + s; return s; });
            const fired = [];
            this.weights.forEach((row, j) => { voltage[j] = .85 * voltage[j] + row.reduce((s, w, i) => s + w * spikes[i], 0); if (voltage[j] >= 1) {
                counts[j]++;
                voltage[j] = 0;
                fired.push(j);
                pre.forEach((v, i) => eligibility[j][i] += v);
            } });
            raster.push(fired);
        }
        const scores = counts.map((n, j) => n + voltage[j]);
        const choice = scores.indexOf(Math.max(...scores));
        return { choice, scores, spikes: counts, raster, eligibility, features: [...input] };
    }
    decide(context) {
        if (!Object.hasOwn(contexts, context))
            throw Error('Contexto desconhecido');
        const r = this.run(contexts[context]);
        const margin = r.scores[r.choice] - Math.max(...r.scores.filter((_, i) => i !== r.choice));
        const [good, bad] = this.evidence[context]?.[String(r.choice)] ?? [0, 0];
        const reliable = good >= 3 && good / Math.max(1, good + bad) >= .75 && margin >= 2;
        return this.pending = { ...r, context, margin, reliable, effective: r.choice === 2 && !reliable ? 1 : r.choice };
    }
    plasticity(r, target, reward) {
        let trace = r.eligibility[target];
        if (!trace.some(Boolean))
            trace = r.features;
        const scale = Math.max(...trace, 1e-9);
        this.weights[target] = this.weights[target].map((w, i) => Math.min(1, Math.max(0, w + .075 * reward * trace[i] / scale)));
        this.updates++;
    }
    feedback(reward) {
        if (!this.pending || ![1, -1].includes(reward))
            throw Error('Avalie novamente antes de dar feedback');
        const r = this.pending;
        this.plasticity(r, r.choice, reward);
        const entries = this.evidence[r.context] ?? (this.evidence[r.context] = {});
        const record = entries[String(r.choice)] ?? (entries[String(r.choice)] = [0, 0]);
        record[reward > 0 ? 0 : 1]++;
        this.pending = null;
    }
    teach(context, target) {
        if (!Object.hasOwn(contexts, context) || !Number.isInteger(target) || target < 0 || target > 2)
            throw Error('Exemplo inválido');
        this.plasticity(this.run(contexts[context]), target, 1);
        this.pending = null;
    }
}
export function profileName(value) { if (!/^[A-Za-z0-9_-]{1,40}$/.test(value))
    throw Error('Perfil: use até 40 letras sem acentos, números, _ ou -'); return value; }
/** Gramática estrita, sem credenciais, escape de host ou protocolos executáveis. */
export function validateUrl(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(value))
        throw Error('Use uma URL HTTP/HTTPS válida, sem espaços');
    const m = /^https?:\/\/([^/?#]+)([/?#].*)?$/i.exec(value);
    if (!m)
        throw Error('Somente páginas HTTP/HTTPS são aceitas');
    const authority = m[1];
    if (authority.includes('@'))
        throw Error('Credenciais na URL não são aceitas');
    const parts = /^(\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(authority);
    if (!parts)
        throw Error('Endereço inválido. Use domínio ASCII ou punycode.');
    const host = parts[1];
    if (parts[2] && Number(parts[2]) > 65535)
        throw Error('Porta inválida');
    if (host.startsWith('[')) {
        if (!host.includes('::') && host.split(':').length !== 8)
            throw Error('IPv6 inválido');
    }
    else if (host.length > 253 || host.replace(/\.$/, '').split('.').some(label => !/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])$/.test(label)))
        throw Error('Domínio inválido');
    return value;
}
export function executeUrl(value, confirmed, opener) { const url = validateUrl(value); if (confirmed !== true)
    throw Error('Confirmação obrigatória'); opener(url); }
