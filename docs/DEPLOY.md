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
docker compose build app
docker compose up -d --no-deps --wait app
```

## 验证

```bash
docker compose ps
curl --fail http://127.0.0.1:8501/healthz
docker compose logs --tail=50
```

健康检查应返回 `ok`，容器状态应为 `healthy`。

再检查公网页面、`data/manifest.json` 和 `runtime-config.js`，确认静态资源加载正常、百度统计配置仍生效。不要将 `.env` 或统计配置内容提交到 Git。

## 清理与回退

更新前记录 `git rev-parse HEAD` 和 `docker inspect house-price-index --format '{{.Image}}'`。新容器通过健康检查与页面验证后，可用 `docker image rm <旧镜像 ID>` 删除本项目不再使用的旧镜像；不要加 `--force`，有容器引用时应保留。

不要使用 `docker system prune`、全局 `docker builder prune` 或删除共享卷。需要清理构建缓存时，使用本项目独立的 Buildx builder，并且只移除该 builder。普通更新可以保留缓存，加速下一次构建。

若远程分支曾 amend，`git pull --ff-only` 会拒绝非快进更新。先确认服务器工作区干净、比较两端差异并保留旧提交备份，再对齐分支，不能用强制重置掩盖服务器上的本地修改。

[返回项目首页](../README.md)
