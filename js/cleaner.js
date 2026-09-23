// ============================================================
// 6. LIMPEZA
// ============================================================
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
    result = result.replace(/<script[\s\S]*?<\/script>/gi, '');
    result = result.replace(/<style[\s\S]*?<\/style>/gi, '');
    const tagMatches = result.match(/<[^>]+>/g);
    stats.html = tagMatches ? tagMatches.length : 0;
    result = result.replace(/<[^>]+>/g, '');
    result = result.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
      .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
      .replace(/&hellip;/g,'…').replace(/&mdash;/g,'—').replace(/&ndash;/g,'–');
  }
  if (opts.invisible){
    const matches = result.match(INVISIBLE_REGEX);
    stats.invisible = matches ? matches.length : 0;
    result = result.replace(INVISIBLE_REGEX, '');
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
function renderDiff(original, cleaned){
  const section = $('diffSection');
  const body = $('diffBody');
  if (original === cleaned){ section.style.display = 'block'; body.innerHTML = '<div class="diff-empty">Nenhuma diferença.</div>'; return; }
  if (original.length > 200000){ section.style.display = 'block'; body.innerHTML = '<div class="diff-empty">Texto muito grande.</div>'; return; }
  if (typeof Diff === 'undefined'){ section.style.display = 'block'; body.innerHTML = '<div class="diff-empty">Diff não carregou.</div>'; return; }
  try {
    const changes = Diff.diffChars(original, cleaned);
    let html = '', shownChars = 0;
    for (const c of changes){
      if (shownChars > 100000){ html += '<div class="diff-empty">… (truncado)</div>'; break; }
      const val = escapeHtml(c.value);
      if (c.added) html += `<span class="d-add">${val}</span>`;
      else if (c.removed) html += `<span class="d-rem">${val}</span>`;
      else html += `<span class="d-eq">${val}</span>`;
      shownChars += c.value.length;
    }
    body.innerHTML = html;
    section.style.display = 'block';
  } catch(e){ body.innerHTML = '<div class="diff-empty">Erro: ' + escapeHtml(e.message) + '</div>'; }
}