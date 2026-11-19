const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { extractPdf } = require('../p9-tcgpowertools.user.js');

// PDFs and expected records stay outside the repository. Supply independently
// checked expectations as a JSON array of { page, orderCode, cardmarketOrderId,
// trackingNumber, error }; never publish real shipping/order records here.
for (const [title, pdfKey, expectationsKey] of [
  ['extracts the original combined-reference PDF', 'LABEL_PDF', 'LABEL_EXPECTATIONS'],
  ['extracts the split-reference PDF with a SKU quantity prefix', 'SPLIT_LABEL_PDF', 'SPLIT_LABEL_EXPECTATIONS'],
]) {
  test(title, { skip: !process.env[pdfKey] }, async () => {
    assert.ok(process.env[expectationsKey], `Set ${expectationsKey} to a private expected-records JSON file.`);
    const pdfjs = await import(pathToFileURL(process.env.PDFJS_MODULE || require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
    const expected = JSON.parse(await readFile(process.env[expectationsKey], 'utf8'));
    assert.ok(Array.isArray(expected) && expected.length > 0, 'Expected records must be a nonempty array.');
    const rows = await extractPdf(new Uint8Array(await readFile(process.env[pdfKey])), pdfjs);
    assert.deepEqual(rows, expected);
  });
}
