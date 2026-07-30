import os
import unittest
from unittest.mock import patch

from streamlit.testing.v1 import AppTest


class AppTests(unittest.TestCase):
    @patch.dict(os.environ, {"BAIDU_ANALYTICS_ID": "0" * 32})
    def test_dashboard_renders_with_baidu_analytics(self) -> None:
        app = AppTest.from_file("app.py", default_timeout=90).run()

        self.assertEqual(list(app.exception), [])

    def test_default_dashboard_renders_without_exceptions(self) -> None:
        app = AppTest.from_file("app.py", default_timeout=90).run()

        self.assertEqual(list(app.exception), [])


if __name__ == "__main__":
    unittest.main()
