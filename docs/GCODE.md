# G-code output (Marlin)

Contract of what `buildGcode()` generates. Target: **Ender 3 / Marlin**,
syringe head, printing in a gel bath.

## File structure

```gcode
; ---- continuous lattice (triangle-wave woodpile) ----
; algorithm: SAKO / rounded (strength=1, segments=8)
; pitch=10 z_amp=10 x_max=100 y_max=100 layers=6 woodpile
G21          ; mm
G90          ; XYZ absolute
M83          ; RELATIVE extruder (uniform flow)
M900 K0.8    ; Linear Advance (optional)
G92 E0
G0 X0.000 Y0.000 Z0.200 F1500      ; the only travel move — to the start point
G1 F600                             ; print feedrate
G1 X0.000 Y10.000 Z10.200 E0.7071
G1 X0.000 Y20.000 Z0.200 E0.7071
...
; end
```

Comments switch together with the UI language (EN/PL).

## Rules

### One `G0`, the rest `G1`

Exactly one travel move — to the start point. From that moment the needle
**never stops extruding**: consecutive layers are joined by an extruding
move, not a jump. In a gel bath there is no reason to retract or park.

### `M83` — relative extruder

Every `G1` carries **its own portion** of `E`, not an accumulated value. All
the flow logic rests on this; switching to `M82` would require cumulative
recalculation.

### `E` proportional to segment length

```
E = e_per_mm × dist(previous, current)
```

This is the essence of uniform flow. Segments have **different lengths** — a
diagonal tooth at pitch 10 / z_amp 10 is `√(10² + 10²) ≈ 14.14 mm`, while a
connector between columns is only 10 mm. Constant `E` per move would blob in
one place and starve in another.

With `e_per_mm = 0.05` the tooth gets `E0.7071` (0.05 × 14.142).

### Feedrate

`F` is set once, after the travel move. Plunger speed is constant, so with
`E ∝ dist` the flow is even.

## Parameters

| `P` field | Effect on G-code |
|---|---|
| `e_per_mm` | `E` multiplier — the main flow knob |
| `feed_print` | `G1 F…` |
| `feed_travel` | `G0 F…` (the only travel move) |
| `m900on` / `m900_k` | the `M900 K…` line |
| `z0` | Z base of the first layer (offset from the bath bottom) |

## Linear Advance (`M900`)

Optional, off by default. With a syringe the system compliance is much larger
than in FDM (silicone is compressible, the tube and plunger flex), so
pressure rises and falls with a delay. `M900 K…` compensates for this in
software — in DIW it usually improves line starts, ends and corners more
than in regular printing.

Requires firmware with `LIN_ADVANCE` enabled.

## Calibration

1. Start with a small `e_per_mm` and raise it until the bead is continuous.
2. Slow down `feed_print` — DIW rarely likes FDM speeds.
3. Only then tune `K` (`M900`).
4. `rounded` with 8 segments produces ~5.7k short moves. If Marlin stutters,
   drop to 4–6 segments or slow down.

## What is not here

No heating, cooling, homing or start sequence — the file contains **the path
only**. Add your start sequence on your side (or hard-code it in
`buildGcode` if it should be constant).
