# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Python scraper and a static React dashboard for the National Bureau of Statistics 70-city housing price index.

- `scripts/fetch_stats.py`: CLI scraper, search API discovery, HTML parser, and CSV/JSON exporter.
- `scripts/build_web_data.py`: validates the long-table CSV and generates compact browser-facing JSON matrices.
- `housing_constants.py`: shared city-tier and indicator ordering constants.
- `dashboard_trends.py`: testable aggregation helpers for overall and city-tier trend views.
- `web/`: production React, TypeScript, Vite, and ECharts dashboard. Static data lives in `web/public/data/`.
- `app.py`: migration fallback for the previous Streamlit dashboard; keep it working for regression comparison while it remains in the repository.
- `docker/`: Nginx configuration and runtime analytics configuration generator.
- `.streamlit/config.toml`: Streamlit viewer toolbar configuration.
- `assets/favicon.ico`: legacy ICO source; the web app also provides SVG and ICO favicon assets.
- `data/`: committed source data. The `dev` branch keeps `house_price_index_all.csv.gz`, from which browser data shards are generated.
- `requirements.txt`: runtime dependencies.
- `README.md`: user setup, scraping, and visualization instructions.
- `tests/`: regression tests for trend aggregation and scraper behavior.

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
python3 scripts/build_web_data.py
```

Incremental mode only fetches periods newer than the current max `period`. Months not present in the NBS search API are recorded in `data/house_price_index_missing.json` instead of probing guessed URLs.

Run the production frontend locally:

```bash
cd web
npm install
npm run dev
```

Run validation and tests:

```bash
python3 -m py_compile scripts/fetch_stats.py scripts/build_web_data.py housing_constants.py dashboard_runtime.py dashboard_trends.py app.py
python3 -m unittest discover -s tests
cd web
npm test
npm run build
npx playwright test
```

## Coding Style & Naming Conventions

Use Python 3.11+ conventions: 4-space indentation, descriptive `snake_case` names, and type hints for public helpers. Keep parsing logic explicit and validation-oriented. Prefer standard-library parsing unless a dependency clearly reduces risk.

For dashboard changes, preserve the React/ECharts interaction patterns and responsive layout. Trend charts should keep complete year labels, expose missing-data notes when coverage is incomplete, and avoid hiding data gaps without clear annotation. Keep the Streamlit fallback aligned when shared data semantics change materially.

Preserve the long-table output schema:

```text
period,table_no,table_name,house_type,size_band,city,metric,base,value,change_pct,source_url,title
```

Keep source exports under `data/` and browser matrices under `web/public/data/`; do not hard-code local paths or credentials.

## Testing Guidelines

For parser edits, run `py_compile` and the unit tests, fetch one modern page, and test at least one historical migration page. Modern complete months should produce `1,680` records, except January months, which produce `1,120` records because they lack cumulative-average columns. Older pages may legitimately contain only partial tables; check coverage by grouping `data/house_price_index_all.csv.gz` by `period` and `table_no`.

If adding Python tests, use `tests/test_*.py` and include fixtures for split city names, January two-metric tables, and missing historical tables. Add frontend unit tests under `web/src/**/*.test.ts` and browser workflow tests under `web/e2e/`.

## Commit & Pull Request Guidelines

Use concise imperative commit messages, for example `Add search API candidate retry`.

Commits made by agents must use this author:

```bash
git commit --author="taifu <taifu@taifua.com>"
```

Agent-assisted commit messages must include this trailer in the message body:

```text
Co-Authored-By: Codex (GPT-5.6 Sol) <noreply@openai.com>
```

Pull requests should include:

- What changed and why.
- Commands used for verification.
- Data coverage changes, especially new partial-month behavior.
- Screenshots for dashboard UI changes.

## Security & Configuration Tips

Respect the source site: avoid tight crawl loops and keep retry behavior conservative. Do not commit virtual environments, credentials, large raw image dumps, or temporary debug CSV files unless they are intentional fixtures.
