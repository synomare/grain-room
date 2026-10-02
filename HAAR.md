# ずれる色階 — v0.18

2026-10-02. Added `haar` / ずれる色階 and three looks in v0.18, bringing the catalog to 71 effects / 87 looks.

## One primary source and adaptation

[Stollnitz, DeRose & Salesin, Wavelets for Computer Graphics: A Primer, Part 1, 1995](https://graphics.stanford.edu/courses/cs148-10-summer/docs/1995--stollnitz_derose_salesin--wavelets_for_graphics_1.pdf). Read section 2.1 for pairwise averages/differences and section 3.1, PDF pages 4–5, for the nonstandard two-dimensional decomposition; section 3.2 identifies its square supports.

Each 2×2 block becomes LL/H/V/D: signed sums divided by two, an orthonormal transform under the discrete Euclidean norm. Only LL is transformed recursively. Inverse signed sums recover the image. This implementation uses independently written block formulas and reflected padding; rectangular fields stop when either dimension reaches one.

Independent artistic operations move detail coefficients within their own scale, mix horizontal/vertical coefficients with a rotation, offset channels, apply soft thresholding and amplify selected bands. Finer bands can be attenuated. The final image includes a controllable original-resolution residual. No image assets or source code from the paper were incorporated. This is neither a compression implementation nor a physical material solver. The transform is real; the coefficient edits are our own visual adaptation.

## Visual direction and changes

Catalog-first distinction: unlike mosaic's region means or adaptive tiles' subdivision, this edits signed directional differences at several nested scales while leaving the low-frequency approximation coefficients intact. Unlike FFT phase manipulation it has local square supports. Recent growth, optical fringes, Newton basins and Radon projections remain separate mechanisms.

- `chromatic-parquet` / 色の寄木: displaced coarse detail bands, channel separation and original fine texture.
- `woven-edges` / 織り込む輪郭: fine directional edits concentrate the transformation around edges.
- `quiet-blocks` / 静かな色塊: no coefficient displacement or channel split; broad rotated planes with 40% fine detail retained.

Same color/calla/architecture photos, original/default/three looks at 720px. All final boards inspected, plus individual quiet color and woven architecture outputs. First woven version clipped white calla edges too strongly; gain 240→165 and movement 35→20 reduced the harsh rim. Quiet initially retained too much fine structure; finer-band attenuation was added. Zero fine detail then erased the photo too much, so the final look restores 40% and lowers threshold 85→30. The final settings give each look a different balance of coarse color planes and fine detail.

Remaining limits: deliberately axis-aligned stair steps can dominate organic contours; saturated coefficient changes clip; dense architecture looks fractured. At very narrow dimensions only the supported transform levels operate. The field is at most 512px long edge before power-of-two padding; preserved residuals do not imply full-resolution transformed coefficients. Local 720px effect times were 98–139ms, not phone performance evidence.

## Validation

- Focused pre-suite review covered orthonormal signs/scaling, reflected boundaries (including one-pixel dimensions), odd/even sizes, finite support levels, mean preservation and residual alignment.
- 116 tests pass on final source: seven new tests cover an independent 4×4 basis matrix, inverse/Parseval energy/constant-field limits, directional rotation energy and unchanged mean, reflection/threshold/fine-band limits, seed/determinism/input preservation/exact neutral output, all historical versions, assets, thin images, control extremes, monochrome and exact zero mix.
- All 70 pre-edit effect hashes unchanged on the 48×64 fixture. Old engine allowlists include 0.17. Radon's 70-effect/84-look historical snapshot is now `tests/v017-catalog.json`; photoelastic uses its existing historical snapshot so future effects are not assumed to exist in old engines. All 60 public recipe JSON assets match their catalog layers.
- Build and check:release pass: engine 0.18, 70 manifest files. Existing canvas-first UI and original preview-quality implementation unchanged.
- Installed Edge / Playwright, production `/grain-room/`, 1440×1000 and 390×844: recipe selection, gain 180→100→180 on both widths with checksum restoration, original comparison, 1024×1536 preview and exported PNG with zero differing RGBA bytes. Console warnings/errors 0; desktop/mobile overflow false. Main photo and controls inspected. Temporary Edge/server exited in finally; no listener on 5179.
- Real Safari/phone performance, maximum-resolution/long-duration load, and OS save completion remain unverified.
