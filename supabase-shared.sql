-- ============================================================
-- 共享 Supabase 建表脚本（组织建设部 · 官网 + 工作平台 共用一个项目）
-- 用法：Supabase 控制台 → SQL Editor → 粘贴本文件 → 一次性执行。
-- 特性：可重复执行、幂等（create table if not exists / drop policy if exists）。
--
-- 设计约定（两端统一）：
--   官网表（保持官网现有代码引用的原名，不改动）：site_content / articles / messages / content_history
--   工作平台表（新增，platform_ 前缀隔离）：platform_site_content / platform_articles / platform_messages / platform_content_history
--   登录认证：共用同一套 auth.users（管理员账号通用）
--   管理密钥：统一 x-admin-key = 'hhxy_msg_admin_2026'（须与后台服务端 SUPABASE_ADMIN_KEY 一致）
--   存储桶：site-assets（官网） / platform-assets（工作平台）
-- ============================================================


-- ============================================================
-- 第一部分：官网（official） —— 与现有代码兼容，表名不变
-- ============================================================

-- 站点静态内容（含草稿 / 状态）
create table if not exists site_content (
  id text primary key,
  content jsonb not null,
  draft jsonb,
  status text not null default 'published',
  updated_at timestamptz default now()
);

-- 党建 / 团建 文章
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  title text,
  date text,
  cover text,
  body text,
  category text default 'news',
  created_at timestamptz default now()
);
create index if not exists articles_section_idx on articles(section);

-- 访客留言（联系我们表单）
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  contact text,
  body text,
  created_at timestamptz default now()
);
create index if not exists messages_created_idx on messages(created_at desc);

-- 内容版本历史（保存快照，支持回滚）
create table if not exists content_history (
  id uuid primary key default gen_random_uuid(),
  content jsonb not null,
  note text default '',
  operator text default 'admin',
  created_at timestamptz default now()
);
create index if not exists content_history_created_idx on content_history(created_at desc);

-- 开启行级安全
alter table site_content enable row level security;
alter table articles enable row level security;
alter table messages enable row level security;
alter table content_history enable row level security;

-- 删除同名策略（保证可重复执行，避免 42710）
drop policy if exists "public read site_content" on site_content;
drop policy if exists "public read articles" on articles;
drop policy if exists "admin write site_content" on site_content;
drop policy if exists "admin write articles" on articles;
drop policy if exists "public insert messages" on messages;
drop policy if exists "admin read messages" on messages;
drop policy if exists "admin delete messages" on messages;
drop policy if exists "admin write content_history" on content_history;
drop policy if exists "admin read content_history" on content_history;

-- 任何人（含线上访客）可读站点内容与文章
create policy "public read site_content" on site_content for select using (true);
create policy "public read articles" on articles for select using (true);

-- 仅当请求头携带正确 x-admin-key 才允许后台写入（直接 anon 客户端无法提供，故公开端不可写）
create policy "admin write site_content" on site_content for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
create policy "admin write articles" on articles for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

-- 留言：任何访客可提交，仅后台密钥可查看 / 删除
create policy "public insert messages" on messages for insert with check (true);
create policy "admin read messages" on messages for select
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
create policy "admin delete messages" on messages for delete
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

-- 版本历史：仅后台密钥可读写
create policy "admin write content_history" on content_history for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
create policy "admin read content_history" on content_history for select
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');


-- ============================================================
-- 第二部分：工作平台（platform） —— 新增，platform_ 前缀隔离
-- ============================================================

create table if not exists platform_site_content (
  id text primary key,
  content jsonb not null,
  draft jsonb,
  status text not null default 'published',
  updated_at timestamptz default now()
);

create table if not exists platform_articles (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  title text,
  date text,
  cover text,
  body text,
  category text default 'news',
  created_at timestamptz default now()
);
create index if not exists platform_articles_section_idx on platform_articles(section);

create table if not exists platform_messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  contact text,
  body text,
  created_at timestamptz default now()
);
create index if not exists platform_messages_created_idx on platform_messages(created_at desc);

-- 工作平台可在此按需扩展自有业务表，例如：
-- create table if not exists platform_tasks ( id uuid primary key default gen_random_uuid(), title text, owner text, due date, done boolean default false, created_at timestamptz default now() );
-- create table if not exists platform_members ( id uuid primary key default gen_random_uuid(), name text, role text, created_at timestamptz default now() );

create table if not exists platform_content_history (
  id uuid primary key default gen_random_uuid(),
  content jsonb not null,
  note text default '',
  operator text default 'admin',
  created_at timestamptz default now()
);
create index if not exists platform_content_history_created_idx on platform_content_history(created_at desc);

alter table platform_site_content enable row level security;
alter table platform_articles enable row level security;
alter table platform_messages enable row level security;
alter table platform_content_history enable row level security;

drop policy if exists "public read platform_site_content" on platform_site_content;
drop policy if exists "public read platform_articles" on platform_articles;
drop policy if exists "admin write platform_site_content" on platform_site_content;
drop policy if exists "admin write platform_articles" on platform_articles;
drop policy if exists "public insert platform_messages" on platform_messages;
drop policy if exists "admin read platform_messages" on platform_messages;
drop policy if exists "admin delete platform_messages" on platform_messages;
drop policy if exists "admin write platform_content_history" on platform_content_history;
drop policy if exists "admin read platform_content_history" on platform_content_history;

create policy "public read platform_site_content" on platform_site_content for select using (true);
create policy "public read platform_articles" on platform_articles for select using (true);

create policy "admin write platform_site_content" on platform_site_content for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
create policy "admin write platform_articles" on platform_articles for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

create policy "public insert platform_messages" on platform_messages for insert with check (true);
create policy "admin read platform_messages" on platform_messages for select
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
create policy "admin delete platform_messages" on platform_messages for delete
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

create policy "admin write platform_content_history" on platform_content_history for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
create policy "admin read platform_content_history" on platform_content_history for select
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');


-- ============================================================
-- 第三部分：存储桶（图片等静态资源）
-- ============================================================
insert into storage.buckets (id, name, public) values ('site-assets', 'site-assets', true)
  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('platform-assets', 'platform-assets', true)
  on conflict (id) do update set public = true;

drop policy if exists "public read site-assets" on storage.objects;
create policy "public read site-assets" on storage.objects for select using (bucket_id = 'site-assets');
drop policy if exists "admin write site-assets" on storage.objects;
create policy "admin write site-assets" on storage.objects for insert
  with check (bucket_id = 'site-assets' and current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

drop policy if exists "public read platform-assets" on storage.objects;
create policy "public read platform-assets" on storage.objects for select using (bucket_id = 'platform-assets');
drop policy if exists "admin write platform-assets" on storage.objects;
create policy "admin write platform-assets" on storage.objects for insert
  with check (bucket_id = 'platform-assets' and current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');


-- ============================================================
-- 完成提示：执行后应在 Table Editor 看到 8 张表，
-- 在 Storage 看到 site-assets / platform-assets 两个公共桶。
-- ============================================================
