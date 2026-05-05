import { useEffect, useRef } from "react";
import {
  BoldIcon,
  BulletListIcon,
  ChecklistIcon,
  ItalicIcon,
  OrderedListIcon,
  StrikeIcon,
  TextIcon,
} from "../../../components/ui/icons";
import { normalizeNoteContentHtml } from "../utils/noteContent";

const FORMAT_BUTTONS = [
  {
    label: "Texto",
    icon: TextIcon,
    action: "formatBlock",
    value: "p",
  },
  {
    label: "Título",
    text: "H1",
    action: "formatBlock",
    value: "h2",
  },
  {
    label: "Subtítulo",
    text: "H2",
    action: "formatBlock",
    value: "h3",
  },
  {
    label: "Negrito",
    icon: BoldIcon,
    action: "bold",
  },
  {
    label: "Itálico",
    icon: ItalicIcon,
    action: "italic",
  },
  {
    label: "Tachado",
    icon: StrikeIcon,
    action: "strikeThrough",
  },
  {
    label: "Lista com tópicos",
    icon: BulletListIcon,
    action: "insertUnorderedList",
  },
  {
    label: "Lista numerada",
    icon: OrderedListIcon,
    action: "insertOrderedList",
  },
];

const EDITABLE_BLOCK_SELECTOR = 'p,h2,h3,li,div[data-note-checklist="true"]';

function getChecklistElement(node, root) {
  if (!node || !root) {
    return null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const checklistElement = element?.closest?.('[data-note-checklist="true"]');

  return checklistElement && root.contains(checklistElement)
    ? checklistElement
    : null;
}

function placeCaretAtEnd(element) {
  if (!element || typeof window === "undefined") {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function getCurrentEditableBlock(node, root) {
  if (!node || !root) {
    return null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const block = element?.closest?.(EDITABLE_BLOCK_SELECTOR);

  if (block && root.contains(block)) {
    return block;
  }

  return root.contains(node) ? root : null;
}

function getShortcutMarker(block) {
  return (block?.textContent ?? "").replace(/\u00a0/g, " ").trim();
}

function createEmptyBlock(tagName) {
  const element = document.createElement(tagName);
  element.innerHTML = "<br>";
  return element;
}

function createEmptyList(tagName) {
  const list = document.createElement(tagName);
  const item = document.createElement("li");
  item.innerHTML = "<br>";
  list.appendChild(item);
  return { list, item };
}

function createChecklist(checked = false) {
  const checklist = document.createElement("div");
  checklist.dataset.noteChecklist = "true";
  checklist.dataset.checked = checked ? "true" : "false";
  checklist.innerHTML = "<br>";
  return checklist;
}

function replaceShortcutBlock(block, replacement, caretTarget, root) {
  if (!block || !replacement || !root) {
    return;
  }

  const parentList = block.tagName === "LI" ? block.closest("ul,ol") : null;

  if (parentList && parentList.children.length === 1) {
    parentList.replaceWith(replacement);
  } else if (block === root) {
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;

    if (anchorNode?.parentNode === root) {
      root.replaceChild(replacement, anchorNode);
    } else {
      root.replaceChildren(replacement);
    }
  } else {
    block.replaceWith(replacement);
  }

  placeCaretAtEnd(caretTarget ?? replacement);
}

export default function RichNoteEditor({
  label = "Conteúdo",
  onChange,
  value,
}) {
  const editorRef = useRef(null);
  const lastHtmlRef = useRef("");
  const selectionRangeRef = useRef(null);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const nextHtml = String(value ?? "").trim()
      ? normalizeNoteContentHtml(value)
      : "";

    if (nextHtml === lastHtmlRef.current) {
      return;
    }

    editor.innerHTML = nextHtml;
    lastHtmlRef.current = nextHtml;
    selectionRangeRef.current = null;
  }, [value]);

  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (
      !editor ||
      !selection ||
      selection.rangeCount === 0 ||
      !editor.contains(selection.anchorNode) ||
      !editor.contains(selection.focusNode)
    ) {
      return;
    }

    selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.focus({ preventScroll: true });

    const selection = window.getSelection();
    const savedRange = selectionRangeRef.current;

    if (
      selection &&
      savedRange &&
      editor.contains(savedRange.commonAncestorContainer)
    ) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
      return;
    }

    placeCaretAtEnd(editor);
    saveSelection();
  };

  const emitChange = () => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const nextHtml = normalizeNoteContentHtml(editor.innerHTML);
    lastHtmlRef.current = nextHtml;
    onChange?.(nextHtml);
  };

  const runCommand = (command, commandValue = null) => {
    restoreSelection();
    const normalizedValue =
      command === "formatBlock" && commandValue ? `<${commandValue}>` : commandValue;
    document.execCommand(command, false, normalizedValue);
    emitChange();
    saveSelection();
  };

  const insertChecklist = () => {
    restoreSelection();
    document.execCommand(
      "insertHTML",
      false,
      '<div data-note-checklist="true" data-checked="false"><br></div>',
    );
    emitChange();
    saveSelection();
  };

  const toggleChecklist = (checklistElement) => {
    checklistElement.dataset.checked =
      checklistElement.dataset.checked === "true" ? "false" : "true";
    emitChange();
    saveSelection();
  };

  const applyShortcutFormatting = (nativeEvent) => {
    const typedSpace = nativeEvent?.data === " ";

    if (!typedSpace) {
      return false;
    }

    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection || selection.rangeCount === 0) {
      return false;
    }

    const block = getCurrentEditableBlock(selection.anchorNode, editor);
    const marker = getShortcutMarker(block);

    if (!block || !marker) {
      return false;
    }

    if (marker === "#") {
      const heading = createEmptyBlock("h2");
      replaceShortcutBlock(block, heading, heading, editor);
      return true;
    }

    if (marker === "##") {
      const heading = createEmptyBlock("h3");
      replaceShortcutBlock(block, heading, heading, editor);
      return true;
    }

    if (marker === "-") {
      const { list, item } = createEmptyList("ul");
      replaceShortcutBlock(block, list, item, editor);
      return true;
    }

    if (/^\d+\.$/.test(marker)) {
      const { list, item } = createEmptyList("ol");
      replaceShortcutBlock(block, list, item, editor);
      return true;
    }

    if (/^-\s+\[\s\]$/i.test(marker)) {
      const checklist = createChecklist(false);
      replaceShortcutBlock(block, checklist, checklist, editor);
      return true;
    }

    if (/^-\s+\[x\]$/i.test(marker)) {
      const checklist = createChecklist(true);
      replaceShortcutBlock(block, checklist, checklist, editor);
      return true;
    }

    if (/^\[\s\]$/i.test(marker)) {
      const checklist = createChecklist(false);
      replaceShortcutBlock(block, checklist, checklist, editor);
      return true;
    }

    if (/^\[x\]$/i.test(marker)) {
      const checklist = createChecklist(true);
      replaceShortcutBlock(block, checklist, checklist, editor);
      return true;
    }

    return false;
  };

  const handleMouseDown = (event) => {
    const checklistElement = getChecklistElement(
      event.target,
      editorRef.current,
    );

    if (!checklistElement) {
      return;
    }

    const rect = checklistElement.getBoundingClientRect();

    if (event.clientX - rect.left <= 28) {
      event.preventDefault();
      toggleChecklist(checklistElement);
    }
  };

  const handleInput = (event) => {
    applyShortcutFormatting(event.nativeEvent);
    emitChange();
    saveSelection();
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    const selection = window.getSelection();
    const checklistElement = getChecklistElement(
      selection?.anchorNode,
      editorRef.current,
    );

    if (!checklistElement) {
      return;
    }

    event.preventDefault();

    if (!checklistElement.textContent.trim()) {
      const paragraph = document.createElement("p");
      paragraph.innerHTML = "<br>";
      checklistElement.replaceWith(paragraph);
      placeCaretAtEnd(paragraph);
      emitChange();
      saveSelection();
      return;
    }

    const nextChecklist = document.createElement("div");
    nextChecklist.dataset.noteChecklist = "true";
    nextChecklist.dataset.checked = "false";
    nextChecklist.innerHTML = "<br>";
    checklistElement.after(nextChecklist);
    placeCaretAtEnd(nextChecklist);
    emitChange();
    saveSelection();
  };

  const handlePaste = (event) => {
    const text = event.clipboardData?.getData("text/plain") ?? "";

    if (!text) {
      return;
    }

    event.preventDefault();
    restoreSelection();
    document.execCommand("insertText", false, text);
    emitChange();
    saveSelection();
  };

  const handleToolbarPointerDown = (event, action) => {
    event.preventDefault();
    action();
  };

  const handleToolbarClick = (event, action) => {
    if (event.detail !== 0) {
      return;
    }

    event.preventDefault();
    action();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          {label}
        </p>

        <div
          className="flex flex-wrap gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-1"
          aria-label="Ferramentas de formatação"
        >
          {FORMAT_BUTTONS.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                aria-label={item.label}
                title={item.label}
                onPointerDown={(event) =>
                  handleToolbarPointerDown(event, () =>
                    runCommand(item.action, item.value),
                  )
                }
                onClick={(event) =>
                  handleToolbarClick(event, () =>
                    runCommand(item.action, item.value),
                  )
                }
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
              >
                {Icon ? <Icon className="h-4 w-4" /> : item.text}
              </button>
            );
          })}

          <button
            type="button"
            aria-label="Checklist"
            title="Checklist"
            onPointerDown={(event) =>
              handleToolbarPointerDown(event, insertChecklist)
            }
            onClick={(event) => handleToolbarClick(event, insertChecklist)}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
          >
            <ChecklistIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={editorRef}
        role="textbox"
        aria-label={label}
        data-testid="note-rich-editor"
        data-placeholder="Escreva sua anotação..."
        contentEditable
        suppressContentEditableWarning
        className="note-rich-content note-rich-editor min-h-[20rem] rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 text-[var(--text-main)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface-muted)]"
        onBlur={saveSelection}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={saveSelection}
        onMouseDown={handleMouseDown}
        onMouseUp={saveSelection}
        onPaste={handlePaste}
      />
    </div>
  );
}
