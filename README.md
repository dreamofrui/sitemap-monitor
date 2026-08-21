# Sitemap Monitor

监控多个网站的 sitemap，检测新增 URL，追踪跨站点需求信号。提供 Web Dashboard 进行可视化管理。

## 🌟 特性

- ✅ **无服务器架构**: GitHub Actions + Supabase + Vercel
- ✅ **定时扫描**: 每 4 小时自动检查 sitemap 变化
- ✅ **增量检测**: 只处理新增 URL，避免重复计算
- ✅ **跨站点信号**: 自动识别多个站点共同关注的需求
- ✅ **异常保护**: 防止空 sitemap 或异常数据污染数据库
- ✅ **可视化 Dashboard**: 受密码保护的 Web 界面
- ✅ **实时统计**: 监控源健康状态和发现趋势

## 🏗️ 架构

```
┌─────────────────────┐     ┌─────────────────┐
│  GitHub Actions     │────▶│  Supabase       │
│  (定时扫描 sitemap) │     │  (数据存储)      │
└─────────────────────┘     └────────┬────────┘
                                     │
┌─────────────────────┐              │
│  Vercel Dashboard   │◀─────────────┘
│  (Next.js)          │
│  - 源管理           │
│  - URL 发现列表     │
│  - 跨站点信号       │
│  - 扫描记录         │
└─────────────────────┘
```

### 组件说明

- **GitHub Actions**: 每 4 小时定时执行 sitemap 扫描，无服务器成本
- **Supabase**: PostgreSQL 数据库，存储快照、发现、信号
- **Vercel Dashboard**: Next.js 应用，提供密码保护的管理界面
  - 源健康监控
  - URL 发现浏览
  - 跨站点信号排名
  - 扫描历史记录

## 📁 目录结构

```
sitemap-monitor/
├── src/
│   └── services/
│       ├── sitemap-monitor.js              # 核心扫描逻辑
│       └── supabase-monitor-repository.js  # 数据持久化
├── lib/
│   ├── check-sitemaps.js                   # GitHub Actions 入口
│   └── load-env.js                         # 环境变量加载
├── web/                                    # Next.js Dashboard
│   ├── src/
│   │   ├── pages/                          # 页面路由
│   │   │   ├── index.tsx                   # 首页（源列表）
│   │   │   ├── discoveries.tsx             # URL 发现
│   │   │   ├── signals.tsx                 # 跨站点信号
│   │   │   ├── login.tsx                   # 登录页
│   │   │   └── api/                        # 服务端 API
│   │   ├── components/                     # React 组件
│   │   └── lib/                            # 前端工具
│   └── package.json
├── supabase/
│   └── schema.sql                          # 数据库 Schema
├── tests/                                  # 测试文件
├── scripts/
│   └── verify-deployment.js                # 部署验证脚本
├── .github/workflows/
│   └── check-sitemaps.yml                  # GitHub Actions 配置
├── vercel.json                             # Vercel 配置
├── package.json                            # 依赖管理
├── CLAUDE.md                               # 开发规范
└── README.md                               # 本文件
```

## 🚀 快速开始

### 前置条件

- Node.js >= 20.x
- npm 已安装
- Supabase 账号（免费版）
- Vercel 账号（免费版）
- GitHub 账号

### 1. 克隆仓库

```bash
git clone <your-repo-url>
cd sitemap-monitor
```

### 2. 安装依赖

```bash
# 安装根目录依赖（扫描器）
npm install

# 安装 web 依赖（Dashboard）
cd web
npm install
cd ..
```

### 3. 配置 Supabase

#### 3.1 创建项目

1. 访问 https://supabase.com/dashboard
2. 点击 **New Project**
3. 填写项目信息并等待创建完成

#### 3.2 执行数据库 Schema

1. 进入 Supabase Dashboard → **SQL Editor**
2. 点击 **New Query**
3. 复制 `supabase/schema.sql` 的全部内容并粘贴
4. 点击 **Run** 执行

#### 3.3 获取 API 密钥

1. 进入 **Settings** → **API**
2. 记录以下值：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **service_role key**: `eyJhbGc...`（长字符串）

⚠️ **重要**: `service_role` 密钥拥有完全权限，不要泄露！

### 4. 配置环境变量

#### 4.1 本地开发

创建 `.dev.vars` 文件（已在 `.gitignore` 中）：

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填入真实值：

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DASHBOARD_PASSWORD=your-strong-password
DASHBOARD_SESSION_SECRET=your-random-32-char-secret
```

生成随机 Session Secret：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 4.2 GitHub Actions

在 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** 添加：

| Secret Name | 值 |
|------------|-----|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJhbGc...` |

#### 4.3 Vercel

稍后在部署时配置（见下方部署步骤）

### 5. 本地测试

#### 5.1 测试扫描器

```bash
npm run check
```

**预期输出**：
```
✅ 环境变量已加载
🔍 开始扫描 sitemap...
✅ 扫描完成
```

#### 5.2 测试 Dashboard

```bash
cd web
npm run dev
```

访问 http://localhost:3000

**预期效果**：
- 登录页显示正常
- 输入 `DASHBOARD_PASSWORD` 后进入 Dashboard
- 各页面正常显示

### 6. 部署到生产环境

#### 6.1 部署 Dashboard 到 Vercel

**方式 1: Vercel CLI（推荐）**

```bash
# 安装 Vercel CLI
npm install -g vercel

# 登录
vercel login

# 部署
vercel deploy --prod
```

**方式 2: 网页导入**

1. 访问 https://vercel.com/new
2. 导入你的 GitHub 仓库
3. Vercel 会自动检测 Next.js 项目
4. 点击 **Deploy**

#### 6.2 配置 Vercel 环境变量

在 Vercel Dashboard → 你的项目 → **Settings** → **Environment Variables** 添加：

| 变量名 | 值 | 环境 |
|-------|-----|------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Production, Preview, Development |
| `SUPABASE_SERVICE_KEY` | `eyJhbGc...` | Production, Preview, Development |
| `DASHBOARD_PASSWORD` | 你的密码 | Production, Preview, Development |
| `DASHBOARD_SESSION_SECRET` | 随机字符串（32+ 字符） | Production, Preview, Development |

⚠️ **重要**: 不要配置 `NEXT_PUBLIC_*` 变量，所有凭证仅在服务端使用。

添加后，重新部署：

```bash
vercel deploy --prod
```

#### 6.3 启用 GitHub Actions

GitHub Actions 已自动配置，确认 Secrets 已添加后：

1. 访问 GitHub → **Actions** → **Check Sitemaps**
2. 点击 **Run workflow** 手动触发第一次扫描
3. 之后每 4 小时自动运行

### 7. 添加第一个 Sitemap 源

访问你的 Vercel 域名（如 `https://your-project.vercel.app`）：

1. 输入 `DASHBOARD_PASSWORD` 登录
2. 在首页点击 **Add Source**
3. 输入 sitemap URL（如 `https://poki.com/sitemap.xml`）
4. 点击 **Add**
5. 点击 **Scan** 按钮建立 baseline

## 🎮 使用指南

### Dashboard 页面

#### 📊 Sources（首页）

- 查看所有配置的 sitemap 源
- 显示源健康状态（成功/失败/从未扫描）
- 手动触发扫描
- 添加/删除源

#### 🔍 Discoveries

- 浏览所有发现的 URL
- 按站点、时间筛选
- 查看每个 URL 的提取短语
- 查看首次/最后发现时间

#### 🎯 Signals

- 查看跨站点需求信号
- 优先信号：出现在 2+ 个站点
- 显示每个信号的：
  - 出现次数
  - 涉及站点数量
  - 站点列表
  - 时间范围

#### 📝 Runs

- 查看扫描历史记录
- 显示每次扫描的：
  - 状态（成功/失败/运行中）
  - 新发现 URL 数量
  - 耗时
  - 错误信息（如有）

## 🔧 开发

### 运行测试

```bash
# 运行所有测试
npm test

# 类型检查
npm run typecheck

# 构建验证
npm run build
```

### 本地开发 Dashboard

```bash
cd web
npm run dev
```

访问 http://localhost:3000

### 验证部署

```bash
# 验证生产环境端点
npm run verify:deployment

# 验证并运行源扫描（需设置 VERIFY_SOURCE_ID）
VERIFY_SOURCE_ID=1 npm run verify:deployment
```

## 🗄️ 数据库表结构

### 核心表

#### `sitemap_sources`
Sitemap 源配置
- `url`: Sitemap URL
- `site`: 站点域名
- `active`: 是否启用
- `baseline_established`: 是否已建立基线
- `last_scan_status`: 最后扫描状态

#### `sitemap_snapshots`
Sitemap 快照（用于对比）
- `source_id`: 关联源
- `urls`: URL 数组（JSONB）
- `observed_at`: 观察时间

#### `discovered_urls`
发现的 URL
- `source_id`: 关联源
- `url`: 规范化 URL
- `original_url`: 原始 URL
- `phrase`: 提取的需求短语
- `first_seen_at`: 首次发现时间
- `last_seen_at`: 最后发现时间

#### `term_occurrences`
短语出现记录
- `discovery_id`: 关联发现
- `phrase`: 短语
- `url`: URL
- `site`: 站点

#### `term_signals`
聚合的跨站点信号
- `phrase`: 短语
- `occurrence_count`: 出现次数
- `distinct_site_count`: 涉及站点数
- `sites`: 站点列表（JSONB）
- `priority`: 是否为优先信号（2+ 站点）

#### `scan_runs`
扫描记录
- `source_id`: 关联源
- `status`: 状态（running/succeeded/failed）
- `new_url_count`: 新发现 URL 数量
- `error`: 错误信息
- `baseline_created`: 是否创建了基线

### 自动化机制

#### 信号聚合触发器

当新增或更新 `term_occurrences` 时，自动触发 `update_term_signal()` 函数：
- 计算短语的总出现次数
- 计算涉及的不同站点数量
- 当站点数 >= 2 时，标记为优先信号
- 更新时间范围

## 📊 核心业务逻辑

### 1. Sitemap 扫描流程

```
1. 下载 sitemap XML
2. 提取所有 URL
3. 检查快照是否存在
   - 不存在: 创建 baseline，不产生发现
   - 存在: 对比差异，处理新增 URL
4. 规范化 URL（移除协议、www、查询参数）
5. 提取路径最后一段作为需求短语
6. 保存发现到 discovered_urls
7. 创建 term_occurrences 记录
8. 触发器自动更新 term_signals
9. 更新快照
```

### 2. 异常保护机制

- ✅ **零 URL 检测**: 拒绝处理空 sitemap
- ✅ **骤减检测**: 新 URL 数 < 旧数的 50% 时拒绝覆盖
- ✅ **失败保留**: 扫描失败时保留旧快照和错误信息
- ✅ **幂等性**: 重复扫描相同 URL 不会重复记录

### 3. URL 规范化

```javascript
// 示例
原始: https://www.example.com/games/subway-surfers?ref=home#top
规范: example.com/games/subway-surfers
短语: subway-surfers
```

### 4. 信号优先级

- **普通信号**: 出现在 1 个站点
- **优先信号**: 出现在 2+ 个站点（跨站点需求）

## 🛠️ 维护

### Schema 刷新

如果遇到 `PGRST204` 错误（PostgREST 缓存过期）：

```sql
-- 在 Supabase SQL Editor 执行
NOTIFY pgrst, 'reload schema';
```

或在 Supabase Dashboard → **Settings** → **API** → **Restart PostgREST**

### 日志清理

```sql
-- 清理 30 天前的扫描记录
SELECT clean_old_logs(30);
```

### 查看统计

```sql
-- 总发现数
SELECT COUNT(*) FROM discovered_urls;

-- 优先信号数
SELECT COUNT(*) FROM term_signals WHERE priority = true;

-- 各站点发现数
SELECT site, COUNT(*) FROM discovered_urls GROUP BY site ORDER BY COUNT(*) DESC;

-- 最近扫描
SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 10;
```

## 🐛 故障排查

### GitHub Actions 运行失败

**检查项**:
- GitHub Secrets 是否正确设置
- Supabase 项目是否在运行
- 查看 Actions 日志中的具体错误

### Vercel 部署成功但页面报错

**检查项**:
- Vercel 环境变量是否全部配置
- `SUPABASE_SERVICE_KEY` 是否使用了 `service_role` 密钥
- 查看 Vercel 部署日志和 Runtime Logs

### 本地 `npm run check` 报错

**检查项**:
- `.dev.vars` 文件是否存在且格式正确
- Supabase 连接是否正常
- Node.js 版本是否 >= 20

### Dashboard 无法登录

**检查项**:
- `DASHBOARD_PASSWORD` 是否设置
- `DASHBOARD_SESSION_SECRET` 是否设置且足够长（>= 32 字符）
- 清除浏览器 Cookie 重试

### 扫描不产生发现

**原因**: 首次扫描只建立 baseline，不产生发现

**解决**: 等待第二次扫描（4 小时后）或手动触发

## 📚 相关文档

- [CLAUDE.md](CLAUDE.md) - 开发规范
- [CONTEXT.md](CONTEXT.md) - 架构决策记录
- [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) - 部署检查清单
- `docs/agents/` - Agent 使用指南

## 📝 更新历史

### V2.0 (2025-01-20)
- ✅ 从游戏监控重构为通用 URL 发现
- ✅ 实现跨站点需求信号检测
- ✅ 添加 baseline 机制防止首次扫描污染
- ✅ 重写 Dashboard 为受密码保护的服务端应用
- ✅ 移除 Discord/Telegram 通知功能
- ✅ 添加部署验证脚本

### V1.0 (2024)
- 初始版本：Cloudflare Workers + KV 存储
- 游戏跨平台监控功能

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**Made with ❤️ by Zhou Rui**
