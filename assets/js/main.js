/* ===== 黄淮学院音乐学院 · 组织建设部 主脚本（数据驱动渲染 + 全站动画） ===== */
(function () {
  'use strict';

  /* ---------- 错误监控（轻量：捕获并上报到控制台，便于线上排错） ---------- */
  (function errorMonitor() {
    try {
      window.addEventListener('error', (e) => {
        console.error('[site-error]', e.message, e.filename + ':' + e.lineno);
      });
      window.addEventListener('unhandledrejection', (e) => {
        console.error('[site-reject]', e.reason && (e.reason.message || e.reason));
      });
    } catch (_) {}
  })();

  const nav = document.getElementById('nav');
  const navLinks = document.getElementById('navLinks');
  const navToggle = document.getElementById('navToggle');
  const progressBar = document.getElementById('progressBar');
  const toTop = document.getElementById('toTop');
  const modal = document.getElementById('modal');
  const modalPanel = document.getElementById('modalPanel');
  const heroContent = document.getElementById('heroContent');

  let CONTENT = null;
  let tickingParallax = false;
  let lastFocused = null;

  /* ---------- 工具 ---------- */
  const CAT = { news: '新闻', notice: '通知', publicity: '公示' };
  function catLabel(c) { return CAT[c] || '新闻'; }
  function stripTags(s) { return (s || '').replace(/<[^>]*>/g, ''); }
  function excerpt(s, n) {
    const t = stripTags(s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  }
  function nl2br(s) { return (s || '').replace(/\n/g, '<br>'); }
  function head(c) {
    return `<div class="section__head reveal reveal--blur"><span class="kicker">${c.kicker}</span><h2 class="section__title">${c.title}</h2>${c.desc ? `<p class="section__desc">${c.desc}</p>` : ''}</div>`;
  }
  function cardHTML(it, i) {
    return `<article class="card tilt reveal reveal--scale" style="--d:${(i * 0.05).toFixed(2)}s"><div class="card__ico">${it.ico}</div><h3>${it.title}</h3><p>${it.text}</p></article>`;
  }
  function orgHTML(c) {
    return `<div class="org" id="orgChart">
      <div class="org__tier org__tier--root">
        <span class="org__label">指导</span>
        <div class="org__group">${c.root.map(r => `<div class="org__node org__node--root">${r}</div>`).join('')}</div>
      </div>
      <span class="org__connector" style="--i:0"></span>
      <div class="org__tier org__tier--leads">
        <span class="org__label org__label--light">负责人</span>
        <div class="org__group">${c.leads.map(l => `<div class="org__node org__node--lead">${l}</div>`).join('')}</div>
      </div>
      <span class="org__connector" style="--i:1"></span>
      <div class="org__tier org__tier--staff">
        <span class="org__label org__label--light">干事 · ${c.staff.length} 名</span>
        <div class="org__staff">${c.staff.map(s => `<span class="org__node org__node--staff">${s}</span>`).join('')}</div>
      </div>
    </div>`;
  }
  function postCard(a, i, section) {
    const media = a.cover
      ? `<div class="post-card__media" style="background-image:url('${a.cover}')"></div>`
      : `<div class="post-card__media post-card__media--ph">${section === 'party' ? '党' : '团'}</div>`;
    return `<article class="post-card tilt reveal" style="--d:${(i * 0.06).toFixed(2)}s" data-id="${a.id}" data-section="${section}">
      ${media}
      <div class="post-card__body">
        <div class="post-card__meta">
          <span class="post-card__tag post-card__tag--${a.category}">${catLabel(a.category)}</span>
          <time class="post-card__date">${a.date}</time>
        </div>
        <h3 class="post-card__title">${a.title}</h3>
        <p class="post-card__excerpt">${excerpt(a.body, 64)}</p>
        <span class="post-card__more">阅读全文 →</span>
      </div>
    </article>`;
  }
  function renderList(mountId, c, section) {
    const list = (c.items || []);
    let inner;
    if (!list.length) {
      inner = `<p class="empty-note reveal">暂无内容，可在后台发布。</p>`;
    } else {
      const PAGE = 6;
      const shown = list.slice(0, PAGE).map((a, i) => postCard(a, i, section)).join('');
      const rest = list.slice(PAGE);
      const restHTML = rest.length
        ? `<div class="news-list__more" id="${section}-more" hidden>${rest.map((a, i) => postCard(a, PAGE + i, section)).join('')}</div>`
        : '';
      const btn = rest.length
        ? `<div class="news-list__actions reveal"><button class="btn btn--ghost news-list__toggle" data-target="${section}-more" aria-expanded="false">加载更多（${rest.length}）</button></div>`
        : '';
      inner = shown + restHTML + btn;
    }
    document.getElementById(mountId).innerHTML = head(c) + `<div class="news-list" id="${section}-list">${inner}</div>`;
  }

  /* ---------- 通知公告 ---------- */
  function renderAnnounce(c) {
    if (!c) return;
    const list = (c.items || []);
    const inner = list.length
      ? `<ul class="announce">${list.map((a, i) => `
      <li class="announce__item reveal" style="--d:${(i * 0.05).toFixed(2)}s">
        <time class="announce__date">${a.date}</time>
        <span class="announce__tag">${a.tag}</span>
        <a class="announce__title" href="${a.href || '#'}">${a.title}</a>
      </li>`).join('')}</ul>`
      : `<p class="empty-note reveal">暂无通知，敬请期待；可在后台「通知公告」中发布。</p>`;
    document.getElementById('announce-mount').innerHTML = head(c) + inner;
  }

  /* ---------- 站内搜索 ---------- */
  function     buildSearchIndex() {
      const c = CONTENT; const out = [];
      const secs = ['about', 'duties', 'team', 'activities', 'recruit', 'announce', 'party', 'league', 'contact'];
    secs.forEach((s) => { if (c[s] && c[s].title) out.push({ section: s, id: '', cat: (c[s].kicker || '').split(' · ')[0], label: c[s].title, text: (c[s].title + ' ' + (c[s].desc || '')).toLowerCase() }); });
    (c.party.items || []).forEach((a) => out.push({ section: 'party', id: a.id, cat: '党建', label: a.title, text: (a.title + ' ' + stripTags(a.body)).toLowerCase() }));
    (c.league.items || []).forEach((a) => out.push({ section: 'league', id: a.id, cat: '团建', label: a.title, text: (a.title + ' ' + stripTags(a.body)).toLowerCase() }));
    return out;
  }
  function initSearch() {
    const toggle = document.getElementById('searchToggle');
    const box = document.getElementById('search');
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    if (!toggle || !box || !input || !results) return;
    function open() { box.classList.add('open'); box.setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden'; setTimeout(() => input.focus(), 30); }
    function close() { box.classList.remove('open'); box.setAttribute('aria-hidden', 'true'); document.documentElement.style.overflow = ''; input.value = ''; results.innerHTML = '<p class="search__hint">输入关键词，如「入党」「招新」「转接」。</p>'; }
    toggle.addEventListener('click', open);
    box.querySelector('[data-search-close]').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.classList.contains('open')) close(); });
    results.innerHTML = '<p class="search__hint">输入关键词，如「入党」「招新」「转接」。</p>';
    const idx = buildSearchIndex();
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { results.innerHTML = '<p class="search__hint">输入关键词，如「入党」「招新」「转接」。</p>'; return; }
      const hits = idx.filter((it) => it.text.indexOf(q) >= 0).slice(0, 12);
      if (!hits.length) { results.innerHTML = '<p class="search__hint">没有找到相关内容，换个词试试。</p>'; return; }
      results.innerHTML = hits.map((h) => `<button class="search__result" data-section="${h.section}" data-id="${h.id || ''}"><span class="search__cat">${h.cat}</span><span class="search__label">${h.label}</span></button>`).join('');
      results.querySelectorAll('.search__result').forEach((btn) => btn.addEventListener('click', () => {
        close();
        const sec = btn.dataset.section;
        const id = btn.dataset.id;
        if (id) { setTimeout(() => openModal(sec, id), 60); }
        else { const t = document.querySelector('#' + sec); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 56, behavior: 'smooth' }); }
      }));
    });
  }

  /* ---------- 列表“加载更多” ---------- */
  function initListToggle() {
    document.querySelectorAll('.news-list__toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const more = document.getElementById(btn.dataset.target);
        if (!more) return;
        const willShow = more.hidden;
        more.hidden = !willShow;
        btn.setAttribute('aria-expanded', String(willShow));
        btn.textContent = willShow ? '收起' : '加载更多';
        if (willShow) more.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
      });
    });
  }

  /* ---------- 骨架屏（内容拉取前占位） ---------- */
  const SECTION_LABEL = { party: '党建工作', league: '团建工作', activities: '特色活动', team: '组织架构', duties: '工作职责', about: '部门简介', announce: '通知公告', honors: '荣誉风采', recruit: '招新专区' };
  function showSkeletons() {
    if (heroContent) heroContent.innerHTML = `<div class="sk sk-hero" aria-hidden="true"></div>`;
    const map = {
      about: 3, duties: 6, team: 3, activities: 6, recruit: 3, announce: 4, party: 4, league: 4, honors: 4, facts: 5, contact: 3
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id + '-mount');
      if (!el) return;
      const cards = Array.from({ length: map[id] }).map(() => `<div class="sk sk-card"></div>`).join('');
      el.innerHTML = `<div class="sk-block" aria-hidden="true"><div class="sk sk-title"></div><div class="sk-grid">${cards}</div></div>`;
    });
  }

  /* ---------- 渲染 ---------- */
  function renderAll(c) {
    heroContent.innerHTML = `
      <p class="hero__eyebrow reveal">${c.hero.eyebrow}</p>
      <h1 class="hero__title"><span class="reveal hero__title-accent" style="--d:.05s">${c.hero.title}</span></h1>
      <p class="hero__subtitle reveal reveal--blur" style="--d:.3s">${c.hero.subtitle}</p>
      <div class="hero__actions reveal" style="--d:.45s">
        <a class="btn btn--primary" href="${c.hero.primaryBtn.href}">${c.hero.primaryBtn.text}</a>
        <a class="btn btn--ghost" href="${c.hero.ghostBtn.href}">${c.hero.ghostBtn.text}</a>
      </div>
      <div class="hero__stats reveal" style="--d:.6s">
        ${c.hero.stats.map(s => `<div class="hero__stat"><b class="stat__num" data-target="${s.num}">0</b><span>${s.label}</span></div>`).join('')}
      </div>`;

    document.getElementById('about-mount').innerHTML = head(c.about) + `<div class="about">
      <div class="about__lead reveal reveal--left">
        ${c.about.lead ? `<p class="about__lead-quote">${c.about.lead}</p>` : ''}
        ${c.about.paragraphs.map(p => `<p>${p}</p>`).join('')}
      </div>
      <ul class="about__points">${c.about.points.map((p, i) => `<li class="reveal reveal--right" style="--d:${(i * 0.09).toFixed(2)}s"><span class="about__point-ico">${p.ico}</span><div><b>${p.title}</b><p>${p.text}</p></div></li>`).join('')}</ul>
    </div>`;

    document.getElementById('duties-mount').innerHTML = head(c.duties) + `<div class="grid grid--3">${c.duties.items.map((it, i) => cardHTML(it, i)).join('')}</div>`;

    document.getElementById('team-mount').innerHTML = head(c.team) + orgHTML(c.team) + `<p class="note reveal">${c.team.note}</p>`;

    document.getElementById('activities-mount').innerHTML = head(c.activities) + `<div class="grid grid--3">${c.activities.items.map((it, i) => `<article class="activity tilt reveal reveal--scale" style="--d:${(i * 0.05).toFixed(2)}s"><div class="activity__media activity__media--${(i % 6) + 1}"><span>${it.ico}</span></div><div class="activity__body"><h3>${it.title}</h3><p>${it.text}</p></div></article>`).join('')}</div>`;

    const profileHTML = (c.facts.profile && c.facts.profile.length)
      ? `<div class="profile-grid reveal">${c.facts.profile.map(p => `<div class="profile-item"><span class="profile-item__label">${p.label}</span><span class="profile-item__value">${p.value}</span></div>`).join('')}</div>`
      : '';
    document.getElementById('facts-mount').innerHTML = head(c.facts) + `<div class="stats" id="stats">${c.facts.stats.map((s, i) => `<div class="stat reveal" style="--d:${(i * 0.08).toFixed(2)}s"><b class="stat__num" data-target="${s.num}" data-suffix="${s.suffix || ''}">0</b><span class="stat__label">${s.label}</span></div>`).join('')}</div>${profileHTML}<p class="note reveal">${c.facts.note}</p>`;

    renderList('party-mount', c.party, 'party');
    renderList('league-mount', c.league, 'league');
    renderAnnounce(c.announce);
    if (c.recruit) {
      const r = c.recruit;
      document.getElementById('recruit-mount').innerHTML = head(r) + `<div class="recruit">
        <div class="grid grid--3">${r.positions.map((p, i) => `<article class="card tilt reveal reveal--scale" style="--d:${(i * 0.05).toFixed(2)}s"><div class="card__ico">${p.ico}</div><h3>${p.title}</h3><p>${p.text}</p></article>`).join('')}</div>
        <h3 class="recruit__subtitle reveal">招新时间线</h3>
        <ol class="timeline">${r.timeline.map((t, i) => `<li class="timeline__item reveal" style="--d:${(i * 0.06).toFixed(2)}s"><span class="timeline__date">${t.date}</span><span class="timeline__text">${t.text}</span></li>`).join('')}</ol>
        <div class="recruit__apply reveal reveal--blur">
          <p>${r.apply.text}</p>
          ${r.apply.cta ? `<a class="btn btn--primary" href="${r.apply.cta.href}">${r.apply.cta.text}</a>` : ''}
        </div>
      </div>`;
    }
    document.getElementById('contact-mount').innerHTML = head(c.contact) + `<div class="contact">
      <div class="contact__info">${c.contact.rows.map((r, i) => `<div class="contact__row reveal reveal--left" style="--d:${(i * 0.06).toFixed(2)}s"><span class="contact__ico">${r.ico}</span><div><b>${r.title}</b><p>${r.link ? `<a href="${r.link}">${r.text}</a>` : r.text}</p></div></div>`).join('')}</div>
    </div>`;

    document.getElementById('footer-mount').innerHTML = `<div class="footer__inner reveal">
      <div class="footer__brand"><span class="footer__logo">🎼</span><div><b>${c.footer.brand}</b><p>${c.footer.slogan}</p></div></div>
      <nav class="footer__links">${c.footer.links.map(l => `<a href="${l.href}" ${l.external ? 'target="_blank" rel="noopener"' : ''}>${l.text}</a>`).join('')}</nav>
    </div>    <div class="footer__bar reveal" style="--d:.1s">
      <span>© 2026 ${c.footer.brand}</span>
      <span>${c.footer.reference}</span>
    </div>`;
  }

  /* ---------- 动画：滚动揭示（每次进入视口都重新触发） ---------- */
  function initReveal() {
    let els = Array.from(document.querySelectorAll('.reveal'));
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
        } else {
          // 离开视口后移除 .in，下次滚回来重新播放动画
          entry.target.classList.remove('in');
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
    els.forEach(el => io.observe(el));

    // 兜底：对已进入视口的元素强制点亮（防止快速滚动时漏触发）
    let ticking = false;
    function guard() {
      ticking = false;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.90 && r.bottom > 0 && !el.classList.contains('in')) {
          el.classList.add('in');
        }
      });
    }
    function onGuard() { if (!ticking) { ticking = true; requestAnimationFrame(guard); } }
    window.addEventListener('scroll', onGuard, { passive: true });
    window.addEventListener('resize', onGuard);
    guard();
  }

  /* ---------- 动画：板块进入视口时点亮缝合线/色晕（每次滚动都重新触发） ---------- */
  function initSectionActive() {
    const secs = document.querySelectorAll('.section, .facts');
    if (!('IntersectionObserver' in window)) { secs.forEach(s => s.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
        } else {
          entry.target.classList.remove('in');
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -12% 0px' });
    secs.forEach(s => io.observe(s));
  }

  /* ---------- 动画：数字计数 ---------- */
  function initCounters() {
    const nums = document.querySelectorAll('.stat__num');
    function animateNum(el) {
      const target = parseFloat(el.dataset.target || '0');
      const suffix = el.dataset.suffix || '';
      const dur = 1400, start = performance.now();
      function tick(now) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.floor(eased * target) + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target + suffix;
      }
      requestAnimationFrame(tick);
    }
    if (!('IntersectionObserver' in window)) { nums.forEach(n => { n.textContent = (n.dataset.target || '0') + (n.dataset.suffix || ''); }); return; }
    const numIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { animateNum(entry.target); numIO.unobserve(entry.target); } });
    }, { threshold: 0.6 });
    nums.forEach(n => numIO.observe(n));
  }

  /* ---------- 金色粒子（移动端安全：仅 transform/opacity，尊重 reduced-motion） ---------- */
  function initParticles() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const count = window.matchMedia('(max-width:760px)').matches ? 4 : 8;
    const layer = document.createElement('div');
    layer.className = 'gold-particle-layer';
    layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1';
    hero.appendChild(layer);
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'gold-particle';
      const size = 4 + Math.random() * 8;
      p.style.width = p.style.height = size + 'px';
      p.style.left = (Math.random() * 100) + '%';
      p.style.bottom = (Math.random() * 40) + '%';
      p.style.animationDuration = (5 + Math.random() * 5) + 's';
      p.style.animationDelay = (Math.random() * 5) + 's';
      layer.appendChild(p);
    }
  }

  /* ---------- 首屏文艺字：散落在四周的大字水印（衬线、低透明蓝调、飘浮） ---------- */
  function initArtWords() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const layer = document.createElement('div');
    layer.className = 'hero__artwords';
    layer.setAttribute('aria-hidden', 'true');
    // 四散分布的坐标（百分比 left/top），刻意不居中、不整齐，营造"散落"感
    const words = [
      { t: '音', s: 92, x: 8,  y: 14, o: .20, r: -8 },
      { t: '乐', s: 68, x: 80, y: 10, o: .17, r: 6 },
      { t: '学', s: 120, x: 70, y: 70, o: .19, r: -5 },
      { t: '院', s: 60, x: 14, y: 78, o: .16, r: 7 },
      { t: '组', s: 54, x: 46, y: 6,  o: .15, r: -4 },
      { t: '织', s: 78, x: 90, y: 56, o: .17, r: 5 },
      { t: '建', s: 50, x: 4,  y: 48, o: .15, r: 8 },
      { t: '设', s: 64, x: 60, y: 40, o: .14, r: -6 }
    ];
    const mobile = window.matchMedia('(max-width:760px)').matches;
    words.forEach((w, i) => {
      const el = document.createElement('span');
      el.className = 'hero__artword';
      el.textContent = w.t;
      const scale = mobile ? .62 : 1;
      el.style.left = w.x + '%';
      el.style.top = w.y + '%';
      el.style.fontSize = (w.s * scale) + 'px';
      el.style.opacity = w.o;
      el.style.setProperty('--rot', w.r + 'deg');
      el.style.animationDelay = (-i * 1.3) + 's';
      layer.appendChild(el);
    });
    hero.insertBefore(layer, hero.firstChild);
  }

  /* ---------- 动画：组织架构连接线生长 + 节点弹入 ---------- */
  function initOrg() {
    const org = document.getElementById('orgChart');
    if (!org) return;
    if (!('IntersectionObserver' in window)) { org.classList.add('drawn'); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('drawn'); io.unobserve(entry.target); } });
    }, { threshold: 0.2 });
    io.observe(org);
  }

  /* ---------- 动画：卡片 3D 倾斜 + 光斑跟随 ---------- */
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function initTilt() {
    if (reduceMotion || !finePointer) return;
    const els = document.querySelectorAll('.tilt');
    els.forEach((el) => {
      let raf = null, tx = 0, ty = 0;
      function onMove(e) {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        tx = (py - 0.5) * -8;   // rotateX
        ty = (px - 0.5) * 8;    // rotateY
        el.style.setProperty('--mx', (px * 100) + '%');
        el.style.setProperty('--my', (py * 100) + '%');
        if (!raf) raf = requestAnimationFrame(apply);
      }
      function apply() {
        raf = null;
        el.style.transform = `perspective(900px) rotateX(${tx.toFixed(2)}deg) rotateY(${ty.toFixed(2)}deg) translateY(-6px)`;
      }
      el.addEventListener('mouseenter', () => el.classList.add('tilting'));
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', () => {
        el.classList.remove('tilting');
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        el.style.transform = '';
      });
    });
  }

  /* ---------- 动画：磁吸按钮 ---------- */
  function initMagnetic() {
    if (reduceMotion || !finePointer) return;
    document.querySelectorAll('.btn').forEach((btn) => {
      btn.classList.add('magnetic');
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const mx = e.clientX - r.left - r.width / 2;
        const my = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${(mx * 0.22).toFixed(1)}px, ${(my * 0.32).toFixed(1)}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- 极光背景 ---------- */
  function initAurora() {
    ['facts', 'contact'].forEach((id) => {
      const sec = document.getElementById(id);
      if (sec) sec.classList.add('aurora');
    });
  }

  /* ---------- 刷新率检测 + 帧率自适应 + FPS 浮标 ---------- */
  function initRefresh() {
    const root = document.documentElement;
    const coarse = window.matchMedia('(pointer:coarse)').matches;
    root.dataset.device = coarse ? 'mobile' : 'desktop';
    const target = coarse ? 90 : 240;            // 用户目标：手机 90 / 电脑 240
    let frames = 0, start = performance.now();
    function loop(t) {
      frames++;
      if (t - start < 700) requestAnimationFrame(loop);
      else finish(Math.round(frames / ((t - start) / 1000)));
    }
    function finish(fps) {
      const bucket = fps >= 200 ? '240' : fps >= 140 ? '144' : fps >= 110 ? '120' : fps >= 70 ? '90' : '60';
      root.dataset.hz = bucket;
      root.style.setProperty('--measured-fps', String(fps));
      mountHud(fps, target);
    }
    requestAnimationFrame(loop);
  }
  function mountHud(measured, target) {
    if (!/[?&]fps=1/.test(location.search)) return;   // 仅 ?fps=1 时显示
    const hud = document.createElement('div');
    hud.className = 'fps-hud';
    document.body.appendChild(hud);
    let f = 0, last = performance.now();
    function tick(t) {
      f++;
      if (t - last >= 500) {
        const cur = Math.round(f / ((t - last) / 1000));
        const root = document.documentElement;
        hud.textContent = 'FPS ' + cur + ' · 实测 ' + measured + ' · 目标 ' + target + ' · ' + (root.dataset.hz || '—');
        f = 0; last = t;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- 动画：Hero 滚动视差 ---------- */
  const heroBg = document.querySelector('.hero__bg');
  const heroWaveEl = document.querySelector('.hero__wave');
  function applyParallax() {
    const y = window.scrollY || document.documentElement.scrollTop;
    if (y < window.innerHeight) {
      if (heroBg) heroBg.style.transform = 'translateY(' + (y * 0.25) + 'px)';
      if (heroWaveEl) heroWaveEl.style.transform = 'translateY(' + (y * 0.14) + 'px)';
      if (heroContent) heroContent.style.transform = 'translateY(' + (y * 0.12) + 'px)';
    }
    tickingParallax = false;
  }

  /* ---------- 导航 / 进度条 / 高亮 / 视差 ---------- */
  function onScroll() {
    const y = window.scrollY || document.documentElement.scrollTop;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    nav.classList.toggle('scrolled', y > 20);
    progressBar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    toTop.classList.toggle('show', y > 600);
    const sections = document.querySelectorAll('main section[id]');
    let current = '';
    sections.forEach((sec) => { if (y >= sec.offsetTop - 120) current = sec.id; });
    navLinks.querySelectorAll('a').forEach((a) => { a.classList.toggle('active', a.getAttribute('href') === '#' + current); });
    if (!tickingParallax) { tickingParallax = true; requestAnimationFrame(applyParallax); }
  }

  /* ---------- 平滑锚点 ---------- */
  function initSmooth() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (id === '#' || id.length < 2) return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 56;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  }

  /* ---------- 移动端菜单 ---------- */
  function initMenu() {
    if (!navToggle) return;
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }));
  }

  /* ---------- 文章详情模态 ---------- */
  function openModal(section, id) {
    const list = (CONTENT[section] && CONTENT[section].items) || [];
    const a = list.find(x => String(x.id) === String(id));
    if (!a) return;
    lastFocused = document.activeElement;
    const crumb = `<nav class="modal__crumb" aria-label="面包屑"><a href="#top" data-crumb-home>首页</a><span aria-hidden="true">/</span><span>${SECTION_LABEL[section] || '详情'}</span></nav>`;
    modalPanel.innerHTML = `
      <button class="modal__close" data-close aria-label="关闭">×</button>
      ${a.cover ? `<div class="modal__cover" style="background-image:url('${a.cover}')"></div>` : ''}
      <div class="modal__body">
        ${crumb}
        <div class="modal__meta">
          <span class="post-card__tag post-card__tag--${a.category}">${catLabel(a.category)}</span>
          <time>${a.date}</time>
        </div>
        <h2 class="modal__title">${a.title}</h2>
        <div class="modal__content">${nl2br(a.body)}</div>
      </div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    const closeBtn = modalPanel.querySelector('.modal__close');
    if (closeBtn) closeBtn.focus();
    // 面包屑“首页”在模态内点击时关闭并滚动
    const home = modalPanel.querySelector('[data-crumb-home]');
    if (home) home.addEventListener('click', (e) => { e.preventDefault(); closeModal(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  function trapFocus(e) {
    if (e.key !== 'Tab' || !modal.classList.contains('open')) return;
    const f = modalPanel.querySelectorAll('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }
  function initModal() {
    modal.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') closeModal();
      trapFocus(e);
    });
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.post-card');
      if (card) openModal(card.dataset.section, card.dataset.id);
    });
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    showSkeletons();
    CONTENT = await window.SiteStore.loadContent();
    renderAll(CONTENT);

    initReveal();
    initSectionActive();
    initCounters();
    initOrg();
    initTilt();
    initMagnetic();
    initAurora();
    initRefresh();
    initArtWords();
    initParticles();
    initMenu();
    initSmooth();
    initModal();
    initListToggle();
    initSearch();
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    document.querySelectorAll('.hero .reveal').forEach(el => el.classList.add('in'));
    document.getElementById('toTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
