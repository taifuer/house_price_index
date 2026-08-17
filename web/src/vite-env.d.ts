/// <reference types="vite/client" />

interface HousePriceRuntimeConfig {
  baiduAnalyticsId?: string;
}

interface Window {
  __HOUSE_PRICE_CONFIG__?: HousePriceRuntimeConfig;
  _hmt?: unknown[];
}
