# Room Mask Demo

This repository contains a lightweight TypeScript web demo for defining 1-bit raster room masks with interactive tools similar to Photoshop/GIMP selection utilities. The project features a drag-and-drop landing page and an immersive room definition workspace with brush, eraser, lasso, magnetic lasso, and magic wand tools.

## Getting started

```bash
npm run build
```

This command compiles the TypeScript source into the `dist/` directory. Open `index.html` in any modern browser (or serve the directory with your preferred static server) to try the demo locally.

## Features

- Drag-and-drop image uploader with instant preview and a `Define Room` launcher.
- Fullscreen room editor overlay:
  - Displays the uploaded image with layered canvas rendering.
  - Toolbar with New Room, Paintbrush Select, Eraser, Lasso, Magnetic Lasso, and Magic Wand tools.
  - Room list sidebar with editable room names.
- Raster masks stored per-room and rendered as translucent overlays for immediate visual feedback.

The project is designed to be deployed on Cloudflare Pages via GitHub import without additional build tooling beyond TypeScript.