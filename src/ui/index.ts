import "./index.css";
import {
  CropResult,
  Insets,
  MessageType,
  PluginMessage,
  Side,
  SIDE_LABELS,
  SIDES,
  UiMessage,
} from "../messages";

/** Value change per dragged pixel, and with Shift held (like Figma). */
const SCRUB_STEP = 1;
const SCRUB_STEP_FAST = 10;

const fields = document.getElementById("fields") as HTMLDivElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
const uncropButton = document.getElementById("uncropButton") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;

let imageCount = 0;
let result: CropResult | null = null;

function send(message: UiMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

/** Drag the label horizontally to change the input's value. */
function enableScrub(label: HTMLElement, input: HTMLInputElement) {
  label.addEventListener("pointerdown", (down) => {
    if (input.disabled || down.button !== 0) return;
    down.preventDefault();
    label.setPointerCapture(down.pointerId);
    // Pointer lock keeps the drag going past the plugin window's edge, like Figma's own fields.
    // If it is refused, pointer capture still works inside the window.
    Promise.resolve(label.requestPointerLock()).catch(() => {});
    document.body.classList.add("scrubbing");
    let value = Math.max(0, Number(input.value) || 0);

    const onMove = (move: PointerEvent) => {
      const step = move.shiftKey ? SCRUB_STEP_FAST : SCRUB_STEP;
      // movementX keeps reporting while the pointer is locked; clientX stops changing.
      value = Math.max(0, value + move.movementX * step);
      const next = String(Math.round(value));
      if (next === input.value) return;
      input.value = next;
      onInput();
    };
    const onEnd = () => {
      label.removeEventListener("pointermove", onMove);
      label.removeEventListener("pointerup", onEnd);
      label.removeEventListener("pointercancel", onEnd);
      if (document.pointerLockElement === label) document.exitPointerLock();
      document.body.classList.remove("scrubbing");
    };
    label.addEventListener("pointermove", onMove);
    label.addEventListener("pointerup", onEnd);
    label.addEventListener("pointercancel", onEnd);
  });
}

const inputs = new Map<Side, HTMLInputElement>(
  SIDES.map((side) => {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("span");
    label.className = "scrub";
    label.textContent = SIDE_LABELS[side][0];
    label.title = SIDE_LABELS[side];
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = "0";
    input.addEventListener("input", onInput);
    enableScrub(label, input);
    field.append(label, input);
    fields.append(field);
    return [side, input];
  })
);

/** Insets, or null if any value is invalid. Empty means 0. */
function readInsets(): Insets | null {
  const insets = {} as Insets;
  for (const side of SIDES) {
    const raw = inputs.get(side)!.value.trim();
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;
    insets[side] = value;
  }
  return insets;
}

function clearInputs() {
  for (const input of inputs.values()) input.value = "0";
  result = null;
}

function render() {
  const insets = readInsets();
  const hasCrop = insets !== null && SIDES.some((side) => insets[side] > 0);
  for (const input of inputs.values()) input.disabled = imageCount === 0;
  resetButton.disabled = imageCount === 0 || !hasCrop;
  uncropButton.disabled = imageCount === 0;

  if (imageCount === 0) {
    status.textContent = "Select layers with image fills.";
    return;
  }
  const lines = [`${imageCount} image${imageCount === 1 ? "" : "s"} selected`];
  for (const [reason, count] of result?.skipped ?? []) lines.push(`${count} skipped: ${reason}`);
  status.textContent = lines.join("\n");
}

function onInput() {
  const insets = readInsets();
  if (insets) send({ type: MessageType.Preview, insets });
  render();
}

resetButton.addEventListener("click", () => {
  send({ type: MessageType.Reset });
  clearInputs();
  render();
});

uncropButton.addEventListener("click", () => {
  send({ type: MessageType.Uncrop });
  clearInputs();
  render();
});

window.onmessage = (event: MessageEvent<{ pluginMessage: PluginMessage }>) => {
  const message = event.data.pluginMessage;
  switch (message.type) {
    case MessageType.Selection:
      imageCount = message.imageCount;
      clearInputs();
      break;
    case MessageType.Result:
      result = message.result;
      break;
  }
  render();
};

// Measure a wrapper, not <body>: Figma may render the UI in quirks mode, where <body> fills the window.
const root = document.getElementById("root") as HTMLDivElement;
new ResizeObserver(() => {
  send({ type: MessageType.Resize, height: root.getBoundingClientRect().height });
}).observe(root);

render();
