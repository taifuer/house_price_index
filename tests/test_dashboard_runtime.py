import unittest

from dashboard_runtime import is_mobile_request


class DashboardRuntimeTests(unittest.TestCase):
    def test_mobile_client_hint_takes_precedence(self) -> None:
        headers = {
            "sec-ch-ua-mobile": "?1",
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64)",
        }

        self.assertTrue(is_mobile_request(headers))

    def test_mobile_user_agents_are_detected(self) -> None:
        iphone = (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
            "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
        )
        android_phone = (
            "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 "
            "Chrome/128.0.0.0 Mobile Safari/537.36"
        )

        self.assertTrue(is_mobile_request({"User-Agent": iphone}))
        self.assertTrue(is_mobile_request({"User-Agent": android_phone}))

    def test_desktop_and_tablet_user_agents_are_not_phone_layouts(self) -> None:
        desktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"
        android_tablet = (
            "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 "
            "Chrome/128.0.0.0 Safari/537.36"
        )

        self.assertFalse(is_mobile_request({"User-Agent": desktop}))
        self.assertFalse(is_mobile_request({"User-Agent": android_tablet}))


if __name__ == "__main__":
    unittest.main()
