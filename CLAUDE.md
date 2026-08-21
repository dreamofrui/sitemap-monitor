# Sitemap Monitor - 开发规范

## 项目概述

监控多个网站的 sitemap，检测新增 URL，追踪跨站点需求信号。

## Agent Skills

### Issue Tracker

Issues are tracked in GitHub Issues for this repository. See `docs/agents/issue-tracker.md`.

### Domain Documentation

Single-context layout: `CONTEXT.md` at repo root with ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## 开发规范

### 代码风格

- **JavaScript**: ES modules (`import/export`)，使用 JSDoc 注释
- **TypeScript**: Next.js 前端使用 TypeScript
- **命名**: 
  - 文件名使用 kebab-case (`sitemap-monitor.js`)
  - 函数名使用 camelCase (`extractGameName`)
  - 常量使用 UPPER_SNAKE_CASE (`MAX_RETRIES`)

### 项目结构约定

```
sitemap-monitor/
├── src/
│   └── services/          # 核心业务逻辑（框架无关）
├── lib/                   # GitHub Actions 入口点
├── web/                   # Next.js Dashboard
│   ├── src/
│   │   ├── pages/         # 页面路由
│   │   ├── components/    # React 组件
│   │   └── lib/           # 前端工具库
├── supabase/              # 数据库 schema 和迁移
├── tests/                 # 测试文件
└── scripts/               # 维护脚本
```

### 环境变量管理

- **本地开发**: `.dev.vars` 文件（被 Git 忽略）
- **GitHub Actions**: Repository Secrets
- **Vercel**: Environment Variables（Production only）
- **规则**: 
  - 永远不使用 `NEXT_PUBLIC_*` 前缀（服务端专用）
  - Service Key 仅在服务端使用，不暴露给浏览器

### 数据库约定

- **表名**: 小写下划线分隔 (`sitemap_sources`, `discovered_urls`)
- **主键**: `id BIGSERIAL PRIMARY KEY`
- **时间戳**: 使用 `TIMESTAMPTZ` 类型，字段名 `*_at` (`created_at`, `first_seen_at`)
- **布尔字段**: 明确默认值 (`active BOOLEAN NOT NULL DEFAULT TRUE`)
- **索引**: 为查询频繁的字段创建索引
- **RLS**: 所有表启用 Row Level Security，service_role 拥有完全权限

### 核心业务逻辑

#### 1. Sitemap 扫描机制

- **Baseline 建立**: 首次扫描只记录 URL，不产生发现
- **增量检测**: 后续扫描对比快照，只处理新增 URL
- **异常保护**: 
  - 零 URL 拒绝处理
  - URL 数量骤减（<50%）拒绝覆盖快照
  - 保留错误信息到 `scan_runs` 表

#### 2. URL 提取与规范化

```javascript
// 规范化：移除协议、www、查询参数、锚点
function normalizeUrl(url) {
  return url
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');
}
```

#### 3. 跨站点信号检测

- **短语提取**: 从 URL 路径提取最后一段作为需求短语
- **信号聚合**: 当同一短语出现在 2+ 个不同站点时，标记为优先信号
- **自动更新**: 通过数据库触发器 `update_term_signal()` 实时计算

### 测试规范

- **测试文件**: `tests/*.test.js`（根目录）和 `web/tests/*.test.ts`（前端）
- **运行测试**: `npm test`（运行所有测试）
- **类型检查**: `npm run typecheck`
- **构建验证**: `npm run build`

### Git 工作流

- **主分支**: `main`
- **提交信息**: 使用 Conventional Commits 格式
  - `feat:` 新功能
  - `fix:` 错误修复
  - `docs:` 文档更新
  - `refactor:` 代码重构
- **Pull Request**: 所有更改通过 PR 合并

### 部署流程

1. **开发**: 本地测试 → 类型检查 → 构建验证
2. **提交**: 提交到 GitHub → 自动运行 CI
3. **部署**: 
   - Web Dashboard: Vercel 自动部署
   - Scanner: GitHub Actions 定时运行
4. **验证**: 运行 `npm run verify:deployment` 检查生产环境

### 维护工具

- **部署验证**: `scripts/verify-deployment.js`
- **Schema 刷新**: 在 Supabase SQL Editor 执行 `NOTIFY pgrst, 'reload schema';`
- **日志清理**: 使用数据库函数 `clean_old_logs(days_to_keep INTEGER)`

### 故障排查清单

1. **GitHub Actions 失败**: 检查 Secrets 配置
2. **Vercel 部署失败**: 检查环境变量和构建日志
3. **数据库连接失败**: 验证 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY`
4. **PostgREST 缓存问题**: 执行 `NOTIFY pgrst, 'reload schema';`
5. **Dashboard 无法登录**: 检查 `DASHBOARD_PASSWORD` 和 `DASHBOARD_SESSION_SECRET`

### 安全规范

- ⚠️ **永远不要**提交包含真实凭证的文件
- ⚠️ **永远不要**在日志中打印 Service Key
- ⚠️ **永远不要**在客户端代码中使用 Service Key
- ✅ **始终**使用环境变量存储敏感信息
- ✅ **始终**启用 Supabase RLS 策略
- ✅ **始终**在 Dashboard 使用密码保护
