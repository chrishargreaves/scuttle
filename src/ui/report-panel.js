// Renders the opening report. Purely a projection of the report data composed in
// src/model/report.js, so the panel and the unresolved count can never disagree.

import { escapeHtml } from './html.js';

export function renderReportHtml(report) {
  const sources = report.indexSources.map(s => `${s.name} ${s.version}`).join(', ');
  const assumed =
    `<p class="assumed">Assuming this file targets CASE/UCO ${escapeHtml(report.assumedVersion ?? 'unknown')}. ` +
    `The file does not declare a version, so this is an assumption, not something read from the data. ` +
    `Definitions bundled from ${escapeHtml(sources)}` +
    (report.indexGenerated ? `, generated ${escapeHtml(report.indexGenerated)}` : '') + `.</p>`;

  const body = report.clean
    ? `<p class="clean">Everything in this file resolved. Nothing to report.</p>`
    : report.groups.map(group =>
        `<div class="group"><h3>${escapeHtml(group.title)} (${group.items.length})</h3>` +
        `<p class="assumed">${escapeHtml(group.note)}</p><ul>` +
        group.items.map(item => `<li>${escapeHtml(item)}</li>`).join('') +
        `</ul></div>`
      ).join('');

  return `<div class="card"><h2>Load report</h2><div class="body">${assumed}${body}</div>` +
    `<div class="ft"><button data-dismiss="1">Dismiss</button></div></div>`;
}

export function reportButtonLabel(report) {
  return report.clean ? 'Report — clean' : `Report — ${report.count} unresolved`;
}
