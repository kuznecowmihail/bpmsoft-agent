import { runCrmCli } from "./crmCli";

/** Entry of the standalone crm.js bundle. Progress lines (browser-login) are written at once, before the wait. */
runCrmCli(process.argv.slice(2), process.env, {
	cwd: process.cwd(),
	scriptDir: __dirname,
	log: (line) => {
		process.stdout.write(line + "\n");
	},
}).then((result) => {
	process.stdout.write(result.text + "\n");
	process.exitCode = result.code;
});
