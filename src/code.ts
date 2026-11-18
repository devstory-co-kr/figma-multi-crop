import { applyPreview, commitPreview, countImages, revertPreview, uncrop } from "./crop";
import { Insets, MessageType, PluginMessage, UiMessage } from "./messages";

// The UI reports its content height and the window is resized to fit it.
const UI_WIDTH = 240;
figma.showUI(__html__, { width: UI_WIDTH, height: 200, themeColors: true });

function post(message: PluginMessage) {
  figma.ui.postMessage(message);
}

// Only the latest value matters while typing or dragging, so intermediate ones are dropped.
let pending: Insets | null = null;
let running = false;

async function preview(insets: Insets) {
  pending = insets;
  if (running) return;
  running = true;
  while (pending) {
    const next = pending;
    pending = null;
    const result = await applyPreview(figma.currentPage.selection, next);
    if (result) post({ type: MessageType.Result, result });
  }
  running = false;
}

function reset() {
  pending = null;
  revertPreview();
}

/** Keeps the crop as applied, as one undo step. */
function commit() {
  pending = null;
  commitPreview();
  figma.commitUndo();
}

/** Shows the whole image again, as its own undo step. */
async function uncropSelection() {
  commit();
  const result = await uncrop(figma.currentPage.selection);
  figma.commitUndo();
  post({ type: MessageType.Result, result });
}

function onSelectionChange() {
  commit();
  post({ type: MessageType.Selection, imageCount: countImages(figma.currentPage.selection) });
}

figma.on("selectionchange", onSelectionChange);
// Crops apply as you type, so closing keeps them.
figma.on("close", commitPreview);
onSelectionChange();

figma.ui.onmessage = (message: UiMessage) => {
  switch (message.type) {
    case MessageType.Preview:
      preview(message.insets);
      break;
    case MessageType.Reset:
      reset();
      break;
    case MessageType.Uncrop:
      uncropSelection();
      break;
    case MessageType.Resize:
      figma.ui.resize(UI_WIDTH, Math.ceil(message.height));
      break;
  }
};
