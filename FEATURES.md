# Muse — Feature Register

Comprehensive audit of drawing canvas features. Benchmarked against Excalidraw, tldraw, and draw.io.

Legend: `[x]` = shipped, `[~]` = partial, `[ ]` = missing

---

## 1. Shapes & Elements

### Core shapes
- [x] Rectangle
- [x] Ellipse
- [x] Diamond
- [ ] Triangle
- [ ] Hexagon, pentagon, octagon, star
- [ ] Cloud, heart, parallelogram, trapezoid
- [ ] Rounded rectangle (separate from rx=3 default)
- [ ] Sticky note / callout shape
- [ ] Custom shape definitions (SVG/stencil import)

### Other element types
- [x] Freehand drawing (path tool)
- [x] Connectors (line + arrow)
- [ ] Standalone text element (not inside a shape)
- [ ] Image element (drag-and-drop or upload)
- [ ] Frame / container (groups children, clips overflow)
- [ ] Table / grid shape
- [ ] Embed (iframe — YouTube, Figma, etc.)

---

## 2. Connectors & Arrows

### Binding
- [x] Arrow attaches to shape — follows when shape moves
- [~] Attachment points — 4 cardinal midpoints only
- [ ] Arbitrary edge attachment (click anywhere on perimeter)
- [ ] Snap-to-midpoint when cursor is close (with configurable threshold)
- [ ] Visual connection dots on hover (at available attachment points)

### Routing
- [x] Straight path
- [x] Elbow / orthogonal path (simple H-V-H)
- [x] Bezier curve path
- [ ] Smart elbow routing (avoids overlapping shapes)
- [ ] Waypoints (user-placed intermediate control points)
- [ ] Curved elbow (rounded corners on orthogonal segments)

### Arrowheads
- [x] Standard triangle arrowhead on end
- [x] Configurable arrowStart / arrowEnd booleans
- [ ] Arrowhead style picker (triangle, open, diamond, circle, none)
- [ ] Crowfoot / ERD notation heads
- [ ] UML notation heads

### Free-floating
- [x] Arrow tool draws on empty canvas without shapes
- [x] Arrow can start on shape, end in free space (and vice versa)
- [ ] Line tool also allows free endpoints (currently shape-to-shape only)

### Endpoint editing
- [x] Selected connector shows endpoint drag handles
- [x] Dragging endpoint re-attaches to a different shape
- [x] Dragging endpoint to empty space makes it free
- [ ] Double-click connector to add/edit waypoints

### Labels
- [ ] Connector label (text on a connector midpoint)
- [ ] Label follows connector when it re-routes

---

## 3. Styling

### Color
- [x] Stroke color (via property panel, raw hex input)
- [x] Fill color (via property panel, raw hex input)
- [ ] Color palette picker (preset swatches — 12-16 colors)
- [ ] Custom color picker (hue/saturation wheel or spectrum)
- [ ] Transparent / no-fill option (checkbox or "none" swatch)
- [ ] Recently used colors
- [ ] Gradient fill

### Stroke
- [x] Stroke width (numeric input)
- [ ] Stroke width presets (thin / medium / bold / extra-bold)
- [ ] Stroke style: solid, dashed, dotted
- [ ] Stroke line cap (round, square, butt)

### Fill patterns
- [ ] Solid fill (current default)
- [ ] Hachure fill (hand-drawn lines)
- [ ] Cross-hatch fill
- [ ] Zigzag fill
- [ ] Semi-transparent / pattern fills

### Shape appearance
- [ ] Corner radius control (adjustable roundness)
- [ ] Opacity slider (0-100%)
- [ ] Shadow toggle (drop shadow)
- [ ] Hand-drawn / sketchy rendering mode (roughjs-style)

### Style workflow
- [ ] Copy style (Cmd+Shift+C)
- [ ] Paste style (Cmd+Shift+V)
- [ ] Set as default style for new shapes
- [ ] Style persistence — new shapes use last-used fill/stroke

---

## 4. Text

### Shape text
- [x] In-shape text editing (double-click)
- [x] Textarea for multi-line input
- [ ] Text alignment: horizontal (left / center / right)
- [ ] Text alignment: vertical (top / middle / bottom)
- [ ] Text wrapping vs overflow behavior
- [ ] Auto-resize shape to fit text

### Standalone text
- [ ] Text tool (T hotkey) — click canvas to place text element
- [ ] Text element with no shape border (raw text on canvas)

### Formatting
- [ ] Font family picker (sans-serif, serif, mono, hand-drawn)
- [ ] Font size control
- [ ] Bold / italic
- [ ] Text color (separate from shape stroke)
- [ ] Hyperlinks in text

---

## 5. Selection & Interaction

### Selecting
- [x] Click to select single element
- [x] Shift-click to add/remove from selection
- [x] Marquee drag to select multiple elements
- [ ] Select all (Cmd+A)
- [ ] Deselect all (Escape — currently switches tool)
- [ ] Tab to cycle through elements
- [ ] Select all shapes / select all connectors (filtered selection)

### Grouping
- [ ] Group selected elements (Cmd+G)
- [ ] Ungroup (Cmd+Shift+G)
- [ ] Double-click group to enter and edit children
- [ ] Nested groups

### Locking
- [ ] Lock element (prevents selection, drag, edit)
- [ ] Unlock element
- [ ] Visual lock indicator

### Z-ordering
- [ ] Bring to front (Cmd+Shift+])
- [ ] Bring forward (Cmd+])
- [ ] Send backward (Cmd+[)
- [ ] Send to back (Cmd+Shift+[)

### Alignment (multi-select)
- [ ] Align left / right / top / bottom
- [ ] Center horizontal / center vertical
- [ ] Distribute horizontally / vertically (even spacing)

### Transform
- [x] Drag to move shape
- [x] Resize via 8 handles (4 corners + 4 edges)
- [x] Minimum size enforced on resize
- [ ] Rotation handle (+ Shift snaps to 15° increments)
- [ ] Flip horizontal / vertical
- [ ] Constrained resize (Shift = maintain aspect ratio)
- [ ] Centered resize (Alt = grow from center)
- [ ] Snap to grid while dragging/resizing
- [ ] Snap to other elements (alignment guidelines)

---

## 6. Clipboard & History

### Clipboard
- [ ] Copy (Cmd+C)
- [ ] Cut (Cmd+X)
- [ ] Paste (Cmd+V) — at cursor position
- [ ] Duplicate (Cmd+D) — offset clone
- [ ] Alt+drag to clone element

### History
- [ ] Undo (Cmd+Z)
- [ ] Redo (Cmd+Shift+Z)
- [ ] History survives page reload (persisted undo stack)

---

## 7. Canvas & Navigation

### Pan & zoom
- [x] Infinite canvas
- [x] Scroll wheel zoom (around cursor)
- [x] Space+drag to pan
- [x] Middle-click drag to pan
- [ ] Hand tool (H hotkey) — dedicated pan mode
- [ ] Zoom to fit all elements (Shift+1)
- [ ] Zoom to selection (Shift+2)
- [ ] Zoom to 100% (Cmd+0)
- [ ] Zoom level indicator in UI
- [ ] Minimap / outline panel
- [ ] Pinch-to-zoom on trackpad

### Grid & guides
- [ ] Toggle grid display
- [ ] Snap-to-grid (configurable grid size)
- [ ] Dynamic alignment guides (smart guides when dragging near other shapes)
- [ ] Rulers (top + left)

### Canvas settings
- [ ] Dark mode toggle
- [ ] Background color setting
- [ ] Zen mode / focus mode (hide all UI)

---

## 8. Keyboard Shortcuts

### Tool switching (currently implemented)
- [x] V — select
- [x] R — rectangle
- [x] O — ellipse
- [x] D — diamond
- [x] P — draw/pencil
- [x] L — line
- [x] A — arrow
- [x] Escape — back to select + deselect
- [ ] T — text tool
- [ ] H — hand/pan tool
- [ ] E — eraser tool
- [ ] G — color picker shortcut

### Editing shortcuts (all missing)
- [x] Delete/Backspace — delete selected
- [ ] Cmd+Z — undo
- [ ] Cmd+Shift+Z — redo
- [ ] Cmd+C / Cmd+X / Cmd+V — clipboard
- [ ] Cmd+D — duplicate
- [ ] Cmd+A — select all
- [ ] Cmd+G — group
- [ ] Cmd+Shift+G — ungroup
- [ ] Cmd+] / Cmd+[ — z-order
- [ ] F2 — edit text label

---

## 9. Export & Import

### Export
- [ ] Export as PNG (with resolution options)
- [ ] Export as SVG
- [ ] Export as PDF
- [ ] Export as JSON (native format for re-import)
- [ ] Copy to clipboard as PNG/SVG
- [ ] Embed scene data in PNG/SVG (round-trip editing)
- [ ] Transparent background option

### Import
- [ ] Import native JSON
- [ ] Import image (PNG/JPG/SVG → image element on canvas)
- [ ] Import from Mermaid text syntax
- [ ] Paste image from clipboard

---

## 10. Collaboration (via Yjs)

- [x] Real-time multi-user editing (Yjs + WebSocket)
- [x] Live cursor positions
- [ ] User presence indicators (colored cursors with names)
- [ ] Selection awareness (see what others have selected)
- [ ] Viewport awareness (see where others are looking)
- [ ] Follow mode (camera follows another user)

---

## 11. Property Panel

### Current state
- [x] Appears when single element selected
- [x] Fill color input (hex)
- [x] Stroke color input (hex)
- [x] Stroke width input (numeric)
- [x] Line type selector (straight/elbow/curve) for connectors

### Missing
- [ ] Proper color picker widget (swatches + custom)
- [ ] Transparent/no-fill toggle
- [ ] Stroke style (solid/dashed/dotted)
- [ ] Opacity slider
- [ ] Text formatting controls
- [ ] Position & size readout (x, y, w, h)
- [ ] Rotation input
- [ ] Corner radius input
- [ ] Arrowhead style pickers (start/end)
- [ ] Panel for multi-select (shared properties)
- [ ] Connector label input

---

## 12. Tools (Toolbar)

### Currently in toolbar
- [x] Select (V)
- [x] Rectangle (R)
- [x] Ellipse (O)
- [x] Diamond (D)
- [x] Draw / pencil (P)
- [x] Line (L)
- [x] Arrow (A)
- [x] Line type sub-selector (straight / elbow / curve)

### Missing from toolbar
- [ ] Text tool (T)
- [ ] Hand / pan tool (H)
- [ ] Eraser tool (E)
- [ ] Image insert
- [ ] Frame tool
- [ ] More shape flyout (triangle, hexagon, star, etc.)
- [ ] Zoom controls (+/−/fit)

---

## Priority tiers

### P0 — Table stakes (users expect these)
1. Undo / redo
2. Copy / paste / duplicate
3. Color palette picker (swatches + transparent)
4. Stroke style (solid / dashed / dotted)
5. Opacity control
6. Select all (Cmd+A)
7. Z-ordering (4 operations)
8. Grouping / ungrouping
9. Standalone text tool
10. Snap-to-grid + grid toggle
11. Export PNG / SVG
12. Hand tool (H)

### P1 — Core quality (differentiates from toy)
1. Rotation handle on shapes
2. Alignment & distribution (multi-select)
3. Arrowhead style picker
4. Connector labels
5. Arbitrary edge attachment points (not just midpoints)
6. Smart alignment guides (snap to other shapes while dragging)
7. Font family / size controls
8. Style persistence (new shapes use last-used style)
9. Copy/paste style
10. Zoom to fit / zoom controls in UI
11. Import/export native JSON
12. Image insertion

### P2 — Power features (makes it serious)
1. Waypoints on connectors
2. Smart elbow routing (obstacle avoidance)
3. More shape types (triangle, hexagon, star, cloud)
4. Frame/container elements
5. Layers panel
6. Dark mode
7. Minimap
8. Find/replace text in canvas
9. Presentation mode
10. Mermaid import
11. User presence indicators (colored cursors + names)
12. Follow mode

### P3 — Ecosystem (platform-level)
1. Shape libraries (importable shape packs)
2. Custom shape definitions
3. Plugin/extension API
4. Table shapes
5. Embed elements (iframes)
6. Template gallery
7. Visio import
8. Math/LaTeX in text
9. Auto-layout algorithms
10. Command palette
