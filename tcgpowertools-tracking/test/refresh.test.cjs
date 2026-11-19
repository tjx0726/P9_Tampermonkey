// All order identifiers and tracking values in this file are fictional.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../tcgpowertools-royal-mail-tracking.user.js'), 'utf8');

function runtime({ autoRefresh = true, storageUnavailable = false } = {}) {
  const originalFilters = ['Magic', 'picked', 'packed', 'sent'];
  const state = {
    orders: [], rawOrders: [], activeTab: 3, activeOrdersFilters: originalFilters,
    setOrders(value) { state.orders = value; },
    setRawOrders(value) { state.rawOrders = value; state.orders = value; },
  };
  const store = { getState: () => state, setState: (patch) => Object.assign(state, patch) };
  const requests = [];
  const persisted = [{ idOrder: 9900000004, trackingNumber: 'QM900000019GB', state: { state: 'packed' }, pt: { picking: { pickingId: 'A04' }, trackingNumber: 'QM900000040GB' } }];
  let failWrites = false;
  class XHR extends EventTarget {
    open(method, url) { this.method = method; this.url = url; }
    send() {}
    complete(status) { this.status = status; this.dispatchEvent(new Event('loadend')); }
  }
  const context = {
    document: { body: null, addEventListener() {} },
    location: { origin: 'https://app.tcgpowertools.com', pathname: '/orders' },
    XMLHttpRequest: XHR, URL, AbortController, console,
    localStorage: { getItem() { if (storageUnavailable) throw new Error('Storage unavailable'); return String(autoRefresh); } },
    setTimeout: (callback, delay) => setTimeout(callback, delay === 30000 ? delay : Math.min(delay, 5)),
    clearTimeout,
    fetch: async (path, init) => {
      requests.push({ path, method: init?.method || 'GET' });
      if (init?.method === 'PUT') {
        if (failWrites) throw new Error('network unavailable');
        return { ok: true };
      }
      return { ok: true, text: async () => JSON.stringify(persisted) };
    },
  };
  context.window = context;
  context.top = context;
  context.self = context;
  const require = { c: { 200: { exports: { orderStore: store } } }, m: {} };
  const chunks = [];
  chunks.push = (chunk) => {
    const key = chunk[0][0];
    require.m[key] = chunk[1][key];
    require.c[key] = { exports: {} };
    chunk[1][key](require.c[key], require.c[key].exports, require);
  };
  context['webpackJsonppowertools-client'] = chunks;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, state, requests, persisted, originalFilters, failWrites: () => { failWrites = true; } };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 45));

test('native Axios/XHR tracking and packed/sent saves refresh the actual store without resetting filters', async () => {
  for (const endpoint of ['setTrackingNumber', 'changeOrderProp', 'changeOrdersState']) {
    const { context, state, requests, originalFilters } = runtime();
    const xhr = new context.XMLHttpRequest();
    xhr.open('PUT', `/api/user/order/${endpoint}`);
    xhr.send();
    xhr.complete(200);
    await settle();
    assert.equal(requests.filter((r) => r.method === 'GET').length, 1);
    assert.equal(state.orders[0].state.state, 'packed');
    assert.equal(state.orders[0].pt.trackingNumber, 'QM900000040GB');
    assert.equal(state.orders[0].trackingNumber, 'QM900000040GB');
    assert.equal(state.activeTab, 3);
    assert.equal(state.activeOrdersFilters, originalFilters);
  }
});

test('successful native fetch saves also trigger a store refresh', async () => {
  const { context, state, requests } = runtime();
  await context.fetch('/api/user/order/setTrackingNumber', { method: 'PUT' });
  await settle();
  assert.equal(requests.length, 2);
  assert.equal(state.orders.length, 1);
});

test('failed saves and unrelated APIs never trigger refresh', async () => {
  const { context, requests, failWrites } = runtime();
  const xhr = new context.XMLHttpRequest();
  xhr.open('PUT', '/api/user/order/changeOrdersState');
  xhr.send();
  xhr.complete(500);
  const unrelated = new context.XMLHttpRequest();
  unrelated.open('PUT', '/api/user/stock');
  unrelated.send();
  unrelated.complete(200);
  failWrites();
  await assert.rejects(context.fetch('/api/user/order/setTrackingNumber', { method: 'PUT' }));
  await settle();
  assert.equal(requests.filter((r) => r.method === 'GET').length, 0);
});

test('concurrent saves are coalesced, including a successful save followed by a failure', async () => {
  const { context, requests } = runtime();
  const first = new context.XMLHttpRequest();
  const last = new context.XMLHttpRequest();
  first.open('PUT', '/api/user/order/setTrackingNumber');
  last.open('PUT', '/api/user/order/changeOrderProp');
  first.send(); last.send();
  first.complete(200); last.complete(500);
  await settle();
  assert.equal(requests.filter((r) => r.method === 'GET').length, 1);
});

test('a saved disabled setting prevents native saves from automatically reloading orders', async () => {
  const { context, requests } = runtime({ autoRefresh: false });
  await context.fetch('/api/user/order/setTrackingNumber', { method: 'PUT' });
  const xhr = new context.XMLHttpRequest();
  xhr.open('PUT', '/api/user/order/changeOrdersState');
  xhr.send(); xhr.complete(200);
  await settle();
  assert.equal(requests.filter((r) => r.method === 'GET').length, 0);
});

test('unavailable browser storage keeps the default refresh behavior working', async () => {
  const { context, requests } = runtime({ storageUnavailable: true });
  await context.fetch('/api/user/order/setTrackingNumber', { method: 'PUT' });
  await settle();
  assert.equal(requests.filter((r) => r.method === 'GET').length, 1);
});
