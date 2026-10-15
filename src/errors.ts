export class CtxtrimError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CtxtrimError";
    this.code = code;
  }
}

export function errorText(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "provider timed out";
    return err.message;
  }
  return String(err);
}
