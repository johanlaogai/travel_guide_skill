(() => {
  'use strict';

  const dataEl = document.getElementById('trip-data');
  if (!dataEl) return;
  const trip = JSON.parse(dataEl.textContent);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = reduceMotion ? 'auto' : 'smooth';
  const state = { day: 'all', type: 'all', query: '', source: 'all' };
  const storePrefix = `tg:${trip.meta?.id ?? 'trip'}:`;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  initTheme();
  initFilters();
  initMap();
  initChecklists();
  initDeadlines();
  initActions();
  initSourceFilters();
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
    $$('[data-day-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.day = button.dataset.dayFilter;
        $$('[data-day-filter]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
        applyFilters();
      });
    });
    $$('[data-type-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.type = button.dataset.typeFilter;
        $$('[data-type-filter]').forEach((chip) => chip.classList.toggle('is-active', chip === button));
        applyFilters();
      });
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
        $$('[data-day-filter]').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.dayFilter === 'all'));
        $$('[data-type-filter]').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.typeFilter === 'all'));
        applyFilters();
      });
    }
  }

  function applyFilters() {
    const query = state.query.toLowerCase();
    let visible = 0;
    $$('.day').forEach((dayEl) => {
      const dayMatch = state.day === 'all' || dayEl.dataset.day === state.day;
      let dayVisible = 0;
      $$('.item', dayEl).forEach((itemEl) => {
        const typeMatch = state.type === 'all' || itemEl.dataset.type === state.type;
        const queryMatch = !query || (itemEl.dataset.search || '').toLowerCase().includes(query);
        const show = dayMatch && typeMatch && queryMatch;
        itemEl.hidden = !show;
        if (show) { dayVisible += 1; visible += 1; }
      });
      const filtering = state.type !== 'all' || Boolean(query);
      dayEl.hidden = !dayMatch || (filtering && dayVisible === 0);
    });
    const count = $('#visible-count');
    if (count) count.textContent = `${visible} 个项目`;
    const empty = $('#empty-state');
    if (empty) empty.classList.toggle('is-visible', visible === 0);
    syncMap();
  }

  function syncMap() {
    const visibleIds = new Set();
    $$('.item').forEach((item) => {
      if (!item.hidden) visibleIds.add(item.dataset.itemId);
    });
    $$('.map-marker').forEach((marker) => {
      const dayMatch = state.day === 'all' || marker.dataset.day === state.day;
      const itemVisible = visibleIds.has(marker.dataset.itemId);
      marker.classList.toggle('is-dim', !dayMatch || !itemVisible);
      marker.classList.toggle('is-hidden', false);
    });
  }

  function initMap() {
    const svg = $('#map-svg');
    if (!svg) return;
    const viewport = $('#map-viewport', svg);
    if (!viewport) return;
    const stateMap = { x: 0, y: 0, k: 1 };
    let drag = null;

    const apply = () => viewport.setAttribute('transform', `translate(${stateMap.x.toFixed(2)} ${stateMap.y.toFixed(2)}) scale(${stateMap.k.toFixed(3)})`);
    const toSvgPoint = (clientX, clientY) => {
      const rect = svg.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * 720,
        y: ((clientY - rect.top) / rect.height) * 520,
      };
    };
    const zoomAt = (factor, clientX, clientY) => {
      const point = toSvgPoint(clientX, clientY);
      const next = Math.min(5, Math.max(0.7, stateMap.k * factor));
      const ratio = next / stateMap.k;
      stateMap.x = point.x - (point.x - stateMap.x) * ratio;
      stateMap.y = point.y - (point.y - stateMap.y) * ratio;
      stateMap.k = next;
      apply();
    };

    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomAt(event.deltaY > 0 ? 0.9 : 1.1, event.clientX, event.clientY);
    }, { passive: false });

    svg.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.map-marker')) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: stateMap.x, oy: stateMap.y };
      svg.classList.add('is-dragging');
      svg.setPointerCapture?.(event.pointerId);
    });
    svg.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const rect = svg.getBoundingClientRect();
      const dx = (event.clientX - drag.x) / rect.width * 720;
      const dy = (event.clientY - drag.y) / rect.height * 520;
      stateMap.x = drag.ox + dx;
      stateMap.y = drag.oy + dy;
      apply();
    });
    const endDrag = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      svg.classList.remove('is-dragging');
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    $$('[data-map-zoom]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mapZoom;
        if (mode === 'reset') {
          stateMap.x = 0; stateMap.y = 0; stateMap.k = 1; apply();
        } else {
          const rect = svg.getBoundingClientRect();
          zoomAt(mode === 'in' ? 1.25 : 0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
      });
    });

    $$('.map-marker').forEach((marker) => {
      marker.addEventListener('click', () => activateItem(marker.dataset.itemId, { source: 'map' }));
      marker.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activateItem(marker.dataset.itemId, { source: 'map' });
        }
      });
    });

    $$('[data-focus-item]').forEach((button) => {
      button.addEventListener('click', () => {
        activateItem(button.dataset.focusItem, { source: 'card' });
        $('.map-card')?.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
      });
    });

    window.__travelGuideFocus = (id) => activateItem(id, { source: 'map' });

    function activateItem(id, { source }) {
      if (!id) return;
      const item = document.getElementById(`item-${id}`);
      if (!item) return;
      if (item.hidden) {
        state.type = 'all';
        state.query = '';
        state.day = item.dataset.day || 'all';
        const search = $('#search-input');
        if (search) search.value = '';
        $$('[data-day-filter]').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.dayFilter === state.day));
        $$('[data-type-filter]').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.typeFilter === 'all'));
        applyFilters();
      }
      $$('.item').forEach((node) => node.classList.toggle('is-active', node === item));
      $$('.map-marker').forEach((node) => node.classList.toggle('is-active', node.dataset.itemId === id));
      const marker = $(`.map-marker[data-item-id="${cssEscape(id)}"]`);
      if (marker) centerMarker(marker);
      if (source === 'map') item.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
    }

    function centerMarker(marker) {
      const transform = marker.getAttribute('transform') || '';
      const match = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(transform);
      if (!match) return;
      const x = Number(match[1]);
      const y = Number(match[2]);
      stateMap.x = 360 - x * stateMap.k;
      stateMap.y = 260 - y * stateMap.k;
      apply();
    }
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
  }

  function initSourceFilters() {
    $$('[data-source-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.source = button.dataset.sourceFilter;
        $$('[data-source-filter]').forEach((node) => node.classList.toggle('is-active', node === button));
        $$('.source-row').forEach((row) => {
          row.hidden = state.source !== 'all' && row.dataset.confidence !== state.source;
        });
      });
    });
  }

  function initHash() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!hash) return;
    if (hash.startsWith('item-')) {
      setTimeout(() => window.__travelGuideFocus?.(hash.slice(5)), 60);
    } else if (/^day-\d+$/.test(hash)) {
      const day = hash.slice(4);
      state.day = day;
      $$('[data-day-filter]').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.dayFilter === day));
      applyFilters();
    }
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }
})();
