"""Download official CPU table models to this project's private engine directory.
Only run during installation. Runtime conversion supplies explicit local model paths.
"""
import hashlib, json, os, pathlib, tarfile, urllib.request
base = pathlib.Path(os.environ['PDF_STRUCTURE_HOME']) if os.environ.get('PDF_STRUCTURE_HOME') else pathlib.Path(__file__).resolve().parents[1] / '.local-tools' / 'pdf-structure'
models = json.loads((pathlib.Path(__file__).parent / 'pdf-structure-models.json').read_text())
root = base / 'models'
root.mkdir(parents=True, exist_ok=True)
records = []
for spec in models:
    name, url = spec['name'], spec['url']
    archive = root / (name + '.tar')
    if not archive.exists():
        with urllib.request.urlopen(url, timeout=60) as response, archive.open('wb') as file:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > 400 * 1024 * 1024: raise ValueError('Model archive exceeds 400 MB')
                file.write(chunk)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != spec['sha256'] or archive.stat().st_size != spec['bytes']:
        archive.unlink()
        raise ValueError('Model checksum mismatch: ' + name)
    target = root / name
    target.mkdir(exist_ok=True)
    with tarfile.open(archive) as file:
        members = file.getmembers()
        if sum(item.size for item in members) > 1024 * 1024 * 1024: raise ValueError('Model expands beyond 1 GB')
        for item in members:
            if item.issym() or item.islnk(): raise ValueError('Model archive links are forbidden')
            if not item.isfile(): continue
            parts = pathlib.PurePosixPath(item.name).parts
            if '..' in parts or item.name.startswith('/'): raise ValueError('Unsafe archive entry')
            # Official archives contain a single package root.
            relative = pathlib.Path(*parts[1:]) if len(parts) > 1 else pathlib.Path(parts[0])
            output = target / relative; output.parent.mkdir(parents=True, exist_ok=True)
            with file.extractfile(item) as source, output.open('wb') as destination:
                while chunk := source.read(1024 * 1024): destination.write(chunk)
    records.append({'name': name, 'url': url, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'bytes': archive.stat().st_size})
    print(name, archive.stat().st_size, flush=True)
(base / 'models-manifest.json').write_text(json.dumps(records, indent=2))
