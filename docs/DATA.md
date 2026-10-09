# 数据口径与更新

## 来源与覆盖

数据来自国家统计局“70 个大中城市商品住宅销售价格变动情况”。页面保留当月原文入口，长表的每条记录保留来源 URL 和标题。以官方发布为准。

- `data/house_price_index_all.csv.gz`：版本管理中的原始长表。
- `web/public/data/manifest.json`：当前数据范围、记录数、城市层级、数据集维度及覆盖情况。
- `web/public/data/shards/`：按住宅类型、面积段和指标拆分的 24 个矩阵分片。

早期月份存在缺表、失效链接和未收录月份。现代完整月份应有 1,680 条记录；1 月通常不发布累计平均列，对应 1,120 条。不能把历史月份都按现代记录数判定为抓取失败。

## 指标与缺失值

| 指标 | 基准 | 页面显示 |
| --- | --- | --- |
| 环比 | 上月 = 100 | 官方指数减 100，单位 % |
| 同比 | 上年同月 = 100 | 官方指数减 100，单位 % |
| 累计平均同比 | 上年同期 = 100 | 当年累计平均价格与上年同期的比较 |

这些指标不是成交均价、每平方米房价或总价。各城市的简单均值、中位数和涨跌数量是描述性统计，不是按交易量加权的全国房价指数。市场广度 =（上涨城市数 − 下跌城市数）/ 覆盖城市数 × 100%。

普通图表和历史明细不把缺失数据计作持平；表格以 `—` 表示无数据，加载失败单独显示。走势折线可以连接相邻真实观测，但缺失月份不生成观测值；覆盖不足会在图下标注。

### 区间指数

将所选起始月份设为 100，从下一个月起按环比指数逐月连乘：

```text
I(start) = 100
I(t) = I(t-1) × 官方环比指数(t) / 100
```

只使用环比，不将同比连乘。起点月份的环比不参与计算。缺失月份默认以不变估算，并在图表虚线、星号和缺失时间段说明中标出；导出图片也保留这些说明。该序列受公开数据精度和缺失填补影响，不是官方定基指数，也不表示某套房屋的实际收益。

城市看板默认近 5 年，主城市与最多 4 个对比城市共用起止月份和住宅类型。走势指标只改变走势对比，不改变区间指数的环比计算口径；历史明细始终同时列出主城市的三个指标。点选图中月份或表格月份会同步当月表现与图中标线，不修改指数起点。

### 图片下载

PNG 在客户端使用已加载的数据生成，不调用服务端图片接口。导出包含当前筛选、标题、时间范围、图例和来源；长图导出当前筛选范围的完整内容，不改变页面的缩放状态。为控制客户端内存，输出最长边限制为 4,096 像素、总像素不超过 400 万，完成后释放临时画布和下载 URL。

移动端入口位于图表标题右侧，桌面端位于图表工具区。实际保存方式由浏览器决定；微信等内置浏览器可能限制下载，可在系统浏览器打开后重试。

## 手动更新

在仓库根目录准备 Python 3.11+ 环境：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

日常增量更新只抓取已有最大月份之后、在统计局搜索 API 中发现的新月份，不猜测详情页 URL：

```bash
python3 scripts/fetch_stats.py --incremental \
  --existing data/house_price_index_all.csv.gz \
  --out data/house_price_index_all.csv.gz
python3 scripts/build_web_data.py
```

生成脚本验证原始长表与静态分片记录总数一致。提交时同时包含压缩长表和 `web/public/data/`，不要仅修改页面最新月份。暂未取得的数据记录在本地 `data/house_price_index_missing.json`，不提交到仓库。

全量发现历史：

```bash
python3 scripts/fetch_stats.py --all-history --out data/house_price_index_all.csv
gzip -n -9 -f data/house_price_index_all.csv
python3 scripts/build_web_data.py
```

单页调试使用 `--url '<国家统计局详情页 URL>' --out data/debug_page.csv`；搜索调试可为 `--all-history` 增加 `--max-search-pages 1`。仅在解析回归或补全历史时使用，避免高频全量抓取。

## 自动检测

[Monthly data update](../.github/workflows/data-update.yml) 每月 8–21 日北京时间 17:37 检测上月数据，也可在 Actions 手动指定目标月份。

1. 先校验已提交数据；目标月已完整入库时，不请求统计局。
2. 已有同月更新 PR 时，不重复抓取和创建 PR。
3. 发现完整数据后校验维度、数量、来源与值域，生成分片、运行测试并创建 PR。
4. 每月 21 日最终检测仍不完整时，创建告警 Issue。

计划任务本身仍会运行；“本月停止检测”指上述早退出，不是自动关闭 workflow。GitHub 定时任务只在仓库默认分支触发，维护时需确认默认分支为 `dev`。自动流程不直接部署线上。

## 长表字段

```text
period,table_no,table_name,house_type,size_band,city,metric,base,value,change_pct,source_url,title
```

| 字段 | 含义 |
| --- | --- |
| `period` | 数据月份，`YYYY-MM` |
| `table_no` / `table_name` | 原文表号与表名 |
| `house_type` | 新建商品住宅、二手住宅 |
| `size_band` | 全部、90m2及以下、90-144m2、144m2以上 |
| `city` | 城市名 |
| `metric` / `base` | 指标及基准 |
| `value` / `change_pct` | 原始指数与指数减 100 |
| `source_url` / `title` | 原文 URL 与标题 |

[返回项目首页](../README.md)
