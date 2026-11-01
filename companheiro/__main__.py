import argparse
import tkinter as tk
from tkinter import ttk, messagebox
from .core import Brain, ACTIONS, FEATURES, CONTEXTS, profile_path
from .actions import validate_url, open_url
from .model import DemoModel

class App:
    def __init__(self, root, path):
        self.root, self.path = root, path
        self.brain = Brain.load(path)
        self.last = None
        self.model = DemoModel()
        self.float = None
        root.title('Companheiro SNN — demonstração local')
        root.geometry('940x820')
        root.protocol('WM_DELETE_WINDOW', self.close)
        panel = ttk.Frame(root, padding=12)
        panel.pack(fill='both', expand=True)
        ttk.Label(panel, text=f'Perfil: {path.parent.name} • modelo de linguagem NÃO conectado', font=('', 12, 'bold')).pack(anchor='w')
        ttk.Label(panel, text='Contexto informado manualmente. Não há leitura de tela, microfone ou histórico pessoal.').pack(anchor='w')
        self.context = tk.StringVar(value=next(iter(CONTEXTS)))
        box = ttk.Combobox(panel, textvariable=self.context, values=list(CONTEXTS), state='readonly')
        box.pack(fill='x', pady=6)
        box.bind('<<ComboboxSelected>>', self.invalidate)
        self.url = tk.StringVar(value='https://www.python.org/')
        ttk.Label(panel, text='Página de exemplo (só será aberta após confirmação):').pack(anchor='w')
        ttk.Entry(panel, textvariable=self.url).pack(fill='x')
        buttons = ttk.Frame(panel)
        buttons.pack(fill='x', pady=8)
        ttk.Button(buttons, text='Avaliar contexto', command=self.evaluate).pack(side='left')
        ttk.Button(buttons, text='Sprite flutuante', command=self.floating).pack(side='left', padx=5)
        self.periodic = tk.BooleanVar(value=False)
        ttk.Checkbutton(buttons, text='Reavaliar a cada 15 s', variable=self.periodic).pack(side='left')
        self.status = tk.StringVar(value='Avalie um contexto para observar os disparos e a escolha.')
        ttk.Label(panel, textvariable=self.status, wraplength=890, justify='left').pack(anchor='w', pady=6)
        self.proposal = tk.StringVar(value='Proposta de modelo: nenhuma. O adaptador disponível produz somente texto fixo de demonstração.')
        ttk.Label(panel, textvariable=self.proposal, wraplength=890).pack(anchor='w')
        self.execute = ttk.Button(panel, text='Confirmar abertura da página proposta…', command=self.confirm, state='disabled')
        self.execute.pack(anchor='w', pady=6)
        feedback = ttk.Frame(panel)
        feedback.pack(anchor='w')
        ttk.Label(feedback, text='Avalie a escolha BRUTA da SNN:').pack(side='left')
        self.good = ttk.Button(feedback, text='Adequada (+)', command=lambda: self.reward(1), state='disabled')
        self.bad = ttk.Button(feedback, text='Inadequada (−)', command=lambda: self.reward(-1), state='disabled')
        self.good.pack(side='left', padx=4)
        self.bad.pack(side='left')
        teach = ttk.Frame(panel)
        teach.pack(fill='x', pady=8)
        ttk.Label(teach, text='Ensinar exemplo (não conta como resultado positivo):').pack(side='left')
        self.target = tk.StringVar(value=ACTIONS[0])
        ttk.Combobox(teach, textvariable=self.target, values=ACTIONS, state='readonly', width=14).pack(side='left', padx=5)
        ttk.Button(teach, text='Ensinar', command=self.teach).pack(side='left')
        self.canvas = tk.Canvas(panel, height=260, bg='#172331', highlightthickness=0)
        self.canvas.pack(fill='x', pady=5)
        ttk.Label(panel, text='Linhas: pesos reais (espessura). Círculos: neurônios. Raster: cada traço é um disparo de saída.').pack(anchor='w')
        self.log = tk.Text(panel, height=7, state='disabled', wrap='word')
        self.log.pack(fill='both', expand=True)
        self.draw()
        root.after(15000, self.tick)

    def write(self, text):
        self.log.configure(state='normal')
        self.log.insert('end', text + '\n')
        self.log.see('end')
        self.log.configure(state='disabled')

    def invalidate(self, event=None):
        self.last = None
        self.brain.pending = None
        for button in (self.execute, self.good, self.bad):
            button.configure(state='disabled')

    def save(self):
        try:
            self.brain.save(self.path)
            return True
        except OSError as error:
            messagebox.showerror('Não foi possível salvar', str(error))
            return False

    def evaluate(self):
        self.last = self.brain.decide(self.context.get())
        r = self.last
        self.proposed_url = self.url.get()
        proposal = self.model.propose(self.context.get(), self.proposed_url)
        self.proposal.set(f'Proposta [{proposal.source}]: {proposal.text}\nURL: {proposal.url}')
        raw, effective = ACTIONS[r['choice']], ACTIONS[r['effective']]
        self.status.set(f'SNN bruta: {raw} | política efetiva: {effective} | disparos: {r["spikes"]} | margem: {r["margin"]:.2f} | evidência suficiente: {"sim" if r["reliable"] else "não"}')
        self.execute.configure(state='normal' if r['effective'] == 2 else 'disabled')
        self.good.configure(state='normal')
        self.bad.configure(state='normal')
        self.write(f'Escolha SNN: {raw}. Saída após política: {effective}. Nenhuma ferramenta executada.')
        if r['effective'] == 1:
            self.write('Pergunta do protótipo: você gostaria de consultar uma página sobre este assunto?')
        self.draw()

    def reward(self, reward):
        self.brain.feedback(reward)
        self.save()
        self.invalidate()
        self.write(f'Feedback {reward:+d}: pesos atualizados. Avalie novamente para medir a nova escolha.')
        self.draw()

    def teach(self):
        self.brain.teach(self.context.get(), ACTIONS.index(self.target.get()))
        self.save()
        self.invalidate()
        self.write(f'Exemplo humano: {self.target.get()}. Plasticidade supervisionada; não é raciocínio de um modelo.')
        self.draw()

    def confirm(self):
        if self.last is None or self.last['effective'] != 2:
            return
        try:
            url = validate_url(self.proposed_url)
            if messagebox.askyesno('Abrir no navegador?', f'Autoriza abrir esta URL?\n\n{url}'):
                ok = open_url(url, confirmed=True)
                self.write('Navegador aceitou a solicitação.' if ok else 'O navegador não confirmou a abertura.')
                self.execute.configure(state='disabled')
        except (ValueError, OSError) as error:
            messagebox.showerror('Ação bloqueada', str(error))

    def draw(self):
        c = self.canvas
        c.delete('all')
        for i, name in enumerate(FEATURES):
            y = 24 + i * 39
            for j, row in enumerate(self.brain.weights):
                c.create_line(155, y, 470, 48 + j * 79, fill='#557c96', width=1 + row[i] * 5)
            c.create_oval(138, y-7, 152, y+7, fill='#7dd3fc')
            c.create_text(8, y, text=name, fill='white', anchor='w')
        for j, name in enumerate(ACTIONS):
            y = 48 + j * 79
            c.create_oval(460, y-13, 486, y+13, fill='#fbbf24')
            c.create_text(495, y, text=name, fill='white', anchor='w')
        if self.last:
            for tick, fired in enumerate(self.last['raster']):
                for j in fired:
                    x, y = 650 + tick * 2.4, 48 + j * 79
                    c.create_line(x, y-12, x, y+12, fill='#86efac')
        c.create_text(650, 240, text=f'Atualizações reais: {self.brain.updates}', fill='white', anchor='w')

    def floating(self):
        if self.float and self.float.winfo_exists():
            self.float.lift()
            return
        self.float = tk.Toplevel(self.root)
        self.float.title('Companheiro • arraste para mover')
        self.float.attributes('-topmost', True)
        c = tk.Canvas(self.float, width=200, height=110, bg='#d9eef6')
        c.pack()
        c.create_text(100, 96, text='Sprite de demonstração')
        def drag(event):
            self.float.geometry(f'+{event.x_root-100}+{event.y_root-50}')
        c.bind('<B1-Motion>', drag)
        def animate(frame=0):
            if not self.float or not self.float.winfo_exists():
                return
            c.delete('pet')
            x = 100 + 45 * __import__('math').sin(frame / 20)
            c.create_oval(x-20, 15, x+20, 55, fill='#a78bfa', tags='pet')
            c.create_oval(x-10, 27, x-6, 31, fill='black', tags='pet')
            c.create_oval(x+6, 27, x+10, 31, fill='black', tags='pet')
            step = 5 if frame % 12 < 6 else -5
            c.create_line(x-10, 53, x-12+step, 72, width=5, tags='pet')
            c.create_line(x+10, 53, x+12-step, 72, width=5, tags='pet')
            self.root.after(80, lambda: animate(frame+1))
        animate()

    def tick(self):
        if self.periodic.get():
            # Preserva uma proposta ou avaliação que ainda espera resposta humana.
            if self.brain.pending is None:
                self.evaluate()
        self.root.after(15000, self.tick)

    def close(self):
        if self.save():
            self.root.destroy()


def main():
    parser = argparse.ArgumentParser(description='Companheiro SNN local, sem provedor de conversa')
    parser.add_argument('--perfil', default='primeiro')
    args = parser.parse_args()
    try:
        path = profile_path(args.perfil)
        # Valida antes de abrir a interface; nunca sobrescreve perfil corrompido.
        Brain.load(path)
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(2, f'Não foi possível carregar o perfil: {error}\n')
    root = tk.Tk()
    App(root, path)
    root.mainloop()

if __name__ == '__main__':
    main()
