// Teste funcional headless: carrega o index.html real + detector/cleaner/app
// num navegador (DOM real, DOMParser, etc.) e valida C5-C8 e insuficiente.
// Requer Chrome instalado. Uso: node test/browser-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(process.env.TEMP || 'C:\\Users\\Bruno\\AppData\\Local\\Temp', 'opencode', 'cm-browser-test.html');

function fixture(f){ return fs.readFileSync(path.join(ROOT, 'test', 'fixtures', f), 'utf8'); }

const aiText   = JSON.stringify(fixture('pt-ai-sample.txt'));
const humanTxt = JSON.stringify(fixture('pt-human-sample.txt'));
const emojiTxt = JSON.stringify(fixture('emoji-zwj.txt'));
const mixedTxt = JSON.stringify(fixture('mixed.txt'));

const harness = `
<script>
(function(){
  let pass = 0, fail = 0;
  const res = [];
  function ok(cond, msg){
    if (cond){ pass++; res.push('ok: ' + msg); }
    else { fail++; res.push('FAIL: ' + msg); }
  }
  window.__suiteResult = () => ({ pass, fail, res: res.join('\\n') });
  window.__runSuite = () => {
    try {
      // ---- C5: extração HTML real ----
      const htmlOut = extractTextFromHTML('<p>primeiro</p><p>segundo</p>');
      ok(htmlOut === 'primeiro\\nsegundo', 'C5 extractTextFromHTML blocos, got ' + JSON.stringify(htmlOut));
      const h2 = cleanText('<div>a</div><!-- comentario --><div>b</div>', {decodeMarkers:false, html:true, invisible:true, conservativeClean:true}).text;
      ok(h2 === 'a\\nb', 'C5 cleanText full HTML (coment sank removido), got ' + JSON.stringify(h2));
      const h3 = cleanText('x &lt; 3', {decodeMarkers:false, html:true, invisible:true, conservativeClean:true}).text;
      ok(h3 === 'x < 3', 'C5 entidade em texto nao-HTML, got ' + JSON.stringify(h3));
      ok(decodeHTMLEntities('a &lt; b') === 'a < b', 'dbg decodeHTMLEntities direto, got ' + JSON.stringify(decodeHTMLEntities('a &lt; b')));
      ok(looksLikeHTML('x &lt; 3') === false, 'dbg looksLikeHTML(' + looksLikeHTML('x &lt; 3') + ')');

      // ---- T4 emojis no navegador ----
      const eo = cleanText(${emojiTxt}, {decodeMarkers:false, html:true, invisible:true, conservativeClean:true}).text;
      ok(eo.includes(String.fromCodePoint(0x1F469,0x1F3EB,0x200D,0x1F393)), 'T4 emoji 👩🏫 preservado (browser)');

      // ---- T1 no DOM/navegador ----
      const det = detectAI(${aiText});
      ok(det.evidence.filter(e => !e.id.startsWith('en-')).length >= 8, 'T1 >=8 padroes PT (browser)');
      const human = detectAI(${humanTxt});
      ok(det.stylisticIndex === det.score, 'T7 stylisticIndex alias de score');

      // ---- T7 insuficiente: texto curto esconde gauge ----
      renderScoreDashboard(detectAI('oi mundo'), 'oi mundo');
      const gauge = $('gauge').style.display;
      const insuff = $('scoreInsufficient').style.display;
      ok(gauge === 'none' && insuff === 'block', 'T7 gauge oculto + aviso insuficiente, gauge=' + gauge + ' insuff=' + insuff);

      // ---- T7 insuficiente: comparativo não computa lado curto ----
      $('compareA').value = ${aiText};
      $('compareB').value = 'frase curta';
      runCompare();
      const badgeB = $('compareScoreB').textContent;
      ok(/insuficiente/i.test(badgeB), 'T7 comparativo marca lado insuficiente, got ' + JSON.stringify(badgeB));
      const hasScoreAttr = $('compareScoreB').hasAttribute('data-score');
      ok(!hasScoreAttr, 'T7 lado insuficiente sem data-score');

      // ---- T7 classe de insuficiente no sumário ----
      const summaryTxt = $('compareSummary').textContent;
      ok(/insuficiente/i.test(summaryTxt), 'T7 sumário avisa insuficiência');

      // ---- C6: dois botões de download ----
      ok(!!$('btnDownloadClean') && !!$('btnDownloadText'), 'C6 botões documento + texto existem');

      // ---- C7: sem rótulos antigos no DOM (ignora <script> e o <pre> da suíte) ----
      const probe = document.body.cloneNode(true);
      probe.querySelectorAll('script').forEach(s => s.remove());
      probe.querySelectorAll('#__suiteOutput').forEach(s => s.remove());
      const bodyTxt = probe.textContent;
      const banned = ['Score IA', 'Forte sinal de IA', 'Possível escrita por IA', 'Leve sinal de IA',
                      'Sem sinais relevantes', 'Sinais de IA', 'Scores idênticos', 'score caiu', 'score MAIOR'];
      for (const b of banned){
        ok(!bodyTxt.includes(b), 'C7 sem "' + b + '" no DOM');
      }

      // ---- T6: showResultPanel mostra doc + texto juntos ----
      lastCleanBlob = new Blob(['x']); lastCleanName = 'a.docx';
      output.value = 'texto limpo aqui';
      showResultPanel({ originalFile: { name: 'a.docx', size: 10 }, cleanBlob: lastCleanBlob, cleanName: 'a_limpo.docx' });
      const docVis = $('resultSectionDoc').style.display;
      const txtVis = $('resultSectionText').style.display;
      ok(docVis === 'block' && txtVis === 'block', 'C6 painel com doc e texto visíveis');

      // ---- T7: hint ⓘ + legenda breakdown ----
      ok(!!document.querySelector('.idx-hint'), 'T7 ícone de ajuda do índice');
      ok(document.body.textContent.includes('Não são probabilidades'), 'T7 legenda breakdown');

      // ---- aurora: textarea com U+2028 preservado na saída conservadora ----
      const lsOut = cleanText('a\\u{2028}b', {decodeMarkers:false, html:false, invisible:true, conservativeClean:true}).text;
      ok(lsOut === 'a\\nb', 'T4 U+2028 virou \\n (browser)');
    } catch(e){
      res.push('EXCEPTION: ' + (e && e.stack || e));
      fail++;
    }
    const out = window.__suiteResult();
    const pre = document.createElement('pre');
    pre.id = '__suiteOutput';
    pre.textContent = 'PASS=' + out.pass + ' FAIL=' + out.fail + '\\n' + out.res;
    document.body.appendChild(pre);
  };
  window.addEventListener('load', () => setTimeout(window.__runSuite, 300));
})();
</script>
`;

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const withHarness = indexHtml.replace('</body>', harness + '\n</body>');
const withAbs = withHarness.replace(
  /(<script src=")js\/(detector|cleaner|app)\.js("><\/script>)/g,
  (m, pre, name, post) => pre + encodeURI('file:///' + path.join(ROOT, 'js', name + '.js').replace(/\\/g, '/')) + post
);
fs.writeFileSync(OUT, withAbs);

try {
  const dump = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
    '--virtual-time-budget=4000',
    '--dump-dom',
    'file:///' + OUT.replace(/\\/g, '/'),
  ], { encoding: 'utf8' });

  const re = /<pre id="__suiteOutput">([\s\S]*?)<\/pre>/;
  const m = dump.match(re);
  if (!m){
    console.log('SEM SAÍDA DA SUÍTE (dump sem #__suiteOutput). Abaixo trecho do DOM:');
    console.log(dump.slice(0, 2000));
    process.exit(1);
  }
  console.log(m[1].replace(/\\n/g, '\n'));
  const passLine = m[1].match(/PASS=\d+ FAIL=\d+/);
  const fail = passLine ? parseInt(passLine[0].match(/FAIL=(\d+)/)[1], 10) : 1;
  process.exit(fail > 0 ? 1 : 0);
} catch(e){
  console.error('Chrome falhou:', e.message);
  process.exit(2);
}