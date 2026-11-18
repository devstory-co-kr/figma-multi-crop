# Figma Multi Crop

Crops multiple selected images at once by `Top`, `Right`, `Bottom` and `Left` (px).

[Install from Figma Community](https://www.figma.com/community/plugin/1704706631503885318)

## Usage

1. Select layers with image fills.
2. Run `Multi Crop` and enter how many pixels to cut from each side. The crop is applied as you type.
   - Drag the side letter (`T`, `R`, `B`, `L`) left or right to change its value. Hold `Shift` to change it 10x faster.
3. Click `Reset` to undo the crop, or just close the plugin or change the selection to keep it.

- Undo a kept crop with `Ctrl/Cmd + Z`.
- Click `Uncrop` to remove any existing crop and show the whole image. The layer grows to fit it, keeping the image in place.

- Uses Figma's native image crop, so the original image is kept and can be re-adjusted with Figma's crop tool.
- The remaining area stays in place on the canvas (rotated layers included).
- Already cropped images are cropped further from their current state.
- Skipped layers: no image fill, layers with children, `FIT` / `TILE` / rotated images, and crops larger than the layer.

## Development

```sh
npm install
npm run watch      # development build
npm run build      # production build
npm run typecheck
```

In Figma Desktop: `Plugins → Development → Import plugin from manifest...` and choose `manifest.json`.
