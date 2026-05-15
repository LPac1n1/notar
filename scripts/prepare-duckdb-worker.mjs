import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(currentDir, "..");
const targetDir = path.join(projectRoot, "src", "vendor", "duckdb");

// We vendor the EH (exception handling) worker because the MVP build of
// `@duckdb/duckdb-wasm@1.33.1-dev45.0` ships with a broken reference to
// `_setThrew` (the symbol is called but never bound by the Emscripten
// runtime). The EH bundle uses native WASM exception handling and avoids
// the issue entirely. Every browser we target (Chrome 95+, Firefox 100+,
// Edge 95+, Safari 15.2+) supports it.
const workerFileName = "duckdb-browser-eh.worker.js";
const sourcePath = path.join(
  projectRoot,
  "node_modules",
  "@duckdb",
  "duckdb-wasm",
  "dist",
  workerFileName,
);
const targetPath = path.join(targetDir, workerFileName);

const workerSource = await readFile(sourcePath, "utf8");
const patchedWorkerSource = workerSource.replace(
  /\r?\n\/\/# sourceMappingURL=duckdb-browser-eh\.worker\.js\.map\s*$/u,
  "",
);

await mkdir(targetDir, { recursive: true });
await writeFile(targetPath, patchedWorkerSource, "utf8");
