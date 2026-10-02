# 投影する色譜 — v0.17

2026-10-02. Added one effect and three looks in v0.17, bringing the catalog to 70 effects / 84 looks. Included in v0.18.

## Source and independent adaptation

[A. C. Kak and Malcolm Slaney, Principles of Computerized Tomographic Imaging, chapter 3](https://engineering.purdue.edu/~malcolm/pct/CTI_Ch03.pdf), IEEE Press 1988. Read section 3.1, pp.48–55 (line integrals, projection coordinates and linearity), and section 3.3.1, pp.59–62 (filtering and backprojection).

The reference defines projections along x cos(theta) + y sin(theta) = t. This implementation independently splats pixel-centred RGB ink densities (1 minus channel) into two adjacent detector bins. Splitting weights sum to one. Angles cover pi; lookup across the angular boundary reverses the detector because P(theta+pi,t)=P(theta,-t). Detector support is zero outside the padded image diagonal. A local second difference accentuates traces. Six or more projections can also be averaged back over the image plane.

This is an artistic discrete projection operator, not calibrated tomography, a CT simulator, a physical ink process or a correct filtered inverse. In particular the local second difference is NOT the reconstruction ramp filter. RGB densities, exponential tone response, radial display, seed rotation, centre blending and optional photo memory are independent adaptations. No source figures or implementation code were incorporated.

## Visual decisions

Catalog inspected before selection: line integration and sparse backprojection differ from existing local warps, growth, optical fringes, Newton basins and density transport.

- `projection-silk` / 投影の絹: repeated angle–detector ribbons, black crossings and concentrated color.
- `radial-score` / 環状の色譜: angular projections fan around a centre on a dark backing.
- `sparse-return` / 六方向の残像: six backprojected directions retain the photo as crossed streaks and broad translucent forms.

Original/default/three looks rendered on the same color flower, white calla and architecture at 720px. All comparison boards viewed, plus individual color silk and architecture radial images and production desktop/mobile canvas screenshots. Initial radial lookup began at the detector edge and made a hard central void. Final mapping begins at detector centre and smoothly removes angle dependence in a small central region. The final mapping connects the central color. Thin bright traces, detector-grid softness and reduced architectural readability remain visible; dense images can become busy.

## Verification

- Focused pre-suite review: mass conservation, centred coordinates for odd/even dimensions, padded support, negative angular indices and detector reversal; centre singularity corrected before full tests.
- 109 tests pass (7 new). Independent axis sums, oblique mass/first moment/linearity, seam reversal and outside support, independent backprojection interpolation, seed/determinism/input preservation, all layouts, thin images, control extremes, monochrome and zero mix. Historical Newton compatibility now uses a fixed v0.16 catalog fixture (69 effects / 81 looks), allowing the current catalog to grow. Photoelastic's legacy rejection test includes the new generation; first run exposed this test expectation and the corrected full suite passed.
- All 69 pre-edit effect SHA-256 outputs unchanged on the 48×64 fixture. Every one of 57 public recipe JSON assets matches its catalog layers. All old engine allowlists retain 0.16.
- Build and check:release pass; engine 0.17, 67 manifest files. Original preview sizing and compact UI code unchanged.
- Installed Edge / Playwright production `/grain-room/`: 1440×1000 and 390×844; recipe selection, trace 65→30→65 on both widths restores checksum; original comparison; 1024×1536 preview and PNG, all RGBA bytes equal; console warning/error 0; no mobile horizontal overflow. Main photo inspected as well as controls. Temporary server/browser closed in finally.

Field long edge is 224px; radial/sinogram lookup and composition are at output dimensions, sparse backprojection is computed on the bounded field. This bounds work but does not make the effect field full resolution. 720px renders measured 94–200ms on this local runtime, not a phone performance claim. Real Safari/device performance, maximum-resolution/long-duration load and OS save completion are untested.
