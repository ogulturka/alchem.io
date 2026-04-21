# CLAUDE.md — Alchemio

Guidance for Claude Code sessions working on this project. Focus here is non-obvious context — repo structure and deps are self-evident from `ls` and `package.json`.

## Project

**Alchemio** is a browser-based graphical mapping tool for XML/JSON/XSD/WSDL payloads. It generates XSLT 1.0 and Groovy code artifacts that run on SAP CPI / SAP PO / Apache Camel. Long-term goal: emulate SAP PO `flib7` function catalog + 4-layer context runtime (see §SAP PO plan below).

- **Production URL:** https://alchem-io.vercel.app (alias to `alchemio.vercel.app`)
- **Deploy:** `vercel --prod --yes` then `vercel alias set <deployment-url> alchem-io.vercel.app`
- **Dev:** `npm run dev` (Vite on port 5173)
- **Build check:** `npm run build` (always run before push)

## Stack (short)

Vite 8 + React 19 + Tailwind 4 + Zustand 5 + `@xyflow/react` 12 + Monaco + Framer Motion + `@dnd-kit`. No TypeScript. No test framework. No linter config beyond eslint-plugin-react-hooks default.

## Layout

Three-panel shell with draggable resize handles (implemented in `App.jsx` with `dragRef` + mousedown tracking, min 200 / max 800 px):

```
┌─ Header (Logo · ProjectSelector · ThemeSwitcher) ────────┐
│ LeftPanel             │ MiddlePanel       │ RightPanel    │
│  ├─ Source editor     │  ReactFlow canvas │  Generated    │
│  │  (Code / Design)   │  + UDF + Clear    │  code (XSLT/  │
│  └─ Target editor     │  panels + FAB     │  Groovy tabs) │
│                       │  + Alchopilot     │               │
└───────────────────────────────────────────────────────────┘
```

## State

- **`store/useAppStore.js`** — canvas state (`nodes`, `edges`), source/target payloads, formats, SOAP toggles, generated code, Alchopilot executor. **Not persisted** — session state only.
- **`store/workspaceStore.js`** — multi-project `persist` store (localStorage key `alchemio-workspace`). Auto-save via `useAppStore.subscribe` debounced 500ms. `_isApplying` guard flag prevents self-echo when loading a project.
- `MiddlePanel` wraps `ReactFlowProvider` with `key={activeProjectId}` so switching projects does a clean canvas remount.

## Critical conventions

These are load-bearing decisions that regressed at least once — don't undo without understanding why.

### Monaco
- Editors MUST pass `beforeMount` that disables JS/TS diagnostics (`setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true, noSuggestionDiagnostics: true })`). Without it, Groovy code shows full red squigglies because Monaco treats it as JS.
- Explicit typography: `fontFamily: 'Consolas'`, `fontLigatures: false`, `letterSpacing: 0`, `lineHeight: 20`. Tailwind preflight leaks into Monaco and fragments selection rectangles if these are left default.
- Editor wrapper needs `position: relative` + `overflow: hidden` — SOAP envelope hints and CodeOverlay are absolutely positioned inside it.

### Header
- Do NOT add `backdrop-filter: blur(...)` to `Header.jsx`. It creates a new containing block for `position: fixed` descendants, which breaks modal positioning site-wide. Header bg is already opaque, no blur needed.

### XSLT generator (`utils/codeGenerator.js`)
- All XPaths emit `*[local-name()='Segment']` form via `dotToXPath()` — namespace-agnostic by design. Users often paste XML with unknown/mismatched namespace declarations; strict XPath silently produces empty output.
- `extractNamespacesFromXML()` walks the source DOM for `xmlns:*` declarations to inject into `<xsl:stylesheet>` header.
- Target output is always wrapped in `targetNode?.data?.rootTag` — the parser unwraps root tags on the way in.
- Array loops: `collectArrayPaths()` + `inferSourceArrayPath()` emit `xsl:for-each` for paths marked `isArray: true`.
- `alchemize()` is wrapped in try/catch. On throw, `isGenerating` resets and an error comment is written to the output — otherwise "Transmuting…" state gets stuck forever.

### Groovy generator (`utils/codeGenerator.js`)
- Emits `_findByLocal` closure helper for namespace-agnostic field access:
  ```groovy
  def _findByLocal
  _findByLocal = { root, pathList -> /* strips prefix, walks children */ }
  ```
  Every field access uses `(_findByLocal(src, ['Body','Customer','name'])?.text() ?: '')`.
- JSON vs XML target: leaf emission differs — `"key" value` for JSON, `key(value)` for XML. The mock sandbox engine parses these two syntaxes differently; if you unify them output breaks silently.

### Schema parser (`utils/payloadParser.js`, `schemaGenerator.js`)
- Repeated XML siblings are deduped and marked `isArray: true` on the container — otherwise React keys collide on identical sibling names (`Address`, `Address`).
- JSON parser returns `rootTag` from a single top-level key so target XML output can rewrap it.
- `inferType()` detects ISO dates, `HH:MM:SS`, `MM/DD/YYYY`, `DD.MM.YYYY` and tags them as `date`.

### Edges
- `collectHandleIds(tree)` + `syncSourceTree/syncTargetTree` purge stale edges pointing to handles that no longer exist after a schema edit. Without this, deleting a field leaves dangling edges that crash ReactFlow.

### Format conversion
- `setSourceFormat`/`setTargetFormat` skip conversion entirely for `xsd`/`wsdl` (schema formats, no payload to convert). Hitting `convertPayload` with these formats throws.
- `isValidXmlTag` regex allows `:` (namespaced tags).

## Alchopilot (AI command bar)

Pipeline: `AlchopilotCommandBar` → `services/alchopilotService.js::parseCommand` → strict JSON payload → `useAppStore::alchopilotExecute` → nodes/edges.

**Strict JSON contract** (see `services/alchopilotService.js` header):
```js
{
  intent: 'TRANSFORM_MAP' | 'DIRECT_MAP' | 'CONCAT_MAP' | 'CONSTANT_MAP' | 'UNKNOWN',
  sourceIds?: string[],   // dot-paths into source tree
  targetId?: string,      // dot-path into target tree
  transformType?: string, // 'uppercase' | 'concat' | 'formatDate' | ...
  params?: object,        // node-data overrides
  description?: string,
  error?: string
}
```

Current parser is regex-based (mocked LLM). Swap the `parseCommand` body for a real `fetch()` call when replacing with an actual LLM — the executor contract stays the same. **MOCK_LATENCY_MS = 650** in the command bar simulates LLM round-trip; remove when going live.

Executor places new transform nodes at `midX = (sourceX + targetX) / 2`, `baseY = max(existingTransformY) + 120` to avoid overlap. Handles: `in-input` for single-source, `in-a`/`in-b` for concat, `out-result` for all outputs.

## SAP PO integration plan (long-term)

Alchemio's ultimate target is emulating SAP PO graphical mapping semantics in the browser. Detailed plan lives in:

- **Auto-memory:** `project_sap_po_mapping_engine.md` (flib7 catalog + 4-layer runtime + 5-component rewrite plan)
- **Presentation:** `../Alchemio_Integration_Plan.html` (16-section stakeholder deck, 10-week Gantt, risk matrix)

**Key concepts** (read the memory file for details before touching the engine):
- **V2V / Q2Q / C2C** execution models — every function declares one
- **Context Change (CC)** markers — Queue2Queue functions segment their input by these
- **SUPPRESS** — target tree walker skips nodes tagged SUPPRESS (how optional output works)
- Recommended: single-thread sequential (skip SAP's dual-thread streaming)

When the user asks for "context / queue / SAP PO semantics / sum / sortByKey / useOneAsMany / if / splitByValue / formatByExample", open the memory file and map the request to the catalog + 4 layers.

## Gotchas & non-obvious

- **No test framework.** Don't add Jest/Vitest without asking. Manual sandbox testing via `TestSandboxModal` is the current workflow.
- **No TypeScript.** Don't `.tsx`-ify files.
- **OneDrive path.** The project lives under a Turkish-character path (`Masaüstü`). Some tools (Windows `start`, certain browsers) choke on it — when opening HTML artifacts, copy to `C:\Users\MDP\Desktop\` first.
- **Monaco + SOAP envelope hint.** The dashed purple envelope lines are decorative DOM siblings outside Monaco, positioned above/below the editor wrapper. They disappear in Design view (only show when `view === 'code'`).
- **ReactFlow `MarkerType.ArrowClosed`.** Every edge needs it explicitly — `defaultEdgeOptions` sets it, but `onConnect` and `alchopilotExecute` must re-apply via `ARROW_MARKER` const in the store.
- **`TransformNode` data.** Operations: `uppercase`, `lowercase`, `substring`, `formatDate`, `math`, `concat`, `constant`. Defaults live in the store's `addTransformNode` and in `alchopilotExecute`. Keep in sync if adding operations.

## Deploy etiquette

- User says "push and deploy to alchem-io.vercel.app" frequently. Flow:
  1. `git add` specific files (never `-A`)
  2. `git commit` with Co-Authored-By line
  3. `git push origin main`
  4. `vercel --prod --yes`
  5. `vercel alias set <url> alchem-io.vercel.app`
- User said "dont deploy the prod" at least once → honor any ad-hoc block on deploy. Do still `git push` unless told otherwise.
