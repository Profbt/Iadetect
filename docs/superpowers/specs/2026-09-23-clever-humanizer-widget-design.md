# Design: Widget Clever Humanizer + provedores separados no painel "Reescrever com IA"

Data: 2026-09-23 (atualizado: swap para iframe estático + provedores em cards)

## Contexto

O painel "Reescrever com IA" usa o widget grátis do Clever Humanizer como método padrão e
provedores por API como alternativa. O widget via `widget.js` (script) não aparecia (caixa
invisível) — trocou-se para o **iframe de embed direto** (snippet oficial do Clever). Além disso,
os provedores de API (Puter/Gemini/Groq) passam a ser cards separados, e o Puter ganha login
explícito com botão próprio.

## Restrições técnicas (investigadas)

- O embed do Clever é um **iframe sandbox fechado**: comunicação com a página só via `postMessage`
  de resize; **não há API** para enviar o texto do editor nem ler o resultado — copiar manualmente.
- O `widget.js` injetado criava o iframe com `opacity:0` e só o mostrava após handshake de resize;
  em `file://` o handshake é rejeitado (origem `"null"`) → box nunca aparecia. **O iframe estático
  não tem esse problema** (sem script host → sem opacity inicial 0). Em `file://` o embed pode
  alegar origem não verificada — a nota recomenda `npx serve .`.
- **puter.js v2** (`js.puter.com/v2/`, `defer` no head): API real é `puter.auth.signIn()` e
  `puter.auth.isSignedIn()` (**não** `isLoggedIn`). Login explícito via botão; status em `#puterStatus`.
  Em redes que bloqueiam `api.puter.com` o login/reescrita falham — chamadas guardadas com `withTimeout`.

## Decisões

1. Seletor `#rewriteMethod`: `clever` (default) e `api`.
2. Modo `clever`: iframe estático em `#cleverWidget`
   (`https://widgets.cleverhumanizer.ai/embed/b979b26728954c9986b7531b338bc4c7?theme=dark`,
   750px, `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`,
   `allow="clipboard-write"`, `referrerpolicy="origin"`). Sem injeção de `widget.js`.
3. Modo `api`: três cards `.provider-card` com rádio `name="apiProvider"`
   (`puter`/`gemini`/`groq`); corpo visível por vez (JS `bindApiProvider`).
   - Puter: botão `#btnPuterLogin` → `puter.auth.signIn()` com timeout; `#puterStatus` mostra estado.
   - Gemini: `#geminiKey` (localStorage `cleanmark_api_key_gemini`; migra de `cleanmark_api_key`).
   - Groq: `#groqKey` (localStorage `cleanmark_api_key_groq`).
4. Estado inicial = `clever` (handler chamado no load). Sem persistência do método (YAGNI).

## Arquivos afetados

- `index.html` — select de método, `#cleverWidget` (iframe), `#apiRewriteArea` (cards + ações).
- `js/app.js` (seções 15b/15c) — `setRewriteMethod`, `bindApiProvider`, keys por provedor,
  `updatePuterAuthState`/`puterLogin`, `runRewrite` lê rádio ativo.
- `css/style.css` — `.provider-card`, `.provider-head`, `.provider-body`, `.provider-hint`,
  `.puter-status` (+ `.clever-widget`/`.clever-note`).
- `README.md` / `AGENTS.md` — documentar iframe estático, cards e API do puter.

## Funcionamento esperado

1. Abre o app → painel Reescrever mostra o iframe do Clever (750px) + nota de orientação.
2. Seleciona "API" → cards por provedor; seleciona um, preenche key ou loga no Puter, reescreve.
3. "↩️ Usar reescrita como entrada" só faz sentido no modo API (no Clever é manual).

## Verificação

- `node --check js/app.js` (e demais JS).
- Abrir `index.html` / `npx serve .`:
  - modo Clever renderiza o iframe direto (sem injeção de `widget.js`, sem erro no console);
  - trocar para API e voltar funciona sem duplicar;
  - rádio dos provedores alterna só o corpo correto; puter mostra status sem `is not a function`.