// The line a grip is dragging: where it is, and how a note in the tree takes it. It sits apart from the editor's
// code, so the tree draws without loading the editor.
export const dragged: { current: { line: () => number | undefined; moveTo: (note: string) => void } | null } = {
  current: null,
}
