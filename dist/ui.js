import { LiveNetwork } from './live.js';
import { Brain } from './core.js';
import { FriendsStore, maxFriends, friendsLimitMessage } from './friends.js';
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
