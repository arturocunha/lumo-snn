# Companheiro SNN para Ubuntu

Protótipo leve, em português, feito apenas com a biblioteca padrão do Python 3.10+ e Tk. Não exige GPU, instalação de pacotes Python, modelo local ou API. A primeira entrega demonstra aprendizado e controle de iniciativa; não fornece conversa por inteligência artificial nem controle geral do computador.

## Executar

Abra um terminal nesta pasta e execute:

```bash
python3 -m companheiro --perfil primeiro
```

Use outro nome para criar um indivíduo independente, por exemplo `--perfil luna`. Nomes aceitam letras sem acento, números, `_` e `-`. A janela mostra o perfil em uso. Python e Tk foram encontrados nesta máquina.

```bash
python3 demo.py
python3 -m unittest discover -s tests -v
```

O primeiro comando demonstra aprendizado sem interface, sem persistência e sem abrir páginas. O segundo executa os testes sem interagir com o desktop.

## Experimentar a interface

1. Escolha um contexto simulado e pressione **Avaliar contexto**. Veja a escolha bruta, a saída após a política conservadora, a contagem de disparos e a margem.
2. Dê feedback **Adequada** ou **Inadequada** para a **escolha bruta da SNN**, inclusive quando a política a reduz para uma pergunta. Esse feedback é uma avaliação humana da escolha, não comprovação de sucesso da página. Cada avaliação aceita um único feedback.
3. Para um experimento reproduzível, escolha “Conversa com página relevante”, selecione `propor_url` e pressione **Ensinar** oito vezes. A rede passa a preferir essa opção, mas a política ainda pede para aguardar evidência.
4. Avalie e dê feedback positivo três vezes. Se a rede mantiver essa preferência com margem suficiente, aparece o botão de abertura. Ele mostra a URL exata numa confirmação antes de solicitar abertura ao navegador. O botão não aparece apenas por ensinar exemplos.
5. O campo de URL é capturado ao avaliar: alterações posteriores exigem nova avaliação para valerem na proposta.
6. **Sprite flutuante** abre um boneco vetorial simples, animado dentro de uma janela pequena acima das outras. Arraste para posicionar e feche normalmente. Não há importação de sprites nesta versão.
7. A opção de reavaliar a cada 15 segundos é desligada por padrão. Usa somente o contexto selecionado e preserva decisões que aguardam feedback; não observa atividade real e não abre páginas automaticamente.

## O que aprende

`core.py` implementa seis entradas codificadas por frequência e três neurônios de saída do tipo leaky integrate-and-fire (LIF). São 80 passos por avaliação, com integração de corrente ponderada, vazamento, limiar e reset. As saídas competem pelo número de disparos mais o potencial residual. Não há sorteio na decisão; a semente fixa apenas inicializa os pesos.

A regra de plasticidade usa traços pré-sinápticos acumulados nos disparos pós-sinápticos. O feedback positivo/negativo modula esses traços, alterando os pesos da saída avaliada, limitados a [0, 1]. É uma regra local de três fatores simplificada, não um modelo biológico completo nem aprendizado de linguagem. O ensino por exemplo reforça a saída indicada; se ela estiver silenciosa, usa a atividade de entrada como aproximação de disparos pós-sinápticos forçados. Ensino é registrado como atualização, sem fabricar feedback de sucesso.

A iniciativa de `propor_url` exige simultaneamente: essa saída vencer na rede, pelo menos três avaliações positivas naquele contexto/ação, proporção positiva de pelo menos 75% e margem de pelo menos dois pontos sobre a concorrência. Sem isso, a política a reduz a `perguntar`. Contadores sozinhos não promovem a ação. Esse limiar é uma heurística conservadora de protótipo, não uma garantia estatística de competência. O feedback é humano e subjetivo; não há sensor de resultado automático.

O desenho exibe as 18 conexões com espessura proporcional aos pesos. O raster à direita mostra os disparos reais da última avaliação. Após feedback, o raster anterior é limpo e as conexões já refletem a atualização.

## Modelo, memória e execução são separados

- **Modelo:** `model.py` contém um contrato de proposta e um adaptador de demonstração com texto fixo. Nenhum provedor está conectado. Não há raciocínio de modelo atribuído à SNN.
- **SNN:** aprende preferências de ação sobre quatro contextos manuais; escolhe aguardar, perguntar ou propor uma URL. Não compreende texto livre.
- **Política:** pode reduzir iniciativa; não pode transformar uma escolha de aguardar em abertura.
- **Ferramenta:** `actions.py` só abre URL HTTP/HTTPS validada e exige confirmação explícita. Não executa shell, não apaga arquivos e não oferece ferramentas genéricas.
- **Perfil:** começa sem histórico pessoal; persiste somente pesos, avaliações agregadas por contexto e número de atualizações. Personalidade textual, memória de conversa e importação de sprites são próximos incrementos, ainda não implementados.

Perfis ficam em `$XDG_DATA_HOME/companheiro-snn/<perfil>/brain.json`, ou `~/.local/share/companheiro-snn/<perfil>/brain.json` quando essa variável não existe. Gravação por substituição atômica, com arquivo privado. Perfil inválido bloqueia a inicialização em vez de ser silenciosamente substituído. Use somente uma instância por perfil: ainda não há trava entre processos, e a última gravação vence. Feedback é salvo imediatamente e a janela salva ao fechar.

A aplicação não lê tela, arquivos pessoais, microfone, Chrome ou VS Code; não procura credenciais. O destino da página e o navegador podem fazer suas próprias comunicações quando você confirma a abertura.

## Validação e limitações

Os testes verificam disparos determinísticos, mudança de escolha por ensino e feedback negativo, política de iniciativa dependente de pesos e evidências, isolamento/persistência de perfis, feedback único, rejeição de URLs e confirmação antes do executor. A execução de navegador é substituída por uma função falsa nos testes. A demonstração usa uma rede descartável em memória.

A interface foi verificada por compilação; não foi aberta como teste no desktop pessoal e não houve teste visual automatizado, pois não há servidor gráfico virtual instalado. A camada de Tk pode depender do gerenciador de janelas para a opção “acima das outras”. O boneco anda somente dentro de sua própria janela. Não há integração com autostart nem monitoramento em segundo plano após fechar.

Próximos passos úteis: validar a experiência gráfica com o usuário, adicionar importação de sprite, preferências de personalidade separadas da rede e um adaptador de modelo escolhido pelo usuário. Depois, contextos mais ricos e avaliação de generalização, sempre distinguindo sugestão, decisão da rede e efeito executado. O protótipo não demonstra ainda aprendizado de ações gerais em situações desconhecidas.

## Git

Repositório Git local nesta pasta, com identidade já configurada no ambiente. Nenhuma publicação remota foi solicitada ou realizada. A primeira chamada ao VS Code dentro do isolamento retornou sucesso sem janela visível relatada pelo usuário. A segunda, fora do isolamento, criou a janela na sessão Wayland real. `code --status` confirmou “Window (companheiro - Visual Studio Code)” e a pasta carregada. Não houve inspeção visual da tela.

Caso precise reabrir manualmente:

```bash
code --new-window /home/artur/Documents/Codex/2026-11-01/snn-desktop-companion/outputs/companheiro
```
