from __future__ import annotations

import re
from collections.abc import Mapping


MOBILE_USER_AGENT_PATTERN = re.compile(
    r"(?:Mobi|iPhone|iPod|Android.*Mobile|Windows Phone)",
    re.IGNORECASE,
)


def is_mobile_request(headers: Mapping[str, str]) -> bool:
    """Return whether request headers identify a phone-class browser."""
    normalized = {str(key).lower(): str(value) for key, value in headers.items()}
    if normalized.get("sec-ch-ua-mobile", "").strip() == "?1":
        return True
    user_agent = normalized.get("user-agent", "")
    return MOBILE_USER_AGENT_PATTERN.search(user_agent) is not None
