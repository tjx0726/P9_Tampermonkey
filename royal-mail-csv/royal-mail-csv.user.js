// ==UserScript==
// @name         P9 Royal Mail CSV Processor
// @namespace    https://github.com/tjx0726/p9_cm_script
// @version      1.1.2
// @description  Process TCGPowerTools CSV exports for Royal Mail and download a processed copy.
// @homepageURL  https://github.com/tjx0726/P9_Tampermonkey/tree/main/royal-mail-csv
// @updateURL    https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/royal-mail-csv/royal-mail-csv.user.js
// @downloadURL  https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/royal-mail-csv/royal-mail-csv.user.js
// @match        https://business.parcel.royalmail.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // Business rules: p9_cm_script/main.py at 6281e2bb725665626f1fbf4528b72b22d22cd942.
  // TRN24 format corrected to Large letter per owner instruction on 2026-11-19.
  // UK Confirmed 2nd Class Signed For uses the Tracked 48 LBT mapping per owner instruction.
  // Label reference is the Cardmarket order number; the SKU contains PID (articles).
  const ADDRESS_FIELDS = [
    'shippingAddressName', 'shippingAddressExtra', 'shippingAddressStreet',
    'shippingAddressCity', 'shippingAddressZip',
  ];
  // Match pandas.read_csv's default missing-value strings without numeric coercion.
  const MISSING_VALUES = new Set([
    '', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan',
    '1.#IND', '1.#QNAN', '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None', 'n/a', 'nan', 'null',
  ]);
  const SERVICES = new Map([
    ['UK Standard Letter (2nd Class)', ['BPL2', '0.1', 'Letter']],
    ['UK Standard Letter (1st Class)', ['BPL1', '0.1', 'Letter']],
    ['UK Standard Large Letter (1st Class)', ['BPL1', '0.1', 'Letter']],
    ['UK Signed Large Letter (2nd Class Signed For)', ['TRS48', '0.1', 'Large letter']],
    ['UK Signed Large Letter (1st Class Signed For)', ['TRN24', '0.1', 'Large letter']],
    ['Tracked 48 (Real Tracked Service)', ['TRS48', '0.1', 'Large letter']],
    ['Tracked 48 LBT (Real Tracked Service)', ['TRS48', '0.1', 'Large letter']],
    ['UK Confirmed Large Letter (2nd Class Signed For)', ['TRS48', '0.1', 'Large letter']],
    ['UK Signed Large Letter (2nd Class Signed For) (Online)', ['TRS48', '0.1', 'Large letter']],
    ['Tracked 24 (Real Tracked Service)', ['TRN24', '0.1', 'Large letter']],
    ['Special Delivery 1PM insured for 750 GBP', ['SD1', '0.1', 'Large letter']],
  ]);

  function parseCsv(text) {
    const input = text.replace(/^\uFEFF/, '');
    if (!input.trim()) throw new Error('The CSV file is empty. Choose a CSV with column headers.');
    const records = [];
    let row = [];
    let field = '';
    let quoted = false;
    let closedQuote = false;
    const endField = () => {
      row.push(field);
      field = '';
      closedQuote = false;
    };
    const endRow = () => {
      endField();
      if (!(row.length === 1 && !row[0].trim())) records.push(row);
      row = [];
    };
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
          closedQuote = true;
        } else {
          field += char;
        }
      } else if (char === ',') {
        endField();
      } else if (char === '\n' || char === '\r') {
        endRow();
        if (char === '\r' && input[i + 1] === '\n') i += 1;
      } else if (char === '"' && !field && !closedQuote) {
        quoted = true;
      } else {
        if (closedQuote || char === '"') {
          throw new Error('Invalid CSV quoting. Export the file again.');
        }
        field += char;
      }
    }
    if (quoted) throw new Error('The CSV contains an unclosed quote. Export the file again.');
    if (field || row.length || closedQuote) endRow();
    if (!records.length) throw new Error('The CSV has no readable column headers.');
    const headers = records.shift();
    if (headers.some((header) => !header.trim())) {
      throw new Error('The CSV contains an empty column name. Check the header row.');
    }
    if (new Set(headers).size !== headers.length) {
      throw new Error('The CSV contains duplicate column names. Check the header row.');
    }
    for (const [index, record] of records.entries()) {
      if (record.length > headers.length) {
        throw new Error(`Data record ${index + 1} has more fields than the header. Check commas and quotes.`);
      }
      while (record.length < headers.length) record.push('');
    }
    return { headers, rows: records };
  }

  function stringifyCsv(headers, rows) {
    const escape = (value) => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n';
  }

  function processCsv(text, options = {}) {
    const settings = { removeIssues: true, cleanAddresses: true, convertServices: true, ...options };
    const { headers, rows: inputRows } = parseCsv(text);
    const required = new Set();
    if (settings.removeIssues) required.add('issues');
    if (settings.cleanAddresses) ADDRESS_FIELDS.forEach((field) => required.add(field));
    if (settings.convertServices) {
      ['shippingMethod', 'PID', 'articles', 'idOrder'].forEach((field) => required.add(field));
    }
    const missing = [...required].filter((field) => !headers.includes(field));
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}. Check the CSV or turn off the corresponding options.`);
    const positions = new Map(headers.map((header, index) => [header, index]));
    const outputHeaders = [...headers];
    if (settings.convertServices) {
      for (const field of ['serviceCode', 'weight', 'format', 'new_reference', 'SKU']) {
        if (!positions.has(field)) {
          positions.set(field, outputHeaders.length);
          outputHeaders.push(field);
        }
      }
    }
    const rows = [];
    const unknownServices = new Map();
    let removed = 0;
    let cleanedFields = 0;
    let emptiedFields = 0;
    let missingSkus = 0;
    let longSkus = 0;
    for (const [index, inputRow] of inputRows.entries()) {
      const row = inputRow.map((value) => MISSING_VALUES.has(value) ? '' : value);
      if (settings.removeIssues && !['', '[]'].includes(row[positions.get('issues')])) {
        removed += 1;
        continue;
      }
      while (row.length < outputHeaders.length) row.push('');
      if (settings.cleanAddresses) {
        for (const field of ADDRESS_FIELDS) {
          const position = positions.get(field);
          const before = row[position];
          row[position] = before.replace(/[^\x00-\x7F]/g, '');
          if (row[position] !== before) {
            cleanedFields += 1;
            if (!row[position]) emptiedFields += 1;
          }
        }
      }
      if (settings.convertServices) {
        const method = row[positions.get('shippingMethod')];
        let service = SERVICES.get(method);
        if (method === 'UK Standard Large Letter (2nd Class)') {
          const articles = Number(row[positions.get('articles')]);
          if (!Number.isFinite(articles)) {
            throw new Error(`Data record ${index + 1} has an invalid articles value. The postal format cannot be determined.`);
          }
          service = articles > 50 ? ['BPL2', '0.3', 'Large letter'] : ['BPL2', '0.1', 'Letter'];
        }
        if (!service) unknownServices.set(method, (unknownServices.get(method) || 0) + 1);
        [row[positions.get('serviceCode')], row[positions.get('weight')], row[positions.get('format')]] = service || ['', '', ''];
        const orderReference = row[positions.get('idOrder')];
        if (!orderReference.trim()) {
          throw new Error(`Data record ${index + 1} has no Cardmarket order number. An order reference is required.`);
        }
        row[positions.get('new_reference')] = orderReference;
        const pid = row[positions.get('PID')].trim();
        const articles = row[positions.get('articles')].trim();
        const sku = pid && articles ? `${pid} (${articles})` : '';
        row[positions.get('SKU')] = sku;
        if (!sku) missingSkus += 1;
        if (sku.length > 43) longSkus += 1;
        // The original phone type check never executes. Keep the source phone text.
      }
      rows.push(row);
    }
    const warnings = [];
    if (!rows.length) warnings.push('No orders remain. The downloaded CSV will contain only column headers. Turn off "Remove orders with issues" to review all orders.');
    if (unknownServices.size) {
      const methods = [...unknownServices].slice(0, 5).map(([method, count]) => `${method || '(blank)'} (${count})`);
      warnings.push(`Unmatched shipping methods (order counts): ${methods.join('; ')}${unknownServices.size > 5 ? '; additional unmatched methods omitted' : ''}. Service code, weight and format have been left blank. Check these orders before importing.`);
    }
    if (emptiedFields) warnings.push(`${emptiedFields} address ${emptiedFields === 1 ? 'field is' : 'fields are'} blank after removing non-ASCII characters. Check the addresses before importing.`);
    if (missingSkus) warnings.push(`${missingSkus} ${missingSkus === 1 ? 'order has' : 'orders have'} a blank SKU because PID or articles is missing. Cardmarket order references have been preserved.`);
    if (longSkus) warnings.push(`${longSkus} ${longSkus === 1 ? 'SKU exceeds' : 'SKUs exceed'} the 43 characters Royal Mail can print on a label. The full values are preserved in the CSV; check the printed labels.`);
    return {
      headers: outputHeaders, rows, warnings,
      stats: { input: inputRows.length, kept: rows.length, removed, cleanedFields },
      csv: stringifyCsv(outputHeaders, rows),
    };
  }

  // A CommonJS entry point lets the shipping rules run under Node's built-in test runner.
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { parseCsv, stringifyCsv, processCsv };
    return;
  }
  if (window.top !== window.self || location.origin !== 'https://business.parcel.royalmail.com') return;

  function mount() {
    if (document.getElementById('p9-royal-mail-csv')) return;
    const host = document.createElement('div');
    host.id = 'p9-royal-mail-csv';
    for (const [property, value] of Object.entries({
      all: 'initial', position: 'fixed', right: '20px', bottom: '20px',
      'z-index': '2147483647', display: 'block',
    })) host.style.setProperty(property, value, 'important');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { color-scheme: light; }
        * { box-sizing: border-box; }
        [hidden] { display: none !important; }
        .widget { color: #1c2735; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-align: left; }
        button, input { font: inherit; }
        button { cursor: pointer; }
        button:disabled { cursor: default; opacity: .5; }
        button:focus-visible, input:focus-visible, summary:focus-visible { outline: 3px solid #2765ad; outline-offset: 3px; }
        .launcher { display: flex; align-items: center; gap: 9px; margin-left: auto; border: 0; border-radius: 24px; padding: 12px 19px; background: #c8102e; color: #fff; font-weight: 650; box-shadow: 0 3px 14px #1c27352e; }
        .launcher:hover, .download:hover:not(:disabled) { background: #a80d26; }
        .launcher svg { width: 19px; height: 19px; }
        .panel { position: absolute; right: 0; bottom: 60px; width: 390px; max-width: calc(100vw - 40px); max-height: calc(100vh - 110px); max-height: calc(100dvh - 110px); overflow: auto; border: 1px solid #e1e5e9; border-radius: 14px; background: #fff; box-shadow: 0 10px 40px #1c27352e; }
        .heading { display: flex; align-items: center; gap: 12px; padding: 19px 20px 17px; border-bottom: 1px solid #e1e5e9; }
        .stamp { display: grid; place-items: center; width: 39px; height: 42px; border: 1px dashed #c8102e; color: #c8102e; font-size: 16px; font-weight: 750; }
        h2 { margin: 0; font: 650 18px/1.4 "Avenir Next", -apple-system, sans-serif; }
        .subtitle { color: #5e6978; font-size: 11px; margin-top: 2px; }
        .close { margin-left: auto; align-self: flex-start; border: 0; border-radius: 6px; padding: 0 7px; background: transparent; color: #5e6978; font-size: 23px; line-height: 28px; }
        .close:hover { background: #f5f7f9; }
        .body { padding: 18px 20px 20px; }
        .drop { padding: 18px 14px; border: 1px dashed #b8c1cc; border-radius: 9px; background: #f5f7f9; text-align: center; }
        .drop.drag { border-color: #c8102e; background: #fff4f5; }
        .choose { padding: 8px 20px; border: 1px solid #bdc6d0; border-radius: 7px; background: #fff; color: #1c2735; font-weight: 600; }
        .choose:hover { border-color: #c8102e; }
        .hint { margin: 8px 0 0; color: #5e6978; font-size: 12px; }
        .filename { margin-top: 8px; overflow-wrap: anywhere; font-weight: 600; }
        fieldset { margin: 17px 0 0; padding: 0; border: 0; min-width: 0; }
        legend { padding: 0; margin-bottom: 7px; color: #5e6978; font-size: 12px; }
        label { display: flex; align-items: flex-start; gap: 9px; padding: 5px 0; cursor: pointer; }
        input[type=checkbox] { flex: 0 0 auto; margin: 3px 0 0; width: 15px; height: 15px; accent-color: #c8102e; }
        .status { margin: 14px 0 0; overflow-wrap: anywhere; }
        .status[data-tone=error] { color: #a80d26; }
        .counts { display: flex; gap: 8px; margin: 15px 0 0; padding: 11px 0; border-top: 1px solid #e1e5e9; border-bottom: 1px solid #e1e5e9; }
        .counts span { flex: 1; text-align: center; color: #5e6978; font-size: 12px; }
        .counts strong { color: #1c2735; font-variant-numeric: tabular-nums; }
        .warnings { padding: 10px 12px 10px 26px; margin: 12px 0 0; background: #fff7e8; border-radius: 7px; color: #74500d; font-size: 12px; overflow-wrap: anywhere; }
        .warnings li + li { margin-top: 7px; }
        details { margin-top: 12px; font-size: 12px; }
        summary { cursor: pointer; color: #5e6978; }
        .preview { max-height: 170px; overflow: auto; margin-top: 8px; border: 1px solid #e1e5e9; }
        table { border-collapse: collapse; white-space: nowrap; font-size: 11px; }
        th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #e1e5e9; }
        th { position: sticky; top: 0; background: #f5f7f9; }
        .download { display: block; margin-top: 16px; width: 100%; padding: 11px 14px; border: 0; border-radius: 8px; background: #c8102e; color: #fff; font-weight: 650; }
        .privacy { margin: 10px 0 0; color: #5e6978; font-size: 11px; text-align: center; }
        @media (max-width: 450px) { .heading { padding: 15px; } .body { padding: 15px; } }
      </style>
      <div class="widget" lang="en">
        <section class="panel" id="panel" role="dialog" aria-labelledby="title" hidden>
          <header class="heading">
            <span class="stamp" aria-hidden="true">P9</span>
            <div><h2 id="title">Process shipping CSV</h2><div class="subtitle">TCGPowerTools → Royal Mail</div></div>
            <button class="close" type="button" aria-label="Collapse window">×</button>
          </header>
          <div class="body">
            <div class="drop">
              <input id="file" type="file" accept=".csv,text/csv" aria-label="Upload CSV file" hidden>
              <button class="choose" type="button">Choose CSV file</button>
              <p class="hint">Or drag and drop a file here · Up to 20 MB</p>
              <div class="filename" hidden></div>
            </div>
            <fieldset>
              <legend>Processing options</legend>
              <label><input type="checkbox" id="removeIssues" checked>Remove orders with issues</label>
              <label><input type="checkbox" id="cleanAddresses" checked>Remove non-ASCII characters from addresses</label>
              <label><input type="checkbox" id="convertServices" checked>Prepare shipping services, reference and SKU</label>
            </fieldset>
            <p class="hint">Royal Mail setup: map new_reference to Order reference and SKU to Identifier (SKU). Enable "Include product identifiers (SKUs) on label" in Label format settings.</p>
            <p class="status" role="status" aria-live="polite" hidden></p>
            <div class="result" hidden>
              <div class="counts"><span>Uploaded <strong id="inputCount"></strong></span><span>Kept <strong id="keptCount"></strong></span><span>Removed <strong id="removedCount"></strong></span></div>
              <ul class="warnings" hidden></ul>
              <details><summary>Preview first 5 orders</summary><div class="preview"><table></table></div></details>
            </div>
            <button class="download" type="button" disabled>Download processed CSV</button>
            <p class="privacy">Files are processed only in this browser</p>
          </div>
        </section>
        <button class="launcher" type="button" aria-label="Open CSV processor" aria-expanded="false" aria-controls="panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>
          Process CSV
        </button>
      </div>`;
    const get = (selector) => root.querySelector(selector);
    const panel = get('.panel');
    const launcher = get('.launcher');
    const fileInput = get('#file');
    const download = get('.download');
    let selectedFile = null;
    let prepared = null;
    let revision = 0;

    function toggle(open) {
      panel.hidden = !open;
      launcher.setAttribute('aria-expanded', String(open));
      launcher.setAttribute('aria-label', open ? 'Collapse CSV processor' : 'Open CSV processor');
      if (open) get('.choose').focus();
      else launcher.focus();
    }
    function status(message, tone = '') {
      const element = get('.status');
      element.hidden = !message;
      element.textContent = message;
      element.dataset.tone = tone;
    }
    function resetResult() {
      prepared = null;
      download.disabled = true;
      download.textContent = 'Download processed CSV';
      get('.result').hidden = true;
      get('details').open = false;
      get('table').replaceChildren();
    }
    function renderPreview(result) {
      const table = get('table');
      const head = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (const header of result.headers) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = header;
        headerRow.append(cell);
      }
      head.append(headerRow);
      const body = document.createElement('tbody');
      for (const row of result.rows.slice(0, 5)) {
        const tr = document.createElement('tr');
        for (const value of row) {
          const cell = document.createElement('td');
          cell.textContent = value;
          tr.append(cell);
        }
        body.append(tr);
      }
      table.replaceChildren(head, body);
    }
    async function run() {
      const currentRevision = ++revision;
      resetResult();
      if (!selectedFile) return;
      const file = selectedFile;
      if (!/\.csv$/i.test(file.name)) {
        status('Choose a file with the .csv extension.', 'error');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        status('The file is larger than 20 MB. Split the CSV and try again.', 'error');
        return;
      }
      status('Processing…');
      try {
        const buffer = await file.arrayBuffer();
        if (currentRevision !== revision) return;
        let text;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch {
          throw new Error('The file is not valid UTF-8. Save it as CSV UTF-8 and upload it again.');
        }
        const result = processCsv(text, {
          removeIssues: get('#removeIssues').checked,
          cleanAddresses: get('#cleanAddresses').checked,
          convertServices: get('#convertServices').checked,
        });
        get('#inputCount').textContent = String(result.stats.input);
        get('#keptCount').textContent = String(result.stats.kept);
        get('#removedCount').textContent = String(result.stats.removed);
        const warnings = get('.warnings');
        warnings.replaceChildren();
        for (const warning of result.warnings) {
          const item = document.createElement('li');
          item.textContent = warning;
          warnings.append(item);
        }
        warnings.hidden = !result.warnings.length;
        renderPreview(result);
        get('.result').hidden = false;
        prepared = { csv: result.csv, name: `processed-${file.name}` };
        download.disabled = false;
        download.textContent = result.rows.length ? 'Download processed CSV' : 'Download CSV (headers only)';
        status('Processing complete. Your CSV is ready to download.');
      } catch (error) {
        if (currentRevision === revision) status(error.message || 'Processing failed. Check the CSV file.', 'error');
      }
    }
    function selectFile(file) {
      if (!file) return;
      selectedFile = file;
      get('.filename').textContent = file.name;
      get('.filename').hidden = false;
      void run();
    }
    launcher.addEventListener('click', () => toggle(panel.hidden));
    get('.close').addEventListener('click', () => toggle(false));
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        toggle(false);
      }
    });
    get('.choose').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      selectFile(fileInput.files[0]);
      fileInput.value = '';
    });
    for (const name of ['removeIssues', 'cleanAddresses', 'convertServices']) {
      get(`#${name}`).addEventListener('change', () => { void run(); });
    }
    const drop = get('.drop');
    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
        drop.classList.toggle('drag', type === 'dragenter' || type === 'dragover');
        if (type === 'drop') selectFile(event.dataTransfer?.files[0]);
      });
    }
    download.addEventListener('click', () => {
      if (!prepared) return;
      const url = URL.createObjectURL(new Blob([prepared.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = prepared.name;
      link.hidden = true;
      root.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    document.body.append(host);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
