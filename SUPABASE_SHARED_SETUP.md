# 任务交接：把「组织建设部官网」和「组织建设部工作平台」接入同一个 Supabase 项目

> 本文件是给**另一个 AI / 执行者**的落地手册。请按顺序执行，每步都有明确产出与验证方式。不要跳步。

---

## 0. 目标（一句话）
让**两个网站共用同一个 Supabase 项目**：共享管理员登录账号，数据按表前缀隔离（官网用原名、工作平台用 `platform_` 前缀），公开访客只能读、后台写入走安全的服务端通道。

## 1. 前提条件（执行前必须先向用户索取，缺一项都做不了）
| 需要什么 | 去哪拿 | 是否保密 |
|---|---|---|
| Supabase 项目 URL | 控制台 Project Settings → API → Project URL（本项目已是 `https://aoojocqhdqtdggxinjtc.supabase.co`） | 公开 |
| anon / publishable key | 同上，`anon public` 那串（官网 `assets/js/config.js` 里也有） | 可公开（RLS 保护） |
| **service_role key** | 同上页面，`service_role` 那串（**带全权限，绝对不能进前端**） | ⚠️ 保密 |
| **管理密钥 ADMIN_KEY** | 固定为 `hhxy_msg_admin_2026`（必须与 RLS、`server/.env` 的 `SUPABASE_ADMIN_KEY` 一致） | ⚠️ 保密 |

> 如果用户的 Supabase 项目还没建，先建一个免费的（New project），记下上面的 URL / anon / service_role。

## 2. 执行步骤

### 步骤 1：执行建表脚本（最核心）
1. 打开 Supabase 控制台 → **SQL Editor**。
2. 把本项目根目录的 **`supabase-shared.sql`** 全文粘贴进去，点 **Run**。
3. 验证：进入 **Table Editor**，应看到 8 张表：
   - 官网：`site_content` / `articles` / `messages` / `content_history`
   - 工作平台：`platform_site_content` / `platform_articles` / `platform_messages` / `platform_content_history`
4. 验证：进入 **Storage**，应看到两个公共桶 `site-assets`、`platform-assets`。
5. 验证：进入 **Authentication → Policies**，确认每个表都有 `public read ...` 与 `admin write ...` 策略。

> 该脚本幂等，重复执行不会报错。它已经包含了官网原有表结构，**不要再另外执行旧的 `supabase-schema.sql` / `supabase-messages.sql`**（避免重复）。

### 步骤 2：部署统一的管理写入通道（Edge Function）
因为网站托管在静态平台（CloudStudio / GitHub Pages），没有常驻 Node 服务，后台写入必须走 **Supabase Edge Function**（用 service_role 绕过 RLS 写入，并用 ADMIN_KEY 把关）。

1. 在项目中新建目录与文件 `supabase/functions/admin-write/index.ts`，内容如下（直接抄）：

```ts
// supabase/functions/admin-write/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_KEY = Deno.env.get('ADMIN_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const URL = Deno.env.get('SUPABASE_URL')!;

Deno.serve(async (req) => {
  // 1) 校验管理密钥（前端绝不可持有此密钥）
  if (req.headers.get('x-admin-key') !== ADMIN_KEY) {
    return new Response('unauthorized', { status: 401 });
  }
  // 2) 解析请求：table 决定写哪张表（官网或平台均可）
  const { table, op = 'upsert', payload, id } = await req.json();
  const sb = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let res;
  if (op === 'insert') res = await sb.from(table).insert(payload);
  else if (op === 'update') res = await sb.from(table).update(payload).eq('id', id);
  else if (op === 'delete') res = await sb.from(table).delete().eq('id', id);
  else res = await sb.from(table).upsert(payload); // 默认 upsert（按 id 主键）
  if (res.error) return new Response(JSON.stringify({ error: res.error.message }), { status: 400 });
  return new Response(JSON.stringify({ ok: true, data: res.data }),
    { headers: { 'content-type': 'application/json' } });
});
```

2. 部署（需本地装好 Supabase CLI 并 `supabase login`）：
   ```bash
   supabase functions deploy admin-write --no-verify-jwt
   ```
3. 配置环境变量（控制台 → Edge Functions → admin-write → 配置 / 或 `supabase secrets set`）：
   - `SUPABASE_URL` = 项目 URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key（保密）
   - `ADMIN_KEY` = `hhxy_msg_admin_2026`
4. 记下该函数的调用地址，形如：
   `https://<project-ref>.supabase.co/functions/v1/admin-write`
   把它填进两个站点的 `assets/js/config.js` 的 `API_BASE`（或新建 `ADMIN_API` 字段）。

### 步骤 3：接入「官网」（如尚未接 Supabase，或准备从 Node 服务切到 Edge Function）
- `assets/js/config.js` 已有 `SUPABASE_URL` 与 `SUPABASE_ANON_KEY`，保持不变。
- 把后台写入目标从旧 `/api/admin/content`（Node 服务）改为调用上面的 Edge Function：
  - 请求头带 `x-admin-key: hhxy_msg_admin_2026`
  - body：`{ "table": "site_content", "op": "upsert", "payload": { "id": "...", "content": {...} } }`
- 公开读（访客看页面）保持现状：用 anon key 直连 Supabase `select`，RLS 已允许 `public read`。

### 步骤 4：搭建 / 接入「工作平台」
工作平台是另一个站点（独立前端代码仓库或目录），接入方式：
1. `assets/js/config.js` 填**同一个** `SUPABASE_URL` 与 `SUPABASE_ANON_KEY`。
2. 数据层读取 `platform_*` 表（例：`sb.from('platform_site_content').select('*')`）。
3. 后台写入同样调用步骤 2 的 Edge Function，但 `table` 传 `platform_*` 表名。
4. 图片等资源上传到 `platform-assets` 桶（Edge Function 的 `admin write platform-assets` 策略已放开）。
5. 工作平台自有业务表（任务、成员、考勤等）在 `supabase-shared.sql` 末尾的注释处按需 `create table` 并补 RLS（参考已有写法）。

### 步骤 5：验证（必须全过）
- [ ] 用 anon key 直接 `select` `site_content` 与 `platform_site_content` 都能读到（公开可读 ✅）。
- [ ] 用 anon key 直接 `insert` 这两个表 → **被 RLS 拒绝**（公开不可写 ✅）。
- [ ] 不携带 `x-admin-key` 调用 Edge Function → 返回 401（未授权 ✅）。
- [ ] 携带正确 `x-admin-key` 调用 Edge Function 写 `platform_site_content` → 成功，且官网页面 / 平台页面各自只显示自己的数据（隔离 ✅）。
- [ ] 官网原有页面（文章、留言）功能不受影响（表名未改 ✅）。
- [ ] `messages` / `platform_messages` 访客可 `insert`，后台可 `select`/`delete`（留言闭环 ✅）。

## 3. 安全红线（务必遵守）
1. **service_role key 与 ADMIN_KEY 永远只存在于：Supabase 环境变量 / 受信任的服务端。绝不准写进任何前端 JS、也绝不准提交到 git。**
2. 前端只持 anon key（公开安全，靠 RLS 限制写入）。
3. 所有后台写入必须经 Edge Function（或受信任 Node 服务）这一道 ADMIN_KEY 校验，**禁止**前端用 anon 客户端直接写表。
4. `.gitignore` 必须排除 `.env`、`server/.env`、`*service*key*` 等。

## 4. 常见坑
- 执行 SQL 报 `42710 policy already exists` → 已用 `drop policy if exists` 规避，重跑即可。
- Edge Function 部署报权限问题 → 确认用了 `--no-verify-jwt`（因为我们自己用 `x-admin-key` 校验，不走 JWT）。
- 前端读不到数据 → 检查 anon key 是否正确、表名是否拼对、`public read` 策略是否存在。
- 两个站数据串了 → 确认读 / 写时 `table` 参数用的是各自前缀的表，不要混用。

## 5. 交付物清单（完成后应存在）
- [ ] Supabase 项目内 8 张表 + 2 个公共桶已建好（步骤 1 验证）
- [ ] `admin-write` Edge Function 已部署并配置 3 个环境变量（步骤 2）
- [ ] 官网后台写入切到 Edge Function（步骤 3）
- [ ] 工作平台前端接入同一 Supabase、读写 `platform_*`（步骤 4）
- [ ] 步骤 5 验证清单全绿
