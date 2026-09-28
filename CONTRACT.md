# Frank's Maintenance Bots: per-machine data contract (V 1.1)

Live app: https://shootngo.github.io/frank-maintenance-bots/
Repo: `shootngo/frank-maintenance-bots`, branch `main`. Pages deploys via `.github/workflows/pages.yml` on every push to `main` (and on `workflow_dispatch`).

## 0. Golden rules for parallel workers

1. **Only add or modify files under `data/machines/<slug>/`** (plus your own one-time workflow `.github/workflows/materialize-<slug>.yml`, which you must delete when you're done).
2. **Never edit shared files**: `index.html`, `js/*`, `css/*`, `sw.js`, `data/machines.json`, `data/index.json`, `data/pages-NN.json`, `data/parts.json`, `data/img/*`, `.github/workflows/pages.yml`, `CONTRACT.md`. The integrator owns these.
3. MF 135 is the legacy machine. Its data stays at `data/index.json`, `data/pages-NN.json` and `data/img/`. Don't touch it.
4. Keep every JSON file **under 15 KB** (shard the pages). Each image should be ≤ ~15 KB WebP.
5. Push small commits. Each commit has to stand on its own, so a partial success still leaves the site working.

## 1. Slugs (registry = `data/machines.json`, integrator-owned)

| slug | name | meter unit (service log) |
|---|---|---|
| `mf-135` | Massey Ferguson 135 (legacy, already live) | hours |
| `jd-f725` | John Deere F725 | hours |
| `ford-f250-2017` | 2017 Ford F-250 | miles |
| `subaru-forester-2020` | 2020 Subaru Forester | miles |
| `ryobi-zt` | Ryobi Zero-Turn | hours |

## 2. Folder layout

```
data/machines/<slug>/
  manifest.json        # REQUIRED: the switch that turns the machine on
  pages-00.json        # page shards (<15 KB each), same schema as data/pages-NN.json
  pages-01.json ...
  parts.json           # optional
  refs.json            # optional (community / forum / reference notes)
  img/0012.webp ...    # diagram images, referenced by page.image
  staging/             # TEMPORARY base64 chunks for binaries; must be empty/deleted at the end
```

## 3. `manifest.json`

A placeholder already exists for every non-MF slug with `"status": "soon"`, which makes the app show "(soon)". **To go live, overwrite it** (update the existing file, passing its current blob `sha`) with:

```json
{
  "slug": "jd-f725",
  "name": "John Deere F725",
  "manuals": [
    { "id": "jd-f725-om", "title": "John Deere F725 - Operator's Manual", "pages": 96,
      "source": "http://manuals.deere.com/cceomview/OMM134807_A9/Output/Index.html" }
  ],
  "pageShards": ["pages-00.json", "pages-01.json"],
  "parts": "parts.json",
  "refs": "refs.json"
}
```

How the app reads it:
- 404, `"status": "soon"`, or an empty `pageShards` → the machine shows **(soon)** and can't be selected.
- Otherwise the machine becomes selectable. Its pages, parts and refs merge into search, parts lookup and symptom checks, and the machine chip row acts as the filter ("All" searches every machine).
- All paths in the manifest are relative to `data/machines/<slug>/`.
- `parts` and `refs` are optional. A missing file is ignored.
- **Order matters: push shards, parts, refs and images first, and flip the manifest last.**

## 4. Page shard schema (`pages-NN.json`), identical to `data/pages-NN.json`

A JSON **array** (an `{"pages": [...]}` wrapper also works):

```json
[
  {
    "id": "jd-f725-om-p42",
    "machine": "jd-f725",
    "type": "manual-page",
    "title": "JD F725 · John Deere F725 - Operator's Manual p.42",
    "text": "Plain OCR/extracted text of the page…",
    "page": 42,
    "manualTitle": "John Deere F725 - Operator's Manual",
    "isDiagram": true,
    "image": "0042.webp"
  }
]
```

- `id`: globally unique. Prefix it with the slug.
- `machine` must equal the slug. The app forces it anyway.
- `type`: `manual-page` for manual pages.
- `image`: optional, and **relative to `data/machines/<slug>/img/`**. So `"0042.webp"` resolves to `data/machines/<slug>/img/0042.webp`. (`"img/0042.webp"` also works.) Omit `image` if there's no diagram. Never reference an image that isn't committed yet, because that shows a broken thumbnail and a 404.
- `isDiagram: true` gets a boost for "diagram / belt routing / where is…" questions.

## 5. `parts.json`

```json
{ "parts": [
  { "id": "jd-f725-oil-filter", "machine": "jd-f725", "name": "Engine oil filter", "category": "filter",
    "oem":   [{ "number": "AM125424", "brand": "John Deere", "confidence": "verify", "source": "Operator's manual p.60" }],
    "cross": [{ "number": "51394", "brand": "Wix", "confidence": "verify", "source": "forum X" }],
    "notes": "Check engine serial range.", "keywords": ["oil filter", "engine filter"] }
] }
```

`confidence` is one of `official` | `verify` | `community`.

## 6. `refs.json` (community and reference notes, searchable)

```json
{ "refs": [
  { "id": "jd-f725-ref-001", "machine": "jd-f725", "type": "reference", "title": "MyTractorForum: deck belt keeps coming off",
    "text": "Summary of the fix…", "url": "https://…" }
] }
```

`type` is `reference` or `reference-notes`. Refs appear under "From the community", and so do their source links.

## 7. Pushing text files

Use the GitHub MCP (`create_or_update_file` or `push_files`) with owner `shootngo`, repo `frank-maintenance-bots`, branch `main`. Commit message: `V 1.1: <slug> <what>`.
- To update an existing file you need its current blob `sha`. Get it from `get_file_contents` or from the previous call's response.
- Verify a push by comparing the returned blob `sha` with `git hash-object <localfile>`.

## 8. Pushing binaries (WebP) with a one-time workflow

The MCP only carries text, so binaries go through base64 staging plus a one-time workflow **named uniquely per slug**.

1. Stage each image as base64 text, 76-char lines (Python `base64.encodebytes`): `data/machines/<slug>/staging/<name>.webp.b64`. One file per commit is fine. Or put several in one `push_files` call.
2. Push the workflow `.github/workflows/materialize-<slug>.yml`, using the template below with `SLUG` replaced. It runs on its own push and whenever `data/machines/<slug>/staging/BATCH` changes.
3. Every ~10 images, create or update `data/machines/<slug>/staging/BATCH` (any counter text) to trigger a bake. That way partial progress lands.
4. The bot commit writes `data/machines/<slug>/img/<name>.webp` and removes the consumed `.b64` files. It then dispatches `pages.yml`. Bot pushes don't trigger Pages on their own, so this step is what deploys the result.
5. Verify with `curl -s -o /dev/null -w '%{http_code}' https://shootngo.github.io/frank-maintenance-bots/data/machines/<slug>/img/<name>.webp` (expect 200) and compare its md5 with the local file.
6. **Cleanup (required):** delete `.github/workflows/materialize-<slug>.yml` and `data/machines/<slug>/staging/BATCH` via MCP `delete_file`. Confirm no `.b64` files remain under `staging/`. Your last normal push (the delete) triggers pages.yml. Confirm that deploy succeeds.

**Push conflicts:** if an MCP push fails with a conflict or "sha does not match" error (another worker or the bot pushed first), re-fetch the file's current `sha` (or refs) with `get_file_contents` or `list_commits`, then retry. Never force-push. The workflow itself retries `git pull --rebase` up to 5 times.

Template (`.github/workflows/materialize-SLUG.yml`):

```yaml
name: Materialize SLUG binaries (one-shot)
on:
  push:
    branches: [main]
    paths:
      - '.github/workflows/materialize-SLUG.yml'
      - 'data/machines/SLUG/staging/BATCH'
  workflow_dispatch:
permissions:
  contents: write
  actions: write
concurrency:
  group: materialize-SLUG
  cancel-in-progress: false
jobs:
  bake:
    runs-on: ubuntu-latest
    env:
      SLUG: SLUG
    steps:
      - uses: actions/checkout@v4
        with: { ref: main }
      - name: Decode staged files
        run: |
          set -euo pipefail
          git pull --ff-only origin main
          python3 - <<'PY'
          import base64, glob, os, struct, subprocess
          slug = os.environ['SLUG']; st = f'data/machines/{slug}/staging'; out = f'data/machines/{slug}/img'
          os.makedirs(out, exist_ok=True); ok = bad = 0
          for f in sorted(glob.glob(f'{st}/*.b64')):
              name = os.path.basename(f)[:-4]
              b = base64.b64decode(open(f).read())
              if name.endswith('.webp') and (b[:4] != b'RIFF' or b[8:12] != b'WEBP' or struct.unpack('<I', b[4:8])[0] + 8 != len(b)):
                  print('::warning::incomplete webp', name); bad += 1; continue
              open(f'{out}/{name}', 'wb').write(b)
              subprocess.run(['git', 'rm', '-q', f], check=True)
              subprocess.run(['git', 'add', f'{out}/{name}'], check=True); ok += 1
          print('materialized', ok, 'bad', bad)
          PY
      - name: Commit as bot and push (retry on conflict)
        run: |
          set -euo pipefail
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if git diff --cached --quiet; then echo "nothing to commit"; exit 0; fi
          git commit -q -m "V 1.1: ${SLUG} images (materialized from staging)"
          for i in 1 2 3 4 5; do
            if git push origin HEAD:main; then break; fi
            sleep $((i*3)); git pull --rebase origin main
            [ "$i" = 5 ] && exit 1
          done
      - name: Deploy Pages
        env: { GH_TOKEN: '${{ github.token }}' }
        run: gh workflow run pages.yml --ref main || true
```

Rules: one workflow file per slug, **never** reuse or edit another slug's workflow, and never touch `pages.yml`.

## 9. Service Log (built into the app, nothing for workers to do)

Every machine in `data/machines.json` gets a Service Log (☰ → Service log), even before its manuals are live. Entries are stored on the device in IndexedDB (`fmb-servicelog` / `entries`). Export/import uses this JSON:

```json
{ "kind": "fmb-service-log", "version": 1, "exported": "ISO time",
  "entries": [ { "id": "sl-…", "machine": "ford-f250-2017", "date": "2026-09-28", "meter": 48210, "meterUnit": "miles",
                 "done": "Oil + filter change", "parts": "Motorcraft FL-2051S, 13 qt 10W-30", "cost": 89.5,
                 "notes": "", "photo": "data:image/jpeg;base64,… or null", "created": 0, "updated": 0 } ] }
```

The Service Log has no reminders, schedules or "due" logic. Nestor handles those.

## 10. Definition of done for a machine

- `manifest.json` is live with non-empty `pageShards`, and the chip is selectable on the live site.
- Every `image` referenced in the shards returns 200. The live page loads with no 404s and no console errors.
- No `staging/*.b64` files and no `materialize-<slug>.yml` remain in the repo. The last pages.yml run succeeded.
