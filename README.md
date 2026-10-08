# isitpe
Static site and curated JSON dataset tracking private equity, VC and public ownership of NYC food and consumer brands, with sourced, dated entries.

## Run locally

No build step. The page loads `data/brands.csv` with `fetch`, so it must be served over HTTP rather than opened as a file:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Data

`data/brands.csv` has one row per brand. `status` must be one of `pe_controlled`, `pe_backed`, `vc_backed`, `other_owner`, `public`. Multi-value fields (`owners`, `aliases`, `same_owner_also_owns`) are separated by `; `. Add common misspellings to `aliases` so search finds them.
