# Prompt recognition feedback

Date: 2026-11-15. OpenSpec: `show-recognition-feedback-promptly`.

The learner confirmed that the delay concerned the expected answer, while their
typed response already appeared quickly. No React rendering-priority change was
made. The browser coordinator previously held a captured response for an extra
500 ms before closing the trial; the regression fixture measured 508.5 ms from a
post-playback keypress to feedback DOM update.

The fixed delay is removed. Feedback closes once the audio worklet has reported
completion and the Rust engine accepts the response. An explicit pending-answer
guard prevents an audio-completion callback from closing before acceptance.
Answer acknowledgements from a prior pause/finish epoch are ignored. The learner's
response remains beside the expected answer throughout feedback. Existing reading
times remain: one second after correct responses and 1.2 seconds after corrective
playback for incorrect responses.

The new browser fixtures use the actual Rust analysis worker and audio worklet.
They check a post-playback feedback budget below 400 ms (generous enough for test
environments while detecting the old fixed timer), continued answer visibility,
hidden feedback during an early response and a delayed engine acceptance. The
delay is injected before sending the answer command; its original capture time is
retained.

Verification results:

- The practice/help/feedback browser suite passed 42 checks across Chromium,
  WebKit and iPhone emulation.
- The final focused suite passed all nine checks, including late acknowledgements
  after pause. Post-playback feedback DOM updates measured 6.7 ms in Chromium and
  4.0 ms in WebKit and iPhone emulation. These are headless test observations,
  not guaranteed device latency or physical display-paint measurements.
- All nine API/WASM regression tests passed. Production TypeScript, frontend and
  server builds, Prettier, whitespace checks and strict OpenSpec validation passed.
- Wrangler dry run passed with static assets only and no bindings. The backend
  service and Rust binaries do not need a deployment for this change.

Deployed frontend version: `c555cccf-c2f5-4a50-9c3d-d8373b1c8ac4` at
`https://dojo.veryshyjelly.in`. An anonymous production demo smoke observed a
15.3 ms feedback DOM update, retained the typed response beyond 500 ms, finished
cleanly and reported no page errors. No account progress was changed. Screenshot:
`/tmp/dojo-feedback-production.png` during this session.

The original version failed both the latency regression and the delayed-answer
ordering check. Existing scoring, audio schedules, binary storage and API are
unchanged. Browser timing observations are software measurements, not physical
sound-at-ear or keyboard timing. The physical timing gate remains open.
