import * as path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBpmsoftMcpServer } from "./bpmsoftMcpServer";
import { readStandConfig } from "./standConfig";

/** Entry of the bpmsoft-mcp.js bundle: stand root from --root, CLAUDE_PROJECT_DIR or the current folder. */
const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = path.resolve(rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1] : process.env.CLAUDE_PROJECT_DIR || process.cwd());
const read = readStandConfig(root);
if ("error" in read) {
	process.stderr.write(`${read.error}\n`);
}
const server = createBpmsoftMcpServer({ root, knowledgeDir: path.join(__dirname, ".."), config: "error" in read ? { version: 1 } : read });
server.connect(new StdioServerTransport()).catch((e: unknown) => {
	process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
	process.exit(1);
});
