# E2E Test Capability Registry

Tracks every testable capability and whether it has a test.

## Toolbar & Tool Selection
- [x] Select tool active by default — `toolbar.spec.ts`
- [x] Click tool button activates it — `toolbar.spec.ts`
- [x] Only one tool active at a time — `toolbar.spec.ts`

## Keyboard Shortcuts
- [x] V => select tool — `keyboard-shortcuts.spec.ts`
- [x] R => rectangle tool — `keyboard-shortcuts.spec.ts`
- [x] O => ellipse tool — `keyboard-shortcuts.spec.ts`
- [x] D => diamond tool — `keyboard-shortcuts.spec.ts`
- [x] P => draw tool — `keyboard-shortcuts.spec.ts`
- [x] L => line tool — `keyboard-shortcuts.spec.ts`
- [x] Escape => deselects + switches to select — `keyboard-shortcuts.spec.ts`
- [x] Delete removes selected shape — `keyboard-shortcuts.spec.ts`
- [x] Backspace removes selected shape — `keyboard-shortcuts.spec.ts`

## Shape Creation
- [x] Rectangle: drag creates rect shape (>= 10x10) — `shape-creation.spec.ts`
- [x] Ellipse: drag creates ellipse shape — `shape-creation.spec.ts`
- [x] Diamond: drag creates diamond shape — `shape-creation.spec.ts`
- [x] Undersized drag (< 10px) does NOT create a shape — `shape-creation.spec.ts`
- [x] Tool auto-switches to select after creation — `shape-creation.spec.ts`
- [x] Multiple shapes can be created — `shape-creation.spec.ts`

## Shape Interaction
- [x] Click shape selects it — `shape-interaction.spec.ts`
- [x] Click empty canvas deselects — `shape-interaction.spec.ts`
- [x] Drag shape moves it — `shape-interaction.spec.ts`
- [ ] Only one shape selected at a time
- [ ] Shape resize

## Text Editing
- [x] Double-click enters edit mode — `shape-interaction.spec.ts`
- [x] Type text updates shape label — `shape-interaction.spec.ts`
- [x] Keyboard shortcuts disabled while editing — `shape-interaction.spec.ts`
- [ ] Click outside exits edit mode
- [ ] Text survives reload

## Pan & Zoom
- [x] Scroll wheel zooms — `pan-zoom.spec.ts`
- [x] Space key shows grab cursor — `pan-zoom.spec.ts`
- [x] Cursor class changes per tool — `pan-zoom.spec.ts`
- [ ] Space+drag pans canvas
- [ ] Middle mouse button pans
- [ ] Zoom limits (0.1x–5x)
- [ ] Coordinates correct after zoom+pan

## Freehand Drawing
- [x] Draw tool + drag creates path — `drawing.spec.ts`
- [x] Draw tool works over existing shapes — `drawing.spec.ts`
- [x] Short draw does not create path — `drawing.spec.ts`
- [x] Draw tool stays active for multiple strokes — `drawing.spec.ts`
- [ ] Path can be selected
- [ ] Path can be deleted

## Lines/Connectors
- [x] Line tool: drag shape-to-shape creates connector — `lines.spec.ts`
- [x] Connection dots appear on hover — `lines.spec.ts`
- [x] Line rendered with arrowhead — `lines.spec.ts`
- [x] Dragging to empty canvas does not create line — `lines.spec.ts`
- [x] Cursor shows crosshair on shapes in line mode — `lines.spec.ts`
- [ ] Line follows shape when moved
- [ ] Line can be selected and deleted

## Persistence
- [ ] Elements survive page reload (requires server)
- [ ] Drawing state matches after reconnect

## Status Bar
- [ ] Status bar visible
- [ ] Settings button opens panel
- [ ] AI button opens panel
