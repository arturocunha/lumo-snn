# Companheiro — núcleo recorrente e habilidades

**http://127.0.0.1:4173/?v=snn-20261101-04**

Nesta pasta: `npm run preview`. O servidor atende somente localhost. `npm run build` usa o TypeScript já disponível com o VS Code; não foram instaladas dependências. `npm test` verifica a aplicação sem ativar seu microfone ou operar o desktop.

## Usar

A atividade mostra uma SNN real com **192 neurônios internos**, quatro saídas iniciais (**Ouvir, Perguntar, Tirar dúvidas, Fazer**) e seis canais numéricos. Começa com entrada fixa identificada. O microfone só é pedido por **Iniciar companheiro**, e fornece energia, sem entender fala. **Encerrar** limpa áudio, execução e timers.

Abra **Habilidades → Ensinar uma combinação**. Dê um nome, adicione blocos locais e escolha sequência ou paralelo. Salve. Para ensinar quando usar, em **Detalhes da rede** escolha uma **Demonstração explícita**, selecione sua habilidade e pressione **Ensinar exemplo** algumas vezes. Ela ganha uma saída real na rede e pode vencer a competição. Avalie com ＋/−. **Revisar habilidade** mostra o plano antes de **Executar localmente**; Cancelar interrompe etapas pendentes.

Combinações usam somente efeitos locais disponíveis; propostas de pesquisa não pesquisam. Fazer pede esclarecimento se não houver capacidade conectada. Conversa ainda usa respostas simuladas. Não há compreensão de fala, modelo, geração automática de combinações ou controle geral Ubuntu.

Amigos continuam independentes (máximo três), com nome no alto e gestão abaixo no menu. Pesos, estado interno, habilidades e conversa são salvos localmente por amigo. A migração faz cópia do estado anterior e preserva seus números; **não promete comportamento idêntico**, pois a arquitetura e os significados das intenções mudaram.

[Arquitetura, contagens, migração e evidências](ARQUITETURA-SNN.md) · [Medição do núcleo em Node](BENCHMARK.json).

A versão Python e seu histórico continuam preservados; nenhum arquivo pessoal foi removido e nada foi publicado no GitHub.
