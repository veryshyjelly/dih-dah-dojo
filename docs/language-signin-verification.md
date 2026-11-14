# Contextual language sign-in

Guests now see an account invitation on Words setup, the story library and both
language progress tabs. It explains cross-device account synchronization and
that existing guest activity remains in the browser without automatic import.
The primary action opens the existing Google/GitHub dialog. Closing it preserves
the destination and setup. Signed-in learners and active practice do not show
the invitation. Guest exploration and local progress remain available.

The prompt reuses the shared palette, outlined Cloud icon, card treatment and
primary button. Both themes were checked at 320px and 1440px. Cropped visual
fixtures: `/tmp/dojo-signin-word-dark.png` and
`/tmp/dojo-signin-progress-light-compact.png`.

Verification includes six dedicated browser checks across Chromium, WebKit desktop
and iPhone emulation: four guest routes in both themes/sizes, dialog opening and
dismissal, route retention, active-practice absence and signed-in absence using
an account fixture. The broader run passed the 39 existing language/practice and
progress checks. The missing setup render connection found by the new checks was
fixed before publication. Production build, formatting, whitespace and strict
OpenSpec validation are required before release.

No OAuth configuration/callback, backend, scoring, ownership or persistence format
changes are involved. Physical audio/input timing remains unverified and its gate
remains open. Production smoke is anonymous and does not change learner records.

Production frontend version: `b9521ac8-b181-4770-b2fb-888d229a05bb`.
Anonymous production smoke passed on all four destinations, including provider
dialog opening/dismissal, compact layout and absence of page errors. The final
primary button treatment was visually captured in both themes. Build, formatting,
whitespace, strict OpenSpec validation, deployment dry run and staged Gitleaks
scan passed. No production learner records were changed.
