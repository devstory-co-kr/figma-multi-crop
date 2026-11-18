export enum Side {
  Top = "top",
  Right = "right",
  Bottom = "bottom",
  Left = "left",
}

export const SIDES: readonly Side[] = [Side.Top, Side.Right, Side.Bottom, Side.Left];

export const SIDE_LABELS: Record<Side, string> = {
  [Side.Top]: "Top",
  [Side.Right]: "Right",
  [Side.Bottom]: "Bottom",
  [Side.Left]: "Left",
};

export type Insets = Record<Side, number>;

export enum SkipReason {
  NoImageFill = "no image fill",
  HasChildren = "has children",
  UnsupportedScaleMode = "FIT, TILE or rotated image",
  CropTooLarge = "crop is larger than the layer",
}

export type CropResult = { cropped: number; skipped: [SkipReason, number][] };

export enum MessageType {
  Preview = "preview",
  Reset = "reset",
  Uncrop = "uncrop",
  Selection = "selection",
  Result = "result",
  Resize = "resize",
}

/** UI -> plugin */
export type UiMessage =
  | { type: MessageType.Preview; insets: Insets }
  | { type: MessageType.Reset }
  | { type: MessageType.Uncrop }
  | { type: MessageType.Resize; height: number };

/** Plugin -> UI */
export type PluginMessage =
  | { type: MessageType.Selection; imageCount: number }
  | { type: MessageType.Result; result: CropResult };
