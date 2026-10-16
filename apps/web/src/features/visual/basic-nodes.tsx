import React, { useState, useEffect } from "react";
import type {
  HeadingNode,
  ParagraphNode,
  ListNode,
  VisualListItem,
  VisualSpan,
  VisualBlockNode,
} from "@latex-collab/editor";
import { MathPreview } from "./academic-nodes.js";

export interface VisualHeadingProps {
  node: HeadingNode;
  readOnly?: boolean;
  onTitleChange?: ((nodeId: string, newTitle: string, expectedHash: string) => void) | undefined;
}

export const VisualHeading: React.FC<VisualHeadingProps> = ({
  node,
  readOnly = false,
  onTitleChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(node.title);
  const [base, setBase] = useState({ title: node.title, hash: node.hash });

  useEffect(() => {
    if (!isEditing) setTitle(node.title);
  }, [node.title, isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    if (title !== base.title) {
      onTitleChange?.(node.id, title, base.hash);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCommit();
    } else if (e.key === "Escape") {
      setTitle(node.title);
      setIsEditing(false);
    }
  };

  const headingClasses = {
    section: "text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 my-4",
    subsection: "text-xl font-semibold text-gray-800 dark:text-gray-200 my-3",
    subsubsection: "text-lg font-medium text-gray-700 dark:text-gray-300 my-2",
  };

  const Tag = node.level === "section" ? "h1" : node.level === "subsection" ? "h2" : "h3";

  return (
    <div
      className="visual-heading-container group relative my-2"
      data-testid={`visual-heading-${node.level}`}
      data-node-id={node.id}
    >
      {isEditing && !readOnly ? (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full px-2 py-1 border border-blue-500 rounded bg-white dark:bg-gray-800 font-inherit focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`Edit ${node.level} title`}
          data-testid="heading-input"
        />
      ) : (
        <Tag
          className={`${headingClasses[node.level]} cursor-pointer group-hover:bg-gray-50 dark:group-hover:bg-gray-800/50 px-2 py-1 rounded transition-colors`}
          onClick={() => {
            if (!readOnly) {
              setBase({ title: node.title, hash: node.hash });
              setIsEditing(true);
            }
          }}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={(e) => {
            if (!readOnly && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setBase({ title: node.title, hash: node.hash });
              setIsEditing(true);
            }
          }}
          role="heading"
          aria-level={node.level === "section" ? 1 : node.level === "subsection" ? 2 : 3}
        >
          {node.title}
        </Tag>
      )}
    </div>
  );
};

export interface VisualSpanViewProps {
  span: VisualSpan;
}

export const VisualSpanView: React.FC<VisualSpanViewProps> = ({ span }) => {
  switch (span.kind) {
    case "text":
      return <span>{span.text}</span>;
    case "bold":
      return <strong className="font-bold">{span.content}</strong>;
    case "italic":
      return <em className="italic">{span.content}</em>;
    case "mathInline":
      return (
        <span
          className="font-mono bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 px-1 py-0.5 rounded text-sm mx-0.5 border border-purple-200 dark:border-purple-800"
          data-testid="visual-span-math"
        >
          <MathPreview formula={span.formula} displayMode={false} />
        </span>
      );
    case "citation":
      return (
        <span
          className="inline-flex items-center text-xs font-medium bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded-full mx-0.5"
          data-testid="visual-span-cite"
        >
          [{span.keys.join(", ")}]
        </span>
      );
    case "reference":
      return (
        <span
          className="inline-flex items-center text-xs font-mono bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.5 rounded mx-0.5"
          data-testid="visual-span-ref"
        >
          {span.command === "eqref" ? `(${span.key})` : span.key}
        </span>
      );
    case "rawInline":
      return (
        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{span.raw}</code>
      );
  }
};

export interface VisualParagraphProps {
  node: ParagraphNode;
  readOnly?: boolean;
  onTextChange?: ((nodeId: string, newText: string, expectedHash: string) => void) | undefined;
}

export const VisualParagraph: React.FC<VisualParagraphProps> = ({
  node,
  readOnly = false,
  onTextChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(node.text);
  const [base, setBase] = useState({ text: node.text, hash: node.hash });

  useEffect(() => {
    if (!isEditing) setText(node.text);
  }, [node.text, isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    if (text !== base.text) {
      onTextChange?.(node.id, text, base.hash);
    }
  };

  return (
    <div
      className="visual-paragraph-container my-3 group relative"
      data-testid="visual-paragraph"
      data-node-id={node.id}
    >
      {isEditing && !readOnly ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleCommit}
          autoFocus
          rows={Math.max(2, text.split("\n").length)}
          className="w-full px-3 py-2 border border-blue-500 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-serif leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          aria-label="Edit paragraph content"
          data-testid="paragraph-textarea"
        />
      ) : (
        <p
          className="text-gray-800 dark:text-gray-200 leading-relaxed font-serif px-2 py-1 rounded cursor-text group-hover:bg-gray-50 dark:group-hover:bg-gray-800/40 transition-colors"
          onClick={() => {
            if (!readOnly) {
              setBase({ text: node.text, hash: node.hash });
              setIsEditing(true);
            }
          }}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={(e) => {
            if (!readOnly && e.key === "Enter") {
              e.preventDefault();
              setBase({ text: node.text, hash: node.hash });
              setIsEditing(true);
            }
          }}
        >
          {node.spans.map((span, idx) => (
            <VisualSpanView key={idx} span={span} />
          ))}
        </p>
      )}
    </div>
  );
};

export interface VisualListItemProps {
  item: VisualListItem;
  readOnly?: boolean;
  onChange?: (itemIndex: number, newContent: string, expectedHash: string) => void;
}

export const VisualListItemView: React.FC<VisualListItemProps> = ({
  item,
  readOnly = false,
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(item.content);
  const [base, setBase] = useState({ content: item.content, hash: item.hash });

  useEffect(() => {
    if (!isEditing) setContent(item.content);
  }, [item.content, isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    if (content !== base.content) {
      onChange?.(item.index, content, base.hash);
    }
  };

  return (
    <li
      className="my-1.5 leading-relaxed text-gray-800 dark:text-gray-200"
      data-testid="visual-list-item"
      data-item-index={item.index}
    >
      {isEditing && !readOnly ? (
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCommit();
            else if (e.key === "Escape") {
              setContent(item.content);
              setIsEditing(false);
            }
          }}
          autoFocus
          className="w-full px-2 py-0.5 border border-blue-500 rounded bg-white dark:bg-gray-800 text-sm focus:outline-none"
          aria-label={`Edit list item ${item.index + 1}`}
          data-testid="list-item-input"
        />
      ) : (
        <span
          className="cursor-pointer px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onClick={() => {
            if (!readOnly) {
              setBase({ content: item.content, hash: item.hash });
              setIsEditing(true);
            }
          }}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={(e) => {
            if (!readOnly && e.key === "Enter") {
              e.preventDefault();
              setBase({ content: item.content, hash: item.hash });
              setIsEditing(true);
            }
          }}
        >
          {item.content}
        </span>
      )}
    </li>
  );
};

export interface VisualListProps {
  node: ListNode;
  readOnly?: boolean;
  onItemChange?:
    | ((nodeId: string, itemIndex: number, newContent: string, expectedHash: string) => void)
    | undefined;
}

export const VisualList: React.FC<VisualListProps> = ({ node, readOnly = false, onItemChange }) => {
  const ListTag = node.listKind === "enumerate" ? "ol" : "ul";
  const listClass =
    node.listKind === "enumerate" ? "list-decimal list-inside" : "list-disc list-inside";

  return (
    <div
      className="visual-list-container my-3 px-2"
      data-testid={`visual-list-${node.listKind}`}
      data-node-id={node.id}
    >
      <ListTag className={`${listClass} space-y-1`}>
        {node.items.map((item) => (
          <VisualListItemView
            key={item.index}
            item={item}
            readOnly={readOnly}
            onChange={(idx, newContent, expectedHash) => {
              onItemChange?.(node.id, idx, newContent, expectedHash);
            }}
          />
        ))}
      </ListTag>
    </div>
  );
};

export interface BasicVisualNodesViewProps {
  nodes: VisualBlockNode[];
  readOnly?: boolean;
  onHeadingChange?: (nodeId: string, newTitle: string, expectedHash: string) => void;
  onParagraphChange?: (nodeId: string, newText: string, expectedHash: string) => void;
  onListItemChange?: (
    nodeId: string,
    itemIndex: number,
    newContent: string,
    expectedHash: string,
  ) => void;
}

export const BasicVisualNodesView: React.FC<BasicVisualNodesViewProps> = ({
  nodes,
  readOnly = false,
  onHeadingChange,
  onParagraphChange,
  onListItemChange,
}) => {
  return (
    <div
      className="basic-visual-nodes-container space-y-2 p-4"
      data-testid="basic-visual-nodes-view"
    >
      {nodes.map((node) => {
        switch (node.kind) {
          case "heading":
            return (
              <VisualHeading
                key={node.id}
                node={node}
                readOnly={readOnly}
                onTitleChange={onHeadingChange}
              />
            );
          case "paragraph":
            return (
              <VisualParagraph
                key={node.id}
                node={node}
                readOnly={readOnly}
                onTextChange={onParagraphChange}
              />
            );
          case "list":
            return (
              <VisualList
                key={node.id}
                node={node}
                readOnly={readOnly}
                onItemChange={onListItemChange}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
};
