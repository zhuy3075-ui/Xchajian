"""Create an Obsidian content vault without overwriting existing files."""
import argparse
import datetime as dt
import json
import re
import stat
import sys
from collections import deque
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / 'assets' / 'vault'
EMPTY_DIRS = ('01_收件箱/原始素材', '01_收件箱/AI待确认')


def emit(report):
    # ASCII JSON remains readable by tools on Windows legacy console encodings.
    print(json.dumps(report, ensure_ascii=True, indent=2))


def checked_path(root, relative):
    target = root / relative
    if Path(relative).is_absolute() or '..' in Path(relative).parts:
        raise ValueError(f'Invalid relative path: {relative}')
    cursor = root
    for part in Path(relative).parts:
        cursor = cursor / part
        if cursor.is_symlink() or (
            cursor.exists() and getattr(cursor.lstat(), 'st_file_attributes', 0)
            & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0)
        ):
            raise ValueError(f'Refusing redirected target: {cursor}')
        if cursor.exists() and cursor != target and not cursor.is_dir():
            raise ValueError(f'Parent is not a directory: {cursor}')
    if not target.resolve().is_relative_to(root):
        raise ValueError(f'Target escapes vault: {target}')
    return target


def asset_paths():
    paths = sorted(p.relative_to(ASSETS).as_posix() for p in ASSETS.rglob('*.md'))
    if not paths or 'VAULT_INDEX.md' not in paths:
        raise ValueError(f'Missing vault assets: {ASSETS}')
    return paths


def verify(root):
    errors, graph = [], {}
    paths = asset_paths()
    links, templates, properties_count = 0, 0, 0
    for relative in paths:
        path = checked_path(root, relative)
        if not path.is_file():
            errors.append(f'Missing document: {relative}')
            continue
        text = path.read_text(encoding='utf-8')
        if '\ufffd' in text or re.search(r'@@[A-Z_]+@@', text):
            errors.append(f'Invalid text or unresolved build token: {relative}')
        if len(re.findall(r'^```', text, re.M)) % 2:
            errors.append(f'Unbalanced code fences: {relative}')
        graph[relative] = []
        for item in re.findall(r'\[\[([^\[\]\n]+)\]\]', text):
            target = item.split('|', 1)[0].split('#', 1)[0]
            if not target:
                continue
            target = target if target.endswith('.md') else target + '.md'
            destination = checked_path(root, target)
            if not destination.is_file():
                errors.append(f'Broken link: {relative} -> {target}')
            else:
                graph[relative].append(target)
            links += 1
        fields = {}
        if text.startswith('---\n'):
            match = re.match(r'^---\n(.*?)\n---(?:\n|$)', text, re.S)
            if not match:
                errors.append(f'Unclosed properties: {relative}')
            else:
                properties_count += 1
                for line in match[1].splitlines():
                    if not re.match(r'^[^:#\[\]{}]+: ', line):
                        errors.append(f'Unsupported property line: {relative}: {line}')
                        continue
                    key, value = line.split(': ', 1)
                    if key in fields:
                        errors.append(f'Duplicate property: {relative}: {key}')
                    fields[key] = value
                    if value.startswith('"'):
                        try:
                            json.loads(value)
                        except json.JSONDecodeError:
                            errors.append(f'Invalid quoted value: {relative}: {key}')
                    elif value.startswith('['):
                        if not value.endswith(']'):
                            errors.append(f'Invalid list: {relative}: {key}')
                    elif any(t in value for t in (': ', ' #', '{', '}')):
                        errors.append(f'Unsafe plain value: {relative}: {key}')
        if relative.startswith('90_模板/'):
            templates += 1
            required = ['类型', '状态', '创建日期', '主题', 'tags']
            if fields.get('类型') in ['提炼卡片', '个人观点']:
                required += ['来源笔记', '证据状态', '观点归属', '本人确认']
                if fields.get('本人确认') != 'false':
                    errors.append(f'Invalid confirmation default: {relative}')
            for key in required:
                if key not in fields:
                    errors.append(f'Missing property: {relative}: {key}')
            text = text.replace('{{title}}', '示例').replace('{{date:YYYY-MM-DD}}', '2000-01-01')
        if re.search(r'\{\{.*?\}\}', text):
            errors.append(f'Unexpected template variable: {relative}')
    reached, pending = set(), deque(['VAULT_INDEX.md'])
    while pending:
        current = pending.popleft()
        if current not in reached:
            reached.add(current)
            pending.extend(graph.get(current, []))
    for relative in paths:
        if relative not in reached:
            errors.append(f'Unreachable from homepage: {relative}')
    return {'documents': len(paths), 'templates': templates, 'links': links,
            'property_blocks_checked_with_limited_schema': properties_count,
            'reachable_documents': len(set(paths) & reached), 'errors': errors,
            'not_tested': ['Obsidian UI', 'AI plugin flow', 'External source accuracy']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vault', required=True)
    parser.add_argument('--name')
    parser.add_argument('--date')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--configure-templates', action='store_true')
    args = parser.parse_args()
    report = {'created': [], 'unchanged': [], 'conflicts': [], 'errors': []}
    try:
        requested = Path(args.vault).expanduser()
        if not requested.is_absolute():
            raise ValueError('The vault path must be absolute')
        root = requested.resolve()
        report['vault'] = str(root)
        if root.exists() and not root.is_dir():
            raise ValueError(f'Vault is not a directory: {root}')
        if args.verify:
            if args.apply or args.configure_templates:
                raise ValueError('--verify cannot be combined with write options')
            report['verification'] = verify(root)
            emit(report)
            return int(bool(report['verification']['errors']))
        if not args.date or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
            raise ValueError('--date YYYY-MM-DD is required for creation')
        dt.date.fromisoformat(args.date)
        name = args.name or root.name
        if not name.strip() or any(c in name for c in '\r\n') or '@@' in name:
            raise ValueError('Vault name must be a nonempty plain-text title')
        name = re.sub(r'([\\`*_{}\[\]<>])', r'\\\1', name)
        candidates = {}
        for relative in asset_paths():
            content = (ASSETS / relative).read_text(encoding='utf-8')
            content = content.replace('@@VAULT_NAME@@', name).replace('@@DATE@@', args.date)
            candidates[relative] = content.encode('utf-8')
        report['template_configuration'] = 'not_requested'
        if args.configure_templates:
            relative = '.obsidian/templates.json'
            config = checked_path(root, relative)
            if config.exists():
                report['template_configuration'] = 'preserved_existing'
                try:
                    value = json.loads(config.read_text(encoding='utf-8-sig'))
                    report['template_folder_matches'] = value.get('folder') == '90_模板'
                except (OSError, ValueError, AttributeError):
                    report['template_folder_matches'] = False
            else:
                candidates[relative] = (json.dumps({'folder': '90_模板', 'dateFormat': 'YYYY-MM-DD',
                                                   'timeFormat': 'HH:mm'}, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
                report['template_configuration'] = 'planned_new'
        planned = []
        for relative, content in candidates.items():
            target = checked_path(root, relative)
            if target.exists():
                if target.is_file() and target.read_bytes() == content:
                    report['unchanged'].append(relative)
                else:
                    report['conflicts'].append(relative)
            else:
                planned.append(relative)
        for relative in EMPTY_DIRS:
            target = checked_path(root, relative)
            if target.exists() and not target.is_dir():
                report['conflicts'].append(relative)
        report['planned'] = planned
        if report['conflicts']:
            emit(report)
            return 2
        if not args.apply:
            report['mode'] = 'preview'
            emit(report)
            return 0
        root.mkdir(parents=True, exist_ok=True)
        for relative in EMPTY_DIRS:
            checked_path(root, relative).mkdir(parents=True, exist_ok=True)
        for relative in planned:
            target = checked_path(root, relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            checked_path(root, relative)
            with target.open('xb') as stream:
                # Include partial writes in the report if a later write fails.
                report['created'].append(relative)
                stream.write(candidates[relative])
        if report['template_configuration'] == 'planned_new':
            report['template_configuration'] = 'created'
        report['mode'] = 'applied'
        report['verification'] = verify(root)
        emit(report)
        return int(bool(report['verification']['errors']))
    except (OSError, ValueError) as error:
        report['errors'].append(str(error))
        emit(report)
        return 1


if __name__ == '__main__':
    sys.exit(main())
