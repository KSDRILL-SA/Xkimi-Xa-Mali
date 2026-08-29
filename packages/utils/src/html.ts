/**
 * Escape the 5 characters that give HTML meaning, so a value that happens to
 * contain them renders as literal text instead of markup.
 *
 * For anything user-controlled — a member's own name, an admin-composed
 * broadcast, a template payload value — that is about to be interpolated
 * into an HTML string built by hand (a `${...}` inside a template literal,
 * not JSX, which escapes on its own). Skipping this on a field like a
 * first name is a stored HTML-injection hole: whatever a member puts there
 * gets embedded raw into every email that greets them by name.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
