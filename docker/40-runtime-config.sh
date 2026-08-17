#!/bin/sh
set -eu

analytics_id="${BAIDU_ANALYTICS_ID:-}"
runtime_config_path="${RUNTIME_CONFIG_PATH:-/usr/share/nginx/html/runtime-config.js}"
if [ -n "$analytics_id" ]; then
    case "$analytics_id" in
        *[!0-9a-fA-F]*)
            echo "BAIDU_ANALYTICS_ID must contain only hexadecimal characters" >&2
            exit 1
            ;;
    esac
    if [ "${#analytics_id}" -ne 32 ]; then
        echo "BAIDU_ANALYTICS_ID must be exactly 32 characters" >&2
        exit 1
    fi
fi

printf 'window.__HOUSE_PRICE_CONFIG__ = { baiduAnalyticsId: "%s" };\n' "$analytics_id" \
    > "$runtime_config_path"
