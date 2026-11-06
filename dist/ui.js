import { VoiceSegmenter } from './voice.js';
import { TextConversation, conversationHistory, applyTurnFeedback } from './conversation.js';
import { recurrence } from './reservoir.js';
import { SkillExecutor, compilePlan, basePlan, validateSkills } from './skills.js';
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
