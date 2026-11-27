(() => {
  'use strict';

  const DRAFT_VERSION = 1;
  let options = null;
  let context = null;

  function key(trip) {
    return `tg:${trip?.meta?.id ?? 'trip'}:draft:v${DRAFT_VERSION}`;
  }

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function value(id) {
    return document.getElementById(id)?.value ?? '';
  }

  function setValue(id, next) {
    const el = document.getElementById(id);
    if (el) el.value = next == null ? '' : String(next);
  }

  function setChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(checked);
  }

  function showError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function findItem(trip, id) {
    for (let dayIndex = 0; dayIndex < (trip.days ?? []).length; dayIndex += 1) {
      const item = (trip.days[dayIndex].items ?? []).find((entry) => entry.id === id);
      if (item) return { dayIndex, item };
    }
    return null;
  }

  function timeToMinutes(time) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? ''));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function normalizeTime(time) {
    const minutes = timeToMinutes(time);
    if (minutes == null) return '';
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function minutesToTime(minutes) {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
  }

  function nextStart(items) {
    const last = [...(items ?? [])].sort((a, b) => String(a.end ?? a.start ?? '').localeCompare(String(b.end ?? b.start ?? ''))).at(-1);
    const end = timeToMinutes(last?.end ?? last?.start);
    return end == null ? '09:00' : minutesToTime(end + 30);
  }

  function safeHttp(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function toast(message) {
    options?.toast?.(message);
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (dialog.open) dialog.close();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }

  function fillItemForm(item, trip, dayIndex, isNew) {
    context = { kind: 'item', dayIndex, itemId: isNew ? null : item.id };
    const dialog = document.getElementById('item-dialog');
    if (!dialog) return;
    const title = item.title ?? '';
    setValue('f-item-id', item.id ?? '');
    setValue('f-type', item.type ?? 'anchor');
    setValue('f-title', title);
    setValue('f-start', item.start ?? nextStart(trip.days[dayIndex]?.items));
    setValue('f-end', item.end ?? minutesToTime((timeToMinutes(value('f-start')) ?? 540) + 60));
    setValue('f-place-name', item.place?.name ?? '');
    setValue('f-place-address', item.place?.address ?? '');
    setValue('f-lat', item.place?.lat ?? '');
    setValue('f-lon', item.place?.lon ?? '');
    setValue('f-transit-mode', item.transit?.mode ?? '');
    setValue('f-transit-min', item.transit?.durationMin ?? '');
    setValue('f-distance-km', item.transit?.distanceKm ?? '');
    setValue('f-cost-amount', item.cost?.amount ?? '');
    setValue('f-cost-currency', item.cost?.currency ?? trip.meta?.budget?.currency ?? 'CNY');
    setValue('f-cost-category', item.cost?.category ?? document.querySelector('#f-cost-category option')?.value ?? 'other');
    setValue('f-notes', item.notes ?? '');
    setValue('f-detail-description', item.detail?.description ?? '');
    setValue('f-detail-highlights', (item.detail?.highlights ?? []).join('\n'));
    setValue('f-detail-photo', item.detail?.photoTip ?? '');
    setValue('f-opening-hours', item.openingHours ?? '');
    setValue('f-ticket-price', item.ticketPrice ?? '');
    setValue('f-booking-url', item.booking?.url ?? '');
    setValue('f-booking-deadline', item.booking?.deadline ?? '');
    setChecked('f-booking-required', item.booking?.required ?? false);
    const heading = document.getElementById('item-dialog-title');
    if (heading) heading.textContent = isNew ? '添加行程项' : '修改行程项';
    const deleteButton = document.querySelector('[data-editor-delete]');
    if (deleteButton) deleteButton.hidden = isNew;
    showError('item-editor-error', '');
    openDialog('item-dialog');
    setTimeout(() => document.getElementById('f-title')?.focus(), 30);
  }

  function openItem(id) {
    if (!options) return;
    const trip = options.getTrip();
    const found = findItem(trip, id);
    if (!found) return;
    fillItemForm(found.item, trip, found.dayIndex, false);
  }

  function openAdd(dayIndex) {
    if (!options) return;
    const trip = options.getTrip();
    const day = trip.days?.[dayIndex];
    if (!day) return;
    fillItemForm({ type: 'anchor', title: '', start: nextStart(day.items), end: '' }, trip, dayIndex, true);
    setValue('f-end', minutesToTime((timeToMinutes(value('f-start')) ?? 540) + 60));
  }

  function readItem() {
    const trip = options.getTrip();
    const day = trip.days?.[context?.dayIndex];
    if (!day) throw new Error('找不到当天行程。');
    const existing = context.itemId ? findItem(trip, context.itemId)?.item : null;
    const item = existing ? clone(existing) : { id: `custom-${context.dayIndex + 1}-${Date.now().toString(36)}`, title: '', type: 'anchor', sourceIds: [], confidence: 'estimate' };
    const title = value('f-title').trim();
    const start = normalizeTime(value('f-start'));
    const end = normalizeTime(value('f-end'));
    if (!title) throw new Error('请填写标题。');
    if (!start || !end) throw new Error('开始/结束时间格式应为 HH:MM。');
    if ((timeToMinutes(end) ?? 0) <= (timeToMinutes(start) ?? 0)) throw new Error('结束时间必须晚于开始时间。');

    const placeName = value('f-place-name').trim();
    const address = value('f-place-address').trim();
    const latRaw = value('f-lat').trim();
    const lonRaw = value('f-lon').trim();
    if (Boolean(latRaw) !== Boolean(lonRaw)) throw new Error('纬度和经度需要同时填写，或同时留空。');
    let lat = null;
    let lon = null;
    if (latRaw && lonRaw) {
      lat = Number(latRaw);
      lon = Number(lonRaw);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('纬度应在 -90 到 90 之间。');
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('经度应在 -180 到 180 之间。');
    }

    item.title = title;
    item.type = value('f-type') || 'anchor';
    item.start = start;
    item.end = end;
    if (placeName || address || lat != null) {
      item.place = {
        ...(existing?.place ?? {}),
        ...(placeName ? { name: placeName } : {}),
        ...(address ? { address } : {}),
        ...(lat != null ? { lat, lon, coordSystem: 'WGS84' } : {}),
      };
      if (!placeName) delete item.place.name;
      if (!address) delete item.place.address;
      if (lat == null) {
        delete item.place.lat;
        delete item.place.lon;
        delete item.place.coordSystem;
      }
    } else {
      delete item.place;
    }

    const transitMode = value('f-transit-mode');
    const transitMin = value('f-transit-min').trim();
    const distanceKm = value('f-distance-km').trim();
    if (transitMode || transitMin || distanceKm) {
      if (!transitMode) throw new Error('填写交通时间前请选择交通方式。');
      const durationMin = transitMin ? Number(transitMin) : 0;
      const km = distanceKm ? Number(distanceKm) : null;
      if (!Number.isFinite(durationMin) || durationMin < 0 || durationMin > 1440) throw new Error('交通时间应在 0–1440 分钟之间。');
      if (km != null && (!Number.isFinite(km) || km < 0 || km > 2000)) throw new Error('距离应在 0–2000 km 之间。');
      item.transit = { ...(existing?.transit ?? {}), fromPrevious: true, mode: transitMode, durationMin, ...(km != null ? { distanceKm: km } : {}) };
    } else {
      delete item.transit;
    }

    const costAmount = value('f-cost-amount').trim();
    const costCurrency = value('f-cost-currency') || trip.meta?.budget?.currency || 'CNY';
    const costCategory = value('f-cost-category') || 'other';
    if (costAmount) {
      const amount = Number(costAmount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('费用金额应为非负数字。');
      item.cost = { amount, currency: costCurrency, category: costCategory };
    } else {
      delete item.cost;
    }

    const bookingUrl = safeHttp(value('f-booking-url').trim());
    const rawBookingUrl = value('f-booking-url').trim();
    if (rawBookingUrl && !bookingUrl) throw new Error('预约链接必须是 http(s) 地址。');
    const bookingDeadline = value('f-booking-deadline').trim();
    const bookingRequired = document.getElementById('f-booking-required')?.checked ?? false;
    if (bookingRequired || bookingUrl || bookingDeadline) {
      item.booking = {
        ...(existing?.booking ?? {}),
        required: bookingRequired,
        status: existing?.booking?.status ?? 'pending',
        ...(bookingUrl ? { url: bookingUrl } : {}),
        ...(bookingDeadline ? { deadline: bookingDeadline } : {}),
      };
    } else {
      delete item.booking;
    }

    const notes = value('f-notes').trim();
    if (notes) item.notes = notes;
    else delete item.notes;
    const detailDescription = value('f-detail-description').trim();
    const detailHighlights = value('f-detail-highlights').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const detailPhoto = value('f-detail-photo').trim();
    if (detailDescription || detailHighlights.length || detailPhoto) {
      item.detail = {
        ...(existing?.detail ?? {}),
        ...(detailDescription ? { description: detailDescription } : {}),
        ...(detailHighlights.length ? { highlights: detailHighlights } : {}),
        ...(detailPhoto ? { photoTip: detailPhoto } : {}),
      };
    } else {
      delete item.detail;
    }
    const openingHours = value('f-opening-hours').trim();
    if (openingHours) item.openingHours = openingHours;
    else delete item.openingHours;
    const ticketPrice = value('f-ticket-price').trim();
    if (ticketPrice) item.ticketPrice = ticketPrice;
    else delete item.ticketPrice;
    ensureEditorSource(trip);
    if (!item.sourceIds?.length) item.sourceIds = [EDITOR_SOURCE_ID];
    return { item, day, existing };
  }

  function saveItem() {
    if (!options) return;
    try {
      const trip = options.getTrip();
      const { item, day, existing } = readItem();
      if (existing) {
        const index = (day.items ?? []).findIndex((entry) => entry.id === item.id);
        if (index >= 0) day.items[index] = item;
      } else {
        day.items = [...(day.items ?? []), item];
      }
      day.items.sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
      trip.meta.updatedAt = new Date().toISOString();
      options.setTrip(trip);
      saveDraft(trip);
      closeDialog('item-dialog');
      toast(existing ? '已更新行程项（仅本机）' : '已添加行程项（仅本机）');
    } catch (error) {
      showError('item-editor-error', error.message || String(error));
    }
  }

  function deleteItem() {
    if (!options || !context?.itemId) return;
    const trip = options.getTrip();
    const found = findItem(trip, context.itemId);
    if (!found) return;
    if (!window.confirm(`删除「${found.item.title}」？`)) return;
    trip.days[found.dayIndex].items = (trip.days[found.dayIndex].items ?? []).filter((entry) => entry.id !== context.itemId);
    trip.meta.updatedAt = new Date().toISOString();
    options.setTrip(trip);
    saveDraft(trip);
    closeDialog('item-dialog');
    toast('已删除行程项（仅本机）');
  }

  function openDay(dayIndex) {
    if (!options) return;
    const trip = options.getTrip();
    const day = trip.days?.[dayIndex];
    if (!day) return;
    context = { kind: 'day', dayIndex };
    setValue('f-day-title', day.title ?? '');
    setValue('f-day-area', day.area ?? '');
    showError('day-editor-error', '');
    openDialog('day-dialog');
  }

  function saveDay() {
    if (!options || context?.kind !== 'day') return;
    const trip = options.getTrip();
    const day = trip.days?.[context.dayIndex];
    if (!day) return;
    const title = value('f-day-title').trim();
    if (!title) {
      showError('day-editor-error', '请填写当天标题。');
      return;
    }
    day.title = title;
    const area = value('f-day-area').trim();
    if (area) day.area = area;
    else delete day.area;
    trip.meta.updatedAt = new Date().toISOString();
    options.setTrip(trip);
    saveDraft(trip);
    closeDialog('day-dialog');
    toast('已更新当天标题（仅本机）');
  }

  function loadDraft(initialTrip) {
    try {
      const raw = localStorage.getItem(key(initialTrip));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== DRAFT_VERSION || !parsed.trip) return null;
      if (parsed.trip.meta?.id !== initialTrip.meta?.id) return null;
      if (!Array.isArray(parsed.trip.days)) return null;
      return parsed.trip;
    } catch {
      return null;
    }
  }

  function saveDraft(trip) {
    try {
      localStorage.setItem(key(trip), JSON.stringify({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), trip }));
      return true;
    } catch {
      toast('浏览器本地存储不可用；修改只在本次打开有效。');
      return false;
    }
  }

  function clearDraft(trip) {
    try { localStorage.removeItem(key(trip)); } catch { /* ignore */ }
  }

  function resetDraft() {
    if (!options) return;
    if (!window.confirm('恢复构建时的初始版本？浏览器里的修改会丢失。')) return;
    clearDraft(options.getTrip());
    location.reload();
  }

  const EDITOR_SOURCE_ID = 'src-editor-manual';

  function ensureEditorSource(trip) {
    if (!Array.isArray(trip.sources)) trip.sources = [];
    if (trip.sources.some((source) => source.id === EDITOR_SOURCE_ID)) return;
    trip.sources.push({
      id: EDITOR_SOURCE_ID,
      provider: 'manual',
      kind: 'note',
      title: '用户在 HTML 中编辑',
      url: '',
      retrievedAt: new Date().toISOString(),
      transport: 'manual',
      license: 'user-provided',
      confidence: 'community',
      rawHash: '',
      note: '浏览器内编辑；导出后请补充官方来源再分享。',
    });
  }

  function moveItemById(id, direction) {
    const trip = options?.getTrip();
    if (!trip) return;
    const found = findItem(trip, id);
    if (!found) return;
    const items = trip.days[found.dayIndex].items ?? [];
    const index = items.findIndex((entry) => entry.id === id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= items.length) {
      options.toast?.('已经到边界了');
      return;
    }
    [items[index], items[target]] = [items[target], items[index]];
    trip.meta.updatedAt = new Date().toISOString();
    options.setTrip?.(trip);
    saveDraft(trip);
    options.toast?.(`已${direction === 'up' ? '上移' : '下移'}`);
  }

  function exportJson() {
    if (!options) return;
    const trip = options.getTrip();
    const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${trip.meta?.id || 'trip'}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('已导出 trip.json；可用 travel-guide build 重新生成。');
  }

  function init(nextOptions) {
    options = nextOptions;
    document.addEventListener('click', (event) => {
      const editItem = event.target.closest('[data-edit-item]');
      if (editItem) {
        event.preventDefault();
        openItem(editItem.dataset.editItem);
        return;
      }
      const moveItem = event.target.closest('[data-move-item]');
      if (moveItem) {
        event.preventDefault();
        moveItemById(moveItem.dataset.moveItem, moveItem.dataset.moveDir);
        return;
      }
      const quickDelete = event.target.closest('[data-delete-item]');
      if (quickDelete) {
        event.preventDefault();
        context = { kind: 'item', itemId: quickDelete.dataset.deleteItem };
        deleteItem();
        return;
      }
      const addItem = event.target.closest('[data-add-item]');
      if (addItem) {
        event.preventDefault();
        openAdd(Number(addItem.dataset.addItem));
        return;
      }
      const editDay = event.target.closest('[data-edit-day]');
      if (editDay) {
        event.preventDefault();
        openDay(Number(editDay.dataset.editDay));
        return;
      }
      if (event.target.closest('[data-editor-save]')) {
        event.preventDefault();
        saveItem();
        return;
      }
      if (event.target.closest('[data-editor-delete]')) {
        event.preventDefault();
        deleteItem();
        return;
      }
      if (event.target.closest('[data-editor-cancel]')) {
        event.preventDefault();
        closeDialog('item-dialog');
        return;
      }
      if (event.target.closest('[data-day-save]')) {
        event.preventDefault();
        saveDay();
        return;
      }
      if (event.target.closest('[data-day-cancel]')) {
        event.preventDefault();
        closeDialog('day-dialog');
        return;
      }
      if (event.target.closest('[data-action="export-json"]')) {
        event.preventDefault();
        exportJson();
        return;
      }
      if (event.target.closest('[data-action="reset-draft"]')) {
        event.preventDefault();
        resetDraft();
      }
    });

    const itemForm = document.getElementById('item-form');
    itemForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveItem();
    });
    const dayForm = document.getElementById('day-form');
    dayForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveDay();
    });
    for (const id of ['item-dialog', 'day-dialog']) {
      const dialog = document.getElementById(id);
      dialog?.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    }
    return { loadDraft, saveDraft, clearDraft, exportJson, resetDraft };
  }

  window.TravelGuideEditor = {
    init,
    loadDraft,
    saveDraft,
    clearDraft,
    exportJson,
  };
})();
