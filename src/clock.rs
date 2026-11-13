//! Online-only translation from device timestamps/sample frames to the session clock.
use crate::transport::{Event, EventKind};
use std::collections::VecDeque;
#[derive(Default)]
pub struct ClockMap {
    offsets: VecDeque<i128>,
    last_backend: Option<u64>,
    anchor: Option<(u64, u64, i128)>,
    pub residual_p99_ns: u64,
}
impl ClockMap {
    pub fn observe(&mut self, event: Event) -> Result<(), &'static str> {
        if event.kind != EventKind::Clock {
            return Err("expected a clock anchor");
        }
        if self
            .last_backend
            .is_some_and(|old| event.device_callback_ns < old)
        {
            return Err("audio device clock moved backwards; start a new stream epoch");
        }
        self.last_backend = Some(event.device_callback_ns);
        self.offsets
            .push_back(event.host_ns as i128 - event.device_callback_ns as i128);
        if self.offsets.len() > 64 {
            self.offsets.pop_front();
        }
        let mut values: Vec<_> = self.offsets.iter().copied().collect();
        values.sort_unstable();
        let median = values[(values.len() - 1) / 2];
        let mut residuals: Vec<_> = values
            .iter()
            .map(|v| v.abs_diff(median).min(u64::MAX as u128) as u64)
            .collect();
        residuals.sort_unstable();
        self.residual_p99_ns = residuals[((0.99 * residuals.len() as f64).ceil() as usize) - 1];
        self.anchor = Some((event.frame, event.device_playback_ns, median));
        Ok(())
    }
    pub fn estimate(&self, frame: u64, rate: u32) -> Result<u64, &'static str> {
        if rate == 0 {
            return Err("zero audio sample rate");
        }
        let (anchor, playback, offset) = self.anchor.ok_or("no playback timestamp anchor")?;
        let delta = (frame as i128 - anchor as i128) * 1_000_000_000 / rate as i128;
        let estimate = playback as i128 + offset + delta;
        u64::try_from(estimate).map_err(|_| "playback estimate outside the session clock")
    }
    pub fn calibrated(&self) -> bool {
        self.offsets.len() >= 8
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn point(frame: u64, device: u64, host: u64) -> Event {
        Event {
            kind: EventKind::Clock,
            block: 0,
            character: 128,
            frame,
            device_callback_ns: device,
            device_playback_ns: device + 5_000_000,
            host_ns: host,
            value: 0,
        }
    }
    #[test]
    fn frame_mapping_uses_only_observed_clock_pairs_and_reports_uncertainty() {
        let mut map = ClockMap::default();
        assert!(map.estimate(0, 48000).is_err());
        map.observe(point(0, 1_000_000_000, 10_000_000)).unwrap();
        assert_eq!(map.estimate(48, 48000).unwrap(), 16_000_000);
        for i in 1..8 {
            map.observe(point(
                i * 128,
                1_000_000_000 + i * 3_000_000,
                10_000_000 + i * 3_000_000,
            ))
            .unwrap();
        }
        assert!(map.calibrated());
        assert_eq!(map.residual_p99_ns, 0);
        assert!(map.observe(point(0, 1, 20_000_000)).is_err());
    }
}
