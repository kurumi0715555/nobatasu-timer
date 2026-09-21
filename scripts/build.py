#!/usr/bin/env python3
"""Create a static distribution and its corresponding source using stdlib only."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
from urllib.parse import urlsplit
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FORMAT = 'timer-distribution-v1'
SKIP_ROOT = {'.git', 'build', 'node_modules', 'test-results', 'playwright-report'}
APPROVALS = ('project_rights_confirmed', 'brand_terms_approved',
             'source_distribution_verified', 'release_qa_approved', 'public_operations_approved',
             'security_reporting_verified')


def safe_name(name):
    if not isinstance(name, str) or not name or '\\' in name:
        raise ValueError('Invalid manifest path')
    path = PurePosixPath(name)
    if path.is_absolute() or path.as_posix() != name or any(
        p in {'.', '..', '.git', 'node_modules', 'build'} or p.startswith('.env')
        for p in path.parts
    ):
        raise ValueError('Forbidden manifest path: ' + name)
    return name


def regular_file(root, name):
    path = root
    for part in PurePosixPath(safe_name(name)).parts:
        path = path / part
        if path.is_symlink():
            raise ValueError('Symlink rejected: ' + name)
    if not path.is_file():
        raise ValueError('Missing regular file: ' + name)
    return path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def release_gate(root):
    readiness = json.loads(regular_file(root, 'release-readiness.json').read_text())
    pending = [key for key in APPROVALS if readiness.get(key) is not True]
    if readiness.get('status') != 'ready-for-publication':
        pending.append('status=ready-for-publication')
    repository = readiness.get('repository_url', '')
    if not isinstance(repository, str) or not re.fullmatch(
        r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository
    ) or any(x in repository.lower() for x in ('example', 'placeholder', '<', '>')):
        pending.append('repository_url')
    contact = readiness.get('security_contact', '')
    valid_contact = False
    if isinstance(contact, str) and contact.strip() == contact:
        parts = urlsplit(contact)
        valid_contact = bool(
            (parts.scheme == 'https' and parts.hostname and not parts.username and not parts.password)
            or re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', contact)
        )
        if any(x in contact.lower() for x in ('example.', 'placeholder', '未確定', 'todo')):
            valid_contact = False
    if not valid_contact:
        pending.append('security_contact')
    if pending:
        raise ValueError('Release gate pending: ' + ', '.join(pending))


def inventory(root, skip_dev=False):
    result = set()
    for directory, dirs, files in os.walk(root, followlinks=False):
        relative = Path(directory).relative_to(root)
        for name in list(dirs):
            path = Path(directory) / name
            if skip_dev and relative == Path('.') and name in SKIP_ROOT:
                if path.is_symlink():
                    raise ValueError('Symlink rejected: ' + name)
                dirs.remove(name)
                continue
            if skip_dev and name == '__pycache__':
                if path.is_symlink():
                    raise ValueError('Symlink rejected: ' + str(path.relative_to(root)))
                dirs.remove(name)
                continue
            if path.is_symlink():
                raise ValueError('Symlink rejected: ' + str(path.relative_to(root)))
        for name in files:
            path = Path(directory) / name
            rel = path.relative_to(root).as_posix()
            # Inspect only filenames; never read secret files.
            if name.startswith('.env'):
                raise ValueError('Secret filename rejected without reading it: ' + rel)
            if path.is_symlink():
                raise ValueError('Symlink rejected: ' + rel)
            if skip_dev and (name == '.DS_Store' or name.endswith('.pyc')):
                continue
            result.add(rel)
    return result


def source_snapshot(root):
    manifest = json.loads(regular_file(root, 'scripts/package-manifest.json').read_text())
    if manifest.get('schema') != 1:
        raise ValueError('Unsupported package manifest')
    for key in ('runtime', 'source'):
        values = manifest[key]
        if not isinstance(values, list) or len(values) != len(set(values)):
            raise ValueError('Invalid or duplicate manifest entries: ' + key)
        for name in values:
            safe_name(name)
    if not set(manifest['runtime']) <= set(manifest['source']):
        raise ValueError('All runtime files must be included in source')
    actual = inventory(root, skip_dev=True)
    expected = set(manifest['source'])
    if actual != expected:
        raise ValueError('Source allowlist mismatch; missing=' + repr(sorted(expected-actual))
                         + '; unexpected=' + repr(sorted(actual-expected)))
    data = {name: regular_file(root, name).read_bytes() for name in sorted(expected)}
    return manifest, data


def check_previous_output(root):
    """Refuse to replace unknown files or externally modified build output."""
    build = root / 'build'
    if build.is_symlink():
        raise ValueError('Symlink rejected: build')
    if not build.exists():
        return {}
    if not build.is_dir():
        raise ValueError('build must be a directory')
    actual = inventory(build)
    if not actual:
        return {}
    metadata_path = regular_file(build, 'build-manifest.json')
    previous = json.loads(metadata_path.read_text())
    if previous.get('format') != FORMAT or not isinstance(previous.get('outputs'), dict):
        raise ValueError('Unknown build output; preserve and move it before rebuilding')
    outputs = previous['outputs']
    expected = {'site/' + safe_name(name) for name in outputs} | {'build-manifest.json'}
    if actual != expected:
        raise ValueError('Unexpected/missing build files; preserve build before rebuilding')
    for name, sha in outputs.items():
        if digest(regular_file(build, 'site/' + name).read_bytes()) != sha:
            raise ValueError('Modified build output; preserve it before rebuilding: ' + name)
    return outputs


def build(root=ROOT):
    manifest, data = source_snapshot(root)
    previous = check_previous_output(root)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
        for name, content in data.items():
            info = zipfile.ZipInfo('timer/' + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            zipped.writestr(info, content)
    output = {name: data[name] for name in manifest['runtime']}
    output['source/timer-source.zip'] = archive.getvalue()
    metadata = {
        'format': FORMAT,
        'notice': 'Local packaging success is not publication approval.',
        'sources': {name: digest(content) for name, content in data.items()},
        'outputs': {name: digest(content) for name, content in sorted(output.items())},
    }
    site = root / 'build/site'
    site.mkdir(parents=True, exist_ok=True)
    # Only remove previously generated, hash-verified files no longer in the manifest.
    for name in sorted(set(previous) - set(output)):
        regular_file(site, name).unlink()
    for name, content in sorted(output.items()):
        target = site / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    (root / 'build/build-manifest.json').write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Built {len(output)} web files and {len(data)} source files in build/site')
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate source allowlist without building')
    parser.add_argument('--release', action='store_true', help='Require recorded publication decisions; does not publish')
    args = parser.parse_args()
    try:
        if args.release:
            release_gate(ROOT)
        if args.check:
            manifest, _ = source_snapshot(ROOT)
            print(f"Source allowlist OK: {len(manifest['source'])} files")
        else:
            build()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print('Packaging refused: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
