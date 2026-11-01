/** Catálogo limitado de efeitos locais. Nada aqui interpreta fala ou chama modelos. */
export const baseActionIds = ['ouvir', 'perguntar', 'tirar_duvidas', 'fazer'];
export const maxCustomSkills = 12;
export function validateSkills(value) {
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
export function compilePlan(plan, catalog, ancestors = new Set()) {
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
export function basePlan(index, audioActive = false) {
    if (index === 0)
        return audioActive ? { kind: 'observe_audio', ms: 1000 } : { kind: 'prompt', text: 'Para ouvir áudio local, inicie o amigo e permita o microfone.' };
    if (index === 1)
        return { kind: 'prompt', text: 'Você gostaria de acrescentar alguma informação?' };
    if (index === 2)
        return { kind: 'prompt', text: 'O que preciso saber para ajudar? Ainda não interpreto a conversa sem um modelo conectado.' };
    return { kind: 'prompt', text: 'O que você quer fazer? Não há ferramenta geral conectada. Você pode ensinar uma combinação de capacidades locais.' };
}
export class SkillExecutor {
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
