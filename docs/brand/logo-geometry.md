# Logo geometry — KUMMIE "Star & Sound"

The whole identity is three primitives. No other shapes are part of the mark.

## 1. The star

A 10-point CSS `clip-path` polygon on a square box, rotated **−20deg** (counter-clockwise).
Colour: `--kum-pink` on violet/ink grounds; `--kum-glow` only when it sits on ink as a
category icon; white in one-colour reversed use. Never outlined, never gradient.

```css
.kum-star {
  aspect-ratio: 1;
  background: var(--kum-pink);
  transform: rotate(-20deg);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
}
```

Equivalent SVG path on a 100×100 viewBox (rotate the group by −20° about 50,50):

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-20 50 50)">
    <path fill="#FF2E9A" d="M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z"/>
  </g>
</svg>
```

## 2. The equaliser

Six rounded bars, left to right, heights as a ratio of the bar block height H:
**0.33, 0.66, 1.00, 0.53, 0.79, 0.29**. The tallest bar (bar 3) and bar 5 are
`--kum-glow`; the rest are `--kum-pink`. Bar width = H / 10.3, gap = H / 14.4,
radius = width / 1.6. Vertically centred (not baseline-aligned) in the lockup.

At icon sizes the equaliser reduces to **four** bars: 0.35, 0.82, 0.53, 0.94, all
in one colour.

## 3. The wordmark

`KUMMIE` set in Archivo Black, all caps, tracking −0.02em, white on violet/ink,
`--kum-ink` on paper. The tagline `YOUR K-POP CHINGU` sits under it in Space Grotesk
Medium, tracking 0.26em, uppercase, in `--kum-glow` on dark grounds.

## Lockups

**Horizontal (primary).** equaliser · gap · wordmark column. The star is absolutely
positioned behind the wordmark, centred on the K, at 2.2× the cap height of the
wordmark. The wordmark column carries a left margin large enough that the star's
left point clears the last equaliser bar — for a 52px wordmark with a 115px star at
`left:-39px`, that margin is 48px. Check this relationship at every size: **the star
must never cover a bar.** Tagline sits in front of the star (`z-index: 2`).

**Stacked.** Four-bar equaliser above, wordmark with star behind the K, tagline below.
For narrow placements and social cover art.

**Monogram / app icon.** Violet squircle, rotated pink star at ~77% of the tile,
white `K` in Archivo Black centred on the star. Below 32px the K is dropped and the
star alone is the mark. On Android round masks the K is dropped too.

**One-colour.** Wordmark only, in ink or white. Used for invoices, legal pages,
embroidery, engraving, fax-quality print.

## Clear space and minimums

- Clear space on all sides = the height of the `K`.
- Minimum digital width, horizontal lockup: **140px**. Print: **30mm**.
- App icon safe area: star inside the central 66% circle.

## Prohibited

Re-colouring the star outside pink / glow / white · changing the −20° angle ·
rotating the wordmark · outlines, gradients, bevels, drop shadows · placing the
lockup on a photo without a solid violet or ink panel · combining the mark with any
artist name, group logo, album artwork or photograph · stretching or re-spacing the
letters · spinning the star (max ±6° on tap).
