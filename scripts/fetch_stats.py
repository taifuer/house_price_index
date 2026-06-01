#!/usr/bin/env python3
"""Fetch and parse NBS 70-city housing price index pages."""

from __future__ import annotations

import argparse
import csv
import gzip
import html
import io
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

import requests


DEFAULT_DETAIL_URL = "https://www.stats.gov.cn/sj/zxfb/202605/t20260518_1963715.html"
DEFAULT_SEARCH_URL = (
    "https://www.stats.gov.cn/search/s?qt="
    "%E5%A4%A7%E4%B8%AD%E5%9F%8E%E5%B8%82%E5%95%86%E5%93%81%E4%BD%8F%E5%AE%85"
    "%E9%94%80%E5%94%AE%E4%BB%B7%E6%A0%BC%E5%8F%98%E5%8A%A8%E6%83%85%E5%86%B5"
)

CITY_NAMES = [
    "北京",
    "天津",
    "石家庄",
    "太原",
    "呼和浩特",
    "沈阳",
    "大连",
    "长春",
    "哈尔滨",
    "上海",
    "南京",
    "杭州",
    "宁波",
    "合肥",
    "福州",
    "厦门",
    "南昌",
    "济南",
    "青岛",
    "郑州",
    "武汉",
    "长沙",
    "广州",
    "深圳",
    "南宁",
    "海口",
    "重庆",
    "成都",
    "贵阳",
    "昆明",
    "西安",
    "兰州",
    "西宁",
    "银川",
    "乌鲁木齐",
    "唐山",
    "秦皇岛",
    "包头",
    "丹东",
    "锦州",
    "吉林",
    "牡丹江",
    "无锡",
    "徐州",
    "扬州",
    "温州",
    "金华",
    "蚌埠",
    "安庆",
    "泉州",
    "九江",
    "赣州",
    "烟台",
    "济宁",
    "洛阳",
    "平顶山",
    "宜昌",
    "襄阳",
    "岳阳",
    "常德",
    "韶关",
    "湛江",
    "惠州",
    "桂林",
    "北海",
    "三亚",
    "泸州",
    "南充",
    "遵义",
    "大理",
]

CITY_SET = set(CITY_NAMES)
NUMBER_RE = re.compile(r"^\d{2,3}(?:\.\d+)?$")
DETAIL_URL_RE = re.compile(
    r"https?://www\.stats\.gov\.cn/sj/zxfb(?:hjd)?/\d{6}/t\d+_\d+\.html"
    r"|/sj/zxfb(?:hjd)?/\d{6}/t\d+_\d+\.html"
)
HOUSING_TITLE_RE = re.compile(r"^(\d{4})年\s*(\d{1,2})月份70个大中城市(?:商品)?住宅销售价格变动情况$")
SEARCH_API_URL = "https://api.so-gov.cn/query/s"
DEFAULT_OUTPUT_PATH = "data/house_price_index.csv"
DEFAULT_INCREMENTAL_PATHS = [
    Path("data/house_price_index_all.csv.gz"),
    Path("data/house_price_index_all.csv"),
    Path("data/house_price_index.csv"),
]
DEFAULT_MISSING_LOG_PATH = Path("data/house_price_index_missing.json")
FIELDNAMES = [
    "period",
    "table_no",
    "table_name",
    "house_type",
    "size_band",
    "city",
    "metric",
    "base",
    "value",
    "change_pct",
    "source_url",
    "title",
]
RECORD_KEY_FIELDS = ("period", "table_no", "house_type", "size_band", "city", "metric")
SIZE_BAND_ORDER = ["全部", "90m2及以下", "90-144m2", "144m2以上"]
METRIC_ORDER = ["环比", "同比", "累计平均"]


@dataclass
class ArticleParseResult:
    title: str
    period: str
    records: list[dict]
    warnings: list[str]


@dataclass(frozen=True)
class SearchCandidate:
    period: str
    title: str
    url: str


class NbsHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.texts: list[str] = []
        self.links: list[str] = []
        self.images: list[str] = []
        self._skip_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag in {"script", "style", "noscript"}:
            self._skip_stack.append(tag)
        if tag == "a" and attrs_dict.get("href"):
            self.links.append(attrs_dict["href"] or "")
        if tag == "img" and attrs_dict.get("src"):
            self.images.append(attrs_dict["src"] or "")

    def handle_endtag(self, tag: str) -> None:
        if self._skip_stack and self._skip_stack[-1] == tag:
            self._skip_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._skip_stack:
            return
        text = clean_text(data)
        if text:
            self.texts.append(text)


def clean_text(value: str) -> str:
    value = html.unescape(value)
    value = value.replace("\u00a0", " ").replace("\u3000", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", "", clean_text(value))


def normalize_city(value: str) -> str:
    return compact(value)


def detect_city_at(tokens: list[str], index: int) -> tuple[str, int] | None:
    pieces: list[str] = []
    for span in range(1, 5):
        if index + span > len(tokens):
            break
        pieces.append(tokens[index + span - 1])
        candidate = normalize_city("".join(pieces))
        if candidate in CITY_SET:
            return candidate, index + span
    return None


def is_number(value: str) -> bool:
    return bool(NUMBER_RE.match(compact(value)))


def fetch_text(url: str, timeout: int = 30) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        )
    }
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    content_prefix = response.content[:4096].decode("ascii", errors="ignore").lower()
    if "charset=\"utf-8\"" in content_prefix or "charset=utf-8" in content_prefix:
        response.encoding = "utf-8"
    elif response.encoding in {None, "ISO-8859-1"}:
        response.encoding = response.apparent_encoding or "utf-8"
    return response.text


def parse_html(html_text: str) -> NbsHTMLParser:
    parser = NbsHTMLParser()
    parser.feed(html_text)
    return parser


def find_title(tokens: list[str]) -> str:
    for token in tokens:
        if re.search(r"\d{4}年\s*\d{1,2}月份70个大中城市(?:商品)?住宅销售价格变动情况", token):
            return clean_text(token)
    return ""


def infer_period(tokens: list[str], title: str) -> str:
    text = title or "\n".join(tokens[:100])
    match = re.search(r"(\d{4})年\s*(\d{1,2})月", text)
    if not match:
        raise ValueError("无法从标题或正文推断数据月份")
    return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}"


def table_marker(token: str) -> tuple[int | None, str | None]:
    cleaned = compact(token).replace(":", "：")
    match = re.match(r"表([1-4])：", cleaned)
    if not match:
        return None, None
    part = None
    if "（一）" in cleaned or "(一)" in cleaned:
        part = "一"
    if "（二）" in cleaned or "(二)" in cleaned:
        part = "二"
    return int(match.group(1)), part


def table_marker_at(tokens: list[str], index: int) -> tuple[int | None, str | None]:
    table_no, part = table_marker(tokens[index])
    if table_no is not None:
        return table_no, part

    if compact(tokens[index]) != "表" or index + 1 >= len(tokens):
        return None, None
    next_token = compact(tokens[index + 1])
    if next_token not in {"1", "2", "3", "4"}:
        return None, None

    lookahead = "".join(compact(token).replace(":", "：") for token in tokens[index : index + 32])
    if not lookahead.startswith(f"表{next_token}"):
        return None, None

    part = None
    if "（一）" in lookahead or "(一)" in lookahead:
        part = "一"
    if "（二）" in lookahead or "(二)" in lookahead:
        part = "二"
    return int(next_token), part


def find_marker_index(
    tokens: list[str],
    table_no: int,
    part: str | None = None,
    start: int = 0,
) -> int | None:
    for index in range(start, len(tokens)):
        found_table, found_part = table_marker_at(tokens, index)
        if found_table != table_no:
            continue
        if part is not None and found_part != part:
            continue
        return index
    return None


def collect_city_values(tokens: list[str], start: int, value_count: int, max_rows: int) -> list[tuple[str, list[float]]]:
    rows: list[tuple[str, list[float]]] = []
    seen: set[str] = set()
    index = start
    while index < len(tokens) and len(rows) < max_rows:
        table_no, _ = table_marker_at(tokens, index)
        if rows and table_no is not None:
            break

        detected_city = detect_city_at(tokens, index)
        if not detected_city:
            index += 1
            continue
        city, value_start = detected_city
        if city in seen:
            index += 1
            continue

        values: list[float] = []
        cursor = value_start
        while cursor < len(tokens) and len(values) < value_count:
            next_city = detect_city_at(tokens, cursor)
            if next_city and not values:
                break
            if is_number(tokens[cursor]):
                values.append(float(compact(tokens[cursor])))
            cursor += 1

        if len(values) == value_count:
            rows.append((city, values))
            seen.add(city)
            index = cursor
        else:
            index += 1
    return rows


def table_1_2_records(
    rows: list[tuple[str, list[float]]],
    *,
    table_no: int,
    period: str,
    source_url: str,
    title: str,
) -> list[dict]:
    house_type = "新建商品住宅" if table_no == 1 else "二手住宅"
    table_name = f"{period} 70个大中城市{house_type}销售价格指数"
    labels = metric_labels_for_period(period)
    records: list[dict] = []
    for city, values in rows:
        for (metric, base), value in zip(labels, values):
            records.append(
                make_record(
                    period=period,
                    table_no=table_no,
                    table_name=table_name,
                    house_type=house_type,
                    size_band="全部",
                    city=city,
                    metric=metric,
                    base=base,
                    value=value,
                    source_url=source_url,
                    title=title,
                )
            )
    return records


def table_3_4_records(
    rows: list[tuple[str, list[float]]],
    *,
    table_no: int,
    period: str,
    source_url: str,
    title: str,
) -> list[dict]:
    house_type = "新建商品住宅" if table_no == 3 else "二手住宅"
    table_name = f"{period} 70个大中城市{house_type}销售价格分类指数"
    size_bands = ["90m2及以下", "90-144m2", "144m2以上"]
    labels = metric_labels_for_period(period)
    metrics_per_band = len(labels)
    records: list[dict] = []
    for city, values in rows:
        for band_index, size_band in enumerate(size_bands):
            offset = band_index * metrics_per_band
            for (metric, base), value in zip(labels, values[offset : offset + metrics_per_band]):
                records.append(
                    make_record(
                        period=period,
                        table_no=table_no,
                        table_name=table_name,
                        house_type=house_type,
                        size_band=size_band,
                        city=city,
                        metric=metric,
                        base=base,
                        value=value,
                        source_url=source_url,
                        title=title,
                    )
                )
    return records


def metric_labels_for_period(period: str) -> list[tuple[str, str]]:
    labels = [
        ("环比", "上月=100"),
        ("同比", "上年同月=100"),
    ]
    if not period.endswith("-01"):
        labels.append(("累计平均", "上年同期=100"))
    return labels


def make_record(
    *,
    period: str,
    table_no: int,
    table_name: str,
    house_type: str,
    size_band: str,
    city: str,
    metric: str,
    base: str,
    value: float,
    source_url: str,
    title: str,
) -> dict:
    return {
        "period": period,
        "table_no": table_no,
        "table_name": table_name,
        "house_type": house_type,
        "size_band": size_band,
        "city": city,
        "metric": metric,
        "base": base,
        "value": f"{value:.1f}",
        "change_pct": f"{value - 100:.1f}",
        "source_url": source_url,
        "title": title,
    }


def parse_article(html_text: str, source_url: str) -> ArticleParseResult:
    parser = parse_html(html_text)
    tokens = parser.texts

    title = find_title(tokens)
    period = infer_period(tokens, title)
    warnings: list[str] = []
    records: list[dict] = []

    table1_idx = find_marker_index(tokens, 1)
    table2_idx = find_marker_index(tokens, 2, start=(table1_idx or 0) + 1)
    table3a_idx = find_marker_index(tokens, 3, "一", start=(table2_idx or 0) + 1)
    table3b_idx = find_marker_index(tokens, 3, "二", start=(table3a_idx or 0) + 1)
    table4a_idx = find_marker_index(tokens, 4, "一", start=(table3b_idx or 0) + 1)
    table4b_idx = find_marker_index(tokens, 4, "二", start=(table4a_idx or 0) + 1)

    if table1_idx is not None:
        rows = collect_city_values(tokens, table1_idx + 1, len(metric_labels_for_period(period)), 70)
        records.extend(table_1_2_records(rows, table_no=1, period=period, source_url=source_url, title=title))
        validate_row_count(rows, 1, warnings)
    else:
        warnings.append("未找到表1")

    if table2_idx is not None:
        rows = collect_city_values(tokens, table2_idx + 1, len(metric_labels_for_period(period)), 70)
        records.extend(table_1_2_records(rows, table_no=2, period=period, source_url=source_url, title=title))
        validate_row_count(rows, 2, warnings)
    else:
        warnings.append("未找到表2")

    table3_rows: list[tuple[str, list[float]]] = []
    class_value_count = len(metric_labels_for_period(period)) * 3
    if table3a_idx is not None:
        table3_rows.extend(collect_city_values(tokens, table3a_idx + 1, class_value_count, 35))
    if table3b_idx is not None:
        table3_rows.extend(collect_city_values(tokens, table3b_idx + 1, class_value_count, 35))
    if table3_rows:
        records.extend(table_3_4_records(table3_rows, table_no=3, period=period, source_url=source_url, title=title))
        validate_row_count(table3_rows, 3, warnings)
    else:
        warnings.append("未找到表3")

    table4_rows: list[tuple[str, list[float]]] = []
    if table4a_idx is not None:
        table4_rows.extend(collect_city_values(tokens, table4a_idx + 1, class_value_count, 35))
    if table4b_idx is not None:
        table4_rows.extend(collect_city_values(tokens, table4b_idx + 1, class_value_count, 35))
    if table4_rows:
        records.extend(table_3_4_records(table4_rows, table_no=4, period=period, source_url=source_url, title=title))
        validate_row_count(table4_rows, 4, warnings)
    else:
        warnings.append("未找到表4")

    return ArticleParseResult(title=title, period=period, records=records, warnings=warnings)


def validate_row_count(rows: list[tuple[str, list[float]]], table_no: int, warnings: list[str]) -> None:
    city_count = len({city for city, _ in rows})
    if city_count != 70:
        warnings.append(f"表{table_no}解析到 {city_count} 个城市，预期 70 个")


def discover_detail_urls(search_html: str, search_url: str) -> list[str]:
    parser = parse_html(search_html)
    urls: list[str] = []
    seen: set[str] = set()
    for link in parser.links:
        for match in DETAIL_URL_RE.findall(link):
            full_url = urljoin(search_url, match)
            article_id = re.search(r"t\d+_\d+\.html", full_url)
            dedupe_key = article_id.group(0) if article_id else full_url
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            urls.append(full_url)
    return urls


def title_to_period(title: str) -> str | None:
    match = HOUSING_TITLE_RE.match(clean_text(title))
    if not match:
        return None
    return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}"


def canonical_url_score(url: str) -> int:
    if "/sj/zxfb/" in url:
        return 0
    if "/xxgk/sjfb/zxfb2020/" in url:
        return 1
    return 2


def discover_urls_from_search_api(
    query: str = "大中城市商品住宅销售价格变动情况",
    *,
    max_pages: int | None = None,
    page_size: int = 20,
    sleep_seconds: float = 0.15,
) -> list[str]:
    """Discover historical detail URLs through the search backend JSON API."""
    headers = {
        "Origin": "https://www.stats.gov.cn",
        "Referer": "https://www.stats.gov.cn/search/s",
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ),
    }
    by_period: dict[str, tuple[str, str]] = {}
    page = 1
    total_hits: int | None = None

    while True:
        params = {
            "siteCode": "bm36000002",
            "tab": "",
            "qt": query,
            "page": str(page),
            "pageSize": str(page_size),
            "ie": "utf-8",
        }
        response = requests.post(SEARCH_API_URL, data=params, headers=headers, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if not payload.get("ok"):
            raise RuntimeError(f"搜索 API 返回失败：{payload.get('msg') or payload.get('code')}")

        total_hits = int(payload.get("totalHits") or 0)
        docs = payload.get("resultDocs") or []
        if not docs:
            break

        for doc in docs:
            data = doc.get("data") or {}
            title = clean_text(data.get("titleO") or data.get("DRETITLEO") or "")
            period = title_to_period(title)
            url = clean_text(data.get("url") or "")
            if not period or not url.startswith("https://www.stats.gov.cn/"):
                continue

            current = by_period.get(period)
            if current is None or canonical_url_score(url) < canonical_url_score(current[1]):
                by_period[period] = (title, url)

        if max_pages is not None and page >= max_pages:
            break
        if page * page_size >= total_hits:
            break
        page += 1
        if sleep_seconds:
            time.sleep(sleep_seconds)

    print(f"搜索 API 命中 {total_hits or 0} 条，过滤得到 {len(by_period)} 个数据月份")
    return [url for _, url in sorted(by_period.values(), reverse=True)]


def discover_candidates_from_search_api(
    queries: list[str],
    *,
    max_pages: int | None = None,
    page_size: int = 20,
    sleep_seconds: float = 0.15,
) -> dict[str, list[SearchCandidate]]:
    candidates: dict[str, list[SearchCandidate]] = {}
    seen: set[tuple[str, str]] = set()
    for query in queries:
        headers = {
            "Origin": "https://www.stats.gov.cn",
            "Referer": "https://www.stats.gov.cn/search/s",
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            ),
        }
        page = 1
        total_hits = 0
        while True:
            params = {
                "siteCode": "bm36000002",
                "tab": "",
                "qt": query,
                "page": str(page),
                "pageSize": str(page_size),
                "ie": "utf-8",
            }
            response = requests.post(SEARCH_API_URL, data=params, headers=headers, timeout=30)
            response.raise_for_status()
            payload = response.json()
            if not payload.get("ok"):
                raise RuntimeError(f"搜索 API 返回失败：{payload.get('msg') or payload.get('code')}")
            total_hits = int(payload.get("totalHits") or 0)
            docs = payload.get("resultDocs") or []
            if not docs:
                break
            for doc in docs:
                data = doc.get("data") or {}
                title = clean_text(data.get("titleO") or data.get("DRETITLEO") or "")
                period = title_to_period(title)
                url = clean_text(data.get("url") or "")
                key = (period or "", url)
                if not period or not url.startswith("https://www.stats.gov.cn/") or key in seen:
                    continue
                seen.add(key)
                candidates.setdefault(period, []).append(SearchCandidate(period=period, title=title, url=url))
            if max_pages is not None and page >= max_pages:
                break
            if page * page_size >= total_hits:
                break
            page += 1
            if sleep_seconds:
                time.sleep(sleep_seconds)
        print(f"搜索 API [{query}] 命中 {total_hits} 条，累计候选月份 {len(candidates)}")

    for period, items in candidates.items():
        items.sort(key=lambda item: canonical_url_score(item.url))
    return candidates


def expected_record_count(period: str) -> int:
    return 1120 if period.endswith("-01") else 1680


def csv_text_reader(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", newline="", encoding="utf-8-sig")
    return path.open("r", newline="", encoding="utf-8-sig")


def csv_text_writer(path: Path):
    if path.suffix == ".gz":
        raw_file = path.open("wb")
        gzip_file = gzip.GzipFile(fileobj=raw_file, mode="wb", mtime=0)
        text_file = io.TextIOWrapper(gzip_file, encoding="utf-8-sig", newline="")
        return text_file
    return path.open("w", newline="", encoding="utf-8-sig")


def read_csv(path: Path) -> list[dict]:
    with csv_text_reader(path) as file:
        return list(csv.DictReader(file))


def write_csv(records: list[dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_text_writer(output_path) as file:
        writer = csv.DictWriter(file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(records)


def write_json(records: list[dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_and_parse_url(url: str, args: argparse.Namespace) -> tuple[list[dict], list[str]]:
    html_text = fetch_text(url)
    result = parse_article(html_text, url)
    return result.records, result.warnings


def fetch_history_candidates(
    candidates: dict[str, list[SearchCandidate]],
    args: argparse.Namespace,
) -> tuple[list[dict], list[str]]:
    all_records: list[dict] = []
    all_warnings: list[str] = []
    for period in sorted(candidates.keys(), reverse=True):
        expected = expected_record_count(period)
        best_records: list[dict] = []
        best_warnings: list[str] = []
        best_url = ""
        for candidate in candidates[period]:
            print(f"抓取 {period} {candidate.url}", flush=True)
            try:
                records, warnings = fetch_and_parse_url(candidate.url, args)
                print(f"解析 {len(records)} 条长表记录", flush=True)
            except Exception as exc:
                all_warnings.append(f"{candidate.url}: 抓取或解析失败：{exc}")
                print(f"警告：{candidate.url}: 抓取或解析失败：{exc}", flush=True)
                continue

            if len(records) > len(best_records):
                best_records = records
                best_warnings = warnings
                best_url = candidate.url
            if len(records) == expected:
                break

        if not best_records:
            all_warnings.append(f"{period}: 所有候选 URL 均未解析到记录")
            continue

        all_records.extend(best_records)
        all_warnings.extend(f"{best_url}: {warning}" for warning in best_warnings)
        if len(best_records) != expected:
            all_warnings.append(f"{period}: 最佳候选仅解析 {len(best_records)} 条，预期 {expected} 条")
    return all_records, all_warnings


def resolve_existing_path(args: argparse.Namespace) -> Path:
    if args.existing:
        path = Path(args.existing)
        if not path.exists():
            raise FileNotFoundError(f"现有数据文件不存在：{path}")
        return path
    if args.out and Path(args.out).exists():
        return Path(args.out)
    for path in DEFAULT_INCREMENTAL_PATHS:
        if path.exists():
            return path
    raise FileNotFoundError("未找到现有数据文件，请通过 --existing 指定")


def previous_month(today: date) -> str:
    year = today.year
    month = today.month - 1
    if month == 0:
        year -= 1
        month = 12
    return f"{year:04d}-{month:02d}"


def iter_months(start_exclusive: str, end_inclusive: str) -> list[str]:
    start_year, start_month = (int(part) for part in start_exclusive.split("-", 1))
    end_year, end_month = (int(part) for part in end_inclusive.split("-", 1))
    months: list[str] = []
    year, month = start_year, start_month + 1
    while (year, month) <= (end_year, end_month):
        months.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year += 1
            month = 1
    return months


def record_key(record: dict) -> tuple[str, ...]:
    return tuple(str(record.get(field, "")) for field in RECORD_KEY_FIELDS)


def sort_records(records: list[dict]) -> list[dict]:
    city_order = {city: index for index, city in enumerate(CITY_NAMES)}
    size_order = {size: index for index, size in enumerate(SIZE_BAND_ORDER)}
    metric_order = {metric: index for index, metric in enumerate(METRIC_ORDER)}

    def sort_key(record: dict) -> tuple:
        table_no = int(record.get("table_no") or 0)
        period = str(record.get("period", "0000-00"))
        period_rank = -(int(period[:4]) * 100 + int(period[5:7])) if re.match(r"^\d{4}-\d{2}$", period) else 0
        return (
            period_rank,
            table_no,
            str(record.get("house_type", "")),
            size_order.get(str(record.get("size_band", "")), 99),
            city_order.get(str(record.get("city", "")), 999),
            metric_order.get(str(record.get("metric", "")), 99),
        )

    return sorted(records, key=sort_key)


def merge_records(existing_records: list[dict], new_records: list[dict]) -> list[dict]:
    merged = {record_key(record): record for record in existing_records}
    for record in new_records:
        merged[record_key(record)] = record
    return sort_records(list(merged.values()))


def write_missing_log(
    *,
    output_path: Path,
    existing_path: Path,
    max_existing_period: str,
    candidate_periods: set[str],
    missing_periods: list[str],
    fetched_periods: list[str],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "existing_path": str(existing_path),
        "max_existing_period": max_existing_period,
        "search_candidate_period_count": len(candidate_periods),
        "fetched_periods": fetched_periods,
        "missing_periods": [
            {
                "period": period,
                "status": "not_in_search_results",
                "reason": "No candidate was found in the NBS search API; no detail page was fetched.",
            }
            for period in missing_periods
        ],
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run_incremental(args: argparse.Namespace) -> tuple[list[dict], list[str], Path]:
    queries = list(dict.fromkeys([args.search_query, "大中城市住宅销售价格变动情况"]))
    candidates = discover_candidates_from_search_api(queries, max_pages=args.max_search_pages)
    existing_path = resolve_existing_path(args)
    existing_records = read_csv(existing_path)
    if not existing_records:
        raise RuntimeError(f"现有数据文件为空：{existing_path}")

    existing_periods = {str(record["period"]) for record in existing_records if record.get("period")}
    max_existing_period = max(existing_periods)
    target_periods = sorted((period for period in candidates if period > max_existing_period), reverse=True)
    target_candidates = {period: candidates[period] for period in target_periods}

    candidate_periods = set(candidates)
    expected_periods = iter_months(max_existing_period, previous_month(date.today()))
    missing_periods = [period for period in expected_periods if period not in candidate_periods]

    if target_candidates:
        print(f"增量发现 {len(target_candidates)} 个新月份：{', '.join(sorted(target_candidates))}")
        new_records, warnings = fetch_history_candidates(target_candidates, args)
    else:
        print(f"未发现 {max_existing_period} 之后的新月份")
        new_records, warnings = [], []

    output_path = Path(args.out) if args.out else existing_path
    merged_records = merge_records(existing_records, new_records)
    write_missing_log(
        output_path=Path(args.missing_log),
        existing_path=existing_path,
        max_existing_period=max_existing_period,
        candidate_periods=candidate_periods,
        missing_periods=missing_periods,
        fetched_periods=sorted(target_candidates),
    )
    if missing_periods:
        print(f"记录统计局尚未发布月份：{', '.join(missing_periods)}")
    return merged_records, warnings, output_path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", action="append", help="国家统计局详情页 URL，可重复传入")
    parser.add_argument("--search-url", help="国家统计局搜索页 URL，用于自动发现详情页")
    parser.add_argument("--all-history", action="store_true", help="通过国家统计局搜索 API 发现并抓取全部历史月份")
    parser.add_argument("--incremental", action="store_true", help="基于现有 CSV 只抓取最新新增月份")
    parser.add_argument("--existing", help="增量模式读取的现有 CSV 或 CSV.GZ 路径，默认自动查找")
    parser.add_argument(
        "--missing-log",
        default=str(DEFAULT_MISSING_LOG_PATH),
        help="增量模式记录统计局尚未发布月份的 JSON 路径",
    )
    parser.add_argument("--search-query", default="大中城市商品住宅销售价格变动情况", help="搜索 API 查询词")
    parser.add_argument("--max-search-pages", type=int, help="限制搜索 API 分页数，调试时使用")
    parser.add_argument("--out", help=f"输出 CSV 或 CSV.GZ 路径，默认 {DEFAULT_OUTPUT_PATH}")
    parser.add_argument("--json-out", help="可选 JSON 输出路径")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    urls = list(args.url or [])
    all_records: list[dict] = []
    all_warnings: list[str] = []

    if args.incremental and (args.all_history or args.url or args.search_url):
        raise RuntimeError("--incremental 不能与 --all-history、--url 或 --search-url 同时使用")

    if args.incremental:
        all_records, all_warnings, output_path = run_incremental(args)
    elif args.all_history:
        queries = list(dict.fromkeys([args.search_query, "大中城市住宅销售价格变动情况"]))
        candidates = discover_candidates_from_search_api(queries, max_pages=args.max_search_pages)
        all_records, all_warnings = fetch_history_candidates(candidates, args)
        output_path = Path(args.out or DEFAULT_OUTPUT_PATH)
    else:
        output_path = Path(args.out or DEFAULT_OUTPUT_PATH)

    if args.search_url:
        search_html = fetch_text(args.search_url)
        discovered = discover_detail_urls(search_html, args.search_url)
        if not discovered:
            query_match = re.search(r"[?&]qt=([^&]+)", args.search_url)
            query = args.search_query
            if query_match:
                from urllib.parse import unquote_plus

                query = unquote_plus(query_match.group(1))
            discovered = discover_urls_from_search_api(query, max_pages=args.max_search_pages)
        urls.extend(discovered)
        print(f"搜索页发现 {len(discovered)} 个详情页")

    if args.incremental:
        pass
    elif not urls and all_records:
        pass
    elif not urls and not (args.search_url or args.all_history):
        urls = [DEFAULT_DETAIL_URL]
    elif not urls:
        raise RuntimeError("没有发现任何详情页 URL")

    seen_urls: set[str] = set()
    for url in urls:
        if url in seen_urls:
            continue
        seen_urls.add(url)
        print(f"抓取 {url}")
        try:
            records, warnings = fetch_and_parse_url(url, args)
            all_records.extend(records)
            all_warnings.extend(f"{url}: {warning}" for warning in warnings)
            print(f"解析 {len(records)} 条长表记录")
        except Exception as exc:
            warning = f"{url}: 抓取或解析失败：{exc}"
            all_warnings.append(warning)
            print(f"警告：{warning}")

    if not all_records:
        raise RuntimeError("没有解析到任何记录")

    write_csv(all_records, output_path)
    if args.json_out:
        write_json(all_records, Path(args.json_out))

    print(f"写入 {output_path}，共 {len(all_records)} 条记录")
    if all_warnings:
        print("警告：")
        for warning in all_warnings:
            print(f"- {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
