// All order identifiers and tracking values in this file are fictional.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseLabelText, matchLabels, saveTracking, verifySaved, isOrderMutation,
} = require('../p9-tcgpowertools.user.js');

const label = (extra = {}) => ({
  page: 1, orderCode: 'A04', cardmarketOrderId: '9900000004', trackingNumber: 'QM900000040GB', error: '', ...extra,
});
const order = (extra = {}) => ({
  idOrder: 9900000004, trackingNumber: '', state: { state: 'sent' },
  pt: { picking: { pickingId: 'A04' } }, ...extra,
});

test('parses Customer Ref rather than routing code; preserves A04 and splits tracking text', () => {
  assert.deepEqual(parseLabelText('R35 A4\nQM\n9000 0004 0GB\nCustomer Ref:\n10704 / A04 (6) 9900000004', 4), label({ page: 4 }));
});

test('parses the split order reference and SKU format with the Royal Mail order prefix', () => {
  assert.deepEqual(parseLabelText('R35 A4\nQM 9000 0004 0GB\nCustomer Ref:\n10704 / 9900000004\nSKU: A04 (6)', 4), label({ page: 4 }));
});

test('supports a bare numeric reference and SKU text without a printed SKU heading', () => {
  assert.deepEqual(parseLabelText('QM900000040GB\nCustomer Ref: 9900000004\nA04 (6)', 1), label());
});

test('does not append the Royal Mail printed SKU quantity prefix to the order ID', () => {
  for (const prefix of ['20x ', '20X ', '20× ', '20\nx\n', '1x ']) {
    assert.deepEqual(parseLabelText(`QM900000040GB\nCustomer Ref: 10704 / 9900000004\n${prefix}A04 (20)`, 1), label());
  }
});

test('does not depend on SKU paint order and handles PDF text-item digit splits', () => {
  assert.deepEqual(parseLabelText('SKU:\nA\n0\n4 (2\n0)\nQM 9000 0004 0GB\nCustomer Ref: 90001 / 99000\n00004', 1), label());
});

test('does not substitute a routing code for a missing SKU', () => {
  const row = parseLabelText('R35 A04\nQM900000040GB\nCustomer Ref: 90001 / 9900000004', 1);
  assert.equal(row.orderCode, '');
  assert.equal(row.cardmarketOrderId, '9900000004');
  assert.match(row.error, /SKU is missing/);
});

test('blocks conflicting SKU tokens or quantities instead of taking the first one', () => {
  for (const sku of ['SKU: A04 (6) B05 (2)', 'SKU: A04 (6) A04 (7)']) {
    assert.match(parseLabelText(`QM900000040GB\nCustomer Ref: 90001 / 9900000004\n${sku}`, 1).error, /Conflicting/);
  }
});

test('keeps legacy references compatible and checks conflicting extra SKU data', () => {
  const text = 'QM900000040GB\nCustomer Ref: 10704 / A04 (6) 9900000004';
  assert.deepEqual(parseLabelText(`${text}\nSKU: A04 (6)`, 1), label());
  assert.match(parseLabelText(`${text}\nSKU: B05 (6)`, 1).error, /Conflicting/);
  assert.deepEqual(parseLabelText('QM900000040GB\nCustomer Ref: 123456789 / A04 (6) 9900000004', 1), label());
});

test('rejects multiple reference headings even if only one reference is valid', () => {
  const row = parseLabelText('QM900000040GB\nCustomer Ref: 90001 / 9900000004\nSKU: A04 (6)\nCustomer Ref: missing', 1);
  assert.match(row.error, /Multiple/);
});

test('never takes a missing SKU from a different PDF page', async () => {
  const { extractPdf } = require('../p9-tcgpowertools.user.js');
  const text = [
    'QM900000040GB\nCustomer Ref: 90001 / 9900000004',
    'QM900000053GB\nCustomer Ref: 90002 / 9900000002\nSKU: A02 (7)',
  ];
  let destroyed = false;
  const rows = await extractPdf(new Uint8Array(), {
    getDocument: () => ({
      promise: Promise.resolve({ numPages: 2, getPage: async (n) => ({
        getTextContent: async () => ({ items: text[n - 1].split('\n').map(str => ({ str })) }), cleanup() {},
      }) }), destroy: async () => { destroyed = true; },
    }),
  });
  assert.match(rows[0].error, /SKU is missing/);
  assert.equal(rows[0].orderCode, '');
  assert.equal(rows[1].orderCode, 'A02');
  assert.equal(rows[1].error, '');
  assert.equal(destroyed, true);
});

test('rejects scans, missing reference, missing tracking and multi-label pages', () => {
  assert.match(parseLabelText('', 1).error, /text layer/);
  assert.match(parseLabelText('QM900000040GB', 1).error, /Customer Ref/);
  assert.match(parseLabelText('Customer Ref: 10704 / A04 (6) 9900000004', 1).error, /tracking/);
  assert.match(parseLabelText('Customer Ref: 1 / A04 (6) 9900000004 QM900000040GB QM900000053GB', 1).error, /Multiple/);
});

test('requires exact Cardmarket ID and PID, never falls back to a recycled PID', () => {
  assert.equal(matchLabels([label()], [order()])[0].eligible, true);
  assert.equal(matchLabels([label()], [order({ idOrder: 9900000099 })])[0].eligible, false);
  assert.match(matchLabels([label()], [order({ pt: { picking: { pickingId: 'A4' } } })])[0].reason, /PID mismatch/);
  assert.equal(matchLabels([label()], [order({ pt: {} })])[0].eligible, false);
  assert.match(matchLabels([label()], [order(), order()])[0].reason, /Duplicate order ID/);
});

test('skips identical values and requires explicit overwrite for any different value', () => {
  const saved = order({ trackingNumber: 'QM 9000 0004 0GB' });
  assert.equal(matchLabels([label()], [saved])[0].same, true);
  assert.equal(matchLabels([label()], [saved], true)[0].eligible, false);
  const old = order({ trackingNumber: 'QM900000019GB' });
  assert.equal(matchLabels([label()], [old])[0].eligible, false);
  assert.equal(matchLabels([label()], [old], true)[0].eligible, true);
  const disagrees = order({ trackingNumber: label().trackingNumber, pt: { picking: { pickingId: 'A04' }, trackingNumber: 'QM900000019GB' } });
  assert.equal(matchLabels([label()], [disagrees])[0].same, false);
  assert.equal(matchLabels([label()], [disagrees])[0].eligible, false);
});

test('uses the saved local tracking when the Cardmarket order cache is older', () => {
  const cached = order({ trackingNumber: 'QM900000019GB', pt: { picking: { pickingId: 'A04' }, trackingNumber: label().trackingNumber } });
  const match = matchLabels([label()], [cached])[0];
  assert.equal(match.same, true);
  assert.equal(match.eligible, false);
  assert.equal(match.existing, label().trackingNumber);
});

test('deduplicates repeated labels and blocks conflicts or shared tracking across orders', () => {
  const duplicate = matchLabels([label(), label({ page: 2 })], [order()]);
  assert.equal(duplicate.filter((row) => row.eligible).length, 1);
  const conflict = matchLabels([label(), label({ page: 2, trackingNumber: 'QM900000053GB' })], [order()]);
  assert.equal(conflict.some((row) => row.eligible), false);
  const shared = matchLabels([label(), label({ page: 2, cardmarketOrderId: '9900000002' })], [order(), order({ idOrder: 9900000002 })]);
  assert.equal(shared.some((row) => row.eligible), false);
});

test('saves via the native two-call sequence using the exact server ID type', async () => {
  const calls = [];
  await saveTracking(order(), label().trackingNumber, async (...args) => { calls.push(args); return { order: { idOrder: 9900000004, trackingNumber: label().trackingNumber } }; });
  assert.deepEqual(calls, [
    ['/api/user/order/setTrackingNumber', { method: 'PUT', body: { idOrder: 9900000004, trackingNumber: 'QM900000040GB' } }],
    ['/api/user/order/changeOrderProp', { method: 'PUT', body: { idOrder: 9900000004, prop: 'trackingNumber', value: 'QM900000040GB' } }],
  ]);
});

test('does not perform a local-only save or retry when the first native call fails', async () => {
  let calls = 0;
  await assert.rejects(saveTracking(order(), label().trackingNumber, async () => { calls += 1; throw new Error('network failed'); }), /network failed/);
  assert.equal(calls, 1);
});

test('reports a second-call failure instead of treating a partial save as success', async () => {
  let calls = 0;
  await assert.rejects(saveTracking(order(), label().trackingNumber, async () => { calls += 1; if (calls === 2) throw new Error('local save failed'); return { order: { idOrder: 9900000004, trackingNumber: label().trackingNumber } }; }), /local save failed/);
  assert.equal(calls, 2);
});

test('HTTP 200 without confirmation of the exact upstream ID/tracking cannot cause a local-only save', async () => {
  for (const response of [{}, { order: { idOrder: 999, trackingNumber: label().trackingNumber } }, { order: { idOrder: 9900000004, trackingNumber: 'QM900000019GB' } }]) {
    let calls = 0;
    await assert.rejects(saveTracking(order(), label().trackingNumber, async () => { calls += 1; return response; }), /Cardmarket/);
    assert.equal(calls, 1);
  }
});

test('readback requires exact ID/PID and the persisted local value, independently of stale Cardmarket cache', () => {
  const saved = order({ trackingNumber: 'QM900000019GB', pt: { picking: { pickingId: 'A04' }, trackingNumber: label().trackingNumber } });
  assert.equal(verifySaved(label(), [saved]), true);
  assert.equal(verifySaved(label(), []), false);
  assert.equal(verifySaved(label(), [order()]), false);
  assert.equal(verifySaved(label(), [order({ trackingNumber: label().trackingNumber })]), false);
  assert.equal(verifySaved(label(), [saved, saved]), false);
  assert.equal(verifySaved(label(), [order({ trackingNumber: label().trackingNumber, pt: { picking: { pickingId: 'B04' } } })]), false);
  assert.equal(verifySaved(label(), [order({ trackingNumber: label().trackingNumber, pt: { picking: { pickingId: 'A04' }, trackingNumber: 'QM900000019GB' } })]), false);
});

test('refresh hook watches only same-origin native order saves', () => {
  const origin = 'https://app.tcgpowertools.com';
  for (const path of ['setTrackingNumber', 'changeOrderProp', 'changeOrdersState']) {
    assert.equal(isOrderMutation(`/api/user/order/${path}`, 'PUT', origin), true);
  }
  assert.equal(isOrderMutation('/api/user/order', 'GET', origin), false);
  assert.equal(isOrderMutation('/api/user/stock', 'PUT', origin), false);
  assert.equal(isOrderMutation('https://other.test/api/user/order/setTrackingNumber', 'PUT', origin), false);
});
