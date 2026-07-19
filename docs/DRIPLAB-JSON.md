# JSON format — path import (DripLab)

The `.json` export is compatible with the path import of the **DripLab**
slicer (the "⭳ Upload paths (JSON)" button in the *Path generator* section).

## Data model

```
point  = [x, y, z]                  # MILLIMETERS; z optional (default 0)
       = {"x":.., "y":.., "z":..}   # alternatively an object
line   = [point, point, ...]        # continuous extrusion (min. 2 points)
object = [line, line, ...]          # one figure made of many lines
```

## Recommended shape

```json
{
  "objects": [
    [
      [[0, 0, 0], [10, 0, 0.2], [10, 10, 0.4]],
      [[0, 5, 0], [8, 5, 0.3]]
    ],
    [
      [[40, 0, 0], [50, 0, 0.2]]
    ]
  ]
}
```

- `objects` = a list of **separate figures**. The slicer performs a lift
  (park + descend) **between objects**, and **prints continuously within an
  object**.

## Shorthand formats (also accepted)

| Shape | Meaning |
|---|---|
| `{ "objects": [ [line,...], ... ] }` | many objects (recommended) |
| `{ "paths": [ line, ... ] }` | one object made of many lines |
| `{ "points": [ point, ... ] }` | one object, one line |
| `[ line, ... ]` | one object |
| `[ point, ... ]` | one line |

## Rules

- **Units:** millimeters.
- **Point order = print order.**
- **Line order within an object = print order**; there is no needle jump
  between lines of the same object.
- **XY position is arbitrary** — the slicer **centers** the object on the bed.
- **Z:** only relative height matters; the lowest point lands at Z=0.
- **Minimum line:** 2 points (shorter ones are skipped).
- **Leniency:** missing `z` = 0; unrecognized fields are ignored.

---

## How we map our path

The whole body is **one unbroken line**, so the export is:

```json
{"objects":[[[[0,0,0.2],[0,10,10.2],[0,20,0.2], ... ]]]}
```

**one object → one line → all points.**

This is deliberate: splitting layers into separate lines would be
syntactically valid, but the slicer would insert needle jumps exactly where
we care about continuity. One object with one line guarantees a continuous
extrusion from start to finish.

Implementation: `buildJson()` in `index.html`.

## What the format does NOT carry

The specification covers **geometry only**. There are no fields for
extrusion, speeds or flow — and unrecognized fields are ignored, so adding
them achieves nothing (and the `INVARIANT 5` test guards this: only the
`objects` key is allowed).

In practice the division of roles looks like this:

| | `.json` (DripLab) | `.gcode` (Marlin) |
|---|---|---|
| needle path | ✅ | ✅ |
| `E per mm`, speeds, `M900` | ❌ set in DripLab | ✅ baked into the file |
| XY position | ❌ slicer centers | ✅ as in the panel |
| Z base | ❌ lowest point → Z=0 | ✅ as in the panel |

In short: going through DripLab, you set extrusion parameters on its side.
If you want everything baked into the file — use `.gcode`.
