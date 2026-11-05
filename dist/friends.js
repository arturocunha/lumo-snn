import { validateTurn } from './conversation.js';
import { validateSkills, baseActionIds } from './skills.js';
import { Brain, validateProfile } from './core.js';
export const maxFriends = 3;
export const friendsLimitMessage = 'Para criar outro, apague um dos amigos existentes.';
export const friendsKey = 'companheiro.friends.v1';
export const handoffKey = 'companheiro.preview.legacy-session.v1';
function friendName(value) { if (typeof value !== 'string' || !value.trim() || Array.from(value.trim()).length > 32 || /[\u0000-\u001f\u007f]/.test(value))
    throw Error('Use um nome de 1 a 32 caracteres.'); return value.trim().replace(/\s+/g, ' '); }
export function validFriends(value) {
    const data = value;
    if (!data || ![1, 2, 3].includes(data.version) || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.friends) || !(data.active === null || typeof data.active === 'string'))
        throw Error('Dados de amigos inválidos. Nada foi substituído.');
    const ids = new Set();
    for (const friend of data.friends) {
        if (!friend || typeof friend.id !== 'string' || !friend.id || ids.has(friend.id))
            throw Error('Amigo inválido');
        ids.add(friend.id);
        friendName(friend.name);
        friend.brain = validateProfile(friend.brain);
        friend.skills = validateSkills(friend.skills ?? []);
        if (friend.brain.actionIds.join(',') !== [...baseActionIds, ...friend.skills.map(s => s.id)].join(','))
            throw Error('Habilidades e rede não correspondem.');
        if (!Array.isArray(friend.messages) || friend.messages.some(m => !m || typeof m.user !== 'boolean' || typeof m.text !== 'string' || m.text.length > 10000 || (m.source !== undefined && !['demo', 'local', 'model'].includes(m.source))))
            throw Error('Conversa inválida');
        for (const message of friend.messages)
            if (message.turn)
                validateTurn(message.turn, friend.id, friend.brain.actionIds);
    }
    if (data.active !== null && !ids.has(data.active))
        throw Error('Amigo atual inválido');
    return JSON.parse(JSON.stringify({ ...data, version: 3 }));
}
export class FriendsStore {
    storage;
    data;
    expected;
    migration;
    constructor(storage, legacyName = 'Companheiro', seed) {
        this.storage = storage;
        this.expected = storage.getItem(friendsKey);
        if (this.expected !== null) {
            const original = this.expected;
            this.data = validFriends(JSON.parse(original));
            if (JSON.stringify(this.data) !== original) {
                if (storage.getItem('companheiro.backup.before-reservoir.v1') === null)
                    storage.setItem('companheiro.backup.before-reservoir.v1', original);
                if (storage.getItem('companheiro.backup.before-skills.v1') === null)
                    storage.setItem('companheiro.backup.before-skills.v1', original);
                this.commit(this.data);
                this.migration = 'Amigos migrados para habilidades; pesos anteriores preservados em cópia local.';
            }
            else
                this.migration = '';
            return;
        }
        const handoff = storage.getItem(handoffKey);
        let messages = [];
        if (handoff) {
            const old = JSON.parse(handoff);
            seed = validateProfile(old.brain);
            messages = old.messages ?? [];
            if (old.name)
                legacyName = friendName(old.name);
        }
        const friend = { id: this.id(), name: friendName(legacyName), brain: seed ?? new Brain().snapshot(), messages, skills: [] };
        this.data = validFriends({ version: 1, revision: 0, active: friend.id, friends: [friend], ...(handoff ? { migratedFriend: friend.id } : {}) });
        // A fonte legada é mantida; backup único antes da primeira migração.
        const legacy = storage.getItem('companheiro.preview.preferences.v1');
        if (legacy && storage.getItem('companheiro.backup.preferences.v1') === null)
            storage.setItem('companheiro.backup.preferences.v1', legacy);
        if (handoff && storage.getItem('companheiro.backup.legacy-session.v1') === null)
            storage.setItem('companheiro.backup.legacy-session.v1', handoff);
        this.migration = handoff ? 'Amigo anterior e aprendizado importados.' : legacy ? 'Nome anterior preservado. A versão anterior mantinha pesos apenas em memória; eles só podem ser importados antes de recarregar a aba.' : '';
        this.commit(this.data);
    }
    id() { return globalThis.crypto?.randomUUID?.() ?? `amigo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
    snapshot() { return validFriends(this.data); }
    current() { const friend = this.data.friends.find(f => f.id === this.data.active); return friend ? JSON.parse(JSON.stringify(friend)) : null; }
    commit(data) {
        if (this.storage.getItem(friendsKey) !== this.expected)
            throw Error('Os amigos foram alterados em outra aba. Reabra esta página antes de continuar.');
        const next = validFriends({ ...data, revision: this.data.revision + 1 });
        const text = JSON.stringify(next);
        this.storage.setItem(friendsKey, text);
        this.expected = text;
        this.data = next;
    }
    create(name) { if (this.data.friends.length >= maxFriends)
        throw Error(friendsLimitMessage); const next = this.snapshot(); const friend = { id: this.id(), name: friendName(name), brain: new Brain().snapshot(), messages: [], skills: [] }; next.friends.push(friend); next.active = friend.id; this.commit(next); return this.current(); }
    select(id) { if (!this.data.friends.some(f => f.id === id))
        throw Error('Amigo não encontrado'); this.commit({ ...this.snapshot(), active: id }); }
    rename(name) { const next = this.snapshot(), friend = next.friends.find(f => f.id === next.active); if (!friend)
        throw Error('Crie um amigo primeiro'); friend.name = friendName(name); this.commit(next); }
    save(brain, messages, skills) { const next = this.snapshot(), friend = next.friends.find(f => f.id === next.active); if (!friend)
        throw Error('Nenhum amigo selecionado'); friend.brain = validateProfile(brain); if (skills)
        friend.skills = validateSkills(skills); friend.messages = messages.map(m => ({ ...m })); this.commit(next); }
    delete(id, confirmed) { if (!confirmed)
        return false; if (this.storage.getItem(friendsKey) !== this.expected)
        throw Error('Os amigos foram alterados em outra aba. Reabra esta página antes de continuar.'); const next = this.snapshot(); if (!next.friends.some(f => f.id === id))
        throw Error('Amigo não encontrado'); if (next.migratedFriend === id) {
        this.storage.removeItem(handoffKey);
        this.storage.removeItem('companheiro.backup.legacy-session.v1');
        delete next.migratedFriend;
    } for (const key of ['companheiro.backup.before-skills.v1', 'companheiro.backup.before-reservoir.v1']) {
        const backup = this.storage.getItem(key);
        if (backup) {
            const old = JSON.parse(backup);
            if (Array.isArray(old.friends)) {
                old.friends = old.friends.filter((f) => f.id !== id);
                if (old.active === id)
                    old.active = old.friends[0]?.id ?? null;
                this.storage.setItem(key, JSON.stringify(old));
            }
        }
    } next.friends = next.friends.filter(f => f.id !== id); if (next.active === id)
        next.active = next.friends[0]?.id ?? null; this.commit(next); return true; }
}
