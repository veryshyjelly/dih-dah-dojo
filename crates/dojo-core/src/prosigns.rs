//! Explicit joined procedural signals and independent receiving exercises.
//! Generated examples are original teaching material, not a universal QSO script.
use crate::{
    planner::Random,
    timing::{MorseToken, Schedule, Timing, TimingError, pattern},
};
use serde::{Deserialize, Serialize};

pub const VERSION: u8 = 1;
pub const CORPUS: &str = "dojo-prosigns";
pub const MAGIC: &[u8; 8] = b"CWPROS01";
pub const MAX_PACKET: usize = 65_536;
const MODES: [&str; 3] = ["recognition", "meaning", "context"];
const ITU: &str = "https://www.itu.int/rec/R-REC-M.1677-1-200910-I";
const EUCW: &str = "https://www.eucw.org/op/en/prosigns.html";
const IARU: &str = "https://www.iaru-r1.org/wp-content/uploads/2026/07/IARU-Ethics-and-Operating-Procedures-for-the-Radio-Amateur-4th-Ed-v4.2.0_F.pdf";

#[derive(Debug, Clone, Serialize)]
pub struct Signal {
    pub id: &'static str,
    pub token: &'static str,
    pub pattern: &'static str,
    pub meaning: &'static str,
    pub meaning_id: &'static str,
    pub description: &'static str,
    pub convention: &'static str,
    pub aliases: &'static [&'static str],
    pub source: &'static str,
}
pub const SIGNALS: [Signal; 8] = [
    Signal {
        id: "BT",
        token: "<BT>",
        pattern: "-...-",
        meaning: "Section separator",
        meaning_id: "separator",
        description: "Separate sections or thoughts. The same waveform is written = in ordinary text; it cannot be distinguished by sound alone.",
        convention: "standard",
        aliases: &["="],
        source: ITU,
    },
    Signal {
        id: "AR",
        token: "<AR>",
        pattern: ".-.-.",
        meaning: "End of message",
        meaning_id: "message-end",
        description: "Mark the end of a message. Informal amateur use varies. This is the same waveform as +, not a second sound to distinguish.",
        convention: "standard",
        aliases: &["+"],
        source: EUCW,
    },
    Signal {
        id: "SK",
        token: "<SK>",
        pattern: "...-.-",
        meaning: "End of contact",
        meaning_id: "contact-end",
        description: "Finish the contact with no reply expected. This does not say the station is closing down; CL is a spaced abbreviation.",
        convention: "standard",
        aliases: &[],
        source: ITU,
    },
    Signal {
        id: "AS",
        token: "<AS>",
        pattern: ".-...",
        meaning: "Wait",
        meaning_id: "wait",
        description: "Ask the other station to wait briefly.",
        convention: "standard",
        aliases: &[],
        source: ITU,
    },
    Signal {
        id: "HH",
        token: "<HH>",
        pattern: "........",
        meaning: "Error or correction",
        meaning_id: "error",
        description: "The standard error signal is eight joined dots. HH is a mnemonic label; amateur correction habits vary.",
        convention: "standard",
        aliases: &[],
        source: ITU,
    },
    Signal {
        id: "KN",
        token: "<KN>",
        pattern: "-.--.",
        meaning: "Addressed station only",
        meaning_id: "addressed-only",
        description: "Invite only the addressed station. Joined KN is a common amateur convention; spaced K N is also used. Do not assume every procedural abbreviation is joined.",
        convention: "amateur-variant",
        aliases: &[],
        source: IARU,
    },
    Signal {
        id: "VE",
        token: "<VE>",
        pattern: "...-.",
        meaning: "Understood",
        meaning_id: "understood",
        description: "Acknowledge that the message was understood. VE is a mnemonic for the joined signal, not the spaced letters.",
        convention: "standard",
        aliases: &[],
        source: ITU,
    },
    Signal {
        id: "CT",
        token: "<CT>",
        pattern: "-.-.-",
        meaning: "Start of message",
        meaning_id: "message-start",
        description: "A starting signal, also called commence traffic. It is uncommon in informal amateur contacts.",
        convention: "standard",
        aliases: &[],
        source: ITU,
    },
];
pub fn signal(id: &str) -> Option<&'static Signal> {
    SIGNALS.iter().find(|s| s.id == id)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Choice {
    pub id: String,
    pub label: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Item {
    pub id: String,
    pub version: u8,
    pub corpus: String,
    pub corpus_version: u8,
    pub mode: String,
    pub selection: Vec<String>,
    pub signal: String,
    pub token: String,
    pub audio_text: String,
    pub prompt: String,
    pub expected: String,
    pub choices: Vec<Choice>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub seed: u32,
    pub count: u32,
    pub mode: String,
    pub signals: Vec<String>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            seed: 1,
            count: 10,
            mode: "recognition".into(),
            signals: ["BT", "AR", "SK", "AS"].map(str::to_owned).into(),
        }
    }
}
#[derive(Serialize)]
pub struct Mode {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
}
#[derive(Serialize)]
pub struct Catalog {
    pub version: u8,
    pub corpus: &'static str,
    pub corpus_version: u8,
    pub provenance: &'static str,
    pub signals: &'static [Signal],
    pub modes: Vec<Mode>,
}
pub fn catalog() -> Catalog {
    Catalog {
        version: VERSION,
        corpus: CORPUS,
        corpus_version: VERSION,
        provenance: "ITU-R M.1677-1 timing and signals; EUCW prosign meanings; IARU operating conventions. Joined KN is taught as an amateur variant. BK may be spaced or joined in amateur use; CQ, DE, TU, CL and Q-codes are not automatically joined prosigns. Original scenarios illustrate one intended operation, not a universal QSO template.",
        signals: &SIGNALS,
        modes: vec![
            Mode {
                id: "recognition",
                label: "Recognize the signal",
                description: "Hear one joined signal and submit its complete token.",
            },
            Mode {
                id: "meaning",
                label: "Recall its meaning",
                description: "Hear one signal and choose its operating meaning.",
            },
            Mode {
                id: "context",
                label: "Use it in context",
                description: "Read an operating situation and choose the appropriate signal. Audio follows disclosure.",
            },
        ],
    }
}
fn selection(config: &Config) -> Result<Vec<String>, String> {
    if !MODES.contains(&config.mode.as_str())
        || !(1..=30).contains(&config.count)
        || config.signals.is_empty()
        || config.signals.len() > SIGNALS.len()
        || config.signals.iter().any(|id| signal(id).is_none())
    {
        return Err("Select a supported mode, 1–8 prosigns and 1–30 items".into());
    }
    let mut selected = config.signals.clone();
    selected.sort();
    selected.dedup();
    if selected.len() != config.signals.len() {
        return Err("Duplicate prosign selection".into());
    }
    Ok(selected)
}
pub fn generate(config: &Config) -> Result<Vec<Item>, String> {
    let selected = selection(config)?;
    Ok((0..config.count)
        .map(|index| item(&config.mode, &selected, config.seed, index))
        .collect())
}
fn scenario(id: &str) -> (&'static str, &'static str) {
    match id {
        "BT" => (
            "You have finished giving your name and want to separate it from your location. Which signal separates these two thoughts?",
            "NAME IS MAY <BT> QTH IS YORK",
        ),
        "AR" => (
            "You have reached the end of a formal message. You are marking the message boundary, rather than ending the contact. Which signal fits?",
            "MESSAGE ENDS HERE <AR>",
        ),
        "SK" => (
            "The contact is complete and no reply is expected. You may keep operating afterwards. Which signal marks the end of this contact?",
            "TNX FER QSO 73 <SK>",
        ),
        "AS" => (
            "You need a brief pause before continuing and want the other operator to stand by. Which signal fits?",
            "PSE <AS>",
        ),
        "HH" => (
            "You just sent an incorrect word. Use the standard eight-dot error signal before correcting the text. Which signal is it?",
            "NAME IS MAE <HH> NAME IS MAY",
        ),
        "KN" => (
            "You want only the station you just addressed to respond. In this exercise, use the common joined amateur form. Which signal fits?",
            "VU2ABC DE M0DDJ <KN>",
        ),
        "VE" => (
            "You want to acknowledge that the message has been understood, using the joined understood signal. Which signal fits?",
            "<VE>",
        ),
        _ => (
            "You are about to start a formal message and choose the traditional starting signal. Which signal fits?",
            "<CT> MESSAGE FOLLOWS",
        ),
    }
}
fn item(mode: &str, selected: &[String], seed: u32, index: u32) -> Item {
    let mut rng = Random::new(seed as u64 ^ (index as u64 + 1).wrapping_mul(0xd1b54a32d192ed03));
    // Reduce before converting: usize is 32-bit in WASM and 64-bit natively.
    let s = signal(&selected[(rng.next_u64() % selected.len() as u64) as usize])
        .expect("validated selection");
    let (prompt, audio) = scenario(s.id);
    Item {
        id: format!("ps1:{mode}:{}:{seed}:{index}", selected.join(",")),
        version: VERSION,
        corpus: CORPUS.into(),
        corpus_version: VERSION,
        mode: mode.into(),
        selection: selected.to_vec(),
        signal: s.id.into(),
        token: s.token.into(),
        audio_text: if mode == "context" {
            audio.into()
        } else {
            s.token.into()
        },
        prompt: match mode {
            "meaning" => "What does this signal mean?",
            "context" => prompt,
            _ => "Which joined signal did you hear?",
        }
        .into(),
        expected: if mode == "meaning" {
            s.meaning_id
        } else {
            s.token
        }
        .into(),
        choices: SIGNALS
            .iter()
            .map(|choice| Choice {
                id: if mode == "meaning" {
                    choice.meaning_id
                } else {
                    choice.token
                }
                .into(),
                label: if mode == "meaning" {
                    choice.meaning
                } else {
                    choice.token
                }
                .into(),
            })
            .collect(),
    }
}
pub fn resolve(id: &str) -> Result<Item, String> {
    if id.len() > 128 {
        return Err("Invalid prosign item".into());
    }
    let pieces: Vec<_> = id.split(':').collect();
    if pieces.len() != 5 || pieces[0] != "ps1" {
        return Err("Unsupported prosign item".into());
    }
    let seed: u32 = pieces[3].parse().map_err(|_| "Invalid prosign seed")?;
    let index: u32 = pieces[4].parse().map_err(|_| "Invalid prosign index")?;
    if index >= 30 {
        return Err("Invalid prosign index".into());
    }
    let config = Config {
        seed,
        count: 1,
        mode: pieces[1].into(),
        signals: pieces[2].split(',').map(str::to_owned).collect(),
    };
    let selected = selection(&config)?;
    let result = item(&config.mode, &selected, seed, index);
    if result.id != id {
        return Err("Noncanonical prosign item".into());
    }
    Ok(result)
}

/// Explicit token syntax is opt-in. Bare AR remains ordinary spaced letters.
pub fn compile_text(text: &str, timing: Timing, rate: u32) -> Result<Schedule, TimingError> {
    if text.len() > 16_384 {
        return Err(TimingError("token text too large".into()));
    }
    let normalized = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_uppercase();
    let mut units = Vec::new();
    let mut offset = 0;
    while offset < normalized.len() {
        let rest = &normalized[offset..];
        if rest.starts_with(' ') {
            offset += 1;
            continue;
        }
        let (label, pattern, consumed) = if let Some(rest) = rest.strip_prefix('<') {
            let end = rest
                .find('>')
                .ok_or_else(|| TimingError("unclosed prosign token".into()))?;
            let s = signal(&rest[..end])
                .ok_or_else(|| TimingError("unsupported prosign token".into()))?;
            (s.token, s.pattern, end + 2)
        } else {
            let c = rest.chars().next().expect("nonempty remainder");
            let p = pattern(c).ok_or_else(|| TimingError(format!("unsupported symbol: {c}")))?;
            (&normalized[offset..offset + c.len_utf8()], p, c.len_utf8())
        };
        offset += consumed;
        units.push(MorseToken {
            label,
            pattern,
            word_end: normalized[offset..].starts_with(' '),
        });
    }
    Schedule::compile_tokens(&units, timing, rate)
}

/// Interactive prosign playback ends at the final tone, allowing an immediate
/// answer. Only the unneeded trailing word separation is removed; all element,
/// letter and word intervals inside the presented signal remain unchanged.
pub fn compile_playback(text: &str, timing: Timing, rate: u32) -> Result<Schedule, TimingError> {
    let mut schedule = compile_text(text, timing, rate)?;
    let end = schedule
        .characters
        .last()
        .expect("validated nonempty tokens")
        .end;
    schedule.segments.retain(|segment| segment.end <= end);
    schedule.frames = end;
    Ok(schedule)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Activity {
    pub version: u8,
    pub id: String,
    pub trial_id: String,
    pub revision: u32,
    pub item: String,
    pub sentence: usize,
    pub kind: String,
    pub input: String,
    pub c: f64,
    pub e: f64,
    pub answer: Option<String>,
    pub attempts: Vec<String>,
    pub replay: bool,
    pub revealed: bool,
    pub review: bool,
    pub interrupted: bool,
    pub finished: bool,
    pub self_report: Option<bool>,
    pub created: i64,
    #[serde(default)]
    pub latency_ms: Option<f64>,
}
#[derive(Debug, Clone, Serialize)]
pub struct Outcome {
    pub eligible: bool,
    pub correct: Option<bool>,
    pub attempt_accuracy: Option<f64>,
    pub final_accuracy: Option<f64>,
    pub first_exact: Option<bool>,
    pub final_exact: Option<bool>,
    pub expected: String,
    pub first_answer: Option<String>,
    pub item: Item,
    pub corpus: String,
    pub corpus_version: u8,
    pub mode: String,
    pub selection: Vec<String>,
    pub signal: String,
    pub accepted: Vec<String>,
}
fn normalized(value: &str, mode: &str) -> Result<String, String> {
    if value.len() > 64 || !value.is_ascii() {
        return Err("Invalid prosign response".into());
    }
    let value = value.trim();
    if mode == "meaning" {
        if !value.bytes().all(|b| b.is_ascii_alphabetic() || b == b'-') {
            return Err("Invalid meaning response".into());
        }
        return Ok(value.to_ascii_lowercase());
    }
    let upper = value.to_ascii_uppercase();
    for signal in &SIGNALS {
        if upper == signal.id || upper == signal.token || signal.aliases.contains(&upper.as_str()) {
            return Ok(signal.token.into());
        }
    }
    // Unknown valid ASCII responses remain observable misses, not parse faults.
    if !upper
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b"<>/=+?-".contains(&b))
    {
        return Err("Invalid token response".into());
    }
    Ok(upper)
}
pub fn evaluate(a: &Activity) -> Result<Outcome, String> {
    if a.version != VERSION
        || a.kind != "prosign"
        || a.sentence != 0
        || a.trial_id.is_empty()
        || a.trial_id.len() > 64
        || !a
            .trial_id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        || a.revision > 31
        || a.id != format!("{}-{}", a.trial_id, a.revision)
        || a.attempts.len() > a.revision as usize + 1
        || !["keyboard", "touch"].contains(&a.input.as_str())
        || a.created < 0
        || a.self_report.is_some()
        || a.latency_ms
            .is_some_and(|ms| !ms.is_finite() || !(0.0..=3_600_000.0).contains(&ms))
        || !a.c.is_finite()
        || !(5.0..=120.0).contains(&a.c)
        || !a.e.is_finite()
        || !(1.0..=a.c).contains(&a.e)
    {
        return Err("Invalid prosign activity".into());
    }
    let item = resolve(&a.item)?;
    compile_text(
        &item.audio_text,
        Timing::new(a.c, a.e).map_err(|e| e.to_string())?,
        48000,
    )
    .map_err(|e| e.to_string())?;
    let attempts = a
        .attempts
        .iter()
        .map(|v| normalized(v, &item.mode))
        .collect::<Result<Vec<_>, _>>()?;
    if a.answer.is_some() == attempts.is_empty() {
        return Err("A submitted answer must retain its submission history".into());
    }
    let final_answer = a
        .answer
        .as_deref()
        .map(|v| normalized(v, &item.mode))
        .transpose()?;
    if !attempts.is_empty() && attempts.last() != final_answer.as_ref() {
        return Err("Final response and submissions disagree".into());
    }
    let first = attempts.first().cloned().or_else(|| final_answer.clone());
    let first_exact = first.as_ref().map(|v| *v == item.expected);
    let final_exact = final_answer.as_ref().map(|v| *v == item.expected);
    let s = signal(&item.signal).expect("resolved signal");
    let accepted = if item.mode == "meaning" {
        vec![s.meaning_id.into()]
    } else {
        std::iter::once(s.token)
            .chain(std::iter::once(s.id))
            .chain(s.aliases.iter().copied())
            .map(str::to_owned)
            .collect()
    };
    Ok(Outcome {
        eligible: a.finished
            && !a.interrupted
            && !a.replay
            && !a.revealed
            && !a.review
            && first.is_some(),
        correct: first_exact,
        attempt_accuracy: first_exact.map(|v| if v { 1.0 } else { 0.0 }),
        final_accuracy: final_exact.map(|v| if v { 1.0 } else { 0.0 }),
        first_exact,
        final_exact,
        expected: item.expected.clone(),
        first_answer: first,
        corpus: CORPUS.into(),
        corpus_version: VERSION,
        mode: item.mode.clone(),
        selection: item.selection.clone(),
        signal: item.signal.clone(),
        item,
        accepted,
    })
}
pub fn encode(activity: &Activity) -> Result<Vec<u8>, String> {
    evaluate(activity)?;
    let mut bytes = MAGIC.to_vec();
    bytes.extend(postcard::to_allocvec(activity).map_err(|e| e.to_string())?);
    if bytes.len() > MAX_PACKET {
        return Err("Prosign packet too large".into());
    }
    Ok(bytes)
}
pub fn decode(bytes: &[u8]) -> Result<(Activity, Outcome), String> {
    if bytes.len() > MAX_PACKET || !bytes.starts_with(MAGIC) {
        return Err("Invalid prosign packet".into());
    }
    let (activity, rest): (Activity, _) =
        postcard::take_from_bytes(&bytes[MAGIC.len()..]).map_err(|e| e.to_string())?;
    if !rest.is_empty() {
        return Err("Trailing prosign packet data".into());
    }
    let outcome = evaluate(&activity)?;
    Ok((activity, outcome))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn activity(item: &Item) -> Activity {
        Activity {
            version: 1,
            id: "trial-0".into(),
            trial_id: "trial".into(),
            revision: 0,
            item: item.id.clone(),
            sentence: 0,
            kind: "prosign".into(),
            input: "keyboard".into(),
            c: 20.0,
            e: 5.0,
            answer: Some(item.expected.clone()),
            attempts: vec![item.expected.clone()],
            replay: false,
            revealed: false,
            review: false,
            interrupted: false,
            finished: true,
            self_report: None,
            created: 1,
            latency_ms: Some(100.0),
        }
    }
    #[test]
    fn atomic_schedule_has_one_unit_and_unstretched_inner_gaps() {
        for rate in [44100, 48000, 96000] {
            for s in &SIGNALS {
                let t = Timing::new(20.0, 5.0).unwrap();
                let schedule = compile_text(s.token, t, rate).unwrap();
                assert_eq!(schedule.characters.len(), 1);
                assert_eq!(schedule.characters[0].symbol, '\0');
                assert_eq!(
                    schedule.segments.iter().filter(|s| s.tone).count(),
                    s.pattern.len()
                );
                for silence in schedule
                    .segments
                    .iter()
                    .filter(|s| !s.tone)
                    .take(s.pattern.len() - 1)
                {
                    assert!(
                        ((silence.end - silence.start) as f64 - t.dot * rate as f64).abs() <= 1.0
                    );
                }
                let separated = Schedule::compile(s.id, t, rate).unwrap();
                assert_eq!(separated.characters.len(), 2);
                assert!(separated.frames > schedule.frames);
            }
        }
    }
    #[test]
    fn aliases_are_acoustically_equal_and_legacy_schedule_is_unchanged() {
        let t = Timing::new(20.0, 5.0).unwrap();
        for (token, text) in [("<AR>", "+"), ("<BT>", "=")] {
            let a = compile_text(token, t, 48000).unwrap();
            let b = Schedule::compile(text, t, 48000).unwrap();
            assert_eq!(a.frames, b.frames);
            assert!(
                a.segments
                    .iter()
                    .zip(&b.segments)
                    .all(|(a, b)| a.start == b.start && a.end == b.end && a.tone == b.tone)
            );
        }
        for text in ["PARIS", "AR BT", "CQ CQ DE VU2ABC K", "A=+ B"] {
            let a = compile_text(text, t, 48000).unwrap();
            let b = Schedule::compile(text, t, 48000).unwrap();
            assert_eq!(a.frames, b.frames);
            assert!(
                a.segments
                    .iter()
                    .zip(&b.segments)
                    .all(|(a, b)| a.start == b.start && a.end == b.end && a.tone == b.tone)
            );
        }
        assert!(Schedule::compile("<AR>", t, 48000).is_err());
        for text in ["", "<BK>", "<AR", "<<AR>>", "<AR><NOPE>", "A🙂"] {
            assert!(compile_text(text, t, 48000).is_err(), "{text}");
        }
    }
    #[test]
    fn stable_items_roundtrip_for_every_signal_and_mode() {
        for s in &SIGNALS {
            for mode in MODES {
                let items = generate(&Config {
                    mode: mode.into(),
                    signals: vec![s.id.into()],
                    count: 30,
                    seed: u32::MAX,
                })
                .unwrap();
                assert_eq!(items.len(), 30);
                for item in items {
                    assert_eq!(resolve(&item.id).unwrap(), item);
                    let a = activity(&item);
                    let packet = encode(&a).unwrap();
                    let (_, outcome) = decode(&packet).unwrap();
                    assert!(outcome.eligible);
                    assert_eq!(outcome.correct, Some(true));
                    let mut trailing = packet;
                    trailing.push(0);
                    assert!(decode(&trailing).is_err());
                }
            }
        }
    }
    #[test]
    fn scoring_preserves_first_misses_repairs_and_assistance() {
        let item = generate(&Config {
            signals: vec!["AR".into()],
            ..Config::default()
        })
        .unwrap()
        .remove(0);
        let mut a = activity(&item);
        a.answer = Some("+".into());
        a.attempts = vec!["+".into()];
        assert_eq!(evaluate(&a).unwrap().correct, Some(true));
        a.attempts = vec!["".into()];
        a.answer = Some("".into());
        assert_eq!(evaluate(&a).unwrap().correct, Some(false));
        assert!(evaluate(&a).unwrap().eligible);
        a.revision = 1;
        a.id = "trial-1".into();
        a.attempts.push("AR".into());
        a.answer = Some("AR".into());
        let o = evaluate(&a).unwrap();
        assert_eq!(o.first_exact, Some(false));
        assert_eq!(o.final_exact, Some(true));
        for flag in 0..4 {
            let mut assisted = a.clone();
            match flag {
                0 => assisted.replay = true,
                1 => assisted.revealed = true,
                2 => assisted.review = true,
                _ => assisted.interrupted = true,
            }
            assert!(!evaluate(&assisted).unwrap().eligible);
        }
        a.attempts[1] = "SK".into();
        assert!(evaluate(&a).is_err());
    }
    #[test]
    fn invalid_configuration_and_activity_are_bounded() {
        for id in [
            "ps1:recognition:AR:01:0",
            "ps1:recognition:AR:1:30",
            "ps1:recognition:BT,AR:1:0",
            "ps1:recognition:AR,AR:1:0",
            "ps1:recognition:BK:1:0",
        ] {
            assert!(resolve(id).is_err(), "{id}");
        }
        let item = generate(&Config::default()).unwrap().remove(0);
        let mut a = activity(&item);
        a.latency_ms = Some(-1.0);
        assert!(evaluate(&a).is_err());
        a.latency_ms = None;
        a.id = "other".into();
        assert!(evaluate(&a).is_err());
        assert_eq!(signal("KN").unwrap().convention, "amateur-variant");
    }
    #[test]
    fn token_preparation_rejects_nonfinite_and_extreme_timing() {
        let t = Timing::new(20.0, 5.0).unwrap();
        assert!(compile_text("<AR>", t, 0).is_err());
        assert!(compile_text(&"A".repeat(16_385), t, 48000).is_err());
        for bad in [
            Timing {
                dot: f64::NAN,
                spacing: 1.0,
            },
            Timing {
                dot: 0.1,
                spacing: f64::INFINITY,
            },
            Timing {
                dot: -1.0,
                spacing: 1.0,
            },
            Timing {
                dot: 0.1,
                spacing: 0.01,
            },
            Timing {
                dot: 1e-20,
                spacing: 1e-20,
            },
            Timing {
                dot: 1e100,
                spacing: 1e100,
            },
        ] {
            assert!(compile_text("<AR>", bad, 48000).is_err());
        }
        for (c, e) in [
            (f64::NAN, 5.0),
            (20.0, f64::INFINITY),
            (f64::INFINITY, 1.0),
            (0.0, 1.0),
            (20.0, 21.0),
        ] {
            assert!(Timing::new(c, e).is_err());
        }
        let item = generate(&Config::default()).unwrap().remove(0);
        for (c, e) in [
            (f64::MAX, 1.0),
            (20.0, f64::MIN_POSITIVE),
            (4.0, 1.0),
            (20.0, 21.0),
        ] {
            let mut a = activity(&item);
            a.c = c;
            a.e = e;
            assert!(evaluate(&a).is_err());
        }
        assert!(
            Schedule::compile_tokens(
                &[MorseToken {
                    label: "<AR>",
                    pattern: ".-?",
                    word_end: true
                }],
                t,
                48000
            )
            .is_err()
        );
    }
    #[test]
    fn interactive_playback_ends_at_last_tone_without_changing_interior_timing() {
        for (c, e) in [(20.0, 5.0), (20.0, 20.0), (35.0, 3.0)] {
            for text in ["<AR>", "NAME IS MAY <BT> QTH IS YORK"] {
                let t = Timing::new(c, e).unwrap();
                let full = compile_text(text, t, 48000).unwrap();
                let playback = compile_playback(text, t, 48000).unwrap();
                assert_eq!(playback.frames, full.characters.last().unwrap().end);
                assert_eq!(playback.segments.len() + 1, full.segments.len());
                assert!(playback.segments.last().unwrap().tone);
                assert!(
                    playback
                        .segments
                        .iter()
                        .zip(&full.segments)
                        .all(|(a, b)| a.start == b.start && a.end == b.end && a.tone == b.tone)
                );
                let mut synth = crate::synth::Synth::new(playback, 600.0).unwrap();
                let mut last = 0.0;
                while !synth.done() {
                    last = synth.sample();
                }
                // The existing envelope already reaches silence on the final
                // tone sample, so trimming a silent tail cannot introduce a click.
                assert_eq!(last, 0.0);
                assert_eq!(synth.sample(), 0.0);
            }
        }
    }
    #[test]
    fn persisted_submissions_cannot_omit_the_first_attempt_history() {
        let item = generate(&Config::default()).unwrap().remove(0);
        let mut a = activity(&item);
        a.attempts.clear();
        assert!(evaluate(&a).is_err());
        a.answer = None;
        assert!(!evaluate(&a).unwrap().eligible);
        a.attempts.push(String::new());
        assert!(evaluate(&a).is_err());
    }
    #[test]
    fn generation_uses_full_u64_randomness_before_target_pointer_width_conversion() {
        // A 32-bit truncation before modulo would incorrectly yield AR for the
        // first two seeds. Keep these fixtures identical in native and WASM tests.
        for (seed, expected) in [(0, "BT"), (1, "AS"), (2, "AR"), (3, "AR"), (4, "BT")] {
            let item = generate(&Config {
                seed,
                count: 1,
                signals: vec!["BT".into(), "AR".into(), "AS".into()],
                ..Config::default()
            })
            .unwrap()
            .remove(0);
            assert_eq!(item.signal, expected);
        }
    }
}
