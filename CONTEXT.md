# Floor planner

A local-first metric floor planner: import a drawing, calibrate scale, then place objects.

## Language

**Floor plan**:
The drawing: background image, scale, objects, groups, measurements, and viewport.
_Avoid_: document, model, project (the exported file is a project file; the thing being edited is the floor plan)

**Selection**:
Which items on the floor plan are the current pick.
_Avoid_: highlight, focus

**Object**:
A placed rectangle, circle, or ellipse. May belong to a group.
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
The objects (and their groups) last copied, waiting to be pasted.
