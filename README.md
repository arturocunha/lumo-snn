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

**Pesos e feedback desta interface vivem somente na sessão da aba.** Recarregar começa outra rede; não lê nem sobrescreve os perfis Python existentes. Nome e tema continuam no armazenamento local do navegador.

## Microfone

**Iniciar companheiro** pede permissão apenas após o clique. Com permissão, um `AnalyserNode` mede RMS real das amostras locais (janela de 512 amostras, ganho 8 limitado a [0,1]) e fornece uma entrada simples de energia. As outras entradas sem informação permanecem zeradas, exceto a presença fixa. Não há interpretação de fala, transcrição ou detecção de nome. O rótulo do gráfico muda para **Energia do áudio**; isso não significa compreensão de relevância ou linguagem. É uma pequena rede experimental que compartilha os pesos entre fontes, sem garantia de generalização.

**Encerrar** para tracks, desconecta os nós de áudio, fecha o `AudioContext` e pausa a rede. Sair/recarregar também limpa os recursos. Cancelar durante o pedido de permissão invalida a sessão e fecha qualquer stream tardio; o navegador pode manter seu próprio prompt aberto. Falha, desconexão ou permissão negada deixam uma mensagem e param a sessão. A rede pode ser retomada separadamente com entrada fixa. O microfone nunca é ligado automaticamente.

Não há gravação, armazenamento, envio ou reprodução de áudio. O contexto de áudio não se conecta aos alto-falantes. Se a análise de energia não estiver disponível, a captura fica identificada e a rede permanece com entrada fixa. Não é um serviço Ubuntu após fechar a aba.

## Limites e desenvolvimento

A conversa opcional ainda usa respostas fixas identificadas. A visualização representa o estado de uma rede pequena, não pensamentos humanos ou raciocínio de um modelo. Não foram adicionados shell, ferramentas Ubuntu, provedor de linguagem ou empacotamento desktop.

- `src/core.ts`: integrador LIF, decisão e plasticidade.
- `src/live.ts`: janelas incrementais e ciclo de atualização.
- `src/ui.ts`: visualização e ligação com o áudio.
- `src/preview.ts`: preferências e ciclo de captura.
- `ui/`: estrutura e estilos preservados.
- `scripts/build.mjs`: compilação e bundle local sem dependências de terceiros.

`npm run build` usa o TypeScript instalado com o VS Code, ou `TYPESCRIPT_PATH`. `npm test` verifica equivalência entre integrador incremental e núcleo, eventos/potenciais, escolha, energia, ensino/feedback e mudança de pesos, timers, menu/preferências e limpeza do microfone com mocks. Não ativa o microfone real. Hardware, permissão real e apresentação visual precisam de conferência pelo usuário.

`companheiro/` e `README-python.md` preservam a versão anterior. `src/main.ts` e `src/pet.ts` continuam como integração desktop pausada, não usada pela interface web. Git exclusivamente local.
