from __future__ import annotations

import html
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st


DATA_PATH = Path("data/house_price_index_all.csv.gz")
if not DATA_PATH.exists():
    DATA_PATH = Path("data/house_price_index_all.csv")
if not DATA_PATH.exists():
    DATA_PATH = Path("data/house_price_index.csv")
FAVICON_PATH = Path("assets/favicon.ico")

st.set_page_config(
    page_title="70 城商品住宅价格指数",
    page_icon=FAVICON_PATH if FAVICON_PATH.exists() else "🏠",
    layout="wide",
    initial_sidebar_state="expanded",
)

SIZE_BAND_ORDER = ["全部", "90m2及以下", "90-144m2", "144m2以上"]
METRIC_ORDER = ["环比", "同比", "累计平均"]
RANK_TIER_OPTIONS = ["全部", "一线", "二线", "三线"]
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
def load_data(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["period"] = df["period"].astype(str)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["change_pct"] = pd.to_numeric(df["change_pct"], errors="coerce")
    df["city_tier"] = df["city"].map(TIER_MAP).fillna("未分层")
    return df.dropna(subset=["value"])


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


def css_content(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


if not DATA_PATH.exists():
    st.error("未找到数据文件，请先运行 scripts/fetch_stats.py 抓取数据。")
    st.stop()

data = load_data(DATA_PATH)

periods = sorted(data["period"].unique(), reverse=True)
house_types = ordered_values(data["house_type"], ["新建商品住宅", "二手住宅"])

with st.sidebar:
    st.header("筛选")
    period = st.selectbox("月份", periods)
    default_house_type_index = house_types.index("二手住宅") if "二手住宅" in house_types else 0
    house_type = st.selectbox("住宅类型", house_types, index=default_house_type_index)

    scoped = data[(data["period"] == period) & (data["house_type"] == house_type)]
    size_bands = ordered_values(scoped["size_band"], SIZE_BAND_ORDER)
    size_band = st.selectbox("面积段", size_bands)

    scoped = scoped[scoped["size_band"] == size_band]
    metrics = ordered_values(scoped["metric"], METRIC_ORDER)
    metric = st.selectbox("指标", metrics)

filtered = data[
    (data["period"] == period)
    & (data["house_type"] == house_type)
    & (data["size_band"] == size_band)
    & (data["metric"] == metric)
].copy()

if filtered.empty:
    st.warning("当前筛选条件没有数据。")
    st.stop()

header_title = "70 城商品住宅价格指数"
source = filtered["source_url"].dropna().iloc[0]
view_title = f"{format_period_label(period)} · {house_type} · {size_band} · {metric}"
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
        color: #111827;
        content: "{css_content(header_title)}";
        font-size: 1.5rem;
        font-weight: 700;
        left: 4rem;
        line-height: 1.1;
        max-width: calc(100vw - 8rem);
        overflow: hidden;
        pointer-events: none;
        position: absolute;
        text-overflow: ellipsis;
        top: 50%;
        transform: translateY(-50%);
        white-space: nowrap;
    }}

    .block-container {{
        padding-top: 4.75rem;
        padding-bottom: 1.75rem;
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

    .trend-note {{
        color: #667085;
        font-size: 0.86rem;
        margin: -0.4rem 0 1.5rem;
    }}

    .app-footer {{
        border-top: 1px solid #e5e7eb;
        color: #667085;
        font-size: 0.85rem;
        margin-top: 1.75rem;
        padding: 1.55rem 0 1.15rem;
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
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    f"""
    <h4 class="view-title">
        <span>{html.escape(view_title)}</span>
        <a class="source-link" href="{html.escape(source, quote=True)}" target="_blank" rel="noopener noreferrer" title="查看国家统计局原文" aria-label="查看国家统计局原文">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 3h6v6"></path>
                <path d="M10 14 21 3"></path>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            </svg>
        </a>
    </h4>
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
        "RdBu_r",
        ((view["change_pct"] + rank_color_limit) / (2 * rank_color_limit)).clip(0, 1).tolist(),
    )


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
            "title.text": f"<b>城市排名（{selected_tier}）</b>",
            "xaxis.tickvals": view["display_rank"].tolist(),
            "xaxis.ticktext": view["city"].tolist(),
            "xaxis.range": [view["display_rank"].min() - 0.5, view["display_rank"].max() + 0.5],
        },
    ]


rank_view = build_rank_view("全部")

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
fig.add_hline(y=0, line_color="#666", line_width=1)
fig.update_layout(
    title="<b>城市排名（全部）</b>",
    height=580,
    xaxis={
        "title": "城市",
        "tickmode": "array",
        "tickvals": rank_view["display_rank"],
        "ticktext": rank_view["city"],
        "range": [rank_view["display_rank"].min() - 0.5, rank_view["display_rank"].max() + 0.5],
        "showgrid": False,
    },
    yaxis={"zeroline": True},
    margin={"l": 55, "r": 25, "t": 95, "b": 125},
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
st.plotly_chart(fig, width="stretch")

extreme_col, dist_col, tier_col = st.columns([1, 1, 1])

with extreme_col:
    extremes = pd.concat([filtered.head(5), filtered.tail(5)]).drop_duplicates(subset=["city"])
    fig = px.bar(
        extremes.sort_values("change_pct"),
        x="change_pct",
        y="city",
        color="change_pct",
        color_continuous_scale="RdBu_r",
        orientation="h",
        text=extremes.sort_values("change_pct")["change_pct"].map(format_pct),
        title="首尾城市对比",
        labels={"change_pct": "较基期变动", "city": "城市"},
    )
    fig.add_vline(x=0, line_color="#666", line_width=1)
    fig.update_traces(textposition="outside", cliponaxis=False)
    fig.update_layout(height=390, margin={"l": 70, "r": 20, "t": 70, "b": 45}, coloraxis_showscale=False)
    st.plotly_chart(fig, width="stretch")

with dist_col:
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
            "colorscale": "RdBu",
            "reversescale": True,
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
        fig.add_vline(x=zero_tick, line_color="#666", line_width=1)
    else:
        left_of_zero = int((dist["bin_right"] < 0).sum())
        if 0 < left_of_zero < len(dist):
            zero_tick = left_of_zero - 0.5
            fig.add_vline(x=zero_tick, line_color="#666", line_width=1)
    if zero_tick is not None and all(abs(zero_tick - value) > 0.4 for value in tick_values):
        tick_values.insert(1, zero_tick)
        tick_labels.insert(1, "0")

    fig.update_layout(
        title="城市涨跌分布",
        height=380,
        margin={"l": 55, "r": 20, "t": 70, "b": 50},
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
    st.plotly_chart(fig, width="stretch")

with tier_col:
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
    tier_colors = {"一线": "#2f6f9f", "二线": "#7a6bca", "三线": "#9f7a2f", "未分层": "#667085"}

    fig = go.Figure()
    for row in tier_summary.itertuples(index=False):
        color = tier_colors.get(row.city_tier, "#667085")
        fig.add_scatter(
            x=[row.min_change, row.max_change],
            y=[row.tier_y, row.tier_y],
            mode="lines",
            line={"color": color, "width": 16},
            opacity=0.28,
            hoverinfo="skip",
            showlegend=False,
        )
        fig.add_scatter(
            x=[row.min_change, row.max_change],
            y=[row.tier_y, row.tier_y],
            mode="markers",
            marker={"color": color, "size": 9, "line": {"color": "#ffffff", "width": 1}},
            customdata=[[row.city_tier, "最低"], [row.city_tier, "最高"]],
            hovertemplate="%{customdata[0]} %{customdata[1]} %{x:+.1f}<extra></extra>",
            showlegend=False,
        )
        fig.add_scatter(
            x=[row.avg_change],
            y=[row.tier_y],
            mode="markers+text",
            marker={"symbol": "diamond", "color": "#111827", "size": 13, "line": {"color": "#ffffff", "width": 2}},
            text=[format_pct(row.avg_change)],
            textposition="top center",
            customdata=[[row.min_change, row.max_change, row.cities, row.up, row.flat, row.down]],
            hovertemplate=(
                "均值 %{x:+.1f}<br>"
                "范围 %{customdata[0]:+.1f} 至 %{customdata[1]:+.1f}<br>"
                "城市 %{customdata[2]}｜↑%{customdata[3]}｜-%{customdata[4]}｜↓%{customdata[5]}"
                "<extra></extra>"
            ),
            showlegend=False,
        )
        fig.add_annotation(
            x=row.avg_change,
            y=row.tier_y - 0.28,
            text=f"{row.cities}城 ↑{row.up} -{row.flat} ↓{row.down}",
            showarrow=False,
            xanchor="center",
            yanchor="top",
            font={"size": 11, "color": "#475467"},
        )

    tier_axis_limit = max(abs(tier_summary["min_change"].min()), abs(tier_summary["max_change"].max()), 0.1)
    fig.add_vline(x=0, line_color="#666", line_width=1)
    fig.update_layout(
        title="城市层级对比",
        height=420,
        margin={"l": 65, "r": 25, "t": 70, "b": 50},
        xaxis={"title": "较基期变动", "range": [-tier_axis_limit * 1.15, tier_axis_limit * 1.15]},
        yaxis={
            "title": "",
            "tickmode": "array",
            "tickvals": [tier_y_map[tier] for tier in visible_tier_order],
            "ticktext": visible_tier_order,
            "range": [-0.55, len(visible_tier_order) - 0.35],
        },
        showlegend=False,
    )
    st.plotly_chart(fig, width="stretch")

st.markdown("#### 价格趋势")
overall_trend = data[
    (data["house_type"] == house_type)
    & (data["size_band"] == size_band)
    & (data["metric"] == metric)
].copy()

if not overall_trend.empty:
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
    has_missing_overall_data = bool((monthly["covered_display"] < expected_city_count).any())
    overall_customdata = monthly[
        ["up_display", "flat_display", "down_display", "covered_display", "data_status"]
    ].values.tolist()
    year_tickvals, year_ticktext = period_year_ticks(monthly["period"])

    fig = go.Figure()
    fig.add_bar(
        x=monthly["period"],
        y=monthly["up_display"],
        name="上涨",
        marker_color="#d92d20",
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
        marker_color="#98a2b3",
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
        marker_color="#2563eb",
        customdata=overall_customdata,
        hovertemplate=(
            "月份 %{x}<br>上涨 %{customdata[0]}<br>持平 %{customdata[1]}<br>"
            "下跌 %{customdata[2]}<br>覆盖城市 %{customdata[3]}/70<br>%{customdata[4]}<extra></extra>"
        ),
    )
    fig.add_hline(y=0, line_color="#667085", line_width=1)
    fig.update_layout(
        barmode="relative",
        height=460,
        legend={"orientation": "h", "y": 1.08, "x": 0},
        margin={"l": 55, "r": 20, "t": 70, "b": 72},
        title="整体趋势",
        xaxis={"title": "年份", "tickmode": "array", "tickvals": year_tickvals, "ticktext": year_ticktext},
        yaxis={
            "title": "城市数",
            "tickmode": "array",
            "tickvals": [-70, -35, 0, 35, 70],
            "ticktext": ["70", "35", "0", "35", "70"],
            "range": [-70, 70],
        },
    )
    st.plotly_chart(fig, width="stretch")
    if has_missing_overall_data:
        st.markdown('<div class="trend-note">* 部分月份数据缺失</div>', unsafe_allow_html=True)

cities = sorted(data["city"].unique())
default_cities = [city for city in ["北京", "上海", "广州", "深圳"] if city in cities]
selected_cities = st.multiselect("城市", cities, default=default_cities)

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
    has_missing_trend_data = bool(trend_complete["change_pct"].isna().any())
    year_tickvals, year_ticktext = period_year_ticks(trend_periods)

    fig = px.line(
        trend.sort_values(["city", "period"]),
        x="period",
        y="change_pct",
        color="city",
        markers=True,
        title="城市趋势",
        labels={"period": "年份", "change_pct": "较基期变动", "city": "城市"},
    )
    fig.add_hline(y=0, line_color="#666", line_width=1)
    fig.update_layout(
        height=440,
        margin={"l": 55, "r": 20, "t": 70, "b": 72},
        xaxis={
            "title": "年份",
            "type": "category",
            "categoryorder": "array",
            "categoryarray": trend_periods,
            "tickmode": "array",
            "tickvals": year_tickvals,
            "ticktext": year_ticktext,
        },
    )
    st.plotly_chart(fig, width="stretch")
    if has_missing_trend_data:
        st.markdown('<div class="trend-note">* 部分数据缺失</div>', unsafe_allow_html=True)

st.markdown(
    """
    <div class="app-footer">
        ©️ <a href="https://github.com/taifuer" target="_blank" rel="noopener noreferrer">taifuer</a>
        · 数据来源于 <a href="https://www.stats.gov.cn/" target="_blank" rel="noopener noreferrer">国家统计局</a>
        · Made with <a href="https://streamlit.io/" target="_blank" rel="noopener noreferrer">Streamlit</a>
    </div>
    """,
    unsafe_allow_html=True,
)
