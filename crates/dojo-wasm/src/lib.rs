//! Typed browser/server boundary. Durable state is Postcard; JSON is a transient view.
use dojo_core::{
    assessment,
    control::{Backlog, Controller, RescueTracker},
    learner::{Context, Learner, Material, Mode, POLICY, Profile},
    planner::{self, Random},
    progress,
    recording::{Kind, RecognitionTrial, Record},
    scoring,
    timing::{SYMBOLS, Schedule, Timing, pattern},
    transcript::{Edit, Symbol, Transcript},
    transport::{Controls, Event, Kernel, Prepared},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, atomic::Ordering};
use wasm_bindgen::prelude::*;

type Result<T> = std::result::Result<T, JsValue>;
fn error(value: impl ToString) -> JsValue {
    let message = value.to_string();
    JsValue::from_str(
        if message == "prototype blocks must fit within 180 seconds" {
            "Keep this clip under three minutes. Shorten the text or increase its overall speed."
        } else {
            &message
        },
    )
}
fn ns(ms: f64) -> u64 {
    (ms.max(0.0) * 1e6).min(9_007_199_254_740_991.0) as u64
}
fn view(value: Value) -> String {
    value.to_string()
}
const MAX_BINARY: usize = 8 * 1024 * 1024;
#[derive(Default, Clone, Serialize, Deserialize)]
struct State {
    profile: Profile,
    controller: Controller,
    learner: Learner,
    text_next: bool,
    session_completed: bool,
}
#[derive(Clone, Serialize, Deserialize)]
enum LearningEvent {
    Teach(char, i64),
    Finish(char),
    Disclose(char, i64),
    Placement(char, bool, bool, i64),
}
#[derive(Clone, Serialize, Deserialize)]
struct Packet {
    version: u8,
    source: String,
    record: Record,
    events: Vec<LearningEvent>,
}
struct Capture {
    symbol: char,
    onset: Option<u64>,
    end: Option<u64>,
    response: Option<Symbol>,
    unknown: bool,
    replay: bool,
    compromised: bool,
    answered: bool,
}
struct Active {
    record: Record,
    source: String,
    transcript: Transcript,
    plans: Vec<(char, bool)>,
    cursor: usize,
    repeats: u8,
    capture: Option<Capture>,
    work: Profile,
    events: Vec<LearningEvent>,
    rescue: RescueTracker,
    last_input: u64,
    start_frame: Option<u64>,
    rate: u32,
    starts: Vec<Option<Symbol>>,
    ends: Vec<Option<u64>>,
}
#[wasm_bindgen]
pub struct Engine {
    state: State,
    history: Vec<Record>,
    active: Option<Active>,
    last_packet: Vec<u8>,
    last_record: Option<Record>,
}
#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            state: State::default(),
            history: vec![],
            active: None,
            last_packet: vec![],
            last_record: None,
        }
    }
    pub fn load(&mut self, bytes: &[u8]) -> Result<()> {
        if bytes.len() > MAX_BINARY {
            return Err(error("checkpoint too large"));
        }
        self.state = if bytes.is_empty() {
            State::default()
        } else {
            postcard::from_bytes(bytes).map_err(error)?
        };
        self.active = None;
        self.history.clear();
        Ok(())
    }
    /// Validate an explicitly selected backup without applying learning events.
    pub fn restore_checkpoint(&mut self, bytes: &[u8]) -> Result<()> {
        self.load(bytes)?;
        self.state.profile.validate().map_err(error)?;
        self.state.learner.validate().map_err(error)?;
        self.state.controller.validate().map_err(error)?;
        Ok(())
    }
    pub fn restore_record(&mut self, bytes: &[u8], legacy: bool) -> Result<String> {
        if bytes.len() > MAX_BINARY {
            return Err(error("record too large"));
        }
        let mut record: Record = postcard::from_bytes(bytes).map_err(error)?;
        record.validate().map_err(error)?;
        record.derive().map_err(error)?;
        if legacy {
            record.manual_override = true;
            record.decision = "Imported legacy history: acceptance status unavailable".into();
        }
        let result = json!({"content":record.content,"utc":record.utc_ms,"attempt":record.metrics.attempt_accuracy,"finalAccuracy":record.metrics.final_accuracy,"targets":record.metrics.target_count,"decision":record.decision,"pace":record.pace_summary(),"completed":record.completed,"interrupted":record.compromised,"kind":format!("{:?}",record.kind)});
        self.last_record = Some(record);
        Ok(view(result))
    }
    pub fn checkpoint(&self) -> Result<Vec<u8>> {
        postcard::to_allocvec(&self.state).map_err(error)
    }
    /// Explicit self-declaration grants repertoire, never mastery. Only before placement.
    pub fn bootstrap(&mut self, known: &str, now: f64) -> Result<()> {
        if self.state.profile.entry_complete {
            return Err(error("starting repertoire is already set"));
        }
        if known.is_empty() || !known.chars().all(|c| pattern(c).is_some()) {
            return Err(error("choose supported characters"));
        }
        for c in assessment::canonical_repertoire(known).chars() {
            self.state.profile.introduce(c, now as i64);
        }
        self.state.profile.entry_complete = true;
        Ok(())
    }
    pub fn initial_disclosure(&mut self, known: &str, now: f64) {
        if self.state.profile.total_trials == 0 {
            for c in known.chars().filter(|c| pattern(*c).is_some()) {
                self.state.profile.disclose(c, now as i64);
            }
        }
    }
    pub fn reference(&self) -> String {
        view(json!(
            SYMBOLS
                .chars()
                .map(|c| json!({"symbol":c.to_string(),"pattern":pattern(c)}))
                .collect::<Vec<_>>()
        ))
    }
    pub fn language_catalog(&self, c: f64, e: f64) -> Result<String> {
        let stories = dojo_core::language::stories()
            .into_iter()
            .map(|s| {
                let seconds = s
                    .sentences
                    .iter()
                    .map(|t| {
                        Schedule::compile(t, Timing::new(c, e).map_err(error)?, 48000)
                            .map(|s| s.frames as f64 / 48000.0)
                            .map_err(error)
                    })
                    .collect::<Result<Vec<_>>>()?
                    .iter()
                    .sum::<f64>();
                Ok(json!({"id":s.id,"title":s.title,"sentences":s.sentences,"seconds":seconds}))
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(view(
            json!({"version":1,"stories":stories,"words":dojo_core::language::words()}),
        ))
    }
    pub fn language_words(
        &self,
        repertoire: &str,
        set: &str,
        min: u32,
        max: u32,
        seed: f64,
    ) -> String {
        view(json!(dojo_core::language::select(
            repertoire,
            set,
            min as usize,
            max as usize,
            seed as u64
        )))
    }
    pub fn language_encode(&self, json: &str) -> Result<Vec<u8>> {
        if json.len() > dojo_core::prosigns::MAX_PACKET {
            return Err(error("Activity too large"));
        }
        let kind: Value = serde_json::from_str(json).map_err(error)?;
        if kind["kind"] == "message" {
            let activity: dojo_core::messages::Activity =
                serde_json::from_str(json).map_err(error)?;
            return dojo_core::messages::encode(&activity).map_err(error);
        }
        if kind["kind"] == "prosign" {
            let activity: dojo_core::prosigns::Activity =
                serde_json::from_str(json).map_err(error)?;
            return dojo_core::prosigns::encode(&activity).map_err(error);
        }
        if kind["kind"] == "callsign" {
            if json.len() > dojo_core::callsigns::MAX_PACKET {
                return Err(error("Activity too large"));
            }
            let activity: dojo_core::callsigns::Activity =
                serde_json::from_str(json).map_err(error)?;
            return dojo_core::callsigns::encode(&activity).map_err(error);
        }
        let a: dojo_core::language::Activity = serde_json::from_str(json).map_err(error)?;
        dojo_core::language::evaluate(&a).map_err(error)?;
        postcard::to_allocvec(&a).map_err(error)
    }
    pub fn language_decode(&self, bytes: &[u8]) -> Result<String> {
        if bytes.len() > 65536 {
            return Err(error("Activity too large"));
        }
        if bytes.starts_with(dojo_core::messages::MAGIC) {
            let (activity, outcome) = dojo_core::messages::decode(bytes).map_err(error)?;
            return Ok(view(json!({"activity":activity,"outcome":outcome})));
        }
        if bytes.starts_with(dojo_core::prosigns::MAGIC) {
            let (activity, outcome) = dojo_core::prosigns::decode(bytes).map_err(error)?;
            return Ok(view(json!({"activity":activity,"outcome":outcome})));
        }
        if bytes.starts_with(dojo_core::callsigns::MAGIC) {
            let (activity, outcome) = dojo_core::callsigns::decode(bytes).map_err(error)?;
            return Ok(view(json!({"activity":activity,"outcome":outcome})));
        }
        let a: dojo_core::language::Activity = postcard::from_bytes(bytes).map_err(error)?;
        let outcome = dojo_core::language::evaluate(&a).map_err(error)?;
        Ok(view(json!({"activity":a,"outcome":outcome})))
    }
    pub fn callsign_catalog(&self) -> String {
        view(json!(dojo_core::callsigns::catalog()))
    }
    pub fn message_catalog(&self) -> String {
        view(json!(dojo_core::messages::catalog()))
    }
    pub fn message_generate(&self, config_json: &str) -> Result<String> {
        if config_json.len() > 4096 {
            return Err(error("Message configuration too large"));
        }
        let config: dojo_core::messages::Config =
            serde_json::from_str(config_json).map_err(error)?;
        Ok(view(json!(
            dojo_core::messages::generate(&config).map_err(error)?
        )))
    }
    pub fn message_evaluate(&self, activity_json: &str) -> Result<String> {
        if activity_json.len() > dojo_core::messages::MAX_PACKET {
            return Err(error("Activity too large"));
        }
        let activity: dojo_core::messages::Activity =
            serde_json::from_str(activity_json).map_err(error)?;
        Ok(view(json!(
            dojo_core::messages::evaluate(&activity).map_err(error)?
        )))
    }
    pub fn prosign_catalog(&self) -> String {
        view(json!(dojo_core::prosigns::catalog()))
    }
    pub fn prosign_generate(&self, config_json: &str) -> Result<String> {
        if config_json.len() > 4096 {
            return Err(error("Prosign configuration too large"));
        }
        let config: dojo_core::prosigns::Config =
            serde_json::from_str(config_json).map_err(error)?;
        Ok(view(json!(
            dojo_core::prosigns::generate(&config).map_err(error)?
        )))
    }
    pub fn prosign_evaluate(&self, activity_json: &str) -> Result<String> {
        if activity_json.len() > dojo_core::prosigns::MAX_PACKET {
            return Err(error("Activity too large"));
        }
        let activity: dojo_core::prosigns::Activity =
            serde_json::from_str(activity_json).map_err(error)?;
        Ok(view(json!(
            dojo_core::prosigns::evaluate(&activity).map_err(error)?
        )))
    }
    pub fn callsign_generate(&self, config_json: &str) -> Result<String> {
        if config_json.len() > 4096 {
            return Err(error("Callsign configuration too large"));
        }
        let config: dojo_core::callsigns::Config =
            serde_json::from_str(config_json).map_err(error)?;
        Ok(view(json!(
            dojo_core::callsigns::generate(&config).map_err(error)?
        )))
    }
    pub fn callsign_evaluate(&self, activity_json: &str) -> Result<String> {
        if activity_json.len() > dojo_core::callsigns::MAX_PACKET {
            return Err(error("Activity too large"));
        }
        let activity: dojo_core::callsigns::Activity =
            serde_json::from_str(activity_json).map_err(error)?;
        Ok(view(json!(
            dojo_core::callsigns::evaluate(&activity).map_err(error)?
        )))
    }
    pub fn tool_material(
        &self,
        kind: &str,
        characters: &str,
        seed: f64,
        count: u32,
    ) -> Result<String> {
        if kind == "callsigns" {
            if !seed.is_finite() || !(0.0..=u32::MAX as f64).contains(&seed) || seed.fract() != 0.0
            {
                return Err(error(
                    "Callsign seed must be a finite unsigned 32-bit integer",
                ));
            }
            let config = dojo_core::callsigns::Config {
                seed: seed as u32,
                count,
                ..Default::default()
            };
            return Ok(dojo_core::callsigns::generate(&config)
                .map_err(error)?
                .into_iter()
                .map(|item| item.text)
                .collect::<Vec<_>>()
                .join(" "));
        }
        let symbols: Vec<_> = assessment::canonical_repertoire(characters)
            .chars()
            .collect();
        if symbols.is_empty() || !(1..=30).contains(&count) {
            return Err(error("select characters and 1–30 groups"));
        }
        let mut rng = Random::new(seed as u64);
        let words: Vec<String> = (0..count)
            .map(|_| {
                (0..5)
                    .map(|_| symbols[rng.next_u64() as usize % symbols.len()])
                    .collect()
            })
            .collect();
        Ok(words.join(" "))
    }
    pub fn begin_session(&mut self) {
        self.state.controller = Controller::default();
        self.state.text_next = false;
        self.state.session_completed = false;
    }
    pub fn end_session(&mut self) {
        if self.state.session_completed {
            self.state.profile.sessions = self.state.profile.sessions.saturating_add(1);
        }
        self.state.session_completed = false;
    }
    pub fn preferences(&mut self, volume: u8, frequency: u16) -> Result<()> {
        if volume > 100 || !(300..=1000).contains(&frequency) {
            return Err(error("invalid audio preferences"));
        }
        self.state.profile.volume = volume;
        self.state.profile.tone_hz = frequency;
        Ok(())
    }
    pub fn snapshot(&self, now: f64) -> String {
        let p = &self.state.profile;
        let date = Record::new_at(
            "date",
            Context::recognition(20),
            Kind::Teaching,
            now as i64,
            0,
        )
        .local_date;
        let check=assessment::check_context(p,&self.history,&date).map(|(c,r)|json!({"c":c.character_wpm,"e":c.effective_wpm,"material":format!("{:?}",c.material),"repertoire":r}));
        view(
            json!({"policy":POLICY,"introduced":p.introduced,"entryComplete":p.entry_complete,
            "recognitionC":p.recognition_c,"copyingC":p.copying_c,"copyingE":p.copying_e,
            "timeout":p.timeout_seconds,"sessions":p.sessions,"volume":p.volume,"frequency":p.tone_hz,
            "nextMode":if self.state.controller.next_mode==Mode::Recognition{"recognition"}else{"copying"},
            "milestones":assessment::milestones(&self.history),"checkOffer":check}),
        )
    }
    /// Source is guided, demo or tool; all tool parameters are independent of automatic state.
    pub fn prepare(&mut self, request: &str) -> Result<String> {
        if self.active.is_some() {
            return Err(error("finish the current block first"));
        }
        let v: Value = serde_json::from_str(request).map_err(error)?;
        let mode = v["mode"].as_str().unwrap_or("adaptive");
        let source = v["source"].as_str().unwrap_or("guided");
        if !["guided", "demo", "tool"].contains(&source) {
            return Err(error("invalid exercise source"));
        }
        let now = v["now"]
            .as_i64()
            .ok_or_else(|| error("missing wall clock"))?;
        let at = ns(v["at"].as_f64().unwrap_or(0.0));
        let rate = v["rate"].as_u64().unwrap_or(48000) as u32;
        if !(8000..=192000).contains(&rate) {
            return Err(error("invalid sample rate"));
        }
        let seed = v["seed"].as_u64().unwrap_or(1);
        let mut rng = Random::new(seed);
        let mut work = self.state.profile.clone();
        if source != "guided" {
            work.introduced =
                assessment::canonical_repertoire(v["characters"].as_str().unwrap_or(SYMBOLS));
            if work.introduced.is_empty() {
                return Err(error("select at least one character"));
            }
            work.recognition_c = v["c"].as_u64().unwrap_or(20) as u8;
            work.copying_c = work.recognition_c;
            work.copying_e = v["e"].as_u64().unwrap_or(10) as u8;
        }
        let placement = mode == "placement";
        let recognition = placement
            || mode == "recognition"
            || (mode == "adaptive" && self.state.controller.next_mode == Mode::Recognition);
        let mut plans = vec![];
        let mut reason = String::new();
        let mut corpus_id = None;
        let mut corpus_version = None;
        let (context, kind, content) = if recognition {
            plans = if placement {
                let mut symbols: Vec<_> = SYMBOLS
                    .chars()
                    .filter(|c| !work.entry_seen.contains(c))
                    .collect();
                rng.shuffle(&mut symbols);
                symbols.into_iter().map(|c| (c, false)).collect()
            } else if source == "guided" {
                let p = planner::recognition(
                    &work,
                    &self.state.learner,
                    now,
                    self.state.controller.can_introduce(),
                    &mut rng,
                );
                reason = p.reason;
                p.trials.into_iter().map(|t| (t.symbol, t.teach)).collect()
            } else {
                let symbols: Vec<_> = work.introduced.chars().collect();
                (0..if source == "demo" { 5 } else { 20 })
                    .map(|_| (symbols[(rng.next_u64() as usize) % symbols.len()], false))
                    .collect()
            };
            if plans.is_empty() {
                return Err(error("no recognition trials available"));
            }
            (
                Context::recognition(work.recognition_c),
                if placement {
                    Kind::Entry
                } else {
                    Kind::Recognition
                },
                plans.iter().map(|v| v.0).collect(),
            )
        } else {
            let check = mode == "check";
            let mut material = if self.state.text_next {
                Material::Text
            } else {
                Material::Groups
            };
            if check {
                let date = Record::new_at(
                    "date",
                    Context::recognition(20),
                    Kind::Teaching,
                    now,
                    v["offset"].as_i64().unwrap_or(0) as i32,
                )
                .local_date;
                let (c, r) = assessment::check_context(&work, &self.history, &date)
                    .ok_or_else(|| error("no eligible check at demonstrated conditions"))?;
                work.copying_c = c.character_wpm;
                work.copying_e = c.effective_wpm;
                work.introduced = r;
                material = c.material;
            }
            let (content, material) =
                if source != "guided" && v["text"].as_str().is_some_and(|s| !s.trim().is_empty()) {
                    let text = v["text"].as_str().unwrap().to_ascii_uppercase();
                    if text.chars().count() > 4096 {
                        return Err(error("text limit is 4096 characters"));
                    }
                    (text, Material::Text)
                } else {
                    let plan = planner::copying(
                        &work,
                        &self.state.learner,
                        now,
                        material,
                        if check { 180 } else { 60 },
                        check,
                        &mut rng,
                    )
                    .map_err(error)?;
                    reason = plan.reason;
                    corpus_id = plan.corpus_id;
                    corpus_version = (plan.material == Material::Text)
                        .then(|| planner::CORPUS_VERSION.to_string());
                    (plan.content, plan.material)
                };
            (
                Context::copying(work.copying_c, work.copying_e, material),
                if check { Kind::Check } else { Kind::Copying },
                content,
            )
        };
        if !context.valid() {
            return Err(error(
                "character speed 12–35; overall speed 3–character speed",
            ));
        }
        let mut record = Record::new_at(
            v["id"].as_str().unwrap_or("browser"),
            context,
            kind,
            now,
            v["offset"].as_i64().unwrap_or(0) as i32,
        );
        record.content = content;
        record.repertoire = assessment::canonical_repertoire(&work.introduced);
        record.corpus_id = corpus_id;
        record.corpus_version = corpus_version;
        record.selection_reason = reason;
        record.manual_override = source != "guided";
        record.wall_anchor_ns = at;
        record.transport_start_ns = at;
        if !recognition {
            let schedule = Schedule::compile(
                &record.content,
                Timing::new(context.character_wpm as f64, context.effective_wpm as f64)
                    .map_err(error)?,
                rate,
            )
            .map_err(error)?;
            record.scheduled_ns = schedule.frames * 1_000_000_000 / rate as u64;
        }
        let result = view(
            json!({"mode":if recognition{"recognition"}else{"copying"},"placement":placement,"count":plans.len(),
            "c":context.character_wpm,"e":context.effective_wpm,"reason":record.selection_reason,"timeout":work.timeout_seconds,
            "audio":if recognition{Value::Null}else{json!({"text":record.content,"c":context.character_wpm,"e":context.effective_wpm,"rescue":source=="guided"&&kind!=Kind::Check})}}),
        );
        let record_character_count = record.content.chars().filter(|c| *c != ' ').count();
        self.active = Some(Active {
            record,
            source: source.into(),
            transcript: Transcript::default(),
            plans,
            cursor: 0,
            repeats: 0,
            capture: None,
            work,
            events: vec![],
            rescue: RescueTracker::new(1.0),
            last_input: at,
            start_frame: None,
            rate,
            starts: vec![None; record_character_count],
            ends: vec![None; record_character_count],
        });
        Ok(result)
    }
    pub fn next_trial(&mut self, now: f64) -> Result<String> {
        let a = self.active.as_mut().ok_or_else(|| error("no block"))?;
        let Some(&(symbol, teach)) = a.plans.get(a.cursor) else {
            return Ok(view(json!({"done":true})));
        };
        if teach && !a.work.introduced.contains(symbol) {
            return Ok(view(
                json!({"teaching":true,"symbol":symbol.to_string(),"pattern":pattern(symbol),"c":a.record.context.character_wpm}),
            ));
        }
        let assisted = a.work.assisted(symbol, now as i64);
        a.capture = Some(Capture {
            symbol,
            onset: None,
            end: None,
            response: None,
            unknown: false,
            replay: false,
            compromised: false,
            answered: false,
        });
        Ok(view(
            json!({"done":false,"index":a.cursor,"count":a.plans.len(),"assisted":assisted,"audio":{"text":symbol.to_string(),"c":a.record.context.character_wpm,"e":a.record.context.character_wpm,"rescue":false}}),
        ))
    }
    pub fn teach(&mut self, symbol: &str, now: f64) -> Result<()> {
        let a = self.active.as_mut().ok_or_else(|| error("no block"))?;
        let c = symbol
            .chars()
            .next()
            .ok_or_else(|| error("missing symbol"))?;
        if !a.plans.iter().any(|p| p.0 == c && p.1) {
            return Err(error("unplanned teaching acknowledgement"));
        }
        a.work.introduce(c, now as i64);
        a.work.disclose(c, now as i64);
        a.events.push(LearningEvent::Teach(c, now as i64));
        Ok(())
    }
    pub fn disclose(&mut self, symbol: &str, now: f64) -> Result<()> {
        let a = self.active.as_mut().ok_or_else(|| error("no block"))?;
        let c = symbol
            .chars()
            .next()
            .filter(|c| pattern(*c).is_some())
            .ok_or_else(|| error("invalid symbol"))?;
        a.work.disclose(c, now as i64);
        a.events.push(LearningEvent::Disclose(c, now as i64));
        Ok(())
    }
    pub fn marker(
        &mut self,
        kind: u8,
        index: u32,
        frame: f64,
        at_ms: f64,
        value: f64,
    ) -> Result<String> {
        let a = self.active.as_mut().ok_or_else(|| error("no block"))?;
        let at = ns(at_ms);
        match kind {
            0 => {
                if a.start_frame.is_none() {
                    a.start_frame = Some(frame as u64);
                    a.record.transport_start_ns = at;
                }
            }
            1 => {
                if let Some(c) = a.capture.as_mut() {
                    c.onset.get_or_insert(at);
                } else if let Some(symbol) = a
                    .record
                    .content
                    .chars()
                    .filter(|c| *c != ' ')
                    .nth(index as usize)
                {
                    if let Some(slot) = a.starts.get_mut(index as usize) {
                        *slot = Some(Symbol {
                            character: symbol,
                            at_ns: at,
                        });
                    }
                    if let Some(slot) = a.ends.get_mut(index as usize) {
                        *slot = None;
                    }
                }
            }
            2 => {
                if let Some(c) = a.capture.as_mut() {
                    c.end = Some(at);
                } else {
                    if let Some(slot) = a.ends.get_mut(index as usize) {
                        *slot = Some(at);
                    }
                }
            }
            3 => {
                a.rescue.applied(at);
                a.record.rescues = a.rescue.count;
            }
            4 => {
                a.rescue.finished(at);
                a.record.rescue_ns = a
                    .record
                    .rescue_ns
                    .saturating_add((value * 1e9 / a.rate as f64) as u64);
            }
            5 | 6 => {
                a.record.compromised = Some("browser practice paused".into());
                if let Some(c) = a.capture.as_mut() {
                    c.compromised = true;
                }
            }
            7 => {
                a.record.transport_end_ns = at;
                if a.capture.is_none()
                    && let Some(start) = a.start_frame
                {
                    a.record.scheduled_ns = ((frame as u64).saturating_sub(start) * 1_000_000_000
                        / a.rate as u64)
                        .saturating_sub(a.record.rescue_ns);
                }
            }
            8 => {
                a.record.transport_end_ns = at;
                a.record
                    .compromised
                    .get_or_insert("playback stopped".into());
                if let Some(c) = a.capture.as_mut() {
                    c.compromised = true;
                }
            }
            _ => {}
        }
        Ok(view(
            json!({"end":a.capture.as_ref().and_then(|c|c.end).map(|v|v as f64/1e6),"gaps":a.record.rescues}),
        ))
    }
    /// Capture time gates deadlines even if handling is delayed.
    pub fn answer(&mut self, key: &str, at_ms: f64) -> Result<String> {
        let a = self.active.as_mut().ok_or_else(|| error("no block"))?;
        let c = a.capture.as_mut().ok_or_else(|| error("no trial"))?;
        let at = ns(at_ms);
        if c.answered {
            return Ok(view(json!({"accepted":false})));
        }
        if c.end
            .is_some_and(|end| at > end + a.work.timeout_seconds as u64 * 1_000_000_000)
        {
            c.answered = true;
            return Ok(view(json!({"accepted":false,"timeout":true})));
        }
        if key == "replay" {
            c.replay = true;
            c.answered = true;
        } else if c.onset.is_some_and(|onset| at >= onset) {
            if key == "unknown" {
                c.unknown = true;
                c.answered = true;
            } else if let Some(character) = key
                .chars()
                .next()
                .filter(|v| key.chars().count() == 1 && pattern(*v).is_some())
            {
                c.response = Some(Symbol {
                    character: character.to_ascii_uppercase(),
                    at_ns: at,
                });
                c.answered = true;
            }
        }
        Ok(view(
            json!({"accepted":c.answered,"response":c.response.map(|s|s.character.to_string()),"unknown":c.unknown,"replay":c.replay}),
        ))
    }
    pub fn close_trial(&mut self, now: f64, at_ms: f64) -> Result<String> {
        let a = self.active.as_mut().ok_or_else(|| error("no block"))?;
        let c = a.capture.take().ok_or_else(|| error("no trial"))?;
        let onset = c.onset.unwrap_or(ns(at_ms));
        let end = c.end.unwrap_or(onset);
        let correct = c.response.is_some_and(|r| r.character == c.symbol);
        let assisted = a.work.assisted(c.symbol, now as i64) || c.replay;
        a.work.finish_trial(c.symbol);
        a.events.push(LearningEvent::Finish(c.symbol));
        if a.record.kind == Kind::Entry {
            let clean = !c.compromised;
            a.events.push(LearningEvent::Placement(
                c.symbol, correct, clean, now as i64,
            ));
            if clean {
                a.work.entry_seen.insert(c.symbol);
                if correct {
                    a.work.introduce(c.symbol, now as i64);
                }
            }
        }
        a.record.trials.push(RecognitionTrial {
            symbol: c.symbol,
            onset_ns: onset,
            end_ns: end,
            response: c.response,
            assisted,
            compromised: c.compromised,
            explicit_unknown: c.unknown,
        });
        if c.replay && a.repeats < 2 {
            a.repeats += 1;
        } else {
            a.cursor += 1;
            a.repeats = 0;
        }
        Ok(view(
            json!({"expected":c.symbol.to_string(),"pattern":pattern(c.symbol),"correct":correct,"response":c.response.map(|r|r.character.to_string()),
            "unknown":c.unknown,"replay":c.replay,"assisted":assisted,"interrupted":c.compromised,"done":a.cursor>=a.plans.len()}),
        ))
    }
    pub fn edit(&mut self, key: &str, at_ms: f64) -> Result<String> {
        let a = self.active.as_mut().ok_or_else(|| error("no block"))?;
        let edit = match key {
            "backspace" => Edit::Backspace,
            "paste" => Edit::PasteRejected,
            _ => {
                let mut chars = key.chars();
                let c = chars.next().ok_or_else(|| error("empty edit"))?;
                if chars.next().is_some() {
                    Edit::PasteRejected
                } else {
                    Edit::Type(c)
                }
            }
        };
        a.last_input = ns(at_ms);
        let accepted = a.transcript.record(edit, a.last_input).map_err(error)?;
        Ok(view(
            json!({"accepted":accepted,"transcript":a.transcript.final_string()}),
        ))
    }
    pub fn live(&mut self, at_ms: f64) -> Result<String> {
        let a = self.active.as_mut().ok_or_else(|| error("no block"))?;
        let now = ns(at_ms);
        let completed: Vec<_> = a
            .starts
            .iter()
            .zip(&a.ends)
            .filter_map(|(start, end)| {
                start
                    .zip(*end)
                    .filter(|(_, end)| *end <= now)
                    .map(|(start, _)| start)
            })
            .collect();
        let result =
            scoring::live_alignment(&completed, a.transcript.final_text()).map_err(error)?;
        a.rescue.sample(Backlog {
            at_ns: now,
            min: result.backlog_min,
            max: result.backlog_max,
        });
        a.record
            .backlog
            .push((now, result.backlog_min, result.backlog_max));
        if a.record.backlog.len() > 1200 {
            a.record.backlog.remove(0);
        }
        Ok(view(
            json!({"rescue":a.record.kind!=Kind::Check&&a.source=="guided"&&a.rescue.should_request(now,a.last_input,result.latest_errors),
            "release":a.rescue.release_requested(now,result.backlog_min),"gaps":a.record.rescues}),
        ))
    }
    pub fn interrupt(&mut self, reason: &str) {
        if let Some(a) = self.active.as_mut() {
            a.record.compromised = Some(reason.chars().take(240).collect());
            if let Some(c) = a.capture.as_mut() {
                c.compromised = true;
            }
        }
    }
    pub fn finish(&mut self, completed: bool, at_ms: f64) -> Result<String> {
        let mut a = self.active.take().ok_or_else(|| error("no block"))?;
        a.record.completed = completed;
        if a.record.transport_end_ns <= a.record.transport_start_ns {
            a.record.transport_end_ns = ns(at_ms);
        }
        for (start, end) in a.starts.into_iter().zip(a.ends) {
            if let (Some(start), Some(end)) = (start, end) {
                a.record.onsets.push(start);
                a.record.ends_ns.push(end);
            }
        }
        a.record.inputs = a.transcript.events().to_vec();
        a.record.repertoire = assessment::canonical_repertoire(&a.work.introduced);
        if a.record.kind == Kind::Check {
            a.record.assessment_elapsed_ns = ns(at_ms)
                .saturating_sub(a.record.transport_start_ns)
                .min(180_000_000_000);
        }
        let packet = Packet {
            version: 1,
            source: a.source,
            record: a.record,
            events: a.events,
        };
        self.last_packet = postcard::to_allocvec(&packet).map_err(error)?;
        self.accept_packet(packet, true)
    }
    pub fn packet(&self) -> Vec<u8> {
        self.last_packet.clone()
    }
    /// The server recomputes scores; a stale upload can be evaluated without changing state.
    pub fn accept(&mut self, bytes: &[u8], apply: bool) -> Result<String> {
        if bytes.len() > MAX_BINARY {
            return Err(error("block too large"));
        }
        let packet: Packet = postcard::from_bytes(bytes).map_err(error)?;
        self.accept_packet(packet, apply)
    }
    pub fn history_add(&mut self, bytes: &[u8]) -> Result<()> {
        let record: Record = postcard::from_bytes(bytes).map_err(error)?;
        record.validate().map_err(error)?;
        self.history.push(record);
        Ok(())
    }
    pub fn record(&self) -> Result<Vec<u8>> {
        postcard::to_allocvec(
            self.last_record
                .as_ref()
                .ok_or_else(|| error("no result"))?,
        )
        .map_err(error)
    }
    pub fn progress(&self, now: f64, range: u32) -> String {
        let range = match range {
            100 => progress::Range::Hundred,
            0 => progress::Range::All,
            _ => progress::Range::Thirty,
        };
        let data = progress::prepare(&self.history, range);
        let chars:Vec<_>=SYMBOLS.chars().map(|c|{let r=self.state.learner.estimate(c,Context::recognition(self.state.profile.recognition_c),now as i64);
            let copy=self.state.learner.estimate(c,Context::copying(self.state.profile.copying_c,self.state.profile.copying_e,Material::Groups),now as i64);
            json!({"symbol":c.to_string(),"introduced":self.state.profile.introduced.contains(c),"recognition":estimate(&r),"copying":estimate(&copy),
                "due":self.state.profile.reviews.get(&c).is_some_and(|r|r.due_ms<=now as i64)})}).collect();
        view(
            json!({"graphs":data.graphs,"characters":chars,"history":self.history.iter().rev().take(if range==progress::Range::All{usize::MAX}else if range==progress::Range::Hundred{100}else{30}).map(|r|json!({"kind":format!("{:?}",r.kind),"details":progress::history_detail(r)})).collect::<Vec<_>>()}),
        )
    }
}
impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}
impl Engine {
    fn accept_packet(&mut self, mut p: Packet, apply: bool) -> Result<String> {
        if p.version != 1
            || !["guided", "tool", "demo"].contains(&p.source.as_str())
            || p.events.len() > 512
        {
            return Err(error("invalid block envelope"));
        }
        p.record.policy_audit = None;
        p.record.validate().map_err(error)?;
        p.record.derive().map_err(error)?;
        if apply && p.source == "guided" {
            for event in p.events {
                match event {
                    LearningEvent::Teach(c, at) => {
                        if pattern(c).is_none() {
                            return Err(error("invalid teaching"));
                        }
                        self.state.profile.introduce(c, at);
                        self.state.profile.disclose(c, at);
                        self.state.controller.introduced();
                    }
                    LearningEvent::Disclose(c, at) => self.state.profile.disclose(c, at),
                    LearningEvent::Finish(c) => self.state.profile.finish_trial(c),
                    LearningEvent::Placement(c, correct, clean, at) => {
                        if p.record.kind == Kind::Entry && clean {
                            self.state.profile.entry_seen.insert(c);
                            if correct {
                                self.state.profile.introduce(c, at);
                            }
                        }
                    }
                }
            }
            if p.record.kind == Kind::Entry && p.record.completed {
                self.state.profile.entry_complete = self.state.profile.introduced.len() >= 2;
            }
            if p.record.kind == Kind::Check {
                self.state
                    .profile
                    .offered_dates
                    .insert(p.record.local_date.clone());
            }
            p.record
                .apply_policy(&mut self.state.controller, &mut self.state.profile);
            for o in &p.record.observations {
                self.state.learner.observe(o.clone()).map_err(error)?;
            }
            if p.record.context.mode == Mode::Copying {
                self.state.text_next = p.record.context.material != Material::Text;
                self.state
                    .profile
                    .presented(&p.record.content, p.record.corpus_id.as_deref());
            }
        } else {
            p.record.manual_override = true;
            p.record.decision = if apply {
                "Manual practice: automatic targets unchanged"
            } else {
                "Extra practice: newer synchronized state preserved"
            }
            .into();
        }
        let summary = json!({"content":p.record.content,"utc":p.record.utc_ms,"attempt":p.record.metrics.attempt_accuracy,"finalAccuracy":p.record.metrics.final_accuracy,
            "targets":p.record.metrics.target_count,"decision":p.record.decision,"pace":p.record.pace_summary(),"reason":p.record.selection_reason,
            "gaps":p.record.rescues,"completed":p.record.completed,"interrupted":p.record.compromised,"kind":format!("{:?}",p.record.kind),"source":p.source,
            "details":progress::history_detail(&p.record),"qualifying":p.record.qualifying_check()&&p.source=="guided"});
        self.last_record = Some(p.record.clone());
        if apply && p.source == "guided" {
            if p.record.is_practice() && p.record.completed {
                self.state.session_completed = true;
            }
            self.history.push(p.record);
        }
        Ok(view(summary))
    }
}
fn estimate(e: &dojo_core::learner::Estimate) -> Value {
    json!({"mean":e.mean,"lower":e.lower,"upper":e.upper,"n":e.effective_evidence,
    "reliable":e.reliable,"median":e.latency_median_ns.map(|v|v as f64/1e6),"p90":e.latency_p90_ns.map(|v|v as f64/1e6),"latencyN":e.latency_count,
    "confusions":e.confusions.iter().filter(|v|v.2>=3).map(|v|json!({"response":v.0.to_string(),"count":v.2})).collect::<Vec<_>>()})
}

/// Native allocation-free transport reused verbatim in the worklet. Preparation/draining
/// ownership happen between callbacks, never inside the sample-rendering loop.
#[wasm_bindgen]
pub struct AudioKernel {
    kernel: Kernel,
    ready: rtrb::Producer<Box<Prepared>>,
    retired: rtrb::Consumer<Box<Prepared>>,
    events: rtrb::Consumer<Event>,
    buffer: Box<[f32; 2048]>,
    markers: Box<[f64; 4096]>,
    id: u64,
}
#[wasm_bindgen]
impl AudioKernel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let (ready, take) = rtrb::RingBuffer::new(2);
        let (retire, retired) = rtrb::RingBuffer::new(4);
        let (send, events) = rtrb::RingBuffer::new(512);
        Self {
            kernel: Kernel::new(take, retire, send, Arc::new(Controls::new())),
            ready,
            retired,
            events,
            buffer: Box::new([0.0; 2048]),
            markers: Box::new([0.0; 4096]),
            id: 0,
        }
    }
    // Flat numeric arguments avoid serialization or allocation on the worklet boundary.
    #[allow(clippy::too_many_arguments)]
    pub fn prepare(
        &mut self,
        id: u32,
        text: &str,
        c: f64,
        e: f64,
        rate: u32,
        frequency: f64,
        volume: u8,
        rescue: bool,
    ) -> Result<()> {
        while self.retired.pop().is_ok() {}
        if self.kernel.controls.busy.load(Ordering::Acquire) {
            return Err(error("audio is busy"));
        }
        let prepared = Prepared::new(
            id as u64,
            Schedule::compile(text, Timing::new(c, e).map_err(error)?, rate).map_err(error)?,
            frequency,
            rescue,
        )
        .map_err(error)?;
        self.id = id as u64;
        self.kernel.controls.stop.store(false, Ordering::Release);
        self.kernel.controls.pause.store(false, Ordering::Release);
        self.kernel.controls.fault.store(false, Ordering::Release);
        self.kernel.controls.busy.store(true, Ordering::Release);
        self.kernel.controls.volume(volume);
        self.ready
            .push(prepared)
            .map_err(|_| error("audio preparation queue full"))?;
        Ok(())
    }
    /// Explicit joined-token preparation; legacy `prepare` remains character-only.
    #[allow(clippy::too_many_arguments)]
    pub fn prepare_tokens(
        &mut self,
        id: u32,
        text: &str,
        c: f64,
        e: f64,
        rate: u32,
        frequency: f64,
        volume: u8,
        rescue: bool,
    ) -> Result<()> {
        while self.retired.pop().is_ok() {}
        if self.kernel.controls.busy.load(Ordering::Acquire) {
            return Err(error("audio is busy"));
        }
        let prepared = Prepared::new(
            id as u64,
            dojo_core::prosigns::compile_playback(text, Timing::new(c, e).map_err(error)?, rate)
                .map_err(error)?,
            frequency,
            rescue,
        )
        .map_err(error)?;
        self.id = id as u64;
        self.kernel.controls.stop.store(false, Ordering::Release);
        self.kernel.controls.pause.store(false, Ordering::Release);
        self.kernel.controls.fault.store(false, Ordering::Release);
        self.kernel.controls.busy.store(true, Ordering::Release);
        self.kernel.controls.volume(volume);
        self.ready
            .push(prepared)
            .map_err(|_| error("audio preparation queue full"))?;
        Ok(())
    }
    pub fn command(&mut self, name: &str, value: f64) {
        match name {
            "stop" => self.kernel.controls.stop.store(true, Ordering::Release),
            "pause" => self
                .kernel
                .controls
                .pause
                .store(value != 0.0, Ordering::Release),
            "volume" => self.kernel.controls.volume(value as u8),
            "rescue" => self
                .kernel
                .controls
                .rescue
                .store(self.id, Ordering::Release),
            "release" => self
                .kernel
                .controls
                .release_rescue
                .store(self.id, Ordering::Release),
            _ => {}
        }
    }
    pub fn render(&mut self, frame: f64, frames: usize) -> u32 {
        if frames > 2048 {
            self.kernel.controls.fault.store(true, Ordering::Release);
            return self.buffer.as_ptr() as u32;
        }
        self.kernel.output_frame = frame as u64;
        self.kernel.begin_callback();
        for sample in &mut self.buffer[..frames] {
            *sample = self.kernel.sample();
        }
        self.buffer.as_ptr() as u32
    }
    pub fn drain(&mut self) -> usize {
        let mut n = 0;
        while n + 5 <= self.markers.len() {
            let Ok(event) = self.events.pop() else { break };
            self.markers[n] = event.kind as u8 as f64;
            self.markers[n + 1] = event.block as f64;
            self.markers[n + 2] = event.character as f64;
            self.markers[n + 3] = event.frame as f64;
            self.markers[n + 4] = event.value as f64;
            n += 5;
        }
        n
    }
    pub fn buffer_ptr(&self) -> u32 {
        self.buffer.as_ptr() as u32
    }
    pub fn markers_ptr(&self) -> u32 {
        self.markers.as_ptr() as u32
    }
    pub fn fault(&self) -> bool {
        self.kernel.controls.fault.load(Ordering::Acquire)
    }
}
impl Default for AudioKernel {
    fn default() -> Self {
        Self::new()
    }
}
