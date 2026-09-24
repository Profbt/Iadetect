// Suíte de testes Node para detector.js + partes puras de cleaner.js.
// As partes DOM (extractTextFromHTML) são cobertas pelo teste headless.
// Uso: node test/run-tests.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const detectorSrc = fs.readFileSync(path.join(ROOT, 'js', 'detector.js'), 'utf8');
const cleanerSrc = fs.readFileSync(path.join(ROOT, 'js', 'cleaner.js'), 'utf8');
const fixture = f => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg){
  if (cond){ pass++; console.log('  ok    ' + msg); }
  else { fail++; console.log('  FAIL  ' + msg); }
}

const TEST = `
(function(){
  const E = {
    teacher: String.fromCodePoint(0x1F469, 0x1F3EB, 0x200D, 0x1F393), // 👩🏫
    family:  String.fromCodePoint(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467, 0x200D, 0x1F466), // 👨👩👧👦
    rainbow: String.fromCodePoint(0x1F3F3, 0xFE0F, 0x200D, 0x1F308), // 🏳️🌈
  };

  // ---------- T2 tokenização Unicode ----------
  {
    const w = tokenizeWords('educação é fundamental!');
    ok(w.length === 3 && w[0] === 'educação' && w[1] === 'é' && w[2] === 'fundamental', 'T2 tokenizeWords com acentos');
    const s = splitSentences('Primeira frase aqui. Segunda frase.');
    ok(s.length === 2, 'T2 splitSentences usa Intl.Segmenter');
  }

  // ---------- T2 TTR sem correção p/ texto curto ----------
  {
    const d1 = computeLexicalDiversity('educação educação educação').value;
    ok(d1 >= 0.32 && d1 <= 0.34, 'T2 TTR 1/3 ~ 0.33 (sem inflar texto curto), got ' + d1);
    const d2 = computeLexicalDiversity('educação educação é fundamental').value;
    ok(d2 >= 0.74 && d2 <= 0.76, 'T2 TTR 3/4 = 0.75, got ' + d2);
  }

  // ---------- T3 INVISIBLE_REGEX ----------
  {
    // copia sem /g para .test() determinístico
    const isInvis = s => new RegExp(INVISIBLE_REGEX.source, 'u').test(s);
    const astral = [0x1D173, 0x1D174, 0x1D17A, 0xE0000, 0xE007F, 0xE0100, 0xE01EF];
    for (const cp of astral){
      ok(isInvis(String.fromCodePoint(cp)), 'T3 INVISIBLE_REGEX casa U+' + cp.toString(16).toUpperCase());
    }
    ok(!isInvis('texto normal sem ocultos'), 'T3 INVISIBLE_REGEX ignora texto limpo');
    const zwsp = 'a' + String.fromCodePoint(0x200B) + 'b';
    ok(isInvis(zwsp), 'T3 INVISIBLE_REGEX casa ZWSP');
  }

  // ---------- T4 limpeza conservadora ----------
  {
    const opts = { decodeMarkers:false, html:false, invisible:true, conservativeClean:true,
                   normalizeTypo:false, normalize:false, whitespace:false };
    const clean = (t) => cleanText(t, opts).text;
    const mixed = fixture('mixed.txt');
    const out = clean(mixed);
    ok(out.includes(E.teacher), 'T4 emoji 👩🏫 preservado no conservador');
    ok(out.includes(E.rainbow), 'T4 emoji 🏳️🌈 (com ZWJ+VS16) preservado');
    ok(!out.includes(String.fromCodePoint(0x200B)), 'T4 ZWSP removido');
    ok(!out.includes(String.fromCodePoint(0xFEFF)), 'T4 BOM removido');
    ok(!out.includes(String.fromCodePoint(0x200C)), 'T4 ZWNJ removido');

    const ls = clean(fixture('line-separator.txt'));
    ok(ls === 'linha um\\nlinha dois\\n\\nparágrafo depois e fim', 'T4 U+2028→\\n e U+2029→\\n\\n, got ' + JSON.stringify(ls));

    const emojiZwj = fixture('emoji-zwj.txt');
    const outEz = clean(emojiZwj);
    ok(outEz.includes(E.teacher) && outEz.includes(E.family) && outEz.includes(E.rainbow),
      'T4 todos os emojis ZWJ preservados');
    const zwjOrphan = 'x' + String.fromCodePoint(0x200D) + 'y';
    ok(!clean(zwjOrphan).includes(String.fromCodePoint(0x200D)), 'T4 ZWJ órfão (fora de emoji) removido');

    const agg = cleanText(mixed, Object.assign({}, opts, { conservativeClean:false })).text;
    ok(!agg.includes(String.fromCodePoint(0x200B)), 'T4 modo agressivo também remove ZWSP');
  }

  // ---------- T5 HTML / entidades ----------
  {
    ok(looksLikeHTML('<p>a</p><p>b</p>') === true, 'T5 looksLikeHTML 2 tags de bloco');
    ok(looksLikeHTML('<!DOCTYPE html><html><body>x</body></html>') === true, 'T5 looksLikeHTML doctype');
    ok(looksLikeHTML('x < 3 e y > 2') === false, 'T5 looksLikeHTML NÃO em texto com <');
    ok(looksLikeHTML('texto simples, sem tags') === false, 'T5 looksLikeHTML em texto puro');
    ok(decodeHTMLEntities('a &amp; b &lt; c &gt; d') === 'a & b < c > d', 'T5 decodeHTMLEntities nomeadas');
    ok(decodeHTMLEntities('caf&#233; &#x26; &nbsp; fim') === 'café &   fim', 'T5 decodeHTMLEntities numéricas');
    const scr = cleanText('<script>x</script>texto', { decodeMarkers:false, html:true, invisible:true, conservativeClean:true }).text.trim();
    ok(scr === 'texto', 'T5 conteúdo fora de <script> preservado, got ' + JSON.stringify(scr));
  }

  // ---------- T1 padrões PT ----------
  {
    const det = detectAI(fixture('pt-ai-sample.txt'));
    const ids = det.evidence.map(e => e.id);
    const nonEn = ids.filter(id => !id.startsWith('en-'));
    console.log('      T1 evidências: ' + ids.join(', '));
    ok(nonEn.length >= 8, 'T1 sample PT ativa >= 8 padrões PT, got ' + nonEn.length);
    ok(det.score > 50, 'T1 sample PT índice > 50, got ' + det.score);
    const human = detectAI(fixture('pt-human-sample.txt'));
    ok(human.score < 20, 'T1 sample humano índice < 20, got ' + human.score);
  }
})();
`;

const code = detectorSrc + '\n' + cleanerSrc + '\n' + TEST;

try {
  const fn = new Function('performance', 'ok', 'fixture', code);
  fn(globalThis.performance, ok, fixture);
} catch(e){
  console.error('ERRO ao executar testes:', e);
  process.exit(2);
}

console.log('---');
console.log(pass + ' passou, ' + fail + ' falhou');
process.exit(fail > 0 ? 1 : 0);