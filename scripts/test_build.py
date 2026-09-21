#!/usr/bin/env python3
"""Packaging boundary tests. Fixtures are synthetic and never inspect secrets."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

import build


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory(prefix='timer-package-test-')
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'index.html').write_text('<h1>Test timer</h1>')
        (self.root / 'README.md').write_text('Synthetic test source')
        (self.root / 'scripts/package-manifest.json').write_text(json.dumps({
            'schema': 1, 'runtime': ['index.html'],
            'source': ['index.html', 'README.md', 'scripts/package-manifest.json'],
        }))

    def test_deterministic_archive_contains_corresponding_source_only(self):
        first = build.build(self.root)
        second = build.build(self.root)
        self.assertEqual(first, second)
        self.assertEqual(set(first['outputs']), {'index.html', 'source/timer-source.zip'})
        with zipfile.ZipFile(self.root / 'build/site/source/timer-source.zip') as archive:
            self.assertEqual(set(archive.namelist()), {'timer/' + x for x in first['sources']})
            for name, sha in first['sources'].items():
                self.assertEqual(hashlib.sha256(archive.read('timer/' + name)).hexdigest(), sha)
        (self.root / 'index.html').write_text('<h1>Modified fork</h1>')
        third = build.build(self.root)
        self.assertNotEqual(first['outputs']['source/timer-source.zip'],
                            third['outputs']['source/timer-source.zip'])

    def test_source_archive_can_build_independently(self):
        # Exercise the real package once assembled, using only its zipped sources.
        manifest_path = build.ROOT / 'scripts/package-manifest.json'
        manifest = json.loads(manifest_path.read_text())
        source = manifest['source']
        missing = [name for name in source if not (build.ROOT / name).is_file()]
        self.assertFalse(missing, 'Complete the candidate before testing: ' + repr(missing))
        root = self.root / 'candidate'
        root.mkdir()
        for name in source:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(build.regular_file(build.ROOT, name).read_bytes())
        original = build.build(root)
        restored = self.root / 'restored'
        with zipfile.ZipFile(root / 'build/site/source/timer-source.zip') as archive:
            archive.extractall(restored)
        self.assertEqual(build.build(restored / 'timer'), original)

    def test_unknown_source_is_not_published(self):
        (self.root / 'personal-notes.txt').write_text('synthetic private data')
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            build.build(self.root)
        self.assertFalse((self.root / 'build').exists())

    def test_source_symlink_is_not_followed(self):
        (self.root / 'index.html').unlink()
        (self.root / 'index.html').symlink_to(self.root / 'README.md')
        with self.assertRaisesRegex(ValueError, 'Symlink rejected'):
            build.build(self.root)

    def test_unknown_output_is_preserved(self):
        build.build(self.root)
        private = self.root / 'build/site/private-notes.txt'
        private.write_text('preserve synthetic data')
        with self.assertRaisesRegex(ValueError, 'Unexpected/missing build files'):
            build.build(self.root)
        self.assertEqual(private.read_text(), 'preserve synthetic data')

    def test_modified_output_is_preserved(self):
        build.build(self.root)
        output = self.root / 'build/site/index.html'
        output.write_text('preserve local edits')
        with self.assertRaisesRegex(ValueError, 'Modified build output'):
            build.build(self.root)
        self.assertEqual(output.read_text(), 'preserve local edits')

    def test_build_symlink_is_rejected(self):
        (self.root / 'build').symlink_to(self.root / 'scripts', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink rejected'):
            build.build(self.root)

    def test_forbidden_names_never_reach_file_read(self):
        for name in ['../other', '/absolute', '.env', '.env.local', 'nested/.env',
                     '.git/config', 'node_modules/package/index.js', 'build/output', 'a\\b']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                build.safe_name(name)

    def test_docker_context_matches_source_manifest(self):
        manifest = json.loads((build.ROOT / 'scripts/package-manifest.json').read_text())
        rules = (build.ROOT / '.dockerignore').read_text().splitlines()
        allowed_files = {rule[1:] for rule in rules if rule.startswith('!') and not rule.endswith('/')}
        self.assertEqual(allowed_files, set(manifest['source']))
        self.assertIn('**/.env', rules)
        self.assertIn('**/.env.*', rules)

    def test_release_gate_rejects_missing_decisions_and_truthy_strings(self):
        decisions = {
            'status': 'ready-for-publication',
            'repository_url': 'https://github.com/owner/timer',
            'security_contact': 'https://github.com/owner/timer/security/advisories/new',
            **{key: True for key in build.APPROVALS},
        }
        path = self.root / 'release-readiness.json'
        path.write_text(json.dumps(decisions))
        build.release_gate(self.root)
        for key in build.APPROVALS:
            changed = {**decisions, key: 'true'}
            path.write_text(json.dumps(changed))
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'Release gate pending'):
                build.release_gate(self.root)
        path.write_text(json.dumps({**decisions, 'security_contact': '未確定'}))
        with self.assertRaisesRegex(ValueError, 'security_contact'):
            build.release_gate(self.root)


if __name__ == '__main__':
    unittest.main()
