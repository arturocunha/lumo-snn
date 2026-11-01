"""Experimento reproduzível em memória. Não acessa desktop, rede ou perfis."""
from companheiro.core import Brain, ACTIONS

brain = Brain()
context = 'Conversa com página relevante'
def show(label):
    r = brain.decide(context)
    print(f'{label}: SNN={ACTIONS[r["choice"]]}, política={ACTIONS[r["effective"]]}, disparos={r["spikes"]}, margem={r["margin"]:.2f}')
show('Inicial')
for _ in range(8):
    brain.teach(context, 2)
show('Após 8 exemplos de propor_url, ainda sem evidência')
for _ in range(3):
    brain.decide(context)
    brain.feedback(1)
show('Após 3 avaliações positivas da escolha bruta')
print('Nenhuma URL aberta. Confirmação humana continua obrigatória na interface.')
