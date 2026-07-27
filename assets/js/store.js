/* ===== 数据层 =====
 *  - 公开页（index / about / privacy）：直连 Supabase anon 只读（RLS 允许 public select），不携带任何写密钥。
 *  - 后台（admin.html）：所有读写经服务端 /api/admin/*，由服务端持有写密钥与会话，前端零密钥。
 */
(function () {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const DEFAULT = window.SITE_CONTENT;
  const LS_KEY = 'hh_site_content_v1';

  const IS_ADMIN = location.pathname.endsWith('admin.html');
  const USE_SUPABASE = !!(
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && String(cfg.SUPABASE_URL).startsWith('http')
  );

  let sb = null;
  if (USE_SUPABASE && window.supabase) {
    try {
      // 注意：公开客户端不再附加任何写密钥（x-admin-key），仅用于只读查询
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    } catch (e) {
      sb = null;
    }
  }

  const API = (cfg.API_BASE || '').replace(/\/$/, '');

  async function api(path, method, body) {
    const opts = { method, credentials: 'include', headers: {} };
    if (body !== undefined) opts.headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, opts);
    if (res.status === 401) throw new Error('未登录或会话已过期');
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error || ''; } catch (e) {}
      throw new Error(msg || ('HTTP ' + res.status));
    }
    return res.json();
  }

  // 将后端/数据库错误翻译成可操作的提示，方便非技术管理员快速定位问题
  function friendlyError(e) {
    const m = String((e && e.message) || e);
    if (/draft[' ]?column|content_history|site-assets|Could not find the (table|'[^']+' column)|does not exist/i.test(m))
      return '数据库架构未就绪：请先在 Supabase SQL Editor 执行 supabase-schema.sql（含草稿/历史/存储桶，可重复执行、不丢数据）。';
    if (/401|未登录|会话已过期/i.test(m)) return '登录已过期，请刷新页面重新登录。';
    if (/x-admin-key|permission|RLS|policy|42501/i.test(m)) return '写入被拒绝：请确认 supabase-schema.sql 已执行且 x-admin-key 与服务端一致。';
    if (/上传失败|storage|bucket/i.test(m)) return '图片上传失败：请确认已在 Supabase 创建 site-assets 公共存储桶（执行 supabase-schema.sql）。';
    return m;
  }

  function deepMerge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    if (base && typeof base === 'object') {
      const out = {};
      for (const k in base) out[k] = deepMerge(base[k], over && over[k] !== undefined ? over[k] : base[k]);
      if (over && typeof over === 'object' && !Array.isArray(over)) {
        for (const k in over) if (!(k in base)) out[k] = over[k];
      }
      return out;
    }
    return over !== undefined ? over : base;
  }

  // 仅当 base 中字段为空（空串 / 空数组 / null）时，用 over 的值填补；
  // 绝不覆盖 base 已有内容，也不引入 base 中不存在的 key（如已删除板块）。
  function isEmptyVal(v) { return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0); }
  function deepMergeFill(base, over) {
    if (!over || typeof over !== 'object') return;
    for (const k in over) {
      if (!(k in base)) continue; // 不引入 base 没有的字段（已删板块 faq/honors 等）
      const bv = base[k], ov = over[k];
      if (Array.isArray(bv) && Array.isArray(ov)) {
        if (bv.length === 0 && ov.length > 0) base[k] = ov;
      } else if (bv && typeof bv === 'object' && ov && typeof ov === 'object') {
        deepMergeFill(bv, ov);
      } else if (isEmptyVal(bv) && !isEmptyVal(ov)) {
        base[k] = ov;
      }
    }
  }

  function normArt(a) {
    return {
      id: a.id,
      title: a.title || '',
      date: a.date || '',
      cover: a.cover || '',
      body: a.body || '',
      category: a.category || 'news'
    };
  }

  /* ---------- 内容读写 ---------- */
  let ADMIN_STATUS = 'published';
  async function loadContent() {
    if (IS_ADMIN) {
      try {
        const r = await api('/api/admin/content', 'GET');
        ADMIN_STATUS = r.status || 'published';
        return (r.draft && Object.keys(r.draft).length) ? r.draft : r.content;
      } catch (e) {
        // 服务端不可达时退回默认内容，保证后台界面仍可渲染
        console.warn('[admin] 服务端读取失败，使用默认内容：', e.message);
      }
    }
    // 公开页：以 content.js (DEFAULT) 为基底；再用 Supabase 已发布内容【增量补充】。
    // 说明：仅填补基底为空的部分，绝不覆盖现有内容，也不引入已删除板块。
    // 这样——用户在后台（连接云端）填写的内容可各端一致显示、随部署保留；
    //   同时不会把旧版 localStorage 缓存错误覆盖到线上，避免「两端不一致 / 内容被冲掉」。
    const base = structuredClone(DEFAULT);
    if (sb) {
      try {
        const { data, error } = await sb
          .from('site_content')
          .select('content')
          .eq('status', 'published')
          .limit(1)
          .maybeSingle();
        if (!error && data && data.content) deepMergeFill(base, data.content);
      } catch (e) { /* 云端不可用时静默回落 content.js */ }
      // 党建 / 团建文章存于 articles 表，公开页也读取展示（各端一致、不丢内容）
      try {
        const { data: arts, error } = await sb.from('articles').select('*');
        if (!error && arts && arts.length) {
          const bySec = (sec) => arts.filter((a) => a.section === sec).map(normArt);
          const p = bySec('party'), l = bySec('league');
          if (base.party && p.length) base.party.items = p;
          if (base.league && l.length) base.league.items = l;
        }
      } catch (e) { /* 忽略 */ }
    }
    return base;
  }

  async function saveContent(content, opts) {
    opts = opts || {};
    if (IS_ADMIN && API) {
      try {
        await api('/api/admin/content', 'PUT', { draft: content, status: opts.status || 'draft', publish: !!opts.publish });
        if (opts.publish) ADMIN_STATUS = 'published';
        else if (opts.status) ADMIN_STATUS = opts.status;
        return { ok: true, mode: 'server' };
      } catch (e) {
        // 服务端不可达（静态托管）→ 降级到 localStorage，不报错
        const m = String((e && e.message) || e);
        if (/Unexpected token|<!DOCTYPE|<html/i.test(m)) {
          localStorage.setItem(LS_KEY, JSON.stringify(content));
          if (opts.publish) ADMIN_STATUS = 'published';
          else if (opts.status) ADMIN_STATUS = opts.status;
          return { ok: true, mode: 'local', note: '已保存到浏览器本地（服务端不可用，改 content.js 文件可永久生效）' };
        }
        throw new Error(friendlyError(e));
      }
    }
    // 无 API 或非后台模式 → 直接写 localStorage
    localStorage.setItem(LS_KEY, JSON.stringify(content));
    return { ok: true, mode: 'local' };
  }

  /* ---------- 版本历史 / 回滚 / 图片上传 ---------- */
  function getStatus() { return ADMIN_STATUS; }
  async function getHistory() {
    try {
      const r = await api('/api/admin/content/history', 'GET');
      return r.items || [];
    } catch (e) { throw new Error(friendlyError(e)); }
  }
  async function rollbackContent(id) {
    try {
      await api('/api/admin/content/rollback', 'POST', { historyId: id });
      return { ok: true };
    } catch (e) { throw new Error(friendlyError(e)); }
  }
  async function uploadImage(file) {
    return new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onload = async () => {
        try {
          const r = await api('/api/admin/upload', 'POST', { name: file.name, data: rd.result });
          resolve(r.url);
        } catch (e) { reject(new Error(friendlyError(e))); }
      };
      rd.onerror = () => reject(new Error('读取文件失败'));
      rd.readAsDataURL(file);
    });
  }

  /* ---------- 留言 ---------- */
  const MSG_KEY = 'hh_messages_v1';

  async function saveMessage(msg) {
    const record = {
      name: msg.name || '',
      contact: msg.contact || '',
      body: msg.body || '',
      created_at: new Date().toISOString()
    };
    if (sb) {
      try {
        const { error } = await sb.from('messages').insert(record);
        if (error) throw error;
        return { ok: true, mode: 'supabase' };
      } catch (err) {
        return { ok: false, mode: 'supabase', error: String((err && err.message) || err) };
      }
    }
    try {
      const arr = JSON.parse(localStorage.getItem(MSG_KEY) || '[]');
      arr.unshift({ id: 'm' + Date.now(), ...record });
      localStorage.setItem(MSG_KEY, JSON.stringify(arr));
    } catch (e) {}
    return { ok: true, mode: 'local' };
  }

  async function loadMessages() {
    if (IS_ADMIN) {
      try {
        const r = await api('/api/admin/messages', 'GET');
        return { ok: true, mode: 'server', items: r.items || [] };
      } catch (e) {
        return { ok: false, mode: 'server', error: String(e.message || e), items: [] };
      }
    }
    if (sb) {
      try {
        const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return { ok: true, mode: 'supabase', items: data || [] };
      } catch (err) {
        return { ok: false, mode: 'supabase', error: String((err && err.message) || err), items: [] };
      }
    }
    try {
      return { ok: true, mode: 'local', items: JSON.parse(localStorage.getItem(MSG_KEY) || '[]') };
    } catch (e) {
      return { ok: true, mode: 'local', items: [] };
    }
  }

  async function deleteMessage(id) {
    if (IS_ADMIN) {
      await api('/api/admin/messages/' + encodeURIComponent(id), 'DELETE');
      return { ok: true };
    }
    if (sb) {
      try {
        const { error } = await sb.from('messages').delete().eq('id', id);
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    }
    try {
      const arr = JSON.parse(localStorage.getItem(MSG_KEY) || '[]').filter((m) => String(m.id) !== String(id));
      localStorage.setItem(MSG_KEY, JSON.stringify(arr));
    } catch (e) {}
    return { ok: true };
  }

  window.SiteStore = {
    IS_ADMIN,
    USE_SUPABASE,
    loadContent,
    saveContent,
    getStatus,
    getHistory,
    rollbackContent,
    uploadImage,
    saveMessage,
    loadMessages,
    deleteMessage,
    getClient: () => sb
  };
})();
