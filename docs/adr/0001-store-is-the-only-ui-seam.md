# PlannerStore is the only UI seam

UI modules inject one owner (`PlannerStore`). Selection policy and floor-plan edits (including undo) live in in-process modules behind that seam, not as extra injectables. Splitting Layer/Clipboard/History/Selection into UI-facing owners would widen the seam the deepening is meant to shrink.

**Considered Options**: UI talks to the new modules directly; hybrid where canvas injects Selection. Rejected: one adapter is already there, a second would be hypothetical.
