# Brand asset generator

`generate.cjs` draws the app icon, Android adaptive icon layers (foreground + monochrome), the splash
lockup and the favicon from the brand geometry in `docs/brand/logo-geometry.md`. Text ("K",
"KUMMIE", "YOUR K-POP CHINGU") is converted to outlines from the OFL fonts shipped with the mobile
app, so the PNGs do not depend on installed fonts.

It needs `opentype.js` and `sharp`, which are deliberately **not** project dependencies. Install
them into a throw-away folder and pass that folder in (PowerShell):

```powershell
$deps = "$env:TEMP\kummie-icon-deps"
New-Item -ItemType Directory -Force $deps | Out-Null
npm install --prefix $deps opentype.js@1.3.4 sharp@0.34.4
node tools/brand-assets/generate.cjs $deps (Get-Location) apps/mobile/assets/images
```

Then delete `preview-monogram.png` from the output folder (it is a review image only).

Rules it follows: star rotated −20° and never recoloured outside pink/glow/white; monogram star at
~77 % of the tile with a white K; Android adaptive foreground keeps the star inside the 66 % safe
circle and drops the K (round masks); the splash uses the stacked lockup (four one-colour
equaliser bars above, star behind the K, tagline in front).
