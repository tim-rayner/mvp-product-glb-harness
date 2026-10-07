/** Prints the message to stderr and exits with status 1. */
export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
