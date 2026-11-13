//! Optional bounded measurements on coordinator/UI lanes; never called by audio/input capture.
use std::{
    fs::{File, OpenOptions},
    io::{self, Write},
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};

const QUANTUM_NS: u64 = 100_000;
const BUCKETS: usize = 1001;
struct Histogram {
    bins: Vec<AtomicU64>,
    count: AtomicU64,
    max: AtomicU64,
}
impl Default for Histogram {
    fn default() -> Self {
        Self {
            bins: (0..BUCKETS).map(|_| AtomicU64::new(0)).collect(),
            count: AtomicU64::new(0),
            max: AtomicU64::new(0),
        }
    }
}
impl Histogram {
    fn record(&self, nanoseconds: u64) {
        let index = nanoseconds.div_ceil(QUANTUM_NS).min((BUCKETS - 1) as u64) as usize;
        self.bins[index].fetch_add(1, Ordering::Relaxed);
        self.max.fetch_max(nanoseconds, Ordering::Relaxed);
        self.count.fetch_add(1, Ordering::Relaxed);
    }
    fn p99_upper_ns(&self) -> Option<u64> {
        let count = self.count.load(Ordering::Relaxed);
        if count == 0 {
            return None;
        }
        let rank = count - count / 100;
        let mut total = 0;
        for (index, bin) in self.bins.iter().enumerate() {
            total += bin.load(Ordering::Relaxed);
            if total >= rank {
                return Some(if index == BUCKETS - 1 {
                    self.max.load(Ordering::Relaxed)
                } else {
                    index as u64 * QUANTUM_NS
                });
            }
        }
        None
    }
    fn lines(&self, name: &str) -> String {
        format!(
            "{name}_count={}\n{name}_p99_upper_ns={}\n{name}_max_ns={}\n",
            self.count.load(Ordering::Relaxed),
            self.p99_upper_ns()
                .map_or_else(|| "unavailable".into(), |v| v.to_string()),
            self.max.load(Ordering::Relaxed)
        )
    }
}
#[derive(Default)]
pub struct Measurements {
    input: Histogram,
    view: Histogram,
    draw: Histogram,
    render: Histogram,
    last_input_sequence: AtomicU64,
    sequence_gaps: AtomicU64,
    coalesced_views: AtomicU64,
    audio_frames: AtomicU64,
    sample_rate: AtomicU64,
    buffer_min: AtomicU64,
    buffer_max: AtomicU64,
    deadline_misses: AtomicU64,
    clock_residual: AtomicU64,
    saved_records: AtomicU64,
    compromised_blocks: AtomicU64,
    fault: AtomicBool,
}
impl Measurements {
    pub fn input(&self, sequence: u64, elapsed: Duration) {
        self.input.record(ns(elapsed));
        let previous = self.last_input_sequence.swap(sequence, Ordering::Relaxed);
        self.sequence_gaps
            .fetch_add(sequence.saturating_sub(previous + 1), Ordering::Relaxed);
    }
    pub fn draw(&self, age: Duration, duration: Duration) {
        self.view.record(ns(age));
        self.draw.record(ns(duration));
    }
    pub fn coalesced_view(&self) {
        self.coalesced_views.fetch_add(1, Ordering::Relaxed);
    }
    pub fn audio(&self, frames: u32, rate: u32, render_ns: u64) {
        self.render.record(render_ns);
        self.sample_rate.store(rate as u64, Ordering::Relaxed);
        self.audio_frames
            .fetch_add(frames as u64, Ordering::Relaxed);
        self.buffer_min
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |old| {
                Some(if old == 0 {
                    frames as u64
                } else {
                    old.min(frames as u64)
                })
            })
            .ok();
        self.buffer_max.fetch_max(frames as u64, Ordering::Relaxed);
        if rate > 0 && render_ns >= frames as u64 * 1_000_000_000 / rate as u64 {
            self.deadline_misses.fetch_add(1, Ordering::Relaxed);
        }
    }
    pub fn clock_residual(&self, value: u64) {
        self.clock_residual.fetch_max(value, Ordering::Relaxed);
    }
    pub fn fault(&self) {
        self.fault.store(true, Ordering::Relaxed);
    }
    pub fn saved(&self, compromised: bool) {
        self.saved_records.fetch_add(1, Ordering::Relaxed);
        if compromised {
            self.compromised_blocks.fetch_add(1, Ordering::Relaxed);
        }
    }
    fn report(&self, success: bool) -> String {
        let mut output = format!(
            "status={}\nmeasurement=software_receipt_and_terminal_draw_completion\nphysical_keyboard_and_display_measured=false\nphysical_loopback_performed=false\nhistogram_quantum_ns={QUANTUM_NS}\n",
            if success { "completed" } else { "failed" }
        );
        for (name, histogram) in [
            ("input_receipt_to_coordinator", &self.input),
            ("view_submission_to_draw_completion", &self.view),
            ("draw", &self.draw),
            ("audio_render", &self.render),
        ] {
            output.push_str(&histogram.lines(name));
        }
        for (name, counter) in [
            ("input_sequence_gaps", &self.sequence_gaps),
            ("coalesced_views", &self.coalesced_views),
            ("audio_frames", &self.audio_frames),
            ("sample_rate", &self.sample_rate),
            ("actual_buffer_min", &self.buffer_min),
            ("actual_buffer_max", &self.buffer_max),
            ("callback_deadline_misses", &self.deadline_misses),
            ("max_rolling_clock_residual_p99_ns", &self.clock_residual),
            ("saved_records", &self.saved_records),
            ("compromised_blocks", &self.compromised_blocks),
        ] {
            output.push_str(&format!("{name}={}\n", counter.load(Ordering::Relaxed)));
        }
        output.push_str(&format!("fault={}\n", self.fault.load(Ordering::Relaxed)));
        output
    }
}
fn ns(duration: Duration) -> u64 {
    duration.as_nanos().min(u64::MAX as u128) as u64
}
pub struct Report {
    file: File,
    pub measurements: Arc<Measurements>,
}
impl Report {
    pub fn create(path: &Path) -> io::Result<Self> {
        Ok(Self {
            file: OpenOptions::new().write(true).create_new(true).open(path)?,
            measurements: Arc::new(Measurements::default()),
        })
    }
    pub fn finish(mut self, success: bool) -> io::Result<()> {
        self.file
            .write_all(self.measurements.report(success).as_bytes())?;
        self.file.sync_all()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_histogram_has_conservative_percentiles_and_preserves_overflow_maximum() {
        let histogram = Histogram::default();
        assert_eq!(histogram.p99_upper_ns(), None);
        for _ in 0..99 {
            histogram.record(1_000_001);
        }
        histogram.record(200_000_000);
        assert_eq!(histogram.p99_upper_ns(), Some(1_100_000));
        histogram.record(300_000_000);
        assert_eq!(histogram.p99_upper_ns(), Some(300_000_000));
        assert_eq!(histogram.bins.len(), BUCKETS);
        assert_eq!(histogram.count.load(Ordering::Relaxed), 101);
    }
}
