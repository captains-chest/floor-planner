# Floor planner

A browser floor-planning tool. Import a scanned or photographed plan, scale it from a known length, then place simple furniture. Everything is stored locally in this browser (IndexedDB). Switch the toolbar **Units** control between meters and centimetres for both display and input.

## Run

```bash
pnpm start
```

Open `http://localhost:4200/`.

## Production image

The app is a static Angular build served by Chainguard nginx on port 8080. `:latest` tags are an accepted risk.

```bash
docker build -t floor-planner .
docker run --rm -p 8080:8080 \
  --read-only \
  --tmpfs /run \
  --tmpfs /var/lib/nginx/tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  floor-planner
```

Open `http://localhost:8080/`.


## Workflow

1. **Import image** — load a floor-plan scan, or drop an image onto the canvas.
2. **Scale** — click two ends of a length printed on the drawing, then enter the real distance (`4.25`, `425 cm`, or `4250 mm`). Hold **Alt** to snap the measure line to horizontal or vertical.
3. **Measure** (`M`) — click two points to drop a dimension line. Snaps to object corners; hold **Alt** for 90°. Select and delete measurements like other items.
4. **Objects** — place rectangles, circles, and ellipses. Set width and depth in meters; drag to move them afterwards. Shift+click to select several, then **Group** (`Ctrl+G`) so a sofa (or any set of parts) moves and rotates together. Drag a corner handle to rotate; **Alt** snaps to 45°. **Ungroup** with `Ctrl+Shift+G`. **Copy** (`Ctrl+C`) and **Paste** (`Ctrl+V`) duplicate the selected objects, offset slightly. Later objects draw on top of earlier ones; **Bring to front** (`Ctrl+Shift+]`) and **Send to back** (`Ctrl+Shift+[`) change that, or step one place with `Ctrl+]` / `Ctrl+[`.
5. **Export / Import project** — download a `.floorplan.json` file with the drawing, background image, and scale. **Import project** restores it.

Pan with the Pan tool, middle mouse, or **Space**. Scroll to zoom toward the cursor. **Fit** frames the plan.

State is saved automatically on this device. Undo / redo: `Ctrl+Z` / `Ctrl+Y`.
