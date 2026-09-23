# CleanMark Pro

Detector de escrita por IA e limpador de metadados. **100% client-side** — nenhum texto sai do navegador.

## Funcionalidades

- **Score de IA (0–100)**: analisa padrões típicos de LLM (vocabulário, frases, estrutura) e classifica o texto.
- **Auditoria de caracteres suspeitos**: invisíveis (largura zero), espaços especiais, tipografia atípica, hífens especiais, controles direcionais, Unicode Tags (`U+E0000–U+E007F`), chars matemáticos e preenchimento.
- **Marcadores U+XXXX**: detecta e decodifica marcadores vindos de texto com HTML/notações de controle.
- **Limpeza**: remove invisíveis, HTML, normaliza NFC, colapsa espaços, normaliza tipografia opcionalmente.
- **Highlight no editor**: marca visualmente cada categoria (quebras viram traço vertical, tabs viram bloco).
- **Diff original → limpo**: com a lib `diff` (jsdiff).
- **Arquivos**: arraste `.txt .md .csv .json .html .docx .xlsx .pptx .pdf .png .jpg .webp .gif .bmp`. Extrai texto de Office/PDF e limpa metadados (autor, genitor, datas) de documentos e imagens (EXIF/GPS via redraw em canvas).
- **Reescrever com IA**: Puter.js (grátis, sem API key), Gemini ou Groq (com API key própria, guardada só no `localStorage`).

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
│   ├── detector.js    # análise: padrões de IA, marcadores, registro de chars, regex, highlight
│   ├── cleaner.js     # limpeza/sanitização e diff
│   └── app.js         # estado, UI, auditoria, painel de arquivos, reescrita, eventos
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

## Notas

- `runAnalyze` roda automaticamente ao digitar (debounce 600ms).
- A limpeza do texto **não remove quebras de linha** (`\n`) — elas são estrutura. "Remover" só acontece para invisíveis, HTML e chars suspeitos.
- API keys nunca são enviadas a servidor do projeto; ficam no `localStorage` do navegador.