// SoR Analysis MVP — US-010 (selection), US-011 (mean/median), US-012 (tolerance), US-013 (accept tabs)
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = v => (v == null ? '' : v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const isPct = v => /^\d+$/.test(String(v).trim()) && +v <= 100; // whole number 0–100
const USER = 'Tender Evaluation Team';

const S = {
  projectId: DATA.projects[0].id, tenderId: null, subs: ['', '', '', '', ''], variance: '', touched: {},
  res: null, tab: 0, tol: [], search: '', sort: 0, accepted: {},
};
const project = () => DATA.projects.find(p => p.id === S.projectId);
const tender = () => project().tenders.find(t => t.id === S.tenderId);

// ---------- Acceptance store (keyed by Project + Template + Submissions combination) ----------
const comboKey = () => `sor-accept:${S.projectId}|${S.tenderId}|${S.subs.filter(Boolean).sort().join(',')}`;
function loadAccepted(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
function saveAccepted(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ---------- Calculations ----------
function computeTabs(t, subs) {
  return t.template.tabs.map((tab, ti) => ({
    name: tab.name,
    rows: tab.items.map((it, ii) => {
      const cells = subs.map(s => { const e = s.tabs[ti][ii]; return { raw: e.rate, v: typeof e.rate === 'number' ? e.rate : null }; });
      const vals = cells.filter(c => c.v !== null).map(c => c.v).sort((a, b) => a - b);
      const n = vals.length;
      const mean = n ? vals.reduce((a, b) => a + b, 0) / n : null;
      const median = n ? (n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2) : null;
      const changed = subs.map(s => ({ who: s.tenderer, name: s.tabs[ti][ii].name })).filter(c => c.name !== it.name);
      return { name: it.name, unit: it.unit, cells, n, mean, median, changed };
    }),
  }));
}

// ---------- Shell: header + sidebar ----------
function renderShell() {
  $('#railControls').innerHTML = `
    <div class="rail-label">Project</div>
    <select id="projectSelect" aria-label="Project">${DATA.projects.map(p => `<option value="${p.id}" ${p.id === S.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <div class="rail-label">Tender</div>
    <select id="tenderSelect" aria-label="Tender"><option value="">Search tender</option>
      ${project().tenders.map(t => `<option value="${t.id}" ${t.id === S.tenderId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
  enhance($('#railControls'));
}

// ---------- Searchable dropdown: wraps each <select>, which stays the source of truth and fires 'change' ----------
function enhance(root) {
  root.querySelectorAll('select:not([data-combo])').forEach(sel => {
    sel.dataset.combo = '1';
    sel.hidden = true;
    const box = document.createElement('div');
    box.className = 'combo';
    box.innerHTML = `<input class="combo-input" autocomplete="off" role="combobox" aria-expanded="false"><ul class="combo-list" role="listbox" hidden></ul>`;
    sel.after(box);
    const input = box.firstElementChild, list = box.lastElementChild;
    const blank = [...sel.options].find(o => !o.value);
    input.placeholder = blank ? blank.text : 'Search';
    input.disabled = sel.disabled;
    if (sel.getAttribute('aria-label')) input.setAttribute('aria-label', sel.getAttribute('aria-label'));
    const label = () => (sel.value ? sel.selectedOptions[0].text : '');
    input.value = label();
    let matches = [], active = -1;

    const draw = q => {
      matches = [...sel.options].filter(o => o.value && o.text.toLowerCase().includes(q.toLowerCase()));
      active = Math.max(0, matches.findIndex(o => o.value === sel.value));
      list.innerHTML = matches.length
        ? matches.map((o, i) => `<li role="option" data-i="${i}" class="${i === active ? 'active' : ''} ${o.value === sel.value ? 'selected' : ''}">${esc(o.text)}</li>`).join('')
        : `<li class="none">No matches</li>`;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const pick = o => {
      input.value = o.text;
      close();
      if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    const move = d => {
      if (!matches.length) return;
      active = (active + d + matches.length) % matches.length;
      [...list.children].forEach((li, i) => li.classList.toggle('active', i === active));
      list.children[active].scrollIntoView({ block: 'nearest' });
    };

    input.addEventListener('focus', () => { input.select(); draw(''); });
    input.addEventListener('input', () => draw(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); list.hidden ? draw('') : move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && !list.hidden && matches[active]) { e.preventDefault(); pick(matches[active]); }
      else if (e.key === 'Escape') { input.value = label(); close(); }
    });
    list.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus so blur doesn't fire before the pick
      const li = e.target.closest('li[data-i]');
      if (li) pick(matches[+li.dataset.i]);
    });
    input.addEventListener('blur', () => {
      if (!box.isConnected) return;
      close();
      if (!input.value.trim() && sel.value) { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); } // cleared → unselect
      else input.value = label();
      sel.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  });
}

// ---------- Selection screen (US-010) ----------
function setupErrors() {
  const e = {};
  if (!S.subs[0]) e.sub0 = 'SoR Submission 1 is required';
  if (!S.subs[1]) e.sub1 = 'SoR Submission 2 is required';
  if (S.variance === '') e.variance = 'Variance threshold is required';
  else if (!isPct(S.variance)) e.variance = 'Enter a whole number from 0 to 100';
  return e;
}
function showErrors() {
  const e = setupErrors();
  ['sub0', 'sub1', 'variance'].forEach(k => { const el = $('#err-' + k); if (el) el.textContent = S.touched[k] && e[k] ? e[k] : ''; });
  return e;
}

function renderMain() {
  const t = tender();
  if (!t) {
    $('#main').innerHTML = `<div class="empty">
      <svg width="96" height="77" viewBox="0 0 160 128" fill="none" aria-hidden="true">
        <rect x="20" y="12" width="96" height="104" rx="10" fill="#e4e7ee"/>
        <rect x="32" y="28" width="72" height="10" rx="3" fill="#cdd2dc"/>
        <rect x="32" y="48" width="20" height="8" rx="2" fill="#d6dae3"/><rect x="58" y="48" width="20" height="8" rx="2" fill="#d6dae3"/><rect x="84" y="48" width="20" height="8" rx="2" fill="#d6dae3"/>
        <rect x="32" y="64" width="20" height="8" rx="2" fill="#d6dae3"/><rect x="58" y="64" width="20" height="8" rx="2" fill="#d6dae3"/><rect x="84" y="64" width="20" height="8" rx="2" fill="#d6dae3"/>
        <rect x="32" y="80" width="20" height="8" rx="2" fill="#d6dae3"/><rect x="58" y="80" width="20" height="8" rx="2" fill="#d6dae3"/>
        <circle cx="112" cy="84" r="22" fill="#f5f6f8" stroke="#b8bfcc" stroke-width="6"/>
        <path d="M128 100l18 18" stroke="#b8bfcc" stroke-width="8" stroke-linecap="round"/>
      </svg>
      <p>Please select a tender on the left</p></div>`;
    return;
  }
  const subSelect = i => {
    const taken = S.subs.filter((s, j) => s && j !== i);
    const opts = t.submissions.filter(s => !taken.includes(s.id));
    return `<label class="field"><span>SoR Submission ${i + 1}${i < 2 ? ' *' : ''}</span>
      <select data-sub="${i}" aria-label="SoR Submission ${i + 1}"><option value="">${i < 2 ? 'Search tenderer' : 'Optional'}</option>
      ${opts.map(s => `<option value="${s.id}" ${S.subs[i] === s.id ? 'selected' : ''}>${esc(s.tenderer)}</option>`).join('')}</select>
      ${i < 2 ? `<div class="err" id="err-sub${i}"></div>` : ''}</label>`;
  };
  $('#main').innerHTML = `
    <section class="panel">
      <div class="card-head"><h2>${esc(t.name)}</h2><div class="budget"><span>Budget Estimate</span><b>${t.estimate}</b></div></div>
      <div class="grid meta">
        <div class="field ro"><span>Document Category</span><div>Schedule of Rates</div></div>
        <div class="field ro"><span>Document Type</span><div>Schedule of Rates Template</div></div>
        <div class="field ro"><span>Document Name</span><div>${esc(t.template.name)}</div></div>
      </div>
      <h3>Select SoR Submissions for Analysis <small>2 to 5</small></h3>
      <div class="grid subs">${[0, 1, 2, 3, 4].map(subSelect).join('')}</div>
      <div class="row-end">
        <label class="field variance"><span>Variance Threshold *</span>
          <div class="pct"><input id="variance" inputmode="numeric" placeholder="e.g. 15" value="${esc(S.variance)}"><b>%</b></div>
          <div class="err" id="err-variance"></div></label>
        <button id="compare" class="btn primary">Compare Rates</button>
      </div>
    </section>
    <section id="results"></section>`;
  enhance($('#main'));
  showErrors();
  if (S.res) renderResults();
}

function compare() {
  ['sub0', 'sub1', 'variance'].forEach(k => (S.touched[k] = true));
  if (Object.keys(showErrors()).length) return;
  const t = tender();
  const subs = S.subs.filter(Boolean).map(id => t.submissions.find(s => s.id === id));
  const key = comboKey();
  S.accepted = loadAccepted(key);
  S.res = { key, subs, tabs: computeTabs(t, subs) };
  S.tol = S.res.tabs.map(tab => S.accepted[tab.name]?.tol ?? +S.variance);
  S.tab = 0; S.search = ''; S.sort = 0;
  renderResults();
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Results page (US-011/012/013) ----------
function renderResults() {
  const r = S.res, tab = r.tabs[S.tab], acc = S.accepted[tab.name];
  $('#results').innerHTML = `
    <div class="legend" role="note">
      <b>Legend</b>
      <span><i class="sw above"></i>▲ Above upper limit</span><span><i class="sw below"></i>▼ Below lower limit</span>
      <span><i class="sw missing"></i>Blank / NA (not counted)</span><span><i class="sw renamed"></i>Item renamed by tenderer</span>
    </div>
    <section class="card results">
      <div class="tabs" role="tablist">${r.tabs.map((tb, i) => `
        <button role="tab" aria-selected="${i === S.tab}" class="tab ${i === S.tab ? 'active' : ''} ${S.accepted[tb.name] ? 'accepted' : ''}" data-tab="${i}">
          ${S.accepted[tb.name] ? '✓ ' : ''}${esc(tb.name)}</button>`).join('')}</div>
      <div class="toolbar">
        <label class="field inline"><span>Tolerance (%)</span>
          <div class="pct"><input id="tol" inputmode="numeric" value="${S.tol[S.tab]}" ${acc ? 'disabled' : ''}><b>%</b></div>
          <div class="err" id="err-tol"></div></label>
        <input id="search" type="search" placeholder="Search item" value="${esc(S.search)}" aria-label="Search item">
        <div class="spacer"></div>
        <button id="accept" class="btn ${acc ? 'done' : 'success'}" ${acc ? 'disabled' : ''}>${acc ? '✓ Accepted' : 'Accept Tab'}</button>
      </div>
      <div class="table-wrap"><table id="tbl"></table></div>
      <div id="done"></div>
    </section>`;
  renderTable();
}

function renderTable() {
  const r = S.res, tab = r.tabs[S.tab], p = S.tol[S.tab];
  const q = S.search.trim().toLowerCase();
  let rows = tab.rows.filter(x => x.name.toLowerCase().includes(q));
  if (S.sort) rows = [...rows].sort((a, b) => S.sort * a.name.localeCompare(b.name));
  const arrow = S.sort === 1 ? '▲' : S.sort === -1 ? '▼' : '↕';
  const cols = 8 + r.subs.length;

  const body = rows.map(row => {
    const useMedian = row.n >= 3;
    const cv = useMedian ? row.median : row.mean;
    const tol = cv == null ? null : (cv * p) / 100;
    const up = cv == null ? null : cv + tol, lo = cv == null ? null : cv - tol;
    const rates = row.cells.map(c => {
      if (c.v === null) return `<td class="num missing" title="Not quoted">${c.raw === 'NA' ? 'NA' : 'blank'}</td>`;
      const cls = c.v > up ? 'above' : c.v < lo ? 'below' : '';
      return `<td class="num ${cls}">${cls === 'above' ? '▲ ' : cls === 'below' ? '▼ ' : ''}${fmt(c.v)}</td>`;
    }).join('');
    return `<tr>
      <td class="item">${esc(row.name)}<small>per ${esc(row.unit)}</small></td>
      <td class="num ${row.n && !useMedian ? 'used' : ''}">${fmt(row.mean)}</td>
      <td class="num ${useMedian ? 'used' : ''}">${fmt(row.median)}</td>
      <td class="num calc">${fmt(tol)}</td><td class="num calc">${fmt(up)}</td><td class="num calc">${fmt(lo)}</td>
      ${rates}
      <td class="num">${row.n}</td>
      <td class="${row.changed.length ? 'renamed' : ''}">${row.changed.map(c => `<div><b>${esc(c.who)}:</b> ${esc(c.name)}</div>`).join('')}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="${cols}" class="none">No items match “${esc(S.search)}”.</td></tr>`;

  $('#tbl').innerHTML = `
    <thead><tr>
      <th class="item sortable" data-sort tabindex="0">Item <span>${arrow}</span></th>
      <th>Mean Rate</th><th>Median Rate</th><th>Tolerance</th><th>Upper Limit</th><th>Lower Limit</th>
      ${r.subs.map(s => `<th>${esc(s.tenderer)} Rate</th>`).join('')}
      <th>No. of Tenderers Quoting</th><th>Changed Item Names</th>
    </tr></thead><tbody>${body}</tbody>`;

  const complete = r.tabs.every(tb => S.accepted[tb.name]);
  $('#done').innerHTML = complete ? `<div class="complete">✓ SoR analysis completed successfully. No further action required.</div>` : '';
}

// ---------- Accept modal ----------
function openModal() {
  $('#modalText').textContent = `Are you sure you want to accept ${S.res.tabs[S.tab].name}?`;
  $('#modalErr').textContent = '';
  $('#modal').hidden = false;
  $('#mOk').focus();
}
const closeModal = () => { $('#modal').hidden = true; };
function confirmAccept() {
  const name = S.res.tabs[S.tab].name;
  const next = { ...S.accepted, [name]: { tol: S.tol[S.tab], by: USER, at: new Date().toISOString() } };
  try { saveAccepted(S.res.key, next); } catch { $('#modalErr').textContent = 'Could not save the acceptance. Please try again.'; return; }
  S.accepted = next;
  closeModal();
  renderResults();
}

// ---------- Events ----------
function resetSelection() { S.subs = ['', '', '', '', '']; S.touched = {}; S.res = null; } // variance is kept

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'projectSelect') { S.projectId = t.value; S.tenderId = null; resetSelection(); renderShell(); renderMain(); }
  else if (t.id === 'tenderSelect') { S.tenderId = t.value || null; resetSelection(); renderMain(); }
  else if (t.dataset.sub) { S.subs[+t.dataset.sub] = t.value; S.touched['sub' + t.dataset.sub] = true; S.res = null; renderMain(); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'variance') { S.variance = t.value.trim(); showErrors(); }
  else if (t.id === 'search') { S.search = t.value; renderTable(); }
  else if (t.id === 'tol' && isPct(t.value)) { S.tol[S.tab] = +t.value; $('#err-tol').textContent = ''; renderTable(); }
});

document.addEventListener('focusout', e => {
  const t = e.target;
  if (t.id === 'variance') { S.touched.variance = true; showErrors(); }
  else if (t.dataset.sub) { S.touched['sub' + t.dataset.sub] = true; showErrors(); }
  else if (t.id === 'tol') $('#err-tol').textContent = isPct(t.value) ? '' : `Enter a whole number from 0 to 100 (using ${S.tol[S.tab]}%)`;
});

document.addEventListener('click', e => {
  const t = e.target.closest('button, th[data-sort]');
  if (!t) { if (e.target.id === 'modal') closeModal(); return; }
  if (t.id === 'compare') compare();
  else if (t.dataset.tab) { S.tab = +t.dataset.tab; S.search = ''; S.sort = 0; renderResults(); }
  else if (t.hasAttribute('data-sort')) { S.sort = S.sort === 0 ? 1 : S.sort === 1 ? -1 : 0; renderTable(); }
  else if (t.id === 'accept') openModal();
  else if (t.id === 'mCancel') closeModal();
  else if (t.id === 'mOk') confirmAccept();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  if (e.key === 'Enter' && e.target.matches('th[data-sort]')) e.target.click();
});

renderShell();
renderMain();
