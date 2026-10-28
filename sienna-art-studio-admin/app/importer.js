'use client';
import { useEffect, useRef, useState } from 'react';
import { parseWorkbook, sheetToObjects } from '@/lib/parse-workbook';

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export default function Importer() {
  const [conn, setConn] = useState(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState(null);
  const [parseError, setParseError] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [only, setOnly] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState([]);
  const [summary, setSummary] = useState(null);
  const [over, setOver] = useState(false);
  const logRef = useRef(null);

  useEffect(() => { fetch('/api/status').then(r => r.json()).then(setConn).catch(e => setConn({ connected: false, error: e.message })); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  async function loadFile(file) {
    if (!file) return;
    setPlan(null); setParseError(''); setSummary(null); setLog([]); setFileName(file.name);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const c = wb.getWorksheet('Categories'), p = wb.getWorksheet('Products');
      if (!c || !p) throw new Error('This is not the import file: the tabs "Categories" and "Products" are missing.');
      setPlan(parseWorkbook({ categoriesSheet: sheetToObjects(c), productsSheet: sheetToObjects(p) }));
    } catch (e) {
      setParseError(e.message);
    }
  }

  const addLog = (line, cls = '') => setLog(l => [...l, { line, cls }]);

  async function run() {
    setRunning(true); setSummary(null); setLog([]);
    const wanted = only.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    const products = plan.products.filter(p => !wanted.length || wanted.includes(p.code));
    const cats = plan.categories;
    setProgress({ done: 0, total: cats.length + products.length });
    const stats = { ok: 0, failed: 0 };
    let done = 0;
    const tick = () => { done += 1; setProgress({ done, total: cats.length + products.length }); };
    try {
      if (wanted.length && !products.length) throw new Error('None of those product codes exist in the file.');
      const prep = await fetch('/api/status').then(r => r.json());
      if (!prep.connected) throw new Error(prep.error || 'Not connected to Shopify');
      addLog(`${dryRun ? 'DRY RUN (nothing is written)' : 'LIVE IMPORT'} on ${prep.shopName}. Location: ${prep.locationName || 'none'}`);
      if (!prep.locationId) addLog('No stock location found: stock will NOT be set.', 'warn');
      if (!prep.publicationId) addLog('Online Store sales channel not found: new products will not be published.', 'warn');

      const ids = {}; // category name (lowercase) -> { id, smart }
      for (const c of cats) {
        try {
          const r = await post('/api/import/collection', { category: c, dryRun });
          ids[c.name.toLowerCase()] = r;
          if (r.smart) addLog(`! ${c.type} "${c.name}" is an automatic (rule based) collection: products cannot be added to it by the panel.`, 'warn');
          addLog(`${c.type} ${c.name}: ${r.action}`, 'ok'); stats.ok++;
        } catch (e) { addLog(`${c.type} ${c.name}: FAILED ${e.message}`, 'bad'); stats.failed++; }
        tick();
      }
      for (const p of products) {
        try {
          const collectionIds = [p.subcategory, p.category].filter(Boolean).map(n => ids[n.toLowerCase()]).filter(x => x && x.id && !x.smart).map(x => x.id);
          if (dryRun === false && collectionIds.length === 0) addLog(`! ${p.code}: no collection could be linked`, 'warn');
          const r = await post('/api/import/product', { product: p, collectionIds, locationId: prep.locationId, publicationId: prep.publicationId, dryRun });
          addLog(`${p.code} ${p.name}: ${r.action}${r.variants > 1 ? ` (${r.variants} variants)` : ''}${r.newImages ? `, ${r.newImages} new image(s)` : ''}`, 'ok'); stats.ok++;
        } catch (e) { addLog(`${p.code} ${p.name}: FAILED ${e.message}`, 'bad'); stats.failed++; }
        tick();
      }
    } catch (e) {
      addLog('STOPPED: ' + e.message, 'bad'); stats.failed++;
    }
    setSummary({ ...stats, dryRun });
    setRunning(false);
  }

  async function logout() { await post('/api/logout', {}); window.location.href = '/login'; }
  const blocked = !plan || plan.errors.length > 0 || !conn?.connected || running;

  return (
    <main className="wrap">
      <div className="top">
        <div><h1>Sienna Admin</h1><div className="muted">Upload the Excel, review, import to Shopify.</div></div>
        <button className="ghost" onClick={logout}>Sign out</button>
      </div>

      <section className="card">
        <h2>1. Shopify connection</h2>
        {!conn && <div className="muted">Checking...</div>}
        {conn && conn.connected && <div className="ok">Connected: {conn.shopName} ({conn.domain}). Stock location: {conn.locationName || 'none'}. Online Store channel: {conn.publicationId ? 'found' : 'not found'}.</div>}
        {conn && !conn.connected && <div className="bad">Not connected. {conn.error}</div>}
      </section>

      <section className="card">
        <h2>2. Excel file</h2>
        <div className={'drop' + (over ? ' over' : '')}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); loadFile(e.dataTransfer.files[0]); }}>
          <p>Drop the .xlsx here or</p>
          <input type="file" accept=".xlsx" onChange={e => loadFile(e.target.files[0])} aria-label="Choose Excel file" />
          {fileName && <p className="muted">{fileName}</p>}
        </div>
        {parseError && <p className="bad" role="alert">{parseError}</p>}
      </section>

      {plan && (
        <section className="card">
          <h2>3. Check</h2>
          <p>
            <b>{plan.categories.filter(c => c.type === 'Category').length}</b> categories, <b>{plan.categories.filter(c => c.type === 'Subcategory').length}</b> subcategories, <b>{plan.products.length}</b> products, <b>{plan.products.reduce((n, p) => n + p.variants.length, 0)}</b> variants.
          </p>
          {plan.errors.length === 0
            ? <p className="ok"><b>No errors.</b> The file can be imported.</p>
            : <p className="bad"><b>{plan.errors.length} error(s).</b> Fix them in the Excel and upload it again.</p>}
          {plan.errors.length > 0 && <div className="scroll"><table><tbody>{plan.errors.map((e, i) => <tr key={i}><td>{e.where}</td><td className="bad">{e.msg}</td></tr>)}</tbody></table></div>}
          {plan.warnings.length > 0 && (
            <details><summary className="warn">{plan.warnings.length} warning(s)</summary>
              <div className="scroll"><table><tbody>{plan.warnings.map((e, i) => <tr key={i}><td>{e.where}</td><td className="warn">{e.msg}</td></tr>)}</tbody></table></div>
            </details>
          )}
          <details style={{ marginTop: 12 }}><summary>Products in the file</summary>
            <div className="scroll"><table>
              <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Variants</th><th>Price</th></tr></thead>
              <tbody>{plan.products.map(p => <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{p.category}{p.subcategory ? ' / ' + p.subcategory : ''}</td><td>{p.variants.length}</td><td>{[...new Set(p.variants.map(v => v.price))].join(', ')}</td></tr>)}</tbody>
            </table></div>
          </details>
        </section>
      )}

      {plan && (
        <section className="card">
          <h2>4. Import</h2>
          <label className="row" style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
            <span><b>Dry run</b>: only check against the store, write nothing (recommended first)</span>
          </label>
          <label htmlFor="only">Only these product codes (optional, to test with one product)</label>
          <input id="only" type="text" value={only} onChange={e => setOnly(e.target.value)} placeholder="e.g. SAS-TOY-01, SAS-SWAN" />
          <p className="muted">Existing products are found by SKU and updated. New ones are created and published. A "-" in the Excel means "leave as is".</p>
          <button disabled={blocked} onClick={run}>{running ? 'Working...' : dryRun ? 'Run dry run' : 'Import to Shopify'}</button>
          {!conn?.connected && <span className="bad"> Shopify is not connected.</span>}
          {running && <div className="bar" style={{ marginTop: 14 }}><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}
          {log.length > 0 && <div className="log" ref={logRef} style={{ marginTop: 14 }}>{log.map((l, i) => <div key={i} className={l.cls}>{l.line}</div>)}</div>}
          {summary && <p><b>{summary.dryRun ? 'Dry run finished' : 'Import finished'}:</b> <span className="ok">{summary.ok} ok</span>, <span className={summary.failed ? 'bad' : ''}>{summary.failed} failed</span>.</p>}
        </section>
      )}
    </main>
  );
}
