import { StateEffect, StateField, type Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

/**
 * A collaborator cursor/selection received from the awareness channel.
 * Offsets are absolute document positions on the sender's replica.
 */
export interface RemoteSelection {
  clientId: string;
  name: string;
  color: string;
  anchor: number;
  head: number;
}

const safeColorPattern = /^#[0-9a-fA-F]{6}$/;
const fallbackColor = "#5b8def";

/** Peer colours are untrusted input: only accept plain hex values. */
function safeColor(color: string): string {
  return safeColorPattern.test(color) ? color : fallbackColor;
}

export const setRemoteSelections = StateEffect.define<RemoteSelection[]>();

class RemoteCursorWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly color: string,
  ) {
    super();
  }

  override eq(other: RemoteCursorWidget): boolean {
    return other.name === this.name && other.color === this.color;
  }

  toDOM(): HTMLElement {
    const cursor = document.createElement("span");
    cursor.className = "cm-remote-cursor";
    cursor.style.borderLeftColor = this.color;
    const label = document.createElement("span");
    label.className = "cm-remote-cursor-label";
    label.textContent = this.name;
    label.style.backgroundColor = this.color;
    cursor.append(label);
    return cursor;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function clampOffset(value: number, docLength: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), docLength);
}

function buildDecorations(docLength: number, selections: RemoteSelection[]): DecorationSet {
  const ranges: Array<{ from: number; to: number; deco: Decoration }> = [];
  for (const selection of selections) {
    const color = safeColor(selection.color);
    const head = clampOffset(selection.head, docLength);
    const anchor = clampOffset(selection.anchor, docLength);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    if (to > from) {
      ranges.push({
        from,
        to,
        deco: Decoration.mark({
          class: "cm-remote-selection",
          attributes: {
            style: `background-color:${color}33;box-shadow:inset 0 -2px 0 ${color};`,
          },
        }),
      });
    }
    ranges.push({
      from: head,
      to: head,
      deco: Decoration.widget({
        widget: new RemoteCursorWidget(selection.name.slice(0, 40), color),
        side: 1,
      }),
    });
  }
  ranges.sort((left, right) => left.from - right.from || left.to - right.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) builder.add(range.from, range.to, range.deco);
  return builder.finish();
}

const remoteSelectionField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setRemoteSelections)) {
        next = buildDecorations(transaction.state.doc.length, effect.value);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const remoteSelectionTheme = EditorView.baseTheme({
  ".cm-remote-cursor": {
    position: "relative",
    marginLeft: "-1px",
    borderLeft: "2px solid",
    height: "1.2em",
    display: "inline-block",
    verticalAlign: "text-bottom",
    pointerEvents: "none",
  },
  ".cm-remote-cursor-label": {
    position: "absolute",
    top: "-1.25em",
    left: "-1px",
    padding: "0 4px",
    borderRadius: "3px",
    color: "#06180f",
    fontSize: "10px",
    fontWeight: "700",
    lineHeight: "1.4",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
});

/** CodeMirror extension that renders collaborator cursors and selections. */
export function remoteSelectionExtension(): Extension {
  return [remoteSelectionField, remoteSelectionTheme];
}

/** Replace every rendered collaborator cursor with the supplied set. */
export function applyRemoteSelections(view: EditorView, selections: RemoteSelection[]): void {
  view.dispatch({ effects: setRemoteSelections.of(selections) });
}

/** Move the caret to a 1-based line and scroll it into view. */
export function revealLine(view: EditorView, line: number): void {
  const doc = view.state.doc;
  if (doc.length === 0) return;
  const target = doc.line(Math.min(Math.max(Math.trunc(line), 1), doc.lines));
  view.dispatch({
    selection: { anchor: target.from },
    effects: EditorView.scrollIntoView(target.from, { y: "center" }),
  });
  view.focus();
}
