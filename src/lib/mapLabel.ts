/** Leaflet popup/tooltip content is rendered as HTML, not plain text, so
 * any dynamic value has to be escaped -- otherwise a name containing
 * "&"/"<"/">" would break the markup. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Tamil name large and bold, English name below, taluk/district below
 * that, and an optional smaller description line (e.g. how the location
 * was resolved) -- used for both the single-village map's popup and the
 * multi-village results map's tooltips. */
export function buildVillageLabelHtml(opts: {
  villageTa: string;
  villageEn: string;
  talukEn: string;
  districtEn: string;
  description?: string;
}): string {
  const { villageTa, villageEn, talukEn, districtEn, description } = opts;
  return `
    <div style="font-size:1.2em;font-weight:700;line-height:1.3;">${escapeHtml(villageTa)}</div>
    <div style="font-size:0.95em;">${escapeHtml(villageEn)}</div>
    <div style="font-size:0.8em;color:#64748b;margin-top:2px;">${escapeHtml(talukEn)}, ${escapeHtml(districtEn)}</div>
    ${description ? `<div style="font-size:0.75em;color:#94a3b8;margin-top:2px;">${escapeHtml(description)}</div>` : ""}
  `;
}
