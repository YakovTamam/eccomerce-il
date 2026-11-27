/** Only same-site relative paths: never an open redirect (`//evil.com`, `/\evil.com`, absolute URLs). */
export const safeNext = (n?: string | null) =>
  n &&
  n.startsWith("/") &&
  !n.startsWith("//") &&
  !n.includes("\\") &&
  !/[\r\n]/.test(n)
    ? n
    : "/";
