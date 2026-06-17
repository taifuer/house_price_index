# 全国 70 城商品住宅价格指数

一个基于国家统计局“70 个大中城市商品住宅销售价格变动情况”的数据获取与交互式看板项目。项目将月度房价指数整理为长表 CSV，并用 Streamlit 展示城市排名、涨跌分布、城市层级对比、长期趋势和补充国际指标。

看板默认展示最新月份的二手住宅环比数据，支持切换月份、住宅类型、面积段和指标。除 70 城房价指数外，项目还提供 BIS 国际住宅价格指数和 UN WPP/官方最新人口动态数据，便于从国际住房价格和人口变化两个背景维度辅助观察。

数据解析优先读取国家统计局详情页 HTML 文本；历史页面结构不一致时，会按搜索 API 候选 URL 重试并保留最佳解析结果。增量更新模式只抓取已发布的新月份，避免猜测或反复请求不存在的详情页。

## 效果演示

概览与趋势看板：

![](./demo/overview.png)

侧边栏筛选与数据说明：

![](./demo/sidebar.png)

## 项目结构

```text
.
├── app.py                                  # Streamlit 可视化应用
├── .streamlit/config.toml                  # Streamlit 本地展示配置
├── assets/favicon.ico                      # 房屋 favicon
├── scripts/fetch_stats.py                  # 数据获取、解析、导出 CLI
├── scripts/fetch_context_data.py           # BIS 国际住宅价格指数获取 CLI
├── scripts/fetch_demography_data.py         # UN WPP 国际人口动态数据获取 CLI
├── data/
│   └── house_price_index_all.csv.gz        # 全历史长表数据（gzip 压缩 CSV）
├── requirements.txt
└── AGENTS.md
```

## 环境准备

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 数据获取

获取全部历史月份：

```bash
python3 scripts/fetch_stats.py \
  --all-history \
  --out data/house_price_index_all.csv
gzip -n -9 -f data/house_price_index_all.csv
```

日常更新建议使用增量模式。脚本会读取现有数据，只抓取当前最大月份之后、已经出现在国家统计局搜索 API 中的新月份；暂未发布的月份会记录到 `data/house_price_index_missing.json`，不会尝试猜测或反复抓取不存在的详情页：

```bash
python3 scripts/fetch_stats.py \
  --incremental \
  --existing data/house_price_index_all.csv.gz \
  --out data/house_price_index_all.csv.gz
```

获取单个详情页：

```bash
python3 scripts/fetch_stats.py \
  --url "https://www.stats.gov.cn/sj/zxfb/202605/t20260518_1963715.html" \
  --out data/house_price_index.csv
```

限制搜索页数用于调试：

```bash
python3 scripts/fetch_stats.py \
  --all-history \
  --max-search-pages 1 \
  --out data/house_price_index_sample_history.csv
```

获取国际住宅价格指数：

```bash
python3 scripts/fetch_context_data.py
```

该命令会生成 `data/context_bis_prices.csv.gz`，数据来源为 BIS 公开批量数据。

获取国际人口动态数据：

```bash
python3 scripts/fetch_demography_data.py
```

该命令默认下载 UN World Population Prospects 2024 的公开 compact Excel，生成 `data/context_demography_countries.csv.gz` 和 `data/context_demography_sources.json`。默认覆盖中国、美国、日本、韩国、英国、德国的 `1990-2025` 年数据，其中 `1990-2023` 来自 Estimates 历史估计，`2024-2025` 先使用公开官方最新发布值覆盖，未覆盖的国家、年份或指标继续使用 Medium variant 中位方案预测。当前官方覆盖包括国家统计局中国 `2024-2025` 年度人口数据和 Destatis 德国 `2024` 年出生死亡长期序列。指标包括人口、出生人口、死亡人口、自然增长人口、净迁移人口、人口变化、出生率、死亡率和自然增长率。

## 启动可视化

```bash
streamlit run app.py
```

应用会优先读取压缩后的全历史数据：

```bash
data/house_price_index_all.csv.gz
```

如果只存在未压缩 CSV，也可以继续运行；应用会自动回退读取 `data/house_price_index_all.csv` 或 `data/house_price_index.csv`。

如果端口被占用，可以换端口：

```bash
streamlit run app.py --server.port 8502 --server.address 0.0.0.0
```

## 可视化功能

首页默认展示最新月份的 `二手住宅` 环比数据。筛选项包括月份、住宅类型、面积段和指标；当前筛选标题右侧的外链图标可打开国家统计局原文。

主要视图包括：

- 城市排名：按变动幅度排序，并可在图内切换全部、一线、二线、三线城市。
- 首尾城市对比、城市涨跌分布、城市层级对比：展示极值、分布和一二三线城市的范围、均值、数量。
- 价格趋势：同时展示整体趋势和城市趋势。整体趋势用发散堆叠柱显示每月上涨、持平、下跌城市数，并在左上角标注颜色图例；城市趋势展示选中城市的长期折线。
- 补充指标：展示 BIS 国际住宅价格指数；对应数据文件不存在或为空时自动隐藏。
- 国际人口动态：如果存在 `data/context_demography_countries.csv.gz`，展示主要国家人口、出生、死亡、自然增长、净迁移等长期变化。

历史数据存在部分月份或表格缺失。趋势图会保留完整年份刻度；城市趋势会保留完整月份序列，缺失月份不显示数据点，但前后真实观测点保持连接。图下方出现 `* 部分数据缺失` 或 `* 部分月份数据缺失` 时，应结合 tooltip 中的覆盖城市数解读。

## 当前数据说明

当前已生成的全历史文件包含：

- `167,224` 条长表记录
- `159` 个有数据月份
- 时间范围：`2011-02` 至 `2026-05`

注意：早期历史页面和现代页面的表格结构不同。2011-2018 年部分月份只发布表 1/2，或国家统计局迁移索引中存在失效链接，因此不是所有月份都有现代格式的表 1-4 完整记录。可按 `period`、`table_no` 和 `source_url` 聚合 `data/house_price_index_all.csv.gz` 查看每个月的记录数、表号覆盖和来源 URL。

## 输出字段

CSV 使用长表结构：

```text
period,table_no,table_name,house_type,size_band,city,metric,base,value,change_pct,source_url,title
```

- `period`: 数据月份，例如 `2026-04`
- `table_no`: 国家统计局原文表号
- `house_type`: `新建商品住宅` 或 `二手住宅`
- `size_band`: `全部`、`90m2及以下`、`90-144m2`、`144m2以上`
- `metric`: `环比`、`同比`、`累计平均`
- `value`: 国家统计局发布的指数值
- `change_pct`: `value - 100`
- `source_url`: 原始详情页 URL

## 开发检查

```bash
python3 -m py_compile scripts/fetch_stats.py scripts/fetch_context_data.py scripts/fetch_demography_data.py app.py
```

修改解析逻辑后，建议至少验证一个现代详情页和一个旧迁移页。
