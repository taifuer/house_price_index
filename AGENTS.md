# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Python scraper and Streamlit dashboard for the National Bureau of Statistics 70-city housing price index.

- `scripts/fetch_stats.py`: CLI scraper, search API discovery, HTML parser, and CSV/JSON exporter.
- `scripts/fetch_context_data.py`: fetches optional BIS residential property price bulk CSV data for international comparison.
- `app.py`: Streamlit dashboard. It prefers `data/house_price_index_all.csv.gz`, falls back to `data/house_price_index_all.csv`, then `data/house_price_index.csv`. The UI defaults to `二手住宅`, includes ranking, distribution, tier comparison, and price trend views, and links the current filter title to the source page through an icon.
- `.streamlit/config.toml`: Streamlit viewer toolbar configuration.
- `assets/favicon.ico`: dashboard favicon asset.
- `data/`: committed app data. The GitHub-oriented `main` branch keeps only `house_price_index_all.csv.gz`, which is the compressed CSV the dashboard reads at runtime.
- `requirements.txt`: runtime dependencies.
- `README.md`: user setup, scraping, and visualization instructions.

There is no dedicated `tests/` directory yet. Add one when parser rules or data transformations grow.

## Build, Test, and Development Commands

Install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Fetch all discovered history:

```bash
python3 scripts/fetch_stats.py --all-history \
  --out data/house_price_index_all.csv
gzip -n -9 -f data/house_price_index_all.csv
```

Incrementally update future months:

```bash
python3 scripts/fetch_stats.py --incremental \
  --existing data/house_price_index_all.csv.gz \
  --out data/house_price_index_all.csv.gz
```

Incremental mode only fetches periods newer than the current max `period`. Months not present in the NBS search API are recorded in `data/house_price_index_missing.json` instead of probing guessed URLs.

Fetch international context data:

```bash
python3 scripts/fetch_context_data.py
```

The context script writes `data/context_bis_prices.csv.gz` and `data/context_sources.json`.

Run the dashboard:

```bash
streamlit run app.py
```

Run a syntax check:

```bash
python3 -m py_compile scripts/fetch_stats.py scripts/fetch_context_data.py app.py
```

## Coding Style & Naming Conventions

Use Python 3.11+ conventions: 4-space indentation, descriptive `snake_case` names, and type hints for public helpers. Keep parsing logic explicit and validation-oriented. Prefer standard-library parsing unless a dependency clearly reduces risk.

For dashboard changes, preserve the current Streamlit-first layout unless a replacement is explicitly requested. Trend charts should keep complete year labels, expose missing-data notes when coverage is incomplete, and avoid hiding data gaps without clear annotation.

Preserve the long-table output schema:

```text
period,table_no,table_name,house_type,size_band,city,metric,base,value,change_pct,source_url,title
```

Keep generated files under `data/`; do not hard-code local paths or credentials.

## Testing Guidelines

No automated suite is configured. For parser edits, run `py_compile`, fetch one modern page, and test at least one historical migration page. Modern complete months should produce `1,680` records, except January months, which produce `1,120` records because they lack cumulative-average columns. Older pages may legitimately contain only partial tables; check coverage by grouping `data/house_price_index_all.csv.gz` by `period` and `table_no`.

If adding tests, use `tests/test_*.py` and include fixtures for split city names, January two-metric tables, and missing historical tables.

## Commit & Pull Request Guidelines

Use concise imperative commit messages, for example `Add search API candidate retry`.

Commits made by agents must use this author:

```bash
git commit --author="taifu <taifu@taifua.com>"
```

Agent-assisted commit messages must include this trailer in the message body:

```text
Co-Authored-By: Codex (GPT-5.5) <noreply@openai.com>
```

Pull requests should include:

- What changed and why.
- Commands used for verification.
- Data coverage changes, especially new partial-month behavior.
- Screenshots for dashboard UI changes.

## Security & Configuration Tips

Respect the source site: avoid tight crawl loops and keep retry behavior conservative. Do not commit virtual environments, credentials, large raw image dumps, or temporary debug CSV files unless they are intentional fixtures.
