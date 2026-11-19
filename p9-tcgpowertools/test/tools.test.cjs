const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { isLegacyRedirect, nativeStockHandler } = require('../p9-tcgpowertools.user.js');
const source = fs.readFileSync(require.resolve('../p9-tcgpowertools.user.js'), 'utf8');
const legacySource = fs.readFileSync(require.resolve('../../tcgpowertools-block-redirect/tcgpowertools-stay-on-legacy.user.js'), 'utf8');
const KEYS = { stock: 'p9.tcg.tools.stockCooldownBypass', legacy: 'p9.tcg.tools.stayOnLegacy', auto: 'p9.tcg.tracking.autoRefresh' };
const settle = () => new Promise(resolve => setTimeout(resolve, 15));

function sharedStorage() {
  const values = new Map();
  const listeners = new Map();
  return {
    values,
    GM_getValue: key => values.get(key),
    GM_setValue(key, value) {
      const previous = values.get(key);
      values.set(key, value);
      if (previous !== value) for (const listener of listeners.get(key) || []) listener(key, previous, value, true);
    },
    GM_addValueChangeListener(key, listener) {
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push(listener);
    },
  };
}

function runtime({ origin = 'https://app.tcgpowertools.com', pathname = '/stock-pricing', shared, local = {}, callback = async () => {}, dialog = false, ariaButton = false, isolatedWindow = false, hostileExport = false, fetchedAt = Date.now() - 60000 } = {}) {
  const attributes = new Map([['aria-disabled', 'true']]);
  const classes = new Set(['Mui-disabled']);
  const button = {
    disabled: true, isConnected: true, style: { pointerEvents: 'none' },
    classList: { contains: name => classes.has(name), remove: name => classes.delete(name), toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    __reactProps$fixture: { disabled: true, style: { pointerEvents: 'none' }, onClick: callback },
  };
  if (ariaButton) {
    delete button.disabled;
    delete button.__reactProps$fixture.disabled;
    button.__reactProps$fixture['aria-disabled'] = true;
  }
  const storage = new Map(Object.entries(local));
  const navigation = new Map();
  const requests = [];
  class XHR extends EventTarget { open() {} send() {} }
  const originalOpen = XHR.prototype.open;
  const database = { config: () => ({ name: 'Powertools-v2' }), getItem: async () => ({ fetchedAtTimestamp: fetchedAt }), setItem() {} };
  const require = { c: { 91: { exports: { database } } }, m: {} };
  if (hostileExport) require.c[2] = { exports: { foreignWindow: new Proxy({}, { get() { throw new Error('Cross-origin frame access blocked'); } }) } };
  const chunks = [];
  chunks.push = chunk => {
    const key = chunk[0][0];
    require.m[key] = chunk[1][key];
    require.c[key] = { exports: {} };
    chunk[1][key](require.c[key], require.c[key].exports, require);
  };
  const context = {
    ...(shared || {}),
    document: { body: null, addEventListener() {}, querySelector: () => button, querySelectorAll: () => dialog ? [{ getClientRects: () => [1] }] : [] },
    location: { origin, pathname },
    navigation: { addEventListener: (type, listener) => { if (!navigation.has(type)) navigation.set(type, []); navigation.get(type).push(listener); } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    XMLHttpRequest: XHR, URL, AbortController, console, setTimeout, clearTimeout,
    fetch: async (path) => { requests.push(path); return { ok: true, text: async () => JSON.stringify({ cardmarketUsername: 'FixtureSeller' }) }; },
    'webpackJsonppowertools-client': chunks,
  };
  context.window = context;
  context.top = context;
  context.self = context;
  if (isolatedWindow) { context.unsafeWindow = context; context.window = {}; }
  const originalFetch = context.fetch;
  vm.createContext(context);
  vm.runInContext(source, context);
  const navigate = (url, cancelable = true) => {
    const event = { destination: { url }, cancelable, prevented: false, preventDefault() { this.prevented = true; } };
    for (const listener of navigation.get('navigate') || []) listener(event);
    return event;
  };
  return { context, api: context.P9TCGPowerTools, button, requests, navigate, originalFetch, originalOpen, storage };
}

test('redirect matching only targets the exact new-app login redirect', () => {
  for (const url of ['https://new.tcgpowertools.com/login-redirect?token=fictional', 'https://new.tcgpowertools.com/login-redirect/']) assert.equal(isLegacyRedirect(url), true);
  for (const url of ['https://new.tcgpowertools.com/orders', 'https://new.tcgpowertools.com.evil.example/login-redirect', 'https://app.tcgpowertools.com/login-redirect', 'invalid']) assert.equal(isLegacyRedirect(url), false);
});

test('legacy protection defaults on and honors live disable/enable without blocking unrelated navigation', () => {
  const r = runtime();
  assert.equal(r.api.preferences().stayOnLegacy, true);
  assert.equal(r.api.preferences().stockCooldownBypass, false);
  assert.equal(r.navigate('https://new.tcgpowertools.com/login-redirect').prevented, true);
  r.api.setPreference(KEYS.legacy, false);
  assert.equal(r.navigate('https://new.tcgpowertools.com/login-redirect').prevented, false);
  r.api.setPreference(KEYS.legacy, true);
  assert.equal(r.navigate('https://new.tcgpowertools.com/orders').prevented, false);
  assert.equal(r.navigate('https://new.tcgpowertools.com/login-redirect', false).prevented, false);
});

test('a preference changed on the new domain immediately changes legacy redirect protection', () => {
  const shared = sharedStorage();
  const old = runtime({ shared });
  const modern = runtime({ shared, origin: 'https://new.tcgpowertools.com' });
  modern.api.setPreference(KEYS.legacy, false);
  assert.equal(old.api.preferences().stayOnLegacy, false);
  assert.equal(old.navigate('https://new.tcgpowertools.com/login-redirect').prevented, false);
  modern.api.setPreference(KEYS.legacy, true);
  assert.equal(old.navigate('https://new.tcgpowertools.com/login-redirect').prevented, true);
});

test('existing order-refresh preferences migrate from local storage into shared script storage', () => {
  const shared = sharedStorage();
  runtime({ shared, local: { [KEYS.auto]: 'false' } });
  const modern = runtime({ shared, origin: 'https://new.tcgpowertools.com' });
  assert.equal(modern.api.preferences().autoRefresh, false);
});

test('the new domain installs no order request hooks or stock actions', async () => {
  const r = runtime({ origin: 'https://new.tcgpowertools.com' });
  assert.ok(r.api);
  assert.equal(r.context.fetch, r.originalFetch);
  assert.equal(r.context.XMLHttpRequest.prototype.open, r.originalOpen);
  await assert.rejects(r.api.refreshStock(), /not enabled on the new domain/);
  assert.equal(r.requests.length, 0);
});

test('cooldown switch unlocks the native button and disabling restores native disabled state', async () => {
  const r = runtime();
  r.api.setPreference(KEYS.stock, true);
  await settle();
  assert.equal(r.button.disabled, false);
  assert.equal(r.button.style.pointerEvents, 'auto');
  assert.equal(r.button.getAttribute('data-p9-cooldown-unlocked'), 'true');
  assert.deepEqual(r.requests, ['/api/user']);
  r.api.setPreference(KEYS.stock, false);
  assert.equal(r.button.disabled, true);
  assert.equal(r.button.style.pointerEvents, 'none');
  assert.equal(r.button.getAttribute('data-p9-cooldown-unlocked'), null);
});

test('cooldown bypass keeps native loading dialogs locked and does not override an expired cooldown', async () => {
  for (const options of [{ dialog: true }, { fetchedAt: Date.now() - 7200000 }, { pathname: '/orders' }]) {
    const r = runtime(options);
    r.api.setPreference(KEYS.stock, true);
    await settle();
    assert.equal(r.button.disabled, true);
    assert.equal(r.button.getAttribute('data-p9-cooldown-unlocked'), null);
  }
});

test('cooldown bypass supports the live site aria-disabled menuitem and restores it when disabled', async () => {
  const r = runtime({ ariaButton: true });
  r.api.setPreference(KEYS.stock, true);
  await settle();
  assert.equal(r.button.getAttribute('aria-disabled'), 'false');
  assert.equal(r.button.style.pointerEvents, 'auto');
  assert.equal('disabled' in r.button, false);
  r.api.setPreference(KEYS.stock, false);
  assert.equal(r.button.getAttribute('aria-disabled'), 'true');
  assert.equal(r.button.style.pointerEvents, 'none');
});

test('the native stock adapter reads the app runtime through unsafeWindow when the userscript window is isolated', async () => {
  const r = runtime({ ariaButton: true, isolatedWindow: true });
  r.api.setPreference(KEYS.stock, true);
  await settle();
  assert.equal(r.button.getAttribute('aria-disabled'), 'false');
  assert.equal(r.button.style.pointerEvents, 'auto');
});

test('unrelated cross-origin Window exports cannot break stock-module discovery', async () => {
  const r = runtime({ ariaButton: true, hostileExport: true });
  r.api.setPreference(KEYS.stock, true);
  await settle();
  assert.equal(r.button.getAttribute('aria-disabled'), 'false');
});

test('force refresh calls the native action once and suppresses simultaneous clicks', async () => {
  let finish;
  let calls = 0;
  const r = runtime({ callback: () => { calls += 1; return new Promise(resolve => { finish = resolve; }); } });
  const pending = r.api.refreshStock();
  await r.api.refreshStock();
  assert.equal(calls, 1);
  finish();
  await pending;
  assert.equal(r.requests.length, 0); // No extra direct stock request or duplicated native request.
});

test('a failed native refresh is not retried and force refresh is unavailable off the stock page', async () => {
  let calls = 0;
  const r = runtime({ callback: async () => { calls += 1; throw new Error('HTTP 429'); } });
  await assert.rejects(r.api.refreshStock(), /HTTP 429/);
  assert.equal(calls, 1);
  const other = runtime({ pathname: '/orders', callback: () => { calls += 1; } });
  await other.api.refreshStock();
  assert.equal(calls, 1);
});

test('the native handler adapter fails closed when the site changes its event binding', () => {
  assert.throws(() => nativeStockHandler({}), /unavailable/);
  assert.throws(() => nativeStockHandler({ __reactProps$test: { onClick: null } }), /unavailable/);
});

test('the old standalone blocker yields to the merged plugin but still works by itself', () => {
  const merged = runtime();
  merged.api.setPreference(KEYS.legacy, false);
  vm.runInContext(legacySource, merged.context);
  assert.equal(merged.navigate('https://new.tcgpowertools.com/login-redirect').prevented, false);
  const listeners = [];
  const separate = { window: { navigation: { addEventListener: (type, fn) => listeners.push(fn) } }, URL, console };
  vm.runInNewContext(legacySource, separate);
  let prevented = false;
  listeners[0]({ destination: { url: 'https://new.tcgpowertools.com/login-redirect' }, cancelable: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});
