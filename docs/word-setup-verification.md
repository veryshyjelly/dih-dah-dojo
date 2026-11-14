# Word setup and shared tool icons

Word training now uses the same compact listening-pace strip as Stories, an
alphabetical chip picker with pressed states, selected-letter count and bulk
selection actions, grouped length/vocabulary/response controls, and a distinct
Start area. Empty selections disable Start. The prior raw repertoire textbox is
replaced by the letter picker. Existing word generation/filtering and practice
behavior are unchanged.

Both Words and Stories use the existing circular tool-header badge and Lucide
outlined icons. Section labels and main actions have matching icons. Story cards
use themed icons drawn from the same installed family. Decorative icons are hidden
from accessibility APIs and text labels are retained.

Desktop and compact previews were inspected at 1440px and 320px. Browser checks
exercise keyboard chip toggling, selected counts, clear/all actions, empty-pool
behavior, real playback, stable feedback, story resume, both themes, and visible
header/card icons. TypeScript/Vite/API build, Prettier, whitespace checks and strict
OpenSpec validation passed. This is a frontend change; native records, backend,
scoring, timing and adaptive policy remain unchanged. Physical timing remains
unverified and the existing timing gate stays open.

Frontend deployment: `5f64ed1f-2088-42a1-bfe3-3826a0245399` at
https://dojo.veryshyjelly.in/tools. No backend deployment was required.

All 75 browser checks passed across Chromium, WebKit desktop and iPhone emulation.
Live anonymous verification confirmed 26 letter chips, clear/all selection controls,
empty-selection Start protection, shared header icons, six story-card icons,
compact layout and no browser errors.
