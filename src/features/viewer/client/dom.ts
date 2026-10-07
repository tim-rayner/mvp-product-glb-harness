export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Appends a line to the error box and reveals it. */
export function showError(message: string) {
  const box = $("error");
  box.style.display = "block";
  box.textContent = box.textContent ? `${box.textContent}\n${message}` : message;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const badge = (status: string) => `<span class="badge ${status}">${status}</span>`;

/** `<dt>/<dd>` pairs for a definition list. Values are inserted as HTML. */
export const definitionRows = (rows: [string, string][]) => rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

/** Escaped reasons as a `<ul>`, or nothing when there are none. */
export const reasonsList = (reasons: string[]) =>
  reasons.length ? `<ul class="reasons">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : "";
