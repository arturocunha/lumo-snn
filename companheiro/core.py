"""SNN LIF pequena: disparos discretos e plasticidade por elegibilidade/recompensa."""
import json
import math
import os
from pathlib import Path
import random
import re
import tempfile

ACTIONS = ('aguardar', 'perguntar', 'propor_url')
FEATURES = ('viés', 'conversa', 'página relevante', 'ocupado', 'pedido de ajuda', 'silêncio')
CONTEXTS = {
    'Conversa com página relevante': [1, 1, 1, 0, .5, 0],
    'Usuário ocupado': [1, 0, 0, 1, 0, 0],
    'Pedido de ajuda': [1, 1, 0, 0, 1, 0],
    'Sem atividade informada': [1, 0, 0, 0, 0, 1],
}

class Brain:
    def __init__(self, seed=7):
        rng = random.Random(seed)
        self.weights = [[rng.uniform(.08, .28) for _ in FEATURES] for _ in ACTIONS]
        self.evidence = {}  # feedback real; exemplos de ensino não contam como êxito
        self.updates = 0
        self.pending = None

    def run(self, features):
        if len(features) != len(FEATURES) or any(not math.isfinite(x) or not 0 <= x <= 1 for x in features):
            raise ValueError('Contexto inválido')
        voltage, counts = [0.] * 3, [0] * 3
        pre_trace = [0.] * 6
        eligibility = [[0.] * 6 for _ in ACTIONS]
        raster = []
        # Codificação por frequência determinística; nenhum sorteio escolhe a ação.
        phase = [0.] * 6
        for tick in range(80):
            inputs = []
            for i, rate in enumerate(features):
                phase[i] += rate
                spike = int(phase[i] >= 1)
                phase[i] -= spike
                inputs.append(spike)
                pre_trace[i] = .8 * pre_trace[i] + spike
            fired = []
            for j, row in enumerate(self.weights):
                voltage[j] = .85 * voltage[j] + sum(w * s for w, s in zip(row, inputs))
                if voltage[j] >= 1.:
                    counts[j] += 1
                    voltage[j] = 0.  # reset do neurônio LIF
                    fired.append(j)
                    for i in range(6):
                        eligibility[j][i] += pre_trace[i]
            raster.append(fired)
        scores = [counts[j] + voltage[j] for j in range(3)]
        choice = max(range(3), key=lambda j: scores[j])
        return dict(choice=choice, spikes=counts, scores=scores, raster=raster,
                    eligibility=eligibility, features=list(features))

    def decide(self, context):
        result = self.run(CONTEXTS[context])
        result['context'] = context
        raw = result['choice']
        others = [s for i, s in enumerate(result['scores']) if i != raw]
        margin = result['scores'][raw] - max(others)
        good, bad = self.evidence.get(context, {}).get(str(raw), [0, 0])
        reliable = good >= 3 and good / max(1, good + bad) >= .75 and margin >= 2
        # A política conservadora reduz iniciativa sem evidência, mas não pode promovê-la.
        result['effective'] = raw if raw != 2 or reliable else 1
        result['reliable'] = reliable
        result['margin'] = margin
        self.pending = result
        return result

    def _plasticity(self, result, target, reward):
        trace = result['eligibility'][target]
        # Ensino força disparos pós-sinápticos se o alvo ainda estiver silencioso.
        if not any(trace):
            trace = result['features']
        scale = max(max(trace), 1e-9)
        for i, value in enumerate(trace):
            self.weights[target][i] = min(1., max(0., self.weights[target][i] + .075 * reward * value / scale))
        self.updates += 1

    def feedback(self, reward):
        if self.pending is None or reward not in (-1, 1):
            raise ValueError('Faça uma nova avaliação antes de dar feedback')
        result = self.pending
        # Feedback avalia a escolha bruta, exibida explicitamente na interface.
        target = result['choice']
        self._plasticity(result, target, reward)
        record = self.evidence.setdefault(result['context'], {}).setdefault(str(target), [0, 0])
        record[0 if reward > 0 else 1] += 1
        self.pending = None

    def teach(self, context, target):
        if target not in range(3):
            raise ValueError('Ação inválida')
        self._plasticity(self.run(CONTEXTS[context]), target, 1)
        self.pending = None

    def save(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        data = dict(version=1, weights=self.weights, evidence=self.evidence, updates=self.updates)
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.perfil-')
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump(data, stream, ensure_ascii=False)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @classmethod
    def load(cls, path):
        brain = cls()
        if not Path(path).exists():
            return brain
        data = json.loads(Path(path).read_text())
        if not isinstance(data, dict):
            raise ValueError('Perfil deve ser um objeto')
        weights = data['weights']
        if data.get('version') != 1 or len(weights) != 3 or any(len(row) != 6 for row in weights):
            raise ValueError('Formato de perfil inválido')
        if any(not isinstance(w, (int, float)) or not math.isfinite(w) or not 0 <= w <= 1 for row in weights for w in row):
            raise ValueError('Pesos inválidos')
        evidence = data['evidence']
        if not isinstance(evidence, dict):
            raise ValueError('Evidências inválidas')
        for context, actions in evidence.items():
            if context not in CONTEXTS or not isinstance(actions, dict):
                raise ValueError('Contexto salvo inválido')
            for action, counts in actions.items():
                if action not in ('0', '1', '2') or not isinstance(counts, list) or len(counts) != 2 or any(type(n) is not int or n < 0 for n in counts):
                    raise ValueError('Feedback salvo inválido')
        if type(data['updates']) is not int or data['updates'] < 0:
            raise ValueError('Contagem inválida')
        brain.weights, brain.evidence, brain.updates = weights, evidence, data['updates']
        return brain


def profile_path(name, root=None):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,40}', name):
        raise ValueError('Perfil: use 1–40 letras sem acentos, números, _ ou -')
    base = Path(root) if root else Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'companheiro-snn'
    return base / name / 'brain.json'
