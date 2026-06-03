#!/usr/bin/env python3
"""Fetch country demographic indicators from UN World Population Prospects."""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Iterable
from urllib.parse import quote
from xml.etree import ElementTree as ET

import requests


WPP_COMPACT_PATH = (
    "assets/Excel Files/1_Indicator (Standard)/EXCEL_FILES/1_General/"
    "WPP2024_GEN_F01_DEMOGRAPHIC_INDICATORS_COMPACT.xlsx"
)
WPP_COMPACT_URL = f"https://population.un.org/wpp/{quote(WPP_COMPACT_PATH, safe='/()')}"
DEFAULT_OUT = Path("data/context_demography_countries.csv.gz")
DEFAULT_SOURCES_OUT = Path("data/context_demography_sources.json")
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
TARGET_ISO2_TO_CN = {
    "CN": "中国",
    "US": "美国",
    "JP": "日本",
    "KR": "韩国",
    "GB": "英国",
    "DE": "德国",
}
FIELDNAMES = [
    "year",
    "country_code",
    "country",
    "metric",
    "unit",
    "value",
    "series_type",
    "source",
    "source_url",
    "source_note",
]
METRIC_COLUMNS = {
    "Total Population, as of 1 July (thousands)": ("人口", "万人", 0.1),
    "Births (thousands)": ("出生人口", "万人", 0.1),
    "Total Deaths (thousands)": ("死亡人口", "万人", 0.1),
    "Natural Change, Births minus Deaths (thousands)": ("自然增长人口", "万人", 0.1),
    "Net Number of Migrants (thousands)": ("净迁移人口", "万人", 0.1),
    "Population Change (thousands)": ("人口变化", "万人", 0.1),
    "Crude Birth Rate (births per 1,000 population)": ("出生率", "‰", 1.0),
    "Crude Death Rate (deaths per 1,000 population)": ("死亡率", "‰", 1.0),
    "Rate of Natural Change (per 1,000 population)": ("自然增长率", "‰", 1.0),
}
OFFICIAL_LATEST_RECORDS = [
    {
        "year": "2024",
        "country_code": "CN",
        "metrics": {
            "人口": ("万人", 140828),
            "出生人口": ("万人", 954),
            "死亡人口": ("万人", 1093),
            "自然增长人口": ("万人", -139),
            "人口变化": ("万人", -139),
            "出生率": ("‰", 6.77),
            "死亡率": ("‰", 7.76),
            "自然增长率": ("‰", -0.99),
        },
        "series_type": "官方实绩",
        "source": "国家统计局",
        "source_url": "https://www.stats.gov.cn/sj/zxfb/202502/t20250228_1958817.html",
        "source_note": "中华人民共和国2024年国民经济和社会发展统计公报；全国人口为年末大陆31省区市和现役军人口径，不含港澳台居民和外籍人员。",
    },
    {
        "year": "2025",
        "country_code": "CN",
        "metrics": {
            "人口": ("万人", 140489),
            "出生人口": ("万人", 792),
            "死亡人口": ("万人", 1131),
            "自然增长人口": ("万人", -339),
            "人口变化": ("万人", -339),
            "出生率": ("‰", 5.63),
            "死亡率": ("‰", 8.04),
            "自然增长率": ("‰", -2.41),
        },
        "series_type": "官方实绩",
        "source": "国家统计局",
        "source_url": "https://www.stats.gov.cn/sj/zxfb/202602/t20260228_1962662.html",
        "source_note": "中华人民共和国2025年国民经济和社会发展统计公报；全国人口为年末大陆31省区市和现役军人口径，不含港澳台居民和外籍人员。",
    },
    {
        "year": "2024",
        "country_code": "DE",
        "metrics": {
            "出生人口": ("万人", 67.7117),
            "死亡人口": ("万人", 100.7758),
            "自然增长人口": ("万人", -33.0641),
            "出生率": ("‰", 8.1),
            "死亡率": ("‰", 12.1),
            "自然增长率": ("‰", -4.0),
        },
        "series_type": "官方实绩",
        "source": "Destatis",
        "source_url": "https://www.destatis.de/EN/Themes/Society-Environment/Population/Births/Tables/lrbev04.html",
        "source_note": "德国联邦统计局年度出生死亡长期序列；自然增长率由官方出生率减死亡率计算。",
    },
]
XML_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def csv_text_writer(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".gz":
        raw_file = path.open("wb")
        gzip_file = gzip.GzipFile(fileobj=raw_file, mode="wb", mtime=0)
        return io.TextIOWrapper(gzip_file, encoding="utf-8-sig", newline="")
    return path.open("w", newline="", encoding="utf-8-sig")


def write_csv(records: list[dict], output_path: Path) -> None:
    with csv_text_writer(output_path) as file:
        writer = csv.DictWriter(file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(records)


def write_sources(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sources = [
        {
            "dataset": "country_demography",
            "title": "World Population Prospects 2024: Demographic indicators compact",
            "url": WPP_COMPACT_URL,
            "note": (
                "Estimates sheet for 1950-2023 and Medium variant sheet for 2024 onward. "
                "Official latest records override matching country-year-metric projections where available. "
                "Count indicators converted from thousands to 10,000 persons."
            ),
        }
    ]
    seen_urls = {WPP_COMPACT_URL}
    for item in OFFICIAL_LATEST_RECORDS:
        if item["source_url"] in seen_urls:
            continue
        seen_urls.add(item["source_url"])
        sources.append(
            {
                "dataset": "country_demography",
                "title": item["source"],
                "url": item["source_url"],
                "note": item["source_note"],
            }
        )
    output_path.write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")


def read_source_bytes(source: str, timeout: int) -> bytes:
    if source.startswith(("http://", "https://")):
        response = requests.get(source, headers={"User-Agent": USER_AGENT}, timeout=timeout)
        response.raise_for_status()
        return response.content
    return Path(source).read_bytes()


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    strings: list[str] = []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    for item in root.findall(f"{XML_NS}si"):
        pieces = [node.text or "" for node in item.iter(f"{XML_NS}t")]
        strings.append("".join(pieces))
    return strings


def worksheet_for_sheet(archive: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"].lstrip("/")
        for rel in rels
        if rel.attrib.get("Id") and rel.attrib.get("Target")
    }
    sheets_node = workbook.find(f"{XML_NS}sheets")
    if sheets_node is None:
        raise RuntimeError("XLSX 中未找到工作表列表")
    for sheet in sheets_node:
        if sheet.attrib.get("name") == sheet_name:
            target = rel_map[sheet.attrib[f"{REL_NS}id"]]
            return target if target.startswith("xl/") else f"xl/{target}"
    raise RuntimeError(f"XLSX 中未找到工作表：{sheet_name}")


def column_index(cell_ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - 64
    return index


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    value_node = cell.find(f"{XML_NS}v")
    if value_node is None:
        return ""
    value = value_node.text or ""
    if cell.attrib.get("t") == "s":
        return strings[int(value)]
    return value


def iter_rows(archive: zipfile.ZipFile, worksheet: str, strings: list[str]) -> Iterable[dict[int, str]]:
    with archive.open(worksheet) as file:
        for event, element in ET.iterparse(file, events=("end",)):
            if element.tag != f"{XML_NS}row":
                continue
            row: dict[int, str] = {}
            for cell in element.findall(f"{XML_NS}c"):
                ref = cell.attrib.get("r", "")
                row[column_index(ref)] = cell_value(cell, strings)
            element.clear()
            yield row


def parse_float(value: str) -> float | None:
    text = str(value).strip().replace(",", "")
    if not text or text in {"...", "…"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def format_number(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")


def parse_records(
    xlsx_bytes: bytes,
    *,
    sheet_name: str,
    start_year: int,
    end_year: int,
    countries: set[str],
    series_type: str,
) -> list[dict]:
    records: list[dict] = []
    with zipfile.ZipFile(io.BytesIO(xlsx_bytes)) as archive:
        strings = shared_strings(archive)
        worksheet = worksheet_for_sheet(archive, sheet_name)
        header: dict[int, str] | None = None
        metric_indexes: dict[int, tuple[str, str, float]] = {}
        for row in iter_rows(archive, worksheet, strings):
            if not header and row.get(1) == "Index":
                header = row
                metric_indexes = {
                    index: METRIC_COLUMNS[name]
                    for index, name in header.items()
                    if name in METRIC_COLUMNS
                }
                continue
            if not header:
                continue

            iso2 = row.get(7, "")
            if iso2 not in countries:
                continue
            year_value = parse_float(row.get(11, ""))
            if year_value is None:
                continue
            year = int(year_value)
            if year < start_year or year > end_year:
                continue

            for index, (metric, unit, multiplier) in metric_indexes.items():
                value = parse_float(row.get(index, ""))
                if value is None:
                    continue
                records.append(
                    {
                        "year": str(year),
                        "country_code": iso2,
                        "country": TARGET_ISO2_TO_CN.get(iso2, row.get(3, iso2)),
                        "metric": metric,
                        "unit": unit,
                        "value": format_number(value * multiplier),
                        "series_type": series_type,
                        "source": "UN WPP 2024",
                        "source_url": WPP_COMPACT_URL,
                        "source_note": "UN WPP compact demographic indicators；人口为 7 月 1 日人口，数量类指标由千人转换为万人。",
                    }
                )
    return records


def official_latest_records(countries: set[str]) -> list[dict]:
    records: list[dict] = []
    for item in OFFICIAL_LATEST_RECORDS:
        country_code = str(item["country_code"])
        if country_code not in countries:
            continue
        for metric, (unit, value) in item["metrics"].items():
            records.append(
                {
                    "year": str(item["year"]),
                    "country_code": country_code,
                    "country": TARGET_ISO2_TO_CN.get(country_code, country_code),
                    "metric": metric,
                    "unit": unit,
                    "value": format_number(float(value)),
                    "series_type": item["series_type"],
                    "source": item["source"],
                    "source_url": item["source_url"],
                    "source_note": item["source_note"],
                }
            )
    return records


def apply_official_latest(records: list[dict], latest_records: list[dict]) -> list[dict]:
    latest_keys = {
        (record["year"], record["country_code"], record["metric"])
        for record in latest_records
    }
    base_records = [
        record for record in records
        if (record["year"], record["country_code"], record["metric"]) not in latest_keys
    ]
    return base_records + latest_records


def sort_records(records: list[dict]) -> list[dict]:
    country_order = {code: index for index, code in enumerate(TARGET_ISO2_TO_CN)}
    metric_order = {metric: index for index, metric in enumerate(item[0] for item in METRIC_COLUMNS.values())}
    return sorted(
        records,
        key=lambda record: (
            int(record["year"]),
            country_order.get(record["country_code"], 999),
            metric_order.get(record["metric"], 999),
        ),
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=WPP_COMPACT_URL, help="WPP compact XLSX URL 或本地路径")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="输出 CSV 或 CSV.GZ 路径")
    parser.add_argument("--sources-out", default=str(DEFAULT_SOURCES_OUT), help="数据来源说明 JSON 路径")
    parser.add_argument("--start", type=int, default=1990, help="起始年份")
    parser.add_argument("--end", type=int, default=2025, help="结束年份；2024 年起使用 WPP Medium variant 预测")
    parser.add_argument(
        "--countries",
        default="CN,US,JP,KR,GB,DE",
        help="ISO2 国家代码，逗号分隔",
    )
    parser.add_argument("--timeout", type=int, default=120, help="请求超时秒数")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    countries = {item.strip().upper() for item in args.countries.split(",") if item.strip()}
    xlsx_bytes = read_source_bytes(args.source, args.timeout)
    records: list[dict] = []
    estimates_end = min(args.end, 2023)
    if args.start <= estimates_end:
        records.extend(
            parse_records(
                xlsx_bytes,
                sheet_name="Estimates",
                start_year=args.start,
                end_year=estimates_end,
                countries=countries,
                series_type="历史估计",
            )
        )
    projections_start = max(args.start, 2024)
    if args.end >= projections_start:
        records.extend(
            parse_records(
                xlsx_bytes,
                sheet_name="Medium variant",
                start_year=projections_start,
                end_year=args.end,
                countries=countries,
                series_type="中位方案预测",
            )
        )
    records = sort_records(apply_official_latest(records, official_latest_records(countries)))
    if not records:
        raise RuntimeError("没有解析到任何 UN WPP 人口动态记录")
    write_csv(records, Path(args.out))
    write_sources(Path(args.sources_out))
    years = sorted({record["year"] for record in records})
    countries_seen = sorted({record["country"] for record in records})
    print(f"写入 {args.out}，共 {len(records)} 条记录")
    print(f"年份范围：{years[0]} 至 {years[-1]}，国家：{', '.join(countries_seen)}")
    print(f"写入 {args.sources_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
