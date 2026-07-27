# 部署说明

本项目是**纯静态前端站**（首页/关于/隐私/声明 + 后台管理页），内容存于 Supabase，
附带一个可选的 Node 服务用于「后台真正服务端校验」与内容读写。

## 〇、数据库初始化（必做，一次性）

后台功能（草稿/发布分离、版本历史与回滚、图片上传、留言管理）依赖 Supabase 中的
几张表与存储桶。**首次部署或换库时必须先执行建表脚本**，否则保存会报
“Could not find the 'draft' column / content_history / site-assets”。

1. 打开 Supabase 控制台 → **SQL Editor**；
2. 把项目根目录的 **`supabase-schema.sql`** 全文粘贴进去，点击 **Run**；
3. 该脚本是**幂等**的（`if not exists` / `add column if not exists` /
   `on conflict do update`），可重复执行，不会重复建表或丢失已有数据。

> 脚本包含：基础表 `site_content / articles / messages`、增量表 `content_history`、
> `site_content` 的 `draft` / `status` 列，以及公共存储桶 `site-assets` 与对应 RLS 策略。
> 注意脚本中的 `x-admin-key` 值（`hhxy_msg_admin_2026`）须与 `server/.env` 的
> `SUPABASE_ADMIN_KEY` 一致。

## 一、当前线上（手动部署）

线上站点由 **CloudStudio 沙箱**托管，部署通过 WorkBuddy 的部署工具手动触发：
改完文件后执行一次部署命令，线上即更新。它**不是文件改动自动同步**，
每次改完都要显式部署一次。

- 公开页面（读 Supabase 展示内容）在 CloudStudio 上完全正常。
- 后台 `admin.html` 登录需要 Node 服务（`server/index.js`），纯静态托管下不可用。
  如需后台在线上登录，需把 Node 服务部署到支持运行时的环境（见下文「三、后台上线」）。

## 二、自动部署（GitHub Pages，推荐）

实现「推送即上线」，无需任何外部密钥：

1. 在项目根执行 `git init`（若尚未初始化），提交全部文件；
2. 在 GitHub 新建仓库，把本仓库 push 上去（分支 `main` 或 `master`）；
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；
4. 之后每次 `git push` 到主分支，`.github/workflows/deploy.yml` 会自动预检并部署到
   `https://<你的用户名>.github.io/<仓库名>/`。

> 工作流默认用 GitHub Pages。若要部署到自有服务器/其他托管，编辑 `deploy.yml`
> 启用 `deploy-ssh` 段并配置 `SSH_HOST / SSH_USER / SSH_KEY` 三个 Secrets。

## 三、后台上线（Node 服务）

后台需要运行 `server/index.js`（登录校验 + 内容读写代理）。静态托管不支持，
需部署到支持 Node 运行时的环境：

```bash
cd server
cp .env.example .env      # 填 SUPABASE_URL / ANON / SUPABASE_ADMIN_KEY / ADMIN_PASSWORD / SESSION_SECRET
node index.js             # 默认监听 :3000
```

用 Nginx/Caddy 把域名根路径与 `/api` 都反代到该进程即可。
`.env`、`admin.pass`、`.session_secret` 已在 `.gitignore` 中，不会误提交。

## 四、本地预览

```bash
bash scripts/deploy.sh        # 先预检，再起 http://localhost:4173 预览
```

## 五、改动后必做

- 每次前端改动后跑 `node scripts/deploy.js` 做预检；
- 上线前按 `MOBILE_TEST_CHECKLIST.md` 在真机回归（尤其滚动回滚、动效、分享卡片预览）。
