/** Rede LIF determinística, independente da interface e do runtime desktop. */
const actions = ['aguardar', 'perguntar', 'propor_url'];
const contexts = {
    'Conversa com página relevante': [1, 1, 1, 0, .5, 0],
    'Usuário ocupado': [1, 0, 0, 1, 0, 0],
    'Pedido de ajuda': [1, 1, 0, 0, 1, 0],
    'Sem atividade informada': [1, 0, 0, 0, 0, 1],
};
const features = ['Presença', 'Conversa', 'Página relevante', 'Ocupado', 'Pedido de ajuda', 'Silêncio'];
function validateProfile(value) {
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
class LIFSimulation {
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
class Brain {
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


/** Mesmo integrador usado em Brain.run. Passos independem do desenho e não usam aleatoriedade. */
class LiveNetwork {
    notify;
    energy;
    brain;
    simulation;
    tick = 0;
    windows = 0;
    timer = null;
    source = 'idle';
    demoContext = 'Usuário ocupado';
    frame = null;
    decision = null;
    input = contexts['Sem atividade informada'];
    constructor(notify, brain = new Brain(), energy = () => 0) {
        this.notify = notify;
        this.energy = energy;
        this.brain = brain;
        this.simulation = new LIFSimulation(brain.weights);
    }
    snapshot() { return { running: this.timer !== null, source: this.source, frame: this.frame, weights: this.brain.weights.map(row => [...row]), decision: this.decision, updates: this.brain.updates, window: this.windows, input: [...this.input] }; }
    start() { if (this.timer !== null)
        return; this.timer = setInterval(() => { this.advance(5); }, 100); this.notify(this.snapshot()); }
    stop() { if (this.timer !== null)
        clearInterval(this.timer); this.timer = null; this.notify(this.snapshot()); }
    setSource(source, context = this.demoContext) { if (source === 'demo' && !Object.hasOwn(contexts, context))
        throw Error('Entrada inválida'); this.source = source; this.demoContext = context; this.reset(); this.notify(this.snapshot()); }
    reset() { this.tick = 0; this.simulation = new LIFSimulation(this.brain.weights); this.decision = null; this.frame = null; this.brain.pending = null; }
    advance(steps = 5) {
        for (let i = 0; i < steps; i++) {
            if (this.tick === 80) {
                this.tick = 0;
                this.simulation = new LIFSimulation(this.brain.weights);
            }
            this.input = this.source === 'demo' ? contexts[this.demoContext] : this.source === 'audio' ? [1, 0, Math.min(1, Math.max(0, this.energy())), 0, 0, 0] : [1, 0, 0, 0, 0, 1];
            this.frame = this.simulation.step(this.input);
            this.tick++;
            if (this.tick === 80) {
                this.windows++;
                this.decision = this.brain.complete(this.simulation.result(), this.source === 'demo' ? this.demoContext : this.source === 'audio' ? 'Áudio local' : 'Sem atividade informada');
            }
        }
        this.notify(this.snapshot());
    }
    feedback(reward) { if (!this.decision)
        throw Error('Aguarde uma decisão completa.'); this.brain.pending = this.decision; this.brain.feedback(reward); this.reset(); this.notify(this.snapshot()); }
    teach(target) { if (this.source !== 'demo')
        throw Error('Use uma entrada de demonstração para ensinar.'); this.brain.teach(this.demoContext, target); this.reset(); this.notify(this.snapshot()); }
}


const friendsKey = 'companheiro.friends.v1';
const handoffKey = 'companheiro.preview.legacy-session.v1';
function friendName(value) { if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > 32 || /[\u0000-\u001f\u007f]/.test(value))
    throw Error('Use um nome de 1 a 32 caracteres.'); return value.trim().replace(/\s+/g, ' '); }
function validFriends(value) {
    const data = value;
    if (!data || data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.friends) || !(data.active === null || typeof data.active === 'string'))
        throw Error('Dados de amigos inválidos. Nada foi substituído.');
    const ids = new Set();
    for (const friend of data.friends) {
        if (!friend || typeof friend.id !== 'string' || !friend.id || ids.has(friend.id))
            throw Error('Amigo inválido');
        ids.add(friend.id);
        friendName(friend.name);
        validateProfile(friend.brain);
        if (!Array.isArray(friend.messages) || friend.messages.some(m => !m || typeof m.user !== 'boolean' || typeof m.text !== 'string' || m.text.length > 10000))
            throw Error('Conversa inválida');
    }
    if (data.active !== null && !ids.has(data.active))
        throw Error('Amigo atual inválido');
    return JSON.parse(JSON.stringify(data));
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
            this.data = validFriends(JSON.parse(this.expected));
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
        const friend = { id: this.id(), name: friendName(legacyName), brain: seed ?? new Brain().snapshot(), messages };
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
    create(name) { const next = this.snapshot(); const friend = { id: this.id(), name: friendName(name), brain: new Brain().snapshot(), messages: [] }; next.friends.push(friend); next.active = friend.id; this.commit(next); return this.current(); }
    select(id) { if (!this.data.friends.some(f => f.id === id))
        throw Error('Amigo não encontrado'); this.commit({ ...this.snapshot(), active: id }); }
    rename(name) { const next = this.snapshot(), friend = next.friends.find(f => f.id === next.active); if (!friend)
        throw Error('Crie um amigo primeiro'); friend.name = friendName(name); this.commit(next); }
    save(brain, messages) { const next = this.snapshot(), friend = next.friends.find(f => f.id === next.active); if (!friend)
        throw Error('Nenhum amigo selecionado'); friend.brain = validateProfile(brain); friend.messages = messages.map(m => ({ ...m })); this.commit(next); }
    delete(id, confirmed) { if (!confirmed)
        return false; const next = this.snapshot(); if (!next.friends.some(f => f.id === id))
        throw Error('Amigo não encontrado'); if (next.migratedFriend === id) {
        this.storage.removeItem(handoffKey);
        this.storage.removeItem('companheiro.backup.legacy-session.v1');
        delete next.migratedFriend;
    } next.friends = next.friends.filter(f => f.id !== id); if (next.active === id)
        next.active = next.friends[0]?.id ?? null; this.commit(next); return true; }
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
const outputLabels = ['Aguardar', 'Perguntar', 'Sugerir uma página'];
const network = element('network');
const inputNodes = [], outputNodes = [], potentialNodes = [], connectionNodes = [];
let latest = null, inspected = null;
const inputLabels = () => latest?.source === 'audio' ? ['Presença', 'Sem fala interpretada', 'Energia do áudio', 'Sem ocupação lida', 'Sem pedido interpretado', 'Sem silêncio inferido'] : ['Presença', 'Conversa', 'Página relevante', 'Ocupado', 'Pedido de ajuda', 'Silêncio'];
function inspect(index) {
    inspected = index;
    if (!latest)
        return;
    const frame = latest.frame;
    element('neuron-inspect').textContent = index < 6 ? `${inputLabels()[index]} · entrada ${(latest.input[index] ?? 0).toFixed(3)} · disparo ${frame?.inputSpikes[index] ?? 0}` : `${outputLabels[index - 6]} · potencial ${(frame?.potentials[index - 6] ?? 0).toFixed(3)} / 1 · antes do reset ${(frame?.beforeReset[index - 6] ?? 0).toFixed(3)} · disparos na janela ${frame?.counts[index - 6] ?? 0}`;
}
for (let j = 0; j < 3; j++) {
    connectionNodes[j] = [];
    for (let i = 0; i < 6; i++) {
        const line = svg('line', { x1: 175, y1: 20 + i * 40, x2: 500, y2: 40 + j * 80, class: 'connection' });
        connectionNodes[j].push(line);
        network.append(line);
    }
}
const inputTexts = [];
for (let i = 0; i < 6; i++) {
    const label = svg('text', { x: 0, y: 24 + i * 40 }, inputLabels()[i]);
    inputTexts.push(label);
    network.append(label);
    const node = svg('circle', { cx: 175, cy: 20 + i * 40, r: 6, class: 'input-node', tabindex: 0, role: 'img' });
    node.addEventListener('mouseenter', () => inspect(i));
    node.addEventListener('focus', () => inspect(i));
    inputNodes.push(node);
    network.append(node);
}
for (let j = 0; j < 3; j++) {
    const ring = svg('circle', { cx: 500, cy: 40 + j * 80, r: 16, class: 'potential-ring', fill: 'none', 'stroke-dasharray': '0 101', transform: `rotate(-90 500 ${40 + j * 80})` });
    potentialNodes.push(ring);
    network.append(ring);
    const node = svg('circle', { cx: 500, cy: 40 + j * 80, r: 8, class: 'output-node', tabindex: 0, role: 'img' });
    node.addEventListener('mouseenter', () => inspect(j + 6));
    node.addEventListener('focus', () => inspect(j + 6));
    outputNodes.push(node);
    network.append(node);
    network.append(svg('text', { x: 530, y: 45 + j * 80 }, outputLabels[j]));
}
function renderNetwork(snapshot) {
    latest = snapshot;
    const frame = snapshot.frame, d = snapshot.decision;
    const choiceLabel = d ? outputLabels[d.choice] : snapshot.running ? 'Observando' : 'Pausado';
    if (element('choice').textContent !== (activeFriend ? choiceLabel : 'Crie um amigo'))
        element('choice').textContent = activeFriend ? choiceLabel : 'Crie um amigo';
    element('situation').textContent = `${snapshot.source === 'demo' ? 'Demonstração: ' + live.demoContext : snapshot.source === 'audio' ? 'Entrada real: energia do microfone' : 'Entrada fixa: sem atividade informada'}${snapshot.running ? '' : ' · pausada'}`;
    element('network-toggle').textContent = snapshot.running ? 'Pausar rede' : 'Retomar rede';
    element('reward-good').disabled = !d;
    element('reward-bad').disabled = !d;
    element('network-metrics').textContent = `Janela ${snapshot.window} · passo ${frame?.tick ?? 0}/80 · disparos ${frame?.counts.join(' / ') ?? '0 / 0 / 0'} · ${snapshot.updates} atualizações de pesos${d ? ' · saída após política: ' + outputLabels[d.effective] : ''}. Nenhuma ferramenta é executada.`;
    inputNodes.forEach((node, i) => { node.setAttribute('class', 'input-node' + (frame?.inputSpikes[i] ? ' fired' : '')); node.setAttribute('aria-label', `${inputLabels()[i]}: ${snapshot.input[i].toFixed(3)}`); inputTexts[i].textContent = inputLabels()[i]; });
    outputNodes.forEach((node, j) => { node.setAttribute('class', 'output-node' + (frame?.fired.includes(j) ? ' fired' : '')); node.setAttribute('aria-label', `${outputLabels[j]}: potencial ${(frame?.potentials[j] ?? 0).toFixed(3)}, ${frame?.counts[j] ?? 0} disparos`); potentialNodes[j].setAttribute('stroke-dasharray', `${Math.min(1, frame?.potentials[j] ?? 0) * 101} 101`); });
    connectionNodes.forEach((row, j) => row.forEach((line, i) => { const weight = snapshot.weights[j][i]; line.setAttribute('stroke-width', String(.4 + weight * 5)); line.setAttribute('opacity', String(.1 + weight * .7)); line.setAttribute('aria-label', `Peso ${weight.toFixed(4)}`); }));
    if (inspected !== null)
        inspect(inspected);
}
let analyser = null, audioContext = null, audioSource = null, audioSamples = null;
function audioEnergy() { if (!analyser || !audioSamples)
    return 0; analyser.getFloatTimeDomainData(audioSamples); let sum = 0; for (const n of audioSamples)
    sum += n * n; return Math.min(1, Math.sqrt(sum / audioSamples.length) * 8); }
let live = new LiveNetwork(renderNetwork, activeFriend ? new Brain(activeFriend.brain) : undefined, audioEnergy);
function stopAudioAnalysis() { audioSource?.disconnect(); audioSource = null; analyser?.disconnect(); analyser = null; audioSamples = null; const old = audioContext; audioContext = null; if (old)
    void old.close().catch(() => { }); }
function setInput() { const source = element('input-source').value; live.setSource(source, element('demo-context').value || 'Usuário ocupado'); element('demo-context').hidden = source !== 'demo'; element('teach').disabled = source !== 'demo'; }
element('input-source').onchange = setInput;
element('demo-context').onchange = setInput;
element('network-toggle').onclick = () => { if (activeFriend)
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
element('reward-good').onclick = () => learning(() => live.feedback(1));
element('reward-bad').onclick = () => learning(() => live.feedback(-1));
element('teach').onclick = () => learning(() => live.teach(Number(element('teach-target').value)));
function persistFriend() { if (friends && activeFriend)
    friends.save(live.brain.snapshot(), messages); }
function cancelFriendForms() { pendingDelete = null; element('friend-create-form').hidden = true; element('friend-delete-confirm').hidden = true; }
function renderFriends() {
    element('friend-current').textContent = (activeFriend?.name ?? 'Nenhum amigo') + ' ⌄';
    element('friend-delete').disabled = !activeFriend;
    element('friend-create').disabled = !friends;
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
    addMessage(message.text, message.user); }
function suspendFriend() { microphone.stop(); live.stop(); stopAudioAnalysis(); persistFriend(); }
function changeFriend(operation) {
    try {
        suspendFriend();
        operation();
        activeFriend = friends.current();
        messages = activeFriend?.messages ?? [];
        preferences.name = activeFriend?.name ?? 'Sem amigo';
        live = new LiveNetwork(renderNetwork, activeFriend ? new Brain(activeFriend.brain) : undefined, audioEnergy);
        inspected = null;
        latest = null;
        element('input-source').value = 'idle';
        element('demo-context').hidden = true;
        element('teach').disabled = true;
        cancelFriendForms();
        applyPreferences();
        renderFriends();
        renderMessages();
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
element('friend-create').onclick = () => { cancelFriendForms(); element('friend-create-form').hidden = false; element('friend-new-name').value = ''; element('friend-new-name').focus(); };
element('friend-create-cancel').onclick = () => { cancelFriendForms(); element('friend-create').focus(); };
element('friend-create-form').addEventListener('submit', event => { event.preventDefault(); try {
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
window.addEventListener('storage', event => { if (event.key === 'companheiro.friends.v1') {
    microphone.stop();
    live.stop();
    stopAudioAnalysis();
    for (const id of ['session-toggle', 'network-toggle', 'teach', 'reward-good', 'reward-bad', 'chat-text', 'friend-create', 'friend-delete'])
        element(id).disabled = true;
    element('status').textContent = 'Amigos alterados em outra aba. Reabra esta página para continuar sem sobrescrever dados.';
} });
function addMessage(text, user) {
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
        note.textContent = 'RESPOSTA SIMULADA';
        byline.append(note);
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    message.append(byline, bubble);
    container.append(message);
    container.scrollTop = container.scrollHeight;
}
element('chat-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = element('chat-text'), text = input.value.trim();
    if (!text)
        return;
    if (!activeFriend)
        return;
    const reply = 'Estou aqui. Podemos ir uma coisa de cada vez.';
    messages.push({ user: true, text }, { user: false, text: reply });
    addMessage(text, true);
    input.value = '';
    addMessage(reply, false);
    try {
        persistFriend();
    }
    catch (error) {
        element('status').textContent = String(error);
    }
});
applyPreferences();
renderFriends();
renderMessages();
if (activeFriend)
    live.start();
else
    renderNetwork(live.snapshot());
element('status').textContent = loadError || friends?.migration || '';
const microphone = new MicrophoneSession(async () => {
    if (!navigator.mediaDevices?.getUserMedia)
        throw Error('Captura de microfone indisponível. Abra esta página em localhost ou HTTPS em um navegador compatível.');
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}, (state, error) => {
    const button = element('session-toggle');
    button.textContent = state === 'active' ? 'Encerrar' : state === 'starting' ? 'Cancelar' : 'Iniciar companheiro';
    element('mic-status').textContent = state === 'active' ? 'Microfone ativo' : state === 'starting' ? 'Aguardando permissão…' : 'Desligado';
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
        if (state === 'off')
            live.stop();
    }
    element('mic-note').textContent = state === 'active' ? 'Captura local ativa nesta aba. Sem gravação, envio ou reconhecimento de voz.' : 'Microfone local. Sem gravação, envio ou reconhecimento de voz.';
});
element('session-toggle').onclick = () => {
    if (!activeFriend)
        return;
    const friendAtStart = activeFriend.id;
    if (microphone.state === 'off') {
        live.start();
        void microphone.start().then(() => {
            const stream = microphone.getStream();
            if (!stream || activeFriend?.id !== friendAtStart)
                return;
            try {
                audioContext = new AudioContext();
                audioSource = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;
                audioSamples = new Float32Array(512);
                audioSource.connect(analyser);
                const created = audioContext;
                void audioContext.resume().catch(() => { if (audioContext !== created)
                    return; element('status').textContent = 'Análise de energia indisponível. A rede continua com entrada fixa.'; stopAudioAnalysis(); element('input-source').value = 'idle'; live.setSource('idle'); });
                const option = element('input-source').querySelector('option[value="audio"]');
                if (option)
                    option.disabled = false;
                element('input-source').value = 'audio';
                setInput();
            }
            catch {
                stopAudioAnalysis();
                element('status').textContent = 'Análise de energia indisponível. A captura está ativa, sem interpretação de fala.';
            }
        });
    }
    else
        microphone.stop();
};
window.addEventListener('pagehide', () => { microphone.stop(); live.stop(); stopAudioAnalysis(); try {
    persistFriend();
}
catch { } });
window.addEventListener('beforeunload', () => { microphone.stop(); live.stop(); stopAudioAnalysis(); try {
    persistFriend();
}
catch { } });
