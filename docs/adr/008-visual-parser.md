# ADR-008 — Conservative Visual LaTeX Parser and AST Projection

**Status:** ACCEPTED  
**Date:** 2026-10-15  
**Context:** Gate 3 (G3) requires a visual editor for a documented academic LaTeX subset without risking corruption of arbitrary LaTeX documents. TeX is a Turing-complete macro language with programmable expansions, catcodes, and arbitrary packages; true universal WYSIWYG for arbitrary TeX is impossible without running the full TeX engine. At the same time, users need visual convenience for common elements (headings, paragraphs, lists, bold/italic formatting, inline/display math, figures, tables, citations, and cross-references) while preserving comments, indentation, custom macros, and raw LaTeX byte-for-byte.

## Options Considered

1. **Full WYSIWYG HTML/ProseMirror Round-Trip Converter (e.g., Pandoc/Mathpix style):**
   - *Pros:* Rich visual editing for full document.
   - *Cons:* Destructive normalization; loses original formatting, macros, comments, and spacing. Converting back to LaTeX regenerates the document, causing huge diffs and corrupting unsupported constructs. **Rejected.**

2. **Unified-latex AST Transformation Layer (`@unified-latex/unified-latex`):**
   - *Pros:* Modular AST parser with unified ecosystem.
   - *Cons:* Heuristic position tracking on complex macro arguments, high package dependency footprint, licensing nuances, and AST re-stringification does not guarantee 100% byte preservation of unedited surrounding code. Evaluated during 4h spike. **Partially adopted conceptually; specialized zero-copy range-mapped projection selected for core editor.**

3. **Conservative Source AST Projection with Exact Character Ranges & Minimal Splice Patches (Selected):**
   - *Pros:* Canonical document state is ALWAYS raw LaTeX source in `Y.Text`. The parser projects supported syntax into typed nodes with exact, immutable `[start, end]` character offsets and SHA-256 fragment hashes. Visual edits apply minimal string splices to the specific node's source range in Yjs. Opening visual mode and returning to code mode without editing is strictly read-only and leaves 100% of source bytes identical. Unsupported constructs (preambles, unknown macros, TikZ, verbatim) fall back to literal raw blocks.
   - *Cons:* Visual editor is restricted to the documented supported subset; unsupported syntax must be edited in code mode or viewed as literal blocks.

## Decision

We adopt **Option 3: Conservative Source AST Projection with Minimal Version-Checked Patches**:

1. **Canonical Truth:** The source of truth is always the raw LaTeX string stored in `Y.Text('content')`. There is no separate ProseMirror document or dual state machine.
2. **Supported Visual Nodes:**
   - Headings: `\section`, `\subsection`, `\subsubsection` (title argument editable, outer command and delimiters preserved).
   - Paragraphs: Standard text with significant whitespace and comments preserved.
   - Inline formatting: `\textbf{...}`, `\textit{...}`, `\emph{...}` (only known argument is editable).
   - Lists: `\begin{itemize}` and `\begin{enumerate}` with `\item` children (markers and indentation preserved).
   - Math: Inline `$ ... $` / `\( ... \)` and display `\[ ... \]` / `\begin{equation} ... \end{equation}` rendered via KaTeX with fallback to raw code dialog.
   - Figures: `\begin{figure}` containing `\includegraphics{...}`, `\caption{...}`, `\label{...}` (verifies image path is within project scope).
   - Tables: Simple `\begin{tabular}` environments with rows, cells, and alignment specs.
   - Citations & References: `\cite{...}`, `\ref{...}`, `\eqref{...}` rendered as interactive chips resolved against project `.bib` keys and `\label` declarations.
3. **Literal Fallback for Unsupported Syntax:**
   - Any unknown macro, preamble command (`\documentclass`, `\usepackage`), macro definition (`\newcommand`, `\def`), `verbatim` environment, or complex TikZ (`\begin{tikzpicture}`) is rendered as a non-destructive literal fallback node.
   - Literal nodes cannot be destructively rewritten in visual mode; users can view the raw text or switch to the Code Editor.
4. **Minimal Patching & Concurrency:**
   - Visual edits emit a `VisualPatch` containing `start`, `end`, `expectedTextHash`, `replacement`, and `baseStateVectorBase64`.
   - Patches are applied directly to the target `Y.Text` range via a single splice transaction. The rest of the document is untouched.
   - If a concurrent collaborator has modified the target range (fragment hash mismatch), the patch is rejected with `409 CONFLICT` and the visual projection reparses.
5. **Zero-Mutation Switching:**
   - Toggling between Code mode and Visual mode without making edits is strictly read-only.
   - Verified by a 100-fixture non-destructive round-trip test corpus.

## Consequences

- **Safety:** Eliminates silent document corruption or formatting destruction.
- **Predictability:** Clean Git/history diffs limited to the exact characters changed.
- **Clarity of Boundaries:** Users clearly see which elements are visually editable and which are preserved raw LaTeX.
- **Traceability:** Aligns with requirements `EDT-13` and Gate 3 (G3) editorial parity.
