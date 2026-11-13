## Purpose
Generate precise character timing and account for Farnsworth spacing and rescue.

## ADDED Requirements

### Requirement: PARIS timing
The system SHALL calculate dot duration as 1.2/C and spacing unit as (60/E-31*(1.2/C))/19 with 0<E<=C, using 3 spacing units between characters and 7 between words, and cumulative sample-boundary rounding.

#### Scenario: Equal speeds
- **WHEN** C and E both equal 20
- **THEN** dot duration is 60 ms and character/word gaps are 180/420 ms

#### Scenario: Farnsworth
- **WHEN** C=20 and E=10
- **THEN** dots remain 60 ms while PARIS duration becomes six seconds

#### Scenario: Invalid timing
- **WHEN** E exceeds C or either speed is nonpositive
- **THEN** the timing configuration is rejected

### Requirement: Delivered pace accounting
The system SHALL report rescue-adjusted effective WPM as E*T0/(T0+R) and actual non-space character throughput as 60*N/(T0+R), excluding response-tail typing time.

#### Scenario: Rescue time
- **WHEN** a six-second scheduled block gains four seconds of rescue
- **THEN** rescue-adjusted WPM is 0.6 times nominal E

#### Scenario: Response tail
- **WHEN** typing continues after audio completion
- **THEN** transmission WPM remains unchanged and completion lag is retained
