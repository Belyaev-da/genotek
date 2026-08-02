// ==UserScript==
// @name         Genotek PDF Export Helper for Yandex Browser
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Extracts tree/relatives data from Genotek page and lets you save it as JSON directly from a custom menu. Designed as a replacement for the old broken Uꞑ script.
// @match        https://lk.genotek.ru/*
// @grant       unsafeWindow
// @grant       GM_download
// @run-at      document-start
// ==/UserScript==

(function () {
  'use strict';

  const state = {
    tree: null,
    relatives: new Map(),
    patients: null,
    panelAdded: false,
  };

  function textBlobDownload(name, type, content) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function addPanel() {
    if (state.panelAdded || !document.body) return;
    state.panelAdded = true;

    const box = document.createElement('div');
    box.id = 'genotek-export-panel';
    box.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'background:#1f2937',
      'color:#fff',
      'padding:12px 14px',
      'border-radius:10px',
      'font:13px/1.4 sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)',
      'min-width:240px'
    ].join(';');

    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">Genotek export</div>
      <button id="genotek-save-tree" style="width:100%;padding:8px;margin:4px 0;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer">Скачать дерево JSON</button>
      <button id="genotek-save-rel" style="width:100%;padding:8px;margin:4px 0;border:0;border-radius:8px;background:#059669;color:#fff;cursor:pointer">Скачать родственников JSON</button>
      <div style="margin-top:8px;font-size:12px;opacity:.85">Если кнопки неактивны, открой дерево/поиск родственников и подожди загрузки.</div>
    `;

    document.body.appendChild(box);

    box.querySelector('#genotek-save-tree').addEventListener('click', () => {
      if (!state.tree) {
        alert('Данные дерева ещё не пойманы. Открой раздел «Генеалогическое древо» и подожди полной загрузки.');
        return;
      }
      textBlobDownload('genotek_tree.json', 'application/json;charset=utf-8', JSON.stringify({ status: 'success', data: state.tree }, null, 2));
    });

    box.querySelector('#genotek-save-rel').addEventListener('click', () => {
      if (!state.relatives.size) {
        alert('Данные родственников ещё не пойманы. Открой раздел «Поиск родственников» и подожди загрузки.');
        return;
      }
      const obj = {};
      for (const [k, v] of state.relatives.entries()) obj[k] = v;
      textBlobDownload('genotek_relatives.json', 'application/json;charset=utf-8', JSON.stringify(obj, null, 2));
    });
  }

  function maybeAddPanel() {
    if (document.body) addPanel();
    else document.addEventListener('DOMContentLoaded', addPanel, { once: true });
  }

  function decodeRelativesPayload(resp) {
    try {
      if (resp && typeof resp.data === 'string') {
        return JSON.parse(decodeURIComponent(escape(atob(resp.data)))).relatives || null;
      }
      if (resp && Array.isArray(resp.relatives)) return resp.relatives;
    } catch (e) {}
    return null;
  }

  function capture(url, resp) {
    if (!url || !resp) return;
    if (url.includes('/genealogy-graph/')) {
      state.tree = resp.data || resp;
      maybeAddPanel();
      console.log('[Genotek export] tree captured');
      return;
    }
    if (url.includes('/site/1/relatives/')) {
      const rels = decodeRelativesPayload(resp);
      if (!rels) return;
      try {
        const u = new URL(url);
        const tubeId = u.pathname.substring(u.pathname.lastIndexOf('/') + 1);
        state.relatives.set(tubeId, rels);
        maybeAddPanel();
        console.log('[Genotek export] relatives captured for', tubeId, rels.length);
      } catch (e) {}
      return;
    }
    if (url.includes('/patients/') && resp.patients) {
      state.patients = resp;
      console.log('[Genotek export] patients captured');
    }
  }

  const xopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.addEventListener('readystatechange', function () {
      try {
        if (!this.responseURL || !this.responseURL.includes('lk2-back.genotek.ru/api/v1/')) return;
        if (this.readyState === 2) {
          try { this.responseType = 'json'; } catch (e) {}
        }
        if (this.readyState === 4) {
          let resp = this.response;
          if (typeof resp === 'string') {
            try { resp = JSON.parse(resp); } catch (e) { return; }
          }
          capture(this.responseURL, resp);
        }
      } catch (e) {}
    }, false);
    return xopen.apply(this, arguments);
  };

  const f = window.fetch;
  if (typeof f === 'function') {
    window.fetch = async function (...args) {
      const res = await f.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        if (url && url.includes('lk2-back.genotek.ru/api/v1/')) {
          const clone = res.clone();
          clone.json().then(data => capture(url, data)).catch(() => {});
        }
      } catch (e) {}
      return res;
    };
  }

  maybeAddPanel();
})();
