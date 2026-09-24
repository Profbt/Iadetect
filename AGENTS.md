# AGENTS.md — CleanMark Pro

Regras para quem (agente de IA ou humano) for editar este projeto.

## Visão geral

Single-page app estático de detecção de escrita IA + limpeza de metadados. Interfaces e textos em **português (pt-BR)**.

## Estrutura e onde mexer

- **`index.html`** — só marcação. Nada de CSS/JS inline. Scripts locais carregados **no fim do `<body>`** via `<script src>` sequencial.
- **`css/style.css`** — todo o estilo; tema definido via variáveis em `:root`. Não use estilos inline no HTML a menos que seja para um valor dinâmico controlado por JS.
- **`js/detector.js`** — análise pura (sem DOM): `AI_PATTERNS`, `detectAI`, métricas estilísticas (`computeBurstiness`, `computeLexicalDiversity`, `computeAvgSentenceLength`, `computeParagraphUniformity`), `METRIC_WEIGHTS`/`PATTERN_WEIGHT`, marcadores U+XXXX, `CHAR_INFO`/`getCharInfo`, regex, `buildBackdropHTML`. A maior parte é dados + funções puras.
- **`js/cleaner.js`** — `cleanText`, `normalizeTypography`, `sanitizeAggressive`, `buildDiffHTML` (gera o HTML de diff; `renderDiff` só injeta em `#diffBody`).
- **`js/app.js`** — o resto: estado global, helpers de DOM (`$`, `getOpts`, `updateCounts`, `syncBackdrop`), renderização (score dashboard com breakdown/métricas, auditoria, painel de resultado), extração/limpeza de arquivos (Office/PDF/imagem), provedores de reescrita, análise comparativa e todos os **event listeners**.

## Regras obrigatórias

1. **Ordem de carregamento**: `detector.js` → `cleaner.js` → `app.js`. Não inverter e não transformar em ES modules sem combinar antes. `cleaner` depende de `detector` (`INVISIBLE_REGEX`, `decodeInvisibleMarkers`); `app` depende de ambos.
2. **Escopo global compartilhado**: os três arquivos compartilham globais. Evite colidir nomes; siga o prefixo de cada seção (ex.: funções de análise ficam em `detector.js`).
3. **Nada de build/package**: projeto estático, funciona via `file://`. Não adicione bundler nem framework sem discutir.
4. **Não remover o que é estrutura**: `\n`, `\t`, `\r` e espaço comum são whitespace legítimo — a auditoria deve tratá-los como normais (`isLegitWhitespace`). Nunca "limpe" quebras de linha.
5. **Comentários**: só use os cabeçalhos de seção `// ===...` e, em pontos onde a lógica não é óbvia, um comentário curto explicando o porquê. Não emule explicação de código.
6. **Testar antes de terminar**: valide a sintaxe com `node --check js/detector.js` (idem para os outros) e abra o `index.html` (ou `npx serve .`) para conferir que não há erro no console.
7. **Dados/segurança**: API keys de reescrita (uma por provedor, `cleanmark_api_key_gemini` / `cleanmark_api_key_groq`) ficam só no `localStorage` e vão direto ao provedor escolhido. Não logue, não envie a backend, não adicione placeholder de key em HTML.
8. **Libs CDN**: mantenha as versões atuais de JSZip, pdf-lib, diff, Puter e pdf.js. Checagem com `typeof X === 'undefined'` já cobre lib que não carregou.

## Padrões de código

- Funções e IDs em camelCase; textos com acento e pt-BR.
- Contadores/formatos de número sempre com `toLocaleString('pt-BR')`.
- `$('id')` para `document.getElementById`.
- Cores e tema sempre via variáveis de `:root`; só use hex direto onde hoje já é usado em JS (badges, estilos de highlight).
- O `backdrop` (camada de highlight) é renderizado por `buildBackdropHTML` e sincronizado por scroll com o `textarea`.

## Funciona assim (fluxo principal)

`handleFile` (drop/upload) → extrai texto → `setInputText` → `runAnalyze`: `detectAI` (score/evidências/breakdown) + `cleanText` (saída) + `renderAudit` (chars suspeitos) + `renderDiff` (original→limpo) + stats. O score usa `renderScoreDashboard` (gauge + barras por categoria `#breakdownBars` + cards de métricas `#metricsGrid`) — métricas só até 200 KB (perf), e `#scoreBreakdown`/`#metricsGrid` ficam ocultos sem dados.

## Score dashboard e comparativo (análise comparativa)

- Score final é heurístico e sem sabotar texto limpo: `PATTERN_WEIGHT=80` + `METRIC_WEIGHTS` (burstiness 8, diversidade 6, uniformidade 4, comprimento 2 — soma 100). Penalidade por métrica = peso × (valor que não é "saudável"); comprimento só penaliza se média > 25. Ajuste aqui se calibrar em corpus real.
- Vereditos das métricas: burstiness ≥0.6 alta / ≥0.35 média; diversidade ≥0.6 alta / ≥0.45 média; uniformidade ≥0.75 alta / ≥0.5 média (uniformidade ALTA é suspeita — invertida); comprimento <12 curta, 12–20 média, 20–30 longa, >30 muito longa (informativo). Guardas de texto curto retornam neutro (0.5/média).
- `buildDiffHTML(original, cleaned, maxChars=100000)` é a função reutilizável de diff — usada pelo `renderDiff` e pelo comparativo; não duplicar lógica.
- Painel `#comparePanel` (antes de `.rewrite-panel`): é **colapsável** — estado inicial fechado, persistido em `localStorage` (`cleanmark_compare_open`, gerenciado por `setCompareOpen`). Auto-expande ao usar `btnSendA`/`btnSendB` (copiam `#input`/`#output`), ao colar texto relevante nos campos e no fluxo pós-reescrita. `runCompare()` sempre garante painel aberto, chama `detectAI` nos dois, monta tabela de métricas com delta (Δ verde = melhora) via `buildCompareTable`, diff e resumo. `updateCompareBadge()` mantém o `#compareToggleBadge` (mini-resumo `A: x → B: y (±z%)`, verde se B melhorou). Guarda de rewrite: `fillCompareFromRewrite` preenche original × reescrita, compara e rola até o painel — não quebrar esse fluxo.
- Cores de categoria fixas no dashboard: `CAT_COLORS` em `app.js` (Vocabulário `#c084fc`, Frases `#fbbf24`, Estrutura `#f87171`). Classes de veredito de métricas: `verdict-ok/-warn/-bad/-muted`. Scores A/B usam `[data-verdict]` (`scoreVerdict`: clean/low/medium/high); deltas da tabela usam `td.delta.good/.bad/.neutral`.

## Widget Clever Humanizer (reescrita)

- Método padrão do painel "Reescrever com IA" (`#rewriteMethod` = `clever`). Alternativa `api` fica oculta em `#apiRewriteArea`.
- O Clever é um **iframe estático** no HTML (`#cleverWidget`), src `https://widgets.cleverhumanizer.ai/embed/b979b26728954c9986b7531b338bc4c7?theme=dark`, altura 750px, `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, `allow="clipboard-write"`, `referrerpolicy="origin"`. **Não** injetar `widgets.cleverhumanizer.ai/widget.js` via script.
- **Restrição**: é um iframe sandbox fechado — não existe API para enviar o texto do editor nem ler o resultado. O usuário copia o resultado dentro do widget. Não tentar integrar via `postMessage` de conteúdo.
- Em `file://` o embed pode alegar origem não verificada; recomendar `npx serve .` na nota (`#cleverNote`).

## Provedores de API (reescrita)

- Três cards em `#apiRewriteArea` com rádio `name="apiProvider"` (`puter`/`gemini`/`groq`); corpo visível por vez via `.provider-body` (JS `bindApiProvider`).
- **Puter.js**: NÃO fica mais no `<head>`. Carregado **sob demanda** por `loadPuter()` (injetado quando o modo API é aberto, radio muda para puter ou rewrite usa puter). Define `puter.quiet = true` no boot (suprime banner; o v2 nem sempre tem `isLoggedIn` — usar `puter.auth.isSignedIn()`). Login explícito: botão `#btnPuterLogin` → `loadPuter()` → `puter.auth.signIn()`; estado em `#puterStatus`. Chamadas com `withTimeout`.
- **Gemini/Groq**: keys próprias, guardadas só no `localStorage` (`cleanmark_api_key_gemini` / `cleanmark_api_key_groq`), vão direto ao provedor. Não logue, não envie a backend.
- **Limite por vez**: 30 a 1.500 palavras (aviso `#wordLimitNote` + guard no `runRewrite`).
- Erros de CSP/Cloudflare que aparecem no console vêm de **dentro do iframe do Clever** (domínio deles) — não são do app.

## Verificação rápida

```bash
node --check js/detector.js && node --check js/cleaner.js && node --check js/app.js
npx serve .
```