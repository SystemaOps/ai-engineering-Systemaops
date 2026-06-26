# Vendored Pyodide (self-hosted Python runtime)

These files are the **core Pyodide runtime**, vendored so the site runs Python
in the browser without any CDN dependency. Loaded lazily by `lesson.html`
(`ensurePyodide()`) on the first Run/Check, from `vendor/pyodide/` — with a CDN
fallback only if these files are missing.

- **Version:** `v0.26.2`
- **Files:** `pyodide.js`, `pyodide.asm.js`, `pyodide.asm.wasm`,
  `python_stdlib.zip`, `pyodide-lock.json` (~13.5 MB total; the `.wasm` is ~10 MB).

## Refreshing / upgrading

```sh
BASE=https://cdn.jsdelivr.net/pyodide/v0.26.2/full
for f in pyodide.js pyodide.asm.js pyodide.asm.wasm python_stdlib.zip pyodide-lock.json; do
  curl -sSf -o "$f" "$BASE/$f"
done
```

Bump the version string here and in `lesson.html` (`PYODIDE_CDN` + the `BASE`
above) together when upgrading.

## Repo-size note

The `.wasm` is a ~10 MB binary in git history. If you'd rather keep the repo
lean, move these to Git LFS or gitignore them and fetch on deploy with the
script above — the loader's CDN fallback means the site still works either way.
