import argparse
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

from scripts.fetch_stats import (
    ArticleParseResult,
    RELEASE_LIST_URL,
    SearchCandidate,
    discover_candidates_from_release_list,
    fetch_and_parse_url,
    run_incremental,
    write_csv,
)


class FetchStatsTests(unittest.TestCase):
    def run_target_update(self, period: str = "2026-08"):
        with tempfile.TemporaryDirectory() as temporary_dir:
            directory = Path(temporary_dir)
            existing_path = directory / "existing.csv.gz"
            write_csv([{"period": "2026-07"}], existing_path)
            return run_incremental(argparse.Namespace(
                search_query="测试查询",
                max_search_pages=3,
                existing=str(existing_path),
                target_period=period,
                out=str(directory / "output.csv.gz"),
                missing_log=str(directory / "missing.json"),
            ))

    @patch("scripts.fetch_stats.fetch_text")
    def test_release_list_uses_full_titles_and_deduplicates_official_links(self, fetch_text) -> None:
        title = "2026年8月份70个大中城市商品住宅销售价格变动情况"
        href = "./202609/t20260915_1965304.html"
        fetch_text.return_value = f'''
            <a href="{href}" title="{title}">2026年8月份70个大中城市...</a>
            <a href="{href}" title="{title}">{title}</a>
            <a href="https://example.test/202609/t20260915_1965304.html" title="{title}">外站</a>
            <a href="./202609/t20260915_1965303.html" title="解读{title}">解读</a>
        '''

        candidates = discover_candidates_from_release_list("2026-08", sleep_seconds=0)

        self.assertEqual(candidates, {"2026-08": [SearchCandidate(
            period="2026-08", title=title,
            url="https://www.stats.gov.cn/sj/zxfb/202609/t20260915_1965304.html",
        )]})
        fetch_text.assert_called_once_with(RELEASE_LIST_URL)

    @patch("scripts.fetch_stats.fetch_text")
    def test_release_list_checks_limited_pages_when_month_is_not_found(self, fetch_text) -> None:
        fetch_text.return_value = '''
            <a href="./202609/t20260909_1965263.html" title="居民消费价格">居民消费价格</a>
        '''
        self.assertEqual(discover_candidates_from_release_list("2026-08", sleep_seconds=0), {})
        self.assertEqual(fetch_text.call_count, 3)

    @patch("scripts.fetch_stats.fetch_text", return_value="<html>Service unavailable</html>")
    def test_release_list_does_not_treat_invalid_page_as_unpublished(self, _fetch_text) -> None:
        with self.assertRaisesRegex(RuntimeError, "未解析到有效详情链接"):
            discover_candidates_from_release_list("2026-08", sleep_seconds=0)

    @patch("scripts.fetch_stats.fetch_history_candidates", return_value=([], []))
    @patch("scripts.fetch_stats.discover_candidates_from_release_list")
    @patch("scripts.fetch_stats.discover_candidates_from_search_api")
    def test_target_update_uses_release_list_on_search_failure_or_missing_result(
        self, discover_search, discover_list, fetch_candidates,
    ) -> None:
        candidate = SearchCandidate("2026-08", "测试数据", "https://www.stats.gov.cn/test.html")
        discover_list.return_value = {"2026-08": [candidate]}
        for error in (RuntimeError("用户已被禁用"), requests.Timeout("timeout"), None):
            with self.subTest(error=error):
                discover_search.side_effect = error
                discover_search.return_value = {}
                _, warnings, _ = self.run_target_update()
                self.assertEqual(fetch_candidates.call_args.args[0], {"2026-08": [candidate]})
                self.assertEqual(bool(warnings), error is not None)

    @patch("scripts.fetch_stats.discover_candidates_from_release_list", side_effect=requests.Timeout())
    @patch("scripts.fetch_stats.discover_candidates_from_search_api", side_effect=RuntimeError("disabled"))
    def test_target_update_fails_when_both_discovery_sources_fail(self, _search, _list) -> None:
        with self.assertRaises(requests.Timeout):
            self.run_target_update()

    @patch("scripts.fetch_stats.parse_article")
    @patch("scripts.fetch_stats.fetch_text", return_value="<html></html>")
    def test_expected_period_corrects_publication_month(
        self,
        _fetch_text,
        parse_article,
    ) -> None:
        parse_article.return_value = ArticleParseResult(
            title="",
            period="2026-07",
            records=[
                {
                    "period": "2026-07",
                    "table_name": "2026-07 表1",
                    "title": "",
                }
            ],
            warnings=[],
        )

        records, warnings = fetch_and_parse_url(
            "https://example.test/detail",
            argparse.Namespace(),
            expected_period="2026-06",
            expected_title="2026年6月份房价数据",
        )

        self.assertEqual(records[0]["period"], "2026-06")
        self.assertEqual(records[0]["table_name"], "2026-06 表1")
        self.assertEqual(records[0]["title"], "2026年6月份房价数据")
        self.assertTrue(any("已按搜索结果校准" in warning for warning in warnings))

    @patch("scripts.fetch_stats.fetch_history_candidates", return_value=([], []))
    @patch("scripts.fetch_stats.discover_candidates_from_search_api")
    def test_incremental_target_period_ignores_other_newer_candidates(
        self,
        discover_candidates,
        fetch_history_candidates,
    ) -> None:
        discover_candidates.return_value = {
            period: [
                SearchCandidate(
                    period=period,
                    title=f"{period} 测试数据",
                    url=f"https://www.stats.gov.cn/{period}.html",
                )
            ]
            for period in ("2026-07", "2026-08")
        }
        with tempfile.TemporaryDirectory() as temporary_dir:
            directory = Path(temporary_dir)
            existing_path = directory / "existing.csv.gz"
            output_path = directory / "output.csv.gz"
            write_csv([{"period": "2026-06"}], existing_path)
            args = argparse.Namespace(
                search_query="测试查询",
                max_search_pages=2,
                existing=str(existing_path),
                target_period="2026-07",
                out=str(output_path),
                missing_log=str(directory / "missing.json"),
            )

            run_incremental(args)

        selected_candidates = fetch_history_candidates.call_args.args[0]
        self.assertEqual(list(selected_candidates), ["2026-07"])


if __name__ == "__main__":
    unittest.main()
