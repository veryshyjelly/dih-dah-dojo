//! Native stream adapter for the hardware spike, not a validated latency guarantee.
use crate::{
    synth::Synth,
    timing::{Schedule, Timing},
};
use cpal::{
    FromSample, SizedSample,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use rtrb::{Consumer, Producer, RingBuffer};
use std::{
    error::Error,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU8, Ordering},
    },
    time::Instant,
};

pub type AudioResult<T> = Result<T, Box<dyn Error>>;
#[derive(Debug, Clone, Copy)]
pub struct Report {
    pub frames: u32,
    pub render_ns: u64,
    pub output_frame: u64,
    pub host_ns: u64,
    pub predicted_lead_ns: u64,
}
pub struct Output {
    pub stream: cpal::Stream,
    pub reports: Consumer<Report>,
    pub stop: Arc<AtomicBool>,
    pub done: Arc<AtomicBool>,
    pub fault: Arc<AtomicBool>,
    pub fault_kind: Arc<AtomicU8>,
    pub description: String,
    pub sample_rate: u32,
}
pub fn open(text: &str, c: f64, e: f64, origin: Instant) -> AudioResult<Output> {
    let device = cpal::default_host()
        .default_output_device()
        .ok_or("no output audio device")?;
    let default = device.default_output_config()?;
    let supported = device
        .supported_output_configs()?
        .find_map(|range| {
            (range.sample_format() == cpal::SampleFormat::F32
                && range.min_sample_rate() <= 48000
                && range.max_sample_rate() >= 48000)
                .then(|| range.with_sample_rate(48000))
        })
        .unwrap_or(default);
    let format = supported.sample_format();
    let mut config: cpal::StreamConfig = supported.into();
    let (min, max) = match supported.buffer_size() {
        cpal::SupportedBufferSize::Range { min, max } => (*min, *max),
        _ => (0, 0),
    };
    let stop = Arc::new(AtomicBool::new(false));
    let done = Arc::new(AtomicBool::new(false));
    let fault = Arc::new(AtomicBool::new(false));
    let fault_kind = Arc::new(AtomicU8::new(0));
    // Rebuild before playback if a requested configuration is rejected.
    let mut last_error = None;
    for size in [Some(128), Some(256), None] {
        if size.is_some_and(|v| min > 0 && (v < min || v > max)) {
            continue;
        }
        config.buffer_size = size.map_or(cpal::BufferSize::Default, cpal::BufferSize::Fixed);
        let schedule = Schedule::compile(text, Timing::new(c, e)?, config.sample_rate)?;
        let synth = Synth::new(schedule, 600.0)?;
        let (producer, consumer) = RingBuffer::new(8192);
        let build = match format {
            cpal::SampleFormat::F32 => build::<f32>(
                &device,
                config,
                synth,
                producer,
                stop.clone(),
                done.clone(),
                fault.clone(),
                fault_kind.clone(),
                origin,
            ),
            cpal::SampleFormat::I16 => build::<i16>(
                &device,
                config,
                synth,
                producer,
                stop.clone(),
                done.clone(),
                fault.clone(),
                fault_kind.clone(),
                origin,
            ),
            cpal::SampleFormat::U16 => build::<u16>(
                &device,
                config,
                synth,
                producer,
                stop.clone(),
                done.clone(),
                fault.clone(),
                fault_kind.clone(),
                origin,
            ),
            cpal::SampleFormat::F64 => build::<f64>(
                &device,
                config,
                synth,
                producer,
                stop.clone(),
                done.clone(),
                fault.clone(),
                fault_kind.clone(),
                origin,
            ),
            _ => return Err(format!("prototype does not support device format {format:?}").into()),
        };
        match build {
            Ok(stream) => {
                return Ok(Output {
                    stream,
                    reports: consumer,
                    stop,
                    done,
                    fault,
                    fault_kind,
                    description: format!(
                        "{format:?}, {} Hz, {} channels, {:?} requested (not measured)",
                        config.sample_rate, config.channels, config.buffer_size
                    ),
                    sample_rate: config.sample_rate,
                });
            }
            Err(err) => last_error = Some(err),
        }
    }
    Err(last_error.ok_or("no usable buffer configuration")?.into())
}
#[allow(clippy::too_many_arguments)]
fn build<T: SizedSample + FromSample<f32>>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    mut synth: Synth,
    mut reports: Producer<Report>,
    stop: Arc<AtomicBool>,
    done: Arc<AtomicBool>,
    fault: Arc<AtomicBool>,
    fault_kind: Arc<AtomicU8>,
    origin: Instant,
) -> Result<cpal::Stream, cpal::Error> {
    let error_fault = fault.clone();
    let error_kind = fault_kind.clone();
    let channels = config.channels as usize;
    let mut output_frame = 0u64;
    device.build_output_stream(
        config,
        move |data: &mut [T], info| {
            let start = Instant::now();
            if stop.load(Ordering::Relaxed) || fault.load(Ordering::Relaxed) {
                synth.stop();
            }
            for frame in data.chunks_mut(channels) {
                let value = T::from_sample(synth.sample());
                frame.fill(value);
            }
            let timestamp = info.timestamp();
            let predicted_lead_ns = timestamp
                .playback
                .duration_since(timestamp.callback)
                .as_nanos()
                .min(u64::MAX as u128) as u64;
            let report = Report {
                frames: (data.len() / channels) as u32,
                render_ns: start.elapsed().as_nanos() as u64,
                output_frame,
                host_ns: origin.elapsed().as_nanos() as u64,
                predicted_lead_ns,
            };
            if reports.push(report).is_err() {
                fault_kind.store(1, Ordering::Release);
                fault.store(true, Ordering::Release);
                synth.stop();
            }
            output_frame += report.frames as u64;
            if synth.done() {
                done.store(true, Ordering::Release);
            }
        },
        move |error| {
            error_kind.store(
                match error.kind() {
                    cpal::ErrorKind::Xrun => 2,
                    cpal::ErrorKind::DeviceChanged => 3,
                    cpal::ErrorKind::RealtimeDenied => 4,
                    _ => 5,
                },
                Ordering::Release,
            );
            error_fault.store(true, Ordering::Release);
        },
        None,
    )
}
impl Output {
    pub fn play(&self) -> AudioResult<()> {
        self.stream.play()?;
        Ok(())
    }
}
