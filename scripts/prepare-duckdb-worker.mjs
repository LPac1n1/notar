import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(currentDir, "..");
const sourcePath = path.join(
  projectRoot,
  "node_modules",
  "@duckdb",
  "duckdb-wasm",
  "dist",
  "duckdb-browser-mvp.worker.js",
);
const targetDir = path.join(projectRoot, "src", "vendor", "duckdb");
const targetPath = path.join(targetDir, "duckdb-browser-mvp.worker.js");

const workerSource = await readFile(sourcePath, "utf8");
const patchedWorkerSource = workerSource.replace(
  /\r?\n\/\/# sourceMappingURL=duckdb-browser-mvp\.worker\.js\.map\s*$/u,
  "",
);

await mkdir(targetDir, { recursive: true });
await writeFile(targetPath, patchedWorkerSource, "utf8");
