// ============================================================
// 0. ESTADO
// ============================================================
let currentFile = null;
let lastCleanBlob = null;
let lastCleanName = '';
let lastRewrittenText = '';
let lastMarkerCount = 0;
let lastAISignalCount = 0;
let lastAuditItems = [];
let auditFilter = 'all';

// ============================================================
// 7. UI
// ============================================================
const $ = id => document.getElementById(id);
const input = $('input');
const output = $('output');
const backdrop = $('backdrop');

function getOpts(){
  return {
    highlightMarkers: $('optHighlightMarkers').checked,
    highlightAISignals: $('optHighlightAISignals').checked,
    highlightTypo: $('optHighlightTypo').checked,
    highlightHyphen: $('optHighlightHyphen').checked,
    highlightSpace: $('optHighlightSpace').checked,
    highlightNewlines: $('optHighlightNewlines').checked,
    decodeMarkers: $('optDecodeMarkers').checked,
    invisible: $('optInvisible').checked,
    html: $('optHtml').checked,
    normalize: $('optNormalize').checked,
    whitespace: $('optWhitespace').checked,
    normalizeTypo: $('optNormalizeTypo').checked,
  };
}

function updateCounts(){
  $('inCount').textContent = input.value.length.toLocaleString('pt-BR') + ' caracteres';
  $('outCount').textContent = output.value.length.toLocaleString('pt-BR') + ' caracteres';
}

function syncBackdrop(){
  const opts = getOpts();
  try {
    if (input.value.length < 500000){
      backdrop.innerHTML = buildBackdropHTML(input.value, opts);
    } else {
      backdrop.textContent = input.value;
    }
  } catch(e){ console.error('Backdrop:', e); backdrop.textContent = input.value; }
  backdrop.scrollTop = input.scrollTop;
  backdrop.scrollLeft = input.scrollLeft;
}

input.addEventListener('scroll', () => {
  backdrop.scrollTop = input.scrollTop;
  backdrop.scrollLeft = input.scrollLeft;
}, { passive: true });

function updateBadges(){
  const markerCount = countMarkers(input.value);
  lastMarkerCount = markerCount;
  const aiDet = detectAI(input.value);
  lastAISignalCount = aiDet.totalMatches;
  const mBadge = $('markerBadge');
  if (markerCount > 0){ mBadge.textContent = `🔴 ${markerCount.toLocaleString('pt-BR')} marcador${markerCount > 1 ? 'es' : ''}`; mBadge.classList.add('show'); }
  else mBadge.classList.remove('show');
  const aBadge = $('aiBadge');
  if (aiDet.totalMatches > 0){ aBadge.textContent = `🟡 ${aiDet.totalMatches.toLocaleString('pt-BR')} sinal${aiDet.totalMatches > 1 ? 'is' : ''}`; aBadge.classList.add('show'); }
  else aBadge.classList.remove('show');
}

function renderScore(score){
  const v = verdictFor(score);
  $('scoreNum').textContent = score;
  $('scoreNum').style.color = v.color;
  $('verdict').textContent = v.label;
  $('verdictDesc').textContent = v.desc;
  $('verdict').style.color = v.color;
  const arc = $('gaugeArc');
  arc.style.strokeDashoffset = 427 - (score / 100) * 427;
  arc.style.stroke = v.color;
  arc.style.transition = 'stroke-dashoffset .6s ease, stroke .3s ease';
}

function renderEvidence(evidence){
  const panel = $('evidencePanel');
  const list = $('evidenceList');
  if (evidence.length === 0){ panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  list.innerHTML = evidence.map(e => `
    <div class="ev-item">
      <div class="ev-head"><span>${e.id}</span><span class="ev-cat">${e.cat} · ${e.count}x</span></div>
      <div class="ev-match">${e.samples.map(s => `“${escapeHtml(s)}”`).join(' · ')}</div>
      <div class="ev-note">${e.note}</div>
    </div>
  `).join('');
}

// ============================================================
// 8. AUDITORIA
// ============================================================
function auditSummary(items){
  const byCat = {};
  for (const it of items){
    if (!byCat[it.cat]) byCat[it.cat] = { count: 0, types: 0 };
    byCat[it.cat].count += it.count;
    byCat[it.cat].types++;
  }
  return byCat;
}

function renderAudit(text){
  const panel = $('auditPanel');
  const content = $('auditContent');
  const warningBox = $('auditTagsWarning');
  const infoLine = $('auditInfoLine');
  const filtersBox = $('auditFilters');

  const items = auditText(text);
  lastAuditItems = items;

  // Linha informativa de whitespace legítimo (não é hidden)
  const ws = countWhitespace(text);
  if (ws.total > 0){
    const parts = [];
    if (ws.nl > 0) parts.push(`<span class="label">Quebras</span> <span class="value">${ws.nl}</span>`);
    if (ws.tab > 0) parts.push(`<span class="label">Tabs</span> <span class="value">${ws.tab}</span>`);
    infoLine.innerHTML = `<div class="audit-info-line">
      ${parts.join('')}
      <span style="color:#94a3b8;font-size:.75rem">— estrutura legítima do texto, não são removidos</span>
    </div>`;
  } else {
    infoLine.innerHTML = '';
  }

  // Aviso Unicode Tags
  const tagItems = items.filter(i => i.cat === 'tags');
  if (tagItems.length > 0){
    const totalTags = tagItems.reduce((s, i) => s + i.count, 0);
    warningBox.innerHTML = `<div class="audit-tags-warning">
      <strong>⚠️ Unicode Tags detectadas (${totalTags} ocorrências)</strong><br>
      A faixa <code>U+E0000–U+E007F</code> é usada para esconder texto ou instruções dentro de texto aparentemente normal. Presença é sinal forte de manipulação deliberada.
    </div>`;
  } else {
    warningBox.innerHTML = '';
  }

  if (items.length === 0){
    filtersBox.innerHTML = '';
    content.innerHTML = '<div class="audit-empty">✅ Nenhum caractere suspeito encontrado.</div>';
    panel.style.display = 'block';
    return { total: 0, byCat: {}, ws };
  }

  const byCat = auditSummary(items);
  const total = items.reduce((s, i) => s + i.count, 0);

  const catOrder = ['tags','invisible','directional','math','filler','space','typography','hyphen'];
  const presentCats = catOrder.filter(c => byCat[c]);
  let filtersHTML = `<span class="audit-filter ${auditFilter === 'all' ? 'active' : ''}" data-cat="all">Todas <span class="fcount">${total}</span></span>`;
  for (const cat of presentCats){
    const meta = CATEGORIES[cat];
    filtersHTML += `<span class="audit-filter ${auditFilter === cat ? 'active' : ''}" data-cat="${cat}">
      ${meta.emoji} ${meta.label} <span class="fcount">${byCat[cat].count}</span>
    </span>`;
  }
  filtersBox.innerHTML = filtersHTML;

  filtersBox.querySelectorAll('.audit-filter').forEach(el => {
    el.addEventListener('click', () => {
      auditFilter = el.dataset.cat;
      renderAudit(input.value);
    });
  });

  const filteredItems = auditFilter === 'all' ? items : items.filter(i => i.cat === auditFilter);
  const grouped = {};
  for (const it of filteredItems){
    if (!grouped[it.cat]) grouped[it.cat] = [];
    grouped[it.cat].push(it);
  }

  let html = '';
  for (const cat of catOrder){
    if (!grouped[cat]) continue;
    const meta = CATEGORIES[cat];
    const groupTotal = grouped[cat].reduce((s, i) => s + i.count, 0);
    html += `<div class="audit-group">
      <div class="audit-group-head">
        <div class="gname"><span class="gdot" style="background:${meta.color}"></span> ${meta.emoji} ${meta.label}</div>
        <div class="gcount">${groupTotal} ocorrências · ${grouped[cat].length} tipo${grouped[cat].length > 1 ? 's' : ''}</div>
      </div>
      <table class="audit-table"><tbody>`;
    for (const it of grouped[cat].slice(0, 30)){
      const cp = 'U+' + it.code.toString(16).toUpperCase().padStart(4, '0');
      const ctx = text.slice(Math.max(0, it.firstIndex - 20), it.firstIndex + 20).replace(/[\n\r\t]/g, '·');
      html += `<tr>
        <td class="cp">${cp}</td>
        <td class="cnt">${it.count}</td>
        <td class="nm">${escapeHtml(it.name)}<br><span style="color:#555;font-size:.7rem">…${escapeHtml(ctx)}…</span></td>
      </tr>`;
    }
    if (grouped[cat].length > 30) html += `<tr><td colspan="3" style="text-align:center;color:var(--muted);font-size:.75rem">… e mais ${grouped[cat].length - 30} tipos</td></tr>`;
    html += `</tbody></table></div>`;
  }

  content.innerHTML = html;
  panel.style.display = 'block';
  return { total, byCat, ws };
}

// ============================================================
// 9. ANALISAR
// ============================================================
function runAnalyze(){
  const text = input.value;
  if (!text.trim()){ toast('Cole algum texto ou arraste um arquivo primeiro', 'error'); return; }
  const det = detectAI(text);
  renderScore(det.score);
  renderEvidence(det.evidence);
  const { text: cleaned, stats } = cleanText(text, getOpts());
  output.value = cleaned;
  updateCounts();

  const markerTotal = stats.markersDecoded + stats.markersDropped;
  const auditResult = renderAudit(text);
  const byCat = auditResult.byCat || {};
  const ws = auditResult.ws || { total: 0 };

  const hiddenTotal = (byCat.invisible?.count || 0) + (byCat.directional?.count || 0) + (byCat.math?.count || 0) + (byCat.filler?.count || 0);
  const typoTotal = byCat.typography?.count || 0;
  const spaceTotal = byCat.space?.count || 0;
  const hyphenTotal = byCat.hyphen?.count || 0;
  const tagTotal = byCat.tags?.count || 0;

  $('sOrig').textContent = stats.original.toLocaleString('pt-BR');
  $('sWhitespace').textContent = ws.total.toLocaleString('pt-BR');
  $('sMarkers').textContent = markerTotal.toLocaleString('pt-BR');
  $('sAISignals').textContent = det.totalMatches.toLocaleString('pt-BR');
  $('sHidden').textContent = hiddenTotal.toLocaleString('pt-BR');
  $('sTypo').textContent = typoTotal.toLocaleString('pt-BR');
  $('sSpace').textContent = spaceTotal.toLocaleString('pt-BR');
  $('sHyphen').textContent = hyphenTotal.toLocaleString('pt-BR');
  $('sTags').textContent = tagTotal.toLocaleString('pt-BR');
  $('sRemoved').textContent = stats.removed.toLocaleString('pt-BR');
  $('sTime').textContent = det.time + 'ms';
  $('stats').style.display = 'grid';

  renderDiff(text, cleaned);

  let msg = `Score IA: ${det.score}/100`;
  const bits = [];
  if (markerTotal > 0) bits.push(`${markerTotal} marcadores`);
  if (hiddenTotal > 0) bits.push(`${hiddenTotal} ocultos`);
  if (typoTotal > 0) bits.push(`${typoTotal} tipografia`);
  if (tagTotal > 0) bits.push(`${tagTotal} tags ⚠️`);
  if (bits.length) msg += ' · ' + bits.join(' · ');
  toast(msg, tagTotal > 0 ? 'error' : (det.score >= 40 ? 'error' : 'success'));
}

function toast(msg, type){
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3200);
}

function setRewriteStatus(msg, cls){
  const el = $('rewriteStatus');
  el.textContent = msg;
  el.className = 'rewrite-status' + (cls ? ' ' + cls : '');
}

$('btnToggleDiff').addEventListener('click', () => {
  const body = $('diffBody'), btn = $('btnToggleDiff');
  if (body.style.display === 'none'){ body.style.display = 'block'; btn.textContent = 'Ocultar'; }
  else { body.style.display = 'none'; btn.textContent = 'Mostrar'; }
});

// ============================================================
// 11. RESULT PANEL
// ============================================================
function formatBytes(bytes){
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(2) + ' MB';
}

function showResultPanel({ originalFile, cleanBlob, cleanName, markers = 0, metaNote = '', previewUrl = null, fileIcon = '📄' }){
  $('resultPanel').style.display = 'block';
  $('resultTitle').textContent = '✅ Arquivo processado com sucesso';
  $('resultSub').textContent = 'Revise a análise acima e baixe quando quiser.';
  $('resultOrigName').textContent = originalFile.name;
  $('resultOrigSize').textContent = formatBytes(originalFile.size);
  $('resultCleanName').textContent = cleanName;
  $('resultCleanSize').textContent = formatBytes(cleanBlob.size);
  if (markers > 0){ $('resultMarkerRow').style.display = 'flex'; $('resultMarkers').textContent = markers.toLocaleString('pt-BR'); }
  else $('resultMarkerRow').style.display = 'none';
  if (metaNote){ $('resultMetaRow').style.display = 'flex'; $('resultMeta').textContent = metaNote; }
  else $('resultMetaRow').style.display = 'none';
  const prev = $('resultPreview');
  if (previewUrl) prev.innerHTML = `<img src="${previewUrl}" alt="Preview">`;
  else prev.innerHTML = `<div class="file-icon">${fileIcon}</div>`;
  $('btnDownloadLabel').textContent = 'Baixar ' + cleanName;
  $('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideResultPanel(){
  $('resultPanel').style.display = 'none';
  lastCleanBlob = null;
  lastCleanName = '';
}

$('btnDownloadClean').addEventListener('click', () => {
  if (!lastCleanBlob){ toast('Nada para baixar', 'error'); return; }
  const url = URL.createObjectURL(lastCleanBlob);
  const a = document.createElement('a');
  a.href = url; a.download = lastCleanName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('Download: ' + lastCleanName, 'success');
});

$('btnDiscardResult').addEventListener('click', hideResultPanel);
$('btnDiscardResult2').addEventListener('click', hideResultPanel);

// ============================================================
// 12. OFFICE
// ============================================================
const OFFICE_NS = {
  word: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  xl: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  ppt: 'http://schemas.openxmlformats.org/drawingml/2006/main',
};

async function extractTextFromDocx(file){
  const zip = await JSZip.loadAsync(file);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('DOCX inválido');
  const docXml = await docFile.async('string');
  const doc = new DOMParser().parseFromString(docXml, 'application/xml');
  const paragraphs = doc.getElementsByTagNameNS(OFFICE_NS.word, 'p');
  let text = '';
  for (const p of paragraphs){
    const runs = p.getElementsByTagNameNS(OFFICE_NS.word, 't');
    let line = '';
    for (const r of runs) line += r.textContent;
    if (line.trim()) text += line + '\n';
  }
  return text.trim();
}

async function extractTextFromXlsx(file){
  const zip = await JSZip.loadAsync(file);
  const sharedFile = zip.file('xl/sharedStrings.xml');
  let lines = [];
  if (sharedFile){
    const xml = await sharedFile.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const siNodes = doc.getElementsByTagNameNS(OFFICE_NS.xl, 'si');
    for (const si of siNodes){
      const tNodes = si.getElementsByTagNameNS(OFFICE_NS.xl, 't');
      let txt = '';
      for (const t of tNodes) txt += t.textContent;
      if (txt) lines.push(txt);
    }
  }
  const sheetNames = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  for (const name of sheetNames){
    const xml = await zip.file(name).async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const inlineNodes = doc.getElementsByTagNameNS(OFFICE_NS.xl, 'is');
    for (const is of inlineNodes){
      const tNodes = is.getElementsByTagNameNS(OFFICE_NS.xl, 't');
      let txt = '';
      for (const t of tNodes) txt += t.textContent;
      if (txt) lines.push(txt);
    }
  }
  return lines.join('\n');
}

async function extractTextFromPptx(file){
  const zip = await JSZip.loadAsync(file);
  const slideNames = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1], 10) - parseInt(b.match(/slide(\d+)/)[1], 10));
  let text = '';
  for (const name of slideNames){
    const xml = await zip.file(name).async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const tNodes = doc.getElementsByTagNameNS(OFFICE_NS.ppt, 't');
    let slideText = '';
    for (const t of tNodes) slideText += t.textContent + '\n';
    if (slideText.trim()) text += slideText.trim() + '\n\n';
  }
  return text.trim();
}

function makeCleanCoreXml(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title></dc:title>
  <dc:creator></dc:creator>
  <cp:lastModifiedBy></cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">1970-01-01T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">1970-01-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>`;
}

function makeCleanAppXml(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application></Application>
  <Company></Company>
  <Manager></Manager>
  <Pages>0</Pages>
  <Words>0</Words>
  <Characters>0</Characters>
  <Lines>0</Lines>
  <Paragraphs>0</Paragraphs>
  <TotalTime>0</TotalTime>
</Properties>`;
}

async function cleanOfficeMetadata(file, mimeType){
  const zip = await JSZip.loadAsync(file);
  if (zip.file('docProps/core.xml')) zip.file('docProps/core.xml', makeCleanCoreXml());
  if (zip.file('docProps/app.xml')) zip.file('docProps/app.xml', makeCleanAppXml());
  if (zip.file('docProps/custom.xml')) zip.remove('docProps/custom.xml');
  return await zip.generateAsync({
    type: 'blob',
    mimeType: mimeType,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// ============================================================
// 13. PDF
// ============================================================
let pdfjsReady = null;
async function getPdfJs(){
  if (pdfjsReady) return pdfjsReady;
  pdfjsReady = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs')
    .then(mod => {
      mod.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
      return mod;
    });
  return pdfjsReady;
}

async function extractTextFromPdf(file){
  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++){
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  return fullText.trim();
}

async function cleanPdfMetadata(file){
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { updateMetadata: false });
  pdfDoc.setTitle(''); pdfDoc.setAuthor(''); pdfDoc.setSubject('');
  pdfDoc.setKeywords([]); pdfDoc.setProducer(''); pdfDoc.setCreator('');
  pdfDoc.setCreationDate(new Date(0)); pdfDoc.setModificationDate(new Date(0));
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

// ============================================================
// 14. IMAGEM
// ============================================================
function stripImageMetadata(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        blob ? resolve(blob) : reject(new Error('Falha'));
      }, type, 0.95);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    img.src = url;
  });
}

// ============================================================
// 15. REESCRITA
// ============================================================
const REWRITE_PROMPT = `Reescreva o texto abaixo com suas próprias palavras. Mantenha o significado, mas altere a estrutura das frases, o vocabulário e o ritmo. Remova padrões típicos de LLM. Retorne APENAS o texto reescrito.

TEXTO:
`;

function withTimeout(promise, ms, errorMsg){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg || 'Timeout')), ms))
  ]);
}

async function rewriteWithPuter(text){
  if (typeof puter === 'undefined') throw new Error('Puter.js não carregou.');
  const response = await withTimeout(
    puter.ai.chat(REWRITE_PROMPT + text, { model: 'gpt-4o-mini', stream: false }),
    90000, 'Puter não respondeu em 90s. Use outro provedor.'
  );
  const content = response?.message?.content ?? response?.text ?? response;
  if (typeof content !== 'string' || !content.trim()){
    throw new Error('Puter retornou vazio (limite de uso?)');
  }
  return content;
}

async function rewriteWithGemini(text, apiKey){
  const res = await withTimeout(
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{parts:[{text: REWRITE_PROMPT + text}]}], generationConfig:{ temperature:0.9, maxOutputTokens:2048 } }) }),
    90000, 'Gemini não respondeu em 90s.'
  );
  if (!res.ok) throw new Error('Gemini: ' + res.status);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function rewriteWithGroq(text, apiKey){
  const res = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body: JSON.stringify({ model:'llama-3.3-70b-versatile', messages:[{role:'user', content: REWRITE_PROMPT + text}], temperature:0.9, max_tokens:2048 })
    }), 90000, 'Groq não respondeu em 90s.'
  );
  if (!res.ok) throw new Error('Groq: ' + res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function runRewrite(){
  const text = input.value.trim();
  if (!text){ toast('Cole algum texto primeiro', 'error'); return; }
  const provider = $('providerSelect').value;
  const apiKey = $('apiKeyInput').value.trim();
  const btn = $('btnRewrite');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Reescrevendo...';
  setRewriteStatus('Enviando para ' + provider + '... (até 90s)', 'loading');
  try {
    let rewritten = '';
    if (provider === 'puter') rewritten = await rewriteWithPuter(text);
    else if (provider === 'gemini'){ if (!apiKey) throw new Error('Cole sua API key'); rewritten = await rewriteWithGemini(text, apiKey); }
    else if (provider === 'groq'){ if (!apiKey) throw new Error('Cole sua API key'); rewritten = await rewriteWithGroq(text, apiKey); }
    rewritten = rewritten.trim();
    if (!rewritten) throw new Error('Resposta vazia');
    lastRewrittenText = rewritten;
    output.value = rewritten;
    updateCounts();
    const detNew = detectAI(rewritten);
    const detOld = detectAI(text);
    renderScore(detNew.score);
    renderEvidence(detNew.evidence);
    renderDiff(text, rewritten);
    setRewriteStatus(`✅ Reescrito. Score: ${detOld.score} → ${detNew.score}`, 'success');
    toast('Reescrito! Score: ' + detOld.score + ' → ' + detNew.score, 'success');
  } catch(e){
    console.error(e);
    setRewriteStatus('❌ ' + e.message, 'error');
    toast('Erro: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Reescrever texto';
  }
}

// ============================================================
// 16. ROTEAMENTO DE ARQUIVOS
// ============================================================
const IMG_EXTS = ['png','jpg','jpeg','webp','gif','bmp'];
const OFFICE_TYPES = {
  docx: { extract: extractTextFromDocx, clean: cleanOfficeMetadata,
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          meta: 'Autor, empresa, histórico, app', icon: '📄' },
  xlsx: { extract: extractTextFromXlsx, clean: cleanOfficeMetadata,
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          meta: 'Autor, empresa, propriedades', icon: '📊' },
  pptx: { extract: extractTextFromPptx, clean: cleanOfficeMetadata,
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          meta: 'Autor, empresa, notas', icon: '📽️' },
};

function setInputText(text){
  input.value = text;
  syncBackdrop();
  updateBadges();
  updateCounts();
}

async function handleFile(file){
  const ext = file.name.split('.').pop().toLowerCase();
  const baseName = file.name.replace(/\.\w+$/, '');
  currentFile = file; lastCleanBlob = null; lastCleanName = '';
  hideResultPanel();

  if (IMG_EXTS.includes(ext)){
    try {
      toast('Processando imagem...');
      const blob = await stripImageMetadata(file);
      const cleanName = baseName + '_limpo.' + (file.type === 'image/png' ? 'png' : 'jpg');
      lastCleanBlob = blob; lastCleanName = cleanName;
      const previewUrl = URL.createObjectURL(blob);
      showResultPanel({ originalFile: file, cleanBlob: blob, cleanName, markers: 0,
        metaNote: 'EXIF, GPS, XMP, C2PA', previewUrl, fileIcon: '🖼️' });
      setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
      toast(`Imagem: ${formatBytes(file.size)} → ${formatBytes(blob.size)}`, 'success');
    } catch(e){ toast('Erro: ' + e.message, 'error'); }
    return;
  }

  if (OFFICE_TYPES[ext]){
    const cfg = OFFICE_TYPES[ext];
    try {
      toast(`Processando ${ext.toUpperCase()}...`);
      const text = await cfg.extract(file);
      if (!text.trim()){ toast(`${ext.toUpperCase()} sem texto.`, 'error'); return; }
      setInputText(text);
      runAnalyze();
      const cleanBlob = await cfg.clean(file, cfg.mime);
      const cleanName = baseName + '_limpo.' + ext;
      lastCleanBlob = cleanBlob; lastCleanName = cleanName;
      showResultPanel({ originalFile: file, cleanBlob, cleanName, markers: lastMarkerCount,
        metaNote: cfg.meta, fileIcon: cfg.icon });
      toast(`${ext.toUpperCase()}: ${text.length} chars`, 'success');
    } catch(e){ toast(`Erro ${ext}: ` + e.message, 'error'); }
    return;
  }

  if (ext === 'pdf'){
    try {
      toast('Processando PDF...');
      const text = await extractTextFromPdf(file);
      if (!text.trim()){ toast('PDF sem texto (escaneado?).', 'error'); return; }
      setInputText(text);
      runAnalyze();
      const cleanBlob = await cleanPdfMetadata(file);
      const cleanName = baseName + '_limpo.pdf';
      lastCleanBlob = cleanBlob; lastCleanName = cleanName;
      showResultPanel({ originalFile: file, cleanBlob, cleanName, markers: lastMarkerCount,
        metaNote: 'Título, autor, produtor, datas', fileIcon: '📕' });
      toast(`PDF: ${text.length} chars`, 'success');
    } catch(e){ toast('Erro PDF: ' + e.message, 'error'); }
    return;
  }

  try {
    const text = await file.text();
    setInputText(text);
    runAnalyze();
    toast(`"${file.name}" carregado`, 'success');
  } catch(e){ toast('Erro: ' + e.message, 'error'); }
}

// ============================================================
// 17. EVENTOS
// ============================================================
let highlightTimer, analyzeTimer;

function onInputChanged(){
  updateCounts();
  clearTimeout(highlightTimer);
  const delay = input.value.length > 50000 ? 250 : 60;
  highlightTimer = setTimeout(() => { syncBackdrop(); updateBadges(); }, delay);
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(() => { if (input.value.length > 40) runAnalyze(); }, 600);
}

input.addEventListener('input', onInputChanged);
input.addEventListener('paste', () => setTimeout(onInputChanged, 0));

['optHighlightMarkers','optHighlightAISignals','optHighlightTypo','optHighlightHyphen','optHighlightSpace','optHighlightNewlines'].forEach(id => {
  $(id).addEventListener('change', syncBackdrop);
});
$('btnAnalyze').addEventListener('click', runAnalyze);

$('btnCopy').addEventListener('click', async () => {
  if (!output.value){ toast('Nada para copiar', 'error'); return; }
  try { await navigator.clipboard.writeText(output.value); toast('Copiado! 📋', 'success'); }
  catch(e){ output.select(); document.execCommand('copy'); toast('Copiado! 📋', 'success'); }
});

$('btnCopySanitized').addEventListener('click', async () => {
  if (!input.value){ toast('Nada para sanitizar', 'error'); return; }
  const sanitized = sanitizeAggressive(input.value);
  try {
    await navigator.clipboard.writeText(sanitized);
    const removed = input.value.length - sanitized.length;
    toast(`✅ Sanitizado e copiado (${removed} chars removidos)`, 'success');
  } catch(e){
    const ta = document.createElement('textarea');
    ta.value = sanitized;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('✅ Sanitizado e copiado', 'success');
  }
});

$('btnDownload').addEventListener('click', () => {
  if (lastCleanBlob){
    $('resultPanel').scrollIntoView({ behavior:'smooth', block:'center' });
    $('btnDownloadClean').focus();
    toast('Use o botão no painel acima', 'warn');
    return;
  }
  if (!output.value){ toast('Nada para baixar', 'error'); return; }
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'texto-limpo.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

$('btnClear').addEventListener('click', () => {
  hideResultPanel();
  input.value = ''; output.value = '';
  backdrop.innerHTML = '';
  currentFile = null; lastRewrittenText = ''; lastAuditItems = []; auditFilter = 'all';
  $('stats').style.display = 'none';
  $('auditPanel').style.display = 'none';
  $('evidencePanel').style.display = 'none';
  $('diffSection').style.display = 'none';
  $('scoreNum').textContent = '—';
  $('scoreNum').style.color = 'var(--text)';
  $('verdict').textContent = 'Aguardando texto';
  $('verdictDesc').textContent = 'Cole um texto ou arraste um arquivo para analisar.';
  $('gaugeArc').style.strokeDashoffset = 427;
  $('gaugeArc').style.stroke = '#4ade80';
  $('markerBadge').classList.remove('show');
  $('aiBadge').classList.remove('show');
  setRewriteStatus('');
  updateCounts();
});

$('btnSample').addEventListener('click', () => {
  const zw = '\u200B';
  setInputText(`This pivotal moment serves as a testament to the importance of innovation in the ever-evolving landscape of technology.${zw} The seamless integration of these robust systems not only underscores their versatility but also highlights the significance of continued investment. In conclusion, this comprehensive approach — which emphasizes the vital role of collaboration — remains a cornerstone of progress.`);
  runAnalyze();
});

$('btnSampleMarkers').addEventListener('click', () => {
  const sample =
    'TÍTULO DO DOCUMENTO<span class="highlight-invisible" title="Line Feed">U+000A</span>' +
    'Autor Um<span class="highlight-invisible" title="Line Feed">U+000A</span>' +
    'RESUMO<span class="highlight-invisible" title="Line Feed">U+000A</span>' +
    'ID<span class="highlight-invisible" title="Character Tabulation">U+0009</span>' +
    'Área<span class="highlight-invisible" title="Character Tabulation">U+0009</span>' +
    'Risco potencial<span class="highlight-invisible" title="Line Feed">U+000A</span>' +
    'Texto com invisíveis reais:\u200B\u200B\uFEFF fim.';
  setInputText(sample);
  input.scrollTop = 0; backdrop.scrollTop = 0;
  runAnalyze();
  toast(`${lastMarkerCount} marcadores detectados`, 'warn');
});

$('btnSampleTypo').addEventListener('click', () => {
  const sample =
    'O projeto — segundo o autor — "mudou tudo"…\n' +
    'Ele disse: "não sei", mas o \'chefe\' aprovou.\n' +
    'Lista:\t• item um,\t• item dois.\n' +
    'Medidas: 5′ 10″ de altura, 3×4 metros.\n' +
    'Hífen Unicode ‐ e sinal de menos − são diferentes do hífen - comum.\n' +
    'Espaços especiais:\u00A0NBSP aqui\u2009e thin space aqui.\n' +
    '\u200B\u200B\uFEFF\u2060 Mais alguns invisíveis.';
  setInputText(sample);
  input.scrollTop = 0; backdrop.scrollTop = 0;
  runAnalyze();
  toast('Quebras (traço cinza), tabs e tipografia destacados', 'warn');
});

const dz = $('dropzone');
['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
dz.addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f); });

$('providerSelect').addEventListener('change', e => {
  $('apiKeyField').style.display = e.target.value === 'puter' ? 'none' : 'flex';
});
const savedKey = localStorage.getItem('cleanmark_api_key');
if (savedKey) $('apiKeyInput').value = savedKey;
$('apiKeyInput').addEventListener('input', e => localStorage.setItem('cleanmark_api_key', e.target.value));

// ============================================================
// 15b. MÉTODO DE REESCRITA (widget Clever × API)
// ============================================================
let cleverWidgetScriptLoaded = false;

function ensureCleverWidget(){
  if (cleverWidgetScriptLoaded) return;
  cleverWidgetScriptLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://widgets.cleverhumanizer.ai/widget.js';
  s.async = true;
  document.body.appendChild(s);
  // O widget só fica visível após o handshake de resize do iframe. No file://
  // (origem "null") o handshake é rejeitado e a caixa nunca aparece; se a rede
  // está lenta, demora. Fallback: força visível + altura fixa (scroll interno).
  setTimeout(() => {
    const frame = document.querySelector('#cleverWidget iframe');
    if (frame && frame.style.opacity !== '1'){
      frame.style.opacity = '1';
      frame.style.height = '600px';
    }
  }, 3000);
}

function setRewriteMethod(method){
  const apiMode = method === 'api';
  $('cleverWidget').style.display = apiMode ? 'none' : 'block';
  $('cleverNote').style.display = apiMode ? 'none' : 'block';
  $('apiRewriteArea').style.display = apiMode ? 'block' : 'none';
  if (!apiMode) ensureCleverWidget();
}

$('rewriteMethod').addEventListener('change', e => setRewriteMethod(e.target.value));
setRewriteMethod('clever');

$('btnRewrite').addEventListener('click', runRewrite);
$('btnRewriteToInput').addEventListener('click', () => {
  if (!lastRewrittenText){ toast('Reescreva primeiro', 'error'); return; }
  setInputText(lastRewrittenText);
  runAnalyze();
  toast('Movido para entrada', 'success');
});

updateCounts();
syncBackdrop();