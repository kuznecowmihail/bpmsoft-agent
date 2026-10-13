import * as fs from "fs";
import * as path from "path";

export interface LogMark { appRoot: string; name: string; dateFolder: string; size: number }

const MAX_EXTRACT_CHARS = 4000;
const STACK_LINES_PER_EXCEPTION = 12;
const PACKAGE_BLOCK_START = "--> PackageInstallUtilities.LoadPackagesToDB";
const PACKAGE_BLOCK_END = "<-- PackageInstallUtilities.LoadPackagesToDB";
const BUILD_ERROR_LINE = /\berror [A-Z]+\d+:/;
const BUILD_MARKER = /Build (FAILED|succeeded)\./;
const CAPTURE_PREFIX = "CaptureOutput - ";

export function utcDateFolder(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function logFile(appRoot: string, dateFolder: string, name: string): string {
	return path.join(appRoot, "Logs", dateFolder, name);
}

function fileSize(file: string): number {
	try {
		return fs.statSync(file).size;
	} catch {
		return 0;
	}
}

/** Text from the offset to the end of the file (whole file when it became shorter); "" when missing. */
function readFrom(file: string, offset: number): string {
	let fd: number | undefined;
	try {
		const size = fs.statSync(file).size;
		const start = size < offset ? 0 : offset;
		const length = size - start;
		if (length <= 0) {
			return "";
		}
		const buffer = Buffer.alloc(length);
		fd = fs.openSync(file, "r");
		const read = fs.readSync(fd, buffer, 0, length, start);
		return buffer.subarray(0, read).toString("utf8");
	} catch {
		return "";
	} finally {
		if (fd !== undefined) {
			fs.closeSync(fd);
		}
	}
}

/** Remembers the current size of <appRoot>/Logs/<UTC date>/<name> (0 when missing). */
export function markLog(appRoot: string, name: string, now: Date = new Date()): LogMark {
	const dateFolder = utcDateFolder(now);
	return { appRoot, name, dateFolder, size: fileSize(logFile(appRoot, dateFolder, name)) };
}

/** Text appended since the mark; when the UTC date changed, plus the whole file of the new date folder. */
export function readSince(mark: LogMark, now: Date = new Date()): string {
	const currentFolder = utcDateFolder(now);
	const before = readFrom(logFile(mark.appRoot, mark.dateFolder, mark.name), mark.size);
	if (currentFolder === mark.dateFolder) {
		return before;
	}
	const after = readFrom(logFile(mark.appRoot, currentFolder, mark.name), 0);
	return [before, after].filter((part) => part !== "").join("\n");
}

/** Exception lines (with up to 12 stack lines each) of the last LoadPackagesToDB block. */
export function extractPackageSync(text: string): string {
	const lines = text.split(/\r?\n/);
	let start = -1;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].includes(PACKAGE_BLOCK_START)) {
			start = i;
			break;
		}
	}
	if (start < 0) {
		return "";
	}
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (lines[i].includes(PACKAGE_BLOCK_END)) {
			end = i;
			break;
		}
	}

	const out: string[] = [];
	let i = start + 1;
	while (i < end) {
		if (!lines[i].includes("Exception")) {
			i++;
			continue;
		}
		out.push(lines[i]);
		i++;
		let stack = 0;
		while (i < end && stack < STACK_LINES_PER_EXCEPTION && /^\s+at /.test(lines[i])) {
			out.push(lines[i]);
			i++;
			stack++;
		}
	}
	return out.join("\n").slice(0, MAX_EXTRACT_CHARS);
}

/** Distinct compiler error lines of Build.log plus the last build result marker. */
export function extractBuildErrors(text: string): string {
	const out: string[] = [];
	let marker = "";
	for (const raw of text.split(/\r?\n/)) {
		const found = BUILD_MARKER.exec(raw);
		if (found) {
			marker = found[0];
		}
		if (!BUILD_ERROR_LINE.test(raw)) {
			continue;
		}
		let line = raw;
		const at = line.indexOf(CAPTURE_PREFIX);
		if (at >= 0) {
			line = line.slice(at + CAPTURE_PREFIX.length);
		}
		line = line.replace(/\s\[[^\]]*\]\s*$/, "").trim();
		if (!out.includes(line)) {
			out.push(line);
		}
	}
	if (marker) {
		out.push(marker);
	}
	return out.join("\n").slice(0, MAX_EXTRACT_CHARS);
}

export function hasAppStarted(text: string): boolean {
	return /Application started/.test(text);
}
