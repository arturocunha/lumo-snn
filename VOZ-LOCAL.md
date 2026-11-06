# Voz em português — revisão de 5 de novembro de 2026

A captura agora usa áudio mono com cancelamento de eco, redução de ruído e ganho automático quando o navegador os suporta. Ao iniciar, a aplicação verifica novamente a disponibilidade da transcrição antes de pedir permissão. Falhas na preparação de áudio param a captura e mostram uma mensagem; a interface não permanece dizendo “Escutando” se só houver uma falha ou medição de volume.

A fala é segmentada em RAM: uma pausa de aproximadamente 0,7 s encerra o trecho; duração máxima aproximada de 10 s. O limiar foi reduzido para aceitar voz mais baixa e há uma pequena margem anterior ao começo da fala. O backend valida WAV mono PCM16 a 16 kHz, transcreve exclusivamente neste computador e apaga os temporários em `finally`. No Ubuntu usa `/dev/shm` (RAM), com fallback para o temporário do sistema. Interromper/trocar amigo cancela captura, buffers, requisição e processo de transcrição. Áudio nunca é incluído no contexto do Qwen: somente o texto reconhecido entra na mesma conversa/SNN usada pelo teclado.

Se há texto sendo digitado, a fala é acrescentada ao rascunho para revisão em vez de sobrescrevê-lo ou enviá-lo automaticamente. Enquanto o amigo processa/responde, a captura não acumula novas mensagens. O áudio não é salvo permanentemente, mas o texto reconhecido e a resposta entram no histórico local do amigo, como mensagens normais.

## Modelo escolhido e custo

A opção antiga Whisper base Q5_1 errou 20 palavras nas 29 palavras de duas amostras públicas de telefonia em português europeu. O Whisper small Q5_1 errou 9/29 na mesma comparação (aproximadamente 69% → 31%). Numa terceira gravação pública curta em português brasileiro, acertou as oito palavras, ignorando pontuação. **São apenas três amostras, não uma estimativa geral de precisão.** A voz sintética anterior foi reconhecida mal e não foi usada para afirmar qualidade com voz humana.

O small quantizado foi adotado: arquivo de 190085487 bytes, SHA-256 `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb`. Origem: [publicação do responsável pelo whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp), revisão `5359861c739e955e79d9a303bcbc70fb988958b1`. O executor CPU já instalado é whisper.cpp v1.5.5, compilado com make/g++ presentes, sem Torch/CUDA. O instalador reproduzível é `npm run install:voice`.

Na máquina atual, a transcrição levou aproximadamente 7,6–10,1 s nas três gravações, com pico do processo em torno de 640 MiB. O processo só existe durante uma transcrição. O modelo de conversa continua o mesmo Qwen 0.6B; não foi baixado um modelo de linguagem maior. As duas etapas podem somar vários segundos após a pausa. Não é reconhecimento instantâneo.

## Validação

`VOICE-VALIDATION.json` registra testes através da porta real 4173, transcrição → interpretação local → SNN → resposta → feedback persistido num amigo fictício em memória. As gravações vieram de [PolyAI/MINDS-14](https://huggingface.co/datasets/PolyAI/minds14) e [BRSpeech](https://huggingface.co/datasets/freds0/BRSpeech). Referências completas/áudios de teste ficam em `work/local-voice/`, fora do Git, não são gravações do usuário. O relatório confirma que os temporários de áudio foram removidos.

Os testes automatizados adicionais cobrem segmentação, silêncio, voz baixa, reset, tamanho máximo, WAV/resampling, falha de preparação de áudio, chegada da transcrição ao fluxo de conversa e descarte após troca de amigo. Não acionam o microfone pessoal.

## Teste pelo usuário

1. Clique em **Iniciar companheiro** e permita o microfone.
2. Espere **Escutando**, fale uma frase curta e faça uma pausa.
3. Confira o texto reconhecido e a resposta na conversa. Pode corrigir digitando se alguma palavra sair errada.
4. Clique em **Encerrar** para parar.

O texto continua disponível se a permissão do microfone for negada. A leitura da resposta em voz alta só é usada se o navegador oferecer uma voz portuguesa marcada como local; caso contrário, a resposta aparece escrita. Não se usa Web Speech remoto para transcrição. Não há ativação por “hey + nome”. O microfone físico e o sotaque/ambiente do usuário ainda precisam do teste dele.

O repositório existente permanece o mesmo. Após o teste, o usuário autorizou o commit local desta retomada. O resultado e a pendência de repetição das respostas estão registrados em VERIFICACAO.md.
