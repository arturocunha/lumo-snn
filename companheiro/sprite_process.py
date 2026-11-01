"""Gerencia exclusivamente o processo do nosso personagem, sem misturar Tk e GTK."""
import os
import subprocess
import sys


class SpriteProcess:
    def __init__(self):
        env = os.environ.copy()
        env['GDK_BACKEND'] = 'x11'
        self.process = subprocess.Popen(
            [sys.executable, '-m', 'companheiro.sprite'], env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        os.set_blocking(self.process.stdout.fileno(), False)
        self.output = ''

    def poll(self):
        chunk = os.read(self.process.stdout.fileno(), 8192)
        if chunk:
            self.output = (self.output + chunk.decode('utf-8', errors='replace'))[-16000:]
        return self.process.poll()

    def close(self):
        # EOF encerra GTK normalmente. Só termina/força o filho criado aqui se travar.
        self.process.stdin.close()
        try:
            self.process.wait(timeout=.5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=.5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.process.stdout.close()
