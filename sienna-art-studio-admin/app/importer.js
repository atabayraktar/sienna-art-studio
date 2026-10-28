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
  const [inputKey, setInputKey] = useState(0); // changing it empties the file picker
  const [tech, setTech] = useState(false); // false = plain-language results, true = developer log
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

  // line = developer log text; simple = plain-language text for the default view (omit to hide it there)
  const addLog = (line, cls = '', simple) => setLog(l => [...l, { line, cls, simple }]);

  async function run() {
    setRunning(true); setSummary(null); setLog([]);
    const wanted = only.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    const products = plan.products.filter(p => !wanted.length || wanted.includes(p.code));
    const cats = plan.categories;
    setProgress({ done: 0, total: cats.length + products.length });
    const stats = { ok: 0, failed: 0, added: 0, updated: 0 };
    let catOk = 0;
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
          addLog(`${c.type} ${c.name}: ${r.action}`, 'ok'); stats.ok++; catOk++;
        } catch (e) { addLog(`${c.type} ${c.name}: FAILED ${e.message}`, 'bad', `Category "${c.name}" could not be saved. ${e.message}`); stats.failed++; }
        tick();
      }
      if (catOk) addLog(`(${catOk} categories ok)`, 'ok', `${catOk} categories ${dryRun ? 'will be added or updated' : 'added or updated'}`);
      try {
        const r = await post('/api/import/menu', { categories: cats, dryRun });
        addLog(`Site menu (${r.groups} main categories): ${r.action}`, 'ok', `The site menu ${dryRun ? 'will be updated' : 'was updated'}`); stats.ok++;
      } catch (e) { addLog(`Site menu: FAILED ${e.message}`, 'bad', `The site menu could not be updated. ${e.message}`); stats.failed++; }

      for (const p of products) {
        try {
          const collectionIds = [p.subcategory, p.category].filter(Boolean).map(n => ids[n.toLowerCase()]).filter(x => x && x.id && !x.smart).map(x => x.id);
          if (dryRun === false && collectionIds.length === 0) addLog(`! ${p.code}: no collection could be linked`, 'warn');
          const r = await post('/api/import/product', { product: p, collectionIds, locationId: prep.locationId, publicationId: prep.publicationId, dryRun });
          const isNew = /^creat/.test(r.action);
          if (isNew) stats.added++; else stats.updated++;
          addLog(`${p.code} ${p.name}: ${r.action}${r.variants > 1 ? ` (${r.variants} variants)` : ''}${r.newImages ? `, ${r.newImages} new image(s)` : ''}`, 'ok',
            `${p.name} ${dryRun ? 'will be' : 'was'} ${isNew ? 'added' : 'updated'}`); stats.ok++;
        } catch (e) { addLog(`${p.code} ${p.name}: FAILED ${e.message}`, 'bad', `${p.name} could not be saved. ${e.message}`); stats.failed++; }
        tick();
      }
    } catch (e) {
      addLog('STOPPED: ' + e.message, 'bad', 'Stopped. ' + e.message); stats.failed++;
    }
    setSummary({ ...stats, dryRun });
    setRunning(false);
  }

  function startOver() {
    setPlan(null); setFileName(''); setParseError(''); setSummary(null); setLog([]); setOnly('');
    setDryRun(true); setProgress({ done: 0, total: 0 }); setInputKey(k => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        {conn && conn.connected && (
          <div className="ok">
            <div>Connected: {conn.shopName} ({conn.domain})</div>
            <div>Stock location: {conn.locationName || 'none'}</div>
            <div>Online Store channel: {conn.publicationId ? 'found' : 'not found'}</div>
          </div>
        )}
        {conn && !conn.connected && <div className="bad">Not connected. {conn.error}</div>}
      </section>

      <section className="card">
        <h2>2. Excel file</h2>
        <div className={'drop' + (over ? ' over' : '')}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); loadFile(e.dataTransfer.files[0]); }}>
          <p>Drop the .xlsx here or</p>
          <input key={inputKey} type="file" accept=".xlsx" onChange={e => loadFile(e.target.files[0])} aria-label="Choose Excel file" />
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
          <details style={{ marginTop: 12 }}><summary>Show the list of products in this file</summary>
            <div className="scroll"><table>
              <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Variants</th><th>Price</th></tr></thead>
              <tbody>{plan.products.map(p => <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{p.category}{p.subcategory ? ' / ' + p.subcategory : ''}</td><td>{p.variants.length}</td><td>{[...new Set(p.variants.map(v => v.price))].join(', ')}</td></tr>)}</tbody>
            </table></div>
          </details>
        </section>
      )}

      {plan && (
        <section className="card">
          <h2>4. Send to the site</h2>
          <label className="switch">
            <input type="checkbox" role="switch" checked={tech} onChange={e => setTech(e.target.checked)} />
            <span>I know coding <span className="muted">(show technical details)</span></span>
          </label>

          <label className="row preview">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
            <span>
              <b>Preview only</b> (Dry run)
              <span className="muted block">Shows what WOULD change on the site, but changes nothing. Run this first, every time. If it finds no problems, untick this box and press "Import to the site" to really publish.</span>
            </span>
          </label>

          <label htmlFor="only">Only some products <span className="muted">(optional)</span></label>
          <input id="only" type="text" value={only} onChange={e => setOnly(e.target.value)} placeholder="e.g. SAS-TOY-01, SAS-SWAN" />
          <p className="muted">Type the Product Codes separated by commas. Leave empty to include every product in the file. Products already on the site are updated, new ones are added. A "-" in the Excel means "leave as it is".</p>

          <button disabled={blocked} onClick={run}>{running ? 'Working...' : dryRun ? 'Run preview' : 'Import to the site'}</button>
          {!conn?.connected && <span className="bad"> Shopify is not connected.</span>}
          {running && <div className="bar" style={{ marginTop: 14 }}><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}

          {log.length > 0 && tech && <div className="log" ref={logRef} style={{ marginTop: 14 }}>{log.map((l, i) => <div key={i} className={l.cls}>{l.line}</div>)}</div>}
          {log.length > 0 && !tech && (
            <ul className="plain" ref={logRef} style={{ marginTop: 14 }}>
              {log.filter(l => l.simple).map((l, i) => <li key={i} className={l.cls}>{l.cls === 'bad' ? '✗' : '✓'} {l.simple}</li>)}
            </ul>
          )}

          {summary && tech && <p><b>{summary.dryRun ? 'Dry run finished' : 'Import finished'}:</b> <span className="ok">{summary.ok} ok</span>, <span className={summary.failed ? 'bad' : ''}>{summary.failed} failed</span>.</p>}
          {summary && !tech && (
            <div className={'callout' + (summary.failed ? ' bad' : '')} role="status">
              {summary.dryRun && !summary.failed && <><b>Preview finished, no problems found.</b> Nothing was changed on the site. {summary.updated} product(s) would be updated and {summary.added} added. If this looks right: untick "Preview only" above and press "Import to the site".</>}
              {summary.dryRun && summary.failed > 0 && <><b>{summary.failed} problem(s) found.</b> Nothing was changed on the site. Fix the problem (see the ✗ lines above) and run the preview again. If you are stuck, ask the developer.</>}
              {!summary.dryRun && !summary.failed && <><b>Done! The changes are live on the site.</b> {summary.updated} product(s) updated, {summary.added} added. The categories and the site menu are up to date.</>}
              {!summary.dryRun && summary.failed > 0 && <><b>Finished with {summary.failed} problem(s).</b> Everything else was saved. See the ✗ lines above, fix them in the Excel and import again. If you are stuck, ask the developer.</>}
            </div>
          )}
          {summary && !running && <button className="ghost" style={{ marginTop: 14 }} onClick={startOver}>Start a new import</button>}
        </section>
      )}
    </main>
  );
}
