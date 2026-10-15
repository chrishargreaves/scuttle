// The strip of open files above the source pane.
//
// Each tab carries its file name and a close button. The active tab is marked so the
// reader can see which document the source pane, overview and report belong to.
import { escapeHtml } from './html.js';

export function renderTabsHtml(tabs, activeId) {
  return tabs.map(tab => {
    const on = tab.id === activeId ? ' on' : '';
    const name = escapeHtml(tab.name);
    return `<span class="tab${on}" data-tab="${tab.id}" title="${name}">` +
      `<span class="tname">${name}</span>` +
      `<button class="tclose" data-tabclose="${tab.id}" title="Close ${name}" aria-label="Close ${name}">×</button>` +
      '</span>';
  }).join('');
}
