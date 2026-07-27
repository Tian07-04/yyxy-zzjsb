/* ===== 关于本站 / 隐私政策 渲染（数据驱动，内容来自 SITE_CONTENT.pages） ===== */
(function () {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderPage(kind) {
    const C = (window.SITE_CONTENT && window.SITE_CONTENT.pages) || {};
    const p = C[kind] || { title: '', blocks: [] };
    const titleEl = document.getElementById('docTitle');
    const bodyEl = document.getElementById('docBody');
    const leadEl = document.getElementById('docLead');
    const updEl = document.getElementById('docUpdated');
    if (titleEl) titleEl.textContent = p.title || '';
    if (kind === 'about') {
      if (leadEl) leadEl.textContent = p.lead || '';
      if (updEl) updEl.style.display = 'none';
    } else {
      if (leadEl) leadEl.style.display = 'none';
      if (updEl) updEl.textContent = p.updated || '';
    }
    if (bodyEl) {
      const blocks = p.blocks || [];
      bodyEl.innerHTML = blocks.map((b) => {
        if (b.t === 'h2') return `<h2>${esc(b.text)}</h2>`;
        if (b.t === 'p') return `<p>${esc(b.text)}</p>`;
        if (b.t === 'ul') return `<ul>${(b.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
        if (b.t === 'log') {
          return `<ul class="log">${(b.items || []).map((e) =>
            `<li><span class="date">${esc(e.date)}</span><div class="what">${(e.tags || []).map((t) => `<span class="tags">${esc(t)}</span>`).join(' ')}${esc(e.what)}</div></li>`
          ).join('')}</ul>`;
        }
        return '';
      }).join('');
    }
  }
  async function boot(kind) {
    if (window.SiteStore && window.SiteStore.loadContent) {
      try { window.SITE_CONTENT = await window.SiteStore.loadContent(); } catch (e) { /* 用默认内容 */ }
    }
    renderPage(kind);
  }
  window.renderDocPage = boot;
})();
