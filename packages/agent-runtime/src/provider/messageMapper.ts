import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface AgentTextEvent {
	type: "text";
	text: string;
}

export interface AgentToolUseEvent {
	type: "tool_use";
	name: string;
	input: unknown;
}

export interface AgentResultEvent {
	type: "result";
	success: boolean;
	durationMs: number;
	/** SDK session id — pass back as `resume` to continue the conversation. */
	sessionId?: string;
	/** Total API cost of the turn, USD. */
	totalCostUsd?: number;
	/** Number of model turns in this query. */
	numTurns?: number;
}

export interface AgentSystemInitEvent {
	type: "system_init";
	model: string;
	mcpServers: Array<{ name: string; status: string }>;
	/** SDK session id — pass back as `resume` to continue the conversation. */
	sessionId?: string;
}

export interface AgentOtherEvent {
	type: "other";
	raw: unknown;
}

export type AgentEvent =
	| AgentTextEvent
	| AgentToolUseEvent
	| AgentResultEvent
	| AgentSystemInitEvent
	| AgentOtherEvent;

/**
 * Maps one raw Claude Agent SDK `SDKMessage` (a large, ~25-member union) into
 * our own small `AgentEvent` shape. Only the three message kinds we actually
 * need for a first UI are handled structurally (`assistant` text/tool_use,
 * `result`, `system`/`init`); everything else passes through as `other` so
 * callers never crash on an unhandled variant, they just don't get a
 * simplified view of it yet.
 */
export function mapSdkMessage(message: SDKMessage): AgentEvent {
	if (message.type === "assistant") {
		const content = message.message.content as any[];
		const textBlocks = content.filter((block) => block.type === "text");
		if (textBlocks.length > 0) {
			return { type: "text", text: textBlocks.map((block: any) => block.text).join("") };
		}
		const toolUseBlock = content.find((block) => block.type === "tool_use");
		if (toolUseBlock) {
			return { type: "tool_use", name: (toolUseBlock as any).name, input: (toolUseBlock as any).input };
		}
		return { type: "other", raw: message };
	}

	if (message.type === "result") {
		return {
			type: "result",
			success: message.subtype === "success",
			durationMs: message.duration_ms,
			sessionId: message.session_id,
			totalCostUsd: message.total_cost_usd,
			numTurns: message.num_turns
		};
	}

	if (message.type === "system" && message.subtype === "init") {
		return {
			type: "system_init",
			model: message.model,
			mcpServers: message.mcp_servers.map((server) => ({ name: server.name, status: server.status })),
			sessionId: message.session_id
		};
	}

	return { type: "other", raw: message };
}
