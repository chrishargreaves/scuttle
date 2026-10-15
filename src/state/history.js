// The traversal stack behind the resolved view.
//
// Following an edge pushes; back pops; the trail is the stack. Kept separate from
// rendering so that "inspecting a node never moves the source pane" (KTD9) is a property
// of plain data rather than something only observable in a browser.

export function createHistory() {
  let stack = [];

  return {
    reset(entry) { stack = entry === undefined ? [] : [entry]; return stack.at(-1); },
    push(entry) { stack.push(entry); return entry; },
    back() {
      // The root is the reason the reader opened the view; popping it would leave nothing.
      if (stack.length > 1) stack.pop();
      return stack.at(-1);
    },
    current: () => stack.at(-1),
    trail: () => [...stack],
    depth: () => stack.length,
    canGoBack: () => stack.length > 1,
    isEmpty: () => stack.length === 0,
  };
}
