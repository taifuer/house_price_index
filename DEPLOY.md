# Docker 部署指南

生产环境只部署 `dev` 分支。Dockerfile、Compose 配置、静态前端和数据分片均由 Git 管理；服务器差异仅保存在未提交的 `.env` 中。生产容器使用 Nginx 提供静态文件，不运行 Python 或 Streamlit。

## 首次部署

```bash
git clone --branch dev git@github.com:taifuer/house_price_index.git
cd house_price_index
cp .env.example .env
docker compose up -d --build
```

如需启用百度统计，在 `.env` 中填写 32 位站点 ID：

```dotenv
BAIDU_ANALYTICS_ID=your_32_character_site_id
```

应用只绑定到 `127.0.0.1:8501`，应由 Nginx 等反向代理提供公网访问。

百度统计 ID 会在容器启动时写入 `runtime-config.js`，不会写入 Git 或前端构建产物。

## 更新部署

```bash
git switch dev
git pull --ff-only origin dev
docker compose up -d --build --remove-orphans
```

## 验证

```bash
docker compose ps
curl --fail http://127.0.0.1:8501/healthz
docker compose logs --tail=50
```

健康检查应返回 `ok`，容器状态应为 `healthy`。
