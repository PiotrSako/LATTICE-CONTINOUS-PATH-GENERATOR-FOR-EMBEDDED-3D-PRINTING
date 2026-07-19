# Lattice algorithms

## Registry

Path generation is pluggable. The `ALGOS` registry in `index.html`:

```js
ALGOS.name = {
  id:'name',
  build:function(P){
    return { path, layerOf };
  }
};
```

- `path` — list of `[x, y, z]` points in mm, **in print order**
- `layerOf[i]` — layer number of point `i` (read by the simulation)

Contract: the returned path is **one continuous line**. The rest of the app
(visualization, simulation, G-code, JSON, statistics) hooks up automatically.

---

## SAKO

Named by the project author. A continuous triangle wave driven in a
serpentine, with layers interlocking at the peaks.

### Height rule

The whole geometry reduces to one condition:

```
a point is high (Z = z_base + z_amp) when (column + row + layer) is odd
otherwise it is low (Z = z_base)
```

This is an interlocking 3D "checkerboard". Three consequences:

1. **Adjacent columns are in antiphase** — a peak of one falls where the
   valley of the next is. The teeth interleave.
2. **Connectors between columns alternate** — one slopes up, the next down.
3. **Each layer is in antiphase to the previous one** — the low points of
   layer `n+1` (Z = z_base) land exactly on the peaks of layer `n`. That is
   where welding happens.

### Walkthrough (example: pitch 10, z_amp 10, extent 100×100)

Layer 1, column 0 — zig-zag in Z on every Y step:

```
X0 Y0   Z0
X0 Y10  Z10
X0 Y20  Z0
...
X0 Y100 Z0      ← end of column
```

Connector to column 1 — **slope up**:

```
X10 Y100 Z10
```

Column 1 returns with decreasing Y, ends high:

```
X10 Y90 Z0
X10 Y80 Z10
...
X10 Y0  Z10     ← end of column
```

Connector to column 2 — **slope down** (alternation):

```
X20 Y0 Z0
```

…and so on to `X100`. End of layer 1: `X100 Y100 Z0`.

### Layer transition

Layer 2 **does not start with a vertical climb**. It slides down a slope onto
the nearest peak of layer 1 and weaves perpendicularly across its peaks:

```
X100 Y100 Z0    ← end of layer 1
X90 Y100 Z10    ← slide down onto a peak
X80 Y100 Z20    ← arc over a valley
X70 Y100 Z10    ← on a peak again
...
```

Two tricks in `build()` make this happen:

- skipping the first "high" corner of the new layer (`pts.shift()` while the
  starting point is high) — hence the sloped entry instead of a vertical one;
- removing the duplicated node when the new layer starts exactly where the
  previous one ended (otherwise a zero-length move would appear).

Layer order is chosen so the start is closer to the previous layer's end
(`reverse()` when the other end is closer) — minimizing connector length.

### Woodpile

With `woodpile` enabled, every other layer is rotated 90° (rows run along X
instead of Y). Crossing layers produce a real 3D lattice. Disabling it gives
a stack of parallel walls.

---

## Modes: classic / rounded

### classic

Sharp triangle wave. Points from the height rule connected by straight
segments.

### rounded

A spline passing through **exactly the same points** as classic. The triangle
wave becomes sinusoidal — visually close to gyroid fill.

**Why a spline through the points, not corner cutting?** Because the peaks
(Z10) are the welding nodes with the next layer. Classic corner rounding cuts
the tip — peaks would drop and layers would stop touching. A spline through
the points preserves the nodes exactly.

**Why centripetal Catmull-Rom (alpha = 0.5)?** Because the path turns 180° at
every serpentine edge. Uniform Catmull-Rom produces loops and overshoots
there; the centripetal parameterization has a mathematical guarantee of no
cusps and no self-intersections.

**Why doesn't Z overshoot?** The zig-zag is regular: at a peak both
neighboring points lie lower, so the spline's maximum falls exactly at the
node, not above it. Z range in rounded = Z range in classic (a test guards
this).

**Blending with the straight line.** The output point is
`lerp(straight, spline, strength)`:

| strength | result |
|---|---|
| 0 | exactly classic (segment midpoint `[0,5,5]`) |
| 1 | full sinusoid (segment midpoint `[0,5,6.25]`) |

This makes the slider a smooth transition rather than a binary choice.
Using Hermite with zero tangents, `strength=0` would give a smoothstep curve
instead of a straight line — hence linear blending.

### Known behavior

The spline bulges **outside the outline** at serpentine turnarounds: with a
10 mm pitch, about 1.2 mm beyond the nominal 100×100 (X: −0.73…100.73). This
is the natural price of a smooth turnaround. Z stays untouched, and DripLab
centers the object anyway, so in practice it only changes the sample's
footprint by ~2 mm.

### Cost

| | points | length | note |
|---|---|---|---|
| classic | 721 | 100% | |
| rounded (8 seg.) | 5761 | ~103% | more silicone, longer print |

If the Ender stutters, drop to 4–6 segments — the visual difference is small.

---

## Adding a new algorithm

1. Add an entry to `ALGOS` + its `id` to `ALGO_ORDER`.
2. Add `<id>_tag` (one sentence) and `<id>_desc` (description) keys to
   **both** `I18N` dictionaries.
3. Run `node tools/test.js`.

The panel card and everything else hooks up automatically.

If the algorithm has its own options (like `mode` in SAKO), render them in
`buildAlgos` inside a container within the card and call
`buildControls(host, list, false)` — `false` disables label registration in
`labelEls` (otherwise they would duplicate on every card rebuild).

### Candidates

- **classic woodpile** — straight parallel lines, 90° rotation per layer, no
  Z zig-zag. The robocasting reference.
- **helix / spiral** — continuous, great for flow calibration in gel.
- **BCC** — slanted struts in mid-air; the gel makes it possible, but plan
  the path to minimize starts/stops.
