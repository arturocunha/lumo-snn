import { Brain, LIFSimulation, contexts } from './core.js';
/** Mesmo integrador usado em Brain.run. Passos independem do desenho e não usam aleatoriedade. */
export class LiveNetwork {
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
