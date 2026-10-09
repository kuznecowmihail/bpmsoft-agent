import { describe, it, expect } from "vitest";
import { mapSdkMessage } from "../src/provider/messageMapper";

describe("mapSdkMessage", () => {
	it("maps an assistant message with a text block to a text event", () => {
		const fakeMessage = {
			type: "assistant",
			message: {
				content: [{ type: "text", text: "Привет, чем помочь?" }]
			}
		} as any;
		const event = mapSdkMessage(fakeMessage);
		expect(event).toEqual({ type: "text", text: "Привет, чем помочь?" });
	});

	it("joins multiple text blocks in one assistant message", () => {
		const fakeMessage = {
			type: "assistant",
			message: {
				content: [
					{ type: "text", text: "Часть 1. " },
					{ type: "text", text: "Часть 2." }
				]
			}
		} as any;
		const event = mapSdkMessage(fakeMessage);
		expect(event).toEqual({ type: "text", text: "Часть 1. Часть 2." });
	});

	it("maps an assistant message with a tool_use block (no text) to a tool_use event", () => {
		const fakeMessage = {
			type: "assistant",
			message: {
				content: [{ type: "tool_use", name: "bpm_get_client_unit_schema", input: { schemaUId: "abc" } }]
			}
		} as any;
		const event = mapSdkMessage(fakeMessage);
		expect(event).toEqual({
			type: "tool_use",
			name: "bpm_get_client_unit_schema",
			input: { schemaUId: "abc" }
		});
	});

	it("maps a successful result message", () => {
		const fakeMessage = {
			type: "result",
			subtype: "success",
			duration_ms: 1234,
			session_id: "sess-1",
			total_cost_usd: 0.12,
			num_turns: 3
		} as any;
		const event = mapSdkMessage(fakeMessage);
		expect(event).toEqual({ type: "result", success: true, durationMs: 1234, sessionId: "sess-1", totalCostUsd: 0.12, numTurns: 3 });
	});

	it("maps a failed result message", () => {
		const fakeMessage = {
			type: "result",
			subtype: "error_max_turns",
			duration_ms: 500,
			total_cost_usd: 0.05,
			num_turns: 1
		} as any;
		const event = mapSdkMessage(fakeMessage);
		expect(event).toEqual({ type: "result", success: false, durationMs: 500, totalCostUsd: 0.05, numTurns: 1 });
	});

	it("maps a system init message", () => {
		const fakeMessage = {
			type: "system",
			subtype: "init",
			model: "claude-sonnet-5",
			mcp_servers: [{ name: "bpmsoft-designer", status: "connected" }],
			session_id: "sess-1"
		} as any;
		const event = mapSdkMessage(fakeMessage);
		expect(event).toEqual({
			type: "system_init",
			model: "claude-sonnet-5",
			mcpServers: [{ name: "bpmsoft-designer", status: "connected" }],
			sessionId: "sess-1"
		});
	});

	it("passes an unrecognized message type through as 'other'", () => {
		const fakeMessage = { type: "thinking_tokens_something_unhandled", foo: "bar" } as any;
		const event = mapSdkMessage(fakeMessage);
		expect(event).toEqual({ type: "other", raw: fakeMessage });
	});
});
