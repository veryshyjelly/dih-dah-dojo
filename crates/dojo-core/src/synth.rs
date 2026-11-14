//! Allocation-free sample renderer. Owns immutable, already-compiled schedule data.
use crate::timing::Schedule;
use std::f64::consts::TAU;

pub struct Synth {
    schedule: Schedule,
    segment: usize,
    frame: u64,
    phase: f64,
    phase_step: f64,
    table: [f32; 4096],
    ramp_frames: u64,
    stop_remaining: Option<u64>,
    stopped: bool,
}
impl Synth {
    pub fn new(schedule: Schedule, frequency: f64) -> Result<Self, &'static str> {
        if !frequency.is_finite()
            || frequency <= 0.0
            || frequency >= schedule.sample_rate as f64 / 2.0
        {
            return Err("tone frequency must be positive and below Nyquist");
        }
        let mut table = [0.0; 4096];
        for (i, v) in table.iter_mut().enumerate() {
            *v = (TAU * i as f64 / 4096.0).sin() as f32;
        }
        let ramp_frames = (schedule.sample_rate as f64 * 0.005).round().max(1.0) as u64;
        let phase_step = frequency * 4096.0 / schedule.sample_rate as f64;
        Ok(Self {
            schedule,
            segment: 0,
            frame: 0,
            phase: 0.0,
            phase_step,
            table,
            ramp_frames,
            stop_remaining: None,
            stopped: false,
        })
    }
    /// Reset transport at a known schedule boundary; no allocation or phase reset.
    pub fn seek(&mut self, frame: u64) {
        self.frame = frame.min(self.schedule.frames);
        self.segment = self
            .schedule
            .segments
            .partition_point(|s| s.end <= self.frame)
            .min(self.schedule.segments.len().saturating_sub(1));
        self.stop_remaining = None;
        self.stopped = false;
    }
    pub fn frame(&self) -> u64 {
        self.frame
    }
    pub fn done(&self) -> bool {
        self.stopped || self.frame >= self.schedule.frames
    }
    pub fn stop(&mut self) {
        if self.stop_remaining.is_none() {
            self.stop_remaining = Some(self.ramp_frames);
        }
    }
    pub fn sample(&mut self) -> f32 {
        if self.done() {
            return 0.0;
        }
        while self.segment + 1 < self.schedule.segments.len()
            && self.frame >= self.schedule.segments[self.segment].end
        {
            self.segment += 1;
        }
        let segment = self.schedule.segments[self.segment];
        let mut gain = 0.0;
        if segment.tone {
            let len = segment.end - segment.start;
            let ramp = self.ramp_frames.min(len / 2).max(1);
            let edge = (self.frame - segment.start).min(segment.end - 1 - self.frame);
            gain = if edge < ramp {
                0.5 - 0.5 * (std::f64::consts::PI * edge as f64 / ramp as f64).cos()
            } else {
                1.0
            };
        }
        if let Some(remaining) = self.stop_remaining {
            gain *= remaining as f64 / self.ramp_frames as f64;
            self.stop_remaining = Some(remaining.saturating_sub(1));
            if remaining <= 1 {
                self.stopped = true;
            }
        }
        let value = self.table[self.phase as usize] * gain as f32 * 0.2;
        self.phase = (self.phase + self.phase_step) % 4096.0;
        self.frame += 1;
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timing::Timing;
    #[test]
    fn gaps_and_ramps_preserve_exact_schedule() {
        let schedule = Schedule::compile("ET", Timing::new(20.0, 20.0).unwrap(), 48000).unwrap();
        let segments = schedule.segments.clone();
        let total = schedule.frames;
        let mut synth = Synth::new(schedule, 600.0).unwrap();
        for frame in 0..total {
            let value = synth.sample();
            assert!(value.is_finite() && value.abs() <= 0.2);
            let segment = segments
                .iter()
                .find(|s| frame >= s.start && frame < s.end)
                .unwrap();
            if !segment.tone || frame == segment.start || frame == segment.end - 1 {
                assert_eq!(value, 0.0);
            }
        }
        assert!(synth.done());
        assert_eq!(synth.sample(), 0.0);
    }
    #[test]
    fn stop_is_bounded_and_idempotent() {
        let mut synth = Synth::new(
            Schedule::compile("T", Timing::new(20.0, 20.0).unwrap(), 48000).unwrap(),
            600.0,
        )
        .unwrap();
        for _ in 0..1000 {
            synth.sample();
        }
        let before = synth.frame();
        synth.stop();
        synth.stop();
        while !synth.done() {
            synth.sample();
        }
        assert_eq!(synth.frame() - before, 240);
        assert_eq!(synth.sample(), 0.0);
    }
}
