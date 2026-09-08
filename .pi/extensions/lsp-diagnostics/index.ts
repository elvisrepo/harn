/**
 * LSP diagnostics extension — the article's "Language Servers" guide, wired
 * into pi. Speaks the standard Language Server Protocol (JSON-RPC over stdio)
 * with typescript-language-server; diagnostics are pushed to us via
 * textDocument/publishDiagnostics and appended to edit/write tool results.
 *
 * Behaviour:
 * - edit/write on .ts/.tsx/.js/.jsx/.mjs/.cjs → after the tool result, sync the
 *   file into the server (didOpen/didChange), wait briefly for fresh
 *   diagnostics, and if any exist append a receipt to the tool result
 *   (clean file → silent, like an IDE with no squiggles).
 * - `diagnostics` custom tool — on-demand probe (optional path).
 * - Lazy: the server spawns on first edit, not at session start.
 * - Errors (severity 1) and warnings (2), capped at 10 per receipt.
 * - Failure policy: if the LSP server can't start, stay silent — the
 *   `npm run check` typecheck sensor still covers us at handoff.
 *
 * Protocol notes (learned the hard way — see docs/LSP — review and integration.md):
 * - The server gates diagnostics on the CLIENT capability
 *   `textDocument.publishDiagnostics`; declaring `{}` capabilities means
 *   "nothing" and every push is silently dropped.
 * - v6 has no `--tsserver-path` CLI option — TypeScript is auto-resolved from
 *   the workspace node_modules.
 * - The server may send requests (`workspace/configuration`) — a client that
 *   never answers them can hang the server.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface LspDiagnostic {
	range: { start: { line: number; character: number }; end: { line: number; character: number } };
	message: string;
	code?: string | number;
	severity?: number;
	source?: string;
}

const LANG_ID: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescriptreact",
	".js": "javascript",
	".jsx": "javascriptreact",
	".mjs": "javascript",
	".cjs": "javascript",
};

class LspClient {
	private child: ChildProcess | null = null;
	private buf = Buffer.alloc(0);
	private nextId = 1;
	private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
	private diags = new Map<string, LspDiagnostic[]>(); // uri -> latest push
	private diagEpoch = new Map<string, number>(); // uri -> counter (bumped per push)
	private opened = new Set<string>();
	private fileVersion = new Map<string, number>();
	running = false;

	constructor(private serverCmd: string[], private rootDir: string) {}

	async start(): Promise<void> {
		if (this.child) return;
		const child = spawn(this.serverCmd[0], this.serverCmd.slice(1), {
			cwd: this.rootDir,
			stdio: ["pipe", "pipe", "ignore"],
		});
		this.child = child;
		child.stdout!.on("data", (d: Buffer) => this.onData(d));
		child.on("exit", () => {
			this.child = null;
			this.running = false;
		});
		await this.request(
			"initialize",
			{
				processId: process.pid,
				rootUri: "file://" + this.rootDir,
				capabilities: {
					textDocument: {
						publishDiagnostics: { tagSupport: { valueSet: [1, 2] } }, // ← without this, ALL pushes are silently dropped
						synchronization: { didSave: true },
					},
				},
			},
			15000,
		);
		this.notify("initialized", {});
		this.running = true;
	}

	private onData(d: Buffer) {
		this.buf = Buffer.concat([this.buf, d]);
		for (;;) {
			const sep = this.buf.indexOf("\r\n\r\n");
			if (sep < 0) break;
			const header = this.buf.slice(0, sep).toString("utf8");
			const m = /Content-Length: (\d+)/i.exec(header);
			if (!m) {
				this.buf = this.buf.slice(sep + 4);
				continue;
			}
			const len = parseInt(m[1], 10);
			if (this.buf.length < sep + 4 + len) break;
			const body = this.buf.slice(sep + 4, sep + 4 + len).toString("utf8");
			this.buf = this.buf.slice(sep + 4 + len);
			try {
				this.onMessage(JSON.parse(body));
			} catch {
				/* ignore malformed frame */
			}
		}
	}

	private onMessage(msg: any) {
		// response to our request
		if (msg.id !== undefined && msg.method === undefined) {
			const p = this.pending.get(msg.id);
			if (p) {
				this.pending.delete(msg.id);
				p.resolve(msg.result);
			}
			return;
		}
		// the event stream we're here for
		if (msg.method === "textDocument/publishDiagnostics") {
			const uri: string = msg.params.uri;
			this.diags.set(uri, msg.params.diagnostics ?? []);
			this.diagEpoch.set(uri, (this.diagEpoch.get(uri) ?? 0) + 1);
			return;
		}
		// server -> client request: answer minimally so the server never hangs
		if (msg.id !== undefined && msg.method) {
			this.send({
				jsonrpc: "2.0",
				id: msg.id,
				result:
					msg.method === "workspace/configuration"
						? (msg.params?.items ?? []).map(() => ({}))
						: null,
			});
		}
	}

	private send(obj: unknown) {
		if (!this.child?.stdin) return;
		const body = Buffer.from(JSON.stringify(obj), "utf8");
		this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n${body}`);
	}

	private request(method: string, params: unknown, timeoutMs = 15000): Promise<unknown> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const t = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`LSP request timeout: ${method}`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (v) => {
					clearTimeout(t);
					resolve(v);
				},
				reject,
			});
			this.send({ jsonrpc: "2.0", id, method, params });
		});
	}

	private notify(method: string, params: unknown) {
		this.send({ jsonrpc: "2.0", method, params });
	}

	/** didOpen (first time) or didChange (subsequent); returns the diagnostics epoch before the change */
	async sync(absPath: string, text: string): Promise<number> {
		const uri = "file://" + absPath;
		const before = this.diagEpoch.get(uri) ?? 0;
		const languageId = LANG_ID[path.extname(absPath).toLowerCase()] ?? "plaintext";
		if (!this.opened.has(uri)) {
			this.notify("textDocument/didOpen", {
				textDocument: { uri, languageId, version: 1, text },
			});
			this.opened.add(uri);
		} else {
			const v = (this.fileVersion.get(uri) ?? 1) + 1;
			this.fileVersion.set(uri, v);
			this.notify("textDocument/didChange", {
				textDocument: { uri, version: v },
				contentChanges: [{ text }],
			});
		}
		return before;
	}

	async waitDiagnostics(uri: string, sinceEpoch: number, timeoutMs = 2000): Promise<LspDiagnostic[]> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline && (this.diagEpoch.get(uri) ?? 0) <= sinceEpoch) {
			await new Promise((r) => setTimeout(r, 100));
		}
		return this.diags.get(uri) ?? [];
	}

	forUri(absPath: string): LspDiagnostic[] {
		return this.diags.get("file://" + absPath) ?? [];
	}

	allWithDiagnostics(): { file: string; count: number }[] {
		const out: { file: string; count: number }[] = [];
		for (const [uri, list] of this.diags) {
			if (list.length) out.push({ file: uri.replace("file://", ""), count: list.length });
		}
		return out.sort((a, b) => a.file.localeCompare(b.file));
	}

	stop() {
		if (!this.child) return;
		try {
			this.notify("exit", {});
		} catch {
			/* already gone */
		}
		this.child.kill();
		this.child = null;
		this.running = false;
	}
}

export default function (pi: ExtensionAPI) {
	const rootDir = process.cwd();
	const bin = path.join(rootDir, "node_modules", ".bin", "typescript-language-server");
	const serverCmd = fs.existsSync(bin)
		? [bin, "--stdio"]
		: ["npx", "typescript-language-server", "--stdio"];
	const client = new LspClient(serverCmd, rootDir);
	process.once("exit", () => client.stop());

	const HANDLED = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
	const ensure = async (): Promise<boolean> => {
		try {
			if (!client.running) await client.start();
			return client.running;
		} catch {
			return false; // LSP unavailable → silent; `npm run check` still covers us
		}
	};

	// ---- the guide: diagnostics appended to edit/write results --------------
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const input = (event.input ?? {}) as { path?: string; file_path?: string; filePath?: string };
		const rel = input.path ?? input.file_path ?? input.filePath;
		if (!rel || typeof rel !== "string") return;
		const abs = path.resolve(ctx.cwd, rel);
		if (!HANDLED.test(abs) || !fs.existsSync(abs)) return;
		if (!(await ensure())) return;

		const text = fs.readFileSync(abs, "utf8");
		const before = await client.sync(abs, text);
		const diags = await client.waitDiagnostics("file://" + abs, before, 2000);
		const relevant = diags
			.filter((d) => (d.severity ?? 1) <= 2)
			.sort((a, b) => (a.severity ?? 1) - (b.severity ?? 1) || a.range.start.line - b.range.start.line);
		if (relevant.length === 0) return; // clean → silent (IDE with no squiggles)

		const lines = relevant.slice(0, 10).map((d) => {
			const l = d.range.start.line + 1;
			const c = d.range.start.character + 1;
			return `  ${d.severity === 1 ? "✗" : "⚠"} ${path.basename(abs)}:${l}:${c} — ${d.message}${d.code !== undefined ? ` (${d.code})` : ""}`;
		});
		const more = relevant.length > 10 ? `\n  … +${relevant.length - 10} more (use the diagnostics tool)` : "";
		const note = `\n\n[LSP] ${relevant.length} diagnostic(s) in this file — fix before continuing:\n${lines.join("\n")}${more}`;

		const content = Array.isArray(event.content)
			? [...event.content]
			: [{ type: "text" as const, text: String(event.content ?? "") }];
		const last = content[content.length - 1];
		if (last && (last as { type?: string }).type === "text") {
			content[content.length - 1] = { ...last, text: (last as { text: string }).text + note };
		} else {
			content.push({ type: "text", text: note });
		}
		return { content };
	});

	// ---- the on-demand probe (complement) ------------------------------------
	pi.registerTool({
		name: "diagnostics",
		label: "LSP diagnostics",
		description:
			"Current TypeScript diagnostics from the language server. Optional path filters to one file (syncs it first); without a path, lists all files with diagnostics.",
		parameters: Type.Object({
			path: Type.Optional(Type.String({ description: "File path (optional, relative to cwd)" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!(await ensure())) {
				return {
					content: [{ type: "text", text: "LSP server unavailable — run `npx astro check` for the batch equivalent." }],
					details: {},
				};
			}
			if (params.path) {
				const abs = path.resolve(ctx.cwd, params.path);
				if (!fs.existsSync(abs)) {
					return { content: [{ type: "text", text: `not found: ${params.path}` }], details: {} };
				}
				const before = await client.sync(abs, fs.readFileSync(abs, "utf8"));
				const diags = await client.waitDiagnostics("file://" + abs, before, 2000);
				const body = diags.length
					? diags.map((d) => `  ${abs}:${d.range.start.line + 1}:${d.range.start.character + 1} — ${d.message}`).join("\n")
					: "no diagnostics";
				return { content: [{ type: "text", text: body }], details: {} };
			}
			const all = client.allWithDiagnostics();
			const body = all.length
				? all.map((e) => `  ${e.file} — ${e.count} diagnostic(s)`).join("\n")
				: "no diagnostics anywhere";
			return { content: [{ type: "text", text: body }], details: {} };
		},
	});
}