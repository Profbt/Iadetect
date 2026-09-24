// ============================================================
// 6. LIMPEZA
// ============================================================
/**
 * Casa sequências de emoji completas (Emoji ZWJ sequences, tom de pele,
 * bandeiras, keycaps) para que a limpeza conservadora não as destrua.
 */
const EMOJI_SEQUENCE_RE = /\p{Regional_Indicator}{2}|[#*0-9]\uFE0F\u20E3|\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?|\p{Emoji_Modifier})*/gu;

const INVISIBLE_TEST_RE = new RegExp(INVISIBLE_REGEX.source, 'u'); // sem /g (test() determinístico), mantém \u{...}

/**
 * Remove caracteres invisíveis PRESERVANDO emojis e separadores de linha:
 * - U+2028 (LINE SEPARATOR) e U+2029 (PARAGRAPH SEPARATOR) viram \n / \n\n
 *   (são separadores legítimos, não metadados escondidos);
 * - emojis (incluindo ZWJ e seletores FE0F) são preservados intactos;
 * - só o que está em INVISIBLE_REGEX é removido, e apenas fora de emoji.
 * @param {string} text
 * @returns {string}
 */
function cleanInvisiblesPreservingEmoji(text){
  const re = new RegExp(EMOJI_SEQUENCE_RE.source, 'gu');
  let out = '';
  let i = 0;
  while (i < text.length){
    re.lastIndex = i;
    const m = re.exec(text);
    if (m && m.index === i){
      out += m[0];
      i += m[0].length;
      continue;
    }
    const code = text.codePointAt(i);
    const len = code > 0xFFFF ? 2 : 1;
    const slice = text.slice(i, i + len);
    if (code === 0x2028){ out += '\n'; }
    else if (code === 0x2029){ out += '\n\n'; }
    else if (INVISIBLE_TEST_RE.test(slice)){ /* descarta */ }
    else { out += slice; }
    i += len;
  }
  return out;
}

function normalizeTypography(text){
  return text
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // aspas duplas curvas → "
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // aspas simples curvas → '
    .replace(/[\u2014\u2013\u2015\u2E3A\u2E3B]/g, '-') // travessões → -
    .replace(/\u2026/g, '...')                     // … → ...
    .replace(/[\u2032\u2033\u2034]/g, "'")         // primas → '
    .replace(/[\u00AB\u00BB\u2039\u203A]/g, '"')   // « » ‹ › → "
    .replace(/[\u2022\u00B7]/g, '*')               // bullets → *
    .replace(/[\u00A0\u2007\u202F]/g, ' ')         // no-break spaces → espaço normal
    .replace(/[\u2009\u200A\u200B]/g, ' ');        // thin/hair spaces → espaço normal
}

/**
 * Detecta se o texto parece HTML (doctype, html/head/body, ou tags comuns).
 * Tags de bloco são forte evidência (≥2); tags inline precisam de ≥3.
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeHTML(text){
  const t = text.slice(0, 2000).trim().toLowerCase();
  if (/^<!doctype\s+html/i.test(t)) return true;
  if (/<html[\s>]/i.test(t) || /<head[\s>]/i.test(t) || /<body[\s>]/i.test(t)) return true;
  const block = t.match(/<(p|div|br|h[1-6]|li|tr|blockquote|pre|section|article|header|footer)\b/gi);
  if ((block || []).length >= 2) return true;
  const any = t.match(/<(span|a|img|em|strong|b|i|ul|ol|table|td|title|meta)\b/gi);
  return (any || []).length >= 3;
}

/**
 * Extrai o texto legível de um HTML real usando DOMParser: remove
 * script/style/noscript/template e comentários, quebra linha após blocos
 * (p, div, h1-h6, li, tr, blockquote, pre, etc.) e colapsa linhas vazias.
 * @param {string} html
 * @returns {string}
 */
function extractTextFromHTML(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of doc.querySelectorAll('script, style, noscript, template')) el.remove();
  const blockTags = 'p,div,h1,h2,h3,h4,h5,h6,li,tr,blockquote,pre,section,article,header,footer'.split(',');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) walker.currentNode.remove();
  for (const el of doc.querySelectorAll('br')) el.replaceWith('\n');
  for (const tag of blockTags){
    for (const el of doc.querySelectorAll(tag)) el.appendChild(doc.createTextNode('\n'));
  }
  let out = doc.body.textContent || '';
  out = out.replace(/\u00a0/g, ' ');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

// Entidades nomeadas comuns (cobertura do HTML4/Latin-1 + as usadas no app).
const NAMED_ENTITIES = {
  nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'",
  hellip:'…', mdash:'—', ndash:'–', lsquo:'‘', rsquo:'’', ldquo:'“', rdquo:'”',
  bull:'•', middot:'·', copy:'©', reg:'®', trade:'™', ge:'≥', le:'≤', times:'×', divide:'÷', plusmn:'±',
  szlig:'ß', agrave:'à', aacute:'á', acirc:'â', atilde:'ã', auml:'ä', aring:'å', ccedil:'ç',
  egrave:'è', eacute:'é', ecirc:'ê', euml:'ë', igrave:'ì', iacute:'í', icirc:'î', iuml:'ï',
  ntilde:'ñ', ograve:'ò', oacute:'ó', ocirc:'ô', otilde:'õ', ouml:'ö', ugrave:'ù', uacute:'ú', ucirc:'û', uuml:'ü'
};

/**
 * Decodifica entidades HTML (nomeadas + numéricas dec/hex) SEM usar DOM,
 * para texto que tem escapes mas não é HTML de verdade.
 * @param {string} text
 * @returns {string}
 */
function decodeHTMLEntities(text){
  const dec = (m, codeStr, radix) => {
    const c = parseInt(codeStr, radix);
    if (!Number.isFinite(c) || c < 0 || c > 0x10FFFF || (c >= 0xD800 && c <= 0xDFFF)) return m;
    try { return String.fromCodePoint(c); } catch(e){ return m; }
  };
  return text
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (m, h) => dec(m, h, 16))
    .replace(/&#(\d+);/g, (m, d) => dec(m, d, 10))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) => NAMED_ENTITIES[n.toLowerCase()] || m);
}

function cleanText(text, opts){
  const t0 = performance.now();
  const stats = { original: text.length, markersDecoded: 0, markersDropped: 0, invisible: 0, html: 0, typography: 0, removed: 0 };
  let result = text;
  result = result.replace(/\r\n?/g, '\n');

  if (opts.decodeMarkers){
    const dec = decodeInvisibleMarkers(result);
    result = dec.text;
    stats.markersDecoded = dec.stats.decoded;
    stats.markersDropped = dec.stats.dropped;
  }
  if (opts.html){
    // script/style sempre removidos antes (nem entram na contagem/extração)
    result = result.replace(/<script[\s\S]*?<\/script>/gi, '');
    result = result.replace(/<style[\s\S]*?<\/style>/gi, '');
    const tagMatches = result.match(/<[^>]+>/g);
    stats.html = tagMatches ? tagMatches.length : 0;
    if (looksLikeHTML(result)) result = extractTextFromHTML(result);
    else result = decodeHTMLEntities(result);
  }
  if (opts.invisible){
    const matches = result.match(INVISIBLE_REGEX);
    stats.invisible = matches ? matches.length : 0;
    result = (opts.conservativeClean === false)
      ? result.replace(INVISIBLE_REGEX, '')
      : cleanInvisiblesPreservingEmoji(result);
  }
  if (opts.normalizeTypo){
    const before = result.length;
    result = normalizeTypography(result);
    stats.typography = before - result.length;
  }
  if (opts.normalize){ try { result = result.normalize('NFC'); } catch(e){} }
  if (opts.whitespace){
    result = result.replace(SPACE_RE, ' ');
    result = result.replace(/[ \t]+/g, ' ');
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.replace(/^[ \t]+|[ \t]+$/gm, '');
  }
  stats.removed = stats.original - result.length;
  stats.time = Math.round(performance.now() - t0);
  return { text: result, stats };
}

function sanitizeAggressive(text){
  let r = text;
  r = r.replace(INVISIBLE_REGEX, '');
  r = normalizeTypography(r);
  r = r.replace(SPACE_RE, ' ');
  r = r.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  return r;
}

// ============================================================
// 10. DIFF
// ============================================================
/**
 * Gera o HTML do diff original → limpo (chars). Semântica:
 * - vermelho riscado = o que existia e sumiu;
 * - verde = o que apareceu e não estava antes.
 * @param {string} original
 * @param {string} cleaned
 * @param {number} [maxChars] limite de caracteres exibidos
 * @returns {string}
 */
function buildDiffHTML(original, cleaned, maxChars = 100000){
  if (original === cleaned) return '<div class="diff-empty">Nenhuma diferença.</div>';
  if (original.length > 200000 || cleaned.length > 200000) return '<div class="diff-empty">Texto muito grande.</div>';
  if (typeof Diff === 'undefined') return '<div class="diff-empty">Diff não carregou.</div>';
  try {
    const changes = Diff.diffChars(original, cleaned);
    let html = '', shownChars = 0;
    for (const c of changes){
      if (shownChars > maxChars){ html += '<div class="diff-empty">… (truncado)</div>'; break; }
      const val = escapeHtml(c.value);
      if (c.added) html += `<span class="d-add">${val}</span>`;
      else if (c.removed) html += `<span class="d-rem">${val}</span>`;
      else html += `<span class="d-eq">${val}</span>`;
      shownChars += c.value.length;
    }
    return html;
  } catch(e){ return '<div class="diff-empty">Erro: ' + escapeHtml(e.message) + '</div>'; }
}

function renderDiff(original, cleaned){
  const section = $('diffSection');
  const body = $('diffBody');
  body.innerHTML = buildDiffHTML(original, cleaned);
  section.style.display = 'block';
}