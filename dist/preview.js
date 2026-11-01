"use strict";
const preferenceKey = 'companheiro.preview.preferences.v1';
function cleanName(value) {
    if (typeof value !== 'string')
        throw Error('Escolha um nome para o companheiro.');
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name || Array.from(name).length > 32 || /[\u0000-\u001f\u007f]/.test(name))
        throw Error('Use um nome de 1 a 32 caracteres.');
    return name;
}
function loadPreferences() {
    const defaults = { name: 'Companheiro', theme: 'light' };
    try {
        const value = JSON.parse(localStorage.getItem(preferenceKey) ?? 'null');
        if (value && typeof value === 'object') {
            defaults.name = cleanName(value.name);
            if (value.theme === 'dark' || value.theme === 'light')
                defaults.theme = value.theme;
        }
    }
    catch { }
    return defaults;
}
function savePreferences(preferences) {
    try {
        localStorage.setItem(preferenceKey, JSON.stringify(preferences));
        return true;
    }
    catch {
        return false;
    }
}
const decisionExamples = [
    { choice: 0, title: 'Aguardar', description: 'Dar espaço enquanto você se concentra.', situation: 'Você está ocupado.', icon: '◌' },
    { choice: 1, title: 'Perguntar', description: 'Entender se você quer ajuda antes de interromper.', situation: 'Você está organizando seu dia.', icon: '?' },
    { choice: 2, title: 'Sugerir uma página', description: 'Propor uma referência e aguardar sua confirmação.', situation: 'Uma página poderia ilustrar a conversa.', icon: '↗' },
];
const illustrativeWeights = [[.25, .18, .12, .33, .21, .4], [.14, .35, .21, .2, .42, .18], [.22, .3, .4, .12, .26, .09]];
class MicrophoneSession {
    request;
    notify;
    state = 'off';
    stream = null;
    generation = 0;
    constructor(request, notify) {
        this.request = request;
        this.notify = notify;
    }
    async start() {
        if (this.state !== 'off')
            return;
        const generation = ++this.generation;
        this.state = 'starting';
        this.notify(this.state, '');
        try {
            const stream = await this.request();
            if (generation !== this.generation) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            const tracks = stream.getAudioTracks();
            if (!tracks.length || tracks.every(track => track.readyState === 'ended')) {
                stream.getTracks().forEach(track => track.stop());
                throw Error('Nenhum microfone ativo foi encontrado.');
            }
            this.stream = stream;
            tracks.forEach(track => track.addEventListener('ended', () => { if (this.stream === stream)
                this.stop('O microfone foi desconectado ou a captura foi encerrada pelo navegador.'); }, { once: true }));
            this.state = 'active';
            this.notify(this.state, '');
        }
        catch (error) {
            if (generation !== this.generation)
                return;
            this.state = 'off';
            const name = error?.name;
            const message = name === 'NotAllowedError' ? 'Permissão do microfone negada. Você pode alterá-la nas configurações deste site.' : name === 'NotFoundError' ? 'Nenhum microfone encontrado. Conecte um microfone e tente novamente.' : name === 'NotReadableError' ? 'Não foi possível acessar o microfone. Ele pode estar ocupado por outro aplicativo.' : error instanceof Error ? error.message : 'Não foi possível iniciar o microfone. Tente novamente.';
            this.notify(this.state, message);
        }
    }
    stop(error = '') {
        ++this.generation;
        const stream = this.stream;
        this.stream = null;
        stream?.getTracks().forEach(track => track.stop());
        this.state = 'off';
        this.notify(this.state, error);
    }
}
