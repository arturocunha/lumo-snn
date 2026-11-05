# Conversa local — revisão 0.5

O ciclo foi executado com **Qwen3 0.6B Q4_K_M**, em CPU, usando **llama.cpp b12032**. Não é uma resposta fixa. Não há provedor remoto, chave de API, credencial Codex ou autenticação do navegador reaproveitada.

## Abrir e usar

Execute `npm run preview` nesta pasta e abra **http://127.0.0.1:4173/?v=conversa-20261101-05**. Na conversa, marque **Usar o modelo local para esta conversa** e envie uma mensagem. Isso não pede microfone. **Iniciar companheiro** inicia a sessão textual e carrega o modelo; também é possível enviá-la diretamente para carregar sob demanda. O microfone é opcional e tem botão separado **Ativar microfone (opcional)** no menu, sem transcrição. Permissão de áudio negada não bloqueia o texto.

O processo do modelo usa somente `127.0.0.1:4174`. O navegador se comunica com o backend local em 4173; o backend faz as chamadas de texto ao modelo. A configuração rejeita endpoints fora de loopback. O modelo não recebe áudio, arquivos, pesos neurais ou dados de outros amigos. Não há pesquisa real ou execução de ferramentas por saída do modelo.

**Encerrar**, trocar/apagar amigo ou sair da página cancelam a geração. O servidor pode descarregar seu próprio processo do modelo, e também o descarrega após dois minutos de inatividade. Fechar normalmente o servidor com Ctrl+C encerra o filho que ele iniciou. Não mata serviços alheios; se a porta estiver ocupada por outro modelo, informa o conflito. Encerramento forçado do processo por SIGKILL não oferece limpeza garantida pelo JavaScript.

## Quem faz o quê

1. O modelo local interpreta a mensagem e retorna um JSON validado: seis sinais numéricos, incerteza, sugestão de intenção e uma observação curta. A geração usa schema no formato suportado pelo llama.cpp; o backend e o frontend validam novamente.
2. Presença e mensagem textual são sinais fixados pela ocorrência real do envio; a incerteza é incorporada ao canal de ajuda. Os outros sinais são **inferências do modelo**, não sensores do computador nem compreensão linguística da SNN.
3. A **mesma SNN recorrente** mostrada na interface recebe esses sinais por 80 passos, escolhe uma intenção/habilidade e pausa a janela. A sugestão do modelo não força o vencedor.
4. Só depois disso, uma segunda chamada ao modelo formula a resposta conforme a escolha. Ouvir acolhe; Perguntar pergunta; Tirar dúvidas pede detalhes se faltarem ou esclarece uma pergunta suficiente; Fazer ajuda por texto. Uma habilidade composta é apenas proposta — não é executada automaticamente.
5. ＋ / − avaliam a decisão **daquela interação**, usando a elegibilidade dos disparos daquele turno. O registro mantém ID do amigo, ID da interação, ação escolhida e traços. Ticks posteriores não redirecionam o feedback. Uma interação aceita uma única avaliação; pesos e avaliação persistem por amigo.

A política conservadora de ferramentas permanece separada. Uma resposta informativa textual não concede execução no computador. Os detalhes mostram a interpretação/sugestão do modelo, os sinais e a escolha efetiva da rede. Interpretação e formulação são processamento do modelo; não são atribuídas à SNN.

## Histórico, limites e concorrência

O contexto enviado ao modelo contém somente mensagens de conversas reais, no máximo as últimas seis, limitadas a 3000 caracteres. Mensagens antigas da demonstração e ações locais não são tratadas como respostas reais do modelo. Cada envio tem até 2000 caracteres no backend (o campo atual limita a 500); cada resposta tem até 1500. O contexto do executor é 3072 tokens. Históricos maiores podem superar a janela em casos extremos e então o erro é exibido, sem resposta inventada.

O histórico é salvo localmente por amigo. Novos envios param ao atingir o limite de 100 mensagens, preservando o conteúdo anterior; nada é truncado silenciosamente. Arquivos Python e amigos existentes são mantidos. O modelo não é ajustado/fine-tuned por amigo: o aprendizado persistente continua sendo da política SNN, e a conversa recente é fornecida como contexto. Isso ainda não é personalidade textual completa ou memória semântica de longo prazo.

Há um pedido ativo por sessão de conversa. Clique repetido não duplica a geração. O servidor deduplica ID + fase durante dez minutos, com limite de 100 fases, sem retries automáticos. Duas inferências por mensagem são necessárias: interpretar e formular depois da SNN. A rede fica pausada para que a escolha exibida e o feedback permaneçam coerentes. Enquanto há resposta pendente, não se modifica o catálogo. Respostas atrasadas após troca/cancelamento são descartadas.

O backend mantém resultados desse cache somente em memória; não registra texto/chaves em logs. O runtime gerenciado descarta stdout/stderr. O histórico persistente fica no localStorage, sem envio externo. Limpar dados do site remove os amigos; uma resposta já emitida antes de cancelar não é desfeita.

## Instalação reproduzível e manutenção

Os arquivos já foram instalados em `work/local-model/`, fora do repositório de entrega. Somente um modelo foi baixado; não houve Ollama, CUDA, stack Python ou segundo modelo.

```bash
npm run install:model  # só se for necessário reinstalar os arquivos
npm run preview
npm test
npm run test:model    # teste REAL com mensagens fictícias; carrega e encerra o modelo
```

O instalador fixa commit/arquivo e verifica SHA-256. O GGUF tem 396705472 bytes (~378 MiB); a distribuição CPU baixada tinha ~22 MiB. Modelo/binários/configurações locais são ignorados pelo Git. As fontes e checksums completos estão em `LOCAL-MODEL-SOURCES.json`. O modelo base é [Qwen3 0.6B](https://huggingface.co/Qwen/Qwen3-0.6B); a quantização usada vem do [publicador Unsloth](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF); o executor é da [release oficial llama.cpp b12032](https://github.com/ggml-org/llama.cpp/releases/tag/b12032). Não se executou instalador remoto por pipe.

O protocolo consultou [OpenAI Docs — Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), mas usa a [variante de schema documentada pelo llama.cpp](https://github.com/ggml-org/llama.cpp/blob/b12032/tools/server/README.md). Não faz chamadas à OpenAI.

## Medição e qualidade real

`LOCAL-MODEL-VALIDATION.json` registra três mensagens fictícias passando por HTTP local, modelo, timers reais da SNN e feedback. No teste final:

- Carregamento a frio: ~1,15 s.
- Total das interações: ~4,09 a 5,85 s, incluindo ~1,6 s da janela neural.
- Memória residente do processo do modelo: 1122964 KiB (~1,07 GiB); inclui runtime, pesos, buffers e KV, não o navegador inteiro.
- “Quanto é 7 + 5?” recebeu “7 + 5 = 12”. Um pedido vago gerou uma pergunta, e um pedido de espaço gerou “aguardando”. Nos três casos, o feedback alterou pesos ligados ao turno.

**Qualidade limitada, não aprovada como assistente confiável.** Na amostra, o modelo sugeriu Ouvir para “Isso não funciona” e inferiu ocupado indevidamente; a SNN escolheu Tirar dúvidas. O esclarecimento final “Por que isso não funciona?” é genérico. Em teste exploratório, apareceu explicação factual imprecisa sobre disco e RAM. O schema garante estrutura, não verdade ou boa interpretação. Não foi baixado 1.7B: o computador já tinha swap alta, e seria uma mudança relevante de recursos sem evidência suficiente. O 0.6B permanece identificado como experimental para avaliação.

Os testes automatizados cobrem esquema inválido, erro, timeout, cancelamento, ausência de conexão, decisão diferente da sugestão do modelo, feedback por turno mesmo após outra decisão, persistência, isolamento e descarte de resposta atrasada. Não ativam o microfone nem operam o desktop.

## Correção do início e da recarga

A porta 4173 estava atendida pela versão antiga do servidor, que ainda não tinha `/api/model` e `/api/chat`, enquanto os arquivos da interface já estavam mudando. Foi reiniciada com o backend atual. Também foi ajustado o CSP para permitir apenas conexões ao próprio servidor (`connect-src self`), necessárias ao proxy local; permanece sem conexão direta do navegador ao modelo ou a serviços externos. O botão principal agora inicia TEXTO, e o microfone tem controle opcional separado.

Após a correção, `/api/model/start` respondeu `ready:true` e `/api/model/stop` respondeu `stopped:true` no servidor real. Uma instância headless separada do navegador carregou HTML/JS de verdade e exibiu “Modelo local experimental”, rede ativa e o botão principal, sem erros JS/CSP detectados. Não abriu janela visível nem acessou dados do navegador pessoal. O teste de botão usa mocks para garantir que início textual não chama `getUserMedia`; não houve teste automático do microfone físico.
