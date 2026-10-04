"""Package only files needed by Chrome; fail if manifest references are missing."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'manifest.json').read_text())
files = {'manifest.json', 'shared.js', 'background.js', 'content.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'styles.css', 'options.css', 'LICENSE'}
files.update(manifest.get('icons', {}).values())
files.update(manifest.get('action', {}).get('default_icon', {}).values())
for path in files:
    if not (ROOT / path).is_file():
        raise SystemExit(f'Missing extension file: {path}')
destination = ROOT / 'dist' / f'youtube-focus-mode-{manifest["version"]}.zip'
destination.parent.mkdir(exist_ok=True)
with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(ROOT / path, path)
print(destination.name)
