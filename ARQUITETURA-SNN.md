# Núcleo recorrente e habilidades por amigo — revisão 0.4

Esta é uma arquitetura implementada e verificável para continuar o produto, não um companheiro completo ou prova de inteligência geral.

## Contagem e participação

Sem habilidades extras há **196 neurônios LIF simulados: 192 internos recorrentes e 4 de saída**. Há ainda **6 canais de entrada codificados em pulsos**, que não são LIF e não entram nessa contagem. A versão anterior exibia seis entradas e três saídas (nove elementos visuais), mas só três eram neurônios LIF.

Cada habilidade criada acrescenta um neurônio de saída e suas conexões reais. Limite atual: 12 habilidades ensinadas por amigo, além das quatro intenções, ou **208 LIF no máximo**. Não há neurônios decorativos nem crescimento automático da camada interna.

As intenções iniciais são **Ouvir, Perguntar, Tirar dúvidas e Fazer**. São opções da política; não provas de ferramentas prontas. Ouvir só observa energia de um microfone já permitido, ou pede que ele seja iniciado. Perguntar mostra uma solicitação local. Tirar dúvidas pede informação que falta. Fazer pede uma definição/ferramenta, sem executar comandos gerais. Não há compreensão semântica, reconhecimento de fala, LLM, pesquisa conectada ou acesso geral ao Ubuntu.

## Dinâmica real

`reservoir.ts` implementa 192 LIF com vazamento 0,9, limiar 1, reset zero, refratário de dois passos e corrente tônica 0,025. São 1152 projeções fixas dos seis canais e 1536 conexões recorrentes esparsas (oito por unidade, sem autoaresta), com sinal inibitório em fontes cujo índice é múltiplo de quatro. Topologia e pesos fixos usam semente 31. A recorrência usa disparos do passo anterior. Não há sorteio na decisão nem no fluxo neural ao vivo.

Cada saída LIF recebe **leitura plástica das 192 unidades internas** e um ramo contextual plástico direto dos seis canais. A corrente é `0,6 × soma contextual + 3 × soma da leitura interna / 192`; as saídas usam vazamento 0,85, limiar 1 e reset. Logo, a camada interna altera efetivamente os disparos e as escolhas, em vez de ser um desenho paralelo.

O núcleo roda um passo a cada 20 ms, e a visualização recebe snapshots em outro timer a cada 100 ms. Os passos são tempo de simulação, não uma equivalência biológica validada; o navegador pode atrasá-los em segundo plano. A decisão usa uma janela de 80 passos: vence a saída com mais disparos + potencial residual. Os acumuladores e potenciais de saída reiniciam por janela; o estado interno recorrente continua entre janelas.

O canvas mostra **todos os 192 internos**, com potencial/disparo do último passo amostrado. Nem todo evento de 50 Hz vira um flash a 10 Hz; todos contam no cálculo. Passe o mouse, ou use as setas com o canvas focado, para inspecionar um interno e suas oito conexões reais. O SVG mostra todos os canais e saídas e as conexões do ramo contextual. A inspeção de saída informa potenciais, disparos e valores da leitura interna. Isso é telemetria, não pensamentos ou todo raciocínio de um modelo.

## O que aprende

A recorrência e a projeção de entrada são **fixas**. Aprendem os pesos contexto→saída e interno→saída, com traços de elegibilidade acumulados nos disparos pós-sinápticos. Feedback ±1 modula os traços com passos máximos 0,075 e 0,10 respectivamente, limitando pesos a [0,1]. Ensino por exemplo força o reforço da saída escolhida; se ela estiver silenciosa, usa atividade pré-sináptica como alvo supervisionado. Não se afirma plasticidade em todas as conexões.

A rede pode escolher qualquer habilidade cadastrada, não apenas uma das quatro intenções. Ensino e feedback alteram essa competição e ficam separados por amigo. A política conservadora pode reduzir Fazer ou uma habilidade nova para Perguntar até haver três aprovações, proporção positiva ≥75% e margem ≥2. A tela distingue escolha da rede e saída após política. A execução nesta revisão exige revisão/clique do usuário, inclusive quando há evidência suficiente; não há execução autônoma.

## Composição e execução

Em **Habilidades → Ensinar uma combinação**, o usuário nomeia uma habilidade e compõe até oito etapas no formulário, em sequência ou paralelismo. Blocos locais disponíveis: aguardar, mostrar texto, pedir informação, mostrar proposta de pesquisa sem pesquisar e observar energia de áudio já ativo. Habilidades salvas podem ser referenciadas por outras.

O compilador valida a expansão completa: até 24 nós, profundidade 6, durações de 100 a 10000 ms por espera/observação e no máximo 30 s por plano. Rejeita referências ausentes, ciclos, capacidades desconhecidas e paralelismo que dispute áudio ou saída de texto. Paralelismo compatível usa tarefas concorrentes reais; por exemplo, energia de áudio pode ser observada enquanto um texto local é mostrado. Não há captura de áudio implícita, shell, URL automática ou chamadas externas.

A escolha da SNN pode ser revisada e executada por um botão. Cancelar aborta esperas e etapas pendentes; efeitos já mostrados não são desfeitos. Trocar/apagar amigo, encerrar ou sair da página cancela execução e recursos de áudio/rede. As saídas de texto locais são identificadas como ações locais, separadas das respostas simuladas da conversa. Feedback continua avaliando a escolha exibida, não é inferido automaticamente do resultado da ferramenta.

**Não há gerador de novas combinações nesta entrega.** As combinações são ensinadas explicitamente; não são apresentadas como descoberta emergente. Conversar em linguagem livre ainda não ensina habilidades.

## Estado, migração e isolamento

A chave existente `companheiro.friends.v1` permanece, com schema da coleção versão 3 e schema neural versão 4. Conserva identificadores, nomes, mensagens, tema, avaliações e habilidades por amigo. Novos pesos de leitura, configuração e estado interno (potenciais, disparos, refratários) são isolados e persistidos. Traces de uma janela/feedback pendente não são retomados após recarregar; uma nova janela de decisão começa.

Antes da transformação, o JSON original é copiado em `companheiro.backup.before-reservoir.v1` e, quando ainda ausente, em `companheiro.backup.before-skills.v1`. Coleções inválidas bloqueiam abertura sem substituição silenciosa. Exclusão confirmada remove somente o amigo alvo, inclusive de cópias de migração que o contenham. Permanecem as proteções contra gravação de outra aba e o limite de três amigos.

Na transformação antiga de três saídas, as linhas contexto→saída antigas 0 e 1 são mantidas nas posições 0 e 1, a antiga linha 2 vai para a posição 3, e Tirar dúvidas recebe nova linha 0,12 na posição 2. Evidências numéricas são remapeadas da mesma forma. Isso preserva os **números e sua proveniência**, não uma equivalência semântica entre “aguardar” e “ouvir” ou entre “sugerir página” e “fazer”. A leitura interna começa com pesos determinísticos novos, e o ramo contextual passa a ter fator 0,6. **O comportamento não é idêntico ao legado.** O original fica disponível na cópia local para revisão/recuperação, sem sobrescrever arquivos Python.

## Evidência e custo medido

Os testes incluem recorrência determinística; participação de todos os 192 internos; estabilidade com todos os canais ativos; memória temporal; influência demonstrável da leitura interna na escolha; ensino/feedback mudando uma habilidade nova; retenção após serializar e uma perturbação simples de entrada (pedido de ajuda 1→0,9); migração/isolamento; composição; paralelismo/cancelamento e limpeza de timers. O exemplo de retenção é um teste pequeno, não benchmark de generalização ampla ou inteligência.

`node --expose-gc scripts/benchmark.mjs` mediu nesta máquina 10000 passos do núcleo em **641,51 ms (4 saídas)** e **699,61 ms (16 saídas)**. O fluxo da interface pede 50 passos/s; a medição isolada ficou em aproximadamente 14–15 mil passos/s. Fração média de disparos internos no cenário foi 0,17509 por unidade/passo. Em outro teste de excitação máxima, nenhum neurônio excedeu o limite coerente com refratariedade.

[BENCHMARK.json](BENCHMARK.json) registra as medições brutas, incluindo deltas de heap após GC. Esses deltas variam com aquecimento/coleta (inclusive podem ser negativos), não representam RAM total do produto. Os JSONs neurais medidos tinham aproximadamente 17 e 29 KiB. Não foi medida a RAM total do navegador, áudio, DOM ou aplicativo. Nenhum download/modelo/GPU foi adicionado.
