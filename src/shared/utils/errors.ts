/** Human-readable message for anything thrown, Error or not. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** True for a filesystem error raised because the path already exists. */
export const isAlreadyExistsError = (e: unknown) => e instanceof Error && "code" in e && e.code === "EEXIST";
