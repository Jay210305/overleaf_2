// @vitest-environment jsdom
import { createElement } from "react";
import * as Y from "yjs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  parseVisualAst,
  type MathDisplayNode,
  type TableNode,
  type HeadingNode,
} from "@latex-collab/latex";
import { applyVisualPatch, createVisualPatch } from "../../packages/editor/src/visual-patch.js";
import {
  applyFormulaPatch,
  applyTableCellPatch,
} from "../../packages/editor/src/visual-academic-patch.js";
import { LiveTextDocument } from "../../apps/web/src/features/collab/live-document.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function syncDocs(docA: Y.Doc, docB: Y.Doc): void {
  const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
  const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
  Y.applyUpdate(docA, updateB);
  Y.applyUpdate(docB, updateA);
}

describe("S11-T09 Integration: Mixed Code and Visual Coediting", () => {
  it("two mounted clients exchange a visual heading edit through the socket and receive a durable ack", async () => {
    const fileId = "5b3675db-bba8-4fb8-94da-ab9c6841df29";
    const projectId = "56d03d93-8bf3-4e5a-a924-0cce961c7ca1";
    const serverDoc = new Y.Doc();
    serverDoc.getText("content").insert(0, "\\section{Original}\nBody text.\n");
    const sockets: FakeSocket[] = [];
    const acknowledgements: Array<{ socket: FakeSocket; message: unknown }> = [];
    class FakeSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      constructor(_url: string) {
        sockets.push(this);
        queueMicrotask(() => this.onopen?.());
      }
      send(raw: string) {
        const message = JSON.parse(raw) as { type: string; updateBase64?: string };
        if (message.type === "auth") {
          queueMicrotask(() =>
            this.emit({
              type: "auth.ok",
              fileId,
              action: "write",
              updateBase64: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(serverDoc))),
            }),
          );
        } else if (message.type === "sync.update") {
          const update = Uint8Array.from(atob(message.updateBase64 ?? ""), (char) =>
            char.charCodeAt(0),
          );
          Y.applyUpdate(serverDoc, update);
          for (const peer of sockets) {
            if (peer !== this)
              peer.emit({ type: "sync.update", updateBase64: message.updateBase64 });
          }
          acknowledgements.push({
            socket: this,
            message: {
              type: "text.durable_ack",
              version: 1,
              fileId,
              persistedSeq: 1,
              stateVectorBase64: btoa(String.fromCharCode(...Y.encodeStateVector(serverDoc))),
            },
          });
        }
      }
      emit(message: unknown) {
        this.onmessage?.({ data: JSON.stringify(message) });
      }
      close() {
        this.readyState = 3;
        this.onclose?.({ code: 1000 });
      }
    }
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ticket: "a".repeat(48), expiresAt: new Date().toISOString() }),
      }),
    );

    render(
      createElement(
        "div",
        null,
        createElement(LiveTextDocument, {
          projectId,
          fileId,
          fileName: "main.tex",
          apiUrl: "http://localhost/api/v1",
          csrfToken: "test",
        }),
        createElement(LiveTextDocument, {
          projectId,
          fileId,
          fileName: "main.tex",
          apiUrl: "http://localhost/api/v1",
          csrfToken: "test",
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("live-save-status").map((el) => el.textContent)).toEqual([
        "saved",
        "saved",
      ]),
    );
    const second = screen.getAllByTestId("live-document")[1]!;
    fireEvent.click(within(second).getByTestId("mode-visual-btn"));
    fireEvent.click(within(second).getByText("Original"));
    const input = within(second).getByTestId("heading-input");
    fireEvent.change(input, { target: { value: "Collaborative" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(serverDoc.getText("content").toString()).toContain("\\section{Collaborative}"),
    );
    expect(within(second).getByTestId("live-save-status").textContent).toBe("saving");
    const ack = acknowledgements.shift()!;
    ack.socket.emit(ack.message);
    await waitFor(() =>
      expect(screen.getAllByTestId("live-save-status").map((el) => el.textContent)).toEqual([
        "saved",
        "saved",
      ]),
    );
    expect(screen.getAllByTestId("codemirror-container")[0]!.textContent).toContain(
      "Collaborative",
    );
  });
  it("two clients on supported regions converge cleanly", () => {
    const raw = `\\section{Background}
Initial introductory paragraph text.

\\[
  \\int_0^1 x dx = \\frac{1}{2}
\\]

\\begin{tabular}{|c|c|}
  Col1 & Col2 \\\\
  A & B \\\\
\\end{tabular}`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    expect(textB.toString()).toBe(raw);

    // Client A (Code mode): modifies intro paragraph
    textA.insert(raw.indexOf("paragraph"), "coedited ");

    // Client B (Visual mode): patches display formula
    const astB = parseVisualAst(textB.toString());
    const mathB = astB.nodes.find((n) => n.kind === "mathDisplay") as MathDisplayNode;
    expect(mathB).toBeDefined();

    const patchB = applyFormulaPatch(textB, {
      fileId: "paper.tex",
      mathNode: mathB,
      newFormula: "\\int_0^1 x^2 dx = \\frac{1}{3}",
      expectedFormulaHash: mathB.hash,
      baseDoc: docB,
    });
    expect(patchB.success).toBe(true);

    // Sync clients
    syncDocs(docA, docB);

    // Convergence assertion
    expect(textA.toString()).toBe(textB.toString());
    const converged = textA.toString();
    expect(converged).toContain("coedited paragraph");
    expect(converged).toContain("\\int_0^1 x^2 dx = \\frac{1}{3}");
    expect(converged).toContain("Col1 & Col2 \\\\");
  });

  it("incompatible simultaneous changes on same fragment trigger conflict rejection and preserve source", () => {
    const raw = `\\section{Original Title}
Paragraph text.`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Both clients get the initial AST for the heading
    const astA = parseVisualAst(textA.toString());
    const headingA = astA.nodes.find((n) => n.kind === "heading") as HeadingNode;

    const astB = parseVisualAst(textB.toString());
    const headingB = astB.nodes.find((n) => n.kind === "heading") as HeadingNode;

    // Client A in code mode edits the title: "Original Title" -> "Alpha Title"
    textA.delete(headingA.titleRange.start, headingA.title.length);
    textA.insert(headingA.titleRange.start, "Alpha Title");

    // Client A updates are synced to Client B's Y.Doc
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));

    // Client B now attempts to apply visual patch using stale fragment hash
    const patchB = createVisualPatch(
      "paper.tex",
      headingB.titleRange.start,
      headingB.titleRange.end,
      headingB.title,
      "Beta Title",
      docB,
    );

    const resB = applyVisualPatch(textB, patchB);

    // Patch MUST be rejected due to stale fragment hash
    expect(resB.success).toBe(false);
    expect(resB.conflict).toBe(true);
    expect(resB.reason).toBe("STALE_FRAGMENT_HASH");

    // Client B's document contains Client A's edit and was NOT corrupted by stale patch
    expect(textB.toString()).toBe(`\\section{Alpha Title}
Paragraph text.`);
  });

  it("mixed visual table editing and code editor additions maintain document invariants", () => {
    const raw = `\\begin{tabular}{|l|r|}
  Item & Price \\\\
  Book & 15 \\\\
\\end{tabular}

\\begin{verbatim}
$ echo 'literal block'
\\end{verbatim}`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Client A (Visual): edits price from 15 to 25
    const astA = parseVisualAst(textA.toString());
    const tableA = astA.nodes.find((n) => n.kind === "table") as TableNode;
    const resA = applyTableCellPatch(textA, {
      fileId: "paper.tex",
      tableNode: tableA,
      rowIndex: 1,
      colIndex: 1,
      newContent: "25",
      expectedCellHash: tableA.rows[1]?.cells[1]?.hash ?? "",
      baseDoc: docA,
    });
    expect(resA.success).toBe(true);

    // Client B (Code): appends comment at end of document
    textB.insert(textB.length, "\n% Author note: checked");

    syncDocs(docA, docB);

    expect(textA.toString()).toBe(textB.toString());
    const result = textA.toString();
    expect(result).toContain("Book & 25 \\\\");
    expect(result).toContain("\\begin{verbatim}\n$ echo 'literal block'\n\\end{verbatim}");
    expect(result.endsWith("% Author note: checked")).toBe(true);
  });

  it("handles simultaneous section deletion in Code mode during Visual table edit with conflict guard and reparse", () => {
    const raw = `\\section{Introductory Section}
Some text before the table.

\\begin{tabular}{|l|c|}
  Item & Score \\\\
  Alpha & 88 \\\\
\\end{tabular}`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Client A (Visual) reads AST snapshot of the table
    const astA = parseVisualAst(textA.toString());
    const tableA = astA.nodes.find((n) => n.kind === "table") as TableNode;
    expect(tableA).toBeDefined();
    const targetCell = tableA.rows[1]?.cells[1];
    expect(targetCell?.content).toBe("88");

    // Client B (Code) deletes the entire section preceding the table
    const sectionEnd = raw.indexOf("\\begin{tabular}");
    textB.delete(0, sectionEnd);

    // Sync Client B's deletion to Client A
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

    // Client A attempts to apply the visual patch with stale offsets
    const staleResult = applyTableCellPatch(textA, {
      fileId: "paper.tex",
      tableNode: tableA,
      rowIndex: 1,
      colIndex: 1,
      newContent: "99",
      expectedCellHash: targetCell?.hash ?? "",
      baseDoc: docA,
    });

    // Guard MUST reject the stale patch and NOT corrupt the table
    expect(staleResult.success).toBe(false);
    expect(staleResult.conflict).toBe(true);
    expect(["STALE_FRAGMENT_HASH", "RANGE_OUT_OF_BOUNDS"]).toContain(staleResult.reason);

    // Client A re-parses after conflict and successfully patches the re-anchored cell
    const freshAstA = parseVisualAst(textA.toString());
    const freshTableA = freshAstA.nodes.find((n) => n.kind === "table") as TableNode;
    expect(freshTableA).toBeDefined();

    const freshResult = applyTableCellPatch(textA, {
      fileId: "paper.tex",
      tableNode: freshTableA,
      rowIndex: 1,
      colIndex: 1,
      newContent: "99",
      expectedCellHash: freshTableA.rows[1]?.cells[1]?.hash ?? "",
      baseDoc: docA,
    });
    expect(freshResult.success).toBe(true);

    // Sync back to Client B
    syncDocs(docA, docB);
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toBe(`\\begin{tabular}{|l|c|}
  Item & Score \\\\
  Alpha & 99 \\\\
\\end{tabular}`);
  });
});
