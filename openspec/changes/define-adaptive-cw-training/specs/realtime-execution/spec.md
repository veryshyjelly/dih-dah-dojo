## Purpose

Keep native Rust audio delivery and timestamped input independent of terminal
rendering, learner computation, and history I/O.

## ADDED Requirements

### Requirement: Native sample-clock audio
The application SHALL use native Rust CPAL/CoreAudio output with callback-owned sample-frame timing and precompiled schedules. Its application audio callback SHALL perform no dynamic allocation or deallocation, locking, blocking communication, disk/network access, logging, or learner computation.

#### Scenario: Slow terminal rendering
- **WHEN** terminal drawing stalls during a block
- **THEN** the prepared audio schedule continues independently and input capture does not wait for the next draw

#### Scenario: Expensive scoring
- **WHEN** exact scoring takes longer than expected
- **THEN** scoring remains off the callback and the next adaptive block waits for a complete model rather than blocking active character playback

### Requirement: Bounded transport and faults
Real-time communication SHALL use preallocated bounded queues or fixed-width atomic controls. Input or callback telemetry loss SHALL compromise the affected block and request silence or termination rather than silently treating infrastructure loss as a learner mistake. Emergency stop/pause SHALL bypass queued rendering and scoring work.

#### Scenario: Telemetry queue overflow
- **WHEN** the callback cannot publish a required audio marker
- **THEN** it records an atomic loss condition and silences or aborts the block without blocking or allocating

#### Scenario: No rescue response
- **WHEN** rescue starts and the analysis worker stops responding
- **THEN** callback frame limits end extra silence within four seconds

#### Scenario: Stop while rendering stalls
- **WHEN** the learner requests stop while the UI is blocked
- **THEN** the input and transport control path can request a fade to silence without waiting for a redraw

### Requirement: Honest latency acceptance
The application SHALL distinguish input receipt time, scheduled output time, backend delivery estimates, and measured physical output delay. Latency targets in engineering-design.md SHALL be validated on the selected device route before claiming that route meets them.

#### Scenario: Unmeasured device
- **WHEN** a device or route has not undergone the measurement protocol
- **THEN** its timing estimates are identified as unverified rather than advertised as measured low latency

#### Scenario: Device replacement
- **WHEN** the active audio device changes during training
- **THEN** the active block is compromised and a new stream/timestamp epoch is established before scored playback resumes
