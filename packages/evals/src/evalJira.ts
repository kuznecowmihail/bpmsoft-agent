import type { JiraConnection } from "@bpmsoft-agent/agent-runtime";

/** Base URL of the fake Jira of the eval runner. */
export const EVAL_JIRA_URL = "https://jira.eval.test";

/** Jira of a case: issues by key in REST API v2 shape ({ fields: { summary, description, comment, … } }). */
export interface EvalJiraSetup {
	issues: Record<string, unknown>;
}

/** Comment the agent added through jira_add_comment. */
export interface EvalJiraComment { key: string; body: string }

/** Fake Jira: connection for the tracker tools, fetch that serves the case issues, comments posted. */
export interface EvalJira {
	connection: JiraConnection;
	fetchImpl: typeof fetch;
	comments: EvalJiraComment[];
}

const ISSUE_PATH = /^\/rest\/api\/2\/issue\/([^/]+)(\/remotelink|\/comment)?$/;

function jsonResponse(status: number, data: unknown): Promise<Response> {
	return Promise.resolve(
		new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
	);
}

/** Makes a fake Jira over the case issues: GET issue, GET remotelink ([]), POST comment; anything else is 404. */
export function createEvalJira(setup: EvalJiraSetup): EvalJira {
	const comments: EvalJiraComment[] = [];
	const notFound = (): Promise<Response> => jsonResponse(404, { errorMessages: ["Issue Does Not Exist"] });
	const fetchImpl = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
		const method = (init?.method ?? "GET").toUpperCase();
		const m = ISSUE_PATH.exec(url.pathname);
		if (!m) {
			return notFound();
		}
		const key = decodeURIComponent(m[1]).toUpperCase();
		const issue = setup.issues[key];
		if (issue === undefined) {
			return notFound();
		}
		const suffix = m[2] ?? "";
		if (method === "GET" && suffix === "") {
			return jsonResponse(200, { ...(issue as object), key });
		}
		if (method === "GET" && suffix === "/remotelink") {
			return jsonResponse(200, []);
		}
		if (method === "POST" && suffix === "/comment") {
			const body = JSON.parse(String(init?.body ?? "{}")).body as string;
			comments.push({ key, body });
			return jsonResponse(201, { id: String(comments.length) });
		}
		return notFound();
	};
	return {
		connection: { url: EVAL_JIRA_URL, token: "eval-token" },
		fetchImpl: fetchImpl as typeof fetch,
		comments,
	};
}
