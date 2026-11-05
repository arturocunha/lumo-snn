import { validateSkills } from './skills.js';
export function validateInterpretation(value, ids) {
    const v = value;
    if (!v || !Array.isArray(v.features) || v.features.length !== 6 || v.features.some(n => !Number.isFinite(n) || n < 0 || n > 1) || !Number.isFinite(v.uncertainty) || v.uncertainty < 0 || v.uncertainty > 1 || !Array.isArray(v.suggestedIds) || v.suggestedIds.length > 3 || new Set(v.suggestedIds).size !== v.suggestedIds.length || v.suggestedIds.some(id => !ids.includes(id)) || typeof v.rationale !== 'string' || v.rationale.length > 800 || (v.replies !== undefined && (!v.replies || typeof v.replies !== 'object' || Array.isArray(v.replies) || Object.keys(v.replies).some(id => !ids.includes(id)) || ids.some(id => typeof v.replies[id] !== 'string' || !v.replies[id].trim() || v.replies[id].length > 1500))))
        throw Error('O modelo retornou um formato inválido. Nenhuma resposta foi inventada.');
    return JSON.parse(JSON.stringify(v));
}
export function textInput(model) { const input = [...model.features]; input[0] = 1; input[1] = 1; input[4] = Math.max(input[4], model.uncertainty); return input; }
export function turnTrace(id, decision, brain) {
    const j = decision.choice;
    let hidden = decision.hiddenEligibility[j];
    if (!hidden.some(Boolean))
        hidden = decision.hiddenActivity;
    let input = decision.eligibility[j];
    if (!input.some(Boolean))
        input = decision.features;
    return { id, actionId: brain.actionIds[j], context: 'Conversa textual', inputTrace: [...input], hiddenTrace: [...hidden] };
}
export function validateTurn(value, friendId, ids) {
    const turn = value, trace = turn?.trace;
    if (!turn || typeof turn.id !== 'string' || turn.id.length > 100 || !turn.id || turn.friendId !== friendId || typeof turn.model !== 'string' || turn.model.length > 200 || !Array.isArray(turn.features) || turn.features.length !== 6 || turn.features.some(n => !Number.isFinite(n) || n < 0 || n > 1) || !Number.isFinite(turn.uncertainty) || turn.uncertainty < 0 || turn.uncertainty > 1 || !Array.isArray(turn.suggestedIds) || turn.suggestedIds.some(id => !ids.includes(id)) || typeof turn.rationale !== 'string' || turn.rationale.length > 800 || !ids.includes(turn.choiceId) || !trace || trace.id !== turn.id || trace.actionId !== turn.choiceId || trace.context !== 'Conversa textual' || !Array.isArray(trace.inputTrace) || trace.inputTrace.length !== 6 || !Array.isArray(trace.hiddenTrace) || trace.hiddenTrace.length !== 192 || [...trace.inputTrace, ...trace.hiddenTrace].some(n => !Number.isFinite(n) || n < 0 || n > 10000) || (turn.feedback !== undefined && turn.feedback !== 1 && turn.feedback !== -1))
        throw Error('Interação de conversa inválida');
    return JSON.parse(JSON.stringify(turn));
}
export function applyTurnFeedback(brain, turn, reward) {
    if (turn.feedback !== undefined)
        throw Error('Esta interação já foi avaliada.');
    const target = brain.actionIds.indexOf(turn.trace.actionId);
    if (target < 0)
        throw Error('Habilidade da interação não encontrada.');
    brain.rewardTrace(target, turn.trace.inputTrace, turn.trace.hiddenTrace, reward, 'Conversa textual');
    turn.feedback = reward;
}
export class TextConversation {
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
export function conversationHistory(messages) {
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
