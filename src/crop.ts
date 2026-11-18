import { CropResult, Insets, SIDES, SkipReason } from "./messages";

type CroppableNode = SceneNode & MinimalFillsMixin & LayoutMixin;

function isCroppable(node: SceneNode): node is CroppableNode {
  return node.type !== "TEXT" && "fills" in node && "resize" in node;
}

function imagePaints(node: SceneNode): ImagePaint[] {
  if (!isCroppable(node) || node.fills === figma.mixed) return [];
  return node.fills.filter((p): p is ImagePaint => p.type === "IMAGE");
}

export function countImages(selection: readonly SceneNode[]): number {
  return selection.filter((n) => imagePaints(n).length > 0).length;
}

/** a ∘ b for 2x3 affine matrices. */
function multiply(a: Transform, b: Transform): Transform {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2],
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2],
    ],
  ];
}

function isConvertibleFill(paint: ImagePaint): boolean {
  return paint.scaleMode === "FILL" && (paint.rotation ?? 0) === 0 && !!paint.imageHash;
}

/** Intrinsic image sizes by hash, needed only to convert FILL paints to CROP. */
const imageSizes = new Map<string, { width: number; height: number }>();

async function loadImageSizes(nodes: readonly SceneNode[]) {
  for (const node of nodes) {
    for (const paint of imagePaints(node)) {
      const hash = paint.imageHash;
      if (!isConvertibleFill(paint) || !hash || imageSizes.has(hash)) continue;
      const image = figma.getImageByHash(hash);
      if (image) imageSizes.set(hash, await image.getSizeAsync());
    }
  }
}

/**
 * The CROP imageTransform (node unit square -> image unit square)
 * that shows the paint exactly as it is shown now, or null if unsupported.
 */
function currentImageTransform(paint: ImagePaint, width: number, height: number): Transform | null {
  if (paint.scaleMode === "CROP") {
    return paint.imageTransform ?? [[1, 0, 0], [0, 1, 0]];
  }
  const size = isConvertibleFill(paint) ? imageSizes.get(paint.imageHash!) : undefined;
  if (!size) return null;
  // FILL scales the image to cover the node and centers it.
  const scale = Math.max(width / size.width, height / size.height);
  const fx = width / scale / size.width;
  const fy = height / scale / size.height;
  return [
    [fx, 0, (1 - fx) / 2],
    [0, fy, (1 - fy) / 2],
  ];
}

/**
 * Crops by `insets` relative to the node's current state. Negative values extend it back.
 * Synchronous so it can run while the plugin is closing; FILL paints need `loadImageSizes` first.
 */
function cropNode(node: SceneNode, insets: Insets): SkipReason | null {
  if (!isCroppable(node) || imagePaints(node).length === 0) return SkipReason.NoImageFill;
  if ("children" in node && node.children.length > 0) return SkipReason.HasChildren;

  const { width, height } = node;
  const newWidth = width - insets.left - insets.right;
  const newHeight = height - insets.top - insets.bottom;
  if (newWidth <= 0 || newHeight <= 0) return SkipReason.CropTooLarge;

  // Maps the new node unit square into the old node unit square.
  const crop: Transform = [
    [newWidth / width, 0, insets.left / width],
    [0, newHeight / height, insets.top / height],
  ];

  const fills = node.fills as readonly Paint[];
  const newFills: Paint[] = [];
  for (const paint of fills) {
    if (paint.type !== "IMAGE") {
      newFills.push(paint);
      continue;
    }
    const current = currentImageTransform(paint, width, height);
    if (!current) return SkipReason.UnsupportedScaleMode;
    newFills.push({ ...paint, scaleMode: "CROP", imageTransform: multiply(current, crop) });
  }

  // Shift along the node's own axes so the remaining area stays in place.
  const [[a, b, tx], [c, d, ty]] = node.relativeTransform;
  node.resize(newWidth, newHeight);
  node.relativeTransform = [
    [a, b, tx + a * insets.left + b * insets.top],
    [c, d, ty + c * insets.left + d * insets.top],
  ];
  node.fills = newFills;
  return null;
}

/**
 * Insets (negative, so they extend) that grow the node to show the whole image
 * at its current scale, keeping the image in place on the canvas.
 */
function uncropInsets(node: SceneNode): Insets | SkipReason {
  const paint = imagePaints(node)[0];
  if (!paint) return SkipReason.NoImageFill;
  const { width, height } = node;
  const transform = currentImageTransform(paint, width, height);
  if (!transform || transform[0][1] !== 0 || transform[1][0] !== 0) {
    return SkipReason.UnsupportedScaleMode;
  }
  const [[sx, , tx], [, sy, ty]] = transform;
  const left = (-width * tx) / sx;
  const top = (-height * ty) / sy;
  return {
    top,
    right: width - left - width / sx,
    bottom: height - top - height / sy,
    left,
  };
}

/** Removes any crop so the whole image is shown. Separate from the preview. */
export async function uncrop(selection: readonly SceneNode[]): Promise<CropResult> {
  await loadImageSizes(selection);
  let cropped = 0;
  const skipped = new Map<SkipReason, number>();
  for (const node of selection) {
    const insets = uncropInsets(node);
    const reason = typeof insets === "string" ? insets : cropNode(node, insets);
    if (reason === null) {
      cropped++;
    } else {
      skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
    }
  }
  return { cropped, skipped: [...skipped] };
}

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Nodes cropped by the current preview and the insets applied to each, so a new value
 * only crops or extends by the difference and manual edits in between are kept.
 */
const preview = new Map<string, { node: SceneNode; insets: Insets }>();

/** Bumped whenever the preview ends, so an in-flight `applyPreview` stops after its await. */
let generation = 0;

function cropTo(node: SceneNode, target: Insets): SkipReason | null {
  const current = preview.get(node.id)?.insets ?? ZERO;
  const delta = {} as Insets;
  for (const side of SIDES) delta[side] = target[side] - current[side];
  const reason = cropNode(node, delta);
  if (reason === null) preview.set(node.id, { node, insets: target });
  return reason;
}

export async function applyPreview(
  selection: readonly SceneNode[],
  target: Insets
): Promise<CropResult | null> {
  const started = generation;
  await loadImageSizes(selection);
  if (generation !== started) return null;

  let cropped = 0;
  const skipped = new Map<SkipReason, number>();
  for (const node of selection) {
    const reason = cropTo(node, target);
    if (reason === null) {
      cropped++;
    } else {
      skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
    }
  }
  return { cropped, skipped: [...skipped] };
}

/** Undoes the preview. Synchronous so it can run on plugin close. */
export function revertPreview() {
  generation++;
  for (const { node } of preview.values()) {
    if (!node.removed) cropTo(node, ZERO);
  }
  preview.clear();
}

/** Keeps the preview. */
export function commitPreview() {
  generation++;
  preview.clear();
}
