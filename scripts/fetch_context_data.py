#!/usr/bin/env python3
"""Fetch BIS residential property price context data."""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import sys
import zipfile
from pathlib import Path

import pandas as pd
import requests


BIS_RPP_ZIP_URL = "https://data.bis.org/static/bulk/WS_SPP_csv_flat.zip"
DEFAULT_INTERNATIONAL_OUT = Path("data/context_bis_prices.csv.gz")
DEFAULT_SOURCES_OUT = Path("data/context_sources.json")
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
INTERNATIONAL_AREAS = {
    "CN": "中国",
    "US": "美国",
    "GB": "英国",
    "DE": "德国",
    "JP": "日本",
    "KR": "韩国",
}


def csv_text_writer(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".gz":
        raw_file = path.open("wb")
        gzip_file = gzip.GzipFile(fileobj=raw_file, mode="wb", mtime=0)
        return io.TextIOWrapper(gzip_file, encoding="utf-8-sig", newline="")
    return path.open("w", newline="", encoding="utf-8-sig")


def write_csv(records: list[dict], output_path: Path, fieldnames: list[str]) -> None:
    with csv_text_writer(output_path) as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)


def fetch_international_prices(start_period: str) -> tuple[list[dict], list[dict]]:
    response = requests.get(BIS_RPP_ZIP_URL, headers={"User-Agent": USER_AGENT}, timeout=60)
    response.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        csv_name = next(name for name in archive.namelist() if name.endswith(".csv"))
        data = pd.read_csv(archive.open(csv_name))

    filtered = data[
        (data["VALUE:Value"].eq("N: Nominal"))
        & (data["UNIT_MEASURE:Unit of measure"].eq("628: Index, 2010 = 100"))
    ].copy()
    filtered["area_code"] = filtered["REF_AREA:Reference area"].str.extract(r"^([^:]+):")
    filtered = filtered[filtered["area_code"].isin(INTERNATIONAL_AREAS)]
    filtered = filtered[filtered["TIME_PERIOD:Time period or range"] >= start_period]

    records = [
        {
            "period": row["TIME_PERIOD:Time period or range"],
            "country_code": row["area_code"],
            "country": INTERNATIONAL_AREAS[row["area_code"]],
            "metric": "名义住宅价格指数",
            "unit": "2010=100",
            "value": f"{float(row['OBS_VALUE:Observation Value']):g}",
            "source": "BIS",
            "source_url": BIS_RPP_ZIP_URL,
        }
        for _, row in filtered.sort_values(["area_code", "TIME_PERIOD:Time period or range"]).iterrows()
    ]
    sources = [
        {
            "dataset": "international_prices",
            "title": "BIS selected residential property prices",
            "url": BIS_RPP_ZIP_URL,
        }
    ]
    return records, sources


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(DEFAULT_INTERNATIONAL_OUT), help="输出 CSV 或 CSV.GZ 路径")
    parser.add_argument("--sources-out", default=str(DEFAULT_SOURCES_OUT), help="数据来源说明 JSON 路径")
    parser.add_argument("--start", default="2011-Q1", help="起始季度，例如 2011-Q1")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    records, sources = fetch_international_prices(args.start)
    write_csv(
        records,
        Path(args.out),
        ["period", "country_code", "country", "metric", "unit", "value", "source", "source_url"],
    )
    Path(args.sources_out).write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"写入 {args.out}，共 {len(records)} 条记录")
    print(f"写入 {args.sources_out}，共 {len(sources)} 条来源记录")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
