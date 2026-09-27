function formatOne(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Renders an unknown catch-block value for a log line, following one level of `cause`. */
export function formatError(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause === undefined
    ? formatOne(error)
    : `${formatOne(error)}\ncaused by: ${formatOne(cause)}`;
}
