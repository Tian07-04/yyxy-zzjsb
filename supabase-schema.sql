-- ============================================================
-- 黄淮学院音乐学院 · 组织建设部 官网 —— Supabase 建表脚本
-- 在 Supabase 控制台 → SQL Editor 中粘贴执行一次即可。
-- 注意：下方 'hhxy_msg_admin_2026' 需与 assets/js/config.js 中的 SUPABASE_ADMIN_KEY 保持一致。
-- ============================================================

-- 站点静态内容（除文章外）
create table if not exists site_content (
  id text primary key,
  content jsonb not null,
  updated_at timestamptz default now()
);

-- 党建 / 团建 文章
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  section text not null,            -- 'party' 或 'league'
  title text,
  date text,
  cover text,
  body text,
  category text default 'news',     -- 'news' 新闻 / 'notice' 通知 / 'publicity' 公示
  created_at timestamptz default now()
);
create index if not exists articles_section_idx on articles(section);

-- 访客留言（联系我们表单）
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  contact text,                     -- 电话 / 邮箱等联系方式（可选）
  body text,
  created_at timestamptz default now()
);
create index if not exists messages_created_idx on messages(created_at desc);

-- 开启行级安全
alter table site_content enable row level security;
alter table articles enable row level security;
alter table messages enable row level security;

-- 先删同名策略，保证可重复执行不报错（42710）
drop policy if exists "public read site_content" on site_content;
drop policy if exists "public read articles"      on articles;
drop policy if exists "admin write site_content"  on site_content;
drop policy if exists "admin write articles"      on articles;
drop policy if exists "public insert messages"    on messages;
drop policy if exists "admin read messages"       on messages;
drop policy if exists "admin delete messages"     on messages;

-- 任何人（含线上访客）都可读取站点内容与文章
create policy "public read site_content" on site_content for select using (true);
create policy "public read articles"      on articles      for select using (true);

-- 仅当请求头携带正确的 x-admin-key（即后台密钥）时才允许写入
create policy "admin write site_content" on site_content for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

create policy "admin write articles" on articles for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

-- 留言：任何访客都可提交（insert），但仅后台密钥可查看 / 删除
create policy "public insert messages" on messages for insert with check (true);
create policy "admin read messages"    on messages for select
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
create policy "admin delete messages"  on messages for delete
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

-- ============================================================
-- 增量（版本历史 / 草稿审核 / 图片上传）—— 可重复执行
-- ============================================================

-- 内容版本历史：每次保存记录快照，支持回滚
create table if not exists content_history (
  id uuid primary key default gen_random_uuid(),
  content jsonb not null,
  note text default '',
  operator text default 'admin',
  created_at timestamptz default now()
);
create index if not exists content_history_created_idx on content_history(created_at desc);
alter table content_history enable row level security;
drop policy if exists "admin write content_history" on content_history;
drop policy if exists "admin read content_history" on content_history;
create policy "admin write content_history" on content_history for all
  using  (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026')
  with check (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
create policy "admin read content_history" on content_history for select
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

-- 站点内容增加 草稿 / 状态 列（status: draft / pending / published）
alter table site_content add column if not exists draft jsonb;
alter table site_content add column if not exists status text not null default 'published';

-- 图片存储桶（后台富文本图片上传）
insert into storage.buckets (id, name, public) values ('site-assets', 'site-assets', true)
  on conflict (id) do update set public = true;
drop policy if exists "public read site-assets" on storage.objects;
create policy "public read site-assets" on storage.objects for select using (bucket_id = 'site-assets');
drop policy if exists "admin write site-assets" on storage.objects;
create policy "admin write site-assets" on storage.objects for insert
  with check (bucket_id = 'site-assets' and current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
