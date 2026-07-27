/* ===== 全局配置 ===== */
/*
 * 仅保留「公开读取」所需的信息。
 *  - SUPABASE_URL / SUPABASE_ANON_KEY（anon key 本就设计为可公开，数据由 RLS 保护）
 *  - 后台登录密码、数据库写入密钥（x-admin-key）、会话密钥 一律不在前端出现，
 *    全部由服务端（server/）持有。详见 server/.env.example 与 KEY_ROTATION.md。
 */
window.APP_CONFIG = {
  // 后端服务地址：本地开发为 http://localhost:3000；部署后改为你的服务域名。
  // 后台接口（/api/admin/*）由该服务托管，公开读库仍直连 Supabase。
  API_BASE: "http://localhost:3000",
  // Supabase 项目信息（公开只读用）
  SUPABASE_URL: "https://aoojocqhdqtdggxinjtc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_V9qW10jbYty_pWnBtJcM_Q_bWsBO84k"
};
