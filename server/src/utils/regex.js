/**
 * Escape regex special characters to prevent ReDoS / catastrophic backtracking attacks.
 */
export const escapeRegex = (string) =>
  String(string ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
