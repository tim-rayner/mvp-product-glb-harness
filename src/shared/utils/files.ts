import { createHash, randomBytes } from "node:crypto";
import { chmod, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** Permission bits for assets that must never be rewritten in place. */
export const READ_ONLY_MODE = 0o444;

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export const sha256File = async (file: string) => sha256(await Bun.file(file).bytes());

/**
 * Writes via a temp file in the same directory, then renames over the target, so readers never
 * see a half-written file. With `exclusive`, refuses to replace an existing file.
 */
export async function writeFileAtomic(
  file: string,
  data: Uint8Array | string,
  { exclusive = false, mode }: { exclusive?: boolean; mode?: number } = {},
): Promise<void> {
  if (exclusive && (await exists(file))) {
    throw new Error(`Refusing to overwrite existing file ${file}`);
  }
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(temp, data, { flag: "wx" });
    if (mode !== undefined) await chmod(temp, mode);
    await rename(temp, file);
  } catch (e) {
    await rm(temp, { force: true });
    throw e;
  }
}

/** Atomic JSON write with stable two-space formatting. */
export const writeJsonAtomic = (file: string, value: unknown) => writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

export async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

/** Path as recorded in manifests: relative to the working directory when inside it, else absolute. */
export function displayPath(file: string): string {
  const absolute = path.resolve(file);
  const relative = path.relative(process.cwd(), absolute);
  return relative.startsWith("..") || path.isAbsolute(relative) ? absolute : relative.split(path.sep).join("/");
}

/** True when `file` is inside `dir` (after resolution). */
export function isInside(file: string, dir: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
