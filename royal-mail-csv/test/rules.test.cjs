const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, stringifyCsv, processCsv } = require('../royal-mail-csv.user.js');

const HEADERS = [
  'idOrder', 'PID', 'articles', 'issues', 'shippingMethod',
  'shippingAddressName', 'shippingAddressExtra', 'shippingAddressStreet',
  'shippingAddressCity', 'shippingAddressZip', 'phone', 'note',
];
const base = {
  idOrder: '001234', PID: '007', articles: '1', issues: '',
  shippingMethod: 'Tracked 48 (Real Tracked Service)',
  shippingAddressName: 'Example Customer', shippingAddressExtra: '',
  shippingAddressStreet: '10 Example Street', shippingAddressCity: 'London',
  shippingAddressZip: '01234', phone: '07123456789', note: '',
};
const input = (records, headers = HEADERS) => stringifyCsv(headers, records.map((record) => {
  const values = { ...base, ...record };
  return headers.map((header) => values[header] ?? '');
}));
const objects = (result) => result.rows.map((row) => Object.fromEntries(result.headers.map((header, index) => [header, row[index]])));

test('CSV parser supports BOM, CRLF, quoted commas, escaped quotes and multiline fields', () => {
  assert.deepEqual(parseCsv('\uFEFFid,note\r\n001,"a,b"\r\n002,"a ""quote""\r\nnext line"\r\n'), {
    headers: ['id', 'note'], rows: [['001', 'a,b'], ['002', 'a "quote"\r\nnext line']],
  });
});

test('CSV writer escapes fields and uses CRLF with a final newline', () => {
  assert.equal(stringifyCsv(['a', 'b'], [['a,b', 'a"b'], ['', 'line\nnext']]), 'a,b\r\n"a,b","a""b"\r\n,"line\nnext"\r\n');
});

test('CSV parsing skips blank lines and pads missing trailing cells', () => {
  assert.deepEqual(parseCsv('id,note\n\n \n001\n002,\n'), { headers: ['id', 'note'], rows: [['001', ''], ['002', '']] });
});

for (const [label, csv] of [
  ['empty file', ' \n'], ['unclosed quote', 'a,b\n1,"x'],
  ['stray quote', 'a,b\n1,x"y'], ['characters after quote', 'a,b\n1,"x"y'],
  ['duplicate header', 'a,a\n1,2'], ['empty header', 'a,\n1,2'],
  ['extra column', 'a,b\n1,2,3'],
]) {
  test(`Rejects malformed CSV: ${label}`, () => assert.throws(() => parseCsv(csv)));
}

test('Default options keep only missing issues and exactly []', () => {
  const result = processCsv(input([
    { idOrder: '1', issues: '' }, { idOrder: '2', issues: '[]' },
    { idOrder: '3', issues: 'Missing article' }, { idOrder: '4', issues: '[ ]' },
    { idOrder: '5', issues: 'nan' }, { idOrder: '6', issues: 'NaN' },
  ]));
  assert.deepEqual(objects(result).map((row) => row.idOrder), ['1', '2', '5', '6']);
  assert.equal(result.stats.removed, 2);
});

test('Address cleaning removes non-ASCII characters without transliteration', () => {
  const result = processCsv(input([{
    shippingAddressName: 'José 李😀', shippingAddressExtra: 'étage 2',
    shippingAddressStreet: 'Straße 1', shippingAddressCity: 'Zürich',
    shippingAddressZip: '01234é', note: 'Keep 李😀 and commas, here',
  }]));
  const [row] = objects(result);
  assert.equal(row.shippingAddressName, 'Jos ');
  assert.equal(row.shippingAddressExtra, 'tage 2');
  assert.equal(row.shippingAddressStreet, 'Strae 1');
  assert.equal(row.shippingAddressCity, 'Zrich');
  assert.equal(row.shippingAddressZip, '01234');
  assert.equal(row.note, 'Keep 李😀 and commas, here');
  assert.equal(result.stats.cleanedFields, 5);
});

const serviceCases = [
  ['UK Standard Letter (2nd Class)', '1', 'BPL2', '0.1', 'Letter'],
  ['UK Standard Large Letter (2nd Class)', '50', 'BPL2', '0.1', 'Letter'],
  ['UK Standard Large Letter (2nd Class)', '51', 'BPL2', '0.3', 'Large letter'],
  ['UK Standard Large Letter (2nd Class)', '', 'BPL2', '0.1', 'Letter'],
  ['UK Standard Letter (1st Class)', '1', 'BPL1', '0.1', 'Letter'],
  ['UK Standard Large Letter (1st Class)', '75', 'BPL1', '0.1', 'Letter'],
  ['UK Signed Large Letter (2nd Class Signed For)', '1', 'TRS48', '0.1', 'Large letter'],
  ['UK Signed Large Letter (1st Class Signed For)', '1', 'TRN24', '0.1', 'Large letter'],
  ['Tracked 48 (Real Tracked Service)', '1', 'TRS48', '0.1', 'Large letter'],
  ['Tracked 48 LBT (Real Tracked Service)', '1', 'TRS48', '0.1', 'Large letter'],
  ['UK Confirmed Large Letter (2nd Class Signed For)', '1', 'TRS48', '0.1', 'Large letter'],
  ['UK Signed Large Letter (2nd Class Signed For) (Online)', '1', 'TRS48', '0.1', 'Large letter'],
  ['Tracked 24 (Real Tracked Service)', '1', 'TRN24', '0.1', 'Large letter'],
  ['Special Delivery 1PM insured for 750 GBP', '1', 'SD1', '0.1', 'Large letter'],
];
for (const [method, articles, serviceCode, weight, format] of serviceCases) {
  test(`Service mapping: ${method}, articles=${articles || '(empty)'}`, () => {
    const result = processCsv(input([{ shippingMethod: method, articles }]));
    const [row] = objects(result);
    assert.deepEqual([row.serviceCode, row.weight, row.format], [serviceCode, weight, format]);
    assert.doesNotMatch(result.warnings.join(' '), /Unmatched shipping methods/);
    if (articles) assert.deepEqual(result.warnings, []);
  });
}

test('Phone, postcode, IDs and source article strings retain leading zeroes', () => {
  const [row] = objects(processCsv(input([{ articles: '003' }])));
  assert.equal(row.phone, '07123456789');
  assert.equal(row.shippingAddressZip, '01234');
  assert.equal(row.idOrder, '001234');
  assert.equal(row.PID, '007');
  assert.equal(row.new_reference, '001234');
  assert.equal(row.SKU, '007 (003)');
});

test('Cardmarket order number is the reference and PID plus count is the label SKU', () => {
  const result = processCsv(input([{ idOrder: '1304117031', PID: 'A17', articles: '20' }]));
  const [row] = objects(result);
  assert.equal(row.new_reference, '1304117031');
  assert.equal(row.SKU, 'A17 (20)');
  assert.equal(row.PID, 'A17');
  assert.deepEqual(result.warnings, []);
});

test('Changing picking information never changes the Cardmarket order reference', () => {
  const result = processCsv(input([
    { idOrder: '1304117031', PID: 'A17', articles: '20' },
    { idOrder: '1304117031', PID: 'B05 / C06', articles: '21' },
  ]));
  assert.deepEqual(objects(result).map(row => [row.new_reference, row.SKU]), [
    ['1304117031', 'A17 (20)'], ['1304117031', 'B05 / C06 (21)'],
  ]);
});

test('Missing picking data leaves SKU blank without changing the order reference', () => {
  for (const record of [{ PID: '' }, { articles: '' }]) {
    const result = processCsv(input([record]));
    const [row] = objects(result);
    assert.equal(row.new_reference, '001234');
    assert.equal(row.SKU, '');
    assert.match(result.warnings.join(' '), /blank SKU/);
  }
});

test('A missing Cardmarket order number fails instead of generating an empty reference', () => {
  assert.throws(() => processCsv(input([{ idOrder: '' }])), /no Cardmarket order number/);
  assert.equal(processCsv(input([{ idOrder: '', issues: 'Missing article' }])).stats.kept, 0);
});

test('Long SKUs warn about label truncation and retain their complete CSV values', () => {
  const pid = 'A'.repeat(45);
  const result = processCsv(input([{ PID: pid, articles: '20' }]));
  assert.equal(objects(result)[0].SKU, `${pid} (20)`);
  assert.match(result.warnings.join(' '), /43 characters/);
});

test('Reprocessing a processed CSV keeps one reference and SKU column with stable values', () => {
  const first = processCsv(input([{ idOrder: '1304117031', PID: 'A17', articles: '20' }]));
  const second = processCsv(first.csv);
  assert.deepEqual(second.headers, first.headers);
  assert.deepEqual(second.rows, first.rows);
  assert.equal(second.headers.filter(header => header === 'SKU').length, 1);
});

test('Unmatched methods remain blank and generate a warning without guessing', () => {
  const headers = [...HEADERS, 'serviceCode', 'weight', 'format', 'new_reference'];
  const result = processCsv(input([{
    shippingMethod: 'Unmapped Test Service',
    serviceCode: 'OLD', weight: '99', format: 'OLD', new_reference: 'OLD',
  }], headers));
  const [row] = objects(result);
  assert.deepEqual([row.serviceCode, row.weight, row.format], ['', '', '']);
  assert.equal(row.new_reference, '001234');
  assert.equal(row.SKU, '007 (1)');
  assert.match(result.warnings.join(' '), /Unmatched shipping methods/);
});

test('Existing generated columns are replaced in place without duplicate headers', () => {
  const headers = ['serviceCode', ...HEADERS, 'new_reference', 'format', 'weight', 'SKU'];
  const result = processCsv(input([{ serviceCode: 'OLD', new_reference: 'OLD', SKU: 'OLD' }], headers));
  assert.deepEqual(result.headers, headers);
  assert.equal(objects(result)[0].serviceCode, 'TRS48');
  assert.equal(objects(result)[0].new_reference, '001234');
  assert.equal(objects(result)[0].SKU, '007 (1)');
});

test('Rules can be disabled separately and missing fields are required only for active rules', () => {
  assert.equal(processCsv(input([{ issues: 'Missing article' }]), { removeIssues: false }).stats.kept, 1);
  assert.equal(objects(processCsv(input([{ shippingAddressName: 'José' }]), { cleanAddresses: false }))[0].shippingAddressName, 'José');
  const result = processCsv(input([{}]), { convertServices: false });
  assert.deepEqual(result.headers, HEADERS);
  const existingHeaders = [...HEADERS, 'new_reference', 'SKU'];
  const existing = processCsv(input([{ new_reference: 'EXISTING REF', SKU: 'EXISTING SKU' }], existingHeaders), { convertServices: false });
  assert.equal(objects(existing)[0].new_reference, 'EXISTING REF');
  assert.equal(objects(existing)[0].SKU, 'EXISTING SKU');
  const minimal = processCsv('custom\n001\n', { removeIssues: false, cleanAddresses: false, convertServices: false });
  assert.deepEqual(minimal.rows, [['001']]);
  assert.throws(() => processCsv('custom\n001\n'), /Missing required columns/);
});

test('Missing-value strings are cleared consistently with pandas defaults', () => {
  const [row] = objects(processCsv(input([{ note: 'NA', phone: 'nan', shippingAddressExtra: 'NULL' }])));
  assert.equal(row.note, '');
  assert.equal(row.phone, '');
  assert.equal(row.shippingAddressExtra, '');
});

test('Invalid article counts fail instead of silently choosing a postal format', () => {
  assert.throws(() => processCsv(input([{ shippingMethod: 'UK Standard Large Letter (2nd Class)', articles: 'invalid' }])), /articles/);
});

test('Zero retained rows still produce a valid header-only CSV with an explicit warning', () => {
  const result = processCsv(input([{ issues: 'Missing article' }]));
  assert.deepEqual(result.rows, []);
  assert.equal(result.stats.removed, 1);
  assert.equal(parseCsv(result.csv).rows.length, 0);
  assert.match(result.warnings.join(' '), /only column headers/);
});

test('TRN24 uses Large letter without a format warning; emptied addresses still warn', () => {
  const result = processCsv(input([{
    shippingMethod: 'UK Signed Large Letter (1st Class Signed For)', shippingAddressName: '李😀',
  }]));
  assert.equal(objects(result)[0].format, 'Large letter');
  assert.doesNotMatch(result.warnings.join(' '), /format/);
  assert.match(result.warnings.join(' '), /address field/);
});

test('A CSV roundtrip preserves commas, quotes, newlines and unrelated columns', () => {
  const note = 'Line 1, "quoted"\r\nLine 2 😀';
  const result = processCsv(input([{ note }]));
  const reread = parseCsv(result.csv);
  assert.deepEqual(reread.headers, [...HEADERS, 'serviceCode', 'weight', 'format', 'new_reference', 'SKU']);
  assert.equal(reread.rows[0][reread.headers.indexOf('note')], note);
});
