# 本地启动指南（适合前端同学）

本指南覆盖从零启动到跑通前端的全部步骤，默认你在根目录运行命令。

## 前置要求

- Node.js 18+（建议 20.x）和 npm（已随 Node 安装）
- Docker / Docker Desktop 已安装并已启动（用于 Postgres、Redis、MinIO）
- 推荐使用 macOS/Linux 终端；Windows 用户建议在 WSL2 下运行

## 第一次启动（10 分钟）

1. 安装依赖

```bash
npm install
```

2. 准备环境变量（复制示例即可跑通本地）

```bash
cp .env.example .env
# 如果你习惯将 .env 放到子包，也可以顺手复制：
# cp .env.example apps/api/.env
# cp .env.example apps/worker/.env
```

当前 API 与迁移脚本会自动加载“工作区 .env + 仓库根 .env”（后者兜底），所以将 `.env` 放在根目录即可，无需每次 `export`。
关键变量说明：

- `NEXT_PUBLIC_API_BASE=http://localhost:8787/api/v1`：前端访问 API 的基址
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`：前端自身地址
- OCR：如果使用前端调用百度 AI Studio OCR，请在前端可见环境中设置
  - `NEXT_PUBLIC_BAIDU_OCR_URL=<AI Studio OCR 接口 URL，例如 https://xxx.baidubce.com/ocr>`
  - `NEXT_PUBLIC_BAIDU_OCR_TOKEN=<AI Studio 颁发的 token>`（注意大小写，值形如 `token abc...` 中的后半段）
  - `fileType` 已默认按图片传 1，如需 PDF 可在代码中传 0
  - 若不设置则本地 OCR 按钮会提示缺少配置

3. 启动基础设施（确保 Docker Desktop 已运行）

```bash
docker-compose up -d
```

这会启动：

- Postgres（5432）、Redis（6379）
- MinIO（9000 API / 9001 控制台），账号 `minio / minio123`
  首次启动后，请在 MinIO 控制台 <http://localhost:9001> 创建名为 `reimbursement` 的桶（对应 `.env` 里的 `S3_BUCKET`）。

4. 生成并执行数据库迁移

```bash
npm --workspace apps/api run db:generate
npm --workspace apps/api run db:migrate
```

5. 启动前后端与 Worker

```bash
npm run dev
```

- Web（Next.js）默认在 `http://localhost:3000`（若 3000 被占用会提示使用 3001）
- API 在 `http://localhost:8787`
- Worker 同步启动，处理 OCR/批次检查/导出任务

6. 打开登录页并注册账号

- 访问 `http://localhost:3000/login`
- 直接用“Register”标签创建账号（邮箱或手机号 + 至少 8 位密码），随后即可登录并进入项目列表

7. 运行共享包单测（可选）

```bash
npm --workspace packages/shared run test
```

## 常用命令速查

- 单独运行前端：`npm run dev:web`
- 单独运行 API：`npm run dev:api`
- 单独运行 Worker：`npm run dev:worker`
- 关闭基础设施：`docker-compose down`（不删除数据卷）；如需清空数据，加上 `-v`

## 常见问题

- **Docker 连接失败 / 数据库拒绝连接**：确认 Docker Desktop 已启动，再执行 `docker-compose up -d`。
- **MinIO 上传报错 (NoSuchBucket)**：进入 <http://localhost:9001> 手动创建 `reimbursement` 桶后重试。
- **端口被占用**：Next 会自动提示并切换端口；API/MinIO/数据库端口固定，需手动关闭占用进程或修改 `.env` 与 `docker-compose.yml`。
- **环境变量未生效**：确保 `.env` 位于仓库根目录（API/迁移会自动加载），或在运行命令前 `export $(cat .env | xargs)`。
