import argparse
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.fetch_stats import (
    ArticleParseResult,
    SearchCandidate,
    fetch_and_parse_url,
    run_incremental,
    write_csv,
)


class FetchStatsTests(unittest.TestCase):
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
