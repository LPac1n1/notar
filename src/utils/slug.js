/**
 * Turns arbitrary text (a demand name, a month label) into a filename-safe
 * slug: no accents, lowercase, hyphen-separated.
 *
 * Shared so the per-demand PDF/JPEG reports and the per-demand abatement
 * sheets produce identical file names for the same demand — a user comparing
 * the two downloads shouldn't see "cestas-basicas" in one and something else
 * in the other.
 */
export function buildSlug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 80);
}
