# 🔐 环境文件备份清单

## 需要备份的环境文件

这些文件包含敏感凭证信息，**不会被 Git 跟踪**，需要手动备份到另一台电脑。

### 1. 根目录环境文件

#### `.dev.vars` (如果存在)
**位置**: `D:\code\vscode_code\sitemap-monitor\.dev.vars`

**内容示例**:
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DASHBOARD_PASSWORD=your-strong-password
DASHBOARD_SESSION_SECRET=your-random-32-char-secret
```

**用途**: 本地开发时使用，包含 Supabase 凭证和 Dashboard 认证信息

**备份方式**:
```bash
# 在源电脑上
cp .dev.vars .dev.vars.backup

# 传输到目标电脑后
cp .dev.vars.backup .dev.vars
```

---

### 2. Web 目录环境文件

#### `web/.env` 或 `web/.env.local` (如果存在)
**位置**: `D:\code\vscode_code\sitemap-monitor\web\.env`

**内容示例**:
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DASHBOARD_PASSWORD=your-strong-password
DASHBOARD_SESSION_SECRET=your-random-32-char-secret
```

**用途**: Next.js 本地开发环境变量

**备份方式**:
```bash
# 在源电脑上
cd web
cp .env .env.backup

# 传输到目标电脑后
cd web
cp .env.backup .env
```

---

### 3. Vercel 配置文件（如果有本地配置）

#### `.vercel/` 目录
**位置**: `D:\code\vscode_code\sitemap-monitor\.vercel\`

**内容**: Vercel 项目配置和部署信息

**用途**: 保留 Vercel 项目关联信息

**备份方式**:
```bash
# 在源电脑上
cp -r .vercel .vercel.backup

# 传输到目标电脑后
cp -r .vercel.backup .vercel
```

---

## 📋 快速备份脚本

### 在源电脑上执行

创建备份包：

```bash
cd D:/code/vscode_code/sitemap-monitor

# 创建备份目录
mkdir -p ~/sitemap-monitor-env-backup

# 复制环境文件（如果存在）
[ -f .dev.vars ] && cp .dev.vars ~/sitemap-monitor-env-backup/
[ -f web/.env ] && cp web/.env ~/sitemap-monitor-env-backup/web.env
[ -f web/.env.local ] && cp web/.env.local ~/sitemap-monitor-env-backup/web.env.local
[ -d .vercel ] && cp -r .vercel ~/sitemap-monitor-env-backup/

# 创建说明文件
cat > ~/sitemap-monitor-env-backup/README.txt << 'EOF'
环境文件备份
创建时间: $(date)
源路径: D:/code/vscode_code/sitemap-monitor

恢复方式：
1. .dev.vars → 项目根目录
2. web.env → web/.env
3. web.env.local → web/.env.local
4. .vercel/ → 项目根目录/.vercel/
EOF

echo "✅ 备份完成，位置: ~/sitemap-monitor-env-backup"
ls -la ~/sitemap-monitor-env-backup
```

### 在目标电脑上恢复

```bash
cd /path/to/sitemap-monitor

# 从备份恢复
[ -f ~/sitemap-monitor-env-backup/.dev.vars ] && cp ~/sitemap-monitor-env-backup/.dev.vars .
[ -f ~/sitemap-monitor-env-backup/web.env ] && cp ~/sitemap-monitor-env-backup/web.env web/.env
[ -f ~/sitemap-monitor-env-backup/web.env.local ] && cp ~/sitemap-monitor-env-backup/web.env.local web/.env.local
[ -d ~/sitemap-monitor-env-backup/.vercel ] && cp -r ~/sitemap-monitor-env-backup/.vercel .

echo "✅ 恢复完成"
```

---

## ⚠️ 安全注意事项

1. **传输安全**
   - 使用加密的传输方式（如 SCP、SFTP、加密 U 盘）
   - 不要通过邮件或未加密的聊天工具发送
   - 传输后删除中间副本

2. **存储安全**
   - 不要将备份文件提交到 Git
   - 不要上传到公共云存储
   - 在目标电脑恢复后，删除备份包

3. **权限检查**
   ```bash
   # 确保环境文件权限正确
   chmod 600 .dev.vars
   chmod 600 web/.env
   ```

---

## 🔍 当前项目环境文件状态检查

运行以下命令检查哪些环境文件实际存在：

```bash
cd D:/code/vscode_code/sitemap-monitor

echo "=== 检查环境文件 ==="
echo ""

echo "根目录:"
[ -f .dev.vars ] && echo "✅ .dev.vars 存在" || echo "❌ .dev.vars 不存在"
echo ""

echo "Web 目录:"
[ -f web/.env ] && echo "✅ web/.env 存在" || echo "❌ web/.env 不存在"
[ -f web/.env.local ] && echo "✅ web/.env.local 存在" || echo "❌ web/.env.local 不存在"
echo ""

echo "Vercel 配置:"
[ -d .vercel ] && echo "✅ .vercel/ 目录存在" || echo "❌ .vercel/ 目录不存在"
echo ""

echo "=== 检查完成 ==="
```

---

## 📝 GitHub Secrets 和 Vercel 环境变量

这些配置在远程平台上，不需要手动备份文件，但建议记录：

### GitHub Secrets
在 GitHub 仓库 → Settings → Secrets and variables → Actions

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### Vercel 环境变量
在 Vercel Dashboard → 项目 → Settings → Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `DASHBOARD_PASSWORD`
- `DASHBOARD_SESSION_SECRET`

**建议**: 将这些值保存在密码管理器中（如 1Password, Bitwarden）

---

## ✅ 备份完成检查清单

- [ ] 已备份 `.dev.vars`（如果存在）
- [ ] 已备份 `web/.env` 或 `web/.env.local`（如果存在）
- [ ] 已备份 `.vercel/` 目录（如果存在）
- [ ] 已通过安全方式传输到目标电脑
- [ ] 已在目标电脑恢复并验证
- [ ] 已删除传输过程中的临时副本
- [ ] 已记录 GitHub Secrets 和 Vercel 环境变量

---

**最后更新**: 2026-08-21
