# Design: Widget Clever Humanizer no painel "Reescrever com IA"

Data: 2026-09-23

## Contexto

O painel "Reescrever com IA" hoje usa apenas provedores por API (Puter/Gemini/Groq). O usuário quer
embutir o widget grátis do Clever Humanizer como método padrão, mantendo a opção de usar API.

## Restrição técnica (investigada)

O widget (`widgets.cleverhumanizer.ai/widget.js`) é um **iframe sandbox fechado**:

- comunicação com a página apenas via `postMessage` de `clever:resize` (auto-ajuste de altura);
- **não há API para enviar texto do editor** para o widget nem ler o resultado de volta;
- o resultado é copiado manualmente pelo usuário (o iframe tem `allow="clipboard-write"`).

Consequências:
- o botão "↩️ Usar reescrita como entrada" **não existe no modo Clever** (impossível ler o iframe);
- o texto digitado no widget vai para os servidores do Clever (não é processamento local) — a nota
  de aviso deve deixar isso claro;
- o iframe nasce com `opacity:0` e só fica visível após o handshake `clever:resize`; em `file://` o
  handshake é rejeitado (origem `"null"`) — por isso há fallback de 3s forçando visibilidade com
  altura fixa de 600px + scroll interno (auto-ajuste só quando o handshake funciona).

## Decisões

1. Seletor `#rewriteMethod` no topo do painel: `clever` (default) e `api`.
2. Modo `clever`: mostra `#cleverWidget` e injeta o script do widget **lazy** (uma vez, com guard).
   Esconde `#apiRewriteArea` (config de provedor + ações). `#rewriteStatus` exibe a orientação de uso.
3. Modo `api`: comportamento atual inalterado.
4. Estado inicial = `clever` (handler chamado no load).
5. Sem persistência do método (YAGNI).

## Arquivos afetados

- `index.html` — painel de reescrita: select de método, `#cleverWidget`, wrapper `#apiRewriteArea`.
- `js/app.js` (seção 15) — `ensureCleverWidget()` (injeção lazy) + handler de `#rewriteMethod` + init.
- `css/style.css` — classe utilitária `.clever-widget` (espaçamento/nota).
- `README.md` / `AGENTS.md` — documentar o widget, ID de embbed e limitação.

## Funcionamento esperado

1. Abre o app → painel Reescrever mostra o widget Clever embutido + nota de orientação.
2. Usuário cola o texto dentro do widget, humaniza e copia o resultado (botão de copiar do widget).
3. Seleciona "API" → config de provedor/API key + botões voltam; fluxo existente intacto.

## Verificação

- `node --check js/app.js` (e demais JS).
- Abrir `index.html` / `npx serve .`:
  - modo Clever renderiza o iframe (sem erro no console);
  - trocar para API e voltar funciona sem duplicar iframe;
  - modo API com Puter/Gemini/Groq continua funcionando.