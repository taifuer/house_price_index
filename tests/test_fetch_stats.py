import argparse
import unittest
from unittest.mock import patch

from scripts.fetch_stats import ArticleParseResult, fetch_and_parse_url


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


if __name__ == "__main__":
    unittest.main()
