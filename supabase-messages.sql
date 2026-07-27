-- ============================================================
-- 增量脚本：访客留言表 messages
-- 用途：让「联系我们」的留言在邮件之外，再备份到云端，后台可查看/删除。
-- 用法：在 Supabase 控制台 → SQL Editor 粘贴执行一次即可（可安全重复执行）。
-- 注意：下方 'hhxy_msg_admin_2026' 需与 assets/js/config.js 的 SUPABASE_ADMIN_KEY 一致。
-- ============================================================

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  contact text,                 -- 电话 / 邮箱等联系方式（可选）
  body text,
  created_at timestamptz default now()
);
create index if not exists messages_created_idx on messages(created_at desc);

alter table messages enable row level security;

-- 先删同名策略，保证可重复执行不报错
drop policy if exists "public insert messages" on messages;
drop policy if exists "admin read messages"    on messages;
drop policy if exists "admin delete messages"  on messages;

-- 任何访客都可提交留言（insert）
create policy "public insert messages" on messages for insert with check (true);

-- 仅后台密钥可查看 / 删除（与登录密码解耦，改登录密码不影响此处）
create policy "admin read messages" on messages for select
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');

create policy "admin delete messages" on messages for delete
  using (current_setting('request.headers', true)::json->>'x-admin-key' = 'hhxy_msg_admin_2026');
