import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";

const analyticsId = window.__HOUSE_PRICE_CONFIG__?.baiduAnalyticsId?.trim();
if (analyticsId && /^[0-9a-f]{32}$/i.test(analyticsId)) {
  window._hmt = window._hmt ?? [];
  const script = document.createElement("script");
  script.src = `https://hm.baidu.com/hm.js?${analyticsId}`;
  script.async = true;
  document.head.append(script);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
