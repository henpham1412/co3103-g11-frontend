// Empty result sets still use page 1 for subsequent requests.
export function lastValidPage(page: number, totalPages: number): number {
  return Math.min(page, Math.max(1, totalPages));
}
