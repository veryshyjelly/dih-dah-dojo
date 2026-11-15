//! Original synthetic callsign receiving exercises, independent of guided policy.
//!
//! The templates are receiving examples, not an allocation/assignment database or
//! licensing advice. Item IDs contain every generation condition. Preserve v1
//! generation when adding a later corpus version so saved evidence remains usable.
use crate::{
    planner::Random,
    timing::{Schedule, Timing},
};
use serde::{Deserialize, Serialize};

pub const VERSION: u8 = 1;
pub const CORPUS: &str = "dojo-callsigns";
pub const MAGIC: &[u8; 8] = b"CWCALL01";
pub const MAX_PACKET: usize = 65_536;
const FAMILIES: [&str; 4] = ["short", "international", "long", "portable"];
const MODES: [&str; 6] = [
    "call",
    "recovery",
    "qso",
    "contest-serial",
    "contest-zone",
    "pileup",
];
const CONDITIONS: [&str; 4] = ["clean", "noise", "fading", "pileup"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Part {
    pub kind: String,
    pub label: String,
    pub text: String,
    pub start: usize,
    pub end: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Exchange {
    pub kind: String,
    pub label: String,
    pub text: String,
    pub report: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Item {
    pub id: String,
    pub text: String,
    pub audio_text: String,
    pub version: u8,
    pub corpus: String,
    pub corpus_version: u8,
    pub family: String,
    pub mode: String,
    pub condition: String,
    pub parts: Vec<Part>,
    pub own_call: Option<String>,
    pub exchange: Option<Exchange>,
    pub interferer: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub seed: u32,
    pub count: u32,
    pub family: String,
    pub mode: String,
    pub condition: String,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            seed: 1,
            count: 10,
            family: "mixed".into(),
            mode: "call".into(),
            condition: "clean".into(),
        }
    }
}
#[derive(Serialize)]
pub struct Choice {
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
    pub families: Vec<Choice>,
    pub modes: Vec<Choice>,
    pub conditions: Vec<Choice>,
    pub references: Vec<Item>,
}
pub fn catalog() -> Catalog {
    let choice = |id, label, description| Choice {
        id,
        label,
        description,
    };
    let mut references: Vec<_> = FAMILIES
        .iter()
        .enumerate()
        .map(|(index, family)| item(family, "call", "clean", 42, index as u32))
        .collect();
    // Make the two important structural counterexamples discoverable without
    // hoping a random reference card happens to contain them.
    for national in ["VU", "3B"] {
        if let Some(example) = (0..512)
            .map(|seed| item("international", "call", "clean", seed, 0))
            .find(|example| example.parts[0].text == national)
        {
            references.push(example);
        }
    }
    Catalog {
        version: VERSION,
        corpus: CORPUS,
        corpus_version: VERSION,
        provenance: "Original Dojo synthetic receiving examples. No claim of assignment, licensing entitlement or universal country/DXCC mapping. National identifiers may contain digits; structural labels describe these examples only.",
        families: vec![
            choice(
                "short",
                "Short calls",
                "Compact identifiers with one or two suffix letters.",
            ),
            choice(
                "international",
                "International variety",
                "Diverse shapes including Indian and digit-leading identifiers.",
            ),
            choice(
                "long",
                "Long and special-event shapes",
                "Longer numeric and letter components for receiving practice.",
            ),
            choice(
                "portable",
                "Slash forms",
                "Portable, mobile, district and operating-abroad examples; rules vary by jurisdiction.",
            ),
            choice(
                "mixed",
                "Mixed families",
                "A deterministic mixture of all four families.",
            ),
        ],
        modes: vec![
            choice("call", "Whole call", "Copy one complete callsign."),
            choice(
                "recovery",
                "Partial-copy recovery",
                "Record a first copy, request a repeat and repair it without replacing the first attempt.",
            ),
            choice(
                "qso",
                "CQ / DE listening",
                "Identify the station sending CQ; your own call is separate context.",
            ),
            choice(
                "contest-serial",
                "Serial exchange",
                "Copy the calling station and a separately scored three-digit serial; not a universal contest exchange.",
            ),
            choice(
                "contest-zone",
                "Zone exchange",
                "Copy the calling station and a separately scored two-digit CQ-style zone example.",
            ),
            choice(
                "pileup",
                "Overlapping caller",
                "Copy the foreground station with a bounded competing caller.",
            ),
        ],
        conditions: vec![
            choice("clean", "Clean signal", "A single unmodified signal."),
            choice(
                "noise",
                "Noise",
                "Optional simulator noise; separate evidence from clean listening.",
            ),
            choice(
                "fading",
                "Fading",
                "Optional simulator amplitude fading; separate evidence from clean listening.",
            ),
            choice(
                "pileup",
                "Overlapping calls",
                "A second synthetic caller; a practice simulation rather than verified radio realism.",
            ),
        ],
        references,
    }
}
fn validate_conditions(family: &str, mode: &str, condition: &str) -> Result<(), String> {
    if !FAMILIES.contains(&family) || !MODES.contains(&mode) || !CONDITIONS.contains(&condition) {
        return Err("Unknown callsign family, exercise or condition".into());
    }
    if mode == "pileup" && condition != "pileup" {
        return Err("The pileup exercise requires the pileup signal condition".into());
    }
    Ok(())
}
pub fn generate(config: &Config) -> Result<Vec<Item>, String> {
    if !(1..=30).contains(&config.count) {
        return Err("Choose 1–30 callsigns".into());
    }
    let mut output = Vec::with_capacity(config.count as usize);
    for index in 0..config.count {
        let family = if config.family == "mixed" {
            FAMILIES[(config.seed as usize + index as usize) % FAMILIES.len()]
        } else {
            config.family.as_str()
        };
        validate_conditions(family, &config.mode, &config.condition)?;
        output.push(item(
            family,
            &config.mode,
            &config.condition,
            config.seed,
            index,
        ));
    }
    Ok(output)
}
pub fn resolve(id: &str) -> Result<Item, String> {
    if id.len() > 120 {
        return Err("Unknown callsign item version or ID".into());
    }
    let fields: Vec<_> = id.split(':').collect();
    if fields.len() != 6 || fields[0] != "cs1" {
        return Err("Unknown callsign item version or ID".into());
    }
    validate_conditions(fields[1], fields[2], fields[3])?;
    let seed: u32 = fields[4].parse().map_err(|_| "Invalid callsign seed")?;
    let index: u32 = fields[5].parse().map_err(|_| "Invalid callsign index")?;
    if index >= 30 {
        return Err("Invalid callsign index".into());
    }
    let found = item(fields[1], fields[2], fields[3], seed, index);
    if found.id != id {
        return Err("Noncanonical callsign item ID".into());
    }
    Ok(found)
}
fn add(parts: &mut Vec<Part>, kind: &str, label: &str, text: String) {
    let start = parts.last().map_or(0, |part| part.end);
    let end = start + text.len();
    parts.push(Part {
        kind: kind.into(),
        label: label.into(),
        text,
        start,
        end,
    });
}
fn pick<'a>(rng: &mut Random, choices: &'a [&str]) -> &'a str {
    choices[(rng.next_u64() % choices.len() as u64) as usize]
}
fn letters(rng: &mut Random, count: usize) -> String {
    (0..count)
        .map(|_| (b'A' + (rng.next_u64() % 26) as u8) as char)
        .collect()
}
fn base(rng: &mut Random, family: &str) -> Vec<Part> {
    let national = if family == "short" {
        pick(rng, &["K", "N", "W", "G", "M", "F", "I"])
    } else if family == "long" {
        pick(rng, &["AT", "AU", "GB", "TM", "DQ", "8J", "OL", "VI"])
    } else {
        pick(
            rng,
            &[
                "VU", "VU", "VT", "G", "M", "F", "DL", "JA", "VK", "ZL", "ZS", "PY", "LU", "VE",
                "OH", "SM", "3B", "9M", "4X", "5R", "7Q", "9V",
            ],
        )
    };
    let mut parts = Vec::new();
    add(
        &mut parts,
        "national",
        "national identifier",
        national.into(),
    );
    let number = if family == "long" {
        format!("{:02}", rng.next_u64() % 100)
    } else {
        (rng.next_u64() % 10).to_string()
    };
    add(&mut parts, "number", "numeric component", number);
    let count = if family == "short" {
        1 + (rng.next_u64() % 2) as usize
    } else if family == "long" {
        4 + (rng.next_u64() % 3) as usize
    } else {
        2 + (rng.next_u64() % 2) as usize
    };
    add(&mut parts, "suffix", "suffix", letters(rng, count));
    parts
}
fn item(family: &str, mode: &str, condition: &str, seed: u32, index: u32) -> Item {
    let mut rng = Random::new(seed as u64 ^ (index as u64 + 1).wrapping_mul(0xd1b54a32d192ed03));
    let mut parts = Vec::new();
    let portable = (rng.next_u64() % 5) as usize;
    if family == "portable" && portable >= 3 {
        let host = pick(&mut rng, &["F/", "DL/", "VU/", "EA/", "ZS/"]);
        add(&mut parts, "operating", "operating prefix", host.into());
    }
    let source = base(
        &mut rng,
        if family == "portable" {
            "international"
        } else {
            family
        },
    );
    for part in source {
        add(&mut parts, &part.kind, &part.label, part.text);
    }
    if family == "portable" && portable != 3 {
        let status = pick(&mut rng, &["/P", "/M", "/3", "/7"]);
        add(&mut parts, "portable", "portable suffix", status.into());
    }
    let text: String = parts.iter().map(|part| part.text.as_str()).collect();
    let exchange = match mode {
        "contest-serial" => Some(Exchange {
            kind: "serial".into(),
            label: "Serial number".into(),
            text: format!("{:03}", 1 + rng.next_u64() % 999),
            report: "599".into(),
        }),
        "contest-zone" => Some(Exchange {
            kind: "zone".into(),
            label: "CQ-style zone".into(),
            text: format!("{:02}", 1 + rng.next_u64() % 40),
            report: "599".into(),
        }),
        _ => None,
    };
    let own_call =
        (mode == "qso").then(|| if text == "M0DDJ" { "K1XYZ" } else { "M0DDJ" }.to_owned());
    let audio_text = if mode == "qso" {
        format!("CQ CQ DE {text} {text} K")
    } else if let Some(exchange) = &exchange {
        format!("{text} 599 {}", exchange.text)
    } else {
        text.clone()
    };
    let interferer = if mode == "pileup" || condition == "pileup" {
        let other: String = base(&mut rng, "international")
            .iter()
            .map(|part| part.text.as_str())
            .collect();
        Some(if other == text { "K1XYZ".into() } else { other })
    } else {
        None
    };
    Item {
        id: format!("cs1:{family}:{mode}:{condition}:{seed}:{index}"),
        text,
        audio_text,
        version: VERSION,
        corpus: CORPUS.into(),
        corpus_version: VERSION,
        family: family.into(),
        mode: mode.into(),
        condition: condition.into(),
        parts,
        own_call,
        exchange,
        interferer,
    }
}

fn fixed() -> String {
    "fixed".into()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    /// Full submitted answers, not keystroke snapshots. The first remains primary.
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
    #[serde(default = "fixed")]
    pub speed_mode: String,
    #[serde(default)]
    pub exchange_answer: Option<String>,
    #[serde(default)]
    pub exchange_attempts: Vec<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct PartDiagnostic {
    pub name: String,
    pub expected: String,
    pub first_errors: usize,
    pub final_errors: usize,
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
    pub item: Item,
    pub corpus: String,
    pub corpus_version: u8,
    pub family: String,
    pub mode: String,
    pub condition: String,
    pub first_answer: Option<String>,
    pub parts: Vec<PartDiagnostic>,
    pub exchange_correct: Option<bool>,
    pub exchange_final_correct: Option<bool>,
}
fn normalized(value: &str, exchange: bool) -> Result<String, String> {
    if value.len() > 64 {
        return Err("Callsign response is too long".into());
    }
    let value = value.trim().to_ascii_uppercase();
    if !value.bytes().all(|byte| {
        byte.is_ascii_digit()
            || (!exchange && (byte.is_ascii_uppercase() || byte == b'/' || byte == b' '))
    }) {
        return Err("Unsupported callsign or exchange response".into());
    }
    Ok(value)
}
fn responses(
    answer: &Option<String>,
    attempts: &[String],
    exchange: bool,
) -> Result<(Option<String>, Option<String>), String> {
    if attempts.len() > 32 {
        return Err("Too many submitted answers".into());
    }
    let submitted = attempts
        .iter()
        .map(|value| normalized(value, exchange))
        .collect::<Result<Vec<_>, _>>()?;
    let final_answer = answer
        .as_deref()
        .map(|value| normalized(value, exchange))
        .transpose()?;
    if !submitted.is_empty() && submitted.last() != final_answer.as_ref() {
        return Err("Final response and submitted answers disagree".into());
    }
    let first = submitted.first().cloned().or_else(|| final_answer.clone());
    Ok((first, final_answer))
}
/// Exact Levenshtein distance plus deterministic target-position diagnostics.
/// Insertions attach to the preceding target position (or the first at onset).
fn errors(expected: &str, received: &str) -> (usize, Vec<usize>) {
    let a = expected.as_bytes();
    let b = received.as_bytes();
    let width = b.len() + 1;
    let mut dp = vec![0usize; (a.len() + 1) * width];
    for i in 0..=a.len() {
        dp[i * width] = i;
    }
    for (j, slot) in dp.iter_mut().take(width).enumerate() {
        *slot = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            dp[i * width + j] = (dp[(i - 1) * width + j - 1] + usize::from(a[i - 1] != b[j - 1]))
                .min(dp[(i - 1) * width + j] + 1)
                .min(dp[i * width + j - 1] + 1);
        }
    }
    let distance = dp[a.len() * width + b.len()];
    let mut by_position = vec![0usize; a.len()];
    let (mut i, mut j) = (a.len(), b.len());
    while i > 0 || j > 0 {
        if i > 0
            && j > 0
            && dp[i * width + j] == dp[(i - 1) * width + j - 1] + usize::from(a[i - 1] != b[j - 1])
        {
            by_position[i - 1] += usize::from(a[i - 1] != b[j - 1]);
            i -= 1;
            j -= 1;
        } else if i > 0 && dp[i * width + j] == dp[(i - 1) * width + j] + 1 {
            by_position[i - 1] += 1;
            i -= 1;
        } else {
            let position = i.saturating_sub(1).min(a.len() - 1);
            by_position[position] += 1;
            j -= 1;
        }
    }
    (distance, by_position)
}
pub fn evaluate(activity: &Activity) -> Result<Outcome, String> {
    let a = activity;
    if a.version != VERSION
        || a.kind != "callsign"
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
        || a.exchange_attempts.len() > a.revision as usize + 1
        || !["keyboard", "touch"].contains(&a.input.as_str())
        || !["fixed", "adaptive"].contains(&a.speed_mode.as_str())
        || a.created < 0
        || a.self_report.is_some()
        || a.latency_ms
            .is_some_and(|ms| !ms.is_finite() || !(0.0..=3_600_000.0).contains(&ms))
        || !a.c.is_finite()
        || !(5.0..=120.0).contains(&a.c)
        || !a.e.is_finite()
        || !(1.0..=a.c).contains(&a.e)
    {
        return Err("Invalid callsign activity".into());
    }
    let item = resolve(&a.item)?;
    Schedule::compile(
        &item.audio_text,
        Timing::new(a.c, a.e).map_err(|e| e.to_string())?,
        48000,
    )
    .map_err(|e| e.to_string())?;
    let (first, final_answer) = responses(&a.answer, &a.attempts, false)?;
    let (exchange_first, exchange_final) =
        responses(&a.exchange_answer, &a.exchange_attempts, true)?;
    if item.exchange.is_none() && (exchange_first.is_some() || exchange_final.is_some()) {
        return Err("This exercise has no exchange".into());
    }
    let first_exact = first.as_ref().map(|s| *s == item.text);
    let final_exact = final_answer.as_ref().map(|s| *s == item.text);
    let (first_distance, first_positions) = errors(&item.text, first.as_deref().unwrap_or(""));
    let (final_distance, final_positions) =
        errors(&item.text, final_answer.as_deref().unwrap_or(""));
    let accuracy =
        |distance: usize| (1.0 - distance as f64 / item.text.len() as f64).clamp(0.0, 1.0);
    let parts = item
        .parts
        .iter()
        .map(|part| PartDiagnostic {
            name: part.label.clone(),
            expected: part.text.clone(),
            first_errors: first_positions[part.start..part.end].iter().sum(),
            final_errors: final_positions[part.start..part.end].iter().sum(),
        })
        .collect();
    let exchange_correct = item
        .exchange
        .as_ref()
        .map(|exchange| exchange_first.as_deref() == Some(exchange.text.as_str()));
    let exchange_final_correct = item
        .exchange
        .as_ref()
        .map(|exchange| exchange_final.as_deref() == Some(exchange.text.as_str()));
    Ok(Outcome {
        eligible: a.finished
            && !a.interrupted
            && !a.replay
            && !a.revealed
            && !a.review
            && first.is_some(),
        correct: first_exact,
        attempt_accuracy: first.as_ref().map(|_| accuracy(first_distance)),
        final_accuracy: final_answer.as_ref().map(|_| accuracy(final_distance)),
        first_exact,
        final_exact,
        expected: item.text.clone(),
        corpus: CORPUS.into(),
        corpus_version: VERSION,
        family: item.family.clone(),
        mode: item.mode.clone(),
        condition: item.condition.clone(),
        first_answer: first,
        parts,
        exchange_correct,
        exchange_final_correct,
        item,
    })
}
pub fn encode(activity: &Activity) -> Result<Vec<u8>, String> {
    evaluate(activity)?;
    let mut bytes = MAGIC.to_vec();
    bytes.extend(postcard::to_allocvec(activity).map_err(|e| e.to_string())?);
    if bytes.len() > MAX_PACKET {
        return Err("Callsign packet too large".into());
    }
    Ok(bytes)
}
pub fn decode(bytes: &[u8]) -> Result<(Activity, Outcome), String> {
    if bytes.len() > MAX_PACKET || !bytes.starts_with(MAGIC) {
        return Err("Invalid callsign packet".into());
    }
    let (activity, rest): (Activity, _) =
        postcard::take_from_bytes(&bytes[MAGIC.len()..]).map_err(|e| e.to_string())?;
    if !rest.is_empty() {
        return Err("Trailing callsign packet data".into());
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
            kind: "callsign".into(),
            input: "keyboard".into(),
            c: 20.0,
            e: 10.0,
            answer: Some(item.text.clone()),
            attempts: vec![item.text.clone()],
            replay: false,
            revealed: false,
            review: false,
            interrupted: false,
            finished: true,
            self_report: None,
            created: 1000,
            latency_ms: Some(350.0),
            speed_mode: "fixed".into(),
            exchange_answer: item.exchange.as_ref().map(|e| e.text.clone()),
            exchange_attempts: item
                .exchange
                .as_ref()
                .map(|e| vec![e.text.clone()])
                .unwrap_or_default(),
        }
    }
    #[test]
    fn deterministic_catalog_and_every_mode_preserve_structural_metadata() {
        let mut digit_leading = false;
        let mut indian = false;
        for family in FAMILIES {
            for mode in MODES {
                for condition in CONDITIONS {
                    if mode == "pileup" && condition != "pileup" {
                        continue;
                    }
                    let config = Config {
                        seed: 123,
                        count: 30,
                        family: family.into(),
                        mode: mode.into(),
                        condition: condition.into(),
                    };
                    let items = generate(&config).unwrap();
                    assert_eq!(items, generate(&config).unwrap());
                    for item in items {
                        assert_eq!(resolve(&item.id).unwrap(), item);
                        assert_eq!(
                            item.parts
                                .iter()
                                .map(|p| p.text.as_str())
                                .collect::<String>(),
                            item.text
                        );
                        for part in &item.parts {
                            assert_eq!(&item.text[part.start..part.end], part.text);
                        }
                        digit_leading |= item.parts.iter().any(|p| {
                            p.kind == "national" && p.text.starts_with(|c: char| c.is_ascii_digit())
                        });
                        indian |= item.parts.iter().any(|p| {
                            p.kind == "national" && ["VU", "VT"].contains(&p.text.as_str())
                        });
                        let outcome = evaluate(&activity(&item)).unwrap();
                        assert!(outcome.eligible);
                        assert_eq!(outcome.first_exact, Some(true));
                        assert_eq!(outcome.attempt_accuracy, Some(1.0));
                        if item.exchange.is_some() {
                            assert_eq!(outcome.exchange_correct, Some(true));
                        }
                        assert_eq!(
                            item.interferer.is_some(),
                            condition == "pileup" || mode == "pileup"
                        );
                        assert!(item.own_call.as_ref().is_none_or(|own| own != &item.text));
                    }
                }
            }
        }
        assert!(digit_leading && indian);
        assert_eq!(catalog().references.len(), 6);
    }
    #[test]
    fn repairs_do_not_replace_original_submissions_or_inflate_exactness() {
        let item = resolve("cs1:international:recovery:clean:42:0").unwrap();
        let mut a = activity(&item);
        a.attempts = vec!["ZZZ".into(), item.text.clone()];
        a.revision = 1;
        a.id = "trial-1".into();
        let result = evaluate(&a).unwrap();
        assert_eq!(result.first_exact, Some(false));
        assert_eq!(result.final_exact, Some(true));
        assert!(result.attempt_accuracy.unwrap() < 1.0);
        assert_eq!(result.final_accuracy, Some(1.0));
        assert!(result.parts.iter().any(|p| p.first_errors > 0));
        assert!(result.parts.iter().all(|p| p.final_errors == 0));
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
        a.attempts = vec![String::new(), item.text.clone()];
        assert_eq!(evaluate(&a).unwrap().first_exact, Some(false));
    }
    #[test]
    fn exchange_scores_are_separate_and_numeric_structure_is_not_first_digit_split() {
        let serial_item = generate(&Config {
            family: "international".into(),
            mode: "contest-serial".into(),
            ..Config::default()
        })
        .unwrap()
        .remove(0);
        let mut a = activity(&serial_item);
        a.exchange_answer = Some("000".into());
        a.exchange_attempts = vec!["000".into()];
        let result = evaluate(&a).unwrap();
        assert_eq!(result.first_exact, Some(true));
        assert_eq!(result.exchange_correct, Some(false));
        let item = (0..1000)
            .map(|seed| item("international", "call", "clean", seed, 0))
            .find(|item| item.text.starts_with("3B"))
            .unwrap();
        assert_eq!(item.parts[0].text, "3B");
        assert_eq!(item.parts[1].start, 2);
        let mut a = activity(&item);
        let wrong = format!("9{}", &item.text[1..]);
        a.answer = Some(wrong.clone());
        a.attempts = vec![wrong];
        let outcome = evaluate(&a).unwrap();
        assert_eq!(outcome.parts[0].first_errors, 1);
        assert_eq!(outcome.parts[1].first_errors, 0);
    }
    #[test]
    fn packets_validate_version_identity_bounds_and_full_consumption() {
        let item = resolve("cs1:short:call:clean:1:0").unwrap();
        let a = activity(&item);
        let bytes = encode(&a).unwrap();
        assert!(bytes.starts_with(MAGIC));
        assert_eq!(decode(&bytes).unwrap().0.id, a.id);
        let mut trailing = bytes.clone();
        trailing.push(0);
        assert!(decode(&trailing).is_err());
        assert!(decode(&bytes[..bytes.len() - 1]).is_err());
        assert!(decode(&vec![0; MAX_PACKET + 1]).is_err());
        let mut invalid = a.clone();
        invalid.revision = 32;
        assert!(encode(&invalid).is_err());
        let mut invalid = a.clone();
        invalid.latency_ms = Some(-1.0);
        assert!(encode(&invalid).is_err());
        let mut invalid = a.clone();
        invalid.latency_ms = Some(f64::NAN);
        assert!(encode(&invalid).is_err());
        let mut invalid = a.clone();
        invalid.e = 21.0;
        assert!(encode(&invalid).is_err());
        let mut invalid = a.clone();
        invalid.item = "cs2:short:call:clean:1:0".into();
        assert!(encode(&invalid).is_err());
        let mut invalid = a.clone();
        invalid.id = "other-0".into();
        assert!(encode(&invalid).is_err());
        let mut invalid = a;
        invalid.answer = Some("OTHER".into());
        assert!(encode(&invalid).is_err());
        assert!(resolve("cs1:short:call:clean:01:0").is_err());
        assert!(
            generate(&Config {
                count: 31,
                ..Config::default()
            })
            .is_err()
        );
    }
    #[test]
    fn exact_distance_and_diagnostics_remain_bounded_for_insertions_and_omissions() {
        for expected in ["K1A", "3B8ABC", "DL/VU2ABC/P"] {
            for response in ["", "A", "ZZZZZZZZZZZZZZZZZZ", "3B8AB", "DL/VU2ABC/P"] {
                let (distance, positions) = errors(expected, response);
                assert_eq!(positions.iter().sum::<usize>(), distance);
                assert!(distance <= expected.len().max(response.len()));
            }
        }
    }
    #[test]
    fn unfinished_unknown_revealed_and_invalid_responses_are_honest() {
        let item = resolve("cs1:short:call:clean:1:0").unwrap();
        let mut a = activity(&item);
        a.answer = None;
        a.attempts.clear();
        a.revealed = true;
        let result = evaluate(&a).unwrap();
        assert!(!result.eligible);
        assert_eq!(result.first_exact, None);
        assert_eq!(result.attempt_accuracy, None);
        a.answer = Some(item.text.to_ascii_lowercase());
        a.attempts = vec![format!(" {} ", item.text.to_ascii_lowercase())];
        a.revealed = false;
        assert_eq!(evaluate(&a).unwrap().first_exact, Some(true));
        a.finished = false;
        assert!(!evaluate(&a).unwrap().eligible);
        a.finished = true;
        a.answer = Some("☃".into());
        a.attempts = vec!["☃".into()];
        assert!(evaluate(&a).is_err());
        a.answer = Some(item.text.clone());
        a.attempts = vec!["".into(), item.text.clone()];
        assert!(
            evaluate(&a).is_err(),
            "two submissions need at least revision one"
        );
    }
}
