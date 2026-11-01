"""Contrato de integração futura. Não contém provedor, chave ou modelo local."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Proposal:
    text: str
    url: str | None = None
    source: str = 'demonstração roteirizada'

class DemoModel:
    connected = False
    def propose(self, context, url):
        return Proposal('Exemplo fixo: esta página poderia ilustrar a conversa. A SNN decide a iniciativa.', url)
