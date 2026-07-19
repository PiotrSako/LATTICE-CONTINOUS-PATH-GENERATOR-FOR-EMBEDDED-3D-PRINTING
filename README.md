# Lattice DIW — G-code generator

Generator of continuous **lattice** toolpaths for syringe-extruded silicone
printed into a gel bath (DIW / embedded printing), with 3D visualization and
print simulation. Target machine: **Ender 3 / Marlin**.

**▶ Live demo:** https://piotrsako.github.io/LATTICE-CONTINOUS-PATH-GENERATOR-FOR-EMBEDDED-3D-PRINTING/

The app is a single HTML file — no build step, no dependencies, works offline.

```bash
open index.html      # that's all
```

## Why this is not a regular slicer

Printing embedded in gel inverts several FDM assumptions. The gel supports
freshly extruded silicone, so the needle can travel through mid-air, at an
angle, and across spans — and **retractions and travel moves are unnecessary**.
That is why the whole body is generated as **one unbroken line**: from the
first point to the last, the needle never stops extruding.

This forces a different approach to geometry than copying metal lattices
(those are made by powder sintering and have thin struts converging at
nodes — not something a needle can extrude).

## Features

- **Continuous path** — a single `G0` at the start, then only `G1`, zero retractions.
- **Uniform flow** — `E` computed proportionally to each segment's length
  (relative extruder `M83`), so the bead has constant thickness regardless of
  whether a segment is long or short.
- **3D visualization** — path colored by Z height, mouse rotation, zoom.
- **Print simulation** — the nozzle follows the real path in time computed
  from the actual feedrate; 1×–500× speed, scrubbing, layer and XYZ readout.
- **Export** — Marlin `.gcode` and `.json` in the **DripLab** format.
- **Bilingual** — EN / PL (switcher in the top-right corner).

## The SAKO algorithm

The only algorithm implemented so far (named by the project author).

The needle zig-zags in Z on every Y step, snakes along X in a serpentine, and
each next layer **descends onto the peaks of the previous one** and weaves
perpendicular to it (woodpile). Peaks of one layer meet the valleys of the
next and weld at the nodes — hence a real 3D lattice, not a stack of parallel
walls.

Two modes:

| Mode | Description |
|---|---|
| **Classic** | Sharp triangle wave, straight segments. |
| **Rounded** | Spline through **the same nodes** — a gyroid-like wave. |

`Rounded` uses a centripetal Catmull-Rom spline and passes exactly through the
`classic` points, so layer welding stays intact. The *rounding strength*
slider gives a smooth transition (0 = exactly classic, 1 = full sinusoid),
and *segments per span* controls smoothness.

Geometry details: [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md).

## Export

**`.gcode`** — ready for Marlin: `G21`/`G90`/`M83`, optional `M900`
(Linear Advance), computed `E` values and feedrates. Upload straight to the
printer.

**`.json`** — DripLab format (`{"objects":[[ [[x,y,z],...] ]]}`), pure
geometry in millimeters. The whole path is exported as **one object / one
line**, so the slicer never inserts needle jumps. Note: the format carries no
extrusion parameters or position — DripLab centers the object on the bed and
places the lowest point at Z=0. Details: [`docs/DRIPLAB-JSON.md`](docs/DRIPLAB-JSON.md).

## Parameters

| Parameter | Meaning |
|---|---|
| Pitch (X and Y) | grid cell spacing |
| Z amplitude | zig-zag height = height of one layer |
| X / Y extent | sample dimensions |
| Z base | offset from the bottom of the bath |
| Number of layers | how many stories |
| Woodpile | 90° rotation per layer (crossing = 3D lattice) |
| E per mm of path | **the main flow knob** — more = thicker bead |
| Print speed | feedrate; with a syringe usually slower than FDM |
| Linear Advance (K) | compensation for syringe-system compliance |

## Practical notes (hardware)

- **Platinum-cure silicone** (addition-cure), not acetoxy from a tube — the
  latter cures from air humidity, which the gel doesn't provide.
- **Bath:** Carbopol (transparent, yield-stress, reusable).
- Line thickness ≈ needle diameter; scale the cell to it (typically
  3–10 mm with 18–21G needles).
- First run: calibrate `E per mm` starting from small values and going up.

## Project structure

```
.
├── index.html              the app (everything: styles + HTML + JS)
├── README.md               this file
├── docs/
│   ├── ALGORITHMS.md       SAKO geometry, rounded math, how to add an algorithm
│   ├── GCODE.md            output contract for Marlin
│   └── DRIPLAB-JSON.md     DripLab import format specification
└── tools/
    └── test.js             headless tests (node, zero dependencies)
```

## Development

```bash
node tools/test.js
```

The tests run the app without a browser and guard the project invariants
(line continuity, uniform flow, untouched nodes in rounded mode, no Z
overshoot, DripLab-compliant JSON, translation completeness). Run them after
every logic change. These rules follow from the physics of printing in gel,
not from taste — geometry details are in [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md).
