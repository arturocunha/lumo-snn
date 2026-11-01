# Preservar o aprendizado da aba anterior

A versão anterior mantinha os pesos somente na memória da aba. O novo código consegue importar esse estado, mas o servidor não pode ler a memória de uma página já aberta. **Não recarregue nem feche a aba antiga antes de preservar o estado**, caso queira manter o aprendizado desta sessão.

Na aba antiga do Companheiro, abra o console do navegador (Ctrl+Shift+J), execute o trecho abaixo e só então atualize a página. Ele para a captura/rede, salva apenas o nome, pesos/feedback e o texto já existente da conversa, no armazenamento local deste site. Não lê outras abas, não exporta e não grava áudio.

```js
microphone.stop(); live.stop();
localStorage.setItem('companheiro.preview.legacy-session.v1', JSON.stringify({
  name: preferences.name,
  brain: live.brain.snapshot(),
  messages: Array.from(document.querySelectorAll('#messages .message')).map(node => ({
    user: node.classList.contains('user'),
    text: node.querySelector('.bubble')?.textContent || ''
  }))
}));
console.log('Estado do amigo salvo localmente. Agora pode atualizar a página.');
```

A nova versão importa esse conteúdo na primeira inicialização e mantém uma cópia da fonte. Quando o amigo importado é apagado com confirmação, remove também essa cópia de aprendizado e conversa. Nome e tema anteriores continuam preservados como preferências legadas.

Se a aba antiga já foi recarregada, os pesos que só estavam em memória não são recuperáveis. O nome salvo anteriormente ainda é migrado; a interface informa a limitação. Amigos criados pela nova versão passam a salvar aprendizado e conversa automaticamente neste navegador.
