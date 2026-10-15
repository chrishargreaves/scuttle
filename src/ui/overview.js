// The positional overview: one mark per source line, so the reader can see where they are
// in the whole file and where a selected node occurs, without the source pane moving.

export function renderOverviewHtml(doc) {
  return doc.lines
    .map((line, index) => {
      const trimmed = line.trimStart();
      let kind = '';
      if (trimmed.startsWith('#')) kind = ' com';
      else if (line.length && !/^\s/.test(line)) kind = ' sub';
      return `<div class="row${kind}" data-line="${index + 1}"></div>`;
    })
    .join('');
}
