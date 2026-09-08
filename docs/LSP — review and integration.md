# LSP — review of the protocol, spec 3.18, and typescript-language-server

Sources reviewed (Microsoft LSP docs + the TS server we run):
- Overview: https://microsoft.github.io/language-server-protocol/overviews/lsp/overview/
- Spec 3.18 (current): https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/
- Server repo: https://github.com/typescript-language-server/typescript-language-server
- Context: our `.pi/extensions/lsp-diagnostics/` extension speaks this protocol.

---

## 1. What LSP is

Implementing autocomplete, go-to-definition, hover docs, diagnostics for a
language is a big effort — and historically it had to be **re-implemented for
every development tool** (each editor had different APIs). LSP's idea:
**standardize the protocol** between tools and servers so that:

- a **single language server** can be reused by many tools, and
- a **tool** can support many languages with minimal effort.

"Language-specific smarts live in a server; the tool talks to it over the
protocol." A win for both language providers and tooling vendors.

A deliberately clever design choice: the protocol works at the level of
**document URIs and text positions** — programming-language-neutral types —
*not* ASTs or compiler symbols (which differ per language). That is what makes
standardization tractable.

## 2. The four questions, answered directly

**What is an LSP server?**
A separate process that implements the *server* side of the protocol and holds
the language intelligence. For TypeScript, `typescript-language-server` wraps
`tsserver` — the same language service that powers VS Code. It "knows" types,
signatures, references, and computes diagnostics.

**Where does it run?**
**Locally, on the same machine, as a child process of the client** — spawned by
the client (the development tool), typically **one server per language per
workspace** (the overview's example: a session with Java and SASS files runs
two servers). Ours runs over **stdio** with JSON-RPC messages framed by
`Content-Length` headers (sockets/pipes are alternatives).

**Is there an LSP client?**
Yes — the two roles of the protocol are *client* and *server*. The client is
what LSP docs call the **development tool**: the editor/IDE that integrates
servers (VS Code, Neovim, Emacs…). **In our case pi — via our
`.pi/extensions/lsp-diagnostics/` extension — is the client.** The extension
implements the client subset we need: `initialize` handshake,
`didOpen`/`didChange` document sync, and receiving `publishDiagnostics` pushes.

**What is a development tool?**
LSP's term for the consumer application that embeds language intelligence. It
owns the documents while they're open: *"the truth about the contents of the
document is no longer on the file system but kept by the tool in memory"* — and
it synchronizes contents to the server.

## 3. How a session works (from the overview)

1. **Open a file** → client sends `textDocument/didOpen`; the document now lives
   in memory and must be kept in sync.
2. **Edit** → `textDocument/didChange`; the server re-analyzes and **pushes**
   errors/warnings back via `textDocument/publishDiagnostics`.
3. **Go to definition** → request `textDocument/definition` with
   `{textDocument: {uri}, position: {line, character}}` → response is a
   `{uri, range}` location.
4. **Close** → `textDocument/didClose`; truth returns to the file system.

## 4. Spec 3.18 — the parts that matter to us

### Base protocol
- Every message: **Header part** (`Content-Length: N\r\n\r\n`, optional
  `Content-Type`) + **Content part** (JSON-RPC 2.0).
- Three message kinds: **Request** (id + method), **Response** (id + result or
  error), **Notification** (method, no id). Plus cancellation (`$/cancelRequest`)
  and progress (`$/progress`) support.

### Lifecycle (client owns the server process)
- **`initialize` request is the first message, sent exactly once.** It carries
  `processId`, `rootUri`/`workspaceFolders`, and the **client capabilities**.
- Strict pre-initialize rules (which we observed live): before the server has
  replied with `InitializeResult`, it may only send `window/showMessage`,
  `window/logMessage`, `telemetry/event`, `window/showMessageRequest` — our
  first received message was a `window/logMessage` ("Using Typescript version
  (workspace) 6.0.3…").
- Client must send **`initialized`** notification after the response, then
  normal operation begins.
- **`shutdown` request → `exit` notification** ends the server. Process start/stop
  is the client's responsibility.

### Document synchronization
- `textDocument/didOpen` · `didChange` (versioned) · `didSave` · `didClose`.
- Server declares its sync mode via `textDocumentSync`:
  **None (0) · Full (1) · Incremental (2)** — typescript-language-server
  announces `2` (incremental), but clients may still send full-text changes as a
  single change item (which is what our extension does — we hold the file text).

### Diagnostics
- **Push (3.0+):** `textDocument/publishDiagnostics` — server-initiated,
  per-document **full replacement** of the diagnostic list.
- **Pull (3.17):** `textDocument/diagnostic` request — client polls; a server
  that doesn't support it answers `null` (which is exactly what we saw: our
  pull probe returned `undefined`/null, confirming push-only behavior).
- **Diagnostic object:** `range`, `message`, `severity`, `code`,
  `codeDescription`, `source` (e.g. `'typescript'`), `tags`
  (1 = Unnecessary, 2 = Deprecated), `relatedInformation`.
- **DiagnosticSeverity:** 1 = Error · 2 = Warning · 3 = Information · 4 = Hint.
  (Our extension surfaces severity ≤ 2 and drops hints.)
- 3.18 adds `message: string | MarkupContent` behind the client capability
  `textDocument.diagnostic.markupMessageSupport`.

### Capabilities (the mechanism that bit us)
- Client and server **announce what they support**; the server adapts its
  behavior. Not every server handles every request; not every client must send
  every notification.
- **Live lesson from our integration:** typescript-language-server computes
  `diagnosticsSupport = Boolean(clientCapabilities.textDocument.publishDiagnostics)`.
  We initialized with `capabilities: {}` → the flag was false → the server
  **silently dropped every diagnostic** (no push, no pull, nothing in its level-4
  log — publishing is skipped before any logging). Declaring
  `textDocument.publishDiagnostics: { tagSupport: { valueSet: [1, 2] } }`
  (+ `synchronization.didSave`) fixed it. Lesson: **with LSP, an empty
  capabilities object is not "everything" — it's "nothing".**
- Also: servers may send requests to the client (`workspace/configuration`,
  `client/registerCapability`) — a client must answer them or the server can
  hang (our client answers `workspace/configuration` with defaults).

### What the protocol deliberately does *not* define
The actual integration of a server into a tool (UI, scheduling, lifecycle
UX) is left to the tool implementor — which is why our placement choice
(append diagnostics to `edit`/`write` tool results) is ours to design.

## 5. typescript-language-server — review

- **What it is:** an LSP server wrapping `tsserver` (the language service that
  powers VS Code's TypeScript support). v6.0.0; the README's install line pairs it with
  **`typescript@6`** (matches our devDep; the repo resolved the workspace
  TypeScript automatically: *"Using Typescript version (workspace) 6.0.3 from
  node_modules/typescript/lib/tsserver.js"*).
- **The VS Code nuance (common misconception):** VS Code's built-in TS support
  does **not** speak LSP. It's a first-party extension that runs `tsserver` as a
  child process over TypeScript's **own private JSON protocol** — a richer,
  tighter integration that predates LSP and powers refactorings, auto-imports
  and project-wide features. `typescript-language-server` is the *third-party
  bridge*: it loads the same TypeScript engine and **exposes it as a standard
  LSP server** for editors that only speak LSP (Neovim, Emacs, Zed, pi).
  Historical note: LSP exists largely *because* first-party integrations like
  VS Code ↔ tsserver were too much work to repeat per editor; VS Code remains
  the reference host for *third-party* LSP servers via its
  `vscode-languageclient` library.
- **CLI:** `--stdio` (required), `--log-level <4|3|2|1>`. **No `--tsserver-path`
  option in v6** — passing it makes the server exit at startup (our first
  timeout). TypeScript is resolved from the workspace `node_modules`.
- **Features:** push diagnostics, completion, hover, signature help, definition
  (with links), references, code actions, code lens, inlay hints, rename,
  semantic tokens, formatting settings via workspace configuration.
- **Custom notification:** `$/typescriptVersion` right after initializing —
  reports the TS version in use (we saw `{"version":"6.0.3","source":"workspace"}`).
- **Configuration:** through `workspace/configuration` requests +
  `initializationOptions` (their `docs/configuration.md`).
- **TS pairing note:** the README's recommended install is
  `npm install -g typescript-language-server typescript@6` — TS 7 (native
  compiler) is a separate track; `astro check` has the same constraint
  (`docs/Harness decisions.md` → Language Servers).

### "If we use VS Code, we don't need the LSP" — different consumers

For the **human** in VS Code: true — the built-in TS support (tsserver
integration) already gives you squiggles, hover, refactorings, richer than LSP.
You never needed our extension for yourself.

But the extension was never for you — it's for the **agent**. pi is a terminal
harness: the agent edits files through its `edit`/`write` tools, outside any
editor. VS Code's intelligence is invisible to it — there is no channel from
VS Code's squiggles into the agent's context. Without the extension, the agent
only learns about type errors at `npm run check` (or worse, at runtime), i.e.
*after* it believed it was done — exactly the late feedback the article says to
avoid.

So on a repo where a human works in VS Code **and** the agent works in pi, both
consume the same underlying language service through different transports:

| Consumer | Transport | When |
|---|---|---|
| Human (VS Code) | tsserver private protocol (native) | continuous, while editing |
| Agent (pi) | LSP via our extension → `[LSP]` receipt in the edit's tool result | after each edit, before handoff |

They're complementary, not redundant. And per the article's goal — *reduce
review toil* — the agent-side guide is what removes the human from the loop of
catching type errors the agent already could have known about.

## 6. Our integration, in protocol terms

| Protocol element | Our extension |
|---|---|
| Client | `.pi/extensions/lsp-diagnostics/index.ts` (the "development tool" role) |
| Server | `typescript-language-server --stdio` (lazy-spawned on first edit) |
| Lifecycle | `initialize` (with `textDocument.publishDiagnostics` capability) → `initialized` → … → `exit` on process exit |
| Document sync | `didOpen` on first touch, `didChange` (full text, version++) on edits; files read from disk after the tool result |
| Diagnostics | receive `publishDiagnostics` pushes; per-URI store + epoch counter |
| The guide placement | `tool_result` hook on `edit`/`write`: sync the file, wait ≤2 s for a fresh push, if diagnostics exist (severity ≤ 2, capped at 10) append the receipt to the tool result — **silent when clean** |
| On-demand probe | `diagnostics` custom tool (option A complement) |
| Failure policy | server won't start → stay silent; `npm run check` (`astro check`) remains the batch sensor |

### Lesson: a client-side crash is masked by the silent-when-clean policy

`waitDiagnostics`' return read `this.diagnostics.get(uri)` while the field is
`this.diags` — a `TypeError` on `undefined`, thrown *exactly when a file has
diagnostics*. It surfaced here via the `diagnostics` probe (the raw error
leaks out of the tool call). The `edit`/`write` hook runs the same call, so it
was equally vulnerable — but the failure policy made it invisible: when a
hook crashes, no receipt is appended, which is byte-identical to "file is
clean" (silent-when-clean). A broken integration can look exactly like a
correct one until the probe (or `npm run check`) catches it. Fixed in one
line (`this.diags`); reproduce with a file that has a real type error.

## 7. Mapping to the article

Language Servers are the **computational feedforward guide** (⚙ in Fig 2):
deterministic ground truth steering the agent *before* it writes. The same
engine run at handoff is the sensor — placement decides the role. Our batch
form (`astro check` in `npm run check`) + interactive form (this extension)
together cover both placements.

## 8. Open items

- `.astro` templates: handled by `astro check` at handoff, not in-loop
  (v1). Could attach `@astrojs/language-server` as a second server later.
- Richer client: `hover`/`definition`/`references` could become additional
  agent tools over the same connection (already negotiated capabilities).
- Track pi upstream for native LSP/MCP support.
- Harden the `edit`/`write` hook against client-side crashes: today a throw
  inside the hook is indistinguishable from a clean file (silent-when-clean
  policy). Wrap the sync/wait in a guard that appends a distinct
  `[LSP] diagnostics failed` note (not an error receipt) so the failure class
  above cannot hide again.
- Server config (formatting, preferences) via `workspace/configuration` if we
  ever want formatting-in-loop.