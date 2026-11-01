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
        if ((!Object.hasOwn(contexts, context) && context !== 'Áudio local') || !entries || typeof entries !== 'object' || Array.isArray(entries))
            throw Error('Evidências inválidas');
        for (const [action, counts] of Object.entries(entries))
            if (!['0', '1', '2'].includes(action) || !Array.isArray(counts) || counts.length !== 2 || counts.some(n => !Number.isSafeInteger(n) || n < 0))
                throw Error('Feedback inválido');
    }
    return JSON.parse(JSON.stringify(p));
}
export class LIFSimulation {
    weights;
    voltage = [0, 0, 0];
    counts = [0, 0, 0];
    phase = Array(6).fill(0);
    pre = Array(6).fill(0);
    eligibility = actions.map(() => Array(6).fill(0));
    raster = [];
    input = Array(6).fill(0);
    constructor(weights) {
        this.weights = weights;
    }
    step(input) {
        if (input.length !== 6 || input.some(x => !Number.isFinite(x) || x < 0 || x > 1))
            throw Error('Contexto inválido');
        this.input = [...input];
        const inputSpikes = input.map((rate, i) => { this.phase[i] += rate; const spike = this.phase[i] >= 1 ? 1 : 0; this.phase[i] -= spike; this.pre[i] = .8 * this.pre[i] + spike; return spike; });
        const fired = [], beforeReset = [];
        this.weights.forEach((row, j) => { this.voltage[j] = .85 * this.voltage[j] + row.reduce((s, w, i) => s + w * inputSpikes[i], 0); beforeReset.push(this.voltage[j]); if (this.voltage[j] >= 1) {
            this.counts[j]++;
            this.voltage[j] = 0;
            fired.push(j);
            this.pre.forEach((v, i) => this.eligibility[j][i] += v);
        } });
        this.raster.push(fired);
        return { tick: this.raster.length, inputSpikes, fired, potentials: [...this.voltage], beforeReset, counts: [...this.counts] };
    }
    result() { const scores = this.counts.map((n, j) => n + this.voltage[j]); return { choice: scores.indexOf(Math.max(...scores)), scores, spikes: [...this.counts], raster: this.raster.map(row => [...row]), eligibility: this.eligibility.map(row => [...row]), features: [...this.input] }; }
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
        const simulation = new LIFSimulation(this.weights);
        for (let i = 0; i < 80; i++)
            simulation.step(input);
        return simulation.result();
    }
    complete(result, context) {
        const margin = result.scores[result.choice] - Math.max(...result.scores.filter((_, i) => i !== result.choice));
        const [good, bad] = this.evidence[context]?.[String(result.choice)] ?? [0, 0];
        const reliable = good >= 3 && good / Math.max(1, good + bad) >= .75 && margin >= 2;
        return this.pending = { ...result, context, margin, reliable, effective: result.choice === 2 && !reliable ? 1 : result.choice };
    }
    decide(context) {
        if (!Object.hasOwn(contexts, context))
            throw Error('Contexto desconhecido');
        return this.complete(this.run(contexts[context]), context);
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
