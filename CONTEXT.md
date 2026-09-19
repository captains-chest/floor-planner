# Floor planner

A local-first metric floor planner: import a drawing, calibrate scale, then place walls, rooms, and objects.

## Language

**Floor plan**:
The drawing: background image, scale, layers, walls, rooms, objects, groups, measurements, and viewport.
_Avoid_: document, model, project (the exported file is a project file; the thing being edited is the floor plan)

**Selection**:
Which items on the floor plan are the current pick.
_Avoid_: highlight, focus

**Layer**:
A named grouping of walls, rooms, and objects that can be hidden or locked. New items go on the active layer.

**Wall**:
A segment with thickness, on a layer.

**Room**:
An axis-aligned rectangle on a layer, with a category (kitchen, bedroom, …).

**Object**:
A placed rectangle, circle, or ellipse on a layer. May belong to a group.
_Avoid_: furniture, shape (shape is only the kind: rect/circle/ellipse)

**Group**:
A set of objects that move and rotate together.

**Measurement**:
A dimension line between two points on the floor plan.

**Scale**:
The calibration that maps a length on the drawing to meters.
_Avoid_: zoom (that is viewport)

**Viewport**:
Pan and zoom onto the floor plan. Saved with the floor plan.

**Clipboard**:
The objects (and their groups) last copied, waiting to be pasted onto the active layer.
