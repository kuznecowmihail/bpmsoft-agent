import * as path from "path";
import { runPkgLintCli } from "./pkgLintCli";

/** Entry of the standalone pkg-lint.js bundle. */
const result = runPkgLintCli(process.argv.slice(2), path.join(__dirname, ".."));
process.stdout.write(result.text + "\n");
process.exitCode = result.code;
