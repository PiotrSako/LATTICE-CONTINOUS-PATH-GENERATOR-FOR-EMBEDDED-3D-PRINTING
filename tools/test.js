#!/usr/bin/env node
/**
 * Headless tests for index.html — no browser, no dependencies.
 *   node tools/test.js
 *
 * How it works: extracts the last <script> block from index.html, provides
 * DOM + Three.js stubs and runs the app in Node. The tests drive the app
 * through the same handlers the user clicks ("Download .gcode" etc.) and
 * check what would actually end up in the file.
 *
 * Guarded invariants (see CLAUDE.md):
 *   1. one continuous line — zero G0 after the start, zero retractions
 *   2. E proportional to segment length (uniform flow)
 *   3. rounded passes EXACTLY through the classic nodes
 *   4. rounded does not overshoot in Z (layer welding)
 *   5. JSON export = pure DripLab format
 *   6. i18n: complete EN/PL key sets
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

/* ---------------- mini framework ---------------- */
let pass = 0, fail = 0;
const results = [];
function check(name, cond, info) {
  if (cond) { pass++; results.push(['ok', name, info]); }
  else { fail++; results.push(['FAIL', name, info]); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

/* ---------------- environment stubs ---------------- */
function makeEnv() {
  const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();

  const i18nEls = [...html.matchAll(/data-i18n="([^"]+)"/g)]
    .map(m => ({ textContent: '', getAttribute: () => m[1] }));
  const titleEls = [...html.matchAll(/data-i18n-title="([^"]+)"/g)]
    .map(m => ({ title: '', getAttribute: () => m[1] }));

  const langBtns = [{ l: 'en' }, { l: 'pl' }].map(o => ({
    _o: o,
    getAttribute: () => o.l,
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(ev, fn) { o.fn = fn; }
  }));

  const modeBtns = [];
  const handlers = {};
  const created = [];

  function mkEl(id) {
    return {
      _id: id, style: {}, className: '',
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(ev, fn) { handlers[id + ':' + ev] = fn; },
      appendChild(c) { created.push(c); },
      querySelector: s => mkEl(id + s),
      querySelectorAll(s) {
        if (s === '#sako-mode button') {
          modeBtns.length = 0;
          [{ m: 'classic' }, { m: 'rounded' }].forEach(o => modeBtns.push({
            _o: o, getAttribute: () => o.m, addEventListener(ev, fn) { o.fn = fn; }
          }));
          return modeBtns;
        }
        return [];
      },
      setAttribute() {}, remove() {}, click() {}, setPointerCapture() {},
      get clientWidth() { return 800; }, get clientHeight() { return 400; },
      innerHTML: '', textContent: '', value: '1000', title: ''
    };
  }

  const store = {};
  let captured = null;

  global.document = {
    title: '',
    getElementById: id => store[id] || (store[id] = mkEl(id)),
    createElement: () => mkEl('new'),
    body: { appendChild() {} },
    querySelectorAll: s =>
      s === '[data-i18n]' ? i18nEls :
      s === '[data-i18n-title]' ? titleEls :
      s === '#lang button' ? langBtns : []
  };
  global.matchMedia = () => ({ matches: false });
  global.window = { addEventListener() {} };
  global.devicePixelRatio = 1;
  global.requestAnimationFrame = () => 0;
  global.cancelAnimationFrame = () => {};
  global.performance = { now: () => 0 };
  try { global.navigator = { clipboard: { writeText: async () => {} } }; }
  catch (_) { // in newer Node globalThis.navigator has only a getter
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: async () => {} } }, configurable: true, writable: true
    });
  }
  global.Blob = function (parts) { captured = parts[0]; };
  global.URL = { createObjectURL: () => 'blob:', revokeObjectURL() {} };

  const V3 = () => ({ set() { return this; }, copy() { return this; }, lerp() { return this; } });
  global.THREE = {
    WebGLRenderer: function () { return { setPixelRatio() {}, setSize() {}, render() {} }; },
    Scene: function () { return { background: null, add() {}, remove() {} }; },
    Color: function () { return { r: 0, g: 0, b: 0, copy() { return this; }, lerp() { return this; } }; },
    PerspectiveCamera: function () { return { position: V3(), up: V3(), lookAt() {}, updateProjectionMatrix() {}, aspect: 1 }; },
    Vector3: function () { return V3(); },
    BufferGeometry: function () { return { setAttribute() {}, setDrawRange() {}, dispose() {}, attributes: { position: { needsUpdate: false } } }; },
    BufferAttribute: function () { return {}; },
    LineBasicMaterial: function () { return { dispose() {} }; },
    MeshBasicMaterial: function () { return { dispose() {} }; },
    Line: function () { return { geometry: { setDrawRange() {}, dispose() {}, attributes: { position: { needsUpdate: false } } }, material: { dispose() {} } }; },
    Group: function () { return { add() {}, position: V3(), traverse() {} }; },
    Mesh: function () { return { rotation: {}, position: { y: 0 }, geometry: { dispose() {} }, material: { dispose() {} } }; },
    ConeGeometry: function () { return {}; },
    SphereGeometry: function () { return {}; },
    GridHelper: function () { return { position: { set() {} } }; }
  };

  eval(app);

  return {
    handlers, langBtns, modeBtns, store, created,
    gcode() { handlers['download:click']({ target: {} }); return captured; },
    json() { handlers['json:click']({ target: { textContent: '' } }); return captured; },
    setMode(m) { const b = modeBtns.find(x => x._o.m === m); b._o.fn({ stopPropagation() {} }); },
    setLang(l) { langBtns.find(b => b._o.l === l)._o.fn(); }
  };
}

/* ---------------- helpers ---------------- */
function parsePoints(gcode) {
  const pts = [];
  for (const line of gcode.split('\n')) {
    const m = line.match(/^G[01] X(-?[\d.]+) Y(-?[\d.]+) Z(-?[\d.]+)/);
    if (m) pts.push([+m[1], +m[2], +m[3]]);
  }
  return pts;
}
function parseE(gcode) {
  const es = [];
  for (const line of gcode.split('\n')) {
    const m = line.match(/^G1 X.* E(-?[\d.]+)/);
    if (m) es.push(+m[1]);
  }
  return es;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const zRange = pts => pts.reduce((r, p) => [Math.min(r[0], p[2]), Math.max(r[1], p[2])], [1e9, -1e9]);

/* ================= TESTS ================= */
let env;
try {
  env = makeEnv();
  check('app loads without errors', true);
} catch (e) {
  check('app loads without errors', false, e.message);
  report();
  process.exit(1);
}

/* --- 1. G-code structure (classic) --- */
const gc = env.gcode();
const lines = gc.split('\n');
check('G-code: G21/G90/M83 header', /G21/.test(gc) && /G90/.test(gc) && /M83/.test(gc));
check('G-code: G92 E0 before the moves', gc.indexOf('G92 E0') < gc.indexOf('G1 X'));
const g0count = lines.filter(l => l.startsWith('G0 ')).length;
check('INVARIANT 1: one continuous line (exactly 1x G0)', g0count === 1, 'G0 = ' + g0count);
check('INVARIANT 1: no retractions (zero negative E)', !/E-/.test(gc));
const g1 = lines.filter(l => l.startsWith('G1 X'));
check('G-code: every G1 move carries E', g1.every(l => / E[\d.]/.test(l)), g1.length + ' moves');

/* --- 2. E proportional to length --- */
const ptsC = parsePoints(gc);
const esC = parseE(gc);
let ratios = [];
for (let i = 1; i < ptsC.length; i++) {
  const d = dist(ptsC[i - 1], ptsC[i]);
  if (d > 1e-6) ratios.push(esC[i - 1] / d);
}
const rMin = Math.min(...ratios), rMax = Math.max(...ratios);
check('INVARIANT 2: E proportional to length (uniform flow)',
  approx(rMin, rMax, 1e-3), 'E/mm in range ' + rMin.toFixed(4) + '..' + rMax.toFixed(4));

/* --- 3. rounded: nodes untouched --- */
env.setMode('rounded');
const gr = env.gcode();
const ptsR = parsePoints(gr);
const SEG = 8; // default "segments per span"
check('rounded generates 8x more points', ptsR.length === 1 + (ptsC.length - 1) * SEG,
  ptsC.length + ' -> ' + ptsR.length);
let maxNodeErr = 0;
for (let i = 0; i < ptsC.length; i++) {
  const q = ptsR[i * SEG];
  if (!q) { maxNodeErr = Infinity; break; }
  maxNodeErr = Math.max(maxNodeErr, dist(q, ptsC[i]));
}
check('INVARIANT 3: rounded passes exactly through the classic nodes',
  maxNodeErr < 1e-3, 'max deviation = ' + maxNodeErr.toExponential(2) + ' mm');

/* --- 4. rounded: no Z overshoot --- */
const zC = zRange(ptsC), zR = zRange(ptsR);
check('INVARIANT 4: rounded does not overshoot in Z (layer welding)',
  zR[0] >= zC[0] - 1e-3 && zR[1] <= zC[1] + 1e-3,
  'classic Z ' + zC[0] + '..' + zC[1] + ' | rounded Z ' + zR[0].toFixed(3) + '..' + zR[1].toFixed(3));

/* --- 5. JSON export = DripLab --- */
const doc = JSON.parse(env.json());
check('INVARIANT 5: JSON has only the "objects" key',
  Object.keys(doc).length === 1 && Array.isArray(doc.objects), JSON.stringify(Object.keys(doc)));
check('JSON: 1 object / 1 line (continuity)',
  doc.objects.length === 1 && doc.objects[0].length === 1);
const line0 = doc.objects[0][0];
check('JSON: line has >= 2 points', line0.length >= 2, line0.length + ' points');
check('JSON: every point = numeric [x,y,z]',
  line0.every(p => Array.isArray(p) && p.length === 3 && p.every(v => typeof v === 'number' && isFinite(v))));

/* --- 6. i18n: complete key sets --- */
function langKeys(tag) {
  const m = html.match(new RegExp(tag + ':\\{([\\s\\S]*?)\\n    \\}'));
  if (!m) return null;
  // strip string contents, otherwise "unbroken line: the needle" masquerades as a key
  const body = m[1].replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return [...body.matchAll(/(?:^|[\s,{])([a-z_0-9]+)\s*:/gm)].map(x => x[1]);
}
const en = langKeys('en'), pl = langKeys('pl');
if (en && pl) {
  const missPl = en.filter(k => !pl.includes(k));
  const missEn = pl.filter(k => !en.includes(k));
  check('INVARIANT 6: every EN key has a PL counterpart', missPl.length === 0, 'missing: ' + missPl.join(','));
  check('INVARIANT 6: every PL key has an EN counterpart', missEn.length === 0, 'missing: ' + missEn.join(','));
} else {
  check('i18n: dictionaries found in the source', false, 'regex did not match');
}

/* --- 7. language switching --- */
env.setLang('pl');
const gcPl = env.gcode();
check('i18n: G-code comments switch to PL', /ekstruder WZGLEDNY/.test(gcPl));
env.setLang('en');
const gcEn = env.gcode();
check('i18n: G-code comments return to EN', /RELATIVE extruder/.test(gcEn));

/* --- 8. no forbidden APIs --- */
check('no localStorage/sessionStorage (unsupported in artifacts)',
  !/localStorage|sessionStorage/.test(html));

/* ---------------- report ---------------- */
function report() {
  console.log('');
  for (const [st, name, info] of results) {
    const mark = st === 'ok' ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ';
    console.log(mark + name + (info ? '\x1b[90m  — ' + info + '\x1b[0m' : ''));
  }
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
}
report();
process.exit(fail ? 1 : 0);
