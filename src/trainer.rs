//! Interactive coordinator. Rendering, input reading, analysis, and persistence are isolated.
use crate::{
    analysis::Analysis,
    clock::ClockMap,
    commands::{self, Loaded},
    control::{Backlog, Controller, RescueTracker},
    input::{Input, InputEvent, Key},
    learner::{Context, Learner, Material, Mode, Profile},
    live_audio::LiveOutput,
    planner::{self, Random},
    recording::{Delivery, Kind, RecognitionTrial, Record},
    screen::{self, Sender, View},
    timing::{SYMBOLS, Schedule, Timing},
    transcript::{Edit, Symbol, Transcript},
    transport::{Controls, EventKind, Prepared},
    writer::{Operation, Writer},
};
use std::{
    collections::VecDeque,
    error::Error,
    io::{self, IsTerminal},
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{Receiver, TryRecvError},
    },
    thread,
    time::{Duration, Instant},
};

type Result<T> = std::result::Result<T, Box<dyn Error>>;
#[derive(Clone)]
struct Options {
    directory: PathBuf,
    duration: u64,
    mode: Option<Mode>,
    character: Option<u8>,
    effective: Option<u8>,
    known: Option<String>,
    skip_readiness: bool,
    latency_report: Option<PathBuf>,
}
impl Options {
    fn parse(args: &[String]) -> Result<Self> {
        let mut args = args.to_vec();
        let directory = commands::data_directory(&mut args)?;
        let mut out = Self {
            directory,
            duration: 600,
            mode: None,
            character: None,
            effective: None,
            known: None,
            skip_readiness: false,
            latency_report: None,
        };
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--session-seconds" => {
                    i += 1;
                    out.duration = args.get(i).ok_or("missing session duration")?.parse()?;
                }
                "--mode" => {
                    i += 1;
                    out.mode = Some(match args.get(i).map(String::as_str) {
                        Some("recognition") => Mode::Recognition,
                        Some("copying") => Mode::Copying,
                        _ => return Err("--mode is recognition or copying".into()),
                    });
                }
                "--c" => {
                    i += 1;
                    out.character = Some(args.get(i).ok_or("missing --c value")?.parse()?);
                }
                "--e" => {
                    i += 1;
                    out.effective = Some(args.get(i).ok_or("missing --e value")?.parse()?);
                }
                "--known" => {
                    i += 1;
                    let value = args.get(i).ok_or("missing --known symbols")?;
                    let value = if value == "all" {
                        SYMBOLS.to_string()
                    } else {
                        value.to_ascii_uppercase()
                    };
                    if value.is_empty()
                        || !value.chars().all(|c| crate::timing::pattern(c).is_some())
                    {
                        return Err("--known needs supported symbols or all".into());
                    }
                    out.known = Some(commands::canonical_repertoire(&value));
                }
                "--skip-readiness" => out.skip_readiness = true,
                "--latency-report" => {
                    i += 1;
                    out.latency_report =
                        Some(args.get(i).ok_or("missing latency report path")?.into());
                }
                _ => return Err(format!("unknown train option: {}", args[i]).into()),
            }
            i += 1;
        }
        if !(1..=3600).contains(&out.duration)
            || out.character.is_some_and(|c| !(12..=35).contains(&c))
            || out.effective.is_some_and(|e| !(3..=35).contains(&e))
            || out.character.zip(out.effective).is_some_and(|(c, e)| e > c)
        {
            return Err(
                "session seconds 1..3600, character WPM 12..35, effective WPM 3..character WPM"
                    .into(),
            );
        }
        Ok(out)
    }
    fn speed_override(&self) -> bool {
        self.character.is_some() || self.effective.is_some()
    }
}
/// First accepted response wins; capture time, not delayed handling time, gates deadlines.
#[derive(Default)]
struct RecognitionCapture {
    response: Option<Symbol>,
    unknown: bool,
    replay: bool,
    answered: bool,
    rejected: u32,
}
impl RecognitionCapture {
    fn response_text(&self) -> String {
        if let Some(response) = self.response {
            response.character.to_string()
        } else if self.unknown {
            "I don't know".into()
        } else if self.replay {
            "Replay requested".into()
        } else if self.answered {
            "Timed out".into()
        } else {
            "…".into()
        }
    }
    fn receive(
        &mut self,
        key: Key,
        at: u64,
        onset: Option<u64>,
        end: Option<u64>,
        timeout: u8,
        paused: bool,
    ) {
        if self.answered || paused {
            return;
        }
        if end.is_some_and(|end| at > end.saturating_add(timeout as u64 * 1_000_000_000)) {
            self.answered = true;
            return;
        }
        match key {
            Key::Replay => {
                self.replay = true;
                self.answered = true;
            }
            Key::Unknown if onset.is_some_and(|onset| at >= onset) => {
                self.unknown = true;
                self.answered = true;
            }
            Key::Character(character)
                if crate::timing::pattern(character).is_some()
                    && onset.is_some_and(|onset| at >= onset) =>
            {
                self.response = Some(Symbol {
                    character: character.to_ascii_uppercase(),
                    at_ns: at,
                });
                self.answered = true;
            }
            Key::Character(_) | Key::Unsupported(_) | Key::PasteRejected => {
                self.rejected = self.rejected.saturating_add(1);
            }
            _ => {}
        }
    }
    fn expire(&mut self, now: u64, end: Option<u64>, timeout: u8) {
        if end.is_some_and(|end| now >= end.saturating_add(timeout as u64 * 1_000_000_000)) {
            self.answered = true;
        }
    }
}
pub fn run(args: &[String]) -> Result<()> {
    let options = Options::parse(args)?;
    if !io::stdin().is_terminal() || !io::stdout().is_terminal() {
        return Err(
            "train requires an interactive terminal; score/progress/replay work in shell runners"
                .into(),
        );
    }
    let report = options
        .latency_report
        .as_ref()
        .map(|path| crate::latency::Report::create(path))
        .transpose()?;
    let measurements = report.as_ref().map(|report| report.measurements.clone());
    let result = (|| {
        let loaded = commands::load(options.directory.clone())?;
        let origin = Instant::now();
        let controls = Arc::new(Controls::new());
        let quit = Arc::new(AtomicBool::new(false));
        let input = Input::start(controls.stop.clone(), controls.fault.clone())?;
        let worker_quit = quit.clone();
        screen::run(quit, measurements, move |ui| {
            Runtime::new(options, loaded, input, controls, worker_quit, origin, ui)
                .and_then(|mut runtime| runtime.run())
                .map_err(|e| e.to_string())
        })
    })();
    if let Some(report) = report {
        report.finish(result.is_ok())?;
    }
    result
}
#[derive(Clone, Copy)]
struct Note {
    kind: EventKind,
    engine: u64,
    index: usize,
    frame: u64,
    at: u64,
    value: u64,
}
struct Runtime {
    text_next: bool,
    submit_tail: bool,
    audio: Option<LiveOutput>,
    input: Input,
    writer: Option<Writer>,
    analysis: Analysis,
    options: Options,
    profile: Profile,
    learner: Learner,
    records: Vec<Record>,
    controller: Controller,
    controls: Arc<Controls>,
    quit: Arc<AtomicBool>,
    origin: Instant,
    clock: ClockMap,
    ui: Sender,
    keys: VecDeque<InputEvent>,
    notes: VecDeque<Note>,
    next_engine: u64,
    last_callback: Instant,
    last_view: Instant,
    audio_error: Option<String>,
    fatal: Option<String>,
    history_failed: bool,
    session_id: String,
    session_mode_override: Option<Mode>,
    rng: Random,
}
impl Runtime {
    fn new(
        options: Options,
        loaded: Loaded,
        input: Input,
        controls: Arc<Controls>,
        quit: Arc<AtomicBool>,
        origin: Instant,
        ui: Sender,
    ) -> Result<Self> {
        let Loaded {
            history,
            profile,
            records,
            learner,
        } = loaded;
        if options
            .effective
            .is_some_and(|e| e > options.character.unwrap_or(profile.copying_c))
        {
            return Err(
                "effective override exceeds character speed; supply a compatible --c".into(),
            );
        }
        let seed = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(1) as u64;
        Ok(Self {
            text_next: false,
            submit_tail: false,
            audio: None,
            input,
            writer: Some(Writer::start(history)?),
            analysis: Analysis::start()?,
            options,
            profile,
            learner,
            records,
            controller: Controller::default(),
            controls,
            quit,
            origin,
            clock: ClockMap::default(),
            ui,
            keys: VecDeque::new(),
            notes: VecDeque::new(),
            next_engine: 0,
            last_callback: Instant::now(),
            last_view: Instant::now() - Duration::from_secs(1),
            audio_error: None,
            fatal: None,
            history_failed: false,
            session_id: String::new(),
            session_mode_override: None,
            rng: Random::new(seed),
        })
    }
    fn now(&self) -> u64 {
        self.origin.elapsed().as_nanos().min(u64::MAX as u128) as u64
    }
    fn pump(&mut self) {
        self.ui.flush();
        self.analysis.flush();
        if self.quit.load(Ordering::Acquire) {
            self.controls.stop.store(true, Ordering::Release);
        }
        while let Ok(event) = self.input.events.pop() {
            if let Some(metrics) = &self.ui.measurements {
                metrics.input(event.sequence, event.received.elapsed());
            }
            if matches!(event.key, Key::Resize) {
                self.ui.redraw();
                continue;
            }
            if matches!(event.key, Key::Quit) {
                self.quit.store(true, Ordering::Release);
            }
            if self.keys.len() >= 16384 {
                self.fatal = Some("coordinator input queue exceeded; practice stopped".into());
                self.controls.stop.store(true, Ordering::Release);
                break;
            }
            self.keys.push_back(event);
        }
        if let Ok(error) = self.input.error.lock()
            && let Some(error) = error.as_ref()
        {
            self.fatal = Some(format!("input capture failed: {error}"));
            self.controls.stop.store(true, Ordering::Release);
        }
        if let Some(audio) = self.audio.as_mut() {
            while let Ok(event) = audio.events.pop() {
                match event.kind {
                    EventKind::Clock => {
                        self.last_callback = Instant::now();
                        if let Err(error) = self.clock.observe(event) {
                            self.audio_error = Some(error.into());
                            self.controls.stop.store(true, Ordering::Release);
                        }
                    }
                    EventKind::RenderStats => {
                        if let Some(metrics) = &self.ui.measurements {
                            metrics.audio(event.character, audio.sample_rate, event.value);
                        }
                    }
                    _ => {
                        let at = self
                            .clock
                            .estimate(event.frame, audio.sample_rate)
                            .unwrap_or_else(|error| {
                                self.audio_error = Some(error.into());
                                event.host_ns
                            });
                        self.notes.push_back(Note {
                            kind: event.kind,
                            engine: event.block,
                            index: event.character as usize,
                            frame: event.frame,
                            at,
                            value: event.value,
                        });
                    }
                }
            }
            audio.collect_retired();
            if self.controls.fault.load(Ordering::Acquire) {
                self.audio_error.get_or_insert_with(|| {
                    format!(
                        "audio/input/telemetry fault (backend code {})",
                        audio.fault_kind.load(Ordering::Acquire)
                    )
                });
            }
            if self.last_callback.elapsed() > Duration::from_secs(2) {
                self.audio_error
                    .get_or_insert("audio callbacks stopped for two seconds".into());
                self.controls.stop.store(true, Ordering::Release);
            }
        }
        if let Some(metrics) = &self.ui.measurements {
            metrics.clock_residual(self.clock.residual_p99_ns);
            if self.controls.fault.load(Ordering::Acquire)
                || self.audio_error.is_some()
                || self.fatal.is_some()
            {
                metrics.fault();
            }
        }
        thread::sleep(Duration::from_millis(1));
    }
    fn show(&mut self, view: View) {
        if self.last_view.elapsed() >= Duration::from_millis(33) {
            self.ui.send(view);
            self.last_view = Instant::now();
        }
    }
    fn force_show(&mut self, view: View) {
        self.ui.send(view);
        self.last_view = Instant::now();
    }
    fn keys(&mut self) -> Vec<InputEvent> {
        self.keys.drain(..).collect()
    }
    fn notes(&mut self, id: u64) -> Vec<Note> {
        self.notes.drain(..).filter(|v| v.engine == id).collect()
    }
    fn remember(&self, record: &mut Record, notes: &[Note]) {
        for n in notes {
            record.delivery.push(Delivery {
                kind: n.kind,
                engine: n.engine,
                character: n.index as u32,
                output_frame: n.frame,
                estimated_ns: n.at,
            });
        }
        record.clock_residual_p99_ns = record.clock_residual_p99_ns.max(self.clock.residual_p99_ns);
    }
    fn new_record(&self, context: Context, kind: Kind) -> Record {
        let mut record = Record::new(&self.session_id, context, kind);
        record.wall_anchor_ns = self.now();
        record.repertoire = commands::canonical_repertoire(&self.profile.introduced);
        record.clock_calibrated = self.clock.calibrated();
        record
    }
    fn ensure_audio(&mut self) -> Result<()> {
        if self.audio.is_none() {
            self.audio_error = None;
            self.controls.fault.store(false, Ordering::Release);
            self.controls.stop.store(false, Ordering::Release);
            self.clock = ClockMap::default();
            self.last_callback = Instant::now();
            self.audio = Some(LiveOutput::open(self.controls.clone(), self.origin)?);
        }
        self.controls.volume(self.profile.volume);
        Ok(())
    }
    fn start_sound(&mut self, text: &str, c: u8, e: u8, rescue: bool) -> Result<u64> {
        self.ensure_audio()?;
        self.notes.clear();
        self.keys.clear();
        self.next_engine = self
            .next_engine
            .checked_add(1)
            .ok_or("engine identifier exhausted")?;
        let audio = self.audio.as_mut().unwrap();
        let schedule =
            Schedule::compile(text, Timing::new(c as f64, e as f64)?, audio.sample_rate)?;
        audio.submit(Prepared::new(
            self.next_engine,
            schedule,
            self.profile.tone_hz as f64,
            rescue,
        )?)?;
        Ok(self.next_engine)
    }
    fn wait_reply<T>(
        &mut self,
        receive: Receiver<std::result::Result<T, String>>,
        title: &str,
    ) -> Result<T> {
        let start = Instant::now();
        loop {
            match receive.try_recv() {
                Ok(value) => return value.map_err(Into::into),
                Err(TryRecvError::Disconnected) => {
                    return Err("worker stopped without acknowledging completion".into());
                }
                Err(TryRecvError::Empty) => {}
            }
            self.pump();
            while self.analysis.results.try_recv().is_ok() {}
            self.show(View::message(title,"Working off the audio/input threads. Completed progress is not marked saved until the transaction commits."));
            if start.elapsed() > Duration::from_secs(15) {
                return Err("worker acknowledgment timed out; commit status may be unknown. Restart and inspect history before retrying".into());
            }
        }
    }
    fn save(&mut self, mut record: Record) -> Result<Record> {
        if record.is_practice()
            && let Some(mode) = self.session_mode_override
        {
            record
                .selection_reason
                .push_str(&format!("\nLearner-selected mode: {mode:?}."));
        }
        if self.history_failed {
            return Err("history commit status is unknown; reopen before writing".into());
        }
        let evaluated = self
            .analysis
            .final_score(record)
            .map_err(|error| -> Box<dyn Error> { error.into() })
            .and_then(|reply| self.wait_reply(reply, "Evaluating practice"));
        let mut record = match evaluated {
            Ok(record) => *record,
            Err(error) => {
                self.fatal = Some(format!(
                    "Final evaluation failed; this block could not be saved: {error}"
                ));
                self.quit.store(true, Ordering::Release);
                return Err(error);
            }
        };
        record.apply_policy(&mut self.controller, &mut self.profile);
        let reply = match self.writer.as_ref().unwrap().request(Operation::Append(
            Box::new(record.clone()),
            Box::new(self.profile.clone()),
        )) {
            Ok(reply) => reply,
            Err(error) => {
                self.persistence_failed(&error.to_string());
                return Err(error.into());
            }
        };
        if let Err(error) = self.wait_reply(reply, "Saving local progress") {
            let message = format!(
                "Persistence acknowledgment failed; stop and inspect history before retrying: {error}"
            );
            self.persistence_failed(&message);
            return Err(message.into());
        }
        for observation in &record.observations {
            self.learner.observe(observation.clone())?;
        }
        if let Some(metrics) = &self.ui.measurements {
            metrics.saved(record.compromised.is_some());
        }
        self.records.push(record.clone());
        Ok(record)
    }
    fn persistence_failed(&mut self, message: &str) {
        self.history_failed = true;
        self.fatal = Some(format!(
            "Local persistence failed; restart and inspect history: {message}"
        ));
        self.quit.store(true, Ordering::Release);
        self.controls.stop.store(true, Ordering::Release);
    }
    fn checkpoint(&mut self, kind: Kind, reason: &str) -> Result<()> {
        let mut r = self.new_record(Context::recognition(self.profile.recognition_c), kind);
        r.completed = true;
        r.decision = reason.into();
        self.save(r)?;
        Ok(())
    }
    fn notice(&mut self, title: &str, body: &str) -> Result<bool> {
        self.force_show(View::message(
            title,
            format!("{body}\n\nEnter: continue · Esc: return"),
        ));
        loop {
            self.pump();
            if self.quit.load(Ordering::Acquire) {
                return Ok(false);
            }
            if let Some(error) = &self.fatal {
                return Err(error.clone().into());
            }
            for event in self.keys() {
                match event.key {
                    Key::Enter => return Ok(true),
                    Key::Escape => return Ok(false),
                    _ => {}
                }
            }
        }
    }
    fn idle(&mut self, milliseconds: u64) -> Result<bool> {
        let end = Instant::now() + Duration::from_millis(milliseconds);
        while Instant::now() < end {
            self.pump();
            if self.quit.load(Ordering::Acquire) {
                return Ok(false);
            }
            for event in self.keys() {
                match event.key {
                    Key::Escape => return Ok(false),
                    Key::Pause => {
                        if !self.pause_dialog()? {
                            return Ok(false);
                        }
                    }
                    _ => {}
                }
            }
        }
        Ok(true)
    }
    fn pause_dialog(&mut self) -> Result<bool> {
        self.controls.pause.store(true, Ordering::Release);
        self.force_show(View::message("Practice paused","The affected trial/block is excluded from unassisted assessment.\nF5: resume · Esc: end session"));
        loop {
            self.pump();
            if self.quit.load(Ordering::Acquire) {
                return Ok(false);
            }
            if self.audio_error.is_some() || self.fatal.is_some() {
                return Ok(false);
            }
            for event in self.keys() {
                match event.key {
                    Key::Pause => {
                        self.controls.pause.store(false, Ordering::Release);
                        return Ok(true);
                    }
                    Key::Escape => return Ok(false),
                    _ => {}
                }
            }
        }
    }
    fn stop_audio(&mut self) {
        self.controls.stop.store(true, Ordering::Release);
        let start = Instant::now();
        while self.controls.busy.load(Ordering::Acquire) && start.elapsed() < Duration::from_secs(1)
        {
            self.pump();
        }
        self.notes.clear();
        self.keys.clear();
    }
    fn clip(&mut self, symbol: char, title: &str, ack: bool) -> Result<bool> {
        let c = self.options.character.unwrap_or(self.profile.recognition_c);
        let mut id = self.start_sound(&symbol.to_string(), c, c, false)?;
        let mut finished = false;
        let mut start = Instant::now();
        loop {
            self.pump();
            for note in self.notes(id) {
                finished |= matches!(note.kind, EventKind::Finished | EventKind::Stopped);
            }
            let mut view = View::message(
                title,
                format!(
                    "{symbol}   {}\n\nListen to the whole sound pattern.\nVolume: {}% · tone: {} Hz",
                    crate::timing::pattern(symbol).unwrap(),
                    self.profile.volume,
                    self.profile.tone_hz
                ),
            );
            view.footer = if ack {
                "Enter after sound: continue · F6: replay · Up/Down: volume · Esc: return"
            } else {
                "Esc: end session"
            }
            .into();
            self.show(view);
            for event in self.keys() {
                match event.key {
                    Key::Escape | Key::Quit => {
                        self.stop_audio();
                        return Ok(false);
                    }
                    Key::Up if ack => {
                        self.profile.volume = (self.profile.volume + 5).min(100);
                        self.controls.volume(self.profile.volume);
                    }
                    Key::Down if ack => {
                        self.profile.volume = self.profile.volume.saturating_sub(5);
                        self.controls.volume(self.profile.volume);
                    }
                    Key::Enter if finished && ack => return Ok(true),
                    Key::Replay if finished && ack => {
                        id = self.start_sound(&symbol.to_string(), c, c, false)?;
                        finished = false;
                        start = Instant::now();
                    }
                    _ => {}
                }
            }
            if self.quit.load(Ordering::Acquire) {
                self.stop_audio();
                return Ok(false);
            }
            if let Some(error) = &self.audio_error {
                return Err(error.clone().into());
            }
            if finished && !ack {
                return self.idle(500);
            }
            if !finished && start.elapsed() > Duration::from_secs(10) {
                return Err("audio clip did not finish".into());
            }
        }
    }
    fn trial(
        &mut self,
        symbol: char,
        record: &mut Record,
    ) -> Result<(RecognitionTrial, bool, bool)> {
        let c = record.context.character_wpm;
        let id = self.start_sound(&symbol.to_string(), c, c, false)?;
        let mut onset = None;
        let mut end = None;
        let mut capture = RecognitionCapture::default();
        let mut finished = false;
        let mut compromised = false;
        let mut stop = false;
        let assisted = self
            .profile
            .assisted(symbol, chrono::Utc::now().timestamp_millis());
        loop {
            self.pump();
            let notes = self.notes(id);
            self.remember(record, &notes);
            for note in notes {
                match note.kind {
                    EventKind::CharacterStart => {
                        onset.get_or_insert(note.at);
                    }
                    EventKind::CharacterEnd => end = Some(note.at),
                    EventKind::Finished => finished = true,
                    EventKind::Stopped => {
                        finished = true;
                        compromised = true;
                    }
                    EventKind::Paused | EventKind::Resumed => compromised = true,
                    _ => {}
                }
            }
            for event in self.keys() {
                let at = event
                    .received
                    .duration_since(self.origin)
                    .as_nanos()
                    .min(u64::MAX as u128) as u64;
                match event.key {
                    Key::Escape | Key::Quit => {
                        stop = true;
                        self.controls.stop.store(true, Ordering::Release);
                        compromised = true;
                    }
                    Key::Pause => {
                        compromised = true;
                        if !self.pause_dialog()? {
                            stop = true;
                            self.controls.stop.store(true, Ordering::Release);
                        }
                    }
                    key => capture.receive(
                        key,
                        at,
                        onset,
                        end,
                        self.profile.timeout_seconds,
                        self.controls.pause.load(Ordering::Acquire),
                    ),
                }
            }
            capture.expire(self.now(), end, self.profile.timeout_seconds);
            let mut view = View::message(
                "Recognition",
                format!(
                    "Listen, then type one character.\n\nResponse: {} · rejected input: {}\nCharacter speed: {c} WPM · response window: {} s after sound\n{}",
                    capture.response_text(),
                    capture.rejected,
                    self.profile.timeout_seconds,
                    if assisted || capture.replay {
                        "Assisted repetition — separate from independent evidence"
                    } else {
                        "Independent attempt"
                    }
                ),
            );
            view.footer =
                "First answer only · Tab: unknown · F5: pause · F6: replay · Esc: end".into();
            if capture.answered {
                // A completed trial may return before the next throttled refresh.
                self.force_show(view);
            } else {
                self.show(view);
            }
            if self.quit.load(Ordering::Acquire) {
                stop = true;
                compromised = true;
                self.controls.stop.store(true, Ordering::Release);
            }
            if self.audio_error.is_some() || self.fatal.is_some() {
                stop = true;
                compromised = true;
                self.stop_audio();
                break;
            }
            if finished && (capture.answered || stop) {
                break;
            }
        }
        let onset = onset.unwrap_or_else(|| self.now());
        let end = end.unwrap_or_else(|| self.now().max(onset));
        Ok((
            RecognitionTrial {
                symbol,
                onset_ns: onset,
                end_ns: end,
                response: capture.response,
                assisted: assisted || capture.replay,
                compromised,
                explicit_unknown: capture.unknown,
            },
            capture.replay,
            stop,
        ))
    }
    fn recognition_block(&mut self, entry: bool) -> Result<bool> {
        let c = self.options.character.unwrap_or(self.profile.recognition_c);
        let mut record = self.new_record(
            Context::recognition(c),
            if entry {
                Kind::Entry
            } else {
                Kind::Recognition
            },
        );
        record.manual_override = self.options.speed_override();
        record.transport_start_ns = self.now();
        let now = chrono::Utc::now().timestamp_millis();
        let mut introduced = false;
        let plans = if entry {
            let mut symbols: Vec<_> = SYMBOLS
                .chars()
                .filter(|c| !self.profile.entry_seen.contains(c))
                .collect();
            self.rng.shuffle(&mut symbols);
            symbols
                .into_iter()
                .map(|symbol| planner::TrialPlan {
                    symbol,
                    category: planner::Category::Coverage,
                    teach: false,
                })
                .collect()
        } else {
            let plan = planner::recognition(
                &self.profile,
                &self.learner,
                now,
                self.controller.can_introduce(),
                &mut self.rng,
            );
            record.selection_reason = plan.reason;
            plan.trials
        };
        let began = Instant::now();
        let budget = if entry { 120 } else { 90 };
        let mut stopped = false;
        for plan in plans {
            if began.elapsed() >= Duration::from_secs(budget) {
                break;
            }
            if plan.teach {
                if !match self.clip(plan.symbol, "New symbol — listen before testing", true) {
                    Ok(value) => value,
                    Err(error) => {
                        record.compromised = Some(error.to_string());
                        false
                    }
                } {
                    stopped = true;
                    break;
                }
                self.profile
                    .introduce(plan.symbol, chrono::Utc::now().timestamp_millis());
                self.profile
                    .disclose(plan.symbol, chrono::Utc::now().timestamp_millis());
                self.controller.introduced();
                introduced = true;
            }
            let mut repeats = 0;
            loop {
                let (trial, replay, stop) = match self.trial(plan.symbol, &mut record) {
                    Ok(value) => value,
                    Err(error) => {
                        record.compromised = Some(error.to_string());
                        stopped = true;
                        self.stop_audio();
                        break;
                    }
                };
                let correct = trial.response.is_some_and(|r| r.character == plan.symbol);
                let compromised = trial.compromised;
                self.profile.finish_trial(plan.symbol);
                if entry && !compromised {
                    self.profile.entry_seen.insert(plan.symbol);
                    if correct {
                        self.profile
                            .introduce(plan.symbol, chrono::Utc::now().timestamp_millis());
                    }
                }
                record.trials.push(trial);
                stopped |= stop;
                if stopped {
                    break;
                }
                // Keep the response visible before replay/feedback or the next trial.
                if !self.idle(500)? {
                    stopped = true;
                    break;
                }
                if replay && repeats < 2 {
                    repeats += 1;
                    self.profile
                        .disclose(plan.symbol, chrono::Utc::now().timestamp_millis());
                    continue;
                }
                if !correct && !compromised {
                    self.profile
                        .disclose(plan.symbol, chrono::Utc::now().timestamp_millis());
                    if !match self.clip(plan.symbol, "Correct answer — sound pattern replay", false)
                    {
                        Ok(value) => value,
                        Err(error) => {
                            record.compromised = Some(error.to_string());
                            false
                        }
                    } {
                        stopped = true;
                    }
                }
                break;
            }
            if stopped {
                break;
            }
        }
        if entry {
            for c in ['K', 'M'] {
                if stopped {
                    break;
                }
                if self.profile.introduced.len() < 2 && !self.profile.introduced.contains(c) {
                    if !match self.clip(c, "Start with two contrasting sound patterns", true) {
                        Ok(value) => value,
                        Err(error) => {
                            record.compromised = Some(error.to_string());
                            false
                        }
                    } {
                        stopped = true;
                        break;
                    }
                    self.profile
                        .introduce(c, chrono::Utc::now().timestamp_millis());
                    self.profile
                        .disclose(c, chrono::Utc::now().timestamp_millis());
                }
            }
            // Include the bootstrap acknowledgment in entry completion.
            self.profile.entry_complete = !stopped;
            record.selection_reason="Placement: sample current knowledge; introduced symbols are not automatically mastered".into();
        }
        record.transport_end_ns = self.now();
        record.completed = !stopped;
        record.clock_calibrated &= self.clock.calibrated();
        if let Some(error) = self.fatal.as_ref().or(self.audio_error.as_ref()) {
            record.compromised = Some(error.clone());
        }
        record.repertoire = commands::canonical_repertoire(&self.profile.introduced);
        let saved = self.save(record)?;
        if introduced {
            self.controller.introduced_this_session = true;
        }
        if stopped {
            return Ok(false);
        }
        let accuracy = saved.metrics.attempt_accuracy.map_or_else(
            || "no independent samples".into(),
            |a| format!("{:.1}% independent accuracy", 100.0 * a),
        );
        self.review(
            "Recognition block saved",
            &format!(
                "{accuracy}\n{}\n{}\nIntroduced: {}\n{}",
                saved.selection_reason,
                saved.decision,
                self.profile.introduced,
                if entry && !self.profile.entry_complete {
                    "Remaining placement symbols will be sampled next session."
                } else {
                    ""
                }
            ),
        )
    }
    fn copying_block(&mut self, check: Option<(Context, String)>) -> Result<bool> {
        self.submit_tail = false;
        let is_check = check.is_some();
        let mut work = self.profile.clone();
        let requested_material = if let Some((context, repertoire)) = &check {
            work.copying_c = context.character_wpm;
            work.copying_e = context.effective_wpm;
            work.introduced = repertoire.clone();
            context.material
        } else {
            work.copying_c = self.options.character.unwrap_or(work.copying_c);
            work.copying_e = self
                .options
                .effective
                .unwrap_or(work.copying_e)
                .min(work.copying_c);
            if self.text_next
                && work
                    .group_qualifications
                    .get(&(work.copying_c, work.copying_e))
                    .is_some_and(|n| *n >= 2)
            {
                Material::Text
            } else {
                Material::Groups
            }
        };
        self.ensure_audio()?;
        let now = chrono::Utc::now().timestamp_millis();
        let seconds = if is_check { 180 } else { 60 };
        let plan = planner::copying(
            &work,
            &self.learner,
            now,
            requested_material,
            seconds,
            is_check,
            &mut self.rng,
        )?;
        self.text_next = plan.material != Material::Text;
        let context = Context::copying(work.copying_c, work.copying_e, plan.material);
        let mut record =
            self.new_record(context, if is_check { Kind::Check } else { Kind::Copying });
        record.repertoire = commands::canonical_repertoire(&work.introduced);
        record.content = plan.content.clone();
        record.selection_reason = plan.reason;
        record.manual_override = !is_check && self.options.speed_override();
        record.corpus_id = plan.corpus_id.clone();
        record.corpus_version =
            (plan.material == Material::Text).then(|| planner::CORPUS_VERSION.to_string());
        let rate = self.audio.as_ref().unwrap().sample_rate;
        let schedule = Schedule::compile(
            &plan.content,
            Timing::new(work.copying_c as f64, work.copying_e as f64)?,
            rate,
        )?;
        let characters = schedule.characters.clone();
        record.scheduled_ns = schedule.frames * 1_000_000_000 / rate as u64;
        let id = self.start_sound(&plan.content, work.copying_c, work.copying_e, !is_check)?;
        let mut starts = vec![None; characters.len()];
        let mut ends = vec![None; characters.len()];
        let mut transcript = Transcript::default();
        let mut source_start_frame = None;
        let mut source_end_frame = None;
        let mut ending = None;
        let mut finished = false;
        let mut stopped = false;
        let mut revision = 0u64;
        let mut last_snapshot = Instant::now() - Duration::from_secs(1);
        let mut submitted_revision = None;
        let mut last_input = self.now();
        let mut last_backlog = 0u32;
        let mut last_backlog_max = 0u32;
        let baseline = self
            .records
            .iter()
            .rev()
            .filter(|r| {
                r.context == context
                    && r.completed
                    && r.compromised.is_none()
                    && r.rescues == 0
                    && r.metrics.attempt_accuracy.is_some_and(|v| v >= 0.95)
            })
            .filter(|r| !r.backlog.is_empty())
            .take(3)
            .map(|r| median(r.backlog.iter().map(|(_, min, _)| *min as f64).collect()))
            .collect::<Vec<_>>();
        let baseline = if baseline.is_empty() {
            1.0
        } else {
            median(baseline)
        };
        let mut rescue = RescueTracker::new(baseline);
        loop {
            self.pump();
            let notes = self.notes(id);
            self.remember(&mut record, &notes);
            for note in notes {
                match note.kind {
                    EventKind::Started => {
                        self.profile
                            .presented(&record.content, record.corpus_id.as_deref());
                        record.transport_start_ns = note.at;
                        source_start_frame = Some(note.frame);
                    }
                    EventKind::CharacterStart => {
                        if let Some(slot) = starts.get_mut(note.index) {
                            *slot = Some(Symbol {
                                character: characters[note.index].symbol,
                                at_ns: note.at,
                            });
                            revision += 1;
                        }
                    }
                    EventKind::CharacterEnd => {
                        if let Some(slot) = ends.get_mut(note.index) {
                            *slot = Some(note.at);
                            revision += 1;
                        }
                    }
                    EventKind::RescueStart => {
                        rescue.applied(note.at);
                        record.rescues = rescue.count;
                    }
                    EventKind::RescueEnd => {
                        rescue.finished(note.at);
                        record.rescue_ns = record
                            .rescue_ns
                            .saturating_add(note.value * 1_000_000_000 / rate as u64);
                    }
                    EventKind::Paused | EventKind::Resumed => {
                        record.compromised =
                            Some("paused/resumed: excluded from independent assessment".into())
                    }
                    EventKind::Finished => {
                        finished = true;
                        ending = Some(note.at);
                        source_end_frame = Some(note.frame);
                        record.transport_end_ns = note.at;
                    }
                    EventKind::Stopped => {
                        stopped = true;
                        finished = true;
                        ending = Some(note.at);
                        source_end_frame = Some(note.frame);
                        record.transport_end_ns = note.at;
                        record
                            .compromised
                            .get_or_insert("stopped before normal block completion".into());
                    }
                    _ => {}
                }
            }
            for event in self.keys() {
                let at = event
                    .received
                    .duration_since(self.origin)
                    .as_nanos()
                    .min(u64::MAX as u128) as u64;
                let edit = match event.key {
                    Key::Character(c) => {
                        last_input = at;
                        Some(Edit::Type(c))
                    }
                    Key::Backspace => Some(Edit::Backspace),
                    Key::Unknown => Some(Edit::Type(' ')),
                    Key::Unsupported(c) => Some(Edit::Unsupported(c)),
                    Key::PasteRejected => Some(Edit::PasteRejected),
                    Key::Escape | Key::Quit => {
                        stopped = true;
                        record
                            .compromised
                            .get_or_insert("learner stopped the block".into());
                        self.controls.stop.store(true, Ordering::Release);
                        None
                    }
                    Key::Pause => {
                        record.compromised = Some("paused: not an unassisted check".into());
                        if !self.pause_dialog()? {
                            stopped = true;
                            self.controls.stop.store(true, Ordering::Release);
                        }
                        None
                    }
                    Key::Enter if finished => {
                        self.submit_tail = true;
                        if is_check
                            && at < record.transport_start_ns.saturating_add(180_000_000_000)
                        {
                            stopped = true;
                        }
                        ending = ending.or(Some(at));
                        finished = true;
                        break;
                    }
                    _ => None,
                };
                if let Some(edit) = edit {
                    if let Err(error) = transcript.record(edit, at) {
                        record.compromised = Some(error.to_string());
                        stopped = true;
                        self.controls.stop.store(true, Ordering::Release);
                    }
                    revision = revision.saturating_add(1);
                }
            }
            let now = self.now();
            let completed: Vec<_> = starts
                .iter()
                .zip(&ends)
                .filter_map(|(start, end)| {
                    start
                        .zip(*end)
                        .filter(|(_, end)| *end <= now)
                        .map(|(start, _)| start)
                })
                .collect();
            if !finished
                && !is_check
                && submitted_revision != Some(revision)
                && last_snapshot.elapsed() >= Duration::from_millis(20)
            {
                self.analysis.live(
                    id,
                    revision,
                    now,
                    completed,
                    transcript.final_text().to_vec(),
                );
                submitted_revision = Some(revision);
                last_snapshot = Instant::now();
            }
            while let Ok(result) = self.analysis.results.try_recv() {
                if result.block == id
                    && (result.processing_ns > 100_000_000
                        || (result.revision == revision
                            && now.saturating_sub(result.at_ns) > 100_000_000))
                {
                    record.compromised =
                        Some("live analysis exceeded its 100 ms freshness limit".into());
                    stopped = true;
                    self.controls.stop.store(true, Ordering::Release);
                    continue;
                }
                if result.block == id
                    && result.revision == revision
                    && now.saturating_sub(result.at_ns) <= 100_000_000
                {
                    match result.result {
                        Ok(alignment) => {
                            last_backlog = alignment.backlog_min;
                            last_backlog_max = alignment.backlog_max;
                            let sample = Backlog {
                                at_ns: result.at_ns,
                                min: alignment.backlog_min,
                                max: alignment.backlog_max,
                            };
                            rescue.sample(sample);
                            record.backlog.push((sample.at_ns, sample.min, sample.max));
                            if rescue.should_request(now, last_input, alignment.latest_errors) {
                                self.controls.cancel_rescue.store(0, Ordering::Release);
                                self.controls.rescue.store(id, Ordering::Release);
                            } else if self.controls.rescue.load(Ordering::Acquire) == id {
                                self.controls.cancel_rescue.store(id, Ordering::Release);
                            }
                        }
                        Err(error) => {
                            record.compromised = Some(format!("analysis failed: {error}"));
                            stopped = true;
                            self.controls.stop.store(true, Ordering::Release);
                        }
                    }
                }
            }
            if rescue.release_requested(now, last_backlog) {
                self.controls.release_rescue.store(id, Ordering::Release);
            }
            if self.quit.load(Ordering::Acquire) {
                stopped = true;
                self.controls.stop.store(true, Ordering::Release);
            }
            if let Some(error) = self.fatal.as_ref().or(self.audio_error.as_ref()) {
                record.compromised = Some(error.clone());
                stopped = true;
                self.stop_audio();
                break;
            }
            let window_end = if is_check {
                record
                    .transport_start_ns
                    .saturating_add(180_000_000_000)
                    .max(ending.unwrap_or(0))
            } else {
                ending.unwrap_or(u64::MAX)
            };
            if finished && (stopped || now >= window_end.saturating_add(10_000_000_000)) {
                break;
            }
            // Enter submits the response tail once the audio and assessment window are done.
            if finished && self.submit_tail {
                self.submit_tail = false;
                if !is_check || now >= window_end {
                    break;
                }
                stopped = true;
                break;
            }
            let elapsed = if source_start_frame.is_some() {
                now.saturating_sub(record.transport_start_ns) / 1_000_000_000
            } else {
                0
            };
            let mut view = View::message(
                if is_check {
                    "Unassisted progress check"
                } else {
                    "Continuous copying"
                },
                format!(
                    "{}\n{}/{} WPM · {} s · backlog {}..{} · catch-up gaps {}\nRejected input: {} (paste, modifiers, unsupported symbols)\n\n{}\n\n{}",
                    record.selection_reason,
                    work.copying_c,
                    work.copying_e,
                    elapsed,
                    last_backlog,
                    last_backlog_max,
                    record.rescues,
                    transcript.events().iter().filter(|e| !e.accepted).count(),
                    transcript.final_string(),
                    if finished {
                        "Response tail: Enter submits; recording remains bounded."
                    } else {
                        "Keep listening. Skip missed material and rejoin."
                    }
                ),
            );
            view.footer =
                "Type your copy · Tab: skip · Backspace: correct · F5: pause · Esc: end".into();
            self.show(view);
        }
        self.stop_audio();
        record.inputs = transcript.events().to_vec();
        for (start, end) in starts.into_iter().zip(ends) {
            if let (Some(start), Some(end)) = (start, end) {
                record.onsets.push(start);
                record.ends_ns.push(end);
            }
        }
        if let (Some(start), Some(end)) = (source_start_frame, source_end_frame) {
            record.scheduled_ns =
                ((end - start) * 1_000_000_000 / rate as u64).saturating_sub(record.rescue_ns);
        }
        record.assessment_elapsed_ns = if is_check {
            self.now()
                .saturating_sub(record.transport_start_ns)
                .min(180_000_000_000)
        } else {
            0
        };
        record.complete_copying(finished, stopped);
        let saved = self.save(record)?;
        if stopped {
            return Ok(false);
        }
        let accuracy = |v: Option<f64>| {
            v.map_or_else(|| "unavailable".into(), |a| format!("{:.1}%", 100.0 * a))
        };
        let summary = format!(
            "Attempt accuracy: {} · final: {}\n{}\n{}\n{}\n{}\nAssistance: {} catch-up gaps.\n{}",
            accuracy(saved.metrics.attempt_accuracy),
            accuracy(saved.metrics.final_accuracy),
            saved.selection_reason,
            saved.decision,
            saved.evidence_summary(),
            saved.pace_summary(),
            saved.rescues,
            if saved.qualifying_check() {
                "Qualifying unassisted result recorded at the displayed conditions."
            } else if is_check {
                "This check did not establish a qualifying result."
            } else {
                ""
            }
        );
        if transcript.attempts().is_empty() {
            self.notice("No copy received — ready to resume?", &summary)
        } else {
            self.review("Copying block saved", &summary)
        }
    }
    fn review(&mut self, title: &str, body: &str) -> Result<bool> {
        self.force_show(View::message(title,format!("{body}\n\nNext block starts automatically in three seconds. Enter continues now; Esc ends.")));
        let started = Instant::now();
        loop {
            self.pump();
            if self.quit.load(Ordering::Acquire) {
                return Ok(false);
            }
            for event in self.keys() {
                match event.key {
                    Key::Enter => return Ok(true),
                    Key::Escape => return Ok(false),
                    Key::Pause => {
                        if !self.pause_dialog()? {
                            return Ok(false);
                        }
                    }
                    _ => {}
                }
            }
            if started.elapsed() >= Duration::from_secs(3) {
                return Ok(true);
            }
        }
    }
    fn session(&mut self, mode: Option<Mode>) -> Result<()> {
        self.session_mode_override = mode.or(self.options.mode);
        self.session_id = format!(
            "{}-{}",
            chrono::Utc::now().timestamp_millis(),
            self.profile.sessions
        );
        self.controller = Controller::default();
        self.text_next = false;
        if let Some(known) = self.options.known.clone() {
            for c in known.chars() {
                self.profile
                    .introduce(c, chrono::Utc::now().timestamp_millis());
            }
            self.profile.entry_complete = true;
            self.options.known = None;
            self.checkpoint(
                Kind::Teaching,
                "User supplied starting repertoire; no mastery assumed",
            )?;
        }
        if !self.options.skip_readiness
            && !self.clip('E', "Audio readiness — adjust volume, then Enter", true)?
        {
            return Ok(());
        }
        self.checkpoint(
            Kind::Teaching,
            "Audio readiness/settings recorded; no practice score",
        )?;
        let started = Instant::now();
        let first_record = self.records.len();
        let mut continuing = true;
        if !self.profile.entry_complete {
            continuing = self.recognition_block(true)?;
        }
        if continuing
            && !self.options.speed_override()
            && let Some((context, repertoire)) = commands::check_context(
                &self.profile,
                &self.records,
                &chrono::Local::now().date_naive().to_string(),
            )
        {
            let mut offered = self.new_record(
                Context::recognition(self.profile.recognition_c),
                Kind::CheckOffered,
            );
            self.profile
                .offered_dates
                .insert(offered.local_date.clone());
            offered.completed = true;
            offered.decision = "Optional three-minute steady-pace check offered".into();
            self.save(offered)?;
            if self.notice("Optional progress check",&format!("Three minutes at {}/{} WPM, no automatic rescue.\nEnter accepts; Esc skips and continues normal practice.",context.character_wpm,context.effective_wpm))?{continuing=self.copying_block(Some((context,repertoire)))?;}
        }
        while continuing && !self.quit.load(Ordering::Acquire) {
            if started.elapsed() >= Duration::from_secs(self.options.duration) {
                break;
            }
            let selected = mode
                .or(self.options.mode)
                .unwrap_or(self.controller.next_mode);
            continuing = match selected {
                Mode::Recognition => self.recognition_block(false)?,
                Mode::Copying if self.profile.introduced.len() >= 2 => self.copying_block(None)?,
                Mode::Copying => self.recognition_block(false)?,
            };
        }
        self.stop_audio();
        let completed = self.records[first_record..]
            .iter()
            .filter(|r| r.is_practice() && r.completed)
            .count();
        if completed > 0 {
            self.profile.sessions = self.profile.sessions.saturating_add(1);
        }
        self.checkpoint(
            Kind::SessionEnd,
            "Session ended; completed observations retained",
        )?;
        if !self.quit.load(Ordering::Acquire) {
            self.notice("Session saved",&format!("{} completed practice blocks.\nCurrent target: {}/{} WPM.\nUse Progress for character evidence and copying history.",completed,self.profile.copying_c,self.profile.copying_e))?;
        }
        if self.audio_error.is_some() {
            self.audio.take();
            self.controls.fault.store(false, Ordering::Release);
            self.audio_error = None;
        }
        Ok(())
    }
    fn settings(&mut self) -> Result<()> {
        let mut selected = 0usize;
        let mut preview_at = None;
        loop {
            let mut view = View::message(
                "Audio settings",
                format!(
                    "Up/Down chooses a field; Left/Right adjusts and previews.\nSpace or F6: replay preview. Enter/Esc: save and return.\n{}",
                    if preview_at.is_some() {
                        "Previewing the latest settings shortly…"
                    } else if self.controls.busy.load(Ordering::Acquire) {
                        "Playing preview with the current volume and tone."
                    } else {
                        "Preview does not count as practice."
                    }
                ),
            );
            view.options = vec![
                format!("Volume: {}%", self.profile.volume),
                format!("Tone: {} Hz", self.profile.tone_hz),
            ];
            view.selected = selected;
            view.footer =
                "Left/Right: adjust · Space/F6: preview · Enter/Esc: save · Ctrl-C: quit".into();
            self.show(view);
            self.pump();
            self.notes.clear();
            if self.quit.load(Ordering::Acquire) {
                self.stop_audio();
                return Ok(());
            }
            if let Some(error) = self.fatal.as_ref().or(self.audio_error.as_ref()) {
                return Err(error.clone().into());
            }
            let previous = (self.profile.volume, self.profile.tone_hz);
            let mut replay = false;
            for event in self.keys() {
                match event.key {
                    Key::Up | Key::Down => selected = 1 - selected,
                    Key::Left => {
                        if selected == 0 {
                            self.profile.volume = self.profile.volume.saturating_sub(5);
                        } else {
                            self.profile.tone_hz = self.profile.tone_hz.saturating_sub(50).max(300);
                        }
                    }
                    Key::Right => {
                        if selected == 0 {
                            self.profile.volume = (self.profile.volume + 5).min(100);
                        } else {
                            self.profile.tone_hz = (self.profile.tone_hz + 50).min(1000);
                        }
                    }
                    Key::Character(' ') | Key::Replay => replay = true,
                    Key::Enter | Key::Escape => {
                        self.stop_audio();
                        self.checkpoint(Kind::Teaching, "Audio preferences updated")?;
                        return Ok(());
                    }
                    _ => {}
                }
            }
            self.controls.volume(self.profile.volume);
            if previous != (self.profile.volume, self.profile.tone_hz) || replay {
                // Fade out an old preview and coalesce repeated adjustments.
                self.controls.stop.store(true, Ordering::Release);
                preview_at =
                    Some(Instant::now() + Duration::from_millis(if replay { 0 } else { 100 }));
            }
            if preview_at.is_some_and(|at| Instant::now() >= at)
                && !self.controls.busy.load(Ordering::Acquire)
            {
                self.start_sound("K", 20, 20, false)?;
                preview_at = None;
            }
        }
    }
    fn progress(&mut self) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        let mut lines=vec![format!("Completed sessions: {} · records: {}",self.profile.sessions,self.records.len()),"Character estimates are context-specific; intervals are approximate model uncertainty.".into()];
        for c in SYMBOLS
            .chars()
            .filter(|c| self.profile.introduced.contains(*c))
        {
            let r = self
                .learner
                .estimate(c, Context::recognition(self.profile.recognition_c), now);
            let copy = self.learner.estimate(
                c,
                Context::copying(
                    self.profile.copying_c,
                    self.profile.copying_e,
                    Material::Groups,
                ),
                now,
            );
            let metric = |p: &crate::learner::Estimate| {
                if p.effective_evidence == 0.0 {
                    "unobserved".into()
                } else {
                    format!(
                        "{:.0}% [{:.0}–{:.0}], n={:.1}",
                        100.0 * p.mean,
                        100.0 * p.lower,
                        100.0 * p.upper,
                        p.effective_evidence
                    )
                }
            };
            lines.push(format!(
                "{c} · recognition {} · copying {}",
                metric(&r),
                metric(&copy)
            ));
            lines.push(format!(
                "    response p90: {} · review {}",
                r.latency_p90_ns.map_or_else(
                    || "unknown".into(),
                    |v| format!("{:.0} ms (typing included)", v as f64 / 1e6)
                ),
                if self
                    .profile
                    .reviews
                    .get(&c)
                    .is_some_and(|v| v.due_ms <= now)
                {
                    "due"
                } else {
                    "scheduled"
                }
            ));
            for (response, _, count) in r.confusions.iter().filter(|v| v.2 >= 3).take(2) {
                lines.push(format!(
                    "    recurring {c} → {response}: {count} attributable substitutions"
                ));
            }
        }
        lines.push("Recent copying / checks:".into());
        for r in self
            .records
            .iter()
            .rev()
            .filter(|r| matches!(r.kind, Kind::Copying | Kind::Check))
            .take(10)
        {
            lines.push(format!(
                "{} {:?} {}/{} WPM · attempt {} · rescue {} · {}",
                r.local_date,
                r.kind,
                r.context.character_wpm,
                r.context.effective_wpm,
                r.metrics
                    .attempt_accuracy
                    .map_or_else(|| "unavailable".into(), |a| format!("{:.1}%", 100.0 * a)),
                r.rescues,
                if r.compromised.is_some() {
                    "compromised"
                } else if r.completed {
                    "complete"
                } else {
                    "incomplete"
                }
            ));
        }
        lines.extend(commands::milestones(&self.records));
        let context = Context::copying(
            self.profile.copying_c,
            self.profile.copying_e,
            Material::Groups,
        );
        if let Some(trend) = commands::trend(&self.records, context) {
            lines.push(format!(
                "Comparable copying mean-score change: {:+.1} percentage points (descriptive)",
                trend * 100.0
            ));
        }
        for context in [Context::recognition(self.profile.recognition_c), context] {
            if let Some(change) = commands::latency_trend(&self.records, context) {
                lines.push(format!(
                    "{:?} comparable response-latency change: {:+.0} ms (typing included)",
                    context.mode,
                    change as f64 / 1e6
                ));
            }
        }
        let mut offset = 0u16;
        loop {
            let mut view = View::message(
                "Progress — independent and assisted evidence stay separate",
                "",
            );
            view.lines = lines.clone();
            view.scroll = offset;
            view.footer = "Up/Down: scroll · Enter/Esc: return · Ctrl-C: quit".into();
            self.show(view);
            self.pump();
            if self.quit.load(Ordering::Acquire) {
                return Ok(());
            }
            for event in self.keys() {
                match event.key {
                    Key::Up => offset = offset.saturating_sub(1),
                    Key::Down => offset = (offset + 1).min(lines.len() as u16),
                    Key::Enter | Key::Escape => return Ok(()),
                    _ => {}
                }
            }
        }
    }
    fn reset(&mut self) -> Result<()> {
        let mut typed = String::new();
        loop {
            self.show(View::message("Reset local learning history",format!("This removes all local events and derived progress, not exported backups.\nType DELETE then Enter to confirm; Esc cancels.\n\n{typed}")));
            self.pump();
            if self.quit.load(Ordering::Acquire) {
                return Ok(());
            }
            for event in self.keys() {
                match event.key {
                    Key::Escape => return Ok(()),
                    Key::Character(c) if typed.len() < 12 => typed.push(c.to_ascii_uppercase()),
                    Key::Backspace => {
                        typed.pop();
                    }
                    Key::Enter if typed == "DELETE" => {
                        let result = self
                            .writer
                            .as_ref()
                            .unwrap()
                            .request(Operation::Reset)
                            .map_err(|error| -> Box<dyn Error> { error.into() })
                            .and_then(|reply| self.wait_reply(reply, "Resetting local history"));
                        if let Err(error) = result {
                            self.persistence_failed(&error.to_string());
                            return Err(error);
                        }
                        self.profile = Profile::default();
                        self.learner = Learner::default();
                        self.records.clear();
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }
    }
    fn run(&mut self) -> Result<()> {
        let mut selected = 0usize;
        loop {
            self.pump();
            if self.quit.load(Ordering::Acquire) {
                break;
            }
            if let Some(error) = &self.fatal {
                return Err(error.clone().into());
            }
            let mut view = View::message(
                "CW DOJO",
                format!(
                    "{} sessions · {} introduced symbols · automatic target {}/{} WPM\nOffline · native Rust audio · redb binary history\n{}",
                    self.profile.sessions,
                    self.profile.introduced.len(),
                    self.profile.copying_c,
                    self.profile.copying_e,
                    self.audio_error
                        .as_deref()
                        .unwrap_or("Choose practice and let the trainer select the next block.")
                ),
            );
            view.options = vec![
                "Continue adaptive practice".into(),
                "Recognition practice".into(),
                "Continuous copying".into(),
                "Progress and weaknesses".into(),
                "Audio settings".into(),
                "Export binary backup".into(),
                "Reset history".into(),
                "Quit".into(),
            ];
            view.selected = selected;
            view.footer =
                "Up/Down: choose · Enter: select · F1: progress · Esc/Ctrl-C: quit".into();
            self.show(view);
            let mut action = None;
            for event in self.keys() {
                match event.key {
                    Key::Up => selected = (selected + 7) % 8,
                    Key::Down => selected = (selected + 1) % 8,
                    Key::Enter => action = Some(selected),
                    Key::Progress => action = Some(3),
                    Key::Escape => self.quit.store(true, Ordering::Release),
                    _ => {}
                }
            }
            let Some(action) = action else { continue };
            let result = match action {
                0 => self.session(None),
                1 => self.session(Some(Mode::Recognition)),
                2 => self.session(Some(Mode::Copying)),
                3 => self.progress(),
                4 => self.settings(),
                5 => {
                    let path = self.options.directory.join(format!(
                        "practice-{}.cwbackup",
                        chrono::Utc::now().timestamp_millis()
                    ));
                    let reply = self
                        .writer
                        .as_ref()
                        .unwrap()
                        .request(Operation::Export(path.clone()))?;
                    self.wait_reply(reply, "Exporting a consistent binary snapshot")?;
                    self.notice("Backup saved", &path.display().to_string())
                        .map(|_| ())
                }
                6 => self.reset(),
                7 => {
                    self.quit.store(true, Ordering::Release);
                    Ok(())
                }
                _ => unreachable!(),
            };
            if let Err(error) = result {
                if let Some(fatal) = &self.fatal {
                    return Err(fatal.clone().into());
                }
                self.stop_audio();
                self.audio.take();
                self.controls.fault.store(false, Ordering::Release);
                self.audio_error = None;
                if !self.notice(
                    "Practice could not continue",
                    &format!(
                        "{error}\nNo failed operation is silently treated as a learner mistake."
                    ),
                )? {
                    continue;
                }
            }
        }
        self.stop_audio();
        self.audio.take();
        if let Some(writer) = self.writer.take() {
            writer.finish()?;
        }
        Ok(())
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.controls.stop.store(true, Ordering::Release);
        self.audio.take();
    }
}

fn median(mut values: Vec<f64>) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(f64::total_cmp);
    let n = values.len();
    (values[(n - 1) / 2] + values[n / 2]) / 2.0
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recognition_uses_first_eligible_capture_time_and_preserves_early_recognition() {
        let mut capture = RecognitionCapture::default();
        capture.receive(Key::Character('x'), 99, Some(100), Some(200), 4, false);
        assert!(!capture.answered);
        capture.receive(Key::Character('k'), 150, Some(100), Some(200), 4, false);
        capture.receive(Key::Character('m'), 250, Some(100), Some(200), 4, false);
        assert_eq!(
            capture.response,
            Some(Symbol {
                character: 'K',
                at_ns: 150
            })
        );
        assert!(!capture.replay);
        assert_eq!(capture.response_text(), "K");
    }
    #[test]
    fn recognition_deadline_unknown_pause_and_replay_are_distinct() {
        let mut late = RecognitionCapture::default();
        late.receive(
            Key::Character('K'),
            8_000_000_201,
            Some(100),
            Some(200),
            8,
            false,
        );
        assert!(late.answered && late.response.is_none());
        let mut unknown = RecognitionCapture::default();
        unknown.receive(Key::Unknown, 150, Some(100), Some(200), 4, true);
        assert!(!unknown.answered);
        unknown.receive(Key::Unknown, 150, Some(100), Some(200), 4, false);
        assert!(unknown.unknown && unknown.response.is_none());
        assert_eq!(unknown.response_text(), "I don't know");
        let mut replay = RecognitionCapture::default();
        replay.receive(Key::Replay, 150, Some(100), Some(200), 4, false);
        assert!(replay.replay && replay.answered);
        let mut timeout = RecognitionCapture::default();
        timeout.expire(8_000_000_199, Some(200), 8);
        assert!(!timeout.answered);
        timeout.expire(8_000_000_200, Some(200), 8);
        assert!(timeout.answered && timeout.response.is_none());
        assert_eq!(timeout.response_text(), "Timed out");
    }
    #[test]
    fn space_and_modified_keys_cannot_create_invalid_recognition_history() {
        let mut capture = RecognitionCapture::default();
        for key in [
            Key::Character(' '),
            Key::Unsupported('K'),
            Key::PasteRejected,
        ] {
            capture.receive(key, 150, Some(100), Some(200), 4, false);
        }
        assert!(!capture.answered && capture.response.is_none());
        assert_eq!(capture.rejected, 3);
        capture.receive(Key::Character('m'), 150, Some(100), Some(200), 4, false);
        assert_eq!(capture.response.unwrap().character, 'M');
        let mut record = Record::new("invalid-space", Context::recognition(20), Kind::Recognition);
        record.trials.push(RecognitionTrial {
            symbol: 'K',
            onset_ns: 100,
            end_ns: 200,
            response: Some(Symbol {
                character: ' ',
                at_ns: 250,
            }),
            assisted: false,
            compromised: false,
            explicit_unknown: false,
        });
        assert!(record.validate().is_err());
    }
}
