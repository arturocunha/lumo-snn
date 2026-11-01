# Companheiro — SNN local ao vivo

Interface TypeScript no navegador, no mesmo visual aprovado. **SNN real conectada; modelo de conversa desconectado.** Não executa ações no computador.

## Abrir

**http://127.0.0.1:4173**

Nesta pasta: `npm run preview`. Para parar o servidor: `Ctrl+C`. Node.js serve somente em `127.0.0.1`; não há CDN, dependências npm adicionais ou modelo externo.

## Observar e aprender

A rede começa a funcionar ao abrir a página, com a entrada fixa **sem atividade informada**, explicitamente identificada. Isso não significa que observa seu computador. **Pausar rede** interrompe seu timer; **Retomar rede** volta a executá-lo. Não é necessário permitir microfone para ver a SNN.

O gráfico mostra seis entradas codificadas por frequência, três neurônios LIF de saída e suas 18 conexões. Brilho indica um disparo real no último passo mostrado; o arco de cada saída indica potencial residual após eventual reset. Passe o mouse ou foque o neurônio para ver potencial, valor antes do reset e contagem. A espessura das conexões corresponde aos pesos atuais. A escolha mostrada é o vencedor real por disparos + potencial residual. Nos detalhes também aparece a saída após a política conservadora; nenhuma delas executa ferramentas.

O mesmo integrador implementa `Brain.run` e a simulação incremental da visualização. São cinco passos por atualização a cada 100 ms, 80 passos por janela (aproximadamente 1,6 s). Cada janela reinicia os potenciais, preservando os pesos. O gráfico amostra o último passo de cada lote; nem todos os disparos são visíveis como flashes, mas todos contam para a decisão e a plasticidade. Sem aleatoriedade nas entradas ou decisões. O navegador pode reduzir a frequência em abas em segundo plano.

**＋ / −** avaliam a escolha bruta exibida. O feedback usa a elegibilidade acumulada nos disparos para modificar os pesos. Depois dele, uma nova janela começa. Para verificar uma mudança controlada, abra **Detalhes da rede**, escolha **Demonstração explícita**, selecione uma situação e a ação a ensinar, e pressione **Ensinar exemplo** algumas vezes. Veja os pesos e a próxima escolha mudarem. Os exemplos são entradas sintéticas identificadas; a integração, os disparos, a atualização de pesos e a decisão são calculados de verdade. Ensino não fabrica evidências positivas.

## Amigos independentes

No menu, **AMIGO ATUAL** abre a lista, **Criar novo amigo** e **Apagar amigo**. É possível ter até três amigos; para criar outro, apague um dos existentes. Dados antigos com mais de três são preservados e bloqueiam novas criações até haver vaga. Cada amigo tem identificador próprio, nome, pesos, avaliações de aprendizado e conversa local separados. A gravação ocorre após feedback, ensino, mensagens e antes de trocar/fechar. Selecionar ou reabrir restaura esses dados; os potenciais instantâneos e a janela de disparos recomeçam. Trocar/criar/apagar encerra microfone, analisador e timer; o amigo selecionado fica pausado até você iniciar ou retomar a rede.

Apagar pede confirmação com o nome e aviso de perda definitiva do aprendizado e da conversa. Cancelar não muda dados. O último amigo apagado deixa a lista vazia, até você criar outro; não é recriado automaticamente. O tema é global e não é apagado. Se houver cópia legada importada daquele amigo, a exclusão remove também essa cópia de aprendizado/conversa.

Os amigos usam a chave versionada `companheiro.friends.v1` no localStorage deste endereço/navegador. Nenhum dado é exportado ou enviado ao servidor. Limpar dados do site perde os amigos. Falhas de quota e dados corrompidos são informados e não substituem silenciosamente o conteúdo salvo. Uma alteração detectada em outra aba interrompe a sessão; a revisão também é conferida antes de gravar, para evitar sobrescritas comuns. Não há sincronização ou transação distribuída entre abas simultâneas.

**Antes de atualizar uma aba da versão anterior:** veja [MIGRAR-AMIGO-ATUAL.md](MIGRAR-AMIGO-ATUAL.md). O aprendizado antigo existia apenas em memória; precisa de uma transferência local explícita antes de recarregar. O nome/tema já salvos são migrados e preservados. Os dados Python em disco nunca são acessados ou substituídos.

## Microfone

**Iniciar companheiro** pede permissão apenas após o clique. Com permissão, um `AnalyserNode` mede RMS real das amostras locais (janela de 512 amostras, ganho 8 limitado a [0,1]) e fornece uma entrada simples de energia. As outras entradas sem informação permanecem zeradas, exceto a presença fixa. Não há interpretação de fala, transcrição ou detecção de nome. O rótulo do gráfico muda para **Energia do áudio**; isso não significa compreensão de relevância ou linguagem. É uma pequena rede experimental que compartilha os pesos entre fontes, sem garantia de generalização.

**Encerrar** para tracks, desconecta os nós de áudio, fecha o `AudioContext` e pausa a rede. Sair/recarregar também limpa os recursos. Cancelar durante o pedido de permissão invalida a sessão e fecha qualquer stream tardio; o navegador pode manter seu próprio prompt aberto. Falha, desconexão ou permissão negada deixam uma mensagem e param a sessão. A rede pode ser retomada separadamente com entrada fixa. O microfone nunca é ligado automaticamente.

Não há gravação, armazenamento, envio ou reprodução de áudio. O contexto de áudio não se conecta aos alto-falantes. Se a análise de energia não estiver disponível, a captura fica identificada e a rede permanece com entrada fixa. Não é um serviço Ubuntu após fechar a aba.

## Limites e desenvolvimento

A conversa opcional ainda usa respostas fixas identificadas. A visualização representa o estado de uma rede pequena, não pensamentos humanos ou raciocínio de um modelo. Não foram adicionados shell, ferramentas Ubuntu, provedor de linguagem ou empacotamento desktop.

- `src/core.ts`: integrador LIF, decisão e plasticidade.
- `src/friends.ts`: persistência versionada, migração e isolamento dos amigos.
- `src/live.ts`: janelas incrementais e ciclo de atualização.
- `src/ui.ts`: visualização e ligação com o áudio.
- `src/preview.ts`: preferências e ciclo de captura.
- `ui/`: estrutura e estilos preservados.
- `scripts/build.mjs`: compilação e bundle local sem dependências de terceiros.

`npm run build` usa o TypeScript instalado com o VS Code, ou `TYPESCRIPT_PATH`. `npm test` verifica equivalência entre integrador incremental e núcleo, eventos/potenciais, escolha, energia, ensino/feedback e mudança de pesos, timers, menu/preferências, criar/selecionar/apagar amigos, migração, isolamento, recarga, falhas de armazenamento e limpeza do microfone ao trocar, com mocks. Não ativa o microfone real. Hardware, permissão real e apresentação visual precisam de conferência pelo usuário.

`companheiro/` e `README-python.md` preservam a versão anterior. `src/main.ts` e `src/pet.ts` continuam como integração desktop pausada, não usada pela interface web. Git exclusivamente local.
