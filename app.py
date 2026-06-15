from __future__ import annotations

import html
import inspect
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st


DATA_PATH = Path("data/house_price_index_all.csv.gz")
if not DATA_PATH.exists():
    DATA_PATH = Path("data/house_price_index_all.csv")
if not DATA_PATH.exists():
    DATA_PATH = Path("data/house_price_index.csv")
INTERNATIONAL_CONTEXT_PATH = Path("data/context_bis_prices.csv.gz")
DEMOGRAPHY_CONTEXT_PATH = Path("data/context_demography_countries.csv.gz")
FAVICON_PATH = Path("assets/favicon.ico")
MOBILE_BREAKPOINT_PX = 768

st.set_page_config(
    page_title="全国 70 城商品住宅价格指数",
    page_icon=FAVICON_PATH if FAVICON_PATH.exists() else "🏠",
    layout="wide",
    initial_sidebar_state="collapsed",
)

viewport_mode = str(st.query_params.get("viewport", "desktop"))
is_mobile_viewport = viewport_mode == "mobile"
st.html(
    f"""
    <script>
    (() => {{
        try {{
            const width = window.innerWidth || document.documentElement.clientWidth || 0;
            const mode = width > 0 && width < {MOBILE_BREAKPOINT_PX} ? "mobile" : "desktop";
            const url = new URL(window.location.href);
            if (url.searchParams.get("viewport") !== mode) {{
                url.searchParams.set("viewport", mode);
                window.location.replace(url.toString());
            }}
        }} catch (error) {{}}
    }})();
    </script>
    """,
    unsafe_allow_javascript=True,
)

SIZE_BAND_ORDER = ["全部", "90m2及以下", "90-144m2", "144m2以上"]
METRIC_ORDER = ["环比", "同比", "累计平均"]
RANK_TIER_OPTIONS = ["全部", "一线", "二线", "三线"]
RANK_MOBILE_WINDOW = 10
TREND_DEFAULT_YEARS = 5
UP_COLOR = "#d92d20"
DOWN_COLOR = "#2563eb"
OVERALL_UP_COLOR = "#f97066"
OVERALL_DOWN_COLOR = "#60a5fa"
FLAT_COLOR = "#98a2b3"
BASELINE_COLOR = "#667085"
MISSING_COLOR = "#d0d5dd"
CHANGE_COLORSCALE = [
    [0, DOWN_COLOR],
    [0.5, MISSING_COLOR],
    [1, UP_COLOR],
]
COUNTRY_COLOR_MAP = {
    "中国": UP_COLOR,
    "美国": DOWN_COLOR,
    "日本": "#12b76a",
    "韩国": "#7f56d9",
    "英国": "#f79009",
    "德国": "#475467",
}
# 国家统计局 70 个大中城市一二三线城市划分口径。
TIER_MAP = {
    "北京": "一线",
    "上海": "一线",
    "广州": "一线",
    "深圳": "一线",
    "天津": "二线",
    "石家庄": "二线",
    "太原": "二线",
    "呼和浩特": "二线",
    "沈阳": "二线",
    "大连": "二线",
    "长春": "二线",
    "哈尔滨": "二线",
    "南京": "二线",
    "杭州": "二线",
    "宁波": "二线",
    "合肥": "二线",
    "福州": "二线",
    "厦门": "二线",
    "南昌": "二线",
    "济南": "二线",
    "青岛": "二线",
    "郑州": "二线",
    "武汉": "二线",
    "长沙": "二线",
    "南宁": "二线",
    "海口": "二线",
    "重庆": "二线",
    "成都": "二线",
    "贵阳": "二线",
    "昆明": "二线",
    "西安": "二线",
    "兰州": "二线",
    "西宁": "二线",
    "银川": "二线",
    "乌鲁木齐": "二线",
    "唐山": "三线",
    "秦皇岛": "三线",
    "包头": "三线",
    "丹东": "三线",
    "锦州": "三线",
    "吉林": "三线",
    "牡丹江": "三线",
    "无锡": "三线",
    "徐州": "三线",
    "扬州": "三线",
    "温州": "三线",
    "金华": "三线",
    "蚌埠": "三线",
    "安庆": "三线",
    "泉州": "三线",
    "九江": "三线",
    "赣州": "三线",
    "烟台": "三线",
    "济宁": "三线",
    "洛阳": "三线",
    "平顶山": "三线",
    "宜昌": "三线",
    "襄阳": "三线",
    "岳阳": "三线",
    "常德": "三线",
    "韶关": "三线",
    "湛江": "三线",
    "惠州": "三线",
    "桂林": "三线",
    "北海": "三线",
    "三亚": "三线",
    "泸州": "三线",
    "南充": "三线",
    "遵义": "三线",
    "大理": "三线",
}


@st.cache_data
def load_data(path: Path, mtime_ns: int) -> pd.DataFrame:
    del mtime_ns
    df = pd.read_csv(path)
    df["period"] = df["period"].astype(str)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["change_pct"] = pd.to_numeric(df["change_pct"], errors="coerce")
    df["city_tier"] = df["city"].map(TIER_MAP).fillna("未分层")
    return df.dropna(subset=["value"])


@st.cache_data
def load_optional_csv(path: Path, mtime_ns: int) -> pd.DataFrame:
    del mtime_ns
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def file_mtime_ns(path: Path) -> int:
    return path.stat().st_mtime_ns if path.exists() else 0


def ordered_values(values: pd.Series, preferred_order: list[str]) -> list[str]:
    existing = set(values.dropna().astype(str))
    ordered = [value for value in preferred_order if value in existing]
    ordered.extend(sorted(existing - set(ordered)))
    return ordered


def format_pct(value: float) -> str:
    return f"{value:+.1f}"


def format_period_label(value: str) -> str:
    parts = str(value).split("-", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return f"{parts[0]}年{int(parts[1])}月"
    return str(value)


def format_size_band(value: str) -> str:
    return str(value).replace("m2", "m²")


def period_year_ticks(periods: list[str] | pd.Series) -> tuple[list[str], list[str]]:
    ordered_periods = sorted(pd.Series(periods).dropna().astype(str).unique())
    tickvals: list[str] = []
    ticktext: list[str] = []
    seen_years: set[str] = set()
    for item in ordered_periods:
        year = item[:4]
        if year and year not in seen_years:
            tickvals.append(item)
            ticktext.append(f"{year}年")
            seen_years.add(year)
    return tickvals, ticktext


def category_axis_range(periods: list[str] | pd.Series, count: int | None = None) -> list[float]:
    ordered_periods = sorted(pd.Series(periods).dropna().astype(str).unique())
    if not ordered_periods:
        return [-0.5, 0.5]
    start = 0 if count is None else max(0, len(ordered_periods) - count)
    return [start - 0.5, len(ordered_periods) - 0.5]


def add_time_range_buttons(
    fig: go.Figure,
    periods: list[str] | pd.Series,
    periods_per_year: int = 12,
    active_index: int = 0,
) -> None:
    ordered_periods = sorted(pd.Series(periods).dropna().astype(str).unique())
    if len(ordered_periods) < 2:
        return

    button_specs = [
        ("全部", None),
        ("近3年", 3 * periods_per_year),
        ("近5年", 5 * periods_per_year),
        ("近10年", 10 * periods_per_year),
    ]
    existing_menus = list(fig.layout.updatemenus) if fig.layout.updatemenus else []
    fig.update_layout(
        updatemenus=existing_menus
        + [
            {
                "type": "buttons",
                "direction": "left",
                "x": 0.99,
                "xanchor": "right",
                "y": 1.12,
                "yanchor": "top",
                "pad": {"r": 0, "t": 0},
                "active": active_index,
                "buttons": [
                    {
                        "label": label,
                        "method": "relayout",
                        "args": [{"xaxis.range": category_axis_range(ordered_periods, count)}],
                    }
                    for label, count in button_specs
                ],
            }
        ]
    )


def apply_top_left_legend(fig: go.Figure) -> None:
    fig.update_layout(
        showlegend=True,
        legend={
            "orientation": "h",
            "x": 0,
            "xanchor": "left",
            "y": 1.12,
            "yanchor": "top",
            "font": {"size": 12},
            "bgcolor": "rgba(255,255,255,0.72)",
            "bordercolor": "rgba(208,213,221,0.85)",
            "borderwidth": 1,
        },
        legend_title_text="",
    )


def summarize_period_ranges(periods: list[str]) -> str:
    ordered = sorted(pd.Series(periods).dropna().astype(str).unique())
    if not ordered:
        return ""

    ranges: list[tuple[pd.Period, pd.Period]] = []
    range_start = pd.Period(ordered[0], freq="M")
    previous = range_start
    for item in ordered[1:]:
        current = pd.Period(item, freq="M")
        if current == previous + 1:
            previous = current
            continue
        ranges.append((range_start, previous))
        range_start = current
        previous = current
    ranges.append((range_start, previous))

    def format_range(start: pd.Period, end: pd.Period) -> str:
        if start == end:
            return format_period_label(str(start))
        return f"{format_period_label(str(start))} 至 {format_period_label(str(end))}"

    range_labels = [format_range(start, end) for start, end in ranges]
    if len(range_labels) > 3:
        return "、".join(range_labels[:3]) + " 等"
    return "、".join(range_labels)


def missing_period_note(periods: list[str], label: str) -> str:
    count = len(set(periods))
    if count == 0:
        return ""
    return f"* {count} 个月份{label}：{summarize_period_ranges(periods)}"


def css_content(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def render_plotly_chart(fig: go.Figure) -> None:
    if "width" in inspect.signature(st.plotly_chart).parameters:
        st.plotly_chart(fig, width="stretch")
    else:
        st.plotly_chart(fig, use_container_width=True)


if not DATA_PATH.exists():
    st.error("未找到数据文件，请先运行 scripts/fetch_stats.py 抓取数据。")
    st.stop()

data = load_data(DATA_PATH, file_mtime_ns(DATA_PATH))
international_context = load_optional_csv(INTERNATIONAL_CONTEXT_PATH, file_mtime_ns(INTERNATIONAL_CONTEXT_PATH))
demography_context = load_optional_csv(DEMOGRAPHY_CONTEXT_PATH, file_mtime_ns(DEMOGRAPHY_CONTEXT_PATH))

periods = sorted(data["period"].unique(), reverse=True)
house_types = ordered_values(data["house_type"], ["新建商品住宅", "二手住宅"])

with st.sidebar:
    st.header("筛选")
    period = st.selectbox("月份", periods)
    default_house_type_index = house_types.index("二手住宅") if "二手住宅" in house_types else 0
    house_type = st.selectbox("住宅类型", house_types, index=default_house_type_index)

    scoped = data[(data["period"] == period) & (data["house_type"] == house_type)]
    size_bands = ordered_values(scoped["size_band"], SIZE_BAND_ORDER)
    size_band = st.selectbox("面积段", size_bands, format_func=format_size_band)

    scoped = scoped[scoped["size_band"] == size_band]
    metrics = ordered_values(scoped["metric"], METRIC_ORDER)
    metric = st.selectbox("指标", metrics)

    st.divider()
    with st.expander("数据范围"):
        st.caption(f"70 城：{format_period_label(data['period'].min())} 至 {format_period_label(data['period'].max())}")
        if not international_context.empty:
            st.caption(
                f"BIS：{international_context['period'].min()} 至 {international_context['period'].max()}"
            )
        if not demography_context.empty:
            st.caption(f"人口动态：{demography_context['year'].min()} 至 {demography_context['year'].max()}")
    with st.expander("指标说明"):
        st.caption("环比：上月=100")
        st.caption("同比：上年同月=100")
        st.caption("累计平均：上年同期=100")
        st.caption("图中变动值 = 指数 - 100")

filtered = data[
    (data["period"] == period)
    & (data["house_type"] == house_type)
    & (data["size_band"] == size_band)
    & (data["metric"] == metric)
].copy()

if filtered.empty:
    st.warning("当前筛选条件没有数据。")
    st.stop()

header_title = "全国 70 城商品住宅价格指数"
source = filtered["source_url"].dropna().iloc[0]
size_band_label = format_size_band(size_band)
view_title = f"价格概览 · {house_type} · {size_band_label} · {metric} · {format_period_label(period)}"
st.markdown(
    f"""
    <style>
    #MainMenu,
    footer,
    [data-testid="stDecoration"],
    [data-testid="stStatusWidget"],
    [data-testid="stDeployButton"],
    [data-testid="stAppDeployButton"],
    .stAppDeployButton,
    button[title="Deploy"],
    button[aria-label="Deploy"] {{
        display: none !important;
        visibility: hidden !important;
    }}

    [data-testid="stSidebarCollapsedControl"],
    [data-testid="stSidebarCollapseButton"] {{
        display: flex !important;
        opacity: 1 !important;
        visibility: visible !important;
        z-index: 999999 !important;
    }}

    [data-testid="stHeader"],
    .stAppHeader {{
        background: rgba(255, 255, 255, 0.96) !important;
        border-bottom: 1px solid #e5e7eb;
        height: 3.5rem;
    }}

    [data-testid="stHeader"]::before,
    .stAppHeader::before {{
        content: "";
        display: none;
    }}

    .app-header-link,
    .app-header-link:hover,
    .app-header-link:focus,
    .app-header-link:visited {{
        color: #111827 !important;
        text-decoration: none !important;
    }}

    .app-header-link {{
        display: block;
        font-size: 1.5rem;
        font-weight: 700;
        left: 4rem;
        line-height: 1.1;
        max-width: calc(100vw - 8rem);
        overflow: hidden;
        position: fixed;
        text-overflow: ellipsis;
        top: 1.75rem;
        transform: translateY(-50%);
        white-space: nowrap;
        z-index: 999990;
    }}

    .app-header-link:hover,
    .app-header-link:focus {{
        color: #1d4ed8 !important;
    }}

    @media (min-width: 901px) {{
        body:has([data-testid="stSidebar"][aria-expanded="true"]) .app-header-link {{
            left: 25rem;
            max-width: calc(100vw - 29rem);
        }}
    }}

    .block-container {{
        padding-top: 1.78rem;
        padding-bottom: 0.8rem;
    }}

    .view-title {{
        align-items: center;
        color: #111827;
        display: flex;
        font-size: 1.25rem;
        font-weight: 600;
        gap: 0.45rem;
        letter-spacing: 0;
        line-height: 1.3;
        margin: 0 0 1rem;
    }}

    .chart-title {{
        color: #111827;
        font-size: 1.05rem;
        font-weight: 700;
        line-height: 1.3;
        margin: 1.35rem 0 0.35rem;
    }}

    .chart-title.compact {{
        font-size: 0.98rem;
        margin: 0.45rem 0 0.35rem;
    }}

    .block-container [data-testid="stExpander"] {{
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        margin: 0 0 0.95rem !important;
    }}

    .block-container [data-testid="stExpander"] details {{
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
    }}

    .block-container [data-testid="stExpander"] summary {{
        align-items: center !important;
        background: transparent !important;
        border-bottom: 1px solid #e5e7eb !important;
        border-radius: 0 !important;
        min-height: auto !important;
        padding: 0.32rem 0 0.52rem !important;
    }}

    .block-container [data-testid="stExpander"] summary:hover {{
        background: transparent !important;
    }}

    .block-container [data-testid="stExpander"] summary p {{
        color: #111827 !important;
        font-size: 1.25rem !important;
        font-weight: 650 !important;
        letter-spacing: 0 !important;
        line-height: 1.3 !important;
    }}

    .block-container [data-testid="stExpander"] [data-testid="stExpanderToggleIcon"] {{
        color: #667085 !important;
        margin-right: 0.35rem !important;
    }}

    .block-container [data-testid="stExpander"] [data-testid="stExpanderDetails"] {{
        border: 0 !important;
        padding: 0.55rem 0 0.2rem !important;
    }}

    .source-link,
    .source-link:hover,
    .source-link:focus,
    .source-link:visited {{
        text-decoration: none !important;
    }}

    .source-link {{
        align-items: center;
        border-radius: 0.375rem;
        color: #667085 !important;
        display: inline-flex;
        flex: 0 0 auto;
        height: 1.6rem;
        justify-content: center;
        transform: translateY(1px);
        width: 1.6rem;
    }}

    .source-link:hover,
    .source-link:focus {{
        background: #f2f4f7;
        color: #111827 !important;
    }}

    .source-link svg {{
        height: 1rem;
        stroke: currentColor;
        width: 1rem;
    }}

    .section-source-link {{
        margin-bottom: 0.35rem;
    }}

    .trend-note {{
        color: #667085;
        font-size: 0.86rem;
        margin: -0.4rem 0 1.5rem;
    }}

    .app-footer {{
        border-top: 1px solid #e5e7eb;
        color: #667085;
        font-size: 0.85rem;
        margin-top: 0.85rem;
        padding: 1.05rem 0 0.85rem;
        text-align: center;
    }}

    .app-footer a {{
        color: #475467;
        text-decoration: none;
    }}

    .app-footer a:hover {{
        color: #1d4ed8;
        text-decoration: underline;
    }}

    .scroll-jump {{
        bottom: 1.85rem;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        position: fixed;
        right: 1.05rem;
        z-index: 999991;
    }}

    .element-container:has(.page-anchor),
    [data-testid="stMarkdownContainer"]:has(.page-anchor) {{
        height: 0 !important;
        margin: 0 !important;
        min-height: 0 !important;
        overflow: visible !important;
        padding: 0 !important;
    }}

    .page-anchor {{
        display: block;
        height: 0;
        scroll-margin-top: 3.5rem;
    }}

    .scroll-jump a {{
        align-items: center;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid #d0d5dd;
        border-radius: 999px;
        box-shadow: 0 0.55rem 1.4rem rgba(16, 24, 40, 0.14);
        color: #344054;
        display: inline-flex;
        height: 2.25rem;
        justify-content: center;
        text-decoration: none;
        width: 2.25rem;
    }}

    .scroll-jump a:hover,
    .scroll-jump a:focus {{
        background: #f9fafb;
        border-color: #98a2b3;
        color: #111827;
    }}

    .scroll-jump svg {{
        height: 1.05rem;
        stroke: currentColor;
        width: 1.05rem;
    }}

    @media (max-width: 900px) {{
        [data-testid="stSidebar"] {{
            box-shadow: 0 1.25rem 3rem rgba(16, 24, 40, 0.22);
            height: 100vh !important;
            max-width: min(88vw, 22rem) !important;
            position: fixed !important;
            top: 0 !important;
            z-index: 999998 !important;
        }}

        [data-testid="stSidebar"] > div {{
            background: #ffffff !important;
        }}

        [data-testid="stAppViewContainer"],
        [data-testid="stMain"] {{
            margin-left: 0 !important;
        }}

        [data-testid="stHeader"],
        .stAppHeader {{
            height: 3.25rem;
        }}

        [data-testid="stHeader"]::before,
        .stAppHeader::before {{
            content: "";
            display: none;
        }}

        .app-header-link {{
            font-size: 1.12rem;
            left: 3.25rem;
            max-width: calc(100vw - 5.75rem);
            top: 1.625rem;
        }}

        .block-container {{
            padding-left: 0.8rem;
            padding-right: 0.8rem;
            padding-top: 1.68rem;
        }}

        .view-title {{
            align-items: flex-start;
            flex-wrap: wrap;
            font-size: 1rem;
            gap: 0.25rem 0.4rem;
            margin-bottom: 0.85rem;
        }}

        .chart-title {{
            font-size: 0.98rem;
            margin-top: 1.05rem;
        }}

        .chart-title.compact {{
            margin-top: 0.35rem;
        }}

        .block-container [data-testid="stExpander"] summary p {{
            font-size: 1.02rem !important;
        }}

        .trend-note {{
            font-size: 0.8rem;
            margin-bottom: 1.1rem;
        }}

        .app-footer {{
            font-size: 0.78rem;
            line-height: 1.6;
            margin-top: 0.7rem;
            padding-bottom: 1rem;
            padding-top: 1rem;
        }}

        .scroll-jump {{
            bottom: 1.35rem;
            right: 0.75rem;
        }}

        .scroll-jump a {{
            height: 2.15rem;
            width: 2.15rem;
        }}
    }}
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    f'<a class="app-header-link" href="" target="_self" aria-label="刷新页面">{html.escape(header_title)}</a>',
    unsafe_allow_html=True,
)

st.markdown('<span id="app-top" class="page-anchor"></span>', unsafe_allow_html=True)

st.markdown(
    """
    <div class="scroll-jump">
        <a href="#app-top" onclick="window.scrollTo({top: 0, behavior: 'smooth'}); return false;" title="回到顶部" aria-label="回到顶部">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m18 15-6-6-6 6"></path>
            </svg>
        </a>
        <a href="#app-bottom" onclick="window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'smooth'}); return false;" title="到底部" aria-label="到底部">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6"></path>
            </svg>
        </a>
    </div>
    """,
    unsafe_allow_html=True,
)

with st.expander(view_title, expanded=True):
    st.markdown(
        f"""
        <a class="source-link section-source-link" href="{html.escape(source, quote=True)}" target="_blank" rel="noopener noreferrer" title="查看国家统计局原文" aria-label="查看国家统计局原文">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 3h6v6"></path>
                <path d="M10 14 21 3"></path>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            </svg>
        </a>
        """,
        unsafe_allow_html=True,
    )

    filtered = filtered.sort_values("change_pct", ascending=False).reset_index(drop=True)
    filtered["rank"] = filtered.index + 1

    city_count = int(filtered["city"].nunique())
    up_count = int((filtered["change_pct"] > 0).sum())
    flat_count = int((filtered["change_pct"] == 0).sum())
    down_count = int((filtered["change_pct"] < 0).sum())
    avg_change = filtered["change_pct"].mean()
    max_row = filtered.loc[filtered["change_pct"].idxmax()]
    min_row = filtered.loc[filtered["change_pct"].idxmin()]

    summary_cols = st.columns(6)
    summary_cols[0].metric("覆盖城市", city_count)
    summary_cols[1].metric("上涨", up_count)
    summary_cols[2].metric("持平", flat_count)
    summary_cols[3].metric("下降", down_count)
    summary_cols[4].metric("均值", format_pct(avg_change))
    summary_cols[5].metric("区间", f"{format_pct(min_row['change_pct'])} ~ {format_pct(max_row['change_pct'])}")

    rank_color_limit = max(abs(filtered["change_pct"].min()), abs(filtered["change_pct"].max()), 0.1)
    rank_tier_options = ["全部"] + [tier for tier in RANK_TIER_OPTIONS[1:] if tier in set(filtered["city_tier"])]


    def build_rank_view(selected_tier: str) -> pd.DataFrame:
        if selected_tier == "全部":
            view = filtered.copy()
        else:
            view = filtered[filtered["city_tier"] == selected_tier].copy()
        view = view.reset_index(drop=True)
        view["display_rank"] = view.index + 1
        return view


    def rank_bar_colors(view: pd.DataFrame) -> list[str]:
        return px.colors.sample_colorscale(
            CHANGE_COLORSCALE,
            ((view["change_pct"] + rank_color_limit) / (2 * rank_color_limit)).clip(0, 1).tolist(),
        )


    def rank_axis_range(view: pd.DataFrame) -> list[float]:
        if view.empty:
            return [0.5, 1.5]
        visible_count = min(len(view), RANK_MOBILE_WINDOW) if is_mobile_viewport else len(view)
        return [view["display_rank"].min() - 0.5, visible_count + 0.5]


    def rank_button_args(selected_tier: str) -> list[dict[str, object]]:
        view = build_rank_view(selected_tier)
        return [
            {
                "x": [view["display_rank"].tolist()],
                "y": [view["change_pct"].tolist()],
                "text": [view["change_pct"].map(format_pct).tolist()],
                "customdata": [view[["city", "value", "rank", "city_tier"]].values.tolist()],
                "marker.color": [rank_bar_colors(view)],
            },
            {
                "xaxis.tickvals": view["display_rank"].tolist(),
                "xaxis.ticktext": view["city"].tolist(),
                "xaxis.range": rank_axis_range(view),
            },
        ]


    rank_view = build_rank_view("全部")

    st.markdown('<div class="chart-title">城市排名</div>', unsafe_allow_html=True)
    fig = go.Figure()
    fig.add_bar(
        x=rank_view["display_rank"],
        y=rank_view["change_pct"],
        marker={
            "color": rank_bar_colors(rank_view),
            "line": {"width": 0},
        },
        text=rank_view["change_pct"].map(format_pct),
        textposition="outside",
        cliponaxis=False,
        customdata=rank_view[["city", "value", "rank", "city_tier"]].values.tolist(),
        hovertemplate=(
            "当前排名 %{x}<br>"
            "全市排名 %{customdata[2]}<br>"
            "城市 %{customdata[0]}（%{customdata[3]}）<br>"
            "指数 %{customdata[1]:.1f}<br>"
            "变动 %{y:+.1f}<extra></extra>"
        ),
    )
    fig.add_hline(y=0, line_color=BASELINE_COLOR, line_width=1)
    fig.update_layout(
        height=580,
        xaxis={
            "title": "城市",
            "tickmode": "array",
            "tickvals": rank_view["display_rank"],
            "ticktext": rank_view["city"],
            "range": rank_axis_range(rank_view),
            "showgrid": False,
        },
        yaxis={"zeroline": True},
        margin={"l": 55, "r": 25, "t": 70, "b": 125},
        updatemenus=[
            {
                "type": "buttons",
                "direction": "left",
                "x": 0.99,
                "xanchor": "right",
                "y": 1.12,
                "yanchor": "top",
                "pad": {"r": 0, "t": 0},
                "buttons": [
                    {
                        "label": tier,
                        "method": "update",
                        "args": rank_button_args(tier),
                    }
                    for tier in rank_tier_options
                ],
            }
        ],
        showlegend=False,
    )
    fig.update_xaxes(tickangle=-35)
    render_plotly_chart(fig)

    extreme_col, dist_col = st.columns([1, 1])
    tier_col = st.container()

    with extreme_col:
        st.markdown('<div class="chart-title compact">首尾城市对比</div>', unsafe_allow_html=True)
        extremes = pd.concat([filtered.head(5), filtered.tail(5)]).drop_duplicates(subset=["city"])
        fig = px.bar(
            extremes.sort_values("change_pct"),
            x="change_pct",
            y="city",
            color="change_pct",
            color_continuous_scale=CHANGE_COLORSCALE,
            range_color=[-rank_color_limit, rank_color_limit],
            orientation="h",
            text=extremes.sort_values("change_pct")["change_pct"].map(format_pct),
            labels={"change_pct": "较基期变动", "city": "城市"},
        )
        fig.add_vline(x=0, line_color=BASELINE_COLOR, line_width=1)
        fig.update_traces(textposition="outside", cliponaxis=False)
        fig.update_layout(height=390, margin={"l": 70, "r": 20, "t": 35, "b": 45}, coloraxis_showscale=False)
        render_plotly_chart(fig)

    with dist_col:
        st.markdown('<div class="chart-title compact">城市涨跌分布</div>', unsafe_allow_html=True)
        binned = pd.cut(filtered["change_pct"], bins=18, include_lowest=True)
        dist = (
            binned.value_counts(sort=False)
            .rename_axis("bin")
            .reset_index(name="cities")
            .dropna(subset=["bin"])
        )
        dist = dist[dist["cities"] > 0].copy()
        dist["bin_mid"] = dist["bin"].map(lambda value: value.mid).astype(float)
        dist["bin_left"] = dist["bin"].map(lambda value: value.left).astype(float)
        dist["bin_right"] = dist["bin"].map(lambda value: value.right).astype(float)
        dist["range_label"] = dist["bin"].map(lambda value: f"{value.left:.1f} 至 {value.right:.1f}")
        dist["x_pos"] = range(len(dist))
        color_limit = max(abs(filtered["change_pct"].min()), abs(filtered["change_pct"].max()), 0.1)

        fig = go.Figure()
        fig.add_bar(
            x=dist["x_pos"],
            y=dist["cities"],
            width=1,
            marker={
                "color": dist["bin_mid"],
                "colorscale": CHANGE_COLORSCALE,
                "cmin": -color_limit,
                "cmax": color_limit,
                "line": {"width": 0},
            },
            customdata=dist[["range_label", "bin_mid"]],
            hovertemplate="变动区间 %{customdata[0]}<br>城市数 %{y}<br>区间中点 %{customdata[1]:+.2f}<extra></extra>",
        )

        tick_values = [0, len(dist) - 1]
        tick_labels = [f"{dist['bin_left'].iloc[0]:.1f}", f"{dist['bin_right'].iloc[-1]:.1f}"]
        zero_tick = None
        zero_bin = dist[(dist["bin_left"] <= 0) & (dist["bin_right"] >= 0)]
        if not zero_bin.empty:
            zero_row = zero_bin.iloc[0]
            zero_width = zero_row["bin_right"] - zero_row["bin_left"]
            zero_offset = 0 if zero_width == 0 else (0 - zero_row["bin_left"]) / zero_width
            zero_tick = float(zero_row["x_pos"] - 0.5 + zero_offset)
            fig.add_vline(x=zero_tick, line_color=BASELINE_COLOR, line_width=1)
        else:
            left_of_zero = int((dist["bin_right"] < 0).sum())
            if 0 < left_of_zero < len(dist):
                zero_tick = left_of_zero - 0.5
                fig.add_vline(x=zero_tick, line_color=BASELINE_COLOR, line_width=1)
        if zero_tick is not None and all(abs(zero_tick - value) > 0.4 for value in tick_values):
            tick_values.insert(1, zero_tick)
            tick_labels.insert(1, "0")

        fig.update_layout(
            height=380,
            margin={"l": 55, "r": 20, "t": 35, "b": 50},
            xaxis={
                "title": "较基期变动",
                "tickmode": "array",
                "tickvals": tick_values,
                "ticktext": tick_labels,
                "range": [-0.5, len(dist) - 0.5],
            },
            yaxis={"title": "城市数"},
            bargap=0,
            bargroupgap=0,
            showlegend=False,
        )
        render_plotly_chart(fig)

    with tier_col:
        st.markdown('<div class="chart-title compact">城市层级对比</div>', unsafe_allow_html=True)
        tier_summary = (
            filtered.groupby("city_tier", as_index=False)
            .agg(
                avg_change=("change_pct", "mean"),
                min_change=("change_pct", "min"),
                max_change=("change_pct", "max"),
                up=("change_pct", lambda value: int((value > 0).sum())),
                flat=("change_pct", lambda value: int((value == 0).sum())),
                down=("change_pct", lambda value: int((value < 0).sum())),
                cities=("city", "count"),
            )
        )
        tier_order = ["一线", "二线", "三线", "未分层"]
        tier_summary["tier_order"] = tier_summary["city_tier"].map({tier: index for index, tier in enumerate(tier_order)}).fillna(99)
        tier_summary = tier_summary.sort_values(["tier_order", "city_tier"])
        visible_tier_order = [tier for tier in tier_order if tier in set(tier_summary["city_tier"])]
        tier_y_map = {tier: len(visible_tier_order) - index - 1 for index, tier in enumerate(visible_tier_order)}
        tier_summary["tier_y"] = tier_summary["city_tier"].map(tier_y_map)
        tier_summary["down_display"] = -tier_summary["down"]
        tier_summary["flat_base"] = -tier_summary["flat"] / 2
        tier_customdata = tier_summary[
            ["city_tier", "cities", "up", "flat", "down", "avg_change", "min_change", "max_change"]
        ].values.tolist()

        fig = make_subplots(
            rows=1,
            cols=2,
            shared_yaxes=True,
            horizontal_spacing=0.08,
            column_widths=[0.44, 0.56],
            subplot_titles=("涨跌数量", "涨跌幅范围"),
        )
        fig.add_bar(
            x=tier_summary["down_display"],
            y=tier_summary["tier_y"],
            orientation="h",
            marker_color=OVERALL_DOWN_COLOR,
            text=tier_summary["down"].map(lambda value: str(value) if value else ""),
            textposition="inside",
            insidetextanchor="middle",
            textfont={"color": "#ffffff", "size": 11},
            customdata=tier_customdata,
            hovertemplate=(
                "%{customdata[0]}<br>"
                "下跌 %{customdata[4]} 城<br>上涨 %{customdata[2]} 城<br>持平 %{customdata[3]} 城<br>"
                "均值 %{customdata[5]:+.1f}<br>范围 %{customdata[6]:+.1f} 至 %{customdata[7]:+.1f}"
                "<extra></extra>"
            ),
            showlegend=False,
            width=0.34,
            row=1,
            col=1,
        )
        fig.add_bar(
            x=tier_summary["up"],
            y=tier_summary["tier_y"],
            orientation="h",
            marker_color=OVERALL_UP_COLOR,
            text=tier_summary["up"].map(lambda value: str(value) if value else ""),
            textposition="inside",
            insidetextanchor="middle",
            textfont={"color": "#ffffff", "size": 11},
            customdata=tier_customdata,
            hovertemplate=(
                "%{customdata[0]}<br>"
                "上涨 %{customdata[2]} 城<br>下跌 %{customdata[4]} 城<br>持平 %{customdata[3]} 城<br>"
                "均值 %{customdata[5]:+.1f}<br>范围 %{customdata[6]:+.1f} 至 %{customdata[7]:+.1f}"
                "<extra></extra>"
            ),
            showlegend=False,
            width=0.34,
            row=1,
            col=1,
        )
        flat_rows = tier_summary[tier_summary["flat"] > 0]
        if not flat_rows.empty:
            fig.add_bar(
                x=flat_rows["flat"],
                y=flat_rows["tier_y"],
                base=flat_rows["flat_base"],
                orientation="h",
                marker_color=FLAT_COLOR,
                text=flat_rows["flat"].map(str),
                textposition="inside",
                insidetextanchor="middle",
                textfont={"color": "#ffffff", "size": 11},
                customdata=flat_rows[
                    ["city_tier", "cities", "up", "flat", "down", "avg_change", "min_change", "max_change"]
                ].values.tolist(),
                hovertemplate=(
                    "%{customdata[0]}<br>"
                    "持平 %{customdata[3]} 城<br>上涨 %{customdata[2]} 城<br>下跌 %{customdata[4]} 城<br>"
                    "均值 %{customdata[5]:+.1f}<br>范围 %{customdata[6]:+.1f} 至 %{customdata[7]:+.1f}"
                    "<extra></extra>"
                ),
                showlegend=False,
                width=0.34,
                row=1,
                col=1,
            )

        for row in tier_summary.itertuples(index=False):
            range_customdata = [[
                row.city_tier,
                row.cities,
                row.up,
                row.flat,
                row.down,
                row.avg_change,
                row.min_change,
                row.max_change,
            ]]
            range_line_customdata = range_customdata * 2
            fig.add_scatter(
                x=[row.min_change, row.max_change],
                y=[row.tier_y, row.tier_y],
                mode="lines",
                line={"color": BASELINE_COLOR, "width": 14},
                opacity=0.22,
                customdata=range_line_customdata,
                hovertemplate=(
                    "%{customdata[0]}<br>"
                    "范围 %{customdata[6]:+.1f} 至 %{customdata[7]:+.1f}<br>"
                    "均值 %{customdata[5]:+.1f}<br>上涨 %{customdata[2]} 城｜持平 %{customdata[3]} 城｜下跌 %{customdata[4]} 城"
                    "<extra></extra>"
                ),
                showlegend=False,
                row=1,
                col=2,
            )
            fig.add_scatter(
                x=[row.min_change, row.max_change],
                y=[row.tier_y, row.tier_y],
                mode="markers",
                marker={
                    "color": [OVERALL_DOWN_COLOR, OVERALL_UP_COLOR],
                    "size": 9,
                    "line": {"color": "#ffffff", "width": 1},
                },
                hoverinfo="skip",
                showlegend=False,
                row=1,
                col=2,
            )
            fig.add_scatter(
                x=[row.avg_change],
                y=[row.tier_y],
                mode="markers+text",
                marker={
                    "symbol": "diamond",
                    "color": "#111827",
                    "size": 13,
                    "line": {"color": "#ffffff", "width": 2},
                },
                text=[format_pct(row.avg_change)],
                textposition="top center",
                customdata=range_customdata,
                hovertemplate=(
                    "%{customdata[0]}<br>"
                    "均值 %{customdata[5]:+.1f}<br>范围 %{customdata[6]:+.1f} 至 %{customdata[7]:+.1f}<br>"
                    "上涨 %{customdata[2]} 城｜持平 %{customdata[3]} 城｜下跌 %{customdata[4]} 城"
                    "<extra></extra>"
                ),
                showlegend=False,
                row=1,
                col=2,
            )
            fig.add_annotation(
                x=(row.min_change + row.max_change) / 2,
                y=row.tier_y - 0.28,
                text=f"{row.cities}城 · ↑{row.up} -{row.flat} ↓{row.down}",
                showarrow=False,
                xanchor="center",
                yanchor="top",
                font={"size": 11, "color": "#475467"},
                row=1,
                col=2,
            )

        tier_axis_limit = max(
            int(tier_summary[["up", "down"]].max().max()),
            int((tier_summary["flat"].max() / 2).round()),
            1,
        )
        tier_axis_limit = max(tier_axis_limit, 4)
        tick_step = 10 if tier_axis_limit > 20 else 5
        tier_axis_limit = ((tier_axis_limit + tick_step - 1) // tick_step) * tick_step
        tick_values = list(range(-tier_axis_limit, tier_axis_limit + 1, tick_step))
        change_axis_limit = max(abs(tier_summary["min_change"].min()), abs(tier_summary["max_change"].max()), 0.1)
        fig.add_vline(x=0, line_color=BASELINE_COLOR, line_width=1, row=1, col=1)
        fig.add_vline(x=0, line_color=BASELINE_COLOR, line_width=1, row=1, col=2)
        fig.update_layout(
            barmode="relative",
            height=390,
            margin={"l": 65, "r": 45, "t": 58, "b": 48},
            showlegend=False,
        )
        fig.update_xaxes(
            title="城市数",
            range=[-tier_axis_limit * 1.12, tier_axis_limit * 1.12],
            tickmode="array",
            tickvals=tick_values,
            ticktext=[str(abs(value)) for value in tick_values],
            row=1,
            col=1,
        )
        fig.update_xaxes(
            title="较基期变动",
            range=[-change_axis_limit * 1.18, change_axis_limit * 1.45],
            zeroline=False,
            row=1,
            col=2,
        )
        fig.update_yaxes(
            title="",
            tickmode="array",
            tickvals=[tier_y_map[tier] for tier in visible_tier_order],
            ticktext=visible_tier_order,
            range=[-0.65, len(visible_tier_order) - 0.2],
            row=1,
            col=1,
        )
        fig.update_yaxes(
            showticklabels=False,
            range=[-0.65, len(visible_tier_order) - 0.2],
            row=1,
            col=2,
        )
        render_plotly_chart(fig)

with st.expander(f"价格趋势 · {house_type} · {size_band_label} · {metric}", expanded=True):
    overall_trend = data[
        (data["house_type"] == house_type)
        & (data["size_band"] == size_band)
        & (data["metric"] == metric)
    ].copy()

    if not overall_trend.empty:
        st.markdown('<div class="chart-title">整体趋势</div>', unsafe_allow_html=True)
        month_index = pd.period_range(overall_trend["period"].min(), overall_trend["period"].max(), freq="M").astype(str)
        monthly = overall_trend.groupby("period").agg(
            covered=("city", "nunique"),
            up=("change_pct", lambda values: int((values > 0).sum())),
            flat=("change_pct", lambda values: int((values == 0).sum())),
            down=("change_pct", lambda values: int((values < 0).sum())),
        )
        monthly = monthly.reindex(month_index).rename_axis("period").reset_index()
        expected_city_count = len(TIER_MAP)
        monthly["covered_display"] = monthly["covered"].fillna(0).astype(int)
        monthly["up_display"] = monthly["up"].fillna(0).astype(int)
        monthly["flat_display"] = monthly["flat"].fillna(0).astype(int)
        monthly["down_display"] = monthly["down"].fillna(0).astype(int)
        monthly["data_status"] = monthly["covered_display"].map(
            lambda count: "数据完整" if count == expected_city_count else "数据不完整"
        )
        incomplete_overall_periods = monthly.loc[monthly["covered_display"] < expected_city_count, "period"].tolist()
        overall_customdata = monthly[
            ["up_display", "flat_display", "down_display", "covered_display", "data_status"]
        ].values.tolist()
        year_tickvals, year_ticktext = period_year_ticks(monthly["period"])

        fig = go.Figure()
        fig.add_bar(
            x=monthly["period"],
            y=monthly["up_display"],
            name="上涨",
            marker_color=OVERALL_UP_COLOR,
            customdata=overall_customdata,
            hovertemplate=(
                "月份 %{x}<br>上涨 %{customdata[0]}<br>持平 %{customdata[1]}<br>"
                "下跌 %{customdata[2]}<br>覆盖城市 %{customdata[3]}/70<br>%{customdata[4]}<extra></extra>"
            ),
        )
        fig.add_bar(
            x=monthly["period"],
            y=monthly["flat_display"],
            name="持平",
            marker_color=FLAT_COLOR,
            customdata=overall_customdata,
            hovertemplate=(
                "月份 %{x}<br>上涨 %{customdata[0]}<br>持平 %{customdata[1]}<br>"
                "下跌 %{customdata[2]}<br>覆盖城市 %{customdata[3]}/70<br>%{customdata[4]}<extra></extra>"
            ),
        )
        fig.add_bar(
            x=monthly["period"],
            y=-monthly["down_display"],
            name="下跌",
            marker_color=OVERALL_DOWN_COLOR,
            customdata=overall_customdata,
            hovertemplate=(
                "月份 %{x}<br>上涨 %{customdata[0]}<br>持平 %{customdata[1]}<br>"
                "下跌 %{customdata[2]}<br>覆盖城市 %{customdata[3]}/70<br>%{customdata[4]}<extra></extra>"
            ),
        )
        fig.add_hline(y=0, line_color=BASELINE_COLOR, line_width=1)
        trend_default_months = TREND_DEFAULT_YEARS * 12 if is_mobile_viewport else None
        trend_active_index = 2 if is_mobile_viewport else 0
        fig.update_layout(
            barmode="relative",
            height=460,
            margin={"l": 55, "r": 20, "t": 72, "b": 72},
            xaxis={
                "title": "年份",
                "type": "category",
                "categoryorder": "array",
                "categoryarray": monthly["period"].tolist(),
                "range": category_axis_range(monthly["period"], trend_default_months),
                "tickmode": "array",
                "tickvals": year_tickvals,
                "ticktext": year_ticktext,
            },
            yaxis={
                "title": "城市数",
                "tickmode": "array",
                "tickvals": [-70, -35, 0, 35, 70],
                "ticktext": ["70", "35", "0", "35", "70"],
                "range": [-70, 70],
            },
        )
        apply_top_left_legend(fig)
        add_time_range_buttons(fig, monthly["period"], active_index=trend_active_index)
        render_plotly_chart(fig)
        overall_missing_note = missing_period_note(incomplete_overall_periods, "数据不完整")
        if overall_missing_note:
            st.markdown(f'<div class="trend-note">{overall_missing_note}</div>', unsafe_allow_html=True)

    cities = sorted(data["city"].unique())
    default_cities = [city for city in ["北京", "上海", "广州", "深圳"] if city in cities]
    if "trend_cities" not in st.session_state:
        st.session_state["trend_cities"] = default_cities
    else:
        st.session_state["trend_cities"] = [city for city in st.session_state["trend_cities"] if city in cities]

    st.markdown('<div class="chart-title">城市趋势</div>', unsafe_allow_html=True)
    selected_cities = st.multiselect("城市", cities, key="trend_cities", label_visibility="collapsed")

    trend = data[
        (data["city"].isin(selected_cities))
        & (data["house_type"] == house_type)
        & (data["size_band"] == size_band)
        & (data["metric"] == metric)
    ].copy()

    if selected_cities and not trend.empty:
        trend_periods = pd.period_range(trend["period"].min(), trend["period"].max(), freq="M").astype(str).tolist()
        trend_frame = pd.MultiIndex.from_product(
            [selected_cities, trend_periods],
            names=["city", "period"],
        ).to_frame(index=False)
        trend_complete = trend_frame.merge(trend, on=["city", "period"], how="left")
        year_tickvals, year_ticktext = period_year_ticks(trend_periods)

        fig = px.line(
            trend.sort_values(["city", "period"]),
            x="period",
            y="change_pct",
            color="city",
            markers=True,
            labels={"period": "年份", "change_pct": "较基期变动", "city": "城市"},
        )
        fig.add_hline(y=0, line_color=BASELINE_COLOR, line_width=1)
        trend_default_months = TREND_DEFAULT_YEARS * 12 if is_mobile_viewport else None
        trend_active_index = 2 if is_mobile_viewport else 0
        fig.update_layout(
            height=440,
            margin={"l": 55, "r": 20, "t": 86, "b": 72},
            xaxis={
                "title": "年份",
                "type": "category",
                "categoryorder": "array",
                "categoryarray": trend_periods,
                "range": category_axis_range(trend_periods, trend_default_months),
                "tickmode": "array",
                "tickvals": year_tickvals,
                "ticktext": year_ticktext,
            },
        )
        apply_top_left_legend(fig)
        add_time_range_buttons(fig, trend_periods, active_index=trend_active_index)
        render_plotly_chart(fig)
        missing_city_periods = (
            trend_complete.loc[trend_complete["change_pct"].isna(), "period"].drop_duplicates().astype(str).tolist()
        )
        trend_missing_note = missing_period_note(missing_city_periods, "选中城市数据缺失")
        if trend_missing_note:
            st.markdown(f'<div class="trend-note">{trend_missing_note}</div>', unsafe_allow_html=True)

if not international_context.empty:
    with st.expander("国际住宅价格指数", expanded=True):
        international_context["value"] = pd.to_numeric(international_context["value"], errors="coerce")
        default_countries = [country for country in ["中国", "美国", "日本", "韩国"] if country in set(international_context["country"])]
        selected_countries = st.multiselect(
            "国际对比国家",
            sorted(international_context["country"].unique()),
            default=default_countries,
            label_visibility="collapsed",
        )
        international_view = international_context[international_context["country"].isin(selected_countries)].copy()
        if not international_view.empty:
            international_periods = sorted(international_view["period"].dropna().astype(str).unique())
            year_tickvals, year_ticktext = period_year_ticks(international_periods)
            fig = px.line(
                international_view.sort_values(["country", "period"]),
                x="period",
                y="value",
                color="country",
                markers=True,
                color_discrete_map=COUNTRY_COLOR_MAP,
                labels={"period": "年度", "value": "指数", "country": "国家"},
            )
            fig.update_traces(
                hovertemplate="国家 %{fullData.name}<br>季度 %{x}<br>指数 %{y:.1f}<extra></extra>"
            )
            international_default_quarters = TREND_DEFAULT_YEARS * 4 if is_mobile_viewport else None
            trend_active_index = 2 if is_mobile_viewport else 0
            fig.update_layout(
                height=430,
                margin={"l": 55, "r": 20, "t": 86, "b": 60},
                xaxis={
                    "title": "年度",
                    "type": "category",
                    "categoryorder": "array",
                    "categoryarray": international_periods,
                    "range": category_axis_range(international_periods, international_default_quarters),
                    "tickmode": "array",
                    "tickvals": year_tickvals,
                    "ticktext": year_ticktext,
                },
            )
            apply_top_left_legend(fig)
            add_time_range_buttons(fig, international_periods, periods_per_year=4, active_index=trend_active_index)
            render_plotly_chart(fig)
            st.markdown('<div class="trend-note">* BIS 名义住宅价格指数，2010=100</div>', unsafe_allow_html=True)

if not demography_context.empty:
    demography_context = demography_context.copy()
    demography_context["year"] = demography_context["year"].astype(str)
    demography_context["value"] = pd.to_numeric(demography_context["value"], errors="coerce")
    demography_context = demography_context.dropna(subset=["value"])
    for text_column in ["series_type", "source", "source_note"]:
        if text_column not in demography_context.columns:
            demography_context[text_column] = ""
        demography_context[text_column] = demography_context[text_column].fillna("").astype(str)

if not demography_context.empty:
    with st.expander("国际人口动态", expanded=True):
        has_demography_series_type = "series_type" in demography_context.columns
        default_demography_countries = [
            country for country in ["中国", "美国", "日本", "韩国"] if country in set(demography_context["country"])
        ]
        selected_demography_countries = st.multiselect(
            "人口动态国家",
            sorted(demography_context["country"].unique()),
            default=default_demography_countries,
            label_visibility="collapsed",
        )
        demography_metrics = ordered_values(
            demography_context["metric"],
            ["出生人口", "自然增长人口", "人口", "死亡人口", "净迁移人口", "人口变化", "出生率", "死亡率", "自然增长率"],
        )
        default_demography_metric_index = demography_metrics.index("出生人口") if "出生人口" in demography_metrics else 0
        selected_demography_metric = st.selectbox(
            "人口动态指标",
            demography_metrics,
            index=default_demography_metric_index,
        )
        demography_metric_view = demography_context[
            (demography_context["country"].isin(selected_demography_countries))
            & (demography_context["metric"] == selected_demography_metric)
        ].copy()

        if selected_demography_countries and not demography_metric_view.empty:
            demography_unit = demography_metric_view["unit"].dropna().iloc[0]
            demography_periods = sorted(demography_metric_view["year"].dropna().astype(str).unique())
            year_tickvals, year_ticktext = period_year_ticks(demography_periods)
            line_custom_data = ["series_type", "source"] if has_demography_series_type else None
            fig = px.line(
                demography_metric_view.sort_values(["country", "year"]),
                x="year",
                y="value",
                color="country",
                markers=True,
                custom_data=line_custom_data,
                color_discrete_map=COUNTRY_COLOR_MAP,
                labels={"year": "年份", "value": f"{selected_demography_metric}（{demography_unit}）", "country": "国家"},
            )
            fig.add_hline(y=0, line_color=BASELINE_COLOR, line_width=1)
            line_series_note = "<br>口径 %{customdata[0]}<br>来源 %{customdata[1]}" if has_demography_series_type else ""
            fig.update_traces(
                hovertemplate=(
                    "国家 %{fullData.name}<br>"
                    f"年份 %{{x}}<br>{selected_demography_metric} %{{y:.1f}}{demography_unit}"
                    f"{line_series_note}<extra></extra>"
                )
            )
            demography_default_years = TREND_DEFAULT_YEARS if is_mobile_viewport else None
            trend_active_index = 2 if is_mobile_viewport else 0
            fig.update_layout(
                height=430,
                margin={"l": 55, "r": 20, "t": 86, "b": 60},
                xaxis={
                    "title": "年份",
                    "type": "category",
                    "categoryorder": "array",
                    "categoryarray": demography_periods,
                    "range": category_axis_range(demography_periods, demography_default_years),
                    "tickmode": "array",
                    "tickvals": year_tickvals,
                    "ticktext": year_ticktext,
                },
            )
            apply_top_left_legend(fig)
            add_time_range_buttons(fig, demography_periods, periods_per_year=1, active_index=trend_active_index)
            render_plotly_chart(fig)

        flow_metrics = ["出生人口", "死亡人口", "净迁移人口"]
        flow_view = demography_context[
            (demography_context["country"].isin(selected_demography_countries))
            & (demography_context["metric"].isin(flow_metrics))
        ].copy()
        if selected_demography_countries and not flow_view.empty:
            st.markdown('<div class="chart-title">出生、死亡与净迁移</div>', unsafe_allow_html=True)
            flow_view["signed_value"] = flow_view.apply(
                lambda row: -row["value"] if row["metric"] == "死亡人口" else row["value"],
                axis=1,
            )
            flow_view["display_value"] = flow_view["value"]
            flow_periods = sorted(flow_view["year"].dropna().astype(str).unique())
            year_tickvals, year_ticktext = period_year_ticks(flow_periods)
            flow_custom_data = ["display_value"]
            if has_demography_series_type:
                flow_custom_data.extend(["series_type", "source"])
            fig = px.bar(
                flow_view.sort_values(["country", "year", "metric"]),
                x="year",
                y="signed_value",
                color="metric",
                facet_row="country",
                custom_data=flow_custom_data,
                color_discrete_map={
                    "出生人口": OVERALL_UP_COLOR,
                    "死亡人口": OVERALL_DOWN_COLOR,
                    "净迁移人口": "#12b76a",
                },
                labels={"year": "年份", "signed_value": "人口（万人）", "metric": "指标"},
            )
            fig.add_hline(y=0, line_color=BASELINE_COLOR, line_width=1)
            flow_series_note = "<br>口径 %{customdata[1]}<br>来源 %{customdata[2]}" if has_demography_series_type else ""
            fig.update_traces(
                hovertemplate=f"年份 %{{x}}<br>%{{fullData.name}} %{{customdata[0]:.1f}}万人{flow_series_note}<extra></extra>",
            )
            fig.update_layout(
                barmode="relative",
                height=max(420, 170 * len(selected_demography_countries)),
                margin={"l": 55, "r": 20, "t": 86, "b": 60},
                xaxis={
                    "title": "年份",
                    "type": "category",
                    "categoryorder": "array",
                    "categoryarray": flow_periods,
                    "tickmode": "array",
                    "tickvals": year_tickvals,
                    "ticktext": year_ticktext,
                },
            )
            fig.update_yaxes(matches=None)
            fig.for_each_annotation(lambda annotation: annotation.update(text=annotation.text.split("=")[-1]))
            apply_top_left_legend(fig)
            render_plotly_chart(fig)

        demography_sources = "、".join(sorted(item for item in demography_context["source"].dropna().unique() if item))
        wpp_source_urls = demography_context.loc[
            demography_context["source"] == "UN WPP 2024", "source_url"
        ].dropna()
        demography_source_url = (
            wpp_source_urls.iloc[0] if not wpp_source_urls.empty else demography_context["source_url"].dropna().iloc[0]
        )
        series_note = ""
        if has_demography_series_type:
            official_years = pd.to_numeric(
                demography_context.loc[
                    demography_context["series_type"].astype(str).str.contains("官方", na=False),
                    "year",
                ],
                errors="coerce",
            ).dropna()
            projection_years = pd.to_numeric(
                demography_context.loc[
                    demography_context["series_type"].astype(str).str.contains("预测", na=False),
                    "year",
                ],
                errors="coerce",
            ).dropna()
            if not official_years.empty:
                series_note += (
                    f"{int(official_years.min())}-{int(official_years.max())} 年部分指标优先使用官方最新发布值。"
                )
            if not projection_years.empty:
                series_note += (
                    f"{int(projection_years.min())}-{int(projection_years.max())} 年未覆盖项保留 WPP 中位方案预测。"
                )
        st.markdown(
            f'<div class="trend-note">* 数据源：{html.escape(demography_sources)}。'
            f'<a href="{html.escape(demography_source_url, quote=True)}" target="_blank" rel="noopener noreferrer">'
            f'World Population Prospects 2024</a>。人口数量类指标单位为万人。{html.escape(series_note)}</div>',
            unsafe_allow_html=True,
        )

st.markdown(
    """
    <div id="app-bottom" class="app-footer">
        ©️ <a href="https://github.com/taifuer/house_price_index" target="_blank" rel="noopener noreferrer">taifuer</a>
        · 数据来源于 <a href="https://www.stats.gov.cn/" target="_blank" rel="noopener noreferrer">国家统计局</a>、
        <a href="https://data.bis.org/" target="_blank" rel="noopener noreferrer">BIS</a>、
        <a href="https://population.un.org/wpp/" target="_blank" rel="noopener noreferrer">UN WPP</a>
        · Made with <a href="https://streamlit.io/" target="_blank" rel="noopener noreferrer">Streamlit</a>
    </div>
    """,
    unsafe_allow_html=True,
)
