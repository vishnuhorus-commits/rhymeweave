/* HORUS Solar Funnel: additive local folder filing. No archive mutation or uploads. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const LIMITS = { file: 32 * 1024 * 1024, input: 96 * 1024 * 1024, expanded: 128 * 1024 * 1024, files: 10000, output: 220 * 1024 * 1024 };
  const EXPECTED = 'D:\\HORUS_AZ_FILE_FOUNDATION';
  let queued = [], folder = null, lastPlan = null, busy = false, written = 0, writeAttempted = false;
  const encoder = new TextEncoder();
  const bridge = () => window.HorusFolderBridge;
  const core = () => window.HorusFunnelCore;

  function notice(text, error = false) {
    $('funnelStatus').textContent = text;
    $('funnelStatus').classList.toggle('bad', error);
  }
  function lock(value) {
    busy = value;
    for (const id of ['funnelChooseFolder', 'funnelAddFiles', 'funnelAddFolder', 'funnelClearQueue', 'funnelFile', 'funnelZip']) $(id).disabled = value || (id === 'funnelFile' && !folder);
    $('funnelSource').disabled = value;
    $('funnelBusy').hidden = !value;
  }
  function batchId() {
    const random = crypto.randomUUID ? crypto.randomUUID().replaceAll('-', '').slice(0, 12) : Array.from(crypto.getRandomValues(new Uint8Array(6)), n => n.toString(16).padStart(2, '0')).join('');
    return 'HORUS_' + new Date().toISOString().replace(/[-:.]/g, '').replace('T', '_').replace('Z', '') + '_' + random;
  }
  function isMissing(error) { return error && error.name === 'NotFoundError'; }
  function safeParts(path) {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\')) throw new Error('Unsafe output path was blocked.');
    const parts = path.split('/');
    for (const part of parts) {
      if (!part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)) throw new Error('Unsafe Windows output name was blocked: ' + part);
    }
    return parts;
  }
  async function directory(root, parts, create) {
    let dir = root;
    for (const name of parts) {
      try { dir = await dir.getDirectoryHandle(name, { create }); }
      catch (error) { if (!create && isMissing(error)) return null; throw error; }
    }
    return dir;
  }
  async function letterBase() {
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      try { await folder.getDirectoryHandle(letter); return ''; }
      catch (error) { if (!isMissing(error) && error.name !== 'TypeMismatchError') throw error; }
    }
    for (const name of ['A-Z', 'A_Z', 'AZ']) {
      try { await folder.getDirectoryHandle(name); return name; }
      catch (error) { if (!isMissing(error)) throw new Error(name + ' is not an accessible folder: ' + error.message); }
    }
    return 'A-Z';
  }
  function queueSummary() {
    const total = queued.reduce((n, item) => n + item.file.size, 0);
    $('funnelQueue').textContent = queued.length ? queued.length.toLocaleString() + ' source file(s) queued · ' + (total / 1024 / 1024).toFixed(1) + ' MiB. Originals stay where they are.' : 'No files queued. Paste into this funnel or add files, a folder, or a chunker ZIP.';
    const list = $('funnelQueueList');
    list.textContent = '';
    for (const item of queued.slice(0, 12)) {
      const li = document.createElement('li'); li.textContent = item.name; list.appendChild(li);
    }
    if (queued.length > 12) { const li = document.createElement('li'); li.textContent = '… and ' + (queued.length - 12).toLocaleString() + ' more'; list.appendChild(li); }
  }
  function addFiles(items) {
    if (busy) return;
    const next = queued.slice();
    for (const item of items) {
      if (item.file.size > LIMITS.file) throw new Error(item.name + ' exceeds the 32 MiB single-file limit. Split it with your chunker first.');
      next.push(item);
    }
    if (next.length > LIMITS.files || next.reduce((n, item) => n + item.file.size, 0) > LIMITS.input) throw new Error('This batch is too large. Add fewer files (up to 96 MiB and 10,000 files).');
    queued = next; $('funnelSource').value = 'intake'; queueSummary();
    notice('Source files queued. Choose Separate & File or Download Folder ZIP when ready.');
  }
  async function droppedFiles(dataTransfer) {
    const out = [];
    async function walk(entry, prefix) {
      if (out.length >= LIMITS.files) throw new Error('Too many files in this folder. Use a smaller folder or chunked ZIP.');
      const path = prefix + entry.name;
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject)); out.push({ file, name: path });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        while (true) {
          const entries = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (!entries.length) break;
          for (const child of entries) await walk(child, path + '/');
        }
      }
    }
    const items = [...(dataTransfer.items || [])];
    const roots = items.filter(item => item.kind === 'file').map(item => item.webkitGetAsEntry ? item.webkitGetAsEntry() : null).filter(Boolean);
    if (roots.length) for (const entry of roots) await walk(entry, '');
    else for (const file of dataTransfer.files) out.push({ file, name: file.webkitRelativePath || file.name });
    return out;
  }
  function decode(bytes, name, warnings) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch {
      warnings.push(name + ': decoded as Windows-1252 because UTF-8 was not valid. Original bytes are retained.');
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }
  function safeZipName(name) {
    const normalized = String(name).replaceAll('\\', '/');
    return normalized && !normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized) && !normalized.split('/').some(part => part === '..' || part === '.') && !/[\x00-\x1f]/.test(normalized);
  }
  function boundedZipEntry(entry, budget) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0, settled = false;
      const stream = entry.internalStream('uint8array');
      stream.on('data', bytes => {
        if (settled) return;
        size += bytes.length; budget.bytes += bytes.length;
        if (size > LIMITS.file || budget.bytes > LIMITS.expanded) {
          settled = true; stream.pause(); reject(new Error('ZIP expansion exceeded the safe batch limit. Use a smaller chunker ZIP.')); return;
        }
        chunks.push(bytes);
      }).on('error', error => { if (!settled) { settled = true; reject(error); } }).on('end', () => {
        if (settled) return;
        settled = true; const bytes = new Uint8Array(size); let at = 0;
        for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
        resolve(bytes);
      }).resume();
    });
  }
  function lineRecords(text, name) {
    const lines = bridge().splitLines(text);
    if (lines.length > 200000) throw new Error(name + ': over 200,000 lines. Split this input into smaller chunks.');
    return lines.map((line, i) => ({ text: line, source: name, line: i + 1 }));
  }
  async function textRecords(bytes, name, warnings, budget) {
    const ext = name.toLowerCase().match(/\.([^.\/]+)$/)?.[1] || '';
    if (ext === 'docx') {
      const documentZip = await JSZip.loadAsync(bytes, { createFolders: false });
      const documentXml = documentZip.file('word/document.xml');
      if (!documentXml) throw new Error(name + ': DOCX has no document text.');
      const xmlBytes = await boundedZipEntry(documentXml, budget);
      const documentXmlDom = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
      if (documentXmlDom.querySelector('parsererror')) throw new Error(name + ': DOCX XML could not be read.');
      const paragraphs = [...documentXmlDom.getElementsByTagNameNS('*', 'p')];
      if (paragraphs.length > 200000) throw new Error(name + ': too many paragraphs for one batch.');
      return paragraphs.map((paragraph, i) => ({ text: [...paragraph.getElementsByTagNameNS('*', 't')].map(node => node.textContent).join(''), source: name, line: i + 1 }));
    }
    if (!['txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json', 'html', 'htm', 'log', 'xml', 'rtf'].includes(ext)) {
      warnings.push(name + ': unsupported format; original bytes retained, not treated as extracted writing. Image/scanned PDFs are not guessed.'); return [];
    }
    let text = decode(bytes, name, warnings).replace(/^\uFEFF/, '');
    if (ext === 'html' || ext === 'htm') text = bridge().htmlToPlain(text);
    if (ext === 'rtf') { warnings.push(name + ': RTF is preserved as original but not extracted; export it as TXT or DOCX first.'); return []; }
    return lineRecords(text, name);
  }
  function appendRecords(target, records) {
    if (target.length + records.length > 200000) throw new Error('Over 200,000 lines in this batch. Split it into smaller chunker ZIPs.');
    for (const record of records) target.push(record);
  }
  async function collect() {
    const records = [], originals = [], warnings = [], budget = { bytes: 0 };
    if ($('funnelSource').value === 'archive') {
      const snapshot = bridge().getSnapshot();
      if (snapshot.phrases.length > 200000) throw new Error('The browser archive is too large for one folder export. Use smaller text chunks.');
      for (const text of snapshot.phrases) records.push({ text, source: 'FINISHED_BROWSER_ARCHIVE', line: records.length + 1 });
      originals.push({ name: 'BROWSER_ARCHIVE_BACKUP.json', data: JSON.stringify(snapshot, null, 2) });
      return { records, originals, warnings };
    }
    for (const [name, pasted] of [['PASTED_WRITING.txt', $('funnelPaste').value], ['COMMAND_DESK_INTAKE.txt', $('intake').value]]) {
      if (!pasted.trim()) continue;
      if (encoder.encode(pasted).length > LIMITS.file) throw new Error('Pasted writing exceeds 32 MiB. Use a chunker or smaller batch.');
      originals.push({ name, data: pasted });
      appendRecords(records, lineRecords(pasted, name));
    }
    for (let i = 0; i < queued.length; i++) {
      const item = queued[i]; notice('Reading source ' + (i + 1) + ' of ' + queued.length + ': ' + item.name);
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      originals.push({ name: item.name, data: bytes });
      if (/\.zip$/i.test(item.name)) {
        const zip = await JSZip.loadAsync(bytes, { createFolders: false });
        const members = Object.values(zip.files).filter(entry => !entry.dir);
        if (members.length + records.length > LIMITS.files * 20 || members.length > LIMITS.files) throw new Error('ZIP contains too many entries. Use a smaller chunker ZIP.');
        const canonical = members.filter(entry => /(?:^|\/)(?:A[_-]?Z)\/[A-Z_#](?:\.txt|\/[^/]+\.txt)$/i.test(entry.name) && safeZipName(entry.unsafeOriginalName || entry.name));
        if (canonical.length) warnings.push(item.name + ': canonical A-Z writing files selected. Secondary indexes and metadata remain in the original ZIP, not re-imported as writing.');
        for (const entry of canonical.length ? canonical : members) {
          const originalName = entry.unsafeOriginalName || entry.name;
          if (!safeZipName(originalName)) { warnings.push(item.name + '/' + originalName + ': unsafe ZIP path rejected.'); continue; }
          if (/\.zip$/i.test(entry.name)) { warnings.push(item.name + '/' + entry.name + ': nested ZIP was not recursively expanded. Original outer ZIP retained.'); continue; }
          const expanded = await boundedZipEntry(entry, budget);
          let extracted = await textRecords(expanded, item.name + '/' + entry.name, warnings, budget);
          if (canonical.length) {
            const headings = extracted.filter(record => /^\s*\[[A-Z_#]\]\s*$/.test(record.text));
            if (headings.length) warnings.push(item.name + '/' + entry.name + ': bucket heading retained in the original ZIP, not treated as a writing line.');
            extracted = extracted.filter(record => !/^\s*\[[A-Z_#]\]\s*$/.test(record.text));
          }
          appendRecords(records, extracted);
        }
      } else {
        budget.bytes += bytes.length;
        if (budget.bytes > LIMITS.expanded) throw new Error('Expanded batch exceeds 128 MiB. Use fewer files.');
        appendRecords(records, await textRecords(bytes, item.name, warnings, budget));
      }
      if (records.length > 200000) throw new Error('Over 200,000 lines in this batch. Split it into smaller chunker ZIPs.');
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { records, originals, warnings };
  }
  async function prepare(base) {
    if (!core() || !bridge() || !window.JSZip) throw new Error('The funnel code has not loaded. Reload this page while online.');
    const source = await collect();
    if (!source.records.some(record => String(record.text).trim())) throw new Error('No readable writing is queued. Paste writing, add text/ZIP files, or choose Finished browser archive. ' + source.warnings.slice(0, 3).join(' '));
    const b = bridge();
    const plan = await core().planExport({ ...source, batchId: batchId(), letterBase: base, head: b.head, skel: b.skel, pretty: b.pretty, stopWords: b.stopWords, chunkLines: 5000 });
    if (source.warnings.length) plan.entries.push({ path: plan.runPath + '/INPUT_WARNINGS.txt', data: source.warnings.join('\n') + '\n', mime: 'text/plain', kind: 'review' });
    const total = plan.entries.reduce((n, entry) => n + (typeof entry.data === 'string' ? encoder.encode(entry.data).length : entry.data.byteLength ?? entry.data.size ?? 0), 0);
    if (total > LIMITS.output) throw new Error('Generated families would exceed 220 MiB. Use a smaller batch. Nothing was filed.');
    plan.inputWarnings = source.warnings; plan.totalBytes = total;
    return plan;
  }
  async function writePlan(plan) {
    const paths = new Set();
    for (const entry of plan.entries) {
      const parts = safeParts(entry.path);
      if (paths.has(entry.path)) throw new Error('Duplicate output path blocked: ' + entry.path);
      paths.add(entry.path);
      const dir = await directory(folder, parts.slice(0, -1), false);
      if (dir) {
        try { await dir.getFileHandle(parts.at(-1)); throw new Error('An output already exists. No files were overwritten: ' + entry.path); }
        catch (error) { if (!isMissing(error)) throw error; }
      }
    }
    written = 0;
    const ordered = plan.entries.filter(entry => entry.path !== plan.indexPath).concat(plan.entries.filter(entry => entry.path === plan.indexPath));
    for (const entry of ordered) {
      writeAttempted = true;
      const parts = safeParts(entry.path), dir = await directory(folder, parts.slice(0, -1), true);
      try { await dir.getFileHandle(parts.at(-1)); throw new Error('A filename appeared during filing; stopped rather than overwrite: ' + entry.path); }
      catch (error) { if (!isMissing(error)) throw error; }
      const file = await dir.getFileHandle(parts.at(-1), { create: true });
      const output = await file.createWritable();
      try { await output.write(entry.data); await output.close(); }
      catch (error) { try { await output.abort(); } catch {} throw error; }
      written++;
      if (written % 10 === 0 || written === ordered.length) notice('Filing new copies: ' + written + ' of ' + ordered.length + '. Existing files untouched.');
      if (written % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  function finish(plan, zipped) {
    const summary = plan.summary || {};
    const lineCount = summary.uniqueRecords ?? summary.uniqueLines ?? summary.records ?? summary.lines ?? plan.manifest?.records?.length;
    $('funnelLastRun').textContent = (zipped ? 'ZIP ready' : 'Filed') + ' · ' + plan.entries.length.toLocaleString() + ' new files' + (lineCount != null ? ' · ' + Number(lineCount).toLocaleString() + ' writing lines' : '');
    $('funnelRunPath').textContent = zipped ? 'ZIP: ' + plan.batchId + '.zip. It contains real folders and a linked per-run INDEX.html.' : 'Saved index: ' + folder.name + '/' + plan.indexPath + '. Open this INDEX.html from the saved folder for local file links.';
    notice((zipped ? 'Folder ZIP downloaded. ' : 'New copies filed successfully. ') + 'Original writing and the existing browser archive are unchanged.' + (plan.inputWarnings.length ? ' ' + plan.inputWarnings.length + ' input warning(s) saved with the run.' : ''));
    if (!zipped) { lastPlan = plan; $('funnelBrowse').disabled = false; }
  }
  async function exportRun(zipped) {
    if (busy) return;
    if (!zipped && !folder) { notice('Choose your A-Z folder first, or use Download Folder ZIP.', true); return; }
    lock(true); written = 0; writeAttempted = false;
    try {
      const plan = await prepare(zipped ? 'A-Z' : await letterBase());
      if (zipped) {
        const zip = new JSZip();
        for (const entry of plan.entries) { safeParts(entry.path); zip.file(entry.path, entry.data, { createFolders: true }); }
        notice('Building the folder ZIP…');
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 }, streamFiles: true }, update => notice('Building folder ZIP: ' + Math.round(update.percent) + '%'));
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = plan.batchId + '.zip'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else await writePlan(plan);
      finish(plan, zipped);
    } catch (error) {
      notice((writeAttempted ? 'Filing stopped after ' + written + ' completed new file(s). New partial copies may remain; retry creates a new batch. Existing files were not overwritten. ' : 'Nothing was filed. ') + error.message, true);
    } finally { lock(false); }
  }
  async function browseFolder(path) {
    try {
      const dir = await directory(folder, safeParts(path), false);
      if (!dir) throw new Error('Saved folder is no longer available. Reconnect your destination.');
      $('funnelBrowserPath').textContent = folder.name + '/' + path;
      const box = $('funnelBrowserFiles'); box.textContent = '';
      for await (const entry of dir.values()) {
        if (entry.kind !== 'file') continue;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = entry.name;
        button.onclick = async () => {
          try { const file = await entry.getFile(); const text = await file.text(); $('funnelFilePreview').textContent = text.length > 200000 ? text.slice(0, 200000) + '\n\n[Preview limited to 200,000 characters. Saved file is complete.]' : text; }
          catch (error) { notice('Could not read saved file: ' + error.message, true); }
        };
        box.appendChild(button);
      }
    } catch (error) { notice(error.message, true); }
  }
  function openBrowser() {
    if (!folder || !lastPlan) return;
    const groups = $('funnelBrowserGroups'); groups.textContent = '';
    const seen = new Set();
    for (const group of lastPlan.groups || []) {
      const path = String(group.path).replace(/\/$/, '');
      if (seen.has(path)) continue; seen.add(path);
      const button = document.createElement('button'); button.className = 'btn'; button.type = 'button'; button.textContent = group.label + ' · ' + group.count; button.onclick = () => browseFolder(path); groups.appendChild(button);
    }
    const runButton = document.createElement('button'); runButton.className = 'btn safe'; runButton.textContent = 'Originals, review & run index'; runButton.onclick = () => browseFolder(lastPlan.runPath); groups.appendChild(runButton);
    $('funnelBrowser').hidden = false; $('funnelBrowser').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  $('funnelChooseFolder').onclick = async () => {
    if (!window.showDirectoryPicker) { notice('Real-folder filing needs Edge or Chrome on your Windows computer. Download Folder ZIP works here instead.', true); return; }
    try {
      const selected = await window.showDirectoryPicker({ id: 'horus-az-foundation', mode: 'readwrite' });
      folder = selected; lastPlan = null; $('funnelBrowse').disabled = true; $('funnelFile').disabled = false;
      $('funnelConnection').textContent = 'CONNECTED FOLDER · ' + selected.name;
      notice('Connected to ' + selected.name + '. Only this selected folder will receive new copies. Expected Windows folder: ' + EXPECTED + '.');
    } catch (error) { if (error.name !== 'AbortError') notice('Folder connection failed: ' + error.message, true); }
  };
  $('funnelAddFiles').onclick = () => $('funnelFiles').click();
  $('funnelAddFolder').onclick = () => $('funnelFolderFiles').click();
  for (const id of ['funnelFiles', 'funnelFolderFiles']) $(id).onchange = event => {
    try { addFiles([...event.target.files].map(file => ({ file, name: file.webkitRelativePath || file.name }))); }
    catch (error) { notice(error.message, true); }
    event.target.value = '';
  };
  $('funnelClearQueue').onclick = () => { queued = []; queueSummary(); notice('Queued selection cleared. Source files and pasted writing are unchanged.'); };
  $('funnelFile').onclick = () => exportRun(false);
  $('funnelZip').onclick = () => exportRun(true);
  $('funnelBrowse').onclick = openBrowser;
  $('funnelCloseBrowser').onclick = () => { $('funnelBrowser').hidden = true; };
  const drop = $('funnelDrop');
  for (const event of ['dragenter', 'dragover']) drop.addEventListener(event, e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
  for (const event of ['dragleave', 'drop']) drop.addEventListener(event, e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); });
  drop.addEventListener('drop', async event => { if (busy) return; try { addFiles(await droppedFiles(event.dataTransfer)); } catch (error) { notice(error.message, true); } });
  queueSummary(); lock(false);
  window.HorusFunnelUI = Object.freeze({ safeParts, writePlan, boundedZipEntry, safeZipName, decode, prepare, limits: Object.freeze({ ...LIMITS }) });
})();
