# CleanMark Pro

Detector de escrita por IA e limpador de metadados. **100% client-side** — nenhum texto sai do navegador.

## Funcionalidades

- **Score de IA (0–100)**: analisa padrões típicos de LLM (vocabulário, frases, estrutura) e classifica o texto. Dashboard expandido com **barras de contribuição por categoria** e **métricas estilísticas** (burstiness, diversidade lexical, comprimento médio de frase, uniformidade de parágrafos) — computadas para textos até ~200 KB.
- **Análise comparativa A × B**: painel **colapsável** (estado lembrado; abre sozinho ao enviar entrada/saída, colar texto ou ao reescrever). Compare scores, métricas com delta (Δ) e diferenças verbatim; badge no cabeçalho resume `A: x → B: y (±z%)` após comparar.
- **Auditoria de caracteres suspeitos**: invisíveis (largura zero), espaços especiais, tipografia atípica, hífens especiais, controles direcionais, Unicode Tags (`U+E0000–U+E007F`), chars matemáticos e preenchimento.
- **Marcadores U+XXXX**: detecta e decodifica marcadores vindos de texto com HTML/notações de controle.
- **Limpeza**: remove invisíveis, HTML, normaliza NFC, colapsa espaços, normaliza tipografia opcionalmente.
- **Highlight no editor**: marca visualmente cada categoria (quebras viram traço vertical, tabs viram bloco).
- **Diff original → limpo**: com a lib `diff` (jsdiff).
- **Arquivos**: arraste `.txt .md .csv .json .html .docx .xlsx .pptx .pdf .png .jpg .webp .gif .bmp`. Extrai texto de Office/PDF e limpa metadados (autor, genitor, datas) de documentos e imagens (EXIF/GPS via redraw em canvas).
- **Reescrever com IA**: método padrão é o widget do **Clever Humanizer** (grátis, sem API key, embutido via iframe); alternativa via API com **Puter.js** (carregado sob demanda, login puter.com), **Gemini** ou **Groq** — cada um com seu campo de API key (só no `localStorage`). Limite de **30 a 1.500 palavras por vez**. O widget é independente do editor — o resultado é copiado manualmente. Se abrir via `file://`, o Clever pode pedir verificação de origem: use `npx serve .`.

## Como rodar

O projeto é estático e funciona abrindo `index.html` direto (`file://`). Para desenvolvimento com auto-reload:

```bash
npx serve .
```

## Estrutura

```
Escrita IA/
├── index.html         # só a estrutura/marcação
├── css/
│   └── style.css      # todo o estilo (variáveis de cor em :root)
├── js/
│   ├── detector.js    # análise: padrões de IA, métricas estilísticas, breakdown, marcadores, registro de chars, regex, highlight
│   ├── cleaner.js     # limpeza/sanitização e diff (buildDiffHTML)
│   └── app.js         # estado, UI, score dashboard, auditoria, comparativo, painel de arquivos, reescrita, eventos
├── README.md
└── AGENTS.md
```

**Ordem de carregamento importa**: `detector.js` → `cleaner.js` → `app.js`. Eles compartilham o escopo global (sem módulos ES).

## Dependências (CDN)

| Lib | Uso |
| --- | --- |
| JSZip | extrair/limpar `.docx .xlsx .pptx` |
| pdf-lib | limpar metadados de PDF |
| diff (jsdiff) | diff original → limpo |
| Puter.js | reescrita com IA grátis |
| pdf.js (lazy import) | extrair texto de PDF |
| Clever Humanizer (lazy widget) | reescrita grátis (iframe, método padrão) |

## Notas

- `runAnalyze` roda automaticamente ao digitar (debounce 600ms).
- A limpeza do texto **não remove quebras de linha** (`\n`) — elas são estrutura. "Remover" só acontece para invisíveis, HTML e chars suspeitos.
- API keys nunca são enviadas a servidor do projeto; ficam no `localStorage` do navegador.