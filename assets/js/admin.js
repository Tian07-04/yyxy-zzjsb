/* ===== 后台管理：服务端登录 + 全站内容编辑 + 党建/团建/通知文章管理 ===== */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const DEFAULT_CONTENT = window.SITE_CONTENT;
  let state = null;
  let current = 'basic';
  let editingArticle = null; // {id,title,date,category,cover,body} 或 null
  let quillBody = null;       // 文章正文 Quill 实例（每次渲染重建）
  let dirty = false;         // 是否有未保存修改

  const API = (cfg.API_BASE || '').replace(/\/$/, '');
  function apiUrl(p) { return API + p; }

  /* ---------- 工具 ---------- */
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escText(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
  }
  const CAT = { news: '新闻', notice: '通知', publicity: '公示' };
  function catLabel(c) { return CAT[c] || '新闻'; }
  function today() { return new Date().toISOString().slice(0, 10); }

  // 每个标签页的展示名（用于「正在编辑」上下文条）
  const TAB_LABELS = {
    basic: '基础设置', duties: '工作职责', team: '组织架构', activities: '特色活动',
    facts: '学院名片', party: '党建工作', league: '团建工作', announce: '通知公告',
    pages: '单页内容', history: '历史版本', sop: '内容审核说明', messages: '留言管理'
  };

  /* ---------- 未保存修改指示 ---------- */
  function markDirty() { dirty = true; updateCtx(); }
  function updateCtx() {
    const el = document.getElementById('panelCtx');
    if (!el) return;
    const name = TAB_LABELS[current] || current;
    const flag = dirty
      ? '<span class="dirty">● 有未保存修改</span>'
      : '<span class="saved">✓ 已保存</span>';
    el.innerHTML = '正在编辑：<b>' + escText(name) + '</b>' + flag;
  }

  /* ---------- 模板与渲染助手 ---------- */
  const TEMPLATES = {
    'hero.stats': { num: '0', label: '新指标' },
    'duties.items': { ico: '◆', title: '新职能', text: '职能说明' },
    'activities.items': { ico: '🎯', title: '新活动', text: '活动说明' },
    'about.points': { ico: '✨', title: '新要点', text: '要点说明' },
    'about.paragraphs': '新增一段文字。',
    'contact.rows': { ico: '📌', title: '新行', text: '内容', link: '' },
    'footer.links': { text: '新链接', href: '#', external: false },
    'team.root': '新指导', 'team.leads': '新职务', 'team.staff': '干事',
    'announce.items': { date: '2026-09', tag: '通知', title: '新通知标题', href: '#' },
    'facts.profile': { label: '新字段', value: '字段值' },
    'facts.stats': { num: '0', suffix: '', label: '新指标' }
  };

  function inp(path, val, type) {
    const v = val == null ? '' : val;
    if (type === 'textarea') return `<textarea class="fld" data-path="${path}" rows="3">${escText(v)}</textarea>`;
    return `<input class="fld" data-path="${path}" type="${type || 'text'}" value="${escAttr(v)}" />`;
  }
  function field(label, control) {
    return `<label class="field2"><span>${label}</span>${control}</label>`;
  }
  function renderList(listPath) {
    const arr = getPath(state, listPath) || [];
    const sample = arr.length ? arr[0] : (TEMPLATES[listPath] !== undefined ? TEMPLATES[listPath] : '');
    const isStr = typeof sample === 'string';
    const rows = arr.map((it, i) => {
      if (isStr) {
        return `<div class="list__item"><input class="fld" data-path="${listPath}.${i}" type="text" value="${escAttr(it)}" /><button class="list__del" data-action="remove" data-list="${listPath}" data-index="${i}">✕</button></div>`;
      }
      const keys = Object.keys(sample);
      const fields = keys.map((k) => {
        const v = it[k];
        if (k === 'external') return `<label class="chk"><input type="checkbox" data-path="${listPath}.${i}.${k}" ${v ? 'checked' : ''}/> 外链新窗口</label>`;
        if (typeof v === 'string' && v.length > 18) return field(k, `<textarea class="fld" data-path="${listPath}.${i}.${k}" rows="2">${escText(v)}</textarea>`);
        return field(k, `<input class="fld" data-path="${listPath}.${i}.${k}" type="text" value="${escAttr(v)}" />`);
      }).join('');
      return `<div class="list__item list__item--obj">${fields}<button class="list__del" data-action="remove" data-list="${listPath}" data-index="${i}">✕</button></div>`;
    }).join('');
    return `<div class="list">${rows}<button class="list__add" data-action="add" data-list="${listPath}">＋ 添加一项</button></div>`;
  }

  /* ---------- 各板块表单 ---------- */
  function ctxHint(section, desc) {
    return `<p class="ctx-hint">${escText(desc || '')}</p>`;
  }
  function renderBasic() {
    return `<h2 class="pt">基础设置</h2>${ctxHint('basic','首页主视觉、部门简介、联系我们、页脚等全站基础信息。')}
      <div class="card2">
        <h3>Hero 主视觉</h3>
        ${field('眉标', inp('hero.eyebrow', state.hero.eyebrow))}
        ${field('主标题', inp('hero.title', state.hero.title))}
        ${field('副标题', `<textarea class="fld" data-path="hero.subtitle" rows="3">${escText(state.hero.subtitle)}</textarea>`)}
        ${field('主按钮文字', inp('hero.primaryBtn.text', state.hero.primaryBtn.text))}
        ${field('主按钮链接', inp('hero.primaryBtn.href', state.hero.primaryBtn.href))}
        ${field('次按钮文字', inp('hero.ghostBtn.text', state.hero.ghostBtn.text))}
        ${field('次按钮链接', inp('hero.ghostBtn.href', state.hero.ghostBtn.href))}
        <h4>统计数字</h4>${renderList('hero.stats')}
      </div>
      <div class="card2">
        <h3>部门简介</h3>
        ${field('眉标', inp('about.kicker', state.about.kicker))}
        ${field('标题', inp('about.title', state.about.title))}
        <h4>段落</h4>${renderList('about.paragraphs')}
        <h4>要点</h4>${renderList('about.points')}
      </div>
      <div class="card2">
        <h3>联系我们</h3>
        ${field('眉标', inp('contact.kicker', state.contact.kicker))}
        ${field('标题', inp('contact.title', state.contact.title))}
        ${field('描述', `<textarea class="fld" data-path="contact.desc" rows="2">${escText(state.contact.desc)}</textarea>`)}
        <h4>联系信息行</h4>${renderList('contact.rows')}
      </div>
      <div class="card2">
        <h3>页脚</h3>
        ${field('品牌名', inp('footer.brand', state.footer.brand))}
        ${field('标语', inp('footer.slogan', state.footer.slogan))}
        ${field('参考信息', inp('footer.reference', state.footer.reference))}
        <h4>页脚链接</h4>${renderList('footer.links')}
      </div>`;
  }
  function renderDuties() {
    return `<h2 class="pt">工作职责</h2>${ctxHint('duties','围绕党建与团建，组织建设部的六大核心职能。')}
      <div class="card2">
        ${field('眉标', inp('duties.kicker', state.duties.kicker))}
        ${field('标题', inp('duties.title', state.duties.title))}
        ${field('描述', `<textarea class="fld" data-path="duties.desc" rows="2">${escText(state.duties.desc)}</textarea>`)}
        <h4>职能列表</h4>${renderList('duties.items')}
      </div>`;
  }
  function renderActivities() {
    return `<h2 class="pt">特色活动</h2>${ctxHint('activities','以音乐为底色的党团活动，展示组织力。')}
      <div class="card2">
        ${field('眉标', inp('activities.kicker', state.activities.kicker))}
        ${field('标题', inp('activities.title', state.activities.title))}
        ${field('描述', `<textarea class="fld" data-path="activities.desc" rows="2">${escText(state.activities.desc)}</textarea>`)}
        <h4>活动列表</h4>${renderList('activities.items')}
      </div>`;
  }
  function renderTeam() {
    return `<h2 class="pt">组织架构</h2>${ctxHint('team','指导老师、负责人与干事构成。')}
      <div class="card2">
        ${field('眉标', inp('team.kicker', state.team.kicker))}
        ${field('标题', inp('team.title', state.team.title))}
        ${field('描述', `<textarea class="fld" data-path="team.desc" rows="2">${escText(state.team.desc)}</textarea>`)}
        <h4>指导老师</h4>${renderList('team.root')}
        <h4>负责人</h4>${renderList('team.leads')}
        <h4>干事</h4>${renderList('team.staff')}
        ${field('备注', `<textarea class="fld" data-path="team.note" rows="2">${escText(state.team.note)}</textarea>`)}
      </div>`;
  }
  function renderFacts() {
    return `<h2 class="pt">学院名片</h2>${ctxHint('facts','学院公开信息（数据来源请在备注中注明）。')}
      <div class="card2">
        ${field('眉标', inp('facts.kicker', state.facts.kicker))}
        ${field('标题', inp('facts.title', state.facts.title))}
        ${field('描述', `<textarea class="fld" data-path="facts.desc" rows="2">${escText(state.facts.desc)}</textarea>`)}
        <h4>概况字段</h4>${renderList('facts.profile')}
        <h4>统计数字</h4>${renderList('facts.stats')}
        ${field('备注', `<textarea class="fld" data-path="facts.note" rows="2">${escText(state.facts.note)}</textarea>`)}
      </div>`;
  }
  function renderAnnounceAdmin() {
    const c = state.announce || (state.announce = { kicker: '', title: '', desc: '', items: [] });
    return `<h2 class="pt">通知公告 · 内容管理</h2>${ctxHint('announce','最新通知列表，来访者可在首页「最新通知」看到；新增一条即发布。')}
      <div class="card2">
        ${field('眉标', inp('announce.kicker', c.kicker))}
        ${field('标题', inp('announce.title', c.title))}
        ${field('描述', `<textarea class="fld" data-path="announce.desc" rows="2">${escText(c.desc)}</textarea>`)}
      </div>
      <div class="card2">
        <h3>通知列表</h3>
        ${renderList('announce.items')}
      </div>`;
  }

  /* ---------- 单页（关于本站 / 隐私政策）编辑器 ---------- */
  const BLOCK_TYPES = { h2: '标题', p: '段落', ul: '列表', log: '时间轴(更新日志)' };
  function normalizeBlock(b, t) {
    if (t === 'h2' || t === 'p') return { t, text: (b && b.text) || '' };
    if (t === 'ul') return { t, items: b && Array.isArray(b.items) ? b.items : [] };
    if (t === 'log') return { t, items: b && Array.isArray(b.items) ? b.items : [] };
    return { t: 'p', text: '' };
  }
  function renderBlocks(pageKey) {
    const blocks = getPath(state, pageKey + '.blocks') || [];
    const rows = blocks.map((b, i) => {
      const tp = b.t || 'p';
      let fields = '';
      if (tp === 'h2' || tp === 'p') {
        fields = field(tp === 'p' ? '段落内容' : '标题文字',
          tp === 'p'
            ? `<textarea class="fld" data-path="${pageKey}.blocks.${i}.text" rows="3">${escText(b.text)}</textarea>`
            : `<input class="fld" data-path="${pageKey}.blocks.${i}.text" value="${escAttr(b.text)}" />`);
      } else if (tp === 'ul') {
        const raw = (b.items || []).join('\n');
        fields = field('列表项（每行一项）', `<textarea class="fld" data-ul-path="${pageKey}.blocks.${i}.items" rows="5">${escText(raw)}</textarea>`);
      } else if (tp === 'log') {
        const log = b.items || [];
        fields = '<div class="logedit">' + log.map((e, j) => `<div class="logedit__row">
          <input class="fld" data-path="${pageKey}.blocks.${i}.items.${j}.date" value="${escAttr(e.date)}" placeholder="日期" />
          <input class="fld" data-tags-path="${pageKey}.blocks.${i}.items.${j}.tags" value="${escAttr((e.tags || []).join(','))}" placeholder="标签(逗号分隔)" />
          <textarea class="fld" data-path="${pageKey}.blocks.${i}.items.${j}.what" rows="2">${escText(e.what)}</textarea>
          <button class="list__del" data-log-del="${pageKey}.blocks.${i}.items" data-index="${j}">✕</button>
        </div>`).join('') + `<button class="list__add" data-log-add="${pageKey}.blocks.${i}.items">＋ 添加一条</button></div>`;
      }
      return `<div class="blked">
        <div class="blked__top">
          <select class="fld" data-block-type="${pageKey}.blocks.${i}">
            ${Object.keys(BLOCK_TYPES).map((k) => `<option value="${k}" ${k === tp ? 'selected' : ''}>${BLOCK_TYPES[k]}</option>`).join('')}
          </select>
          <button class="list__del" data-block-del="${pageKey}.blocks" data-index="${i}">✕ 删除块</button>
        </div>
        ${fields}
      </div>`;
    }).join('');
    const selId = pageKey + '-newtype';
    return `<div class="blked__list">${rows}</div>
      <div class="blked__addbar">
        <select class="fld" id="${selId}">
          ${Object.keys(BLOCK_TYPES).map((k) => `<option value="${k}">${BLOCK_TYPES[k]}</option>`).join('')}
        </select>
        <button class="list__add" data-block-add="${pageKey}.blocks">＋ 添加区块</button>
      </div>`;
  }
  function ensurePages() {
    if (!state.pages) state.pages = {};
    if (!state.pages.about) state.pages.about = { title: '关于本站', lead: '', blocks: [] };
    if (!state.pages.privacy) state.pages.privacy = { title: '隐私政策', updated: '', blocks: [] };
  }
  function renderPages() {
    ensurePages();
    const about = state.pages.about;
    const privacy = state.pages.privacy;
    return `<h2 class="pt">单页内容</h2>${ctxHint('pages','关于本站（about.html）与隐私政策（privacy.html）正文。')}
      <div class="card2">
        <h3>关于本站（about.html）</h3>
        ${field('页面标题', inp('pages.about.title', about.title))}
        ${field('引言', `<textarea class="fld" data-path="pages.about.lead" rows="2">${escText(about.lead)}</textarea>`)}
        <h4>内容区块</h4>${renderBlocks('pages.about')}
      </div>
      <div class="card2">
        <h3>隐私政策（privacy.html）</h3>
        ${field('页面标题', inp('pages.privacy.title', privacy.title))}
        ${field('更新时间', inp('pages.privacy.updated', privacy.updated))}
        <h4>内容区块</h4>${renderBlocks('pages.privacy')}
      </div>`;
  }

  function artFormHTML(a) {
    if (!a) return '';
    return `<div class="card2" id="artForm">
      <h3>${a.id ? '编辑' : '新建'}内容</h3>
      ${field('标题', `<input class="fld" id="af_title" value="${escAttr(a.title)}" />`)}
      ${field('日期', `<input class="fld" id="af_date" type="date" value="${escAttr(a.date)}" />`)}
      ${field('分类', `<select class="fld" id="af_cat">
        <option value="news" ${a.category === 'news' ? 'selected' : ''}>新闻</option>
        <option value="notice" ${a.category === 'notice' ? 'selected' : ''}>通知</option>
        <option value="publicity" ${a.category === 'publicity' ? 'selected' : ''}>公示</option>
      </select>`)}
      ${field('封面图（URL 或上传）', `<input class="fld" id="af_cover" value="${escAttr(a.cover)}" placeholder="https://... 或直接上传" /><input type="file" id="af_file" accept="image/*" />`)}
      ${field('正文（支持加粗 / 列表 / 引用 / 插入图片）', `<div id="af_body" class="af-body"></div>`)}
      <div class="art__btns"><button class="btn btn--primary btn--sm" id="af_save">保存内容</button><button class="btn btn--ghost btn--sm" id="af_cancel">取消</button></div>
    </div>`;
  }
  function renderArticles(section) {
    const c = state[section];
    const items = c.items || [];
    const rows = items.length
      ? items.map((a, i) => `<div class="art__row"><div class="art__row-l"><span class="post-card__tag post-card__tag--${a.category}">${catLabel(a.category)}</span><b>${escText(a.title)}</b><span class="muted">${escText(a.date)}</span></div><div class="art__row-r"><button class="lnk" data-edit="${i}">编辑</button><button class="lnk lnk--danger" data-del="${i}">删除</button></div></div>`).join('')
      : '<p class="muted">暂无内容，点击“发布新内容”。</p>';
    return `<h2 class="pt">${escText(c.title)} · 内容管理</h2>${ctxHint(section,'发布党建 / 团建动态，支持封面与富文本正文；首页对应栏目会同步展示。')}
      <div class="card2">
        ${field('眉标', inp(section + '.kicker', c.kicker))}
        ${field('标题', inp(section + '.title', c.title))}
        ${field('描述', `<textarea class="fld" data-path="${section}.desc" rows="2">${escText(c.desc)}</textarea>`)}
      </div>
      <div class="card2">
        <div class="art__head"><h3>文章列表</h3><button class="list__add" id="newArt">＋ 发布新内容</button></div>
        <div class="art__list">${rows}</div>
      </div>
      ${artFormHTML(editingArticle)}`;
  }

  /* ---------- 留言管理 ---------- */
  function fmtTime(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return escText(s);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function renderMessages() {
    return `<h2 class="pt">留言管理</h2>${ctxHint('messages','访客留言的备份，可查看与删除。')}
      <div class="card2">
        <div class="art__head">
          <h3>访客留言 <span class="muted" id="msgCount"></span></h3>
          <button class="list__add" id="msgRefresh">↻ 刷新</button>
        </div>
        <p class="muted" style="margin:0 0 14px">留言同时通过邮件发送到部门邮箱，此处为后台备份，可查看与删除。</p>
        <div class="msg__list" id="msgList"><p class="muted">加载中…</p></div>
      </div>`;
  }
  function renderHistory() {
    return `<h2 class="pt">历史版本</h2>${ctxHint('history','每次保存 / 发布自动记录快照，可随时回滚。')}
      <div class="card2">
        <p class="muted" style="margin:0 0 12px">每次「保存草稿 / 发布」都会自动记录一份内容快照，可随时回滚到任意历史版本。</p>
        <div class="art__head"><h3>历史快照</h3><button class="list__add" id="histRefresh">↻ 刷新</button></div>
        <div id="histList"><p class="muted">加载中…</p></div>
      </div>`;
  }
  async function loadHistoryList() {
    const box = document.getElementById('histList');
    if (!box) return;
    box.innerHTML = '<p class="muted">加载中…</p>';
    try {
      const items = await window.SiteStore.getHistory();
      if (!items.length) { box.innerHTML = '<p class="muted">暂无历史记录。</p>'; return; }
      box.innerHTML = items.map((h) => `<div class="hist__row">
        <span class="hist__time">${fmtTime(h.created_at)}</span>
        <span class="hist__note">${escText(h.note || 'auto')}</span>
        <button class="lnk" data-hist-rollback="${escAttr(h.id)}">回滚到此版本</button>
      </div>`).join('');
    } catch (e) {
      box.innerHTML = '<p class="muted">读取失败：' + escText(e.message || e) + '</p>';
    }
  }
  function renderSop() {
    return `<h2 class="pt">内容审核说明（SOP）</h2>${ctxHint('sop','发布规范与状态说明，供编辑参考。')}
      <div class="card2">
        <h3>发布流程：撰稿 → 审核 → 发布</h3>
        <ol class="sop">
          <li><b>撰稿</b>：由组织建设部成员或指导教师起草内容，确保真实、积极、符合党团工作要求。</li>
          <li><b>审核</b>：发布前须经部门负责人或指导教师审核，重点核对政治表述、事实与措辞。</li>
          <li><b>发布</b>：审核通过后由管理员「发布上线」；重大内容报学院审批。</li>
          <li><b>留痕</b>：每次变更自动记录历史版本，可随时回滚核查。</li>
        </ol>
        <h3>状态说明</h3>
        <ul class="sop">
          <li><b>草稿（draft）</b>：编辑中，未对外可见，可反复修改。</li>
          <li><b>待审核（pending）</b>：已提交审核，等待负责人确认。</li>
          <li><b>已发布（published）</b>：对外可见，访客可浏览。</li>
        </ul>
        <p class="muted">日常微调用「保存草稿」；定稿后点「发布上线」。重要修改建议先提交审核，由第二人确认后再发布。</p>
      </div>`;
  }
  async function loadMessagesList() {
    const box = document.getElementById('msgList');
    const cnt = document.getElementById('msgCount');
    if (!box) return;
    box.innerHTML = '<p class="muted">加载中…</p>';
    const res = await window.SiteStore.loadMessages();
    const items = (res && res.items) || [];
    if (cnt) cnt.textContent = '· 共 ' + items.length + ' 条';
    if (!res.ok) {
      const e = String(res.error || '');
      const missing = /messages|42P01|404|does not exist/i.test(e);
      box.innerHTML = missing
        ? '<p class="muted">留言表尚未创建。请到 Supabase → SQL Editor 执行 <b>supabase-messages.sql</b> 后点“↻ 刷新”。</p>'
        : '<p class="muted">读取失败：' + escText(res.error || '未知错误') + '</p>';
      return;
    }
    if (!items.length) {
      box.innerHTML = '<p class="muted">暂无留言。</p>';
      return;
    }
    box.innerHTML = items.map((m) => `<div class="msg__item">
      <div class="msg__head">
        <b>${escText(m.name || '匿名')}</b>
        ${m.contact ? `<span class="msg__contact">${escText(m.contact)}</span>` : ''}
        <span class="msg__time">${fmtTime(m.created_at)}</span>
        <button class="lnk lnk--danger msg__del" data-msg-del="${escAttr(m.id)}">删除</button>
      </div>
      <p class="msg__body">${escText(m.body || '')}</p>
    </div>`).join('');
  }

  const TABS = {
    basic: renderBasic,
    duties: renderDuties,
    team: renderTeam,
    activities: renderActivities,
    facts: renderFacts,
    party: () => renderArticles('party'),
    league: () => renderArticles('league'),
    announce: renderAnnounceAdmin,
    pages: renderPages,
    history: renderHistory,
    sop: renderSop,
    messages: renderMessages
  };

  function renderTab(name) {
    current = name;
    document.getElementById('panel').innerHTML = (TABS[name] || renderBasic)();
    if (name === 'messages') loadMessagesList();
    if (name === 'history') loadHistoryList();
    if (name === 'pages' || name === 'party' || name === 'league') setTimeout(initQuills, 0);
    updateCtx();
  }

  /* ---------- 富文本编辑器（Quill） ---------- */
  function imageHandler() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.click();
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file || !quillBody) return;
      const range = quillBody.getSelection(true);
      window.SiteStore.uploadImage(file)
        .then((url) => { quillBody.insertEmbed(range.index, 'image', url); })
        .catch((e) => window.alert('图片上传失败：' + (e.message || e)));
    };
  }
  function initQuills() {
    if (typeof Quill === 'undefined') return;
    const bodyEl = document.getElementById('af_body');
    quillBody = null;
    if (bodyEl && !bodyEl.__quill) {
      const quill = new Quill(bodyEl, {
        theme: 'snow',
        placeholder: '撰写党建 / 团建文章内容，可插入图片…',
        modules: {
          toolbar: {
            container: [
              [{ header: [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'blockquote'],
              [{ list: 'ordered' }, { list: 'bullet' }],
              ['link', 'image'],
              ['clean']
            ],
            handlers: { image: imageHandler }
          }
        }
      });
      bodyEl.__quill = quill;
      quillBody = quill;
      if (editingArticle && editingArticle.body) {
        quill.clipboard.dangerouslyPasteHTML(editingArticle.body);
      }
    }
  }
  function getBodyHTML() {
    if (quillBody && quillBody.root) {
      try { return quillBody.getSemanticHTML(); } catch (e) { return quillBody.root.innerHTML; }
    }
    const el = document.getElementById('af_body');
    return el ? el.innerHTML : '';
  }

  /* ---------- 事件绑定 ---------- */
  function bindPanel() {
    const panel = document.getElementById('panel');

    function onField(e) {
      const t = e.target;
      if (t.dataset && t.dataset.path) {
        const val = t.type === 'checkbox' ? t.checked : t.value;
        setPath(state, t.dataset.path, val);
        markDirty();
      }
      if (t.dataset && t.dataset.ulPath) {
        const lines = t.value.split('\n').map((s) => s.trim()).filter(Boolean);
        setPath(state, t.dataset.ulPath, lines);
        markDirty();
      }
      if (t.dataset && t.dataset.tagsPath) {
        const arr = t.value.split(',').map((s) => s.trim()).filter(Boolean);
        setPath(state, t.dataset.tagsPath, arr);
        markDirty();
      }
    }

    panel.addEventListener('input', onField);
    panel.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.blockType) {
        const parts = t.dataset.blockType.split('.');
        const i = Number(parts[parts.length - 1]);
        const base = parts.slice(0, parts.length - 1).join('.');
        const arr = getPath(state, base) || [];
        arr[i] = normalizeBlock(arr[i], t.value);
        setPath(state, base, arr);
        markDirty();
        renderTab('pages');
        return;
      }
      onField(e);
    });

    panel.addEventListener('click', (e) => {
      const t = e.target;
      // 列表增删
      if (t.dataset && t.dataset.action === 'add') {
        const list = t.dataset.list;
        const arr = getPath(state, list) || [];
        const tpl = TEMPLATES[list];
        arr.push(tpl !== undefined ? (typeof tpl === 'object' ? JSON.parse(JSON.stringify(tpl)) : tpl) : '');
        setPath(state, list, arr);
        markDirty();
        renderTab(current);
        return;
      }
      if (t.dataset && t.dataset.action === 'remove') {
        const arr = getPath(state, t.dataset.list) || [];
        arr.splice(Number(t.dataset.index), 1);
        setPath(state, list, arr);
        markDirty();
        renderTab(current);
        return;
      }
      // 单页区块
      if (t.dataset && t.dataset.blockAdd) {
        const base = t.dataset.blockAdd;
        const sel = document.getElementById(base.replace(/\.blocks$/, '') + '-newtype');
        const type = (sel && sel.value) || 'p';
        const arr = getPath(state, base) || [];
        arr.push(normalizeBlock({}, type));
        setPath(state, base, arr);
        markDirty();
        renderTab('pages');
        return;
      }
      if (t.dataset && t.dataset.blockDel) {
        const arr = getPath(state, t.dataset.blockDel) || [];
        arr.splice(Number(t.dataset.index), 1);
        setPath(state, t.dataset.blockDel, arr);
        markDirty();
        renderTab('pages');
        return;
      }
      if (t.dataset && t.dataset.logAdd) {
        const arr = getPath(state, t.dataset.logAdd) || [];
        arr.push({ date: '', tags: [], what: '' });
        setPath(state, t.dataset.logAdd, arr);
        markDirty();
        renderTab('pages');
        return;
      }
      if (t.dataset && t.dataset.logDel) {
        const arr = getPath(state, t.dataset.logDel) || [];
        arr.splice(Number(t.dataset.index), 1);
        setPath(state, t.dataset.logDel, arr);
        markDirty();
        renderTab('pages');
        return;
      }
      // 文章操作
      if (t.id === 'newArt') {
        editingArticle = { id: (crypto.randomUUID ? crypto.randomUUID() : 'a' + Date.now()), title: '', date: today(), category: 'news', cover: '', body: '' };
        renderTab(current);
        return;
      }
      if (t.dataset && t.dataset.edit !== undefined) {
        const i = Number(t.dataset.edit);
        editingArticle = JSON.parse(JSON.stringify((state[current].items || [])[i]));
        renderTab(current);
        return;
      }
      if (t.dataset && t.dataset.del !== undefined) {
        const i = Number(t.dataset.del);
        state[current].items.splice(i, 1);
        markDirty();
        renderTab(current);
        return;
      }
      if (t.id === 'af_cancel') { editingArticle = null; renderTab(current); return; }
      if (t.id === 'af_save') {
        const a = editingArticle;
        a.title = document.getElementById('af_title').value;
        a.date = document.getElementById('af_date').value;
        a.category = document.getElementById('af_cat').value;
        a.cover = document.getElementById('af_cover').value;
        a.body = getBodyHTML();
        const list = state[current].items || [];
        const idx = list.findIndex((x) => String(x.id) === String(a.id));
        if (idx >= 0) list[idx] = a; else list.push(a);
        state[current].items = list;
        editingArticle = null;
        markDirty();
        renderTab(current);
        return;
      }
      if (t.id === 'af_file') {
        const f = t.files && t.files[0];
        if (!f) return;
        t.disabled = true;
        (async () => {
          try {
            const url = await window.SiteStore.uploadImage(f);
            const cov = document.getElementById('af_cover');
            if (cov) cov.value = url;
          } catch (e) { window.alert('上传失败：' + (e.message || e)); }
          finally { t.disabled = false; }
        })();
      }
      // 历史版本：刷新 / 回滚
      if (t.id === 'histRefresh') { loadHistoryList(); return; }
      if (t.dataset && t.dataset.histRollback !== undefined) {
        if (!window.confirm('回滚到该历史版本？当前编辑内容将被该版本覆盖并自动发布。')) return;
        t.disabled = true;
        window.SiteStore.rollbackContent(t.dataset.histRollback)
          .then(() => { window.alert('已回滚并发布该版本。'); bootAdmin(); })
          .catch((e) => window.alert('回滚失败：' + (e.message || e)));
        return;
      }
      // 留言：刷新 / 删除
      if (t.id === 'msgRefresh') { loadMessagesList(); return; }
      if (t.dataset && t.dataset.msgDel !== undefined) {
        if (!window.confirm('确定删除这条留言？')) return;
        t.disabled = true;
        window.SiteStore.deleteMessage(t.dataset.msgDel).then(() => loadMessagesList());
        return;
      }
    });
  }

  /* ---------- 保存 / 导出 ---------- */
  // mode: 'draft'（保存草稿） | 'pending'（提交审核） | 'publish'（发布上线）
  async function doSave(mode) {
    const st = document.getElementById('saveState');
    st.textContent = '保存中…';
    try {
      const publish = mode === 'publish';
      const opts = publish ? { publish: true } : { status: mode };
      const res = await window.SiteStore.saveContent(state, opts);
      if (res.ok) {
        dirty = false;
        updateCtx();
        updateStatusBadge();
        if (res.mode === 'local') {
          st.textContent = '✓ 已保存（本地模式）' + (res.note ? ' · ' + res.note : '');
        } else {
          st.textContent = publish ? '已发布上线 ✓' : (mode === 'pending' ? '已提交审核 ✓' : '草稿已保存 ✓');
        }
      } else {
        st.textContent = '保存失败：' + (res.error || '未知错误');
      }
    } catch (e) {
      st.textContent = '保存失败：' + (e.message || e);
    }
    setTimeout(() => { if (st && st.textContent.indexOf('失败') < 0 && st.textContent.indexOf('本地模式') < 0) st.textContent = ''; }, 5000);
  }
  function updateStatusBadge() {
    const el = document.getElementById('statusBadge');
    if (!el) return;
    const s = window.SiteStore.getStatus();
    const map = { draft: ['草稿', 's-draft'], pending: ['待审核', 's-pending'], published: ['已发布', 's-published'] };
    const m = map[s] || map.draft;
    el.textContent = '状态：' + m[0];
    el.className = 'admin__state ' + m[1];
  }
  function doExport() {
    const blob = new Blob(['window.SITE_CONTENT = ' + JSON.stringify(state, null, 2) + ';\n'], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'content.js';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- 会话检查（无会话则跳转登录页） ---------- */
  async function checkSession() {
    // 优先：服务端会话（需 Node 服务运行）
    if (API) {
      try {
        const res = await fetch(apiUrl('/api/admin/me'), { credentials: 'include' });
        if (res.ok) { bootAdmin(); return; }
      } catch (e) {}
    }
    // 其次：本地会话（由 login.html 写入 localStorage）
    try {
      const s = JSON.parse(localStorage.getItem('site_admin_session') || 'null');
      if (s && s.ok && s.ts > Date.now() - 86400000) { bootAdmin(); return; }
    } catch (e) {}
    // 都没有 → 回到登录页
    location.replace('login.html');
  }

  async function bootAdmin() {
    const admin = document.getElementById('admin');
    if (admin) admin.hidden = false;
    const mode = document.getElementById('modeNote');
    if (mode) mode.textContent = API ? '🔒 服务端模式' : '🔒 本地模式（静态托管）';
    state = await window.SiteStore.loadContent();
    editingArticle = null;
    dirty = false;
    renderTab('basic');
    bindPanel();
    document.getElementById('adminNav').addEventListener('click', (e) => {
      const b = e.target.closest('.admin__tab');
      if (!b) return;
      document.querySelectorAll('.admin__tab').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      editingArticle = null;
      renderTab(b.dataset.tab);
    });
    document.getElementById('saveBtn').addEventListener('click', () => doSave('draft'));
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.addEventListener('click', () => doSave('pending'));
    document.getElementById('publishBtn').addEventListener('click', () => doSave('publish'));
    updateStatusBadge();
    document.getElementById('exportBtn').addEventListener('click', doExport);
    document.getElementById('logoutBtn').addEventListener('click', doLogout);
    document.getElementById('pwdBtn').addEventListener('click', async () => {
      const oldP = window.prompt('请输入当前密码：');
      if (!oldP) return;
      const newP = window.prompt('设置新密码（至少 6 位）：');
      if (!newP) return;
      try {
        const res = await fetch(apiUrl('/api/admin/password'), {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword: oldP, newPassword: newP })
        });
        const r = await res.json().catch(() => ({}));
        if (res.ok) window.alert('密码已修改，下次登录请使用新密码。');
        else window.alert('修改失败：' + (r.error || '未知错误'));
      } catch (e) { window.alert('连接服务端失败：' + (e.message || e)); }
    });
  }

  async function doLogout() {
    try { await fetch(apiUrl('/api/admin/logout'), { method: 'POST', credentials: 'include' }); } catch (e) {}
    localStorage.removeItem('site_admin_session');
    location.replace('login.html');
  }

  /* ---------- 启动 ---------- */
  checkSession();
})();
