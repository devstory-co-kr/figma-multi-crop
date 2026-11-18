import { applyPreview, commitPreview, countImages, revertPreview } from "./crop";
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

async function crop(insets: Insets) {
  pending = null;
  const result = await applyPreview(figma.currentPage.selection, insets);
  if (!result) return;
  const count = commitPreview();
  figma.commitUndo();
  figma.notify(`Cropped ${count} image${count === 1 ? "" : "s"}`);
}

function reset() {
  pending = null;
  revertPreview();
}

function onSelectionChange() {
  reset();
  post({ type: MessageType.Selection, imageCount: countImages(figma.currentPage.selection) });
}

figma.on("selectionchange", onSelectionChange);
// Closing without pressing Crop discards the preview.
figma.on("close", revertPreview);
onSelectionChange();

figma.ui.onmessage = (message: UiMessage) => {
  switch (message.type) {
    case MessageType.Preview:
      preview(message.insets);
      break;
    case MessageType.Crop:
      crop(message.insets);
      break;
    case MessageType.Reset:
      reset();
      break;
    case MessageType.Resize:
      figma.ui.resize(UI_WIDTH, Math.ceil(message.height));
      break;
  }
};
