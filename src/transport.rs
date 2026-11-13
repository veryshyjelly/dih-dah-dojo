//! Allocation-free persistent transport. Prepared engines are retired off-thread.
use crate::{
    synth::Synth,
    timing::{Character, Schedule},
};
use rtrb::{Consumer, Producer, PushError};
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
};

#[derive(Default)]
pub struct Controls {
    pub stop: AtomicBool,
    pub pause: AtomicBool,
    pub fault: AtomicBool,
    pub busy: AtomicBool,
    pub rescue: AtomicU64,
    pub cancel_rescue: AtomicU64,
    pub release_rescue: AtomicU64,
    pub gain_bits: AtomicU32,
}
impl Controls {
    pub fn new() -> Self {
        Self {
            gain_bits: AtomicU32::new(1.0f32.to_bits()),
            ..Self::default()
        }
    }
    pub fn volume(&self, value: u8) {
        self.gain_bits
            .store((value.min(100) as f32 / 100.0).to_bits(), Ordering::Release);
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum EventKind {
    Started,
    CharacterStart,
    CharacterEnd,
    RescueStart,
    RescueEnd,
    Paused,
    Resumed,
    Finished,
    Stopped,
    Clock,
    RenderStats,
}
#[derive(Debug, Clone, Copy)]
pub struct Event {
    pub kind: EventKind,
    pub block: u64,
    pub character: u32,
    pub frame: u64,
    pub device_callback_ns: u64,
    pub device_playback_ns: u64,
    pub host_ns: u64,
    pub value: u64,
}
impl Event {
    pub fn marker(kind: EventKind, block: u64, character: usize, frame: u64) -> Self {
        Self {
            kind,
            block,
            character: character as u32,
            frame,
            device_callback_ns: 0,
            device_playback_ns: 0,
            host_ns: 0,
            value: 0,
        }
    }
}

pub struct Prepared {
    pub id: u64,
    synth: Synth,
    characters: Vec<Character>,
    frames: u64,
    rate: u32,
    allow_rescue: bool,
    next_character: usize,
    waiting_end: bool,
    fade: Option<Fade>,
    paused: bool,
    rewind: u64,
    rescue_start: Option<u64>,
    rescues: u8,
}
#[derive(Clone, Copy)]
enum Fade {
    Stop,
    Pause,
}
impl Prepared {
    pub fn new(
        id: u64,
        schedule: Schedule,
        frequency: f64,
        allow_rescue: bool,
    ) -> Result<Box<Self>, &'static str> {
        if id == 0 {
            return Err("transport block identifier must be nonzero");
        }
        let rate = schedule.sample_rate;
        let frames = schedule.frames;
        let characters = schedule.characters.clone();
        let synth = Synth::new(schedule, frequency)?;
        Ok(Box::new(Self {
            id,
            synth,
            characters,
            frames,
            rate,
            allow_rescue,
            next_character: 0,
            waiting_end: false,
            fade: None,
            paused: false,
            rewind: 0,
            rescue_start: None,
            rescues: 0,
        }))
    }
    fn marker(&self, kind: EventKind, frame: u64) -> Event {
        Event::marker(kind, self.id, self.next_character, frame)
    }
}

pub struct Kernel {
    ready: Consumer<Box<Prepared>>,
    retired: Producer<Box<Prepared>>,
    events: Producer<Event>,
    active: Option<Box<Prepared>>,
    pending_retirement: Option<Box<Prepared>>,
    pub controls: Arc<Controls>,
    pub output_frame: u64,
}
impl Kernel {
    pub fn new(
        ready: Consumer<Box<Prepared>>,
        retired: Producer<Box<Prepared>>,
        events: Producer<Event>,
        controls: Arc<Controls>,
    ) -> Self {
        Self {
            ready,
            retired,
            events,
            active: None,
            pending_retirement: None,
            controls,
            output_frame: 0,
        }
    }
    pub fn emit(&mut self, event: Event) {
        send(&mut self.events, &self.controls, event);
    }
    pub fn begin_callback(&mut self) {
        if let Some(engine) = self.pending_retirement.take()
            && let Err(PushError::Full(engine)) = self.retired.push(engine)
        {
            self.pending_retirement = Some(engine);
            self.controls.fault.store(true, Ordering::Release);
            return;
        }
        if self.active.is_none()
            && !self.controls.fault.load(Ordering::Acquire)
            && let Ok(engine) = self.ready.pop()
        {
            self.emit(engine.marker(EventKind::Started, self.output_frame));
            self.active = Some(engine);
        }
    }
    pub fn sample(&mut self) -> f32 {
        let (value, finished) = if let Some(active) = self.active.as_mut() {
            render(active, &self.controls, &mut self.events, self.output_frame)
        } else {
            (0.0, false)
        };
        self.output_frame = self.output_frame.saturating_add(1);
        if finished {
            let engine = self.active.take().expect("finished active engine");
            if let Err(PushError::Full(engine)) = self.retired.push(engine) {
                self.pending_retirement = Some(engine);
                self.controls.fault.store(true, Ordering::Release);
            }
            self.controls.busy.store(false, Ordering::Release);
        }
        value
    }
}
fn send(events: &mut Producer<Event>, controls: &Controls, event: Event) {
    if events.push(event).is_err() {
        controls.fault.store(true, Ordering::Release);
    }
}
fn render(
    engine: &mut Prepared,
    controls: &Controls,
    events: &mut Producer<Event>,
    output: u64,
) -> (f32, bool) {
    let stopping = controls.stop.load(Ordering::Acquire) || controls.fault.load(Ordering::Acquire);
    if stopping && engine.fade.is_none() {
        if engine.paused || engine.rescue_start.is_some() {
            send(events, controls, engine.marker(EventKind::Stopped, output));
            return (0.0, true);
        }
        engine.synth.stop();
        engine.fade = Some(Fade::Stop);
    }
    if engine.fade.is_none() && !engine.paused && controls.pause.load(Ordering::Acquire) {
        let position = engine.synth.frame();
        let next = engine.characters.iter().position(|c| c.end > position);
        engine.next_character = next.unwrap_or(engine.characters.len());
        engine.rewind = next.map_or(engine.frames, |i| engine.characters[i].start);
        engine.waiting_end = false;
        if let Some(start) = engine.rescue_start.take() {
            let mut event = engine.marker(EventKind::RescueEnd, output);
            event.value = output - start;
            send(events, controls, event);
        }
        engine.synth.stop();
        engine.fade = Some(Fade::Pause);
    }
    if engine.paused {
        if controls.pause.load(Ordering::Acquire) {
            return (0.0, false);
        }
        engine.paused = false;
        engine.synth.seek(engine.rewind);
        send(events, controls, engine.marker(EventKind::Resumed, output));
    }
    if let Some(start) = engine.rescue_start {
        let elapsed = output - start;
        if elapsed >= 4 * engine.rate as u64
            || (elapsed >= engine.rate as u64
                && controls.release_rescue.load(Ordering::Acquire) == engine.id)
        {
            engine.rescue_start = None;
            let mut event = engine.marker(EventKind::RescueEnd, output);
            event.value = elapsed;
            send(events, controls, event);
            if engine.rescues >= 2 {
                send(events, controls, engine.marker(EventKind::Finished, output));
                return (0.0, true);
            }
        } else {
            return (0.0, false);
        }
    }
    let position = engine.synth.frame();
    if engine.fade.is_none()
        && let Some(character) = engine.characters.get(engine.next_character)
    {
        if !engine.waiting_end && position == character.start {
            send(
                events,
                controls,
                engine.marker(EventKind::CharacterStart, output),
            );
            engine.waiting_end = true;
        }
        if engine.waiting_end && position == character.end {
            send(
                events,
                controls,
                engine.marker(EventKind::CharacterEnd, output),
            );
            engine.waiting_end = false;
            engine.next_character += 1;
            if engine.allow_rescue
                && engine.rescues < 2
                && controls.rescue.load(Ordering::Acquire) == engine.id
                && controls.cancel_rescue.load(Ordering::Acquire) != engine.id
            {
                controls.rescue.store(0, Ordering::Release);
                controls.release_rescue.store(0, Ordering::Release);
                engine.rescues += 1;
                engine.rescue_start = Some(output);
                send(
                    events,
                    controls,
                    engine.marker(EventKind::RescueStart, output),
                );
                return (0.0, false);
            }
        }
    }
    let gain = f32::from_bits(controls.gain_bits.load(Ordering::Acquire));
    let value = engine.synth.sample()
        * if gain.is_finite() {
            gain.clamp(0.0, 1.0)
        } else {
            0.0
        };
    if engine.synth.done() {
        if matches!(engine.fade, Some(Fade::Pause)) {
            engine.fade = None;
            engine.paused = true;
            send(
                events,
                controls,
                engine.marker(EventKind::Paused, output + 1),
            );
            return (value, false);
        }
        send(
            events,
            controls,
            engine.marker(
                if engine.fade.is_some() {
                    EventKind::Stopped
                } else {
                    EventKind::Finished
                },
                output + 1,
            ),
        );
        return (value, true);
    }
    (value, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timing::Timing;
    use rtrb::RingBuffer;
    type Harness = (
        Kernel,
        Producer<Box<Prepared>>,
        Consumer<Box<Prepared>>,
        Consumer<Event>,
    );
    fn harness(retirement_capacity: usize) -> Harness {
        let (ready, receive) = RingBuffer::new(2);
        let (retire, retired) = RingBuffer::new(retirement_capacity);
        let (events, received) = RingBuffer::new(8192);
        let controls = Arc::new(Controls::new());
        (
            Kernel::new(receive, retire, events, controls),
            ready,
            retired,
            received,
        )
    }
    fn engine(id: u64, rescue: bool) -> Box<Prepared> {
        Prepared::new(
            id,
            Schedule::compile("EE", Timing::new(20.0, 20.0).unwrap(), 1000).unwrap(),
            100.0,
            rescue,
        )
        .unwrap()
    }
    #[test]
    fn persistent_transport_reports_actual_character_frames_and_retires_ownership() {
        let (mut kernel, mut ready, mut retired, mut events) = harness(2);
        ready.push(engine(1, false)).ok().unwrap();
        kernel.controls.busy.store(true, Ordering::Release);
        kernel.begin_callback();
        for _ in 0..960 {
            kernel.sample();
        }
        assert!(retired.pop().is_ok());
        assert!(!kernel.controls.busy.load(Ordering::Acquire));
        let mut actual = Vec::new();
        while let Ok(event) = events.pop() {
            if matches!(
                event.kind,
                EventKind::CharacterStart | EventKind::CharacterEnd
            ) {
                actual.push((event.kind, event.frame));
            }
        }
        assert_eq!(
            actual,
            vec![
                (EventKind::CharacterStart, 0),
                (EventKind::CharacterEnd, 60),
                (EventKind::CharacterStart, 240),
                (EventKind::CharacterEnd, 300)
            ]
        );
    }
    #[test]
    fn rescue_is_character_bounded_and_does_not_depend_on_coordinator_release() {
        let (mut kernel, mut ready, _retired, mut events) = harness(2);
        ready.push(engine(1, true)).ok().unwrap();
        kernel.controls.rescue.store(1, Ordering::Release);
        kernel.begin_callback();
        for _ in 0..4960 {
            kernel.sample();
        }
        let mut start = None;
        let mut end = None;
        while let Ok(event) = events.pop() {
            match event.kind {
                EventKind::RescueStart => start = Some(event.frame),
                EventKind::RescueEnd => end = Some(event.frame),
                _ => {}
            }
        }
        assert_eq!(start, Some(60));
        assert_eq!(end, Some(4060));
    }
    #[test]
    fn pause_restarts_a_character_and_stop_bypasses_pending_work() {
        let (mut kernel, mut ready, _retired, mut events) = harness(2);
        ready.push(engine(1, false)).ok().unwrap();
        kernel.begin_callback();
        for _ in 0..30 {
            kernel.sample();
        }
        kernel.controls.pause.store(true, Ordering::Release);
        for _ in 0..20 {
            kernel.sample();
        }
        kernel.controls.pause.store(false, Ordering::Release);
        kernel.sample();
        kernel.controls.stop.store(true, Ordering::Release);
        for _ in 0..10 {
            kernel.sample();
        }
        let mut paused = false;
        let mut resumed = false;
        let mut stopped = false;
        while let Ok(event) = events.pop() {
            paused |= event.kind == EventKind::Paused;
            resumed |= event.kind == EventKind::Resumed;
            stopped |= event.kind == EventKind::Stopped;
        }
        assert!(paused && resumed && stopped);
    }
    #[test]
    fn full_retirement_queue_preserves_the_engine_and_sets_fault() {
        let (mut kernel, mut ready, _retired, _events) = harness(1);
        for id in [1, 2] {
            ready.push(engine(id, false)).ok().unwrap();
            kernel.begin_callback();
            for _ in 0..1000 {
                kernel.sample();
            }
        }
        assert!(kernel.pending_retirement.is_some());
        assert!(kernel.controls.fault.load(Ordering::Acquire));
        kernel.begin_callback();
        assert!(kernel.pending_retirement.is_some());
    }
}
