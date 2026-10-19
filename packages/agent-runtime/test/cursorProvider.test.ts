import { describe, it, expect } from "vitest";
import { isTransientCursorError, normalizeCursorToolCall, mapCursorMessage, buildCursorFirstMessage, buildCursorFollowUpMessage, buildCursorSafetyRules, cursorErrorMessage, cursorRecommendationRank, expandCursorModels, addCursorUsage, cursorDiagnostic, createCursorTurnGuard } from "../src/provider/cursorProvider";
import type { SDKMessage } from "@cursor/sdk";

describe("cursorProvider", () => {
	describe("isTransientCursorError", () => {
		it("returns true for fetch failed", () => {
			expect(isTransientCursorError("[unknown] Failed to connect to API key exchange endpoint: fetch failed")).toBe(true);
		});

		it("returns true for ECONNRESET", () => {
			expect(isTransientCursorError("Network request failed: ECONNRESET")).toBe(true);
		});

		it("returns true for ENOTFOUND", () => {
			expect(isTransientCursorError("getaddrinfo ENOTFOUND api.cursor.sh")).toBe(true);
		});

		it("returns true for Connection stalled repeatedly", () => {
			expect(isTransientCursorError("Connection stalled repeatedly")).toBe(true);
		});

		it("returns true for Connection failed repeatedly", () => {
			expect(isTransientCursorError("Connection failed repeatedly")).toBe(true);
		});

		it("returns false for Model not found", () => {
			expect(isTransientCursorError("Model not found")).toBe(false);
		});

		it("returns false for Invalid API key", () => {
			expect(isTransientCursorError("Invalid API key")).toBe(false);
		});
	});

	describe("cursorErrorMessage", () => {
		it("combines message and cause when cause is not already in message", () => {
			const error = {
				message: "Network request failed",
				cause: { message: "Cannot convert argument to a ByteString" }
			};
			expect(cursorErrorMessage(error)).toBe(
				"Network request failed: Cannot convert argument to a ByteString"
			);
		});

		it("returns just the message when there is no cause", () => {
			const error = new Error("Something went wrong");
			expect(cursorErrorMessage(error)).toBe("Something went wrong");
		});

		it("does not duplicate the cause text when it is already in the message", () => {
			const error = {
				message: "Network request failed: Cannot convert argument",
				cause: { message: "Cannot convert argument" }
			};
			expect(cursorErrorMessage(error)).toBe("Network request failed: Cannot convert argument");
		});

		it("handles plain Error objects", () => {
			const error = new Error("test error");
			expect(cursorErrorMessage(error)).toBe("test error");
		});

		it("converts non-Error values to string", () => {
			expect(cursorErrorMessage("string error")).toBe("string error");
			expect(cursorErrorMessage(null)).toBe("null");
			expect(cursorErrorMessage(undefined)).toBe("undefined");
		});

		it("walks nested cause chain", () => {
			const error = {
				message: "Network request failed",
				cause: {
					message: "fetch failed",
					cause: {
						message: "getaddrinfo ENOTFOUND api2.cursor.sh",
						code: "ENOTFOUND"
					}
				}
			};
			expect(cursorErrorMessage(error)).toBe(
				"Network request failed: fetch failed: getaddrinfo ENOTFOUND api2.cursor.sh"
			);
		});

		it("includes code in parentheses when not in message", () => {
			const error = {
				message: "x",
				cause: {
					message: "socket hang up",
					code: "ECONNRESET"
				}
			};
			expect(cursorErrorMessage(error)).toBe("x: socket hang up (ECONNRESET)");
		});
	});

	describe("normalizeCursorToolCall", () => {
		it("maps read tool", () => {
			const result = normalizeCursorToolCall("read", { path: "a/b.json" });
			expect(result.name).toBe("Read");
			expect(result.input.file_path).toBe("a/b.json");
		});

		it("maps write tool", () => {
			const result = normalizeCursorToolCall("write", { path: "x.txt", fileText: "content" });
			expect(result.name).toBe("Write");
			expect(result.input.file_path).toBe("x.txt");
		});

		it("maps edit tool", () => {
			const result = normalizeCursorToolCall("edit", { path: "file.ts" });
			expect(result.name).toBe("Edit");
			expect(result.input.file_path).toBe("file.ts");
		});

		it("maps delete tool", () => {
			const result = normalizeCursorToolCall("delete", { path: "old.js" });
			expect(result.name).toBe("Delete");
			expect(result.input.file_path).toBe("old.js");
		});

		it("maps shell tool with short command", () => {
			const result = normalizeCursorToolCall("shell", { command: "ls -la" });
			expect(result.name).toBe("Bash");
			expect(result.input.command).toBe("ls -la");
			expect(result.input.description).toBe("ls -la");
		});

		it("maps shell tool with long command and truncates description", () => {
			const longCmd = "echo " + "x".repeat(100);
			const result = normalizeCursorToolCall("shell", { command: longCmd });
			expect(result.name).toBe("Bash");
			expect(result.input.command).toBe(longCmd);
			expect((result.input.description as string).length).toBeLessThanOrEqual(81);
			expect((result.input.description as string).endsWith("…")).toBe(true);
		});

		it("maps grep tool", () => {
			const result = normalizeCursorToolCall("grep", { pattern: "test", path: "/src" });
			expect(result.name).toBe("Grep");
			expect(result.input.pattern).toBe("test");
			expect(result.input.path).toBe("/src");
		});

		it("maps glob tool", () => {
			const result = normalizeCursorToolCall("glob", { globPattern: "*.ts", targetDirectory: "/src" });
			expect(result.name).toBe("Glob");
			expect(result.input.pattern).toBe("*.ts");
			expect(result.input.path).toBe("/src");
		});

		it("maps ls tool", () => {
			const result = normalizeCursorToolCall("ls", { path: "/home" });
			expect(result.name).toBe("LS");
			expect(result.input.path).toBe("/home");
		});

		it("maps updateTodos tool", () => {
			const result = normalizeCursorToolCall("updateTodos", {});
			expect(result.name).toBe("TodoWrite");
			expect(result.input).toEqual({});
		});

		it("maps task tool", () => {
			const result = normalizeCursorToolCall("task", { description: "Do something" });
			expect(result.name).toBe("Task");
			expect(result.input.description).toBe("Do something");
		});

		it("passes through unknown tool name", () => {
			const result = normalizeCursorToolCall("unknownTool", { someArg: "value" });
			expect(result.name).toBe("unknownTool");
			expect(result.input.someArg).toBe("value");
		});
	});

	describe("normalizeCursorToolCall (CRM database tool)", () => {
		it("maps a direct crm_db_query custom tool call", () => {
			expect(normalizeCursorToolCall("crm_db_query", { sql: "SELECT 1" })).toEqual({
				name: "crm_db_query",
				input: { sql: "SELECT 1" }
			});
		});

		it("maps an MCP-wrapped call with nested args", () => {
			const result = normalizeCursorToolCall("mcp", { toolName: "crm_db_query", args: { sql: "SELECT 2" } });
			expect(result.name).toBe("crm_db_query");
			expect(result.input.sql).toBe("SELECT 2");
		});

		it("maps an MCP-wrapped call with arguments passed as a JSON string", () => {
			const result = normalizeCursorToolCall("mcp", { toolName: "crm_db_query", arguments: "{\"sql\":\"SELECT 3\"}" });
			expect(result.name).toBe("crm_db_query");
			expect(result.input.sql).toBe("SELECT 3");
		});
	});

	describe("normalizeCursorToolCall (CRM stand tools)", () => {
		it("maps a direct crm_compile custom tool call", () => {
			expect(normalizeCursorToolCall("crm_compile", {})).toEqual({ name: "crm_compile", input: {} });
		});

		it("maps an MCP-wrapped crm_update_from_fs call", () => {
			expect(normalizeCursorToolCall("mcp", { toolName: "crm_update_from_fs", args: {} })).toEqual({
				name: "crm_update_from_fs",
				input: {}
			});
		});
	});

	describe("normalizeCursorToolCall (CRM browser tools)", () => {
		it("maps a direct crm_browser_open custom tool call", () => {
			expect(normalizeCursorToolCall("crm_browser_open", { path: "/x" })).toEqual({
				name: "crm_browser_open",
				input: { path: "/x" }
			});
		});

		it("maps an MCP-wrapped crm_browser_text call with nested args", () => {
			expect(normalizeCursorToolCall("mcp", { toolName: "crm_browser_text", args: { selector: "h1" } })).toEqual({
				name: "crm_browser_text",
				input: { selector: "h1" }
			});
		});
	});

	describe("normalizeCursorToolCall (pkg lint tool)", () => {
		it("maps an MCP-wrapped pkg_lint call with nested args", () => {
			const result = normalizeCursorToolCall("mcp", { providerIdentifier: "custom-user-tools", toolName: "pkg_lint", args: { schema: "TestA" } });
			expect(result.name).toBe("pkg_lint");
			expect(result.input.schema).toBe("TestA");
		});

		it("maps a direct pkg_lint custom tool call", () => {
			expect(normalizeCursorToolCall("pkg_lint", {})).toEqual({ name: "pkg_lint", input: {} });
		});
	});

	describe("normalizeCursorToolCall (local tools)", () => {
		it("maps a direct read_file call to Read", () => {
			expect(normalizeCursorToolCall("read_file", { path: "/a/b.json" })).toEqual({
				name: "Read",
				input: { file_path: "/a/b.json" }
			});
		});

		it("maps a direct run_shell call to Bash with the command", () => {
			const result = normalizeCursorToolCall("run_shell", { command: "date +%s000" });
			expect(result.name).toBe("Bash");
			expect(result.input.command).toBe("date +%s000");
		});

		it("maps an MCP-wrapped edit_file call with nested args", () => {
			expect(normalizeCursorToolCall("mcp", { toolName: "edit_file", args: { path: "/x" } })).toEqual({
				name: "Edit",
				input: { file_path: "/x" }
			});
		});

		it("maps an MCP-wrapped grep_files call with arguments as a JSON string", () => {
			const result = normalizeCursorToolCall("mcp", { name: "grep_files", arguments: JSON.stringify({ pattern: "Foo", path: "/p" }) });
			expect(result.name).toBe("Grep");
			expect(result.input.pattern).toBe("Foo");
			expect(result.input.path).toBe("/p");
		});
	});

	describe("mapCursorMessage", () => {
		const seenCalls = new Set<string>();

		it("maps assistant message with single text block", () => {
			const message: SDKMessage = {
				type: "assistant",
				message: { content: [{ type: "text", text: "Hello" }] }
			} as never;
			const events = mapCursorMessage(message, seenCalls);
			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({ type: "text", text: "Hello" });
		});

		it("maps assistant message with two text blocks and joins them", () => {
			const message: SDKMessage = {
				type: "assistant",
				message: { content: [{ type: "text", text: "Hello " }, { type: "text", text: "World" }] }
			} as never;
			const events = mapCursorMessage(message, seenCalls);
			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({ type: "text", text: "Hello World" });
		});

		it("returns empty array for assistant with only tool_use block", () => {
			const message: SDKMessage = {
				type: "assistant",
				message: { content: [{ type: "tool_use" as any, id: "123", name: "read", input: {} }] }
			} as never;
			const events = mapCursorMessage(message, seenCalls);
			expect(events).toEqual([]);
		});

		it("maps tool_call in running state to tool_use event", () => {
			const callId = "call_123";
			const seenCallsLocal = new Set<string>();
			const message: SDKMessage = {
				type: "tool_call",
				call_id: callId,
				name: "read",
				status: "running",
				args: { path: "file.txt" }
			} as never;
			const events = mapCursorMessage(message, seenCallsLocal);
			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({ type: "tool_use", name: "Read", input: { file_path: "file.txt" } });
			expect(seenCallsLocal.has(callId)).toBe(true);
		});

		it("maps tool_call completed to tool_use and tool_result", () => {
			const callId = "call_456";
			const seenCallsLocal = new Set<string>();
			const message: SDKMessage = {
				type: "tool_call",
				call_id: callId,
				name: "read",
				status: "completed",
				args: { path: "file.txt" },
				result: "file content"
			} as never;
			const events = mapCursorMessage(message, seenCallsLocal);
			expect(events).toHaveLength(2);
			expect(events[0]).toEqual({ type: "tool_use", name: "Read", input: { file_path: "file.txt" } });
			expect(events[1].type).toBe("other");
			const otherEvent = events[1];
			expect((otherEvent as any).raw.type).toBe("user");
			expect((otherEvent as any).raw.message.content[0]).toEqual({
				type: "tool_result",
				tool_use_id: callId,
				is_error: false,
				content: "file content"
			});
		});

		it("maps tool_call with error status", () => {
			const callId = "call_789";
			const seenCallsLocal = new Set<string>();
			const message: SDKMessage = {
				type: "tool_call",
				call_id: callId,
				name: "read",
				status: "error",
				args: { path: "missing.txt" },
				result: { error: "File not found" }
			} as never;
			const events = mapCursorMessage(message, seenCallsLocal);
			expect(events).toHaveLength(2);
			const otherEvent = events[1];
			expect((otherEvent as any).raw.message.content[0].is_error).toBe(true);
		});

		it("does not emit duplicate tool_use for already seen call_id", () => {
			const callId = "call_dup";
			const seenCallsLocal = new Set<string>();
			seenCallsLocal.add(callId);
			const message: SDKMessage = {
				type: "tool_call",
				call_id: callId,
				name: "read",
				status: "completed",
				args: { path: "file.txt" },
				result: "content"
			} as never;
			const events = mapCursorMessage(message, seenCallsLocal);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("other");
		});

		it("returns empty array for thinking message", () => {
			const message: SDKMessage = { type: "thinking", text: "thinking..." } as never;
			const events = mapCursorMessage(message, seenCalls);
			expect(events).toEqual([]);
		});

		it("returns empty array for user message", () => {
			const message: SDKMessage = { type: "user" } as never;
			const events = mapCursorMessage(message, seenCalls);
			expect(events).toEqual([]);
		});

		it("returns empty array for system message", () => {
			const message: SDKMessage = { type: "system" } as never;
			const events = mapCursorMessage(message, seenCalls);
			expect(events).toEqual([]);
		});

		it("returns other event for status message", () => {
			const message: SDKMessage = { type: "status", status: "processing", message: "Working..." } as never;
			const events = mapCursorMessage(message, seenCalls);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("other");
		});
	});

	describe("buildCursorFirstMessage", () => {
		it("wraps system prompt and safety rules in instructions tags", () => {
			const systemPrompt = "You are a helper.";
			const safetyRules = "Follow the rules.";
			const userPrompt = "Do something.";

			const result = buildCursorFirstMessage(systemPrompt, safetyRules, userPrompt);

			expect(result).toContain("<instructions>");
			expect(result).toContain("</instructions>");
			expect(result).toContain(systemPrompt);
			expect(result).toContain(safetyRules);
			expect(result).toContain(userPrompt);
			expect(result.indexOf(userPrompt)).toBeGreaterThan(result.indexOf("</instructions>"));
		});
	});

	describe("buildCursorFollowUpMessage", () => {
		it("prefixes the user's text with the workflow reminder", () => {
			const result = buildCursorFollowUpMessage("Сделай метод");

			expect(result.startsWith("<reminder>")).toBe(true);
			expect(result).toContain("не подтверждение плана");
			expect(result.endsWith("\n\nСделай метод")).toBe(true);
			expect(result).not.toContain("<instructions>");
		});

		it("asks for plan confirmation with choices", () => {
			const result = buildCursorFollowUpMessage("x");

			expect(result).toContain("Подтверждаете план?");
		});
	});

	describe("buildCursorSafetyRules", () => {
		it("forbids silently skipping data anomalies", () => {
			expect(buildCursorSafetyRules("/app", "/app/Pkg", "/kn")).toContain("молча пропускать находку нельзя");
		});

		it("contains all three path arguments", () => {
			const readRoot = "/path/to/read";
			const writeRoot = "/path/to/write";
			const knowledgeDir = "/path/to/knowledge";

			const result = buildCursorSafetyRules(readRoot, writeRoot, knowledgeDir);

			expect(result).toContain(readRoot);
			expect(result).toContain(writeRoot);
			expect(result).toContain(knowledgeDir);
		});

		it("contains restrictions on destructive git operations", () => {
			const result = buildCursorSafetyRules("/read", "/write", "/knowledge");

			expect(result).toContain("checkout");
			expect(result).toContain("reset");
			expect(result).toContain("git");
		});

		it("contains work order and package selection requirements", () => {
			const result = buildCursorSafetyRules("/app", "/app/Pkg", "/kn");

			expect(result).toContain("сначала спроси, в каком пакете работать");
			expect(result).toContain("остановка до подтверждения");
		});

		it("names the local tools that replace Cursor's built-in ones", () => {
			const result = buildCursorSafetyRules("/app", "/app/Pkg", "/kn");

			expect(result).toContain("read_file");
			expect(result).toContain("edit_file");
			expect(result).toContain("run_shell");
		});

		it("tells the agent to edit only with write_file and edit_file, not python or sed", () => {
			const result = buildCursorSafetyRules("/app", "/app/Pkg", "/kn");

			expect(result).toContain("write_file и edit_file");
			expect(result).toContain("python");
			expect(result).toContain("не python");
		});

		it("requires a plan message to end with a choices block asking for confirmation", () => {
			const result = buildCursorSafetyRules("/app", "/app/Pkg", "/kn");

			expect(result).toContain("Подтверждаете план?");
		});

		it("requires a question before deleting or mass-changing data, even for obvious duplicates", () => {
			const result = buildCursorSafetyRules("/app", "/app/Pkg", "/kn");

			expect(result).toContain("даже если это очевидные дубли");
		});

		it("contains read, write and knowledge paths and no Delete instruction", () => {
			const result = buildCursorSafetyRules("/app", "/app/Pkg", "/kn");

			expect(result).toContain("/app");
			expect(result).toContain("/app/Pkg");
			expect(result).toContain("/kn");
			expect(result).not.toContain("Delete");
		});
	});

	describe("cursorRecommendationRank", () => {
		it("ranks claude-opus-5.5 at position 0", () => {
			expect(cursorRecommendationRank("claude-opus-5.5 Claude Opus 5.5")).toBe(0);
		});

		it("ranks gpt-5.6-sol at position 2", () => {
			expect(cursorRecommendationRank("gpt-5.6-sol GPT-5.6 Sol")).toBe(2);
		});

		it("ranks composer-2.5-fast at position 6", () => {
			expect(cursorRecommendationRank("composer-2.5-fast Composer 2.5 (Fast)")).toBe(6);
		});

		it("returns -1 for gpt-4o (not recommended)", () => {
			expect(cursorRecommendationRank("gpt-4o GPT-4o")).toBe(-1);
		});
	});

	describe("expandCursorModels", () => {
		it("returns models in recommended order first, then others", () => {
			const input = [
				{ id: "gpt-4o", displayName: "GPT-4o" },
				{ id: "composer-2.5", displayName: "Composer 2.5" },
				{ id: "claude-opus-5.5", displayName: "Claude Opus 5.5" }
			];
			const result = expandCursorModels(input);
			const names = result.map((opt) => opt.name);
			expect(names).toEqual(["Claude Opus 5.5", "Composer 2.5", "GPT-4o"]);
		});

		it("expands non-default variants as separate options", () => {
			const input = [
				{
					id: "claude-opus-5.5",
					displayName: "Claude Opus 5.5",
					variants: [
						{ params: [], displayName: "Default", isDefault: true },
						{ params: [{ id: "thinking", value: "high" }], displayName: "Thinking" }
					]
				}
			];
			const result = expandCursorModels(input);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ id: "claude-opus-5.5", name: "Claude Opus 5.5", recommended: true });
			expect(result[1]).toEqual({
				id: "claude-opus-5.5",
				name: "Claude Opus 5.5 · Thinking",
				params: [{ id: "thinking", value: "high" }],
				recommended: true
			});
		});

		it("skips default variants and variants with no params", () => {
			const input = [
				{
					id: "test-model",
					displayName: "Test Model",
					variants: [
						{ params: [], displayName: "Empty", isDefault: false },
						{ params: [], displayName: "Default", isDefault: true }
					]
				}
			];
			const result = expandCursorModels(input);
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("Test Model");
		});

		it("uses variant displayName as-is if it already contains the model name", () => {
			const input = [
				{
					id: "claude-opus-5.5",
					displayName: "Claude Opus 5.5",
					variants: [
						{ params: [{ id: "mode", value: "max" }], displayName: "Claude Opus 5.5 Max" }
					]
				}
			];
			const result = expandCursorModels(input);
			expect(result).toHaveLength(2);
			expect(result[1].name).toBe("Claude Opus 5.5 Max");
		});

		it("marks recommended models correctly", () => {
			const input = [
				{ id: "gpt-4o", displayName: "GPT-4o" },
				{ id: "claude-opus-5.5", displayName: "Claude Opus 5.5" }
			];
			const result = expandCursorModels(input);
			const opus = result.find((opt) => opt.name === "Claude Opus 5.5");
			const gpt4o = result.find((opt) => opt.name === "GPT-4o");
			expect(opus?.recommended).toBe(true);
			expect(gpt4o?.recommended).toBe(false);
		});

		it("uses parameter displayNames when variant displayName equals model name", () => {
			const input = [
				{
					id: "claude-opus-5.5",
					displayName: "Claude Opus 5.5",
					parameters: [
						{ id: "effort", displayName: "Effort", values: [{ value: "high", displayName: "High" }, { value: "low", displayName: "Low" }] },
						{ id: "context", displayName: "Context", values: [{ value: "1m", displayName: "1M" }] }
					],
					variants: [
						{ params: [{ id: "effort", value: "high" }], displayName: "Claude Opus 5.5" },
						{ params: [{ id: "effort", value: "low" }, { id: "context", value: "1m" }], displayName: "Claude Opus 5.5" }
					]
				}
			];
			const result = expandCursorModels(input);
			const names = result.map((opt) => opt.name);
			expect(names).toContain("Claude Opus 5.5");
			expect(names).toContain("Claude Opus 5.5 · High");
			expect(names).toContain("Claude Opus 5.5 · Low · 1M");
		});

		it("handles params without displayName definitions", () => {
			const input = [
				{
					id: "test-model",
					displayName: "Test Model",
					variants: [
						{ params: [{ id: "effort", value: "max" }], displayName: "Test Model" }
					]
				}
			];
			const result = expandCursorModels(input);
			expect(result).toHaveLength(2);
			expect(result[1].name).toBe("Test Model · effort: max");
		});

		it("applies params suffix to duplicate names that don't get unique via describeVariantParams", () => {
			const input = [
				{
					id: "model-a",
					displayName: "Model A",
					variants: [
						{ params: [{ id: "effort", value: "high" }], displayName: "Extended" },
						{ params: [{ id: "effort", value: "low" }], displayName: "Extended" }
					]
				}
			];
			const result = expandCursorModels(input);
			const names = result.map((opt) => opt.name);
			// Both variants produce "Model A · Extended" initially, then suffix is added to duplicates
			expect(names[0]).toBe("Model A");
			expect(names[1]).toBe("Model A · Extended");
			expect(names[2]).toContain("Model A · Extended (effort=");
			// All names should be unique
			const uniqueNames = new Set(names);
			expect(uniqueNames.size).toBe(names.length);
		});

		it("when displayName equals model name, uses describeVariantParams for unique names", () => {
			const input = [
				{
					id: "model-a",
					displayName: "Custom Variant",
					variants: [
						{ params: [{ id: "effort", value: "high" }], displayName: "Custom Variant" },
						{ params: [{ id: "effort", value: "low" }], displayName: "Custom Variant" }
					]
				}
			];
			const result = expandCursorModels(input);
			const names = result.map((opt) => opt.name);
			// When displayName equals model name, describeVariantParams creates unique names
			expect(names[0]).toBe("Custom Variant");
			expect(names[1]).toBe("Custom Variant · effort: high");
			expect(names[2]).toBe("Custom Variant · effort: low");
			// All names should be unique
			const uniqueNames = new Set(names);
			expect(uniqueNames.size).toBe(names.length);
		});

		it("removes exact duplicate options (same params in same order)", () => {
			const input = [
				{
					id: "model-a",
					displayName: "Model A",
					variants: [
						{ params: [{ id: "effort", value: "high" }], displayName: "Variant 1" },
						{ params: [{ id: "effort", value: "high" }], displayName: "Variant 2" } // exact duplicate params
					]
				}
			];
			const result = expandCursorModels(input);
			// Should be: default + only one variant (the first duplicate is kept)
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("Model A");
			expect(result[1].name).toBe("Model A · Variant 1");
		});

		it("ensures all names in result are unique", () => {
			const input = [
				{
					id: "claude-opus-5.5",
					displayName: "Claude Opus 5.5",
					parameters: [
						{ id: "effort", displayName: "Effort", values: [{ value: "high", displayName: "High" }] },
						{ id: "context", displayName: "Context", values: [{ value: "1m", displayName: "1M" }] }
					],
					variants: [
						{ params: [{ id: "effort", value: "high" }], displayName: "Claude Opus 5.5" },
						{ params: [{ id: "effort", value: "high" }], displayName: "Different Name" },
						{ params: [{ id: "context", value: "1m" }], displayName: "Claude Opus 5.5" }
					]
				}
			];
			const result = expandCursorModels(input);
			const names = result.map((opt) => opt.name);
			const uniqueNames = new Set(names);
			expect(uniqueNames.size).toBe(names.length);
		});

		it("preserves variant displayName if it contains model name", () => {
			const input = [
				{
					id: "claude-opus-5.5",
					displayName: "Claude Opus 5.5",
					variants: [
						{ params: [{ id: "mode", value: "extended" }], displayName: "Claude Opus 5.5 Extended" }
					]
				}
			];
			const result = expandCursorModels(input);
			expect(result).toHaveLength(2);
			expect(result[1].name).toBe("Claude Opus 5.5 Extended");
		});
	});

	describe("addCursorUsage", () => {
		it("sums usage messages of one turn", () => {
			const first = { type: "usage", agent_id: "a", run_id: "r1", usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50, cacheWriteTokens: 5 } };
			const second = { type: "usage", agent_id: "a", run_id: "r2", usage: { inputTokens: 200, outputTokens: 20, cacheReadTokens: 0 } };
			const total = addCursorUsage(addCursorUsage(undefined, first), second);
			expect(total).toEqual({ inputTokens: 300, outputTokens: 30, cacheReadTokens: 50, cacheWriteTokens: 5 });
		});

		it("ignores messages that are not usage", () => {
			const total = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 };
			expect(addCursorUsage(total, { type: "assistant", message: { content: [] } })).toEqual(total);
			expect(addCursorUsage(undefined, { type: "thinking" })).toBeUndefined();
		});

		it("maps a usage message to no events", () => {
			const message = { type: "usage", agent_id: "a", run_id: "r", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } } as unknown as SDKMessage;
			expect(mapCursorMessage(message, new Set())).toEqual([]);
		});
	});

	describe("createCursorTurnGuard", () => {
		const msg = (type: string) => ({ type, agent_id: "a", run_id: "r" }) as unknown as SDKMessage;

		it("does not flag assistant messages before usage", () => {
			const guard = createCursorTurnGuard();
			expect(guard.restarted(msg("assistant"))).toBe(false);
		});

		it("does not flag the usage message itself", () => {
			const guard = createCursorTurnGuard();
			expect(guard.restarted(msg("usage"))).toBe(false);
		});

		it("flags assistant messages after usage", () => {
			const guard = createCursorTurnGuard();
			guard.restarted(msg("usage"));
			expect(guard.restarted(msg("assistant"))).toBe(true);
		});

		it("flags tool_call messages after usage", () => {
			const guard = createCursorTurnGuard();
			guard.restarted(msg("usage"));
			expect(guard.restarted(msg("tool_call"))).toBe(true);
		});

		it("does not flag status messages after usage", () => {
			const guard = createCursorTurnGuard();
			guard.restarted(msg("usage"));
			expect(guard.restarted(msg("status"))).toBe(false);
		});

		it("does not carry state into a fresh guard", () => {
			const first = createCursorTurnGuard();
			first.restarted(msg("usage"));
			const fresh = createCursorTurnGuard();
			expect(fresh.restarted(msg("assistant"))).toBe(false);
		});
	});

	describe("cursorDiagnostic", () => {
		it("maps a usage message to a cursor_sdk diagnostic", () => {
			const usage = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 };
			const message = { type: "usage", agent_id: "a", run_id: "r", usage } as unknown as SDKMessage;
			expect(cursorDiagnostic(message)).toEqual({ type: "other", raw: { type: "cursor_sdk", sdkType: "usage", run_id: "r", usage } });
		});

		it("clips long user text to 500 characters plus an ellipsis", () => {
			const message = { type: "user", run_id: "r", message: { content: [{ type: "text", text: "x".repeat(1000) }] } } as unknown as SDKMessage;
			const event = cursorDiagnostic(message);
			expect(event?.type).toBe("other");
			const text = (event as { raw: { text: string } }).raw.text;
			expect(text).toHaveLength(501);
			expect(text.endsWith("…")).toBe(true);
		});

		it("returns undefined for assistant messages", () => {
			const message = { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } } as unknown as SDKMessage;
			expect(cursorDiagnostic(message)).toBeUndefined();
		});

		it("returns undefined for tool_call messages", () => {
			const message = { type: "tool_call", call_id: "c", name: "read", status: "running" } as unknown as SDKMessage;
			expect(cursorDiagnostic(message)).toBeUndefined();
		});
	});
});
