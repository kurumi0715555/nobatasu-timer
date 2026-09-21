#!/usr/bin/env python3
"""Local-only rsync rehearsal with synthetic files; never connects to a host."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def put(root, name, content):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def hashes(root):
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob('*') if path.is_file()}


def run(rsync, source, target, filters=(), dry_run=False):
    command = [rsync, '-avzr', '--delete', '--delete-excluded']
    if dry_run:
        command.append('--dry-run')
    command.extend(filters)
    # Both endpoints are generated absolute local paths, not remote host syntax.
    command.extend([str(source) + '/', str(target) + '/'])
    result = subprocess.run(command, check=False, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('rsync fixture command failed: ' + result.stderr.strip())


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run_legacy_allowlist(rsync, source, target, dry_run=False):
    # Synthetic ownership example: no synchronization ever targets the site root.
    for name in ('common', 'lottery'):
        run(rsync, source / name, target / name, dry_run=dry_run)
    # Root files are individually copied without any deletion switches.
    command = [rsync, '-avzr']
    if dry_run:
        command.append('--dry-run')
    command.extend([str(source / 'index.html'), str(target / 'index.html')])
    subprocess.run(command, check=True, text=True, capture_output=True)


def main():
    rsync = shutil.which('rsync')
    if not rsync:
        raise SystemExit('UNVERIFIED: rsync is unavailable; no remote operations performed')
    version = subprocess.run([rsync, '--version'], check=True, capture_output=True,
                             text=True).stdout.splitlines()[0]
    with tempfile.TemporaryDirectory(prefix='timer-rsync-rehearsal-') as directory:
        base = Path(directory)
        legacy, live, release_a, release_b = [base / name for name in
                                               ('legacy', 'live', 'release-a', 'release-b')]
        for root in (legacy, live, release_a, release_b):
            root.mkdir()
        put(legacy, 'timer/index.html', 'legacy timer must not overwrite the independent app')
        put(legacy, 'lottery/index.html', 'unrelated app v2')
        put(legacy, 'common/site.css', 'old shared assets remain under legacy ownership')
        put(legacy, 'docs/internal.md', 'synthetic excluded material')
        put(legacy, 'index.html', 'site index revision two')
        put(live, 'index.html', 'previous site index')
        put(live, 'lottery/index.html', 'unrelated previous app')
        put(live, 'unowned/keep.txt', 'not owned by either deployment')
        (live / 'common').mkdir()
        for root, content in ((release_a, 'known-good-version-a'),
                              (release_b, 'new-version-b-with-different-length')):
            put(root, 'index.html', content)
            put(root, 'common/timer.css', 'self-contained CSS: ' + content)
            put(root, 'source/timer-source.zip', 'synthetic source fixture: ' + content)
        (live / 'timer').mkdir()
        run(rsync, release_a, live / 'timer')
        good = hashes(live / 'timer')
        before_dry_run = hashes(live)
        run_legacy_allowlist(rsync, legacy, live, dry_run=True)
        require(hashes(live) == before_dry_run, 'dry-run unexpectedly changed files')
        run_legacy_allowlist(rsync, legacy, live)
        require(hashes(live / 'timer') == good,
                'allowlisted legacy deployment modified Timer; rsync implementation=' + version)
        require((live / 'lottery/index.html').read_text() == 'unrelated app v2',
                'legacy deployment did not update its own app')
        require((live / 'index.html').read_text() == 'site index revision two',
                'legacy deployment did not copy its allowed root file')
        require((live / 'unowned/keep.txt').exists(), 'legacy deployment deleted unowned data')
        require(not (live / 'docs').exists(), 'legacy excluded files were published')
        # Retiring the legacy source must not delete the independent destination.
        (legacy / 'timer').rename(base / 'retired-legacy-timer')
        run_legacy_allowlist(rsync, legacy, live)
        require(hashes(live / 'timer') == good, 'legacy deployment deleted protected Timer')
        outside_before = {key: value for key, value in hashes(live).items()
                          if not key.startswith('timer/')}
        run(rsync, release_b, live / 'timer')
        require(hashes(live / 'timer') == hashes(release_b), 'new Timer release was not installed')
        outside_after = {key: value for key, value in hashes(live).items()
                         if not key.startswith('timer/')}
        require(outside_before == outside_after, 'new Timer deployment changed another app')
        run(rsync, release_a, live / 'timer')
        require(hashes(live / 'timer') == good, 'Timer-only rollback failed')
        require({key: value for key, value in hashes(live).items()
                 if not key.startswith('timer/')} == outside_before,
                'Timer rollback changed another app')
        # Negative control: a sender exclusion alone does not protect receiver data.
        run(rsync, legacy, live, ['--exclude=/timer/***', '--exclude=docs/'])
        require(not (live / 'timer/index.html').exists(),
                'Negative control did not reproduce --delete-excluded deletion')
    print(json.dumps({
        'status': 'PASS-local-fixtures-only', 'rsync': version,
        'cases': ['dry-run unchanged', 'legacy cannot overwrite Timer',
                  'legacy cannot delete retired Timer', 'new release touches Timer only',
                  'rollback restores Timer and corresponding source only',
                  'allowed root file copied without root deletion',
                  'unowned directory retained',
                  'ordinary exclusion reproduces destructive deletion'],
        'not_verified': ['GitHub Actions rsync image', 'Xserver rsync/version/permissions',
                         'real legacy release artifact', 'cross-repository release exclusion'],
        'ownership_example': {'legacy_directories': ['common/', 'lottery/'],
                              'legacy_root_files_without_deletion': ['index.html'],
                              'new_app_directory': 'timer/'},
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.SubprocessError) as error:
        print(json.dumps({'status': 'HOLD', 'reason': str(error),
                          'scope': 'Synthetic local files only; no remote changes'},
                         ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1)
