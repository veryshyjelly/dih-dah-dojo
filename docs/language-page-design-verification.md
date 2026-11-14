# Words and Stories page design

Both destinations now use the open page shell and two-line accent typography of
Practice. The enclosing toolbox panel is visually removed for setup, with a
focused separate card retained for active playback and feedback.

Words has a prominent launch card, current requested pace instrument, live filter
summary and primary Start action. Round choices and editable pace are separate
supporting cards. The alphabet sits in a sage sidebar on desktop, with count,
bulk choices and a quiet listening note. On small screens the layout stacks in
reading order and a text pace summary replaces the dial. The alphabet uses fewer
columns on phones for larger touch targets.

Stories has a separate pace toolbar and a curated shelf. The opening story spans
two columns/two rows on wide screens, with a subtle code-native river illustration;
remaining stories use compact cards. Tablet uses two columns and phones one.
Descriptions never reveal transmission sentences. Character guides retain their
own keyboard-operable disclosures and do not start playback. Progress summaries
are separate quiet panels with text links rather than large form buttons.

Visual fixtures cover light/dark at 1440, 780 and 320px:
`/tmp/dojo-redesign-{words,stories}-{light,dark}-{1440,780,320}.png`.
The wide Words, compact Words and wide light Stories screenshots were reviewed
and refined for count wrapping, pace contrast, illustration and reading order.
Existing tests cover audio, hidden answers, replay, pause, stable feedback,
bookmarks, deep links, letter selection and progress. A new setup check verifies
live launch settings, sidebar placement and featured-story disclosure independence.

This is a presentation change. Audio timing, history formats, sync and scoring
are preserved. Browser evidence uses software audio and simulated input; real
mobile hardware and physical audio/input timing remain unverified. The physical
timing gate remains open.

Validation passed: production TypeScript/Vite/API build, formatting, whitespace,
strict OpenSpec validation, deployment dry run and staged Gitleaks scan. The full
browser run passed 99 regression checks; the additional live-setup check passed
on Chromium, WebKit desktop and iPhone emulation after form labels were clarified
(three focused checks). No scoring, storage or audio producer behavior changed.

Production frontend version: `acab00df-b9d8-4a6c-904d-a6a64713087c`.
Anonymous live smoke passed for the standalone hierarchy, live requested pace,
six story cards with a featured entry, independent character disclosure and
320px layout, with no page errors. Production screenshots are
`/tmp/dojo-redesign-words-live.png`, `/tmp/dojo-redesign-stories-live.png` and
`/tmp/dojo-redesign-stories-live-compact.png`. Backend release and production
learner records were not changed.
