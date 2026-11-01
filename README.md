# Companheiro — prévia visual em TypeScript

**Etapa atual: aprovar a interface web antes de integrar funcionalidades.** Conversa, escolhas e rede são demonstrações identificadas. Nada é salvo; nenhum modelo, SNN ou ferramenta está conectado à prévia. Não abre páginas externas nem cria personagem sobre o desktop.

## Ver agora

Abra **http://127.0.0.1:4173** enquanto o servidor estiver rodando.

Nesta pasta:

```bash
npm run preview
```

Depois abra o endereço acima no navegador. Para mudar a porta: `PORT=4174 npm run preview`. Para parar o servidor no terminal: `Ctrl+C`.

Não precisa instalar pacotes para executar: usa Node.js e sua biblioteca padrão. O servidor escuta somente em `127.0.0.1` e serve somente a prévia. CSS, desenhos e fontes do sistema são locais; não há CDN, telemetria ou modelo externo.

## O que experimentar

- Ver o personagem no cenário, ocultá-lo e mostrá-lo novamente dentro da página.
- Escrever uma mensagem de teste; a resposta é fixa e identificada como demonstração.
- Escolher uma situação, ver uma escolha simulada e testar os botões de feedback.
- Explorar as conexões ilustrativas e os detalhes recolhidos da demonstração.

O próximo passo depende do feedback visual do usuário. A conexão com aprendizado, persistência e shell desktop está pausada.

## Arquivos

- `ui/index.html` e `ui/style.css`: estrutura e aparência.
- `src/ui.ts`: renderização e eventos do painel.
- `src/preview.ts`: dados e interações simulados, sem importar o núcleo SNN.
- `scripts/preview.mjs`: servidor local mínimo.
- `dist/`: JavaScript compilado, incluído para execução sem ferramentas extras.
- `tests/preview.test.mjs`: verificações da prévia, com DOM simulado.

```bash
npm run build
npm test
```

A compilação usa o TypeScript já incluído no VS Code desta máquina, sem instalar dependências. Em outra máquina, pode-se fornecer `TYPESCRIPT_PATH` para uma instalação do compilador. O código compilado já está incluído. Testes do DOM simulado não substituem avaliação visual no navegador.

## Trabalho preservado

A versão Python permanece disponível em `companheiro/`, com instruções em `README-python.md`, e no histórico Git. Os perfis pessoais existentes não foram lidos ou alterados pela prévia web.

`src/core.ts`, `src/main.ts` e `src/pet.ts` contêm uma migração desktop iniciada antes da mudança de prioridade. Não são usados pelo servidor e não estão validados como aplicativo final. GJS, GTK e WebKitGTK foram encontrados no sistema; nenhum Electron, pacote npm ou runtime adicional foi instalado. A integração nativa não deve ser tratada como entrega aprovada.

Repositório exclusivamente local. Nenhuma publicação no GitHub.

## Verificação desta entrega

Compilação TypeScript concluída; 4 testes de interação com DOM simulado passaram. O endereço local respondeu HTTP 200. O Chrome informou encaminhamento da abertura para a sessão existente, mas emitiu também aviso do processo lançador; a visibilidade da aba não foi confirmada visualmente. Use o endereço acima se ela não aparecer. Não houve instalação de dependências; a pasta completa, incluindo Git e versões preservadas, tinha cerca de 828 KiB nesta medição.
