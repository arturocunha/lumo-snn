# Companheiro — prévia TypeScript

Etapa atual: aprovar a interface e o fluxo. Não há SNN, modelo de linguagem, reconhecimento de voz ou automação conectados.

## Abrir

**http://127.0.0.1:4173**

Nesta pasta, execute `npm run preview`. Para parar o servidor no terminal: `Ctrl+C`. O servidor atende somente em `127.0.0.1`, sem CDN ou dependências npm instaladas.

## O que é real

**Iniciar companheiro** solicita acesso ao microfone após o clique e a permissão do navegador. Enquanto o estado indicar **Microfone ativo**, a aba mantém um stream local aberto. **Encerrar** para todos os tracks. Sair/recarregar a página também encerra a captura. Durante a solicitação, **Cancelar** invalida a sessão e para qualquer stream que chegar depois; o navegador pode manter seu próprio prompt de permissão aberto.

Não há gravação, armazenamento, envio, reprodução ou análise de áudio. Capturar o microfone não significa reconhecer fala ou responder por voz. A sessão depende da aba e do navegador; não é um serviço Ubuntu em segundo plano. Permissão negada, falta de dispositivo, acesso indisponível e desconexão retornam ao estado desligado com uma mensagem.

Nome e aparência são salvos no `localStorage` deste navegador. O noturno usa preto/cinza/grafite neutros. O menu mantém foco por teclado, fecha por Escape, botão ou fundo e devolve o foco ao botão de três barras. A frase “hey, nome” é uma configuração de intenção futura, sem detecção implementada.

## O que é simulado

As decisões e conexões no alto são ilustrações; “Outro exemplo” alterna três exemplos fixos. A conversa por texto fica recolhida e é opcional; suas respostas são fixas. Nem mensagens nem decisões são salvas. Nenhuma ferramenta ou página externa é aberta.

## Desenvolvimento e verificação

- `ui/index.html`, `ui/style.css`: apresentação.
- `src/ui.ts`: fluxo, controles e renderização.
- `src/preview.ts`: preferências, exemplos e ciclo de captura do microfone.
- `scripts/preview.mjs`: servidor local.
- `dist/`: JavaScript compilado incluído para execução sem compilador.

`npm run build` usa o TypeScript já instalado com o VS Code desta máquina (ou `TYPESCRIPT_PATH` para outro compilador). `npm test` cobre preferências/menu/conversa e o ciclo do microfone com mocks: início por clique, parada, permissão negada, falta de dispositivo, falha de acesso, desconexão e corridas de cancelamento. Os testes não ligam o microfone real. O hardware, permissões reais e a apresentação visual precisam ser conferidos pelo usuário no Chrome.

A versão anterior Python permanece em `companheiro/`, com instruções em `README-python.md`, e no Git. `src/core.ts`, `src/main.ts` e `src/pet.ts` são trabalho de migração desktop pausado, não usado pela prévia nem validado como entrega final. Nenhum perfil pessoal foi modificado. Não há publicação remota.
