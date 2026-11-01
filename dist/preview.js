"use strict";
/** Adaptador exclusivamente visual: não importa Brain, não persiste nem executa ações. */
const demoContexts = ['Conversa com página relevante', 'Usuário ocupado', 'Pedido de ajuda', 'Sem atividade informada'];
const demoState = { profile: 'primeiro', context: demoContexts[0], contexts: demoContexts, url: 'https://www.python.org/', decision: null, weights: [[.25, .18, .12, .33, .21, .4], [.14, .35, .21, .2, .42, .18], [.22, .3, .4, .12, .26, .09]], updates: 0, pet: true, feedback: 'Prévia visual: conversa e atividade simuladas. Nada é salvo.', error: '' };
function toast(text) { document.querySelector('.preview-toast')?.remove(); const node = document.createElement('div'); node.className = 'preview-toast'; node.textContent = text; node.setAttribute('role', 'status'); document.body.append(node); setTimeout(() => node.remove(), 3500); }
window.webkit = { messageHandlers: { desktop: { postMessage(text) {
                const message = JSON.parse(text);
                switch (message.type) {
                    case 'context':
                        demoState.context = message.context;
                        demoState.decision = null;
                        break;
                    case 'evaluate': {
                        const choice = demoState.context === 'Usuário ocupado' ? 0 : demoState.context === 'Pedido de ajuda' ? 1 : 2;
                        demoState.decision = { choice, effective: choice === 2 ? 1 : choice, spikes: [24, 37, 29], raster: Array.from({ length: 80 }, (_, t) => [0, 1, 2].filter(j => (t + j) % [3, 2, 4][j] === 0)), margin: 4.2, reliable: false };
                        demoState.feedback = 'Exemplo ilustrativo de uma decisão. A SNN não está ligada nesta prévia.';
                        break;
                    }
                    case 'feedback':
                        demoState.decision = null;
                        demoState.feedback = 'Feedback de teste recebido. Nenhum aprendizado ou gravação nesta prévia.';
                        toast('Assim será a avaliação de uma escolha. Nada foi salvo.');
                        break;
                    case 'teach':
                        demoState.feedback = 'Controle de exemplo: o aprendizado será integrado depois da aprovação visual.';
                        toast('Prévia do controle. Nenhum peso foi alterado.');
                        break;
                    case 'pet':
                        demoState.pet = !demoState.pet;
                        document.querySelector('.hero-art')?.classList.toggle('hidden-pet', !demoState.pet);
                        toast('Na versão desktop, este controle mostrará ou ocultará o personagem.');
                        break;
                    case 'open':
                        toast('Esta prévia não abre páginas.');
                        break;
                }
                window.receiveState(demoState);
                const button = document.getElementById('pet');
                if (button)
                    button.textContent = demoState.pet ? 'Ocultar prévia do personagem ↙' : 'Mostrar prévia do personagem ↗';
            } } } };
document.getElementById('chat-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('chat-text');
    const text = input.value.trim();
    if (!text)
        return;
    const container = document.getElementById('messages');
    const user = document.createElement('div');
    user.className = 'message user';
    const bubble = document.createElement('div');
    bubble.textContent = text;
    user.append(bubble);
    container.append(user);
    input.value = '';
    const response = document.createElement('div');
    response.className = 'message companion';
    const avatar = document.createElement('span');
    avatar.className = 'chat-avatar';
    avatar.textContent = '◌';
    const content = document.createElement('div');
    content.textContent = 'Estou aqui. Esta é uma resposta fixa para você experimentar o espaço da conversa.';
    const note = document.createElement('small');
    note.textContent = 'DEMONSTRAÇÃO · SEM MODELO CONECTADO';
    content.append(note);
    response.append(avatar, content);
    container.append(response);
    container.scrollTop = container.scrollHeight;
});
