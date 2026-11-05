# Companheiro SNN

**Um companheiro virtual que aprende quando ouvir, perguntar ou ajudar — com uma rede neural pulsante de verdade.**

Protótipo experimental para Ubuntu que combina uma **SNN recorrente** com um **modelo de linguagem local**. O modelo interpreta e escreve; a rede escolhe uma intenção; seu feedback muda os pesos dessa escolha. Cada amigo mantém seu próprio histórico e aprendizado.

> Em desenvolvimento. A interface atual funciona no navegador local. Um bonequinho integrado ao desktop é a direção do projeto; isso ainda não é um assistente autônomo com controle geral do computador.

## A ideia

E se um companheiro virtual aprendesse com a convivência, em vez de apenas repetir respostas prontas?

Aqui, conversa e decisão têm papéis diferentes. Um modelo de linguagem transforma a mensagem em sinais. Uma rede com **192 neurônios internos recorrentes** processa esses sinais e compete entre quatro intenções iniciais: **Ouvir, Perguntar, Tirar dúvidas e Fazer**. Só então o modelo formula a resposta. Avaliar uma interação com **＋ ou −** atualiza o aprendizado daquela decisão.

```text
Sua mensagem → Modelo local interpreta → SNN escolhe → Modelo responde
                                            ↑
                                 Seu feedback altera pesos
```

A sugestão do modelo não determina obrigatoriamente a escolha da rede. A visualização mostra o mesmo núcleo que participa da decisão, e os detalhes distinguem sugestões do modelo de decisões da SNN.

## O que já existe

- **SNN real:** neurônios com disparos, estado temporal e aprendizado dos pesos de saída.
- **Conversa por texto local:** Qwen3 0.6B quantizado, executado em CPU pelo llama.cpp.
- **Até três amigos:** nomes, pesos, habilidades e histórico independentes, salvos no navegador.
- **Feedback por interação:** a avaliação fica ligada ao turno correto, mesmo com atividade posterior da rede.
- **Habilidades compostas:** combinações de blocos locais em sequência ou paralelo, com revisão antes de executar.
- **Rede ao vivo:** atividade neural, decisões e detalhes do aprendizado visíveis na interface.
- **Temas claro e noturno**, preferências e microfone opcional para medir energia sonora.

O microfone **não transcreve nem compreende fala**. A conversa atual é textual. Propostas de pesquisa não realizam buscas, e habilidades indisponíveis não são apresentadas como ações executadas.

## Começar

Requisitos: **Node.js 22 ou superior recomendado** e um navegador moderno. O instalador do modelo é voltado a **Ubuntu x64** e usa `curl`, `tar` e `sha256sum`.

O JavaScript compilado está incluído. Para abrir a interface, na pasta do projeto:

```bash
npm start
```

Abra **http://127.0.0.1:4173**. A interface e a rede podem ser exploradas sem instalar o modelo. Para habilitar a conversa local em uma instalação nova:

```bash
npm run install:model
npm start
```

O instalador baixa cerca de **378 MiB de pesos**, além do executor CPU, com versões fixadas e verificação de SHA-256. Os arquivos ficam fora desta pasta, em `../../work/local-model`, e não são enviados ao GitHub. Não é preciso chave de API ou GPU.

Na interface, marque **Usar o modelo local para esta conversa**, envie uma mensagem e avalie a resposta. **Iniciar companheiro** inicia a sessão textual; o microfone tem um controle separado. **Encerrar** cancela a geração e libera o processo de modelo gerenciado pelo aplicativo.

## Ensinar e experimentar

1. Converse e use **＋ / −** para avaliar a intenção escolhida naquela interação.
2. Em **Habilidades → Ensinar uma combinação**, crie uma sequência ou um conjunto de blocos em paralelo.
3. Em **Detalhes da rede**, selecione uma **Demonstração explícita** e use **Ensinar exemplo** para associar um contexto à habilidade.
4. Confira o plano em **Revisar habilidade** antes de escolher **Executar localmente**.

As habilidades usam apenas os efeitos locais implementados. Aprender uma escolha não concede novas permissões ou ferramentas ao modelo.

## Dados e funcionamento local

O navegador conversa com o backend em `127.0.0.1:4173`; o modelo atende em `127.0.0.1:4174`. A configuração atual aceita apenas endpoints locais. Texto e contexto recente são processados na própria máquina, sem chamadas à OpenAI ou outro provedor remoto.

Amigos e histórico ficam no **localStorage do navegador**. Limpar os dados do site remove esse estado; trocar de navegador ou origem não transfere os amigos. O repositório guarda o código, não o estado pessoal salvo no navegador.

O modelo recebe até as últimas seis mensagens reais, dentro dos limites documentados. Não recebe áudio ou dados de outros amigos. Os pesos do Qwen não são treinados por amigo: o aprendizado persistente é da política SNN, acompanhado do contexto recente da conversa.

## Desenvolver e verificar

```bash
npm test             # testes automatizados, sem operar o desktop
npm run build        # recompila TypeScript e o bundle do navegador
npm run test:model   # teste com modelo real e mensagens fictícias
```

Para recompilar, disponibilize **TypeScript** como dependência de desenvolvimento, pela instalação do VS Code no caminho reconhecido pelo projeto, ou pela variável `TYPESCRIPT_PATH` apontando para `typescript.js`. Executar a versão compilada não exige esse compilador.

Os testes cobrem aprendizado, persistência, isolamento entre amigos, validação de respostas, cancelamento e feedback associado à decisão correta. O teste de modelo é separado porque carrega o executor e usa mais memória.

## Limites atuais

O Qwen 0.6B é pequeno e experimental: pode interpretar mal, responder de forma genérica ou errar fatos. Na amostra local registrada, as interações levaram aproximadamente **4–6 segundos**, e o processo do modelo usou cerca de **1,1 GiB de RAM**. São medições daquela máquina, não garantias de desempenho.

Ainda não há compreensão de voz, personalidade textual completa, memória semântica de longo prazo, descoberta automática de ferramentas ou controle geral do Ubuntu. A SNN aprende escolhas a partir dos sinais recebidos; a interpretação linguística vem do modelo, não de raciocínio textual da rede pulsante.

## Por dentro do projeto

| Pasta | Conteúdo |
| --- | --- |
| `src/` | Rede neural, conversa, amigos, habilidades e interface em TypeScript |
| `ui/` | Estrutura e estilos da interface |
| `scripts/` | Servidor local, compilação, instalação e execução do modelo |
| `tests/` | Testes automatizados |
| `dist/` | JavaScript compilado para execução |
| `companheiro/` | Primeira versão Python preservada |

- [Arquitetura da SNN e evidências de aprendizado](ARQUITETURA-SNN.md)
- [Conversa local: instalação, funcionamento e limites](CONVERSA-LOCAL.md)
- [Resultados do teste com modelo real](LOCAL-MODEL-VALIDATION.json)
- [Fontes e checksums do modelo e executor](LOCAL-MODEL-SOURCES.json)
- [Medição do núcleo neural](BENCHMARK.json)
- [Versão inicial em Python](README-python.md)

## Próximos passos

Melhorar a qualidade da conversa, avaliar o aprendizado ao longo de interações mais extensas e evoluir a presença do companheiro no desktop, mantendo clara a diferença entre sugestão, decisão e execução.
