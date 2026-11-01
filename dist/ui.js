"use strict";
const element = (id) => document.getElementById(id);
const labels = ['Aguardar', 'Perguntar', 'Propor uma página'];
function post(type, payload = {}) { window.webkit.messageHandlers.desktop.postMessage(JSON.stringify({ type, ...payload })); }
element('pet').onclick = () => post('pet');
element('evaluate').onclick = () => post('evaluate', { url: element('url').value });
element('context').onchange = () => post('context', { context: element('context').value });
element('good').onclick = () => post('feedback', { reward: 1 });
element('bad').onclick = () => post('feedback', { reward: -1 });
element('teach').onclick = () => post('teach', { target: Number(element('target').value) });
element('open').onclick = () => post('open');
function svg(tag, attrs, text) { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, String(value)); if (text)
    node.textContent = text; return node; }
window.receiveState = (state) => {
    element('profile').textContent = state.profile;
    element('updates').textContent = String(state.updates);
    element('status').textContent = state.feedback;
    element('error').hidden = !state.error;
    element('error').textContent = state.error;
    const select = element('context');
    if (!select.options.length)
        for (const label of state.contexts) {
            const option = new Option(label, label);
            select.add(option);
        }
    select.value = state.context;
    element('pet').textContent = state.pet ? 'Ocultar personagem ↙' : 'Mostrar personagem ↗';
    const d = state.decision;
    element('feedback').hidden = !d;
    element('open').hidden = !d || d.effective !== 2;
    element('choice').textContent = d ? ['Vou aguardar', 'Posso ajudar com isso?', 'Uma página pode ajudar'][d.effective] : 'Pronto para observar';
    element('raw').textContent = d ? labels[d.choice] : 'Ainda não avaliada';
    element('decision-icon').textContent = d ? ['◌', '?', '↗'][d.effective] : '◌';
    element('explanation').textContent = d ? (d.choice !== d.effective ? 'A rede propôs agir. Ainda precisa de mais avaliações antes de tomar essa iniciativa.' : ['Este é um momento para dar espaço.', 'Uma pergunta antes de dar o próximo passo.', 'Você decide se quer abrir a página sugerida.'][d.effective]) : 'O companheiro só avalia a situação quando você pede.';
    const network = element('network');
    network.replaceChildren();
    const names = ['Presença', 'Conversa', 'Página relevante', 'Ocupado', 'Pedido de ajuda', 'Silêncio'];
    state.weights.forEach((row, j) => row.forEach((w, i) => network.append(svg('line', { x1: 170, y1: 20 + i * 32, x2: 595, y2: 40 + j * 65, stroke: '#c3ceb7', 'stroke-width': .5 + w * 4, opacity: .3 + w * .6 }))));
    names.forEach((name, i) => { network.append(svg('text', { x: 0, y: 24 + i * 32 }, name)); network.append(svg('circle', { cx: 170, cy: 20 + i * 32, r: 5, fill: '#a4b88e' })); });
    labels.forEach((name, j) => { network.append(svg('circle', { cx: 595, cy: 40 + j * 65, r: 9, fill: d?.choice === j ? '#a392c0' : '#d6cce3', stroke: '#fff', 'stroke-width': 3 })); network.append(svg('text', { x: 620, y: 44 + j * 65 }, name)); });
    const raster = element('raster');
    raster.replaceChildren();
    if (d) {
        d.raster.forEach((fired, t) => fired.forEach(j => raster.append(svg('line', { x1: 170 + t * 7, y1: 12 + j * 28, x2: 170 + t * 7, y2: 25 + j * 28, stroke: '#8f9f7b', 'stroke-width': 2 }))));
        labels.forEach((label, j) => raster.append(svg('text', { x: 0, y: 23 + j * 28 }, label)));
    }
    element('metrics').textContent = d ? `Disparos: ${d.spikes.join(' / ')} · Margem: ${d.margin.toFixed(2)} · Evidência suficiente: ${d.reliable ? 'sim' : 'não'}` : 'Avalie uma situação para ver os disparos.';
};
post('ready');
