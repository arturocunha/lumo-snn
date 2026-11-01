import tempfile
import unittest
from pathlib import Path
from companheiro.core import Brain, CONTEXTS, profile_path
from companheiro.actions import validate_url, open_url

class LearningTests(unittest.TestCase):
    def test_spikes_and_determinism(self):
        b = Brain()
        r = b.run(next(iter(CONTEXTS.values())))
        self.assertEqual(r, b.run(next(iter(CONTEXTS.values()))))
        self.assertTrue(all(n > 0 for n in r['spikes']))
        self.assertEqual(len(r['raster']), 80)

    def test_teaching_changes_choice_without_fake_evidence(self):
        b = Brain()
        ctx = 'Usuário ocupado'
        old = b.decide(ctx)['choice']
        target = (old + 1) % 3
        before = b.weights[target][:]
        for _ in range(8):
            b.teach(ctx, target)
        self.assertNotEqual(before, b.weights[target])
        self.assertEqual(b.decide(ctx)['choice'], target)
        self.assertEqual(b.evidence, {})

    def test_negative_feedback_changes_choice(self):
        b = Brain()
        ctx = 'Pedido de ajuda'
        old = b.decide(ctx)['choice']
        b.feedback(-1)
        for _ in range(15):
            if b.decide(ctx)['choice'] != old:
                break
            b.feedback(-1)
        self.assertNotEqual(b.decide(ctx)['choice'], old)

    def test_initiative_requires_weights_and_feedback(self):
        b = Brain()
        ctx = 'Conversa com página relevante'
        for _ in range(8):
            b.teach(ctx, 2)
        self.assertEqual(b.decide(ctx)['choice'], 2)
        self.assertEqual(b.decide(ctx)['effective'], 1)
        for _ in range(3):
            b.decide(ctx)
            b.feedback(1)
        self.assertEqual(b.decide(ctx)['effective'], 2)
        b.weights[0] = [1.] * 6
        b.weights[2] = [0.] * 6
        self.assertNotEqual(b.decide(ctx)['effective'], 2)

    def test_persistence_and_single_feedback(self):
        b = Brain()
        b.decide('Pedido de ajuda')
        b.feedback(1)
        with self.assertRaises(ValueError):
            b.feedback(1)
        with tempfile.TemporaryDirectory() as d:
            p = profile_path('ana', d)
            b.save(p)
            c = Brain.load(p)
            self.assertEqual(b.weights, c.weights)
            self.assertEqual(b.evidence, c.evidence)
            self.assertEqual(b.decide('Pedido de ajuda')['choice'], c.decide('Pedido de ajuda')['choice'])
            self.assertEqual(Brain.load(profile_path('outro', d)).evidence, {})
            p.write_text('{"version": 99}')
            with self.assertRaises((KeyError, ValueError)):
                Brain.load(p)
        with self.assertRaises(ValueError):
            profile_path('../escape')

class ActionTests(unittest.TestCase):
    def test_invalid_urls(self):
        for url in ('file:///etc/passwd', 'javascript:alert(1)', 'https://a\n.com', 'https://user:pass@host', 'https://', 'ftp://host', 'https://host:bad', 'https://a\\b'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_url(url)

    def test_confirmation_and_injected_executor(self):
        calls = []
        def fake(url, **kwargs):
            calls.append(url)
            return True
        with self.assertRaises(PermissionError):
            open_url('https://example.org', opener=fake)
        self.assertEqual(calls, [])
        self.assertTrue(open_url('https://example.org', confirmed=True, opener=fake))
        self.assertEqual(calls, ['https://example.org'])

if __name__ == '__main__':
    unittest.main()
