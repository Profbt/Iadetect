// ============================================================
// 1. PADRÕES DE IA
// ============================================================
const AI_PATTERNS = [
  { id:'vocab-pivotal', cat:'Vocabulário', weight:2, re:/\b(pivotal|crucial|vital|paramount|indispensable)\b/gi, note:'Palavras de ênfase excessiva.' },
  { id:'vocab-delve', cat:'Vocabulário', weight:3, re:/\b(delve|delves|delving)\b/gi, note:'"Delve" associado a LLM.' },
  { id:'vocab-tapestry', cat:'Vocabulário', weight:3, re:/\b(tapestry|testament to|focal point|cornerstone)\b/gi, note:'Metáforas grandiloquentes.' },
  { id:'vocab-underscore', cat:'Vocabulário', weight:2, re:/\b(underscores?|underscoring|highlights? the importance)\b/gi, note:'"Underscore" em excesso.' },
  { id:'vocab-landscape', cat:'Vocabulário', weight:2, re:/\b(landscape|realm|domain|sphere)\b/gi, note:'Termos vagos de contexto.' },
  { id:'vocab-seamless', cat:'Vocabulário', weight:2, re:/\b(seamless|seamlessly|robust|leverage|leveraging)\b/gi, note:'Jargão corporativo.' },
  { id:'phrase-emphasis', cat:'Frases', weight:3,
    re:/\b(emphasizing the (significance|importance|relevance)|highlighting the (importance|significance)|reflecting the (continued|ongoing) (relevance|importance))\b/gi,
    note:'Frases de ligação vazias.' },
  { id:'phrase-testament', cat:'Frases', weight:3, re:/\b(serves? as a testament to|stands? as a testament|is a testament to)\b/gi, note:'Fórmula promocional.' },
  { id:'phrase-continued', cat:'Frases', weight:2, re:/\b(continues? to (be|play|serve)|remains? a (key|vital|crucial))\b/gi, note:'Estrutura de continuidade.' },
  { id:'phrase-not-only', cat:'Frases', weight:2, re:/\bnot only\b.{0,60}\bbut also\b/gi, note:'"not only... but also".' },
  { id:'phrase-in-conclusion', cat:'Frases', weight:2, re:/\b(in conclusion|in summary|to sum up|ultimately,)\b/gi, note:'Conectores explícitos.' },
  { id:'struct-rule-three', cat:'Estrutura', weight:2, re:/\b\w+,\s+\w+,\s+and\s+\w+\b/g, note:'Rule of three.' },
  { id:'struct-emdash', cat:'Estrutura', weight:1, re:/—/g, note:'Em-dashes frequentes.' },
  { id:'struct-header', cat:'Estrutura', weight:2, re:/^#{1,6}\s+.+$/gm, note:'Cabeçalhos Markdown.' },
  { id:'struct-emoji', cat:'Estrutura', weight:2, re:/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, note:'Emojis em texto corrido.' },
];

// ============================================================
// 1b. MÉTRICAS ESTILÍSTICAS
// ============================================================
// Pesos do score final (soma com PATTERN_WEIGHT = 100). SÃO HEURÍSTICOS
// E AJUSTÁVEIS: mexa aqui para calibrar a sensibilidade do dashboard.
const METRIC_WEIGHTS = {
  burstiness: 8,
  lexicalDiversity: 6,
  paragraphUniformity: 4,
  avgSentenceLength: 2
};
const PATTERN_WEIGHT = 100 - (METRIC_WEIGHTS.burstiness + METRIC_WEIGHTS.lexicalDiversity +
                              METRIC_WEIGHTS.paragraphUniformity + METRIC_WEIGHTS.avgSentenceLength);

/**
 * Variação no comprimento de frases consecutivas (coeficiente de variação, 0-1).
 * 1 = altíssima variação = estilo humano; 0 = frases todas iguais = padrão de IA.
 * @param {string} text
 * @returns {{value:number, verdict:string}} value 0-1
 */
function computeBurstiness(text){
  const sentences = text.split(/[.!?]+|\n{2,}/).map(s => s.trim()).filter(s => s.length > 0);
  const lengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  if (lengths.length < 2) return { value: 0.5, verdict: 'média' };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lengths.length);
  const cv = mean > 0 ? Math.min(1, sd / mean) : 0;
  const verdict = cv >= 0.6 ? 'alta' : cv >= 0.35 ? 'média' : 'baixa';
  return { value: +cv.toFixed(2), verdict };
}

/**
 * Razão tipo-token (palavras únicas / total), com correção para textos curtos.
 * Alta diversidade = mais humano; baixa = vocabulário repetitivo de LLM.
 * @param {string} text
 * @returns {{value:number, verdict:string}} value 0-1
 */
function computeLexicalDiversity(text){
  const tokens = text.toLowerCase().match(/\b\w+\b/g) || [];
  const total = tokens.length;
  if (total === 0) return { value: 0.5, verdict: 'média' };
  const unique = new Set(tokens).size;
  let ttr = unique / total;
  if (total < 200) ttr = Math.min(1, ttr * (1 + (200 - total) / 400));
  const verdict = ttr >= 0.6 ? 'alta' : ttr >= 0.45 ? 'média' : 'baixa';
  return { value: +ttr.toFixed(2), verdict };
}

/**
 * Média de palavras por frase (valor bruto + rótulo qualitativo).
 * @param {string} text
 * @returns {{value:number, verdict:string}} verdict: curta/média/longa/muito longa
 */
function computeAvgSentenceLength(text){
  const sentences = text.split(/[.!?]+|\n{2,}/).map(s => s.trim()).filter(s => s.length > 0);
  const lengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const value = +avg.toFixed(1);
  const verdict = value < 12 ? 'curta' : value <= 20 ? 'média' : value <= 30 ? 'longa' : 'muito longa';
  return { value, verdict };
}

/**
 * Uniformidade do comprimento dos parágrafos (1 - coeficiente de variação, 0-1).
 * Parágrafos todos do mesmo tamanho = 1 = mais suspeito.
 * @param {string} text
 * @returns {{value:number, verdict:string}} value 0-1
 */
function computeParagraphUniformity(text){
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
  const lengths = paragraphs.map(p => p.split(/\s+/).filter(Boolean).length);
  if (lengths.length < 2) return { value: 0.5, verdict: 'média' };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lengths.length);
  const cv = mean > 0 ? Math.min(1, sd / mean) : 0;
  const value = +(1 - cv).toFixed(2);
  const verdict = value >= 0.75 ? 'alta' : value >= 0.5 ? 'média' : 'baixa';
  return { value, verdict };
}

function detectAI(text){
  const t0 = performance.now();
  const evidence = [];
  let rawScore = 0, totalMatches = 0;
  const catTotals = {};
  for (const p of AI_PATTERNS){
    const matches = [...text.matchAll(p.re)];
    if (matches.length === 0) continue;
    totalMatches += matches.length;
    const contribution = p.weight * Math.min(matches.length, 5);
    rawScore += contribution;
    const cat = catTotals[p.cat] = catTotals[p.cat] || { matches: 0, rawScore: 0 };
    cat.matches += matches.length;
    cat.rawScore += contribution;
    const samples = matches.slice(0, 3).map(m => m[0].trim());
    evidence.push({ id:p.id, cat:p.cat, note:p.note, count:matches.length, contribution, samples });
  }
  const lengthFactor = Math.min(text.length / 400, 1);
  const patternScore = Math.min(100, Math.round(rawScore * 4 * lengthFactor));
  evidence.sort((a,b) => b.contribution - a.contribution);

  // Métricas pesadas até 200 KB; além disso, mostra apenas padrões (perf)
  const heavy = text.length <= 200000;
  const metrics = heavy ? {
    burstiness: { label: 'Burstiness', weight: METRIC_WEIGHTS.burstiness, ...computeBurstiness(text) },
    lexicalDiversity: { label: 'Diversidade lexical', weight: METRIC_WEIGHTS.lexicalDiversity, ...computeLexicalDiversity(text) },
    avgSentenceLength: { label: 'Comprimento médio de frase', weight: METRIC_WEIGHTS.avgSentenceLength, ...computeAvgSentenceLength(text) },
    paragraphUniformity: { label: 'Uniformidade de parágrafos', weight: METRIC_WEIGHTS.paragraphUniformity, ...computeParagraphUniformity(text) }
  } : null;

  // Score final = padrões (peso PATTERN_WEIGHT) + penalidades das métricas.
  // Heurístico: pesos em METRIC_WEIGHTS; ajuste com critério.
  let rawTotal = patternScore * (PATTERN_WEIGHT / 100);
  if (heavy && metrics){
    rawTotal += (1 - metrics.burstiness.value) * METRIC_WEIGHTS.burstiness;
    rawTotal += (1 - metrics.lexicalDiversity.value) * METRIC_WEIGHTS.lexicalDiversity;
    rawTotal += metrics.paragraphUniformity.value * METRIC_WEIGHTS.paragraphUniformity;
    if (metrics.avgSentenceLength.value > 25) rawTotal += METRIC_WEIGHTS.avgSentenceLength;
  }
  const score = Math.min(100, Math.round(rawTotal));

  // Breakdown por categoria (distribui a parcela de padrões proporcional aos sinais)
  const catNames = Object.keys(catTotals);
  const byCategory = {};
  const catTotalRaw = catNames.reduce((s, c) => s + catTotals[c].rawScore, 0) || 1;
  for (const c of catNames.sort((a, b) => catTotals[b].rawScore - catTotals[a].rawScore)){
    const share = catTotals[c].rawScore / catTotalRaw;
    byCategory[c] = {
      matches: catTotals[c].matches,
      rawScore: catTotals[c].rawScore,
      contribution: Math.round(patternScore * share),
      percentage: Math.round(share * 100)
    };
  }

  const breakdown = {
    byCategory,
    metrics,
    totalWeight: 100,
    rawTotal: +rawTotal.toFixed(1)
  };

  return { score, evidence, time: Math.round(performance.now() - t0), totalMatches, breakdown };
}

function verdictFor(score){
  if (score >= 70) return { label:'🚨 Forte sinal de IA', desc:'Muitos padrões detectados.', color:'#f87171' };
  if (score >= 40) return { label:'⚠️ Possível escrita por IA', desc:'Alguns padrões suspeitos.', color:'#fbbf24' };
  if (score >= 15) return { label:'🟡 Leve sinal de IA', desc:'Poucos padrões.', color:'#fbbf24' };
  return { label:'✅ Sem sinais relevantes', desc:'Nenhum padrão típico encontrado.', color:'#4ade80' };
}

// ============================================================
// 2. MARCADORES U+XXXX
// ============================================================
const KEEP_AS_CHAR = new Set([0x0009, 0x000A, 0x000D, 0x0020]);
const DROP_MARKERS = new Set([
  0x00AD,0x034F,0x061C,0x115F,0x1160,0x17B4,0x17B5,0x180B,0x180C,0x180D,0x180E,
  0x200B,0x200C,0x200D,0x200E,0x200F,0x202A,0x202B,0x202C,0x202D,0x202E,
  0x2060,0x2061,0x2062,0x2063,0x2064,0x2066,0x2067,0x2068,0x2069,0x206A,
  0x206B,0x206C,0x206D,0x206E,0x206F,0x3164,0xFEFF,0xFFA0,
]);

const MARKER_PATTERNS = [
  /<span\b[^>]*\bclass=["'][^"']*highlight-invisible[^"']*["'][^>]*>\s*U\+([0-9A-Fa-f]{4,6})\s*<\/span>/gi,
  /<span\b[^>]*>\s*U\+([0-9A-Fa-f]{4,6})\s*<\/span>/gi,
  /[\[⟦{]\s*U\+([0-9A-Fa-f]{4,6})\s*[\]⟧}]/g,
];

function countMarkers(text){
  let total = 0;
  const seen = new Set();
  for (const p of MARKER_PATTERNS){
    const re = new RegExp(p.source, p.flags);
    for (const m of text.matchAll(re)){
      const key = m.index + ':' + m[0].length;
      if (!seen.has(key)){ seen.add(key); total++; }
    }
  }
  return total;
}

function decodeInvisibleMarkers(text){
  const stats = { decoded: 0, dropped: 0, untouched: 0 };
  const handle = (hex) => {
    const code = parseInt(hex, 16);
    if (KEEP_AS_CHAR.has(code)){ stats.decoded++; try { return String.fromCodePoint(code); } catch(e){ return ''; } }
    if (DROP_MARKERS.has(code) || code > 0x10FFFF){ stats.dropped++; return ''; }
    stats.untouched++;
    return `U+${hex.toUpperCase()}`;
  };
  let result = text;
  for (const p of MARKER_PATTERNS){
    const re = new RegExp(p.source, p.flags);
    result = result.replace(re, (_, hex) => handle(hex));
  }
  return { text: result, stats };
}

// ============================================================
// 3. REGISTRO DE CARACTERES POR CATEGORIA
// ============================================================
const CHAR_INFO = new Map([
  // ---------- INVISÍVEIS (zero width) ----------
  [0x200B, { cat:'invisible', name:'ZERO WIDTH SPACE' }],
  [0x200C, { cat:'invisible', name:'ZERO WIDTH NON-JOINER' }],
  [0x200D, { cat:'invisible', name:'ZERO WIDTH JOINER' }],
  [0x2060, { cat:'invisible', name:'WORD JOINER' }],
  [0x2061, { cat:'math',      name:'FUNCTION APPLICATION' }],
  [0x2062, { cat:'math',      name:'INVISIBLE TIMES' }],
  [0x2063, { cat:'math',      name:'INVISIBLE SEPARATOR' }],
  [0x2064, { cat:'math',      name:'INVISIBLE PLUS' }],
  [0xFEFF, { cat:'invisible', name:'ZERO WIDTH NO-BREAK SPACE (BOM)' }],
  [0x00AD, { cat:'hyphen',    name:'SOFT HYPHEN' }],
  [0x034F, { cat:'invisible', name:'COMBINING GRAPHEME JOINER' }],
  [0x115F, { cat:'filler',    name:'HANGUL CHOSEONG FILLER' }],
  [0x1160, { cat:'filler',    name:'HANGUL JUNGSEONG FILLER' }],
  [0x17B4, { cat:'invisible', name:'KHMER VOWEL INHERENT AQ' }],
  [0x17B5, { cat:'invisible', name:'KHMER VOWEL INHERENT AA' }],
  [0x180B, { cat:'invisible', name:'MONGOLIAN FREE VARIATION SELECTOR ONE' }],
  [0x180C, { cat:'invisible', name:'MONGOLIAN FREE VARIATION SELECTOR TWO' }],
  [0x180D, { cat:'invisible', name:'MONGOLIAN FREE VARIATION SELECTOR THREE' }],
  [0x180E, { cat:'invisible', name:'MONGOLIAN VOWEL SEPARATOR' }],
  [0xFFF9, { cat:'invisible', name:'INTERLINEAR ANNOTATION ANCHOR' }],
  [0xFFFA, { cat:'invisible', name:'INTERLINEAR ANNOTATION SEPARATOR' }],
  [0xFFFB, { cat:'invisible', name:'INTERLINEAR ANNOTATION TERMINATOR' }],
  [0x2028, { cat:'invisible', name:'LINE SEPARATOR' }],
  [0x2029, { cat:'invisible', name:'PARAGRAPH SEPARATOR' }],

  // ---------- ESPAÇOS ESPECIAIS ----------
  [0x00A0, { cat:'space', name:'NO-BREAK SPACE' }],
  [0x2000, { cat:'space', name:'EN QUAD' }],
  [0x2001, { cat:'space', name:'EM QUAD' }],
  [0x2002, { cat:'space', name:'EN SPACE' }],
  [0x2003, { cat:'space', name:'EM SPACE' }],
  [0x2004, { cat:'space', name:'THREE-PER-EM SPACE' }],
  [0x2005, { cat:'space', name:'FOUR-PER-EM SPACE' }],
  [0x2006, { cat:'space', name:'SIX-PER-EM SPACE' }],
  [0x2007, { cat:'space', name:'FIGURE SPACE' }],
  [0x2008, { cat:'space', name:'PUNCTUATION SPACE' }],
  [0x2009, { cat:'space', name:'THIN SPACE' }],
  [0x200A, { cat:'space', name:'HAIR SPACE' }],
  [0x202F, { cat:'space', name:'NARROW NO-BREAK SPACE' }],
  [0x205F, { cat:'space', name:'MEDIUM MATHEMATICAL SPACE' }],
  [0x3000, { cat:'space', name:'IDEOGRAPHIC SPACE' }],

  // ---------- TIPOGRAFIA ATÍPICA ----------
  [0x2014, { cat:'typography', name:'EM DASH (—)' }],
  [0x2013, { cat:'typography', name:'EN DASH (–)' }],
  [0x2E3A, { cat:'typography', name:'TWO-EM DASH (⸺)' }],
  [0x2E3B, { cat:'typography', name:'THREE-EM DASH (⸻)' }],
  [0x2018, { cat:'typography', name:'LEFT SINGLE QUOTATION MARK (\u2018)' }],
  [0x2019, { cat:'typography', name:'RIGHT SINGLE QUOTATION MARK (\u2019)' }],
  [0x201A, { cat:'typography', name:'SINGLE LOW-9 QUOTATION MARK (\u201A)' }],
  [0x201C, { cat:'typography', name:'LEFT DOUBLE QUOTATION MARK (\u201C)' }],
  [0x201D, { cat:'typography', name:'RIGHT DOUBLE QUOTATION MARK (\u201D)' }],
  [0x201E, { cat:'typography', name:'DOUBLE LOW-9 QUOTATION MARK (\u201E)' }],
  [0x2026, { cat:'typography', name:'HORIZONTAL ELLIPSIS (…)' }],
  [0x2022, { cat:'typography', name:'BULLET (•)' }],
  [0x00B7, { cat:'typography', name:'MIDDLE DOT (·)' }],
  [0x2032, { cat:'typography', name:'PRIME (′)' }],
  [0x2033, { cat:'typography', name:'DOUBLE PRIME (″)' }],
  [0x2034, { cat:'typography', name:'TRIPLE PRIME (‴)' }],
  [0x00AB, { cat:'typography', name:'LEFT-POINTING DOUBLE ANGLE QUOTATION MARK («)' }],
  [0x00BB, { cat:'typography', name:'RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK (»)' }],
  [0x2039, { cat:'typography', name:'SINGLE LEFT-POINTING ANGLE QUOTATION MARK (‹)' }],
  [0x203A, { cat:'typography', name:'SINGLE RIGHT-POINTING ANGLE QUOTATION MARK (›)' }],

  // ---------- HÍFENS ESPECIAIS ----------
  [0x2010, { cat:'hyphen', name:'HYPHEN (‐)' }],
  [0x2011, { cat:'hyphen', name:'NON-BREAKING HYPHEN (‑)' }],
  [0x2012, { cat:'hyphen', name:'FIGURE DASH (‒)' }],
  [0x2015, { cat:'hyphen', name:'HORIZONTAL BAR (―)' }],
  [0x2212, { cat:'hyphen', name:'MINUS SIGN (−)' }],
  [0xFE58, { cat:'hyphen', name:'SMALL EM DASH' }],
  [0xFE63, { cat:'hyphen', name:'SMALL HYPHEN-MINUS' }],
  [0xFF0D, { cat:'hyphen', name:'FULLWIDTH HYPHEN-MINUS' }],

  // ---------- CONTROLES DIRECIONAIS ----------
  [0x061C, { cat:'directional', name:'ARABIC LETTER MARK (ALM)' }],
  [0x200E, { cat:'directional', name:'LEFT-TO-RIGHT MARK (LRM)' }],
  [0x200F, { cat:'directional', name:'RIGHT-TO-LEFT MARK (RLM)' }],
  [0x202A, { cat:'directional', name:'LEFT-TO-RIGHT EMBEDDING (LRE)' }],
  [0x202B, { cat:'directional', name:'RIGHT-TO-LEFT EMBEDDING (RLE)' }],
  [0x202C, { cat:'directional', name:'POP DIRECTIONAL FORMATTING (PDF)' }],
  [0x202D, { cat:'directional', name:'LEFT-TO-RIGHT OVERRIDE (LRO)' }],
  [0x202E, { cat:'directional', name:'RIGHT-TO-LEFT OVERRIDE (RLO)' }],
  [0x2066, { cat:'directional', name:'LEFT-TO-RIGHT ISOLATE (LRI)' }],
  [0x2067, { cat:'directional', name:'RIGHT-TO-LEFT ISOLATE (RLI)' }],
  [0x2068, { cat:'directional', name:'FIRST STRONG ISOLATE (FSI)' }],
  [0x2069, { cat:'directional', name:'POP DIRECTIONAL ISOLATE (PDI)' }],

  // ---------- PREENCHIMENTO ----------
  [0x2800, { cat:'filler', name:'BRAILLE PATTERN BLANK' }],
  [0x3164, { cat:'filler', name:'HANGUL FILLER' }],
  [0xFFA0, { cat:'filler', name:'HALFWIDTH HANGUL FILLER' }],
]);

// ============================================================
// CORREÇÃO: whitespace legítimo NÃO é hidden
// ============================================================
function isLegitWhitespace(code){
  return code === 0x0009 || code === 0x000A || code === 0x000D || code === 0x0020;
}

function getCharInfo(code){
  // >>> CORREÇÃO PRINCIPAL: tab, LF, CR e espaço não são suspeitos
  if (isLegitWhitespace(code)) return null;

  if (CHAR_INFO.has(code)) return CHAR_INFO.get(code);
  if (code >= 0xFE00 && code <= 0xFE0F) return { cat:'invisible', name:`VARIATION SELECTOR-${code - 0xFE00 + 1}` };
  if (code >= 0xE0100 && code <= 0xE01EF) return { cat:'invisible', name:`VARIATION SELECTOR-${code - 0xE0100 + 17}` };
  if (code >= 0xE0000 && code <= 0xE007F) return { cat:'tags', name:'UNICODE TAG CHARACTER (⚠️ possível contrabando)' };
  if (code >= 0x1D173 && code <= 0x1D17A) return { cat:'math', name:'MUSICAL SYMBOL BEGIN/END' };
  if (code >= 0x0000 && code <= 0x001F) return { cat:'invisible', name:`C0 CONTROL U+${code.toString(16).padStart(4,'0').toUpperCase()}` };
  if (code >= 0x007F && code <= 0x009F) return { cat:'invisible', name:`C1 CONTROL U+${code.toString(16).padStart(4,'0').toUpperCase()}` };
  return null;
}

const CATEGORIES = {
  invisible:   { label:'Invisíveis (largura zero)', color:'#06b6d4', emoji:'⚫' },
  space:       { label:'Espaços especiais',         color:'#3b82f6', emoji:'🔵' },
  typography:  { label:'Tipografia atípica',        color:'#c084fc', emoji:'🟣' },
  hyphen:      { label:'Hífens especiais',          color:'#f97316', emoji:'🟠' },
  directional: { label:'Controles direcionais',     color:'#f472b6', emoji:'🟪' },
  tags:        { label:'Unicode Tags ⚠️',           color:'#ef4444', emoji:'🔴' },
  math:        { label:'Matemáticos invisíveis',    color:'#84cc16', emoji:'🟢' },
  filler:      { label:'Preenchimento',             color:'#a3a3a3', emoji:'⬜' },
};

// ============================================================
// 4. REGEX
// ============================================================
const INVISIBLE_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2028\u2029\u2060-\u2064\u2066-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]|\u{1D173}-\u{1D17A}|\u{E0000}-\u{E007F}|\u{E0100}-\u{E01EF}/gu;

const TYPO_RE   = /[\u2014\u2013\u2E3A\u2E3B\u2018\u2019\u201A\u201C\u201D\u201E\u2026\u2022\u00B7\u2032\u2033\u2034\u00AB\u00BB\u2039\u203A]/g;
const HYPHEN_RE = /[\u2010\u2011\u2012\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const SPACE_RE  = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NL_RE     = /\n/g;
const TAB_RE    = /\t/g;

function auditText(text){
  const map = new Map();
  for (let i = 0; i < text.length; i++){
    const code = text.codePointAt(i);
    const info = getCharInfo(code);
    if (info){
      if (!map.has(code)) map.set(code, { code, cat: info.cat, name: info.name, count: 0, firstIndex: i });
      map.get(code).count++;
    }
    if (code > 0xFFFF) i++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function countWhitespace(text){
  let nl = 0, tab = 0;
  for (const m of text.matchAll(NL_RE)) nl++;
  for (const m of text.matchAll(TAB_RE)) tab++;
  return { nl, tab, total: nl + tab };
}

// ============================================================
// 5. HIGHLIGHT
// ============================================================
function escapeHtml(s){
  return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

const STYLE_MARKER = 'background:rgba(248,113,113,.55)!important;color:transparent!important;-webkit-text-fill-color:transparent!important;border:1px solid rgba(248,113,113,.95)!important;border-radius:3px!important;padding:0 1px!important;margin:0 -1px!important;box-decoration-break:clone!important;font-style:normal!important;font-weight:normal!important;text-decoration:none!important';
const STYLE_AI     = 'background:rgba(251,191,36,.28)!important;color:transparent!important;-webkit-text-fill-color:transparent!important;border-bottom:2px solid rgba(251,191,36,.85)!important;border-radius:2px 2px 0 0!important;padding:0 1px!important;margin:0 -1px!important;box-decoration-break:clone!important;font-style:normal!important;font-weight:normal!important;text-decoration:none!important';
const STYLE_TYPO   = 'background:rgba(192,132,252,.42)!important;color:transparent!important;-webkit-text-fill-color:transparent!important;border:1px solid rgba(192,132,252,.9)!important;border-radius:3px!important;padding:0 1px!important;margin:0 -1px!important;box-decoration-break:clone!important;font-style:normal!important;font-weight:normal!important;text-decoration:none!important';
const STYLE_HYPHEN = 'background:rgba(249,115,22,.42)!important;color:transparent!important;-webkit-text-fill-color:transparent!important;border:1px solid rgba(249,115,22,.9)!important;border-radius:3px!important;padding:0 1px!important;margin:0 -1px!important;box-decoration-break:clone!important;font-style:normal!important;font-weight:normal!important;text-decoration:none!important';
const STYLE_SPACE  = 'background:rgba(59,130,246,.42)!important;color:transparent!important;-webkit-text-fill-color:transparent!important;border-radius:2px!important;padding:0 1px!important;margin:0 -1px!important;box-decoration-break:clone!important;font-style:normal!important;font-weight:normal!important;text-decoration:none!important';
const STYLE_TAB    = 'background:rgba(148,163,184,.28)!important;color:transparent!important;-webkit-text-fill-color:transparent!important;border-radius:2px!important;padding:0 1px!important;margin:0 -1px!important;box-decoration-break:clone!important;font-style:normal!important;font-weight:normal!important;text-decoration:none!important';

const STYLE_BY_TYPE = { marker: STYLE_MARKER, ai: STYLE_AI, typo: STYLE_TYPO, hyphen: STYLE_HYPHEN, space: STYLE_SPACE, tab: STYLE_TAB };

const PRIORITY = { marker: 100, typo: 50, hyphen: 45, space: 40, tab: 35, ai: 30, nl: 20 };

function collectRanges(text, opts){
  const ranges = [];
  const push = (re, type) => {
    const r = new RegExp(re.source, re.flags);
    for (const m of text.matchAll(r)) ranges.push({ start: m.index, end: m.index + m[0].length, type });
  };
  if (opts.highlightMarkers){
    for (const p of MARKER_PATTERNS) push(p, 'marker');
  }
  if (opts.highlightAISignals){
    for (const p of AI_PATTERNS) push(p.re, 'ai');
  }
  if (opts.highlightTypo) push(TYPO_RE, 'typo');
  if (opts.highlightHyphen) push(HYPHEN_RE, 'hyphen');
  if (opts.highlightSpace) push(SPACE_RE, 'space');
  if (opts.highlightNewlines){
    push(TAB_RE, 'tab');
    push(NL_RE, 'nl');
  }
  return ranges;
}

function buildBackdropHTML(text, opts){
  if (!text) return '';
  const ranges = collectRanges(text, opts);
  if (ranges.length === 0) return escapeHtml(text);

  ranges.sort((a, b) => { if (a.start !== b.start) return a.start - b.start; return PRIORITY[b.type] - PRIORITY[a.type]; });

  const merged = [];
  for (const r of ranges){
    if (merged.length === 0){ merged.push({ ...r }); continue; }
    const last = merged[merged.length - 1];
    if (r.start < last.end){
      last.end = Math.max(last.end, r.end);
      if (PRIORITY[r.type] > PRIORITY[last.type]) last.type = r.type;
    } else { merged.push({ ...r }); }
  }

  let out = '';
  let cursor = 0;
  for (const r of merged){
    if (r.start > cursor) out += escapeHtml(text.slice(cursor, r.start));
    const content = text.slice(r.start, r.end);
    if (r.type === 'nl'){
      // Traço vertical ANTES da quebra de linha
      out += '<span class="nl-mark" aria-hidden="true"></span>' + escapeHtml(content);
    } else {
      const style = STYLE_BY_TYPE[r.type] || STYLE_AI;
      out += '<mark style="' + style + '">' + escapeHtml(content) + '</mark>';
    }
    cursor = r.end;
  }
  if (cursor < text.length) out += escapeHtml(text.slice(cursor));
  return out;
}