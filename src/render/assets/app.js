(() => {
  'use strict';

  const dataEl = document.getElementById('trip-data');
  if (!dataEl) return;
  let trip = JSON.parse(dataEl.textContent);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = reduceMotion ? 'auto' : 'smooth';
  const state = { day: 'all', type: 'all', query: '' };
  const storePrefix = `tg:${trip.meta?.id ?? 'trip'}:`;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let mapApi = null;
  let toastTimer = null;

  const draft = window.TravelGuideEditor?.loadDraft(trip);
  if (draft) trip = draft;

  initTheme();
  initFilters();
  initMap();
  initChecklists();
  initDeadlines();
  initActions();
  initExternalLinks();
  initEditor();
  if (draft) {
    renderTimeline();
    const banner = $('#draft-banner');
    if (banner) banner.hidden = false;
    toast('已载入本机修改');
  } else {
    applyFilters();
  }
  initHash();

  function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem('tg:theme'); } catch { stored = null; }
    const preferred = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(preferred);
    $$('[data-action="theme"]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem('tg:theme', next); } catch { /* file:// / private mode */ }
      });
    });
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $$('[data-action="theme"]').forEach((button) => {
      const dark = theme === 'dark';
      button.setAttribute('aria-label', dark ? '切换到浅色主题' : '切换到深色主题');
      button.title = dark ? '浅色主题' : '深色主题';
    });
  }

  function initFilters() {
    document.addEventListener('click', (event) => {
      const dayButton = event.target.closest('[data-day-filter]');
      if (dayButton) {
        state.day = dayButton.dataset.dayFilter;
        syncFilterButtons();
        applyFilters();
        return;
      }
      const typeButton = event.target.closest('[data-type-filter]');
      if (typeButton) {
        state.type = typeButton.dataset.typeFilter;
        syncFilterButtons();
        applyFilters();
      }
    });

    const search = $('#search-input');
    if (search) {
      search.addEventListener('input', () => {
        state.query = search.value.trim();
        applyFilters();
      });
      search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          search.value = '';
          state.query = '';
          applyFilters();
          search.blur();
        }
      });
    }
    const clear = $('#clear-filters');
    if (clear) {
      clear.addEventListener('click', () => {
        state.day = 'all';
        state.type = 'all';
        state.query = '';
        if (search) search.value = '';
        syncFilterButtons();
        applyFilters();
      });
    }
  }

  function syncFilterButtons() {
    $$('[data-day-filter]').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.dayFilter === state.day));
    $$('[data-type-filter]').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.typeFilter === state.type));
  }

  function applyFilters() {
    const query = state.query.toLowerCase();
    let visible = 0;
    const visibleIds = new Set();
    $$('.day').forEach((dayEl) => {
      const dayMatch = state.day === 'all' || dayEl.dataset.day === state.day;
      let dayVisible = 0;
      $$('.item', dayEl).forEach((itemEl) => {
        const typeMatch = state.type === 'all' || itemEl.dataset.type === state.type;
        const queryMatch = !query || (itemEl.dataset.search || '').toLowerCase().includes(query);
        const show = dayMatch && typeMatch && queryMatch;
        itemEl.hidden = !show;
        if (show) {
          dayVisible += 1;
          visible += 1;
          visibleIds.add(itemEl.dataset.itemId);
        }
      });
      const filtering = state.type !== 'all' || Boolean(query);
      dayEl.hidden = !dayMatch || (filtering && dayVisible === 0);
    });
    const count = $('#visible-count');
    if (count) count.textContent = `${visible} 个项目`;
    const empty = $('#empty-state');
    if (empty) empty.classList.toggle('is-visible', visible === 0);
    const filtering = state.day !== 'all' || state.type !== 'all' || Boolean(query);
    mapApi?.applyFilter({ day: state.day, type: state.type, visibleIds, filtering });
  }

  function initMap() {
    mapApi = window.TravelGuideMap?.init(trip, {
      onFocus: (id) => focusItem(id, { source: 'map' }),
    }) ?? null;
    if (!mapApi && !document.getElementById('trip-map')) return;
  }

  function focusItem(id, { source } = {}) {
    if (!id) return;
    const item = document.getElementById(`item-${id}`);
    if (!item) return;
    if (item.hidden) {
      state.type = 'all';
      state.query = '';
      state.day = item.dataset.day || 'all';
      const search = $('#search-input');
      if (search) search.value = '';
      syncFilterButtons();
      applyFilters();
    }
    $$('.item').forEach((node) => node.classList.toggle('is-active', node === item));
    $$('.map-pin').forEach((node) => node.classList.remove('is-active'));
    const focused = mapApi?.focus(id);
    if (focused === false) toast('这个地点暂时无法定位，可能未填坐标。');
    if (source === 'map') item.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
    else $('.map-card')?.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
  }

  function initChecklists() {
    const inputs = $$('input[data-persist]');
    for (const input of inputs) {
      const key = storePrefix + input.dataset.persist;
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null) input.checked = stored === '1';
      } catch { /* ignore */ }
      input.addEventListener('change', () => {
        try { localStorage.setItem(key, input.checked ? '1' : '0'); } catch { /* ignore */ }
        updateProgress(input.dataset.persist.split(':')[0]);
      });
    }
    for (const group of new Set(inputs.map((input) => input.dataset.persist.split(':')[0]))) updateProgress(group);
  }

  function updateProgress(group) {
    const inputs = $$(`input[data-persist^="${cssEscape(group)}:"]`);
    if (!inputs.length) return;
    const checked = inputs.filter((input) => input.checked).length;
    const text = $(`[data-progress-text="${cssEscape(group)}"]`);
    if (text) text.textContent = `${checked}/${inputs.length}`;
    const bar = $(`[data-progress-for="${cssEscape(group)}"] span`);
    if (bar) bar.style.width = `${Math.round((checked / inputs.length) * 100)}%`;
  }

  function initDeadlines() {
    $$('[data-deadline]').forEach((node) => {
      const raw = node.dataset.deadline;
      if (!raw) return;
      const date = new Date(`${raw}T23:59:59`);
      if (Number.isNaN(date.getTime())) return;
      const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
      const relative = days < 0 ? '已过期' : days === 0 ? '今天截止' : `还剩 ${days} 天`;
      node.textContent = `${raw} · ${relative}`;
      node.classList.toggle('is-urgent', days >= 0 && days <= 3);
    });
  }

  function initActions() {
    $$('[data-action="print"]').forEach((button) => button.addEventListener('click', () => window.print()));
    $$('[data-action="ics"]').forEach((button) => {
      button.addEventListener('click', () => {
        const ics = $('#ics-data');
        if (!ics) return;
        const blob = new Blob([ics.textContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${trip.meta.id || 'trip'}.ics`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      });
    });
    $$('[data-action="edit"]').forEach((button) => {
      button.addEventListener('click', () => {
        const editing = !document.body.classList.contains('is-editing');
        document.body.classList.toggle('is-editing', editing);
        button.setAttribute('aria-pressed', String(editing));
        const label = button.querySelector('.btn-label');
        if (label) label.textContent = editing ? '完成' : '编辑';
        const bar = $('#edit-bar');
        if (bar) bar.hidden = !editing;
        if (!editing) {
          $$('.item, .map-pin').forEach((node) => node.classList.remove('is-active'));
        }
      });
    });
  }

  function initExternalLinks() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-external]');
      if (!link || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const href = link.href;
      const opened = window.open(href, '_blank');
      if (opened) {
        try { opened.opener = null; } catch { /* ignore */ }
      } else {
        window.location.href = href;
      }
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-focus-item]');
      if (!button) return;
      event.preventDefault();
      focusItem(button.dataset.focusItem, { source: 'card' });
    });
  }

  function initEditor() {
    window.TravelGuideEditor?.init({
      getTrip: () => trip,
      setTrip: (next) => {
        trip = next;
        renderTimeline();
        const banner = $('#draft-banner');
        if (banner) banner.hidden = false;
      },
      toast,
    });
  }

  function renderTimeline() {
    const timeline = $('#timeline');
    if (!timeline || !window.TG?.renderTimeline) return;
    timeline.innerHTML = window.TG.renderTimeline(trip);
    updateTripData();
    updateTabs();
    updateTypeChips();
    updateHero();
    mapApi?.refresh(trip);
    initDeadlines();
    applyFilters();
  }

  function updateTripData() {
    if (dataEl) dataEl.textContent = JSON.stringify(trip);
  }

  function updateTabs() {
    const all = $('[data-day-filter="all"] .tab-count');
    if (all) all.textContent = String((trip.days ?? []).reduce((sum, day) => sum + (day.items ?? []).length, 0));
    (trip.days ?? []).forEach((day, index) => {
      const count = $(`[data-day-filter="${index + 1}"] .tab-count`);
      if (count) count.textContent = `${(day.items ?? []).length}项`;
    });
  }

  function updateTypeChips() {
    const order = ['anchor', 'meal', 'transit', 'hotel', 'rest', 'buffer'];
    const labels = { anchor: '景点', meal: '餐饮', transit: '交通', hotel: '住宿', rest: '休息', buffer: '缓冲' };
    const counts = {};
    for (const day of trip.days ?? []) for (const item of day.items ?? []) {
      const type = item.type ?? 'other';
      counts[type] = (counts[type] ?? 0) + 1;
    }
    if (state.type !== 'all' && !counts[state.type]) state.type = 'all';
    const row = $('.chip-row');
    if (!row) return;
    row.innerHTML = [
      `<button class="chip${state.type === 'all' ? ' is-active' : ''}" data-type-filter="all">全部类型</button>`,
      ...order.filter((type) => counts[type]).map((type) => `<button class="chip${state.type === type ? ' is-active' : ''}" data-type-filter="${type}">${labels[type] ?? type} ${counts[type]}</button>`),
    ].join('');
  }

  function updateHero() {
    const anchor = $('[data-hero-anchors]');
    if (!anchor) return;
    const count = (trip.days ?? []).reduce((sum, day) => sum + (day.items ?? []).filter((item) => item.type === 'anchor').length, 0);
    anchor.textContent = String(count);
  }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  function initHash() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!hash) return;
    if (hash.startsWith('item-')) {
      setTimeout(() => focusItem(hash.slice(5), { source: 'link' }), 80);
    } else if (/^day-\d+$/.test(hash)) {
      const day = hash.slice(4);
      state.day = day;
      syncFilterButtons();
      applyFilters();
    }
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }
})();
