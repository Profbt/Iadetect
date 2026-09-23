# AGENTS.md — CleanMark Pro

Regras para quem (agente de IA ou humano) for editar este projeto.

## Visão geral

Single-page app estático de detecção de escrita IA + limpeza de metadados. Interfaces e textos em **português (pt-BR)**.

## Estrutura e onde mexer

- **`index.html`** — só marcação. Nada de CSS/JS inline. Scripts locais carregados **no fim do `<body>`** via `<script src>` sequencial.
- **`css/style.css`** — todo o estilo; tema definido via variáveis em `:root`. Não use estilos inline no HTML a menos que seja para um valor dinâmico controlado por JS.
- **`js/detector.js`** — análise pura (sem DOM): `AI_PATTERNS`, `detectAI`, marcadores U+XXXX, `CHAR_INFO`/`getCharInfo`, regex, `buildBackdropHTML`. A maior parte é dados + funções puras.
- **`js/cleaner.js`** — `cleanText`, `normalizeTypography`, `sanitizeAggressive`, `renderDiff`.
- **`js/app.js`** — o resto: estado global, helpers de DOM (`$`, `getOpts`, `updateCounts`, `syncBackdrop`), renderização (score, auditoria, painel de resultado), extração/limpeza de arquivos (Office/PDF/imagem), provedores de reescrita e todos os **event listeners**.

## Regras obrigatórias

1. **Ordem de carregamento**: `detector.js` → `cleaner.js` → `app.js`. Não inverter e não transformar em ES modules sem combinar antes. `cleaner` depende de `detector` (`INVISIBLE_REGEX`, `decodeInvisibleMarkers`); `app` depende de ambos.
2. **Escopo global compartilhado**: os três arquivos compartilham globais. Evite colidir nomes; siga o prefixo de cada seção (ex.: funções de análise ficam em `detector.js`).
3. **Nada de build/package**: projeto estático, funciona via `file://`. Não adicione bundler nem framework sem discutir.
4. **Não remover o que é estrutura**: `\n`, `\t`, `\r` e espaço comum são whitespace legítimo — a auditoria deve tratá-los como normais (`isLegitWhitespace`). Nunca "limpe" quebras de linha.
5. **Comentários**: só use os cabeçalhos de seção `// ===...` e, em pontos onde a lógica não é óbvia, um comentário curto explicando o porquê. Não emule explicação de código.
6. **Testar antes de terminar**: valide a sintaxe com `node --check js/detector.js` (idem para os outros) e abra o `index.html` (ou `npx serve .`) para conferir que não há erro no console.
7. **Dados/segurança**: API keys de reescrita ficam só no `localStorage` (`cleanmark_api_key`) e vão direto ao provedor escolhido. Não logue, não envie a backend, não adicione placeholder de key em HTML.
8. **Libs CDN**: mantenha as versões atuais de JSZip, pdf-lib, diff, Puter e pdf.js. Checagem com `typeof X === 'undefined'` já cobre lib que não carregou.

## Padrões de código

- Funções e IDs em camelCase; textos com acento e pt-BR.
- Contadores/formatos de número sempre com `toLocaleString('pt-BR')`.
- `$('id')` para `document.getElementById`.
- Cores e tema sempre via variáveis de `:root`; só use hex direto onde hoje já é usado em JS (badges, estilos de highlight).
- O `backdrop` (camada de highlight) é renderizado por `buildBackdropHTML` e sincronizado por scroll com o `textarea`.

## Funciona assim (fluxo principal)

`handleFile` (drop/upload) → extrai texto → `setInputText` → `runAnalyze`: `detectAI` (score/evidências) + `cleanText` (saída) + `renderAudit` (chars suspeitos) + `renderDiff` (original→limpo) + stats.

## Widget Clever Humanizer (reescrita)

- Método padrão do painel "Reescrever com IA" (`#rewriteMethod` = `clever`). Alternativa `api` (Puter/Gemini/Groq) fica oculta em `#apiRewriteArea`.
- O script do widget (`widgets.cleverhumanizer.ai/widget.js`) é injetado **lazy** pelo `ensureCleverWidget()` quando o modo Clever é ativado (uma vez, com guard `cleverWidgetScriptLoaded`).
- ID do widget: `data-clever-widget="b979b26728954c9986b7531b338bc4c7"` (tema `dark`), no `#cleverWidget` em `index.html`.
- **Restrição**: é um iframe sandbox fechado — não existe API para enviar o texto do editor nem ler o resultado. O usuário copia o resultado dentro do widget. Não tentar integrar via `postMessage` de conteúdo.
- **Visibilidade (fallback)**: o iframe nasce com `opacity:0` e só aparece após o handshake de `clever:resize`. Em `file://` o handshake é rejeitado (origem `"null"`). Por isso `ensureCleverWidget()` tem um `setTimeout` de 3s que força `opacity:1` + `height:600px` (scroll interno) se o handshake não responder.

## Verificação rápida

```bash
node --check js/detector.js && node --check js/cleaner.js && node --check js/app.js
npx serve .
```