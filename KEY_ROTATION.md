# 密钥与后台架构说明（服务端校验版）

2026-07 重构：后台登录改为**真正服务端校验**，所有写密钥不再下发到浏览器。

## 一、两类密钥现在在哪里

| 名称 | 存放位置 | 谁会用到 | 浏览器可见？ |
| --- | --- | --- | --- |
| 后台登录密码 `ADMIN_PASSWORD` | 服务端 `server/admin.pass`（SHA-256 哈希）；首次以 `server/.env` 的 `ADMIN_PASSWORD` 种子 | 登录 `POST /api/admin/login` 时由服务端比对 | ❌ 不可见 |
| 数据库写入密钥 `SUPABASE_ADMIN_KEY` | 服务端 `server/.env` | 服务端代理写库时附在 `x-admin-key` 请求头 | ❌ 不可见 |
| 会话签名密钥 `SESSION_SECRET` | 服务端 `server/.session_secret`（自动生成） | 签发/校验 HttpOnly 会话 Cookie | ❌ 不可见 |
| Supabase anon key `SUPABASE_ANON_KEY` | `assets/js/config.js`（公开只读用，本就设计为可公开） | 浏览器公开读库 + 服务端写库 | ✅ 可公开 |
| Supabase URL | `assets/js/config.js` + `server/.env` | 公开读 / 服务端写 | ✅ 可公开 |

> 结论：前端 `config.js` 现在**只保留 anon key 与 URL**（用于公开只读），密码、写密钥、会话密钥全部只在服务端。
> 任何人查看网页源码都无法再拿到后台密码或写库密钥，也无法绕过登录。

## 二、登录流程（服务端校验）

1. 访客在 `admin.html` 输入密码 → 浏览器 `POST /api/admin/login {password}`。
2. 服务端用 `sha256(password)` 与 `server/admin.pass` 中的哈希比对；一致则签发 **HttpOnly + SameSite=Lax** 的会话 JWT（Cookie）。
3. 此后所有后台接口（`/api/admin/*`）都要求携带该 Cookie，服务端用 `SESSION_SECRET` 验签并校验有效期（默认 2 小时）。
4. 未带有效 Cookie 访问受保护接口 → 返回 `401`。

> 部署到 HTTPS 域名时，Cookie 会自动加 `Secure` 标记（localhost 不强制，便于本地调试）。

## 三、如何修改后台登录密码

**方式 A（推荐）：在后台界面改**
- 登录后台 → 右上角「修改密码」→ 输入当前密码 + 新密码（≥6 位）。
- 服务端更新 `server/admin.pass`，下次登录用新密码。

**方式 B：直接改服务端文件（无界面时）**
- 停止服务，计算 `echo -n '新密码' | sha256sum`，把哈希写入 `server/admin.pass`，重启服务。

> 注意：原前端 `ADMIN_PASSWORD`（硬编码在 `config.js`）已移除，改它**不再生效**。

## 四、如何轮换 Supabase 写入密钥（SUPABASE_ADMIN_KEY）

仅在你觉得该密钥可能泄露、或需定期轮换时才做。

1. 在 `server/.env` 把 `SUPABASE_ADMIN_KEY` 改成新值；
2. 打开 Supabase 控制台 → **SQL Editor**，把 `supabase-schema.sql` 里所有
   `current_setting('request.headers', true)::json->>'x-admin-key' = '旧密钥'` 的旧密钥替换为新值；
3. 执行该 SQL（脚本已用 `drop policy if exists` 写成可重复执行）；
4. 重启服务。

> anon key 可公开，无需轮换；`sb_secret_...`（service_role）仍绝不可进前端或进 Git。

## 五、部署须知（重要）

本站现在由 **Node 服务同时托管静态站点与后台接口**，不再是纯静态站点：

```bash
cd server
# 复制并填写 .env（SUPABASE_URL / ANON / ADMIN_KEY / ADMIN_PASSWORD）
cp .env.example .env
node index.js          # 默认监听 :3000
```

- 访问站点：`http://<域名>:3000/`
- 后台：`http://<域名>:3000/admin.html`
- 反向代理（Nginx 等）把域名根路径与 `/api` 都转发到该 Node 进程即可。
- 若后台与站点不同源，在 `assets/js/config.js` 设置 `API_BASE` 为接口域名。

## 六、anRP / service_role 密钥红线（不变）

- `sb_secret_...`（service_role）拥有绕过 RLS 的权限，**绝不可**写入前端或提交到 Git。
- 本项目服务端仅用 **anon key + x-admin-key 头**代理写库，未使用 service_role。
- 若不慎暴露 service_role，请立即到 Supabase 控制台 **Rotate** 使其失效。
