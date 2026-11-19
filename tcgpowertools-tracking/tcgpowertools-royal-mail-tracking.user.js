// ==UserScript==
// @name         P9 TCGPowerTools
// @namespace    local.p9.tcgpowertools
// @version      1.2.1
// @description  P9 tools for TCG PowerTools: label tracking import, stock cooldown control, native refresh, and legacy redirect protection.
// @homepageURL  https://github.com/tjx0726/P9_Tampermonkey/tree/main/p9-tcgpowertools
// @match        https://app.tcgpowertools.com/*
// @match        https://new.tcgpowertools.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @sandbox      raw
// @noframes
// @updateURL    https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/p9-tcgpowertools/p9-tcgpowertools.user.js
// @downloadURL  https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/p9-tcgpowertools/p9-tcgpowertools.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.2.1';
  const TOOL_NAME = 'P9 TCGPowerTools';
  const AUTO_REFRESH_KEY = 'p9.tcg.tracking.autoRefresh';
  const STOCK_COOLDOWN_KEY = 'p9.tcg.tools.stockCooldownBypass';
  const STAY_LEGACY_KEY = 'p9.tcg.tools.stayOnLegacy';
  const LEGACY_ORIGIN = 'https://app.tcgpowertools.com';
  const NEW_ORIGIN = 'https://new.tcgpowertools.com';
  const PDF_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/';
  const normalizeTracking = (value) => String(value ?? '').replace(/\s+/g, '').toUpperCase();
  const orderId = (order) => String(order.idOrder);
  const pickingId = (order) => String(order.pt?.picking?.pickingId ?? '').trim().toUpperCase();
  const trackingValues = (order) => [...new Set([
    normalizeTracking(order.trackingNumber), normalizeTracking(order.pt?.trackingNumber),
  ].filter(Boolean))];
  const effectiveTracking = (order) => normalizeTracking(order.pt?.trackingNumber) || normalizeTracking(order.trackingNumber);

  function parseLabelText(text, page) {
    // Royal Mail's export has one label per page. Refuse ambiguous pages rather
    // than associating a reference with a different label's tracking number.
    const upper = text.toUpperCase();
    // Click & Drop prints a quantity prefix such as "20x A17 (20)".
    // Keep it separate before compacting PDF text items, otherwise its digits
    // can be appended to the preceding Cardmarket reference.
    const compact = upper.replace(/\b\d+\s*[X×](?=\s*[A-Z]+\s*\d(?:\s*\d)*\s*\()/g, 'SKU:').replace(/\s+/g, '');
    const referenceHeadings = [...compact.matchAll(/CUSTOMERREF:/g)];
    const legacyRefs = [...compact.matchAll(/CUSTOMERREF:\d+\/([A-Z]+\d+)\(\d+\)(\d{8,15})(?!\d)/g)];
    const orderRefs = [...compact.matchAll(/CUSTOMERREF:(?:\d+\/)?(\d{8,15})(?![\d/])/g)];
    // New exports put only the Cardmarket ID in Customer Ref and print the
    // PID (quantity) separately as SKU. Find that token on the same label page;
    // do not depend on the PDF's paint order or an optional printed SKU heading.
    const skuValues = new Map();
    for (const match of upper.matchAll(/\b([A-Z]+\s*\d(?:\s*\d)*)\s*\(\s*(\d(?:\s*\d)*)\s*\)/g)) {
      const code = match[1].replace(/\s+/g, '');
      const quantity = match[2].replace(/\s+/g, '');
      skuValues.set(`${code}:${quantity}`, code);
    }
    const skuCodes = [...skuValues.values()];
    const referenceCount = legacyRefs.length + orderRefs.length;
    const tracks = [...upper.matchAll(/\b[A-Z]\s*[A-Z]\s*(?:\d\s*){9}[A-Z]\s*[A-Z]\b/g)];
    const row = { page, orderCode: '', cardmarketOrderId: '', trackingNumber: '', error: '' };
    if (referenceCount === 1 && legacyRefs.length === 1) {
      row.orderCode = legacyRefs[0][1];
      row.cardmarketOrderId = legacyRefs[0][2];
    } else if (referenceCount === 1 && orderRefs.length === 1) {
      row.cardmarketOrderId = orderRefs[0][1];
      if (skuCodes.length === 1) row.orderCode = skuCodes[0];
    }
    if (tracks.length === 1) row.trackingNumber = normalizeTracking(tracks[0][0]);
    if (!text.trim()) row.error = 'No readable text layer. Scanned PDFs require OCR.';
    else if (referenceHeadings.length > 1 || referenceCount > 1 || tracks.length > 1) row.error = 'Multiple label candidates on this page; automatic pairing is ambiguous.';
    else if (referenceCount !== 1) row.error = 'Customer Ref is missing or does not contain a supported order code and ID.';
    else if (skuCodes.length > 1) row.error = 'Conflicting PID or quantity values on this label; check the reference and SKU.';
    else if (orderRefs.length === 1 && skuCodes.length !== 1) row.error = 'SKU is missing or does not contain a supported PID (quantity).';
    else if (tracks.length !== 1) row.error = 'No unique Royal Mail tracking number found.';
    return row;
  }

  async function extractPdf(data, pdfjs, onProgress = () => {}) {
    const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
    const rows = [];
    try {
      const pdf = await task.promise;
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const { items } = await page.getTextContent();
        const text = items.filter((item) => typeof item.str === 'string').map((item) => item.str).join('\n');
        rows.push(parseLabelText(text, pageNo));
        page.cleanup();
        onProgress(pageNo, pdf.numPages);
      }
      return rows;
    } finally {
      await task.destroy();
    }
  }

  function matchLabels(labels, orders, allowOverwrite = false) {
    const byId = new Map();
    for (const order of orders) {
      const key = orderId(order);
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push(order);
    }
    const rows = labels.map((label) => {
      const row = { ...label, eligible: false, same: false, existing: '', reason: label.error || '', order: null };
      if (row.reason) return row;
      const candidates = byId.get(label.cardmarketOrderId) || [];
      if (candidates.length !== 1) {
        row.reason = candidates.length ? 'Duplicate order ID; blocked.' : 'This Cardmarket order ID was not found in the current account.';
        return row;
      }
      row.order = candidates[0];
      const pid = pickingId(row.order);
      row.existing = effectiveTracking(row.order);
      row.snapshot = trackingValues(row.order).join(' / ');
      if (pid !== label.orderCode) {
        row.reason = `PID mismatch: PDF ${label.orderCode}, order ${pid || 'not set'}.`;
        return row;
      }
      row.same = row.existing === label.trackingNumber;
      if (row.same) row.reason = 'Already matches; no update needed.';
      else if (row.existing && !allowOverwrite) row.reason = 'Different tracking exists. Enable overwrite to select this order.';
      else {
        row.eligible = true;
        row.reason = row.existing ? 'Matched; existing tracking will be replaced.' : 'Matched; ready to add tracking.';
      }
      return row;
    });

    // A duplicate ID or a tracking number shared by different orders needs review.
    const ids = new Map();
    const tracks = new Map();
    for (const row of rows.filter((entry) => !entry.error)) {
      if (!ids.has(row.cardmarketOrderId)) ids.set(row.cardmarketOrderId, []);
      ids.get(row.cardmarketOrderId).push(row);
      if (!tracks.has(row.trackingNumber)) tracks.set(row.trackingNumber, new Set());
      tracks.get(row.trackingNumber).add(row.cardmarketOrderId);
    }
    for (const group of ids.values()) {
      if (group.length < 2) continue;
      const conflict = new Set(group.map((row) => `${row.orderCode}:${row.trackingNumber}`)).size > 1;
      for (const row of conflict ? group : group.slice(1)) {
        row.eligible = false;
        row.same = false;
        row.reason = conflict ? 'Conflicting labels for the same order in this PDF.' : 'Duplicate label; skipped.';
      }
    }
    for (const row of rows) {
      if (tracks.get(row.trackingNumber)?.size > 1) {
        row.eligible = false;
        row.same = false;
        row.reason = 'The same tracking number is assigned to multiple orders; blocked.';
      }
    }
    return rows;
  }

  async function saveTracking(order, trackingNumber, request) {
    // These are the two calls made by the native tracking dialog, in this order.
    // The first is the Cardmarket-facing action; do not pretend a local-only
    // update succeeded if that action fails. Never retry an uncertain PUT.
    const remote = await request('/api/user/order/setTrackingNumber', {
      method: 'PUT', body: { idOrder: order.idOrder, trackingNumber },
    });
    if (String(remote?.order?.idOrder) !== orderId(order)
      || normalizeTracking(remote.order.trackingNumber) !== trackingNumber) {
      throw new Error('Cardmarket did not confirm the new tracking for this order. The local update was stopped.');
    }
    await request('/api/user/order/changeOrderProp', {
      method: 'PUT', body: { idOrder: order.idOrder, prop: 'trackingNumber', value: trackingNumber },
    });
  }

  function verifySaved(row, orders) {
    const matches = orders.filter((order) => orderId(order) === row.cardmarketOrderId);
    if (matches.length !== 1 || pickingId(matches[0]) !== row.orderCode) return false;
    // GET /user/order contains a cached Cardmarket order plus the separately
    // persisted PT record. The cache may still contain the old tracking after
    // a successful upstream save; the native PUT response verifies Cardmarket,
    // and this independent GET verifies the PT record we actually changed.
    return normalizeTracking(matches[0].pt?.trackingNumber) === row.trackingNumber;
  }

  function isOrderMutation(url, method, origin) {
    try {
      const target = new URL(url, origin);
      return target.origin === origin && /^(PUT|POST|PATCH)$/i.test(method)
        && /^\/api\/user\/order\/(setTrackingNumber|changeOrderProp|changeOrdersState)\/?$/.test(target.pathname);
    } catch { return false; }
  }

  function isLegacyRedirect(url) {
    try {
      const destination = new URL(url);
      return destination.origin === NEW_ORIGIN && /^\/login-redirect\/?$/.test(destination.pathname);
    } catch { return false; }
  }

  function nativeStockHandler(button) {
    // Read only the DOM button's bound React event props. Do not traverse fibers
    // or change feature flags: the original callback owns fetching, confirmation,
    // error handling, hydration, and rendering on each version of the site.
    const key = Object.keys(button || {}).find((name) => /^__react(?:Props|EventHandlers)\$/.test(name));
    const props = key ? button[key] : null;
    if (typeof props?.onClick !== 'function') throw new Error('The native stock refresh action is unavailable. Reload Your Stock and try again.');
    const disabled = typeof props.disabled === 'boolean' ? props.disabled : props['aria-disabled'] === true || props['aria-disabled'] === 'true';
    return { handler: props.onClick, props, disabled };
  }

  const core = { normalizeTracking, parseLabelText, extractPdf, matchLabels, saveTracking, verifySaved, isOrderMutation, isLegacyRedirect, nativeStockHandler };
  if (typeof module === 'object' && module.exports) {
    module.exports = core;
    return;
  }
  const page = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : window;
  if (page.top !== page.self || ![LEGACY_ORIGIN, NEW_ORIGIN].includes(location.origin)) return;
  if (page.P9TCGPowerTools || page.P9TrackingImporter) return;

  let host;
  let ui;
  let rows = [];
  let labels = [];
  let orders = [];
  let busy = false;
  let applying = false;
  let stopRequested = false;
  let pendingWrites = 0;
  let refreshNeeded = false;
  let refreshTimer;
  let refreshPromise;
  let pdfPromise;
  let appStore;
  let appRuntime;
  let stockBusy = false;
  let stockGatePending = false;
  let stockIdentity;
  let lastRoute = '';
  let stockMessage = 'Use the native stock refresh even while its browser cooldown is active.';
  const unlockedStockButtons = new Map();
  let autoRefresh = true;
  const readPreference = (key, fallback) => {
    try {
      const shared = typeof GM_getValue === 'function' ? GM_getValue(key) : undefined;
      if (typeof shared === 'boolean') return shared;
      const value = page.localStorage.getItem(key);
      if (value !== null && typeof GM_setValue === 'function') GM_setValue(key, value !== 'false');
      return value === null ? fallback : value !== 'false';
    }
    catch { return fallback; }
  };
  autoRefresh = readPreference(AUTO_REFRESH_KEY, true);
  let stockCooldownBypass = readPreference(STOCK_COOLDOWN_KEY, false);
  let stayOnLegacy = readPreference(STAY_LEGACY_KEY, true);
  let statusText = 'Choose a shipping label PDF, review the matched orders, then add tracking.';
  let statusError = false;
  const outcomes = new Map();

  function preferences() { return { autoRefresh, stockCooldownBypass, stayOnLegacy }; }

  function applyPreference(key, value) {
    if (key === AUTO_REFRESH_KEY) {
      autoRefresh = value;
      if (!autoRefresh) clearTimeout(refreshTimer);
      else if (refreshNeeded) scheduleRefresh();
    } else if (key === STOCK_COOLDOWN_KEY) stockCooldownBypass = value;
    else if (key === STAY_LEGACY_KEY) stayOnLegacy = value;
    if (ui) {
      ui.querySelector('#auto').checked = autoRefresh;
      ui.querySelector('#stock-cooldown').checked = stockCooldownBypass;
      ui.querySelector('#stay-legacy').checked = stayOnLegacy;
    }
    stockIdentity = null;
    void syncStockGate();
  }

  function setPreference(key, value) {
    if (![AUTO_REFRESH_KEY, STOCK_COOLDOWN_KEY, STAY_LEGACY_KEY].includes(key) || typeof value !== 'boolean') throw new Error('Unknown preference.');
    let saved = false;
    if (typeof GM_setValue === 'function') { GM_setValue(key, value); saved = true; }
    try { page.localStorage.setItem(key, String(value)); saved = true; } catch { /* Shared storage can still work. */ }
    applyPreference(key, value);
    if (ui) ui.querySelector('#settings-status').textContent = saved
      ? (typeof GM_setValue === 'function' ? 'Preferences saved for this script across both domains.' : 'Preference saved on this domain.')
      : 'Preference applied for this tab. Browser storage is unavailable.';
  }

  if (typeof GM_addValueChangeListener === 'function') {
    for (const key of [AUTO_REFRESH_KEY, STOCK_COOLDOWN_KEY, STAY_LEGACY_KEY]) GM_addValueChangeListener(key, (name, old, value) => {
      if (typeof value === 'boolean') applyPreference(name, value);
    });
  }

  // Register at document-start, before the legacy app can initiate migration.
  if (location.origin === LEGACY_ORIGIN) page.navigation?.addEventListener('navigate', (event) => {
    if (!stayOnLegacy || !isLegacyRedirect(event.destination?.url)) return;
    if (event.cancelable) event.preventDefault();
    else console.warn('[P9 TCGPowerTools] The automatic redirect was not cancelable.');
  });

  function status(message, error = false) {
    statusText = message;
    statusError = error;
    if (ui) {
      ui.querySelector('#status').textContent = message;
      ui.querySelector('#status').classList.toggle('error', error);
    }
  }

  function findRuntime() {
    if (appRuntime) return appRuntime;
    const chunks = page['webpackJsonppowertools-client'];
    if (!Array.isArray(chunks)) throw new Error('The app module is not ready. Reload the page or check script compatibility.');
    let runtime;
    const key = `p9_tracking_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    chunks.push([[key], { [key]: (module, exports, require) => { runtime = require; } }, [[key]]]);
    if (!runtime?.c) throw new Error('Could not connect to the legacy app state manager.');
    delete runtime.m[key];
    delete runtime.c[key];
    appRuntime = runtime;
    return runtime;
  }

  function findStore() {
    if (appStore) return appStore;
    const runtime = findRuntime();
    // Discover the already-loaded Zustand store by its public interface, not a
    // hardcoded webpack module number or React's private fiber properties.
    for (const candidate of loadedExports(runtime)) {
      try {
        if (typeof candidate?.getState !== 'function' || typeof candidate?.setState !== 'function') continue;
        const state = candidate.getState();
        if (Array.isArray(state?.orders) && Array.isArray(state.rawOrders)
          && typeof state.setOrders === 'function' && typeof state.setRawOrders === 'function') {
          appStore = candidate;
          break;
        }
      } catch { /* Third-party modules can export inaccessible cross-origin Window proxies. */ }
    }
    if (!appStore) throw new Error('The order state module is not ready. Please try again shortly.');
    return appStore;
  }

  function loadedExports(runtime) {
    const values = [];
    for (const entry of Object.values(runtime.c)) {
      try {
        const value = entry.exports;
        if (!value || !['object', 'function'].includes(typeof value)) continue;
        values.push(value);
        if (value !== page) values.push(...Object.values(value));
      } catch { /* Ignore unrelated or inaccessible module exports. */ }
    }
    return values;
  }

  async function request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await page.fetch(path, {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(`Request failed: HTTP ${response.status}${[401, 403].includes(response.status) ? '. Please check that you are signed in.' : '.'}`);
      const text = await response.text();
      if (!text.trim()) return null;
      let value;
      try { value = JSON.parse(text); } catch { throw new Error('The server did not return JSON. Please check that you are still signed in.'); }
      if (value?.error || value?.success === false) throw new Error('The server reported a save failure. Check the original tracking dialog.');
      return value;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(method === 'GET' ? 'Reading orders timed out. Please try again.' : 'The save response timed out and the result is uncertain. Recheck the order before submitting again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  function isStockPage() { return location.origin === LEGACY_ORIGIN && /^\/stock-pricing\/?$/.test(location.pathname); }

  function restoreStockButtons() {
    for (const [button, saved] of unlockedStockButtons) {
      let props;
      let disabled = saved.disabled;
      try { ({ props, disabled } = nativeStockHandler(button)); } catch { /* Restore the captured attributes if the adapter disappeared. */ }
      if ('disabled' in button) button.disabled = disabled;
      button.style.pointerEvents = props?.style ? props.style.pointerEvents || '' : saved.pointerEvents;
      button.classList.toggle('Mui-disabled', disabled && saved.muiDisabled);
      if (saved.ariaDisabled === null) button.removeAttribute('aria-disabled');
      else button.setAttribute('aria-disabled', String(disabled));
      if (saved.title === null) button.removeAttribute('title');
      else button.setAttribute('title', saved.title);
      button.removeAttribute('data-p9-cooldown-unlocked');
      unlockedStockButtons.delete(button);
    }
  }

  async function stockCooldown() {
    let game;
    try { game = Number(JSON.parse(page.localStorage.getItem('activeGameId') || '"1"')); }
    catch { throw new Error('Could not read the selected game. Reopen Your Stock.'); }
    if (!Number.isSafeInteger(game) || game < 1) throw new Error('The selected game is unavailable.');
    if (!stockIdentity || stockIdentity.game !== game) {
      const runtime = findRuntime();
      let database;
      for (const candidate of loadedExports(runtime)) {
        try {
          if (typeof candidate?.getItem !== 'function' || typeof candidate?.setItem !== 'function' || typeof candidate?.config !== 'function') continue;
          if (candidate.config()?.name === 'Powertools-v2') database = candidate;
        } catch { /* Ignore cross-origin frames exported by unrelated modules. */ }
      }
      if (!database) throw new Error('The stock cache is not ready. Reopen Your Stock.');
      const profile = await request('/api/user');
      if (!profile?.cardmarketUsername) throw new Error('Connect a Cardmarket account first.');
      const cache = await database.getItem(`${game}-${profile.cardmarketUsername}-stock`);
      if (!cache || !Number.isFinite(cache.fetchedAtTimestamp)) throw new Error('Refresh stock normally once before enabling the cooldown bypass.');
      stockIdentity = { game, fetchedAt: cache.fetchedAtTimestamp, paginated: profile.featureFlags?.paginatedStock === true };
    }
    const elapsed = Date.now() - stockIdentity.fetchedAt;
    return !stockIdentity.paginated && elapsed >= 0 && elapsed < 3600000;
  }

  async function syncStockGate() {
    if (!stockCooldownBypass || !isStockPage() || stockBusy || busy) { restoreStockButtons(); return; }
    const button = document.querySelector('[data-testid="get-stock-btn"]');
    if (!button) { restoreStockButtons(); return; }
    let nativeDisabled;
    try { nativeDisabled = nativeStockHandler(button).disabled; } catch { restoreStockButtons(); return; }
    if (!nativeDisabled) { restoreStockButtons(); return; }
    // Loading and confirmation dialogs keep their own native lock.
    if ([...document.querySelectorAll('[role="dialog"]')].some((dialog) => dialog.getClientRects().length)) { restoreStockButtons(); return; }
    if (stockGatePending) return;
    stockGatePending = true;
    try {
      if (!await stockCooldown()) { restoreStockButtons(); return; }
      if (!stockCooldownBypass || !isStockPage() || stockBusy || busy || !button.isConnected) return;
      if (!unlockedStockButtons.has(button)) unlockedStockButtons.set(button, {
        disabled: button.disabled, pointerEvents: button.style.pointerEvents,
        ariaDisabled: button.getAttribute('aria-disabled'), title: button.getAttribute('title'), muiDisabled: button.classList.contains('Mui-disabled'),
      });
      if ('disabled' in button && button.disabled) button.disabled = false;
      if (button.classList.contains('Mui-disabled')) button.classList.remove('Mui-disabled');
      if (button.style.pointerEvents !== 'auto') button.style.pointerEvents = 'auto';
      if (button.getAttribute('aria-disabled') === 'true') button.setAttribute('aria-disabled', 'false');
      if (button.getAttribute('data-p9-cooldown-unlocked') !== 'true') button.setAttribute('data-p9-cooldown-unlocked', 'true');
      if (button.getAttribute('title') !== 'Refresh stock during cooldown') button.setAttribute('title', 'Refresh stock during cooldown');
      if (stockMessage.startsWith('Cooldown bypass unavailable:')) {
        stockMessage = 'Cooldown bypass is active for the native Refresh Stock button.';
        if (ui) ui.querySelector('#stock-status').textContent = stockMessage;
      }
    } catch (error) {
      restoreStockButtons();
      stockMessage = `Cooldown bypass unavailable: ${error.message}`;
      if (ui) ui.querySelector('#stock-status').textContent = stockMessage;
    } finally { stockGatePending = false; }
  }

  async function refreshStock(event) {
    if (location.origin !== LEGACY_ORIGIN) throw new Error('Stock actions are not enabled on the new domain yet.');
    if (stockBusy || busy) return;
    if (!isStockPage()) {
      stockMessage = 'Open Your Stock first, then use Force Refresh Stock.';
      if (ui) ui.querySelector('#stock-status').textContent = stockMessage;
      return;
    }
    const button = document.querySelector('[data-testid="get-stock-btn"]');
    const { handler } = nativeStockHandler(button);
    stockBusy = true;
    restoreStockButtons();
    if (ui?.querySelector('dialog').open) ui.querySelector('dialog').close();
    updateControls();
    try {
      // Call the existing action once. The site owns stock loading, local edits,
      // confirmation, server errors, and the actual inventory state update.
      await handler.call(button, event);
      stockMessage = 'Native stock refresh requested. Check the site for completion or errors.';
    } catch (error) {
      stockMessage = `Stock refresh failed: ${error.message}. The request was not retried.`;
      throw error;
    } finally {
      stockBusy = false;
      stockIdentity = null;
      if (ui) ui.querySelector('#stock-status').textContent = stockMessage;
      updateControls();
      void syncStockGate();
    }
  }

  async function readOrders() {
    if (location.origin !== LEGACY_ORIGIN) throw new Error('Tracking actions are not enabled on the new domain yet.');
    const result = await request('/api/user/order');
    if (!Array.isArray(result) || result.some((order) => order.idOrder == null || !order.pt || !order.state)) {
      throw new Error('The order response has an unexpected format. The operation was stopped.');
    }
    return result;
  }

  async function refreshOrders() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const store = findStore();
      const fresh = await readOrders();
      // The app hydrates rawOrders, then recomputes filteredOrders. Replacing
      // this array repairs stale tracking/state without resetting filters/tab.
      const displayed = fresh.map((order) => order.pt?.trackingNumber
        ? { ...order, trackingNumber: order.pt.trackingNumber } : order);
      store.getState().setRawOrders(displayed);
      const expanded = store.getState().expandedOrder;
      if (expanded) store.getState().setExpandedOrder(displayed.find((order) => orderId(order) === orderId(expanded)));
      orders = fresh;
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (labels.length && !busy) reconcile();
      return fresh;
    })();
    try { return await refreshPromise; } finally { refreshPromise = null; }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!autoRefresh || busy || pendingWrites) return;
    refreshTimer = setTimeout(async () => {
      if (busy || pendingWrites || !autoRefresh) return;
      refreshNeeded = false;
      try {
        await refreshOrders();
        status('Orders reloaded after saving. Tracking and order statuses are up to date.');
      } catch (error) { status(`Automatic refresh after saving failed: ${error.message}`, true); }
      if (refreshNeeded) scheduleRefresh();
    }, 500);
  }

  function writeFinished(succeeded) {
    pendingWrites -= 1;
    refreshNeeded ||= succeeded;
    if (!pendingWrites && refreshNeeded) scheduleRefresh();
  }

  // Observe successful native saves, including Axios/XHR. Requests are neither
  // altered nor replayed. The importer suppresses refreshes during its batch.
  if (location.origin === LEGACY_ORIGIN) {
  const originalOpen = page.XMLHttpRequest.prototype.open;
  const originalSend = page.XMLHttpRequest.prototype.send;
  const xhrWrites = new WeakMap();
  page.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    xhrWrites.set(this, isOrderMutation(url, method, location.origin));
    return originalOpen.call(this, method, url, ...rest);
  };
  page.XMLHttpRequest.prototype.send = function (...args) {
    if (!xhrWrites.get(this)) return originalSend.apply(this, args);
    pendingWrites += 1;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      writeFinished(this.status >= 200 && this.status < 300);
    };
    this.addEventListener('loadend', done, { once: true });
    try { return originalSend.apply(this, args); } catch (error) { done(); throw error; }
  };
  const originalFetch = page.fetch;
  page.fetch = function (input, init) {
    const watched = isOrderMutation(typeof input === 'string' || input instanceof URL ? input : input?.url,
      init?.method || input?.method || 'GET', location.origin);
    if (!watched) return originalFetch.call(this, input, init);
    pendingWrites += 1;
    let succeeded = false;
    return originalFetch.call(this, input, init).then((response) => {
      succeeded = response.ok;
      return response;
    }).finally(() => {
      writeFinished(succeeded);
    });
  };
  }

  const rowKey = (row) => `${row.page}:${row.cardmarketOrderId}`;
  const overwrite = () => !!ui?.querySelector('#overwrite').checked;
  function reconcile() {
    const selections = new Map(rows.filter((row) => row.eligible).map((row) => [rowKey(row), row.selected]));
    rows = matchLabels(labels, orders, overwrite()).map((row) => {
      if (!row.same && outcomes.get(rowKey(row))?.startsWith('Saved')) outcomes.delete(rowKey(row));
      return { ...row, selected: row.eligible && (selections.get(rowKey(row)) ?? true) };
    });
    renderRows();
  }

  function renderRows() {
    if (!ui) return;
    const tbody = ui.querySelector('tbody');
    tbody.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      const selection = document.createElement('input');
      selection.type = 'checkbox';
      selection.checked = !!row.selected;
      selection.disabled = busy || !row.eligible;
      selection.setAttribute('aria-label', `Select order ${row.cardmarketOrderId} on page ${row.page}`);
      selection.addEventListener('change', () => { row.selected = selection.checked; updateControls(); });
      const first = document.createElement('td');
      first.append(selection);
      tr.append(first);
      const outcome = outcomes.get(rowKey(row));
      for (const value of [row.page, row.orderCode || '—', row.cardmarketOrderId || '—', row.trackingNumber || '—', row.existing || '—', outcome || row.reason]) {
        const td = document.createElement('td');
        td.textContent = String(value);
        tr.append(td);
      }
      tr.className = outcome?.startsWith('Saved') || row.same ? 'success' : row.eligible ? '' : 'blocked';
      tbody.append(tr);
    }
    updateControls();
  }

  function updateControls() {
    if (!ui) return;
    const selected = rows.filter((row) => row.selected && row.eligible).length;
    ui.querySelector('#apply').disabled = busy || stockBusy || !selected;
    ui.querySelector('#apply').textContent = `Add tracking to ${selected} selected order${selected === 1 ? '' : 's'}`;
    ui.querySelector('#file').disabled = busy;
    ui.querySelector('#overwrite').disabled = busy;
    ui.querySelector('#refresh').disabled = busy;
    ui.querySelector('#stop').hidden = !applying;
    ui.querySelector('#close').disabled = busy || stockBusy;
    ui.querySelector('#back').disabled = busy || stockBusy;
    ui.querySelector('#menu-stock').disabled = location.origin !== LEGACY_ORIGIN || busy || stockBusy;
    ui.querySelector('#summary').textContent = rows.length
      ? `${rows.length} page${rows.length === 1 ? '' : 's'} · Ready ${rows.filter((r) => r.eligible).length} · Already set ${rows.filter((r) => r.same).length} · Review ${rows.filter((r) => !r.eligible && !r.same).length}`
      : 'No PDF selected';
  }

  async function loadFile(file) {
    if (!file || busy) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return status('Please choose a PDF file.', true);
    busy = true;
    labels = [];
    rows = [];
    outcomes.clear();
    renderRows();
    status('Loading the PDF reader and opening the file…');
    try {
      if (!pdfPromise) {
        pdfPromise = import(`${PDF_BASE}pdf.min.mjs`).then((pdfjs) => {
          pdfjs.GlobalWorkerOptions.workerSrc = `${PDF_BASE}pdf.worker.min.mjs`;
          return pdfjs;
        }).catch((error) => { pdfPromise = null; throw new Error(`Could not load the PDF reader: ${error.message}`); });
      }
      const pdfjs = await pdfPromise;
      labels = await extractPdf(new Uint8Array(await file.arrayBuffer()), pdfjs,
        (pageNo, total) => status(`Reading PDF locally: page ${pageNo} of ${total}…`));
      status('PDF read successfully. Loading account orders and checking order IDs and PIDs…');
      orders = await readOrders();
      reconcile();
      status(`Read ${file.name} and loaded ${orders.length} orders. Review the preview before adding tracking.`);
    } catch (error) { status(error.message, true); }
    finally { busy = false; renderRows(); }
  }

  async function applySelected() {
    if (busy) return;
    const selected = rows.filter((row) => row.eligible && row.selected).map((row) => ({ ...row }));
    if (!selected.length) return;
    busy = true;
    applying = true;
    stopRequested = false;
    clearTimeout(refreshTimer);
    outcomes.clear();
    renderRows();
    const attempts = [];
    try {
      findStore(); // Establish refresh compatibility before any external write.
      status('Rechecking selected orders for changes since the preview…');
      const fresh = await readOrders();
      const current = matchLabels(labels, fresh, overwrite());
      for (const [index, row] of selected.entries()) {
        if (stopRequested) break;
        const now = current.find((item) => rowKey(item) === rowKey(row));
        if (!now?.eligible || now.snapshot !== row.snapshot) {
          outcomes.set(rowKey(row), now?.same ? 'Already matches; skipped.' : 'Order details changed or no longer match. Please review again.');
          renderRows();
          continue;
        }
        status(`Saving ${index + 1} of ${selected.length}: ${row.orderCode} · ${row.cardmarketOrderId}`);
        outcomes.set(rowKey(row), 'Saving…');
        renderRows();
        attempts.push(row);
        try {
          await saveTracking(now.order, row.trackingNumber, request);
          outcomes.set(rowKey(row), 'Save request complete; awaiting verification.');
        } catch (error) {
          outcomes.set(rowKey(row), `Unconfirmed: ${error.message}`);
          // An uncertain or partially successful write needs verification before
          // anything else is changed. Do not silently continue/retry the batch.
          stopRequested = true;
        }
        renderRows();
      }
      status('Reloading server orders and verifying saved tracking…');
      const persisted = await refreshOrders();
      for (const row of attempts) {
        // A matching local value cannot replace missing/failed upstream
        // acknowledgement. Retain uncertain request results for review.
        if (outcomes.get(rowKey(row))?.startsWith('Unconfirmed')) continue;
        if (verifySaved(row, persisted)) outcomes.set(rowKey(row), 'Saved and verified');
        else if (!outcomes.get(rowKey(row))?.startsWith('Unconfirmed')) {
          outcomes.set(rowKey(row), 'Readback verification failed. Check the original tracking dialog.');
        }
      }
      const verified = attempts.filter((row) => outcomes.get(rowKey(row)) === 'Saved and verified').length;
      const needsReview = attempts.length - verified;
      status(`Done: ${verified} saved and verified; ${needsReview} need review.${stopRequested ? ' The batch was stopped.' : ''}`, !!needsReview);
    } catch (error) { status(error.message, true); }
    finally {
      busy = false;
      applying = false;
      refreshNeeded = false;
      reconcile();
    }
  }

  function mount() {
    if (host || !document.body) return;
    host = document.createElement('div');
    host.id = 'p9-tcg-tracking-importer';
    host.lang = 'en';
    ui = host.attachShadow({ mode: 'open' });
    ui.innerHTML = `
      <style>
        :host{all:initial;font:14px/1.5 system-ui,-apple-system,sans-serif;color:#18232d}
        *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:1px solid #c4cdd6;border-radius:6px;background:#fff;color:#17364d;padding:8px 13px}
        button:hover{background:#edf4f9}button:disabled{opacity:.5;cursor:default}.primary,#launch{background:#006a98;color:#fff;border-color:#006a98}
        #launch{position:fixed;right:100px;bottom:22px;z-index:2147483000;box-shadow:0 3px 12px #0003;padding:11px 18px;font-weight:600}
        dialog{color:#18232d;background:#fff;border:1px solid #c4cdd6;border-radius:10px;padding:22px;width:min(1140px,94vw);max-height:90vh;box-shadow:0 16px 70px #0004}
        dialog[data-view="menu"],dialog[data-view="settings"]{width:min(500px,94vw)}
        dialog::backdrop{background:#10233480}h2{font-size:20px;margin:0}p{margin:8px 0 15px}.muted{color:#5e6d79}.toolbar,.head,.footer{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.head{justify-content:space-between;margin-bottom:8px}
        label{display:flex;gap:7px;align-items:center}input[type=checkbox]{accent-color:#006a98;width:16px;height:16px}input[type=file]{max-width:100%}.options{margin:14px 0}
        #status{padding:10px 12px;border-radius:5px;background:#edf4f9;overflow-wrap:anywhere}.error{color:#a52225;background:#fff1f1!important}
        #summary{margin:12px 0 8px;color:#526575}.table{overflow:auto;max-height:48vh;border:1px solid #dbe1e6;border-radius:5px}table{border-collapse:collapse;width:100%;font-size:13px}
        th,td{text-align:left;white-space:nowrap;padding:10px 9px;border-bottom:1px solid #e4e9ed}th{position:sticky;top:0;background:#f4f7f9;font-weight:600}td:last-child{white-space:normal;min-width:200px}.blocked td:last-child{color:#a04418}.success td:last-child{color:#176a42}
        .footer{justify-content:space-between;margin-top:16px}.actions{display:flex;gap:8px}#close{padding:4px 10px;font-size:18px}small{display:block;margin-top:9px;color:#657582}[hidden]{display:none!important}
        #back{border:0;padding:0;margin:0 0 10px;background:transparent;font-size:13px;color:#006a98}
        .menu{display:grid;gap:10px;margin:18px 0 4px}.menu button{padding:14px 16px;text-align:left;font-weight:600}
        .menu button:disabled{background:#f4f6f8;color:#81909d}.setting{align-items:flex-start;padding:14px 0}.setting input{flex-shrink:0;margin-top:3px}.setting small{margin-top:5px;font-weight:400}
        #settings-status{margin-bottom:0;font-size:12px}
      </style>
      <button id="launch" type="button">${TOOL_NAME}</button>
      <dialog aria-labelledby="title" data-view="menu">
        <div class="head"><div><button id="back" type="button" hidden>← Back to Menu</button><h2 id="title">${TOOL_NAME}</h2></div><button id="close" type="button" aria-label="Close">×</button></div>
        <section id="menu-view">
          <p class="muted">Choose an action.</p>
          <nav class="menu" aria-label="P9 tools menu">
            <button id="menu-tracking" class="primary" type="button">Add Tracking Number</button>
            <button id="menu-placeholder" type="button" disabled title="Reserved for a future feature">Placeholder</button>
            <button id="menu-stock" type="button">Force Refresh Stock</button>
            <button id="menu-settings" type="button">Settings</button>
          </nav>
        </section>
        <section id="tracking-view" hidden>
          <p class="muted">Upload a label PDF → Review Cardmarket order IDs and PIDs → Select orders and add tracking.</p>
          <div class="toolbar"><input id="file" type="file" accept=".pdf,application/pdf" aria-label="Choose shipping label PDF"><button id="refresh" type="button">Reload Orders and Recheck</button></div>
          <div class="toolbar options"><label><input id="overwrite" type="checkbox">Allow overwriting different tracking numbers</label></div>
          <div id="status" role="status" aria-live="polite"></div><div id="summary"></div>
          <div class="table"><table><thead><tr><th>Select</th><th>Page</th><th>PID</th><th>Cardmarket Order ID</th><th>PDF Tracking</th><th>Current Tracking</th><th>Match / Save Result</th></tr></thead><tbody></tbody></table></div>
          <div class="footer"><span class="muted">PDFs are read locally. Only selected, matched orders are submitted.</span><div class="actions"><button id="stop" type="button" hidden>Stop After Current Order</button><button id="apply" class="primary" type="button" disabled>Add tracking to 0 selected orders</button></div></div>
          <small>Tracking is saved through the site's original actions and verified by reloading orders. Importing tracking does not change packed or sent statuses.</small>
        </section>
        <section id="settings-view" hidden>
          <p class="muted">Preferences are shared by this script across the legacy and new domains.</p>
          <p id="new-domain-note" class="muted" hidden>The new domain currently supports the launcher and shared settings only. Stock and tracking actions remain disabled here.</p>
          <label class="setting"><input id="stay-legacy" type="checkbox"><span>Stay on Legacy App<small>Block automatic navigation from the legacy app to the new app's login-redirect page. Enabled by default; takes effect immediately on open legacy tabs.</small></span></label>
          <label class="setting"><input id="stock-cooldown" type="checkbox"><span>Allow stock refresh during cooldown<small>Unlock the native Refresh Stock button on the legacy Your Stock page. Uses the site's own loading, confirmation and error handling. Disabled by default.</small></span></label>
          <p id="stock-status" class="muted" role="status" aria-live="polite"></p>
          <label class="setting"><input id="auto" type="checkbox"><span>Automatically refresh the order list after native tracking, packed, or sent changes<small>Keep orders up to date after using the site's own tracking and status actions.</small></span></label>
          <p id="settings-status" class="muted" role="status" aria-live="polite">Changes are saved automatically for this script.</p>
        </section>
      </dialog>`;
    document.body.append(host);
    const dialog = ui.querySelector('dialog');
    const views = { menu: TOOL_NAME, tracking: 'Add Tracking Number', settings: 'Settings' };
    const showView = (view) => {
      if (busy || stockBusy) return;
      for (const name of Object.keys(views)) ui.querySelector(`#${name}-view`).hidden = name !== view;
      ui.querySelector('#title').textContent = views[view];
      ui.querySelector('#back').hidden = view === 'menu';
      dialog.dataset.view = view;
      if (dialog.open) ui.querySelector(view === 'menu' ? '#menu-tracking' : view === 'tracking' ? '#file' : '#auto').focus();
    };
    ui.querySelector('#launch').addEventListener('click', () => {
      showView('menu');
      dialog.showModal();
      ui.querySelector('#menu-tracking').focus();
    });
    ui.querySelector('#menu-tracking').addEventListener('click', () => showView('tracking'));
    ui.querySelector('#menu-settings').addEventListener('click', () => showView('settings'));
    ui.querySelector('#menu-stock').addEventListener('click', (event) => {
      if (!isStockPage()) showView('settings');
      void refreshStock(event).catch((error) => { stockMessage = error.message; ui.querySelector('#stock-status').textContent = stockMessage; });
    });
    ui.querySelector('#back').addEventListener('click', () => showView('menu'));
    ui.querySelector('#close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (event) => { if (busy || stockBusy) event.preventDefault(); });
    ui.querySelector('#file').addEventListener('change', (event) => loadFile(event.target.files[0]));
    ui.querySelector('#overwrite').addEventListener('change', reconcile);
    ui.querySelector('#auto').checked = autoRefresh;
    ui.querySelector('#stock-cooldown').checked = stockCooldownBypass;
    ui.querySelector('#stay-legacy').checked = stayOnLegacy;
    ui.querySelector('#auto').addEventListener('change', (event) => setPreference(AUTO_REFRESH_KEY, event.target.checked));
    ui.querySelector('#stock-cooldown').addEventListener('change', (event) => setPreference(STOCK_COOLDOWN_KEY, event.target.checked));
    ui.querySelector('#stay-legacy').addEventListener('change', (event) => setPreference(STAY_LEGACY_KEY, event.target.checked));
    ui.querySelector('#stock-status').textContent = stockMessage;
    const newDomain = location.origin === NEW_ORIGIN;
    ui.querySelector('#new-domain-note').hidden = !newDomain;
    for (const id of ['menu-tracking', 'auto', 'stock-cooldown']) ui.querySelector(`#${id}`).disabled = newDomain;
    ui.querySelector('#stop').addEventListener('click', () => { stopRequested = true; status('Will stop after the current order has been saved and verified.'); });
    ui.querySelector('#apply').addEventListener('click', applySelected);
    ui.querySelector('#refresh').addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      updateControls();
      status('Reloading orders…');
      try { await refreshOrders(); status(`Reloaded ${orders.length} orders and updated the page.`); }
      catch (error) { status(error.message, true); }
      finally { busy = false; reconcile(); }
    });
    status(statusText, statusError);
    updateControls();
    const updateRoute = () => {
      host.hidden = false;
      const route = `${location.origin}${location.pathname}`;
      if (route !== lastRoute) { lastRoute = route; stockIdentity = null; }
      void syncStockGate();
    };
    updateRoute();
    page.addEventListener('popstate', updateRoute);
    page.navigation?.addEventListener('navigatesuccess', updateRoute);
    setInterval(updateRoute, 1500);
    if (location.origin === LEGACY_ORIGIN) {
      document.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-testid="get-stock-btn"]');
        if (!stockCooldownBypass || !button || !unlockedStockButtons.has(button)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void refreshStock(event).catch((error) => { stockMessage = error.message; ui.querySelector('#stock-status').textContent = stockMessage; });
      }, true);
      const observer = new MutationObserver(() => { void syncStockGate(); });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'style', 'class'] });
    }
  }

  page.P9TCGPowerTools = Object.freeze({ version: VERSION, preferences, setPreference, refreshOrders, refreshStock, syncStockGate });
  page.P9TrackingImporter = page.P9TCGPowerTools;
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
