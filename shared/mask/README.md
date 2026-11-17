# Glyph Matrix LED mask (Phone 3)

`matrix-mask.txt` is the 25x25 grid of positions that have a physical LED (`#`) or none (`.`).
Row-major, row 0 at the top, column 0 at the left (index = y*25 + x).

Rule: a cell (x, y) has an LED when (x-12)^2 + (y-12)^2 <= 154. This yields exactly 489 LEDs, matching Nothing's spec.

Verified on a real Phone (3) (spike task 2.1): sending value 255 to all 625 positions lit exactly this area,
and a frame using only this mask looked identical. Orientation verified with an asymmetric "L" (not mirrored/rotated).
