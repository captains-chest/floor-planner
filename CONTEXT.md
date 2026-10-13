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

**Furniture library**:
The built-in list of ready-made pieces (name, shape, typical size). Placing one creates an ordinary object with that name and size; the object keeps no link to the library.
_Avoid_: calling placed objects "furniture"

**Group**:
A set of objects that move and rotate together.

**Measurement**:
A dimension line between two points on the floor plan.

**Scale**:
The calibration that maps a length on the drawing to meters.
_Avoid_: zoom (that is viewport)

**Viewport**:
Pan and zoom onto the floor plan. Saved with the floor plan.

**Helper lines**:
The background grid on the floor plan. The space between lines is a length in the chosen unit.
_Avoid_: guides, rulers

**Clipboard**:
The objects (and their groups) last copied, waiting to be pasted.
