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

function countWords(s){
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function updateCounts(){
  $('inCount').textContent = input.value.length.toLocaleString('pt-BR') + ' caracteres · ' + countWords(input.value).toLocaleString('pt-BR') + ' palavras';
  $('outCount').textContent = output.value.length.toLocaleString('pt-BR') + ' caracteres · ' + countWords(output.value).toLocaleString('pt-BR') + ' palavras';
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

const CAT_COLORS = { 'Vocabulário': '#c084fc', 'Frases': '#fbbf24', 'Estrutura': '#f87171' };

/**
 * Métricas (heurística): cor do veredito por métrica/valor.
 * Comprimento médio é só informativo; uniformidade alta é SUSPEITA (invertida).
 */
function metricVerdictClass(key, verdict){
  if (key === 'avgSentenceLength') return 'verdict-muted';
  const bad = { burstiness: ['baixa'], lexicalDiversity: ['baixa'], paragraphUniformity: ['alta'] };
  const isBad = (bad[key] || []).includes(verdict);
  if (isBad) return 'verdict-bad';
  return verdict === 'média' ? 'verdict-warn' : 'verdict-ok';
}

/** Preenche os 4 cards de métricas. */
function renderMetricCards(metrics){
  const grid = $('metricsGrid');
  if (!metrics){ grid.style.display = 'none'; return; }
  const fill = (key, valId, verdictId) => {
    const m = metrics[key];
    if (!m) return;
    const val = $(valId);
    if (val) val.textContent = typeof m.value === 'number'
      ? (key === 'avgSentenceLength' ? m.value.toFixed(1) : m.value.toFixed(2)) : '—';
    const vEl = $(verdictId);
    if (vEl){
      vEl.textContent = m.verdict;
      vEl.className = 'metric-verdict ' + metricVerdictClass(key, m.verdict);
    }
  };
  fill('burstiness', 'mBurstiness', 'mBurstinessVerdict');
  fill('lexicalDiversity', 'mLexicalDiversity', 'mLexicalDiversityVerdict');
  fill('avgSentenceLength', 'mAvgLen', 'mAvgLenVerdict');
  fill('paragraphUniformity', 'mUniformity', 'mUniformityVerdict');
  grid.style.display = 'grid';
}

/**
 * Dashboard expandido: gauge/veredito + barras por categoria + cards de métricas.
 * @param {{score:number, breakdown:object}} detection saída de detectAI()
 */
function renderScoreDashboard(detection){
  renderScore(detection.score);
  const breakdown = detection.breakdown || { byCategory: {}, metrics: null };
  const barsEl = $('breakdownBars');
  const cats = Object.keys(breakdown.byCategory || {});
  if (cats.length === 0){
    $('scoreBreakdown').style.display = 'none';
  } else {
    barsEl.innerHTML = cats.map(c => {
      const bc = breakdown.byCategory[c];
      const color = CAT_COLORS[c] || 'linear-gradient(90deg,var(--accent),var(--accent-2))';
      return `<div class="breakdown-bar">
        <span class="breakdown-label">${escapeHtml(c)}</span>
        <span class="bar"><span class="bar-fill" style="width:${bc.percentage}%;background:${color}"></span></span>
        <span class="breakdown-value">${bc.percentage}% <small>${bc.matches}×</small></span>
      </div>`;
    }).join('');
    $('scoreBreakdown').style.display = 'block';
  }
  renderMetricCards(breakdown.metrics);
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
  renderScoreDashboard(det);
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
  await loadPuter();
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
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 30){ toast('Texto muito curto para reescrever (mínimo 30 palavras).', 'error'); return; }
  if (wordCount > 1500){ toast('Texto muito longo (máximo 1.500 palavras por vez).', 'error'); return; }
  const active = document.querySelector('input[name="apiProvider"]:checked');
  const provider = active ? active.value : 'puter';
  let apiKey = '';
  if (provider === 'gemini') apiKey = $('geminiKey').value.trim();
  else if (provider === 'groq') apiKey = $('groqKey').value.trim();
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
    renderScoreDashboard(detNew);
    renderEvidence(detNew.evidence);
    renderDiff(text, rewritten);
    setRewriteStatus(`✅ Reescrito. Score: ${detOld.score} → ${detNew.score}`, 'success');
    toast('Reescrito! Score: ' + detOld.score + ' → ' + detNew.score, 'success');
    fillCompareFromRewrite(text, rewritten);
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

function firstNWords(s, n){
  const words = (s || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(' ');
}

$('btnCopy1500').addEventListener('click', async () => {
  const src = input.value.trim() ? input.value : output.value;
  const words = firstNWords(src, 1500);
  if (!words){ toast('Cole algum texto primeiro', 'error'); return; }
  const copied = countWords(words);
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = words;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copiadas ' + copied.toLocaleString('pt-BR') + ' palavras — Ctrl+V no Reescrever', 'success');
  };
  try { await navigator.clipboard.writeText(words); toast('Copiadas ' + copied.toLocaleString('pt-BR') + ' palavras — Ctrl+V no Reescrever', 'success'); }
  catch(e){ fallback(); }
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

// ============================================================
// 15b. MÉTODO DE REESCRITA (widget Clever × API)
// ============================================================
// O Clever é um iframe estático no HTML (embed). Modo API alterna os painéis.

function setRewriteMethod(method){
  const apiMode = method === 'api';
  $('cleverWidget').style.display = apiMode ? 'none' : 'block';
  $('cleverNote').style.display = apiMode ? 'none' : 'block';
  $('apiRewriteArea').style.display = apiMode ? 'block' : 'none';
  if (apiMode){
    loadPuter()
      .then(updatePuterAuthState)
      .catch(e => { const st = $('puterStatus'); if (st) st.textContent = '❌ ' + e.message; });
  }
}

$('rewriteMethod').addEventListener('change', e => setRewriteMethod(e.target.value));
setRewriteMethod('clever');

// ---- 15c. PROVEDORES DE API (Puter / Gemini / Groq em cards separados) ----
let puterLoaded = false;
function loadPuter(){
  return new Promise((resolve, reject) => {
    if (typeof puter !== 'undefined'){ puter.quiet = true; resolve(puter); return; }
    if (puterLoaded){ reject(new Error('Puter.js ainda carregando. Tente de novo.')); return; }
    puterLoaded = true;
    const s = document.createElement('script');
    s.src = 'https://js.puter.com/v2/';
    s.onload = () => {
      const boot = setInterval(() => {
        if (!window.puter) return;
        clearInterval(boot);
        puter.quiet = true;
        resolve(puter);
      }, 100);
      setTimeout(() => { clearInterval(boot); }, 15000);
    };
    s.onerror = () => reject(new Error('Não foi possível carregar Puter.js (rede?).'));
    document.body.appendChild(s);
  });
}

function bindApiProvider(){
  const radios = document.querySelectorAll('input[name="apiProvider"]');
  const setBodies = (skipLoad) => {
    const val = document.querySelector('input[name="apiProvider"]:checked').value;
    document.querySelectorAll('.provider-body').forEach(b => b.style.display = 'none');
    const body = $('providerBody' + val.charAt(0).toUpperCase() + val.slice(1));
    if (body) body.style.display = 'flex';
    if (val === 'puter' && !skipLoad){
      loadPuter()
        .then(updatePuterAuthState)
        .catch(e => { const st = $('puterStatus'); if (st) st.textContent = '❌ ' + e.message; });
    }
  };
  radios.forEach(r => r.addEventListener('change', () => setBodies(false)));
  setBodies(true);
}
bindApiProvider();

const savedGemini = localStorage.getItem('cleanmark_api_key_gemini') ||
                    localStorage.getItem('cleanmark_api_key');
if (savedGemini) $('geminiKey').value = savedGemini;
$('geminiKey').addEventListener('input', e => localStorage.setItem('cleanmark_api_key_gemini', e.target.value));

const savedGroq = localStorage.getItem('cleanmark_api_key_groq');
if (savedGroq) $('groqKey').value = savedGroq;
$('groqKey').addEventListener('input', e => localStorage.setItem('cleanmark_api_key_groq', e.target.value));

function updatePuterAuthState(){
  const st = $('puterStatus');
  if (!st) return;
  if (typeof puter === 'undefined'){ st.textContent = 'Carrega ao clicar em "Entrar" ou "Reescrever texto".'; return; }
  try {
    let loggedIn = !!puter.user;
    if (typeof puter.auth.isSignedIn === 'function') loggedIn = puter.auth.isSignedIn();
    else if (typeof puter.auth.isLoggedIn === 'function') loggedIn = puter.auth.isLoggedIn();
    st.textContent = loggedIn ? '✅ Logado na puter.com' : 'Ainda não logado — clique em "Entrar com puter.com".';
  } catch(e){ st.textContent = '❌ ' + (e.message || 'erro ao checar login'); }
}

async function puterLogin(){
  const st = $('puterStatus');
  try {
    st.textContent = 'Carregando Puter e conectando...';
    await loadPuter();
    st.textContent = 'Conectando com puter.com...';
    await withTimeout(puter.auth.signIn(), 45000, 'Puter não respondeu (rede bloqueia api.puter.com?).');
    updatePuterAuthState();
  } catch(e){
    st.textContent = '❌ ' + e.message;
  }
}
$('btnPuterLogin').addEventListener('click', puterLogin);
// o script do puter é defer: só existe após o parsing terminar
window.addEventListener('DOMContentLoaded', () => setTimeout(updatePuterAuthState, 600));

$('btnRewrite').addEventListener('click', runRewrite);
$('btnRewriteToInput').addEventListener('click', () => {
  if (!lastRewrittenText){ toast('Reescreva primeiro', 'error'); return; }
  setInputText(lastRewrittenText);
  runAnalyze();
  toast('Movido para entrada', 'success');
});

// ============================================================
// 17. ANÁLISE COMPARATIVA (A × B)
// ============================================================
function scoreClass(score){
  const v = verdictFor(score);
  if (v.color === '#f87171') return 'score-bad';
  if (v.color === '#4ade80') return 'score-good';
  return 'score-warn';
}

function compareValue(m, key){
  return m && typeof m.value === 'number'
    ? (key === 'avgSentenceLength' ? m.value.toFixed(1) : m.value.toFixed(2)) : '—';
}

function buildCompareTable(detA, detB){
  const mA = detA.breakdown && detA.breakdown.metrics;
  const mB = detB.breakdown && detB.breakdown.metrics;
  const rows = [];
  const addRow = (label, va, vb, delta, cls) => {
    const d = delta === null ? '—' : (delta >= 0 ? '+' + delta.toFixed(2) : delta.toFixed(2));
    rows.push(`<tr><td>${label}</td><td>${va}</td><td>${vb}</td><td class="cmp-delta ${cls}">${d}</td></tr>`);
  };

  const scoreDelta = detB.score - detA.score;
  addRow('Score IA', detA.score, detB.score, scoreDelta,
    scoreDelta < 0 ? 'delta-good' : scoreDelta > 0 ? 'delta-bad' : 'delta-muted');

  if (mA && mB){
    const dims = ['burstiness', 'lexicalDiversity', 'paragraphUniformity'];
    if (mA.burstiness) dims.push('avgSentenceLength');
    for (const key of dims){
      const delta = (typeof mA[key].value === 'number' && typeof mB[key].value === 'number')
        ? +(mB[key].value - mA[key].value).toFixed(2) : null;
      let cls = 'delta-muted';
      if (delta !== null){
        if (key === 'burstiness' || key === 'lexicalDiversity') cls = delta > 0 ? 'delta-good' : delta < 0 ? 'delta-bad' : 'delta-muted';
        else if (key === 'paragraphUniformity') cls = delta < 0 ? 'delta-good' : delta > 0 ? 'delta-bad' : 'delta-muted';
      }
      addRow(mA[key].label, compareValue(mA, key), compareValue(mB, key), delta, cls);
    }
  } else {
    addRow('Métricas', '—', '—', null, 'delta-muted');
  }

  return `<table>
    <thead><tr><th>Métrica</th><th>Texto A</th><th>Texto B</th><th>Δ</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

function runCompare(){
  const a = $('compareA').value;
  const b = $('compareB').value;
  if (!a.trim() || !b.trim()){ toast('Cole os dois textos para comparar', 'error'); return; }
  const detA = detectAI(a);
  const detB = detectAI(b);

  const badge = (elId, det) => {
    const el = $(elId);
    el.textContent = 'Score IA: ' + det.score;
    el.className = 'compare-score ' + scoreClass(det.score);
  };
  badge('compareScoreA', detA);
  badge('compareScoreB', detB);

  const s = $('compareSummary');
  if (detB.score < detA.score){
    const pts = detA.score - detB.score;
    const pct = detA.score > 0 ? Math.round(pts / detA.score * 100) : 0;
    s.innerHTML = `<div class="compare-summary-ok">✅ Texto B é menos provável de ser IA: score caiu <strong>${pts} pontos</strong> (${pct}%). A reescrita ajudou.</div>`;
  } else if (detB.score > detA.score){
    const pts = detB.score - detA.score;
    s.innerHTML = `<div class="compare-summary-bad">⚠️ Texto B tem score MAIOR que A (a reescrita piorou em ${pts} pontos).</div>`;
  } else {
    s.innerHTML = `<div class="compare-summary-ok">Scores idênticos (${detA.score}).</div>`;
  }

  $('compareMetricsTable').innerHTML = buildCompareTable(detA, detB);
  $('compareDiff').innerHTML = buildDiffHTML(a, b);
  $('compareResults').style.display = 'block';
}

/** Fluxo integrado: após reescrever, preenche A (original) × B (reescrita) e compara. */
function fillCompareFromRewrite(original, rewritten){
  $('compareA').value = original;
  $('compareB').value = rewritten;
  runCompare();
  const panel = $('comparePanel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('btnCompare').addEventListener('click', runCompare);
$('btnCompareClear').addEventListener('click', () => {
  $('compareA').value = '';
  $('compareB').value = '';
  $('compareScoreA').textContent = '—';
  $('compareScoreB').textContent = '—';
  $('compareScoreA').className = 'compare-score';
  $('compareScoreB').className = 'compare-score';
  $('compareResults').style.display = 'none';
});
$('btnCompareSwap').addEventListener('click', () => {
  const a = $('compareA'), b = $('compareB');
  const tmp = a.value;
  a.value = b.value;
  b.value = tmp;
});
$('btnSendA').addEventListener('click', () => { $('compareA').value = input.value; });
$('btnSendB').addEventListener('click', () => { $('compareB').value = output.value; });

updateCounts();
syncBackdrop();