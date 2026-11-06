/** Reservatório LIF recorrente esparso e fixo; o readout plástico fica em core.ts. */
const reservoirConfig = { version: 1, size: 192, indegree: 8, seed: 31 };
function emptyReservoir() { return { voltage: Array(192).fill(0), spikes: Array(192).fill(0), refractory: Array(192).fill(0) }; }
function validReservoirState(value) {
    const state = value;
    if (!state || !Array.isArray(state.voltage) || !Array.isArray(state.spikes) || !Array.isArray(state.refractory) || [state.voltage, state.spikes, state.refractory].some(row => row.length !== 192) || state.voltage.some(v => !Number.isFinite(v) || v < 0 || v >= 1) || state.spikes.some(v => v !== 0 && v !== 1) || state.refractory.some(v => !Number.isInteger(v) || v < 0 || v > 2))
        throw Error('Estado temporal inválido');
    return JSON.parse(JSON.stringify(state));
}
let seed = reservoirConfig.seed;
function rng() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
const inputProjection = Array.from({ length: 192 }, (_, n) => Array.from({ length: 6 }, (_, i) => i === n % 6 ? .4 + rng() * .2 : rng() * .12));
const recurrence = Array.from({ length: 192 }, (_, n) => { const used = new Set([n]); return Array.from({ length: 8 }, () => { let from = Math.floor(rng() * 192); while (used.has(from))
    from = (from + 1) % 192; used.add(from); return { from, weight: from % 4 === 0 ? -(.08 + rng() * .06) : .025 + rng() * .045 }; }); });
class Reservoir {
    state;
    constructor(state = emptyReservoir()) { this.state = validReservoirState(state); }
    step(inputSpikes) {
        const before = this.state, next = emptyReservoir();
        for (let n = 0; n < 192; n++) {
            if (before.refractory[n] > 0) {
                next.refractory[n] = before.refractory[n] - 1;
                continue;
            }
            let current = .025;
            for (let i = 0; i < 6; i++)
                current += inputProjection[n][i] * inputSpikes[i];
            for (const edge of recurrence[n])
                current += edge.weight * before.spikes[edge.from];
            const v = Math.max(0, .9 * before.voltage[n] + current);
            if (v >= 1) {
                next.spikes[n] = 1;
                next.refractory[n] = 2;
            }
            else
                next.voltage[n] = v;
        }
        this.state = next;
        return next;
    }
}
function initialReadout(rows) { let s = 91; return Array.from({ length: rows }, () => Array.from({ length: 192 }, () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return .08 + .14 * s / 4294967296; })); }


/** Rede LIF determinística, independente da interface e do runtime desktop. */
const actions = ['ouvir', 'perguntar', 'tirar_duvidas', 'fazer'];
const contexts = {
    'Conversa com página relevante': [1, 1, 1, 0, .5, 0],
    'Usuário ocupado': [1, 0, 0, 1, 0, 0],
    'Pedido de ajuda': [1, 1, 0, 0, 1, 0],
    'Sem atividade informada': [1, 0, 0, 0, 0, 1],
};
const features = ['Presença', 'Conversa', 'Página relevante', 'Ocupado', 'Pedido de ajuda', 'Silêncio'];
function validateProfile(value) {
    const raw = value;
    if (!raw || ![1, 2, 3, 4].includes(raw.version) || !Array.isArray(raw.weights) || !Number.isSafeInteger(raw.updates) || raw.updates < 0 || !raw.evidence || typeof raw.evidence !== 'object' || Array.isArray(raw.evidence))
        throw Error('Rede inválida. O arquivo foi preservado.');
    let p = JSON.parse(JSON.stringify(raw));
    if (p.version < 3) {
        const legacyIds = p.version === 1 ? ['aguardar', 'perguntar', 'propor_url'] : p.actionIds;
        if (!Array.isArray(legacyIds) || legacyIds.length !== p.weights.length || legacyIds.slice(0, 3).join(',') !== 'aguardar,perguntar,propor_url' || p.weights.length < 3 || p.weights.length > 15)
            throw Error('Rede legada inválida');
        p.weights.splice(2, 0, features.map(() => .12));
        p.actionIds = [...actions, ...legacyIds.slice(3)];
        for (const entries of Object.values(p.evidence)) {
            if (!entries || typeof entries !== 'object' || Array.isArray(entries))
                throw Error('Evidências inválidas');
            const mapped = {};
            for (const [key, counts] of Object.entries(entries)) {
                if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= legacyIds.length)
                    throw Error('Evidências inválidas');
                mapped[String(Number(key) >= 2 ? Number(key) + 1 : Number(key))] = counts;
            }
            for (const key of Object.keys(entries))
                delete entries[key];
            Object.assign(entries, mapped);
        }
        p.version = 3;
    }
    if (p.weights.length < 4 || p.weights.length > 16 || p.weights.some(row => !Array.isArray(row) || row.length !== 6 || row.some(w => typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 1)))
        throw Error('Pesos inválidos');
    if (p.version === 3) {
        p.version = 4;
        p.reservoir = { ...reservoirConfig };
        p.readoutWeights = initialReadout(p.weights.length);
        p.temporal = emptyReservoir();
    }
    if (JSON.stringify(p.reservoir) !== JSON.stringify(reservoirConfig) || !Array.isArray(p.readoutWeights) || p.readoutWeights.length !== p.weights.length || p.readoutWeights.some(row => !Array.isArray(row) || row.length !== 192 || row.some(w => !Number.isFinite(w) || w < 0 || w > 1)))
        throw Error('Readout ou configuração do reservatório inválidos');
    p.temporal = validReservoirState(p.temporal);
    const ids = p.actionIds;
    if (!Array.isArray(ids) || ids.length !== p.weights.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id) || actions.some((id, i) => ids[i] !== id))
        throw Error('Catálogo da rede inválido');
    for (const [context, entries] of Object.entries(p.evidence)) {
        if ((!Object.hasOwn(contexts, context) && context !== 'Áudio local' && context !== 'Conversa textual') || !entries || typeof entries !== 'object' || Array.isArray(entries))
            throw Error('Evidências inválidas');
        for (const [action, counts] of Object.entries(entries))
            if (!/^(0|[1-9][0-9]*)$/.test(action) || Number(action) >= p.weights.length || !Array.isArray(counts) || counts.length !== 2 || counts.some(n => !Number.isSafeInteger(n) || n < 0))
                throw Error('Feedback inválido');
    }
    return p;
}
class LIFSimulation {
    weights;
    voltage;
    counts;
    phase = Array(6).fill(0);
    pre = Array(6).fill(0);
    eligibility;
    hiddenTrace = Array(192).fill(0);
    hiddenEligibility;
    hiddenActivity = Array(192).fill(0);
    reservoir;
    readout;
    raster = [];
    input = Array(6).fill(0);
    constructor(weights, readout = initialReadout(weights.length), temporal = emptyReservoir()) {
        this.weights = weights;
        this.reservoir = new Reservoir(temporal);
        this.readout = readout;
        this.hiddenEligibility = weights.map(() => Array(192).fill(0));
        this.voltage = weights.map(() => 0);
        this.counts = weights.map(() => 0);
        this.eligibility = weights.map(() => Array(6).fill(0));
    }
    step(input) {
        if (input.length !== 6 || input.some(x => !Number.isFinite(x) || x < 0 || x > 1))
            throw Error('Contexto inválido');
        this.input = [...input];
        const inputSpikes = input.map((rate, i) => { this.phase[i] += rate; const spike = this.phase[i] >= 1 ? 1 : 0; this.phase[i] -= spike; this.pre[i] = .8 * this.pre[i] + spike; return spike; });
        const hidden = this.reservoir.step(inputSpikes);
        hidden.spikes.forEach((spike, n) => { this.hiddenTrace[n] = .9 * this.hiddenTrace[n] + spike; this.hiddenActivity[n] += spike; });
        const fired = [], beforeReset = [];
        this.weights.forEach((row, j) => { this.voltage[j] = .85 * this.voltage[j] + .6 * row.reduce((s, w, i) => s + w * inputSpikes[i], 0) + 3 * this.readout[j].reduce((sum, w, n) => sum + w * hidden.spikes[n], 0) / 192; beforeReset.push(this.voltage[j]); if (this.voltage[j] >= 1) {
            this.counts[j]++;
            this.voltage[j] = 0;
            fired.push(j);
            this.pre.forEach((v, i) => this.eligibility[j][i] += v);
            this.hiddenTrace.forEach((v, n) => this.hiddenEligibility[j][n] += v);
        } });
        this.raster.push(fired);
        return { tick: this.raster.length, inputSpikes, fired, potentials: [...this.voltage], beforeReset, counts: [...this.counts], hidden: validReservoirState(hidden) };
    }
    temporal() { return validReservoirState(this.reservoir.state); }
    result() { const scores = this.counts.map((n, j) => n + this.voltage[j]); return { choice: scores.indexOf(Math.max(...scores)), scores, spikes: [...this.counts], raster: this.raster.map(row => [...row]), eligibility: this.eligibility.map(row => [...row]), features: [...this.input], hiddenEligibility: this.hiddenEligibility.map(row => [...row]), hiddenActivity: [...this.hiddenActivity] }; }
}
class Brain {
    actionIds = [...actions];
    readoutWeights;
    temporal = emptyReservoir();
    weights;
    evidence = {};
    updates = 0;
    pending = null;
    constructor(profile) {
        let seed = 7;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        this.weights = actions.map(() => features.map(() => .08 + .2 * random()));
        this.readoutWeights = initialReadout(this.weights.length);
        if (profile) {
            const p = validateProfile(profile);
            this.weights = p.weights;
            this.readoutWeights = p.readoutWeights;
            this.temporal = p.temporal;
            this.actionIds = p.actionIds;
            this.evidence = p.evidence;
            this.updates = p.updates;
        }
    }
    snapshot() { return validateProfile({ version: 4, reservoir: { ...reservoirConfig }, readoutWeights: this.readoutWeights, temporal: this.temporal, actionIds: this.actionIds, weights: this.weights, evidence: this.evidence, updates: this.updates }); }
    addAction(id) { if (this.actionIds.includes(id) || this.weights.length >= 16 || !/^habilidade-[A-Za-z0-9-]{1,80}$/.test(id))
        throw Error('Não é possível adicionar esta habilidade.'); this.actionIds.push(id); this.weights.push(features.map(() => .12)); this.readoutWeights.push(Array(192).fill(.12)); this.pending = null; }
    run(input) {
        const simulation = new LIFSimulation(this.weights, this.readoutWeights);
        for (let i = 0; i < 80; i++)
            simulation.step(input);
        return simulation.result();
    }
    complete(result, context) {
        const margin = result.scores[result.choice] - Math.max(...result.scores.filter((_, i) => i !== result.choice));
        const [good, bad] = this.evidence[context]?.[String(result.choice)] ?? [0, 0];
        const reliable = good >= 3 && good / Math.max(1, good + bad) >= .75 && margin >= 2;
        return this.pending = { ...result, context, margin, reliable, effective: result.choice >= 3 && !reliable ? 1 : result.choice };
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
        let hidden = r.hiddenEligibility[target];
        if (!hidden.some(Boolean))
            hidden = r.hiddenActivity;
        const hiddenScale = Math.max(...hidden, 1e-9);
        this.readoutWeights[target] = this.readoutWeights[target].map((w, n) => Math.max(0, Math.min(1, w + .10 * reward * hidden[n] / hiddenScale)));
        this.updates++;
    }
    rewardTrace(target, inputTrace, hiddenTrace, reward, context) {
        if (!Number.isInteger(target) || target < 0 || target >= this.weights.length || ![1, -1].includes(reward) || inputTrace.length !== 6 || hiddenTrace.length !== 192 || [...inputTrace, ...hiddenTrace].some(n => !Number.isFinite(n) || n < 0 || n > 10000) || context !== 'Conversa textual')
            throw Error('Feedback de interação inválido');
        const scale = Math.max(...inputTrace, 1e-9), hiddenScale = Math.max(...hiddenTrace, 1e-9);
        this.weights[target] = this.weights[target].map((w, i) => Math.max(0, Math.min(1, w + .075 * reward * inputTrace[i] / scale)));
        this.readoutWeights[target] = this.readoutWeights[target].map((w, i) => Math.max(0, Math.min(1, w + .10 * reward * hiddenTrace[i] / hiddenScale)));
        this.updates++;
        const entries = this.evidence[context] ?? (this.evidence[context] = {}), counts = entries[String(target)] ?? (entries[String(target)] = [0, 0]);
        counts[reward > 0 ? 0 : 1]++;
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
    teachInput(input, target) { if (!Number.isInteger(target) || target < 0 || target >= this.weights.length)
        throw Error('Habilidade inválida'); this.plasticity(this.run(input), target, 1); this.pending = null; }
    teach(context, target) {
        if (!Object.hasOwn(contexts, context) || !Number.isInteger(target) || target < 0 || target >= this.weights.length)
            throw Error('Exemplo inválido');
        this.plasticity(this.run(contexts[context]), target, 1);
        this.pending = null;
    }
}
function profileName(value) { if (!/^[A-Za-z0-9_-]{1,40}$/.test(value))
    throw Error('Perfil: use até 40 letras sem acentos, números, _ ou -'); return value; }
/** Gramática estrita, sem credenciais, escape de host ou protocolos executáveis. */
function validateUrl(value) {
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
function executeUrl(value, confirmed, opener) { const url = validateUrl(value); if (confirmed !== true)
    throw Error('Confirmação obrigatória'); opener(url); }


function validateInterpretation(value, ids) {
    const v = value;
    if (!v || !Array.isArray(v.features) || v.features.length !== 6 || v.features.some(n => !Number.isFinite(n) || n < 0 || n > 1) || !Number.isFinite(v.uncertainty) || v.uncertainty < 0 || v.uncertainty > 1 || !Array.isArray(v.suggestedIds) || v.suggestedIds.length > 3 || new Set(v.suggestedIds).size !== v.suggestedIds.length || v.suggestedIds.some(id => !ids.includes(id)) || typeof v.rationale !== 'string' || v.rationale.length > 800 || (v.replies !== undefined && (!v.replies || typeof v.replies !== 'object' || Array.isArray(v.replies) || Object.keys(v.replies).some(id => !ids.includes(id)) || ids.some(id => typeof v.replies[id] !== 'string' || !v.replies[id].trim() || v.replies[id].length > 1500))))
        throw Error('O modelo retornou um formato inválido. Nenhuma resposta foi inventada.');
    return JSON.parse(JSON.stringify(v));
}
function textInput(model) { const input = [...model.features]; input[0] = 1; input[1] = 1; input[4] = Math.max(input[4], model.uncertainty); return input; }
function turnTrace(id, decision, brain) {
    const j = decision.choice;
    let hidden = decision.hiddenEligibility[j];
    if (!hidden.some(Boolean))
        hidden = decision.hiddenActivity;
    let input = decision.eligibility[j];
    if (!input.some(Boolean))
        input = decision.features;
    return { id, actionId: brain.actionIds[j], context: 'Conversa textual', inputTrace: [...input], hiddenTrace: [...hidden] };
}
function validateTurn(value, friendId, ids) {
    const turn = value, trace = turn?.trace;
    if (!turn || typeof turn.id !== 'string' || turn.id.length > 100 || !turn.id || turn.friendId !== friendId || typeof turn.model !== 'string' || turn.model.length > 200 || !Array.isArray(turn.features) || turn.features.length !== 6 || turn.features.some(n => !Number.isFinite(n) || n < 0 || n > 1) || !Number.isFinite(turn.uncertainty) || turn.uncertainty < 0 || turn.uncertainty > 1 || !Array.isArray(turn.suggestedIds) || turn.suggestedIds.some(id => !ids.includes(id)) || typeof turn.rationale !== 'string' || turn.rationale.length > 800 || !ids.includes(turn.choiceId) || !trace || trace.id !== turn.id || trace.actionId !== turn.choiceId || trace.context !== 'Conversa textual' || !Array.isArray(trace.inputTrace) || trace.inputTrace.length !== 6 || !Array.isArray(trace.hiddenTrace) || trace.hiddenTrace.length !== 192 || [...trace.inputTrace, ...trace.hiddenTrace].some(n => !Number.isFinite(n) || n < 0 || n > 10000) || (turn.feedback !== undefined && turn.feedback !== 1 && turn.feedback !== -1))
        throw Error('Interação de conversa inválida');
    return JSON.parse(JSON.stringify(turn));
}
function applyTurnFeedback(brain, turn, reward) {
    if (turn.feedback !== undefined)
        throw Error('Esta interação já foi avaliada.');
    const target = brain.actionIds.indexOf(turn.trace.actionId);
    if (target < 0)
        throw Error('Habilidade da interação não encontrada.');
    brain.rewardTrace(target, turn.trace.inputTrace, turn.trace.hiddenTrace, reward, 'Conversa textual');
    turn.feedback = reward;
}
class TextConversation {
    controller = null;
    generation = 0;
    get busy() { return this.controller !== null; }
    cancel() { this.generation++; this.controller?.abort(); this.controller = null; }
    async send(request, brain, transport, evaluate) {
        if (this.busy)
            throw Error('Aguarde a resposta atual.');
        const generation = ++this.generation, controller = new AbortController();
        this.controller = controller;
        const timer = setTimeout(() => controller.abort(), 75000);
        try {
            const result = await transport(request, controller.signal);
            if (controller.signal.aborted || generation !== this.generation)
                throw Error('Conversa cancelada.');
            const interpretation = validateInterpretation(result.interpretation, brain.actionIds), input = textInput(interpretation), decision = await evaluate(input, controller.signal);
            if (controller.signal.aborted || generation !== this.generation)
                throw Error('Conversa cancelada.');
            const id = brain.actionIds[decision.choice];
            const trace = turnTrace(request.requestId, decision, brain);
            const turn = { id: request.requestId, friendId: request.friendId, model: result.model, features: input, uncertainty: interpretation.uncertainty, suggestedIds: interpretation.suggestedIds, rationale: interpretation.rationale, choiceId: id, trace };
            const response = await transport({ ...request, phase: 'respond', choiceId: id, uncertainty: interpretation.uncertainty }, controller.signal);
            if (controller.signal.aborted || generation !== this.generation)
                throw Error('Conversa cancelada.');
            if (typeof response.reply !== 'string' || !response.reply.trim() || response.reply.length > 1500)
                throw Error('O modelo retornou uma resposta inválida.');
            let proposal = null;
            let proposalError = false;
            if (/\b(aprenda|ensine|ensinar|nova habilidade|guarde uma habilidade)\b/i.test(request.text)) {
                try {
                    const proposed = await transport({ ...request, phase: 'propose' }, controller.signal);
                    if (controller.signal.aborted || generation !== this.generation)
                        throw Error('Conversa cancelada.');
                    if (proposed.proposal) {
                        proposal = validateSkills([proposed.proposal])[0];
                    }
                }
                catch {
                    if (controller.signal.aborted || generation !== this.generation)
                        throw Error('Conversa cancelada.');
                    proposalError = true;
                }
            }
            return { reply: response.reply, turn, decision, proposal, proposalError };
        }
        finally {
            clearTimeout(timer);
            if (generation === this.generation)
                this.controller = null;
        }
    }
}
function conversationHistory(messages) {
    const history = [];
    let characters = 0;
    for (const message of messages.filter(m => m.source === 'model').slice(-6).reverse()) {
        if (characters + message.text.length > 3000)
            break;
        characters += message.text.length;
        history.unshift({ role: message.user ? 'user' : 'assistant', content: message.text.slice(0, 2000) });
    }
    return history;
}

/** Catálogo limitado de efeitos locais. Nada aqui interpreta fala ou chama modelos. */
const baseActionIds = ['ouvir', 'perguntar', 'tirar_duvidas', 'fazer'];
const maxCustomSkills = 12;
function validateSkills(value) {
    if (!Array.isArray(value) || value.length > maxCustomSkills)
        throw Error('Limite de 12 habilidades por amigo.');
    const ids = new Set();
    for (const raw of value) {
        if (!raw || typeof raw.id !== 'string' || !/^habilidade-[A-Za-z0-9-]{1,80}$/.test(raw.id) || ids.has(raw.id) || typeof raw.name !== 'string' || !raw.name.trim() || Array.from(raw.name).length > 40 || raw.origin !== 'ensino humano')
            throw Error('Habilidade inválida');
        ids.add(raw.id);
    }
    const skills = value;
    for (const skill of skills)
        compilePlan(skill.plan, skills, new Set([skill.id]));
    return JSON.parse(JSON.stringify(skills));
}
/** Compila referências, rejeita ciclos/conflitos e limita custo antes de qualquer efeito. */
function compilePlan(plan, catalog, ancestors = new Set()) {
    let count = 0;
    function walk(raw, depth, seen) {
        if (!raw || typeof raw !== 'object' || ++count > 24 || depth > 6)
            throw Error('Use até 24 etapas e no máximo 6 níveis.');
        const step = raw;
        if (step.kind === 'ref') {
            if (seen.has(step.id))
                throw Error('Ciclo entre habilidades não permitido.');
            const skill = catalog.find(s => s.id === step.id);
            if (!skill)
                throw Error('Habilidade referenciada não encontrada.');
            return walk(skill.plan, depth + 1, new Set([...seen, step.id]));
        }
        if (step.kind === 'sequence' || step.kind === 'parallel') {
            if (!Array.isArray(step.steps) || step.steps.length < 1 || step.steps.length > 8)
                throw Error('Um grupo precisa de 1 a 8 etapas.');
            const children = step.steps.map(child => walk(child, depth + 1, seen));
            const resources = new Set();
            for (const child of children)
                for (const resource of child.resources) {
                    if (step.kind === 'parallel' && resources.has(resource))
                        throw Error('Etapas paralelas disputam o mesmo recurso: ' + resource);
                    resources.add(resource);
                }
            const duration = step.kind === 'sequence' ? children.reduce((sum, c) => sum + c.duration, 0) : Math.max(...children.map(c => c.duration));
            if (duration > 30000)
                throw Error('A habilidade deve durar no máximo 30 segundos.');
            return { node: { kind: step.kind, steps: children.map(c => c.node) }, resources, duration };
        }
        if (step.kind === 'wait' || step.kind === 'observe_audio') {
            if (!Number.isInteger(step.ms) || step.ms < 100 || step.ms > 10000)
                throw Error('Duração: de 100 a 10000 ms.');
            return { node: { kind: step.kind, ms: step.ms }, resources: new Set(step.kind === 'observe_audio' ? ['áudio'] : []), duration: step.ms };
        }
        if (step.kind === 'text' || step.kind === 'prompt' || step.kind === 'search_proposal') {
            if (typeof step.text !== 'string' || !step.text.trim() || step.text.length > 500)
                throw Error('Texto: de 1 a 500 caracteres.');
            return { node: { kind: step.kind, text: step.text }, resources: new Set(['saída de texto']), duration: 0 };
        }
        throw Error('Capacidade indisponível.');
    }
    return walk(plan, 0, ancestors).node;
}
function basePlan(index, audioActive = false) {
    if (index === 0)
        return audioActive ? { kind: 'observe_audio', ms: 1000 } : { kind: 'prompt', text: 'Para ouvir áudio local, inicie o amigo e permita o microfone.' };
    if (index === 1)
        return { kind: 'prompt', text: 'Você gostaria de acrescentar alguma informação?' };
    if (index === 2)
        return { kind: 'prompt', text: 'O que preciso saber para ajudar? Ainda não interpreto a conversa sem um modelo conectado.' };
    return { kind: 'prompt', text: 'O que você quer fazer? Não há ferramenta geral conectada. Você pode ensinar uma combinação de capacidades locais.' };
}
class SkillExecutor {
    controller = null;
    get active() { return this.controller !== null; }
    cancel() { this.controller?.abort(); }
    async run(plan, catalog, runtime) {
        if (this.active)
            throw Error('Já há uma habilidade em execução.');
        const compiled = compilePlan(plan, catalog), controller = new AbortController();
        this.controller = controller;
        const signal = controller.signal;
        const delay = (ms) => new Promise((resolve, reject) => { if (signal.aborted) {
            reject(Error('Execução cancelada.'));
            return;
        } const cancel = () => { clearTimeout(timer); reject(Error('Execução cancelada.')); }; const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms); signal.addEventListener('abort', cancel, { once: true }); });
        function checkAudio(step) { return step.kind === 'observe_audio' || (('steps' in step) && step.steps.some(checkAudio)); }
        if (checkAudio(compiled) && !runtime.audioActive()) {
            this.controller = null;
            throw Error('Esta habilidade precisa do microfone já ativo. Inicie o amigo primeiro.');
        }
        async function execute(step) {
            if (signal.aborted)
                throw Error('Execução cancelada.');
            if (step.kind === 'sequence') {
                for (const child of step.steps)
                    await execute(child);
            }
            else if (step.kind === 'parallel') {
                const tasks = step.steps.map(execute);
                try {
                    await Promise.all(tasks);
                }
                catch (error) {
                    controller.abort();
                    await Promise.allSettled(tasks);
                    throw error;
                }
            }
            else if (step.kind === 'wait')
                await delay(step.ms);
            else if (step.kind === 'observe_audio') {
                let sum = 0, samples = 0;
                for (let elapsed = 0; elapsed < step.ms; elapsed += 100) {
                    if (!runtime.audioActive())
                        throw Error('O microfone foi encerrado.');
                    sum += runtime.energy();
                    samples++;
                    await delay(Math.min(100, step.ms - elapsed));
                }
                runtime.report('Energia média local: ' + (sum / Math.max(1, samples)).toFixed(3) + ' (sem interpretação de fala).');
            }
            else if (step.kind === 'text' || step.kind === 'prompt' || step.kind === 'search_proposal')
                runtime.emit(step.kind, step.text);
        }
        try {
            await execute(compiled);
        }
        finally {
            if (this.controller === controller)
                this.controller = null;
        }
    }
}


/** Mesmo integrador usado em Brain.run. Passos independem do desenho e não usam aleatoriedade. */
class LiveNetwork {
    notify;
    energy;
    brain;
    simulation;
    tick = 0;
    windows = 0;
    timer = null;
    displayTimer = null;
    source = 'idle';
    demoContext = 'Usuário ocupado';
    frame = null;
    decision = null;
    textInput = null;
    textDone = null;
    input = contexts['Sem atividade informada'];
    constructor(notify, brain = new Brain(), energy = () => 0) {
        this.notify = notify;
        this.energy = energy;
        this.brain = brain;
        this.simulation = new LIFSimulation(brain.weights, brain.readoutWeights, brain.temporal);
    }
    snapshot() { return { running: this.timer !== null, source: this.source, frame: this.frame, weights: this.brain.weights.map(row => [...row]), decision: this.decision, updates: this.brain.updates, window: this.windows, input: [...this.input] }; }
    start() { if (this.timer !== null)
        return; this.timer = setInterval(() => { this.advance(1, false); }, 20); this.displayTimer = setInterval(() => this.notify(this.snapshot()), 100); this.notify(this.snapshot()); }
    stop() { this.brain.temporal = this.simulation.temporal(); if (this.timer !== null)
        clearInterval(this.timer); if (this.displayTimer !== null)
        clearInterval(this.displayTimer); this.timer = null; this.displayTimer = null; this.notify(this.snapshot()); }
    setSource(source, context = this.demoContext) { if (source === 'demo' && !Object.hasOwn(contexts, context))
        throw Error('Entrada inválida'); this.source = source; this.demoContext = context; this.reset(); this.notify(this.snapshot()); }
    evaluateText(input, signal) {
        if (signal.aborted)
            return Promise.reject(Error('Conversa cancelada.'));
        this.stop();
        this.textInput = [...input];
        this.source = 'text';
        this.reset();
        return new Promise((resolve, reject) => { const cancel = () => { this.textDone = null; this.stop(); reject(Error('Conversa cancelada.')); }; signal.addEventListener('abort', cancel, { once: true }); this.textDone = decision => { signal.removeEventListener('abort', cancel); resolve(decision); }; this.start(); });
    }
    refresh() { this.reset(); this.notify(this.snapshot()); }
    reset() { this.tick = 0; this.simulation = new LIFSimulation(this.brain.weights, this.brain.readoutWeights, this.brain.temporal); this.decision = null; this.frame = null; this.brain.pending = null; }
    advance(steps = 5, publish = true) {
        for (let i = 0; i < steps; i++) {
            if (this.tick === 80) {
                this.tick = 0;
                this.simulation = new LIFSimulation(this.brain.weights, this.brain.readoutWeights, this.simulation.temporal());
            }
            this.input = this.source === 'text' && this.textInput ? this.textInput : this.source === 'demo' ? contexts[this.demoContext] : this.source === 'audio' ? [1, 0, Math.min(1, Math.max(0, this.energy())), 0, 0, 0] : [1, 0, 0, 0, 0, 1];
            this.frame = this.simulation.step(this.input);
            this.tick++;
            if (this.tick === 80) {
                this.windows++;
                this.decision = this.brain.complete(this.simulation.result(), this.source === 'demo' ? this.demoContext : this.source === 'audio' ? 'Áudio local' : this.source === 'text' ? 'Conversa textual' : 'Sem atividade informada');
                if (this.source === 'text') {
                    const done = this.textDone;
                    this.textDone = null;
                    this.stop();
                    done?.(this.decision);
                }
            }
        }
        this.brain.temporal = this.simulation.temporal();
        if (publish)
            this.notify(this.snapshot());
    }
    feedback(reward) { if (!this.decision)
        throw Error('Aguarde uma decisão completa.'); this.brain.pending = this.decision; this.brain.feedback(reward); this.reset(); this.notify(this.snapshot()); }
    teach(target) { if (this.source !== 'demo')
        throw Error('Use uma entrada de demonstração para ensinar.'); this.brain.teach(this.demoContext, target); this.reset(); this.notify(this.snapshot()); }
}




const maxFriends = 3;
const friendsLimitMessage = 'Para criar outro, apague um dos amigos existentes.';
const friendsKey = 'companheiro.friends.v1';
const handoffKey = 'companheiro.preview.legacy-session.v1';
function friendName(value) { if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > 32 || /[\u0000-\u001f\u007f]/.test(value))
    throw Error('Use um nome de 1 a 32 caracteres.'); return value.trim().replace(/\s+/g, ' '); }
function validFriends(value) {
    const data = value;
    if (!data || ![1, 2, 3].includes(data.version) || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.friends) || !(data.active === null || typeof data.active === 'string'))
        throw Error('Dados de amigos inválidos. Nada foi substituído.');
    const ids = new Set();
    for (const friend of data.friends) {
        if (!friend || typeof friend.id !== 'string' || !friend.id || ids.has(friend.id))
            throw Error('Amigo inválido');
        ids.add(friend.id);
        friendName(friend.name);
        friend.brain = validateProfile(friend.brain);
        friend.skills = validateSkills(friend.skills ?? []);
        if (friend.brain.actionIds.join(',') !== [...baseActionIds, ...friend.skills.map(s => s.id)].join(','))
            throw Error('Habilidades e rede não correspondem.');
        if (!Array.isArray(friend.messages) || friend.messages.some(m => !m || typeof m.user !== 'boolean' || typeof m.text !== 'string' || m.text.length > 10000 || (m.source !== undefined && !['demo', 'local', 'model'].includes(m.source))))
            throw Error('Conversa inválida');
        for (const message of friend.messages)
            if (message.turn)
                validateTurn(message.turn, friend.id, friend.brain.actionIds);
    }
    if (data.active !== null && !ids.has(data.active))
        throw Error('Amigo atual inválido');
    return JSON.parse(JSON.stringify({ ...data, version: 3 }));
}
class FriendsStore {
    storage;
    data;
    expected;
    migration;
    constructor(storage, legacyName = 'Companheiro', seed) {
        this.storage = storage;
        this.expected = storage.getItem(friendsKey);
        if (this.expected !== null) {
            const original = this.expected;
            this.data = validFriends(JSON.parse(original));
            if (JSON.stringify(this.data) !== original) {
                if (storage.getItem('companheiro.backup.before-reservoir.v1') === null)
                    storage.setItem('companheiro.backup.before-reservoir.v1', original);
                if (storage.getItem('companheiro.backup.before-skills.v1') === null)
                    storage.setItem('companheiro.backup.before-skills.v1', original);
                this.commit(this.data);
                this.migration = 'Amigos migrados para habilidades; pesos anteriores preservados em cópia local.';
            }
            else
                this.migration = '';
            return;
        }
        const handoff = storage.getItem(handoffKey);
        let messages = [];
        if (handoff) {
            const old = JSON.parse(handoff);
            seed = validateProfile(old.brain);
            messages = old.messages ?? [];
            if (old.name)
                legacyName = friendName(old.name);
        }
        const friend = { id: this.id(), name: friendName(legacyName), brain: seed ?? new Brain().snapshot(), messages, skills: [] };
        this.data = validFriends({ version: 1, revision: 0, active: friend.id, friends: [friend], ...(handoff ? { migratedFriend: friend.id } : {}) });
        // A fonte legada é mantida; backup único antes da primeira migração.
        const legacy = storage.getItem('companheiro.preview.preferences.v1');
        if (legacy && storage.getItem('companheiro.backup.preferences.v1') === null)
            storage.setItem('companheiro.backup.preferences.v1', legacy);
        if (handoff && storage.getItem('companheiro.backup.legacy-session.v1') === null)
            storage.setItem('companheiro.backup.legacy-session.v1', handoff);
        this.migration = handoff ? 'Amigo anterior e aprendizado importados.' : legacy ? 'Nome anterior preservado. A versão anterior mantinha pesos apenas em memória; eles só podem ser importados antes de recarregar a aba.' : '';
        this.commit(this.data);
    }
    id() { return globalThis.crypto?.randomUUID?.() ?? `amigo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
    snapshot() { return validFriends(this.data); }
    current() { const friend = this.data.friends.find(f => f.id === this.data.active); return friend ? JSON.parse(JSON.stringify(friend)) : null; }
    commit(data) {
        if (this.storage.getItem(friendsKey) !== this.expected)
            throw Error('Os amigos foram alterados em outra aba. Reabra esta página antes de continuar.');
        const next = validFriends({ ...data, revision: this.data.revision + 1 });
        const text = JSON.stringify(next);
        this.storage.setItem(friendsKey, text);
        this.expected = text;
        this.data = next;
    }
    create(name) { if (this.data.friends.length >= maxFriends)
        throw Error(friendsLimitMessage); const next = this.snapshot(); const friend = { id: this.id(), name: friendName(name), brain: new Brain().snapshot(), messages: [], skills: [] }; next.friends.push(friend); next.active = friend.id; this.commit(next); return this.current(); }
    select(id) { if (!this.data.friends.some(f => f.id === id))
        throw Error('Amigo não encontrado'); this.commit({ ...this.snapshot(), active: id }); }
    rename(name) { const next = this.snapshot(), friend = next.friends.find(f => f.id === next.active); if (!friend)
        throw Error('Crie um amigo primeiro'); friend.name = friendName(name); this.commit(next); }
    save(brain, messages, skills) { const next = this.snapshot(), friend = next.friends.find(f => f.id === next.active); if (!friend)
        throw Error('Nenhum amigo selecionado'); friend.brain = validateProfile(brain); if (skills)
        friend.skills = validateSkills(skills); friend.messages = messages.map(m => ({ ...m })); this.commit(next); }
    delete(id, confirmed) { if (!confirmed)
        return false; if (this.storage.getItem(friendsKey) !== this.expected)
        throw Error('Os amigos foram alterados em outra aba. Reabra esta página antes de continuar.'); const next = this.snapshot(); if (!next.friends.some(f => f.id === id))
        throw Error('Amigo não encontrado'); if (next.migratedFriend === id) {
        this.storage.removeItem(handoffKey);
        this.storage.removeItem('companheiro.backup.legacy-session.v1');
        delete next.migratedFriend;
    } for (const key of ['companheiro.backup.before-skills.v1', 'companheiro.backup.before-reservoir.v1']) {
        const backup = this.storage.getItem(key);
        if (backup) {
            const old = JSON.parse(backup);
            if (Array.isArray(old.friends)) {
                old.friends = old.friends.filter((f) => f.id !== id);
                if (old.active === id)
                    old.active = old.friends[0]?.id ?? null;
                this.storage.setItem(key, JSON.stringify(old));
            }
        }
    } next.friends = next.friends.filter(f => f.id !== id); if (next.active === id)
        next.active = next.friends[0]?.id ?? null; this.commit(next); return true; }
}

/** Segmentos curtos em RAM. Silêncio encerra fala; nenhum áudio é armazenado no navegador. */
function encodePcmWav(samples, sampleRate) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
        throw Error('Taxa de áudio inválida.');
    const length = Math.floor(samples.length * 16000 / sampleRate), buffer = new ArrayBuffer(44 + length * 2), view = new DataView(buffer);
    const ascii = (offset, text) => { for (let i = 0; i < text.length; i++)
        view.setUint8(offset + i, text.charCodeAt(i)); };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, length * 2, true);
    for (let i = 0; i < length; i++) {
        const p = i * sampleRate / 16000, j = Math.floor(p), f = p - j, n = samples[j] * (1 - f) + samples[Math.min(j + 1, samples.length - 1)] * f;
        view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, n)) * 32767, true);
    }
    return buffer;
}
class VoiceSegmenter {
    sampleRate;
    emit;
    chunks = [];
    length = 0;
    quiet = 0;
    voiced = 0;
    preRoll = [];
    constructor(sampleRate, emit) {
        this.sampleRate = sampleRate;
        this.emit = emit;
    }
    reset() { this.chunks = []; this.length = 0; this.quiet = 0; this.voiced = 0; this.preRoll = []; }
    push(block) {
        if (!block.length)
            return;
        let square = 0;
        for (const n of block)
            square += n * n;
        const rms = Math.sqrt(square / block.length), duration = block.length / this.sampleRate;
        if (!this.length) {
            this.preRoll.push(new Float32Array(block));
            while (this.preRoll.length > 1 && this.preRoll.reduce((sum, part) => sum + part.length, 0) > this.sampleRate * .2)
                this.preRoll.shift();
            if (rms <= .008)
                return;
            for (const part of this.preRoll.slice(0, -1)) {
                this.chunks.push(part);
                this.length += part.length;
            }
            this.preRoll = [];
        }
        if (rms > .008) {
            this.voiced += duration;
            this.quiet = 0;
        }
        else
            this.quiet += duration;
        this.chunks.push(new Float32Array(block));
        this.length += block.length;
        if (this.quiet >= .7 || this.length / this.sampleRate >= 10) {
            if (this.voiced >= .35) {
                const audio = new Float32Array(this.length);
                let offset = 0;
                for (const part of this.chunks) {
                    audio.set(part, offset);
                    offset += part.length;
                }
                this.reset();
                this.emit(encodePcmWav(audio, this.sampleRate));
            }
            else
                this.reset();
        }
    }
}

"use strict";
const preferenceKey = 'companheiro.preview.preferences.v1';
function cleanName(value) {
    if (typeof value !== 'string')
        throw Error('Escolha um nome para o companheiro.');
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name || Array.from(name).length > 32 || /[\u0000-\u001f\u007f]/.test(name))
        throw Error('Use um nome de 1 a 32 caracteres.');
    return name;
}
function loadPreferences() {
    const defaults = { name: 'Companheiro', theme: 'light' };
    try {
        const value = JSON.parse(localStorage.getItem(preferenceKey) ?? 'null');
        if (value && typeof value === 'object') {
            defaults.name = cleanName(value.name);
            if (value.theme === 'dark' || value.theme === 'light')
                defaults.theme = value.theme;
        }
    }
    catch { }
    return defaults;
}
function savePreferences(preferences) {
    try {
        localStorage.setItem(preferenceKey, JSON.stringify(preferences));
        return true;
    }
    catch {
        return false;
    }
}
class MicrophoneSession {
    request;
    notify;
    state = 'off';
    stream = null;
    generation = 0;
    getStream() { return this.stream; }
    constructor(request, notify) {
        this.request = request;
        this.notify = notify;
    }
    async start() {
        if (this.state !== 'off')
            return;
        const generation = ++this.generation;
        this.state = 'starting';
        this.notify(this.state, '');
        try {
            const stream = await this.request();
            if (generation !== this.generation) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            const tracks = stream.getAudioTracks();
            if (!tracks.length || tracks.every(track => track.readyState === 'ended')) {
                stream.getTracks().forEach(track => track.stop());
                throw Error('Nenhum microfone ativo foi encontrado.');
            }
            this.stream = stream;
            tracks.forEach(track => track.addEventListener('ended', () => { if (this.stream === stream)
                this.stop('O microfone foi desconectado ou a captura foi encerrada pelo navegador.'); }, { once: true }));
            this.state = 'active';
            this.notify(this.state, '');
        }
        catch (error) {
            if (generation !== this.generation)
                return;
            this.state = 'off';
            const name = error?.name;
            const message = name === 'NotAllowedError' ? 'Permissão do microfone negada. Você pode alterá-la nas configurações deste site.' : name === 'NotFoundError' ? 'Nenhum microfone encontrado. Conecte um microfone e tente novamente.' : name === 'NotReadableError' ? 'Não foi possível acessar o microfone. Ele pode estar ocupado por outro aplicativo.' : error instanceof Error ? error.message : 'Não foi possível iniciar o microfone. Tente novamente.';
            this.notify(this.state, message);
        }
    }
    stop(error = '') {
        ++this.generation;
        const stream = this.stream;
        this.stream = null;
        stream?.getTracks().forEach(track => track.stop());
        this.state = 'off';
        this.notify(this.state, error);
    }
}








/** Prévia visual isolada. Somente nome e aparência usam armazenamento local. */
const element = (id) => document.getElementById(id);
let preferences = loadPreferences(), menuOpen = false;
let friends = null, loadError = '';
try {
    friends = new FriendsStore(localStorage, preferences.name);
}
catch (error) {
    loadError = `Não foi possível abrir os amigos: ${String(error)}. Os dados foram preservados.`;
}
let activeFriend = friends?.current() ?? null, messages = activeFriend?.messages ?? [];
let skills = activeFriend?.skills ?? [];
const conversationRunner = new TextConversation();
let activeTurn = messages.filter(m => m.turn).at(-1)?.turn ?? null;
if (activeTurn?.feedback !== undefined)
    activeTurn = null;
let voiceSubmission = false, suppressVoiceUntil = 0;
let teachingProposal = null;
let modelStatus = { configured: false, model: '', destination: '', voiceAvailable: false };
let microphone;
let sessionStarted = false, sessionStarting = false;
let startController = null;
let localStop = Promise.resolve();
preferences.name = activeFriend?.name ?? 'Sem amigo';
let pendingDelete = null;
function applyPreferences() {
    document.documentElement.dataset.theme = preferences.theme;
    document.title = `${preferences.name} · prévia`;
    document.querySelectorAll('[data-companion-name]').forEach(node => node.textContent = preferences.name);
    element('companion-name').value = activeFriend?.name ?? '';
    element('name-form').hidden = !activeFriend;
    element('theme-light').setAttribute('aria-pressed', String(preferences.theme === 'light'));
    element('theme-dark').setAttribute('aria-pressed', String(preferences.theme === 'dark'));
}
function storePreference(message) { const saved = savePreferences(preferences); element('status').textContent = saved ? message : 'Preferência aplicada nesta página. O navegador não permitiu salvá-la.'; return saved; }
function setTheme(theme) {
    preferences = { ...preferences, theme };
    applyPreferences();
    storePreference(`Modo ${theme === 'dark' ? 'noturno' : 'claro'} selecionado. Salvo neste navegador.`);
}
element('theme-light').onclick = () => setTheme('light');
element('theme-dark').onclick = () => setTheme('dark');
element('name-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
        if (!friends)
            throw Error(loadError);
        friends.rename(cleanName(element('companion-name').value));
        activeFriend = friends.current();
        preferences.name = activeFriend.name;
        applyPreferences();
        renderFriends();
        element('name-status').textContent = 'Nome do amigo salvo neste navegador.';
    }
    catch (error) {
        element('name-status').textContent = error instanceof Error ? error.message : String(error);
        element('companion-name').focus();
    }
});
function setMenu(open) {
    if (!open)
        cancelFriendForms();
    menuOpen = open;
    element('drawer').hidden = !open;
    element('overlay').hidden = !open;
    element('menu-open').setAttribute('aria-expanded', String(open));
    element('main').inert = open;
    element('topbar').inert = open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open)
        element('menu-close').focus();
    else
        element('menu-open').focus();
}
element('menu-open').onclick = () => setMenu(true);
element('menu-close').onclick = () => setMenu(false);
element('overlay').onclick = () => setMenu(false);
document.addEventListener('keydown', event => {
    if (!menuOpen)
        return;
    if (event.key === 'Escape') {
        event.preventDefault();
        if (!element('friend-delete-confirm').hidden || !element('friend-create-form').hidden) {
            cancelFriendForms();
            element('friend-current').focus();
        }
        else
            setMenu(false);
        return;
    }
    if (event.key === 'Tab') {
        const focusable = Array.from(element('drawer').querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')).filter(node => !node.closest?.('[hidden]'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});
for (const id of ['nav-activity', 'nav-conversation'])
    element(id).onclick = () => setMenu(false);
function svg(tag, attrs, text) { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, String(value)); if (text)
    node.textContent = text; return node; }
let outputLabels = ['Ouvir', 'Perguntar', 'Tirar dúvidas', 'Fazer', ...skills.map(skill => skill.name)];
const network = element('network');
const inputNodes = [], outputNodes = [], potentialNodes = [], connectionNodes = [];
let latest = null, inspected = null, inspectedHidden = null;
const inputLabels = () => latest?.source === 'text' ? ['Presença', 'Mensagem de texto', 'Relevância inferida', 'Ocupado (inferido)', 'Ajuda / incerteza', 'Pausa (inferida)'] : latest?.source === 'audio' ? ['Presença', 'Sem fala interpretada', 'Energia do áudio', 'Sem ocupação lida', 'Sem pedido interpretado', 'Sem silêncio inferido'] : ['Presença', 'Conversa', 'Página relevante', 'Ocupado', 'Pedido de ajuda', 'Silêncio'];
function inspect(index) {
    inspectedHidden = null;
    inspected = index;
    if (!latest)
        return;
    const frame = latest.frame;
    element('neuron-inspect').textContent = index < 6 ? `${inputLabels()[index]} · entrada ${(latest.input[index] ?? 0).toFixed(3)} · disparo ${frame?.inputSpikes[index] ?? 0}` : `${outputLabels[index - 6]} · potencial ${(frame?.potentials[index - 6] ?? 0).toFixed(3)} / 1 · antes do reset ${(frame?.beforeReset[index - 6] ?? 0).toFixed(3)} · disparos na janela ${frame?.counts[index - 6] ?? 0} · 192 conexões de leitura plásticas · pesos iniciais ${live.brain.readoutWeights[index - 6].slice(0, 8).map(w => w.toFixed(3)).join(", ")} · média ${(live.brain.readoutWeights[index - 6].reduce((a, b) => a + b, 0) / 192).toFixed(3)}`;
}
function buildNetwork() {
    network.replaceChildren();
    inputNodes.length = 0;
    outputNodes.length = 0;
    potentialNodes.length = 0;
    connectionNodes.length = 0;
    inputTexts.length = 0;
    const height = Math.max(240, outputLabels.length * 44);
    network.setAttribute('viewBox', `0 0 740 ${height}`);
    network.style.height = height + 'px';
    const inputY = (i) => 20 + i * (height - 40) / 5, outputY = (j) => 22 + j * (height - 44) / Math.max(1, outputLabels.length - 1);
    for (let j = 0; j < outputLabels.length; j++) {
        connectionNodes[j] = [];
        for (let i = 0; i < 6; i++) {
            const line = svg('line', { x1: 175, y1: inputY(i), x2: 500, y2: outputY(j), class: 'connection' });
            connectionNodes[j].push(line);
            network.append(line);
        }
    }
    for (let i = 0; i < 6; i++) {
        const label = svg('text', { x: 0, y: inputY(i) + 4 }, inputLabels()[i]);
        inputTexts.push(label);
        network.append(label);
        const node = svg('circle', { cx: 175, cy: inputY(i), r: 6, class: 'input-node', tabindex: 0, role: 'img' });
        node.addEventListener('mouseenter', () => inspect(i));
        node.addEventListener('focus', () => inspect(i));
        inputNodes.push(node);
        network.append(node);
    }
    outputLabels.forEach((label, j) => { const y = outputY(j); const ring = svg('circle', { cx: 500, cy: y, r: 16, class: 'potential-ring', fill: 'none', 'stroke-dasharray': '0 101', transform: `rotate(-90 500 ${y})` }); potentialNodes.push(ring); network.append(ring); const node = svg('circle', { cx: 500, cy: y, r: 8, class: 'output-node', tabindex: 0, role: 'img' }); node.addEventListener('mouseenter', () => inspect(j + 6)); node.addEventListener('focus', () => inspect(j + 6)); outputNodes.push(node); network.append(node); network.append(svg('text', { x: 530, y: y + 5 }, label.length > 25 ? label.slice(0, 23) + '…' : label)); });
}
const inputTexts = [];
function renderNetwork(snapshot) {
    if (connectionNodes.length !== snapshot.weights.length)
        buildNetwork();
    latest = snapshot;
    const frame = snapshot.frame, d = snapshot.decision;
    const choiceLabel = activeTurn ? outputLabels[live.brain.actionIds.indexOf(activeTurn.choiceId)] : d ? outputLabels[d.choice] : snapshot.running ? 'Observando' : 'Pausado';
    if (element('choice').textContent !== (activeFriend ? choiceLabel : 'Crie um amigo'))
        element('choice').textContent = activeFriend ? choiceLabel : 'Crie um amigo';
    element('situation').textContent = `${snapshot.source === 'text' ? 'Entrada: interpretação desta mensagem pelo modelo local' : snapshot.source === 'demo' ? 'Demonstração: ' + live.demoContext : snapshot.source === 'audio' ? 'Entrada real: energia do microfone' : 'Entrada fixa: sem atividade informada'}${snapshot.running ? '' : ' · pausada'}`;
    if (activeTurn && snapshot.source !== 'text')
        element('situation').textContent = 'Última conversa · decisão preservada para avaliação';
    element('network-toggle').textContent = snapshot.running ? 'Pausar rede' : 'Retomar rede';
    element('review-selected').disabled = !d || !activeFriend || !!activeTurn || conversationRunner.busy;
    element('reward-good').disabled = conversationRunner.busy || (!activeTurn && !d);
    element('reward-bad').disabled = conversationRunner.busy || (!activeTurn && !d);
    if (activeTurn)
        element('conversation-provenance').textContent = `Interação ${activeTurn.id.slice(-8)} · modelo ${activeTurn.model} interpretou os sinais [${activeTurn.features.map(n => n.toFixed(2)).join(', ')}] e sugeriu ${activeTurn.suggestedIds.join(', ')}. A SNN escolheu ${activeTurn.choiceId}. Incerteza: ${activeTurn.uncertainty.toFixed(2)}. Resposta textual; nenhuma habilidade foi executada.`;
    element('network-metrics').textContent = `Janela ${snapshot.window} · passo ${frame?.tick ?? 0}/80 · disparos ${frame?.counts.join(' / ') ?? '0 / 0 / 0'} · ${snapshot.updates} atualizações de pesos${d ? ' · saída após política: ' + outputLabels[d.effective] : ''}. Nenhuma ferramenta é executada.`;
    inputNodes.forEach((node, i) => { node.setAttribute('class', 'input-node' + (frame?.inputSpikes[i] ? ' fired' : '')); node.setAttribute('aria-label', `${inputLabels()[i]}: ${snapshot.input[i].toFixed(3)}`); inputTexts[i].textContent = inputLabels()[i]; });
    outputNodes.forEach((node, j) => { node.setAttribute('class', 'output-node' + (frame?.fired.includes(j) ? ' fired' : '')); node.setAttribute('aria-label', `${outputLabels[j]}: potencial ${(frame?.potentials[j] ?? 0).toFixed(3)}, ${frame?.counts[j] ?? 0} disparos`); potentialNodes[j].setAttribute('stroke-dasharray', `${Math.min(1, frame?.potentials[j] ?? 0) * 101} 101`); });
    connectionNodes.forEach((row, j) => row.forEach((line, i) => { const weight = snapshot.weights[j][i]; line.setAttribute('stroke-width', String(.4 + weight * 5)); line.setAttribute('opacity', String(.1 + weight * .7)); line.setAttribute('aria-label', `Peso ${weight.toFixed(4)}`); }));
    drawReservoir(snapshot);
    if (inspectedHidden !== null)
        inspectHidden(inspectedHidden);
    else if (inspected !== null)
        inspect(inspected);
}
function inspectHidden(index) {
    inspectedHidden = index;
    const state = latest?.frame?.hidden;
    const edges = recurrence[index];
    element('neuron-inspect').textContent = `Interno ${index + 1}/192 · potencial ${(state?.voltage[index] ?? 0).toFixed(3)} / 1 · disparo ${state?.spikes[index] ?? 0} · refratário ${state?.refractory[index] ?? 0} · entradas recorrentes fixas: ${edges.map(edge => `${edge.from + 1}:${edge.weight.toFixed(3)}`).join(', ')}`;
}
function drawReservoir(snapshot) {
    const canvas = element('reservoir-view'), cr = canvas.getContext?.('2d');
    if (!cr)
        return;
    cr.clearRect(0, 0, 600, 160);
    const state = snapshot.frame?.hidden;
    if (inspectedHidden !== null) {
        const target = inspectedHidden;
        for (const edge of recurrence[target]) {
            cr.beginPath();
            cr.moveTo((edge.from % 24) * 25 + 12, Math.floor(edge.from / 24) * 20 + 10);
            cr.lineTo((target % 24) * 25 + 12, Math.floor(target / 24) * 20 + 10);
            cr.strokeStyle = edge.weight < 0 ? '#b87979' : '#8f839f';
            cr.lineWidth = Math.abs(edge.weight) * 12;
            cr.stroke();
        }
    }
    for (let i = 0; i < 192; i++) {
        const x = (i % 24) * 25, y = Math.floor(i / 24) * 20;
        cr.fillStyle = state?.spikes[i] ? '#ba9fdf' : `rgba(142,135,155,${.18 + (state?.voltage[i] ?? 0) * .65})`;
        cr.fillRect(x + 3, y + 3, 18, 13);
        if (i === inspectedHidden) {
            cr.strokeStyle = '#9686ae';
            cr.strokeRect(x + 1, y + 1, 22, 17);
        }
    }
}
element('reservoir-view').addEventListener('pointermove', event => { const canvas = element('reservoir-view'), rect = canvas.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width * 600, y = (event.clientY - rect.top) / rect.height * 160; inspectHidden(Math.min(191, Math.max(0, Math.floor(y / 20) * 24 + Math.floor(x / 25)))); });
element('reservoir-view').addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -24 : 24;
    inspectHidden(Math.max(0, Math.min(191, (inspectedHidden ?? 0) + delta)));
} });
let voiceProcessor = null, voiceGain = null, voiceSegmenter = null, voiceRequest = null, voiceBusy = false, voiceGeneration = 0;
let analyser = null, audioContext = null, audioSource = null, audioSamples = null;
function audioEnergy() { if (!analyser || !audioSamples)
    return 0; analyser.getFloatTimeDomainData(audioSamples); let sum = 0; for (const n of audioSamples)
    sum += n * n; return Math.min(1, Math.sqrt(sum / audioSamples.length) * 8); }
let live = new LiveNetwork(renderNetwork, activeFriend ? new Brain(activeFriend.brain) : undefined, audioEnergy);
function stopAudioAnalysis() { voiceGeneration++; voiceRequest?.abort(); voiceRequest = null; voiceBusy = false; voiceSegmenter?.reset(); voiceSegmenter = null; if (voiceProcessor) {
    voiceProcessor.onaudioprocess = null;
    voiceProcessor.disconnect();
    voiceProcessor = null;
} voiceGain?.disconnect(); voiceGain = null; audioSource?.disconnect(); audioSource = null; analyser?.disconnect(); analyser = null; audioSamples = null; const old = audioContext; audioContext = null; if (old)
    void old.close().catch(() => { }); }
function setInput() { const source = element('input-source').value; live.setSource(source, element('demo-context').value || 'Usuário ocupado'); element('demo-context').hidden = source !== 'demo'; element('teach').disabled = source !== 'demo'; }
element('input-source').onchange = setInput;
element('demo-context').onchange = setInput;
element('network-toggle').onclick = () => { if (activeTurn || conversationRunner.busy)
    return; if (activeFriend)
    live.snapshot().running ? live.stop() : live.start(); };
function learning(action) { try {
    if (!activeFriend)
        throw Error('Crie um amigo primeiro.');
    action();
    persistFriend();
    element('status').textContent = 'Aprendizado salvo para ' + activeFriend.name + '.';
}
catch (error) {
    element('status').textContent = String(error);
} }
element('reward-good').onclick = () => rateInteraction(1);
element('reward-bad').onclick = () => rateInteraction(-1);
element('teach').onclick = () => learning(() => live.teach(Number(element('teach-target').value)));
const executor = new SkillExecutor();
let draftSteps = [], pendingExecution = null;
function renderSkills() {
    element('live-neuron-count').textContent = `192 internos · ${outputLabels.length} saídas`;
    element('skill-count').textContent = String(outputLabels.length);
    element('neuron-count').textContent = `${192 + outputLabels.length} neurônios LIF: 192 internos e ${outputLabels.length} saídas. 6 canais de entrada, não contados como neurônios. Todos os 192 internos são mostrados; recorrência fixa e leitura plástica.`;
    const target = element('teach-target');
    target.replaceChildren();
    outputLabels.forEach((label, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = label; target.append(option); });
    const list = element('skill-list');
    list.replaceChildren();
    for (const skill of skills) {
        const row = document.createElement('div');
        row.className = 'skill-item';
        row.textContent = skill.name + ' · ensino humano';
        list.append(row);
    }
    element('skill-new').disabled = !activeFriend || skills.length >= 12;
}
function renderDraft() {
    const container = element('skill-steps');
    container.replaceChildren();
    draftSteps.forEach((step, index) => {
        const row = document.createElement('div');
        row.className = 'skill-step';
        const select = document.createElement('select');
        select.setAttribute('aria-label', `Etapa ${index + 1}`);
        const choices = [['wait', 'Aguardar (ms)'], ['text', 'Mostrar texto local'], ['prompt', 'Pedir informação'], ['search_proposal', 'Propor pesquisa (sem pesquisar)'], ['observe_audio', 'Observar energia de áudio (ms)'], ...skills.map(skill => ['ref:' + skill.id, skill.name])];
        for (const [value, label] of choices) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.append(option);
        }
        select.value = step.kind;
        const input = document.createElement('input');
        input.value = step.value;
        input.maxLength = 500;
        input.setAttribute('aria-label', `Texto ou duração da etapa ${index + 1}`);
        input.placeholder = step.kind === 'wait' || step.kind === 'observe_audio' ? 'Duração em ms' : 'Texto a mostrar';
        input.hidden = step.kind.startsWith('ref:');
        select.onchange = () => { step.kind = select.value; step.value = step.kind === 'wait' || step.kind === 'observe_audio' ? '500' : ''; renderDraft(); };
        input.oninput = () => { step.value = input.value; };
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remover etapa ${index + 1}`);
        remove.onclick = () => { draftSteps.splice(index, 1); renderDraft(); };
        row.append(select, input, remove);
        container.append(row);
    });
    element('skill-add-step').disabled = draftSteps.length >= 8;
}
element('skill-new').onclick = () => { if (!activeFriend)
    return; draftSteps = [{ kind: 'prompt', value: '' }]; element('skill-form').hidden = false; element('skill-name').value = ''; renderDraft(); element('skill-name').focus(); };
element('skill-add-step').onclick = () => { if (draftSteps.length < 8) {
    draftSteps.push({ kind: 'wait', value: '500' });
    renderDraft();
} };
element('skill-cancel').onclick = () => { element('skill-form').hidden = true; draftSteps = []; };
element('skill-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!activeFriend)
        return;
    if (conversationRunner.busy || activeTurn) {
        element('skill-status').textContent = 'Conclua ou avalie a conversa antes de alterar habilidades.';
        return;
    }
    try {
        const name = element('skill-name').value.trim();
        const steps = draftSteps.map(step => {
            if (step.kind.startsWith('ref:'))
                return { kind: 'ref', id: step.kind.slice(4) };
            if (step.kind === 'wait' || step.kind === 'observe_audio')
                return { kind: step.kind, ms: Number(step.value) };
            if (step.kind === 'text' || step.kind === 'prompt' || step.kind === 'search_proposal')
                return { kind: step.kind, text: step.value };
            throw Error('Etapa inválida');
        });
        const skill = { id: 'habilidade-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)), name, origin: 'ensino humano', plan: { kind: element('skill-mode').value === 'parallel' ? 'parallel' : 'sequence', steps } };
        const nextSkills = validateSkills([...skills, skill]);
        const nextBrain = new Brain(live.brain.snapshot());
        nextBrain.addAction(skill.id);
        friends.save(nextBrain.snapshot(), messages, nextSkills);
        skills = nextSkills;
        live.brain = nextBrain;
        outputLabels = ['Ouvir', 'Perguntar', 'Tirar dúvidas', 'Fazer', ...skills.map(item => item.name)];
        renderSkills();
        buildNetwork();
        live.refresh();
        element('skill-form').hidden = true;
        element('skill-status').textContent = 'Habilidade salva. Para ensinar quando usá-la, escolha Demonstração explícita em Detalhes da rede, selecione a habilidade e ensine exemplos.';
    }
    catch (error) {
        element('skill-status').textContent = String(error);
    }
});
function cancelExecution() { executor.cancel(); pendingExecution = null; element('execution-review').hidden = true; }
function describePlan(step) {
    if (step.kind === 'sequence' || step.kind === 'parallel')
        return (step.kind === 'parallel' ? 'Ao mesmo tempo: ' : 'Em sequência: ') + step.steps.map(describePlan).join(' → ');
    if (step.kind === 'wait')
        return `aguardar ${step.ms} ms`;
    if (step.kind === 'observe_audio')
        return `observar energia local por ${step.ms} ms`;
    if (step.kind === 'text')
        return `mostrar “${step.text}”`;
    if (step.kind === 'prompt')
        return `perguntar “${step.text}”`;
    if (step.kind === 'search_proposal')
        return `mostrar proposta “${step.text}”`;
    return 'habilidade referenciada';
}
element('review-selected').onclick = () => {
    const decision = live.snapshot().decision;
    if (!decision || !activeFriend)
        return;
    const index = decision.choice;
    const plan = index < 4 ? basePlan(index, microphone.state === 'active') : skills[index - 4]?.plan;
    if (!plan)
        return;
    pendingExecution = { friendId: activeFriend.id, plan: compilePlan(plan, skills), catalog: JSON.parse(JSON.stringify(skills)), name: outputLabels[index] };
    element('skill-panel').setAttribute('open', '');
    element('execution-review').hidden = false;
    element('execution-plan').textContent = `${outputLabels[index]}: ${describePlan(pendingExecution.plan)}. Somente efeitos locais, sem modelo ou comandos gerais.`;
};
element('execution-cancel').onclick = () => { cancelExecution(); element('skill-status').textContent = 'Execução cancelada.'; };
element('execute-skill').onclick = () => {
    const pending = pendingExecution;
    if (!pending || pending.friendId !== activeFriend?.id)
        return;
    pendingExecution = null;
    element('execute-skill').disabled = true;
    const friendId = pending.friendId;
    void executor.run(pending.plan, pending.catalog, { audioActive: () => microphone.state === 'active' && activeFriend?.id === friendId, energy: audioEnergy, report: text => { if (activeFriend?.id === friendId)
            element('skill-status').textContent = text; }, emit: (kind, text) => {
            if (activeFriend?.id !== friendId)
                return;
            const label = kind === 'search_proposal' ? 'Proposta de pesquisa (não executada)' : kind === 'prompt' ? 'Pedido de informação' : 'Texto local';
            messages.push({ user: false, text: `[${label}] ${text}`, source: 'local' });
            addMessage(`[${label}] ${text}`, false, 'local');
            persistFriend();
        } }).then(() => { if (activeFriend?.id === friendId)
        element('skill-status').textContent = 'Habilidade concluída. Avalie a escolha com ＋ ou −.'; }).catch(error => { if (activeFriend?.id === friendId)
        element('skill-status').textContent = String(error); }).finally(() => { element('execute-skill').disabled = false; element('execution-review').hidden = true; });
};
function persistFriend() { if (friends && activeFriend)
    friends.save(live.brain.snapshot(), messages, skills); }
function cancelFriendForms() { pendingDelete = null; element('friend-create-form').hidden = true; element('friend-delete-confirm').hidden = true; }
function renderFriends() {
    element('friend-current').textContent = (activeFriend?.name ?? 'Nenhum amigo') + ' ⌄';
    element('friend-delete').disabled = !activeFriend;
    const atLimit = (friends?.snapshot().friends.length ?? 0) >= maxFriends;
    element('friend-create').disabled = !friends || atLimit;
    element('friend-limit').hidden = !atLimit;
    element('friend-limit').textContent = atLimit ? friendsLimitMessage : '';
    if (atLimit)
        element('friend-create-form').hidden = true;
    for (const id of ['session-toggle', 'network-toggle', 'chat-text'])
        element(id).disabled = !activeFriend;
    element('teach').disabled = !activeFriend || live.source !== 'demo';
    const list = element('friend-list');
    list.replaceChildren();
    for (const friend of friends?.snapshot().friends ?? []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = friend.name;
        button.setAttribute('aria-current', String(friend.id === activeFriend?.id));
        button.onclick = () => changeFriend(() => friends.select(friend.id));
        list.append(button);
    }
}
function renderMessages() { element('messages').replaceChildren(); for (const message of messages)
    addMessage(message.text, message.user, message.source); }
function suspendFriend() { teachingProposal = null; element('teaching-proposal').hidden = true; stopSession(); cancelExecution(); microphone.stop(); live.stop(); stopAudioAnalysis(); persistFriend(); }
function changeFriend(operation) {
    try {
        suspendFriend();
        operation();
        activeFriend = friends.current();
        messages = activeFriend?.messages ?? [];
        activeTurn = messages.filter(m => m.turn).at(-1)?.turn ?? null;
        if (activeTurn?.feedback !== undefined)
            activeTurn = null;
        skills = activeFriend?.skills ?? [];
        outputLabels = ['Ouvir', 'Perguntar', 'Tirar dúvidas', 'Fazer', ...skills.map(skill => skill.name)];
        preferences.name = activeFriend?.name ?? 'Sem amigo';
        live = new LiveNetwork(renderNetwork, activeFriend ? new Brain(activeFriend.brain) : undefined, audioEnergy);
        draftSteps = [];
        element('skill-form').hidden = true;
        pendingExecution = null;
        inspectedHidden = null;
        inspected = null;
        latest = null;
        element('input-source').value = 'idle';
        element('demo-context').hidden = true;
        element('teach').disabled = true;
        cancelFriendForms();
        applyPreferences();
        renderFriends();
        renderMessages();
        renderSkills();
        buildNetwork();
        renderNetwork(live.snapshot());
        element('friend-current').focus();
        element('status').textContent = activeFriend ? 'Amigo selecionado. Microfone desligado; inicie quando quiser.' : 'Nenhum amigo. Abra o menu para criar um novo.';
    }
    catch (error) {
        element('friend-status').textContent = String(error);
    }
}
element('friend-current').onclick = () => { const open = element('friend-options').hidden; element('friend-options').hidden = !open; element('friend-current').setAttribute('aria-expanded', String(open)); if (!open)
    cancelFriendForms(); };
element('friend-create').onclick = () => { if (!friends || (friends.snapshot().friends.length >= maxFriends)) {
    element('friend-status').textContent = friendsLimitMessage;
    return;
} cancelFriendForms(); element('friend-create-form').hidden = false; element('friend-new-name').value = ''; element('friend-new-name').focus(); };
element('friend-create-cancel').onclick = () => { cancelFriendForms(); element('friend-create').focus(); };
element('friend-create-form').addEventListener('submit', event => { event.preventDefault(); try {
    if (!friends || friends.snapshot().friends.length >= maxFriends)
        throw Error(friendsLimitMessage);
    const name = cleanName(element('friend-new-name').value);
    changeFriend(() => friends.create(name));
}
catch (error) {
    element('friend-status').textContent = String(error);
} });
element('friend-delete').onclick = () => { if (!activeFriend)
    return; cancelFriendForms(); pendingDelete = { id: activeFriend.id, name: activeFriend.name }; element('delete-warning').textContent = `Apagar o amigo “${activeFriend.name}”? O aprendizado e a conversa deste amigo serão perdidos definitivamente neste navegador. Os outros amigos e o tema serão mantidos.`; element('friend-delete-confirm').hidden = false; element('friend-delete-cancel').focus(); };
element('friend-delete-cancel').onclick = () => { cancelFriendForms(); element('friend-delete').focus(); };
element('friend-delete-yes').onclick = () => { if (!pendingDelete)
    return; const id = pendingDelete.id; changeFriend(() => friends.delete(id, true)); element('friend-current').focus(); };
window.addEventListener('storage', event => {
    if (event.key !== 'companheiro.friends.v1')
        return;
    const hadPending = conversationRunner.busy;
    stopSession();
    cancelExecution();
    try {
        friends = new FriendsStore(localStorage, preferences.name);
        activeFriend = friends.current();
        messages = activeFriend?.messages ?? [];
        skills = activeFriend?.skills ?? [];
        activeTurn = messages.filter(m => m.turn).at(-1)?.turn ?? null;
        if (activeTurn?.feedback !== undefined)
            activeTurn = null;
        preferences.name = activeFriend?.name ?? 'Sem amigo';
        outputLabels = ['Ouvir', 'Perguntar', 'Tirar dúvidas', 'Fazer', ...skills.map(s => s.name)];
        live = new LiveNetwork(renderNetwork, activeFriend ? new Brain(activeFriend.brain) : undefined, audioEnergy);
        draftSteps = [];
        element('skill-form').hidden = true;
        cancelFriendForms();
        applyPreferences();
        renderFriends();
        renderMessages();
        renderSkills();
        buildNetwork();
        renderNetwork(live.snapshot());
        element('chat-status').textContent = hadPending ? 'A conversa foi atualizada. Envie sua mensagem novamente se necessário.' : '';
    }
    catch {
        friends = null;
        activeFriend = null;
        renderFriends();
        syncChatControls();
        element('chat-status').textContent = 'Não foi possível abrir este amigo. Atualize a página.';
    }
});
function addMessage(text, user, source = 'demo') {
    const container = element('messages'), message = document.createElement('div');
    message.className = `message ${user ? 'user' : 'companion'}`;
    const byline = document.createElement('div');
    byline.className = 'message-byline';
    const author = document.createElement('span');
    author.textContent = user ? 'Você' : preferences.name;
    if (!user)
        author.setAttribute('data-companion-name', '');
    byline.append(author);
    if (!user) {
        const note = document.createElement('span');
        note.className = 'message-type';
        note.textContent = source === 'local' ? 'AÇÃO LOCAL' : source === 'model' ? 'MODELO LOCAL · RESPOSTA EM TEXTO' : 'RESPOSTA SIMULADA';
        byline.append(note);
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    message.append(byline, bubble);
    container.append(message);
    container.scrollTop = container.scrollHeight;
}
element('teaching-dismiss').onclick = () => { teachingProposal = null; element('teaching-proposal').hidden = true; };
element('teaching-save').onclick = () => {
    const proposed = teachingProposal;
    if (!proposed || activeFriend?.id !== proposed.friendId || conversationRunner.busy)
        return;
    try {
        const skill = { ...proposed.skill, id: 'habilidade-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)) };
        const nextSkills = validateSkills([...skills, skill]), brain = new Brain(live.brain.snapshot());
        brain.addAction(skill.id);
        brain.teachInput(proposed.features, brain.actionIds.length - 1);
        friends.save(brain.snapshot(), messages, nextSkills);
        skills = nextSkills;
        live.brain = brain;
        outputLabels = ['Ouvir', 'Perguntar', 'Tirar dúvidas', 'Fazer', ...skills.map(s => s.name)];
        renderSkills();
        buildNetwork();
        live.refresh();
        teachingProposal = null;
        element('teaching-proposal').hidden = true;
        element('chat-status').textContent = 'Habilidade guardada para este amigo.';
    }
    catch {
        element('chat-status').textContent = 'Não consegui guardar essa habilidade. Descreva etapas mais simples.';
    }
};
function syncChatControls() {
    const locked = conversationRunner.busy || !!activeTurn;
    element('chat-send').disabled = !activeFriend || conversationRunner.busy;
    element('chat-cancel').hidden = !conversationRunner.busy;
    if (conversationRunner.busy) {
        for (const id of ['reward-good', 'reward-bad', 'review-selected'])
            element(id).disabled = true;
    }
    for (const id of ['input-source', 'demo-context', 'network-toggle', 'skill-new', 'teach'])
        element(id).disabled = locked || !activeFriend || (id === 'teach' && live.source !== 'demo') || (id === 'skill-new' && skills.length >= 12);
    if (voiceBusy)
        element('mic-status').textContent = 'Entendendo…';
    else if (conversationRunner.busy)
        element('mic-status').textContent = 'Respondendo…';
    else if (microphone?.state === 'active')
        element('mic-status').textContent = 'Escutando';
    element('session-toggle').textContent = sessionStarting ? 'Cancelar' : sessionStarted || conversationRunner.busy ? 'Encerrar' : 'Iniciar companheiro';
}
function stopLocalModel() { if (typeof fetch === 'function')
    localStop = fetch('/api/model/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', keepalive: true }).catch(() => { }); }
function cancelConversation() { conversationRunner.cancel(); stopLocalModel(); if (live.source === 'text')
    live.stop(); syncChatControls(); }
element('chat-cancel').onclick = () => { cancelConversation(); element('chat-status').textContent = 'Resposta cancelada.'; };
function rateInteraction(reward) {
    if (conversationRunner.busy)
        return;
    if (!activeTurn) {
        learning(() => live.feedback(reward));
        return;
    }
    const turn = activeTurn, backup = live.brain.snapshot();
    try {
        applyTurnFeedback(live.brain, turn, reward);
        persistFriend();
        activeTurn = null;
        live.refresh();
        element('status').textContent = 'Avaliação salva para esta interação. Pesos atualizados.';
    }
    catch (error) {
        live.brain = new Brain(backup);
        delete turn.feedback;
        element('status').textContent = String(error);
    }
    syncChatControls();
}
async function loadModelStatus() {
    if (typeof fetch !== 'function')
        return;
    try {
        const response = await fetch('/api/model', { cache: 'no-store' });
        if (!response.ok)
            throw Error();
        const data = await response.json();
        modelStatus = { configured: data.configured === true, model: data.model ?? '', destination: data.destination ?? '', voiceAvailable: data.voiceAvailable === true };
        element('model-status').textContent = modelStatus.configured ? 'Modelo local experimental' : 'Modelo não conectado';
        element('model-description').textContent = modelStatus.configured ? `${modelStatus.model} · somente localhost. Conversa local. Carrega ao iniciar ou enviar.` : 'O modelo local não está disponível. Nenhuma resposta fixa substituirá o modelo.';
    }
    catch {
        element('model-status').textContent = 'Servidor de conversa indisponível';
    }
    syncChatControls();
}
element('chat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = element('chat-text'), text = input.value.trim();
    if (!text || !activeFriend || conversationRunner.busy)
        return;
    if (!modelStatus.configured) {
        await loadModelStatus();
        if (!modelStatus.configured) {
            element('chat-status').textContent = 'Não consegui conectar. Clique em Iniciar companheiro e tente novamente.';
            return;
        }
    }
    if (conversationRunner.busy)
        return;
    if (messages.length >= 99) {
        element('chat-status').textContent = 'Limite local de 100 mensagens atingido. O histórico foi preservado; nenhuma mensagem foi enviada.';
        return;
    }
    const speakResponse = voiceSubmission;
    voiceSubmission = false;
    const friendId = activeFriend.id, id = 'turno-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36));
    const request = { phase: 'interpret', requestId: id, friendId, name: activeFriend.name, text, consent: true, candidates: live.brain.actionIds.map((action, i) => ({ id: action, name: outputLabels[i] })), history: conversationHistory(messages) };
    const previous = messages;
    messages = [...messages, { user: true, text, source: 'model' }];
    try {
        persistFriend();
    }
    catch (error) {
        messages = previous;
        element('chat-status').textContent = 'Mensagem não enviada: ' + String(error);
        return;
    }
    sessionStarted = true;
    renderMessages();
    input.value = '';
    activeTurn = null;
    cancelExecution();
    live.stop();
    const thisLive = live;
    element('chat-status').textContent = 'Modelo interpretando; em seguida a rede escolhe e o modelo responde…';
    const promise = conversationRunner.send(request, thisLive.brain, async (payload, signal) => {
        await localStop;
        if (signal.aborted)
            throw Error('Conversa cancelada.');
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
        const data = await response.json();
        if (!response.ok)
            throw Error(data.error || 'Conversa indisponível.');
        return data;
    }, (features, signal) => { if (activeFriend?.id !== friendId)
        throw Error('Amigo alterado.'); element('input-source').value = 'text'; return thisLive.evaluateText(features, signal); });
    syncChatControls();
    try {
        const result = await promise;
        if (activeFriend?.id !== friendId)
            return;
        activeTurn = result.turn;
        messages = [...messages, { user: false, text: result.reply, source: 'model', turn: result.turn }];
        renderMessages();
        persistFriend();
        if (speakResponse && microphone.state === 'active') {
            const voice = window.speechSynthesis?.getVoices().find(v => v.localService && /^pt/i.test(v.lang));
            if (voice) {
                const speech = new SpeechSynthesisUtterance(result.reply);
                speech.voice = voice;
                speech.onend = () => { suppressVoiceUntil = Date.now() + 500; };
                window.speechSynthesis.speak(speech);
            }
        }
        if (result.proposal) {
            teachingProposal = { skill: result.proposal, friendId, features: result.turn.features };
            element('teaching-description').textContent = `Guardar “${result.proposal.name}”? ${describePlan(result.proposal.plan)}`;
            element('teaching-proposal').hidden = false;
        }
        element('model-status').textContent = 'Modelo local conectado';
        element('chat-status').textContent = 'Resposta pronta. ＋ / − avaliam a decisão desta interação.';
        renderNetwork(live.snapshot());
    }
    catch (error) {
        if (activeFriend?.id === friendId) {
            element('chat-status').textContent = (error instanceof Error && error.name === 'AbortError') ? 'Resposta cancelada.' : String(error);
            live.stop();
        }
    }
    finally {
        syncChatControls();
    }
});
applyPreferences();
renderFriends();
renderMessages();
renderSkills();
if (activeFriend && !activeTurn)
    live.start();
else
    renderNetwork(live.snapshot());
element('status').textContent = loadError || friends?.migration || '';
if (loadError)
    element('chat-status').textContent = 'Não consegui abrir seus amigos. Atualize a página.';
microphone = new MicrophoneSession(async () => {
    if (!navigator.mediaDevices?.getUserMedia)
        throw Error('Captura de microfone indisponível. Abra esta página em localhost ou HTTPS em um navegador compatível.');
    return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
}, (state, error) => {
    const button = element('toggle-mic');
    button.textContent = state === 'active' ? 'Desativar microfone' : state === 'starting' ? 'Cancelar microfone' : 'Ativar microfone (opcional)';
    element('mic-status').textContent = state === 'active' ? 'Escutando' : state === 'starting' ? 'Aguardando permissão do microfone…' : sessionStarting ? 'Carregando modelo local…' : sessionStarted ? 'Pronto para conversar' : 'Desligado';
    element('mic-dot').classList.toggle('active', state === 'active');
    element('mic-error').hidden = !error;
    element('mic-error').textContent = error;
    if (state !== 'active') {
        stopAudioAnalysis();
        const audioOption = element('input-source').querySelector('option[value="audio"]');
        if (audioOption)
            audioOption.disabled = true;
        if (live.source === 'audio') {
            element('input-source').value = 'idle';
            live.setSource('idle');
        }
        if (state === 'off' && live.source === 'audio') {
            live.setSource('idle');
        }
    }
    element('mic-note').textContent = state === 'active' ? 'Trechos temporários de áudio são transcritos neste computador.' : 'Microfone opcional; áudio temporário para transcrição neste computador.';
});
element('toggle-mic').onclick = async () => {
    if (microphone.state !== 'off') {
        microphone.stop();
        return;
    }
    if (!activeFriend)
        return;
    const requestedFriendId = activeFriend.id, requestedGeneration = voiceGeneration;
    await loadModelStatus();
    if (activeFriend?.id !== requestedFriendId || voiceGeneration !== requestedGeneration || microphone.state !== 'off')
        return;
    if (!modelStatus.voiceAvailable) {
        element('mic-error').hidden = false;
        element('mic-error').textContent = 'Não consegui preparar a voz. Você ainda pode digitar.';
        return;
    }
    const friendAtStart = activeFriend.id;
    if (microphone.state === 'off') {
        if (!activeTurn)
            live.start();
        void microphone.start().then(() => {
            const stream = microphone.getStream();
            if (!stream || activeFriend?.id !== friendAtStart)
                return;
            try {
                try {
                    audioContext = new AudioContext({ sampleRate: 16000 });
                }
                catch {
                    audioContext = new AudioContext();
                }
                audioSource = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;
                audioSamples = new Float32Array(512);
                audioSource.connect(analyser);
                if (modelStatus.voiceAvailable) {
                    voiceSegmenter = new VoiceSegmenter(audioContext.sampleRate, wav => { void sendVoice(wav); });
                    voiceProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                    voiceGain = audioContext.createGain();
                    voiceGain.gain.value = 0;
                    audioSource.connect(voiceProcessor);
                    voiceProcessor.connect(voiceGain);
                    voiceGain.connect(audioContext.destination);
                    voiceProcessor.onaudioprocess = event => { event.outputBuffer.getChannelData(0).fill(0); if (conversationRunner.busy || voiceBusy || Date.now() < suppressVoiceUntil || window.speechSynthesis?.speaking) {
                        voiceSegmenter?.reset();
                        return;
                    } voiceSegmenter?.push(event.inputBuffer.getChannelData(0)); };
                }
                const created = audioContext;
                void audioContext.resume().catch(() => { if (audioContext !== created)
                    return; microphone.stop(); element('mic-error').hidden = false; element('mic-error').textContent = 'Não consegui iniciar a escuta. Você ainda pode digitar.'; stopAudioAnalysis(); element('input-source').value = 'idle'; live.setSource('idle'); });
                const option = element('input-source').querySelector('option[value="audio"]');
                if (option)
                    option.disabled = false;
                if (!activeTurn) {
                    element('input-source').value = 'audio';
                    setInput();
                }
            }
            catch {
                stopAudioAnalysis();
                microphone.stop();
                element('mic-error').hidden = false;
                element('mic-error').textContent = 'Não consegui iniciar a escuta. Você ainda pode digitar.';
            }
        });
    }
    else
        microphone.stop();
};
async function sendVoice(wav) {
    if (!activeFriend || voiceBusy || conversationRunner.busy)
        return;
    const id = activeFriend.id, generation = voiceGeneration;
    voiceBusy = true;
    const controller = new AbortController();
    voiceRequest = controller;
    element('mic-status').textContent = 'Entendendo…';
    try {
        const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: wav, signal: controller.signal });
        const data = await response.json();
        if (!response.ok)
            throw Error(data.error);
        if (generation !== voiceGeneration || activeFriend?.id !== id)
            return;
        const text = String(data.text || '').trim();
        if (text && !conversationRunner.busy) {
            const draft = element('chat-text');
            if (draft.value.trim()) {
                draft.value += ' ' + text;
                element('chat-status').textContent = 'Acrescentei a fala ao texto. Envie quando quiser.';
                return;
            }
            const details = element('conversation').querySelector('details');
            if (details)
                details.open = true;
            voiceSubmission = true;
            element('chat-text').value = text;
            element('chat-form').requestSubmit();
        }
        else if (!text)
            element('chat-status').textContent = 'Não entendi. Pode repetir ou digitar?';
    }
    catch (error) {
        if (!controller.signal.aborted && generation === voiceGeneration)
            element('chat-status').textContent = 'Não entendi. Pode repetir ou digitar?';
    }
    finally {
        if (generation === voiceGeneration) {
            voiceBusy = false;
            voiceRequest = null;
            element('mic-status').textContent = conversationRunner.busy ? 'Respondendo…' : microphone.state === 'active' ? 'Escutando' : 'Pronto para conversar';
        }
    }
}
function stopSession() { window.speechSynthesis?.cancel(); sessionStarted = false; sessionStarting = false; startController?.abort(); startController = null; cancelConversation(); microphone?.stop(); live.stop(); stopAudioAnalysis(); element('mic-status').textContent = 'Desligado'; syncChatControls(); }
element('session-toggle').onclick = async () => {
    if (sessionStarted || sessionStarting || conversationRunner.busy) {
        stopSession();
        return;
    }
    if (!activeFriend)
        return;
    sessionStarting = true;
    startController = new AbortController();
    const controller = startController;
    const id = activeFriend.id;
    element('mic-status').textContent = 'Carregando modelo local…';
    syncChatControls();
    try {
        await localStop;
        const response = await fetch('/api/model/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
        const data = await response.json();
        if (!response.ok)
            throw Error(data.error || 'Não foi possível iniciar o modelo local.');
        if (controller.signal.aborted || activeFriend?.id !== id)
            return;
        await loadModelStatus();
        if (controller.signal.aborted || activeFriend?.id !== id)
            return;
        sessionStarted = true;
        element('mic-status').textContent = 'Pronto para conversar';
        element('model-status').textContent = 'Modelo local conectado';
        if (!activeTurn)
            live.start();
        if (modelStatus.voiceAvailable && microphone.state === 'off')
            element('toggle-mic').click();
    }
    catch (error) {
        if (activeFriend?.id === id) {
            element('mic-status').textContent = 'Desligado';
            element('chat-status').textContent = controller.signal.aborted ? 'Início cancelado.' : String(error);
        }
    }
    finally {
        if (startController === controller) {
            startController = null;
            sessionStarting = false;
        }
        syncChatControls();
    }
};
window.addEventListener('pagehide', () => { stopSession(); cancelExecution(); microphone.stop(); live.stop(); stopAudioAnalysis(); try {
    persistFriend();
}
catch { } });
window.addEventListener('beforeunload', () => { stopSession(); cancelExecution(); microphone.stop(); live.stop(); stopAudioAnalysis(); try {
    persistFriend();
}
catch { } });
void loadModelStatus();
