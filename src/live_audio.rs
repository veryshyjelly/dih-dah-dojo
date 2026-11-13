//! Persistent native output with prepared-engine handoff and off-callback retirement.
use crate::{
    audio::AudioResult,
    transport::{Controls, Event, EventKind, Kernel, Prepared},
};
use cpal::{
    FromSample, SizedSample,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use rtrb::{Consumer, Producer, RingBuffer};
use std::{
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
    },
    time::Instant,
};

pub struct LiveOutput {
    stream: cpal::Stream,
    ready: Producer<Box<Prepared>>,
    retired: Consumer<Box<Prepared>>,
    pub events: Consumer<Event>,
    pub controls: Arc<Controls>,
    pub fault_kind: Arc<AtomicU8>,
    pub sample_rate: u32,
    pub description: String,
}
impl LiveOutput {
    pub fn open(controls: Arc<Controls>, origin: Instant) -> AudioResult<Self> {
        let device = cpal::default_host().default_output_device().ok_or(
            "no output device available; progress/history remain accessible without audio",
        )?;
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
        let fault_kind = Arc::new(AtomicU8::new(0));
        let mut last_error = None;
        for size in [Some(128), Some(256), None] {
            if size.is_some_and(|value| min > 0 && (value < min || value > max)) {
                continue;
            }
            config.buffer_size = size.map_or(cpal::BufferSize::Default, cpal::BufferSize::Fixed);
            let (ready, receive) = RingBuffer::new(2);
            let (retire, retired) = RingBuffer::new(2);
            let (publish, events) = RingBuffer::new(8192);
            let kernel = Kernel::new(receive, retire, publish, controls.clone());
            let result = match format {
                cpal::SampleFormat::F32 => {
                    build::<f32>(&device, config, kernel, origin, fault_kind.clone())
                }
                cpal::SampleFormat::F64 => {
                    build::<f64>(&device, config, kernel, origin, fault_kind.clone())
                }
                cpal::SampleFormat::I16 => {
                    build::<i16>(&device, config, kernel, origin, fault_kind.clone())
                }
                cpal::SampleFormat::U16 => {
                    build::<u16>(&device, config, kernel, origin, fault_kind.clone())
                }
                _ => return Err(format!("unsupported native output format {format:?}").into()),
            };
            match result {
                Ok(stream) => {
                    stream.play()?;
                    return Ok(Self {
                        stream,
                        ready,
                        retired,
                        events,
                        controls,
                        fault_kind,
                        sample_rate: config.sample_rate,
                        description: format!(
                            "CoreAudio {format:?}, {} Hz, {} channels, {:?} requested",
                            config.sample_rate, config.channels, config.buffer_size
                        ),
                    });
                }
                Err(error) => last_error = Some(error),
            }
        }
        Err(last_error
            .ok_or("no usable native stream configuration")?
            .into())
    }
    pub fn submit(&mut self, engine: Box<Prepared>) -> AudioResult<()> {
        self.collect_retired();
        if self.controls.fault.load(Ordering::Acquire) {
            return Err("audio stream fault; reopen before training".into());
        }
        if self.controls.busy.swap(true, Ordering::AcqRel) {
            return Err("audio transport is still busy".into());
        }
        self.controls.stop.store(false, Ordering::Release);
        self.controls.pause.store(false, Ordering::Release);
        self.controls.rescue.store(0, Ordering::Release);
        self.controls.cancel_rescue.store(0, Ordering::Release);
        self.controls.release_rescue.store(0, Ordering::Release);
        if self.ready.push(engine).is_err() {
            self.controls.busy.store(false, Ordering::Release);
            return Err("prepared audio queue full; block not started".into());
        }
        Ok(())
    }
    pub fn collect_retired(&mut self) {
        while let Ok(engine) = self.retired.pop() {
            drop(engine);
        }
    }
}
impl Drop for LiveOutput {
    fn drop(&mut self) {
        self.controls.stop.store(true, Ordering::Release);
        let _ = self.stream.pause();
    }
}
fn build<T: SizedSample + FromSample<f32>>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    mut kernel: Kernel,
    origin: Instant,
    fault_kind: Arc<AtomicU8>,
) -> Result<cpal::Stream, cpal::Error> {
    let error_controls = kernel.controls.clone();
    let channels = config.channels as usize;
    device.build_output_stream(
        config,
        move |data: &mut [T], info| {
            let start = Instant::now();
            let timestamp = info.timestamp();
            let clock = Event {
                kind: EventKind::Clock,
                block: 0,
                character: (data.len() / channels) as u32,
                frame: kernel.output_frame,
                device_callback_ns: timestamp
                    .callback
                    .duration_since(cpal::StreamInstant::ZERO)
                    .as_nanos()
                    .min(u64::MAX as u128) as u64,
                device_playback_ns: timestamp
                    .playback
                    .duration_since(cpal::StreamInstant::ZERO)
                    .as_nanos()
                    .min(u64::MAX as u128) as u64,
                host_ns: start
                    .duration_since(origin)
                    .as_nanos()
                    .min(u64::MAX as u128) as u64,
                value: 0,
            };
            kernel.emit(clock);
            kernel.begin_callback();
            for frame in data.chunks_mut(channels) {
                let value = T::from_sample(kernel.sample());
                frame.fill(value);
            }
            let mut stats = Event::marker(EventKind::RenderStats, 0, channels, kernel.output_frame);
            stats.value = start.elapsed().as_nanos().min(u64::MAX as u128) as u64;
            stats.character = (data.len() / channels) as u32;
            kernel.emit(stats);
        },
        move |error| {
            fault_kind.store(
                match error.kind() {
                    cpal::ErrorKind::Xrun => 2,
                    cpal::ErrorKind::DeviceChanged => 3,
                    cpal::ErrorKind::RealtimeDenied => 4,
                    _ => 5,
                },
                Ordering::Release,
            );
            error_controls.fault.store(true, Ordering::Release);
        },
        None,
    )
}
