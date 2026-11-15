//! Original, bounded phrase/message material and separate receiving tasks.
//! This module never modifies the guided learner or reserved assessment corpus.
use crate::{
    planner::Random,
    scoring,
    timing::{SYMBOLS, Timing, pattern},
    transcript::Symbol,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const VERSION: u8 = 1;
pub const CORPUS: &str = "dojo-messages";
pub const MAGIC: &[u8; 8] = b"CWMSG001";
pub const MAX_PACKET: usize = 65_536;
const STAGES: [&str; 2] = ["phrase", "message"];
const TASKS: [&str; 3] = ["copy", "detail", "listen"];
const TOPICS: [&str; 4] = ["time", "place", "object", "weather"];
const PER_TOPIC: usize = 32;
const PER_STAGE: usize = TOPICS.len() * PER_TOPIC;
const CONTENT_COUNT: usize = STAGES.len() * PER_STAGE;
const VALUES: [[&str; 8]; 4] = [
    [
        "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    ],
    [
        "PARK", "PORT", "LAKE", "GATE", "BRIDGE", "STATION", "HALL", "SHOP",
    ],
    ["KEY", "MAP", "COAT", "NOTE", "BAG", "BOOK", "LAMP", "RADIO"],
    [
        "SUNNY", "RAINY", "WINDY", "FOGGY", "COLD", "WARM", "DRY", "STORMY",
    ],
];
const PHRASES: [[&str; 4]; 4] = [
    ["MEET AT {}", "START AT {}", "LEAVE AT {}", "CALL AT {}"],
    [
        "MEET AT THE {}",
        "WAIT AT THE {}",
        "GO TO THE {}",
        "STAY AT THE {}",
    ],
    ["SEND A RED {}", "FIND THE {}", "TAKE THE {}", "KEEP THE {}"],
    ["WX IS {}", "IT IS {}", "EXPECT {} WX", "{} WX TODAY"],
];
const MESSAGES: [[&str; 4]; 4] = [
    [
        "WE MEET AT {} NEAR CAMP",
        "PLEASE START THE TEST AT {}",
        "THE TRAIN WILL LEAVE AT {}",
        "PLEASE CALL ME AT {} TODAY",
    ],
    [
        "WE WILL MEET AT THE {} TODAY",
        "PLEASE WAIT FOR ME AT THE {}",
        "THE GROUP IS NOW AT THE {}",
        "WE WILL STAY AT THE {} TONIGHT",
    ],
    [
        "SEND A RED {} AT DAWN",
        "WE NEED THE {} FOR OUR TRIP",
        "PLEASE LEAVE THE {} ON THE TABLE",
        "REMEMBER TO TAKE THE {} WITH YOU",
    ],
    [
        "THE WEATHER IS {} AT OUR STATION",
        "IT WILL BE {} AT THE LAKE",
        "WE EXPECT {} WEATHER HERE THIS AFTERNOON",
        "THE WEATHER HAS BEEN {} HERE TODAY",
    ],
];

#[derive(Debug, Clone, Serialize)]
pub struct OptionInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
}
#[derive(Debug, Serialize)]
pub struct Catalog {
    pub version: u8,
    pub corpus: &'static str,
    pub corpus_version: u8,
    pub provenance: &'static str,
    pub stages: Vec<OptionInfo>,
    pub tasks: Vec<OptionInfo>,
    pub families: Vec<OptionInfo>,
}
pub fn catalog() -> Catalog {
    Catalog {
        version: VERSION,
        corpus: CORPUS,
        corpus_version: VERSION,
        provenance: "Original Dojo templates and controlled facts, CC0-1.0. A bounded practice corpus, not an assessment of proficiency or a collection to complete.",
        stages: vec![
            OptionInfo {
                id: "phrase",
                label: "Short phrases",
                description: "Connect three or four familiar words.",
            },
            OptionInfo {
                id: "message",
                label: "Short messages",
                description: "Follow six to eight words and retain their useful information.",
            },
        ],
        tasks: vec![
            OptionInfo {
                id: "copy",
                label: "Copy the words",
                description: "Submit a complete copy after listening. First submissions and later repairs stay separate.",
            },
            OptionInfo {
                id: "detail",
                label: "Recall a detail",
                description: "Hear the complete material, then answer a factual question. This also requires memory and language comprehension.",
            },
            OptionInfo {
                id: "listen",
                label: "Listen in your head",
                description: "Listen without typing a copy and report your understanding. Self-reports are exposure, not objective accuracy.",
            },
        ],
        families: vec![
            OptionInfo {
                id: "mixed",
                label: "A little of everything",
                description: "Time, place, objects and weather.",
            },
            OptionInfo {
                id: "time",
                label: "Times",
                description: "Hear when something will happen.",
            },
            OptionInfo {
                id: "place",
                label: "Places",
                description: "Hear where something will happen.",
            },
            OptionInfo {
                id: "object",
                label: "Things to remember",
                description: "Hear which item is needed.",
            },
            OptionInfo {
                id: "weather",
                label: "Weather",
                description: "Hear a weather description.",
            },
        ],
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub seed: u32,
    pub count: u32,
    pub stage: String,
    pub task: String,
    pub family: String,
    pub repertoire: String,
    pub c: f64,
    pub e: f64,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            seed: 1,
            count: 10,
            stage: "phrase".into(),
            task: "copy".into(),
            family: "mixed".into(),
            repertoire: SYMBOLS.into(),
            c: 20.0,
            e: 5.0,
        }
    }
}
#[derive(Debug, Clone, Serialize)]
pub struct Choice {
    pub id: String,
    pub label: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct Item {
    pub id: String,
    pub content_id: String,
    pub version: u8,
    pub corpus: String,
    pub corpus_version: u8,
    pub stage: String,
    pub task: String,
    pub family: String,
    pub topic: String,
    pub repertoire: String,
    pub text: String,
    pub audio_text: String,
    pub question: String,
    pub expected: Option<String>,
    pub accepted: Vec<String>,
    pub choices: Vec<Choice>,
    pub required: String,
    pub word_count: usize,
    pub seconds: f64,
}
#[derive(Debug, Clone, Serialize)]
pub struct Generated {
    pub items: Vec<Item>,
    pub available: usize,
    pub reason: Option<String>,
}
fn repertoire(value: &str) -> Result<String, String> {
    if value.len() > SYMBOLS.len() || !value.is_ascii() {
        return Err("Invalid message repertoire".into());
    }
    let upper = value.to_ascii_uppercase();
    if !upper.chars().all(|c| SYMBOLS.contains(c)) {
        return Err("Unsupported message repertoire symbol".into());
    }
    Ok(upper.chars().collect::<BTreeSet<_>>().into_iter().collect())
}
fn pace(c: f64, e: f64) -> Result<Timing, String> {
    if !c.is_finite() || !e.is_finite() || !(5.0..=120.0).contains(&c) || !(1.0..=c).contains(&e) {
        return Err("Invalid message pace".into());
    }
    Timing::new(c, e).map_err(|e| e.to_string())
}
fn family_valid(value: &str) -> bool {
    value == "mixed" || TOPICS.contains(&value)
}
fn fact_aliases(topic: usize, value: usize) -> Vec<String> {
    let expected = VALUES[topic][value];
    let mut accepted = vec![expected.into()];
    match topic {
        0 => {
            accepted.push((value + 2).to_string());
            accepted.push(format!("AT {expected}"));
        }
        1 => {
            accepted.push(format!("THE {expected}"));
            accepted.push(format!("AT THE {expected}"));
        }
        2 => accepted.push(format!("THE {expected}")),
        _ => match expected {
            "SUNNY" => accepted.push("SUN".into()),
            "RAINY" => accepted.push("RAIN".into()),
            "WINDY" => accepted.push("WIND".into()),
            "FOGGY" => accepted.push("FOG".into()),
            "STORMY" => accepted.push("STORM".into()),
            _ => {}
        },
    }
    accepted
}
fn make_item(
    index: usize,
    task: &str,
    family: &str,
    allowed: &str,
    timing: Timing,
) -> Result<Item, String> {
    if index >= CONTENT_COUNT || !TASKS.contains(&task) || !family_valid(family) {
        return Err("Unknown message content or task".into());
    }
    let stage = index / PER_STAGE;
    let topic = index % PER_STAGE / PER_TOPIC;
    let variant = index % PER_TOPIC / 8;
    let value = index % 8;
    if family != "mixed" && family != TOPICS[topic] {
        return Err("Message content does not match its family".into());
    }
    let template = if stage == 0 {
        PHRASES[topic][variant]
    } else {
        MESSAGES[topic][variant]
    };
    let text = template.replace("{}", VALUES[topic][value]);
    let required: String = text
        .chars()
        .filter(|c| *c != ' ')
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if !required.chars().all(|c| allowed.contains(c)) {
        return Err("Message requires characters outside its recorded repertoire".into());
    }
    let schedule =
        crate::prosigns::compile_playback(&text, timing, 48000).map_err(|e| e.to_string())?;
    let content_id = format!("m1-{index}");
    let question = if task == "detail" {
        [
            "What time was given?",
            "Which place was mentioned?",
            "Which item was mentioned?",
            "What weather was described?",
        ][topic]
    } else if task == "copy" {
        "What words did you hear?"
    } else {
        "How much did you follow?"
    };
    let expected = match task {
        "copy" => Some(text.clone()),
        "detail" => Some(VALUES[topic][value].into()),
        _ => None,
    };
    let accepted = match task {
        "copy" => vec![text.clone()],
        "detail" => fact_aliases(topic, value),
        _ => Vec::new(),
    };
    let mut choices = Vec::new();
    if task == "detail" {
        let mut indices = vec![value];
        let mut rng = Random::new(index as u64 ^ 0x19a3_45fe_9027_66d1);
        while indices.len() < 4 {
            let next = (rng.next_u64() % 8) as usize;
            if !indices.contains(&next) {
                indices.push(next);
            }
        }
        for i in (1..indices.len()).rev() {
            let next = (rng.next_u64() % (i as u64 + 1)) as usize;
            indices.swap(i, next);
        }
        choices = indices
            .into_iter()
            .map(|i| Choice {
                id: VALUES[topic][i].into(),
                label: VALUES[topic][i].into(),
            })
            .collect();
    }
    Ok(Item {
        id: format!("msg1:{task}:{family}:{allowed}:{content_id}"),
        content_id,
        version: VERSION,
        corpus: CORPUS.into(),
        corpus_version: VERSION,
        stage: STAGES[stage].into(),
        task: task.into(),
        family: family.into(),
        topic: TOPICS[topic].into(),
        repertoire: allowed.into(),
        word_count: text.split_whitespace().count(),
        seconds: schedule.frames as f64 / 48000.0,
        audio_text: text.clone(),
        text,
        question: question.into(),
        expected,
        accepted,
        choices,
        required,
    })
}
pub fn generate(config: &Config) -> Result<Generated, String> {
    if !(1..=30).contains(&config.count)
        || !STAGES.contains(&config.stage.as_str())
        || !TASKS.contains(&config.task.as_str())
        || !family_valid(&config.family)
    {
        return Err("Invalid message configuration".into());
    }
    let timing = pace(config.c, config.e)?;
    let allowed = repertoire(&config.repertoire)?;
    let stage = usize::from(config.stage == "message");
    let mut pool = (stage * PER_STAGE..(stage + 1) * PER_STAGE)
        .filter_map(|i| make_item(i, &config.task, &config.family, &allowed, timing).ok())
        .collect::<Vec<_>>();
    let available = pool.len();
    let mut rng = Random::new(u64::from(config.seed));
    for i in (1..pool.len()).rev() {
        let next = (rng.next_u64() % (i as u64 + 1)) as usize;
        pool.swap(i, next);
    }
    pool.truncate(config.count as usize);
    Ok(Generated {
        items: pool,
        available,
        reason: if available == 0 {
            Some("No available material fits these characters, stage and signal-duration limits. Choose a broader repertoire or different stage explicitly.".into())
        } else {
            None
        },
    })
}
pub fn resolve(id: &str, c: f64, e: f64) -> Result<Item, String> {
    if id.len() > 160 {
        return Err("Invalid message item ID".into());
    }
    let parts = id.split(':').collect::<Vec<_>>();
    if parts.len() != 5 || parts[0] != "msg1" || !parts[4].starts_with("m1-") {
        return Err("Unknown message content version".into());
    }
    let allowed = repertoire(parts[3])?;
    let index = parts[4][3..]
        .parse::<usize>()
        .map_err(|_| "Invalid message content index")?;
    let item = make_item(index, parts[1], parts[2], &allowed, pace(c, e)?)?;
    if item.id != id {
        return Err("Noncanonical message item ID".into());
    }
    Ok(item)
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
    pub self_report: Option<String>,
    pub created: i64,
    pub familiar: bool,
}
#[derive(Debug, Clone, Serialize)]
pub struct Outcome {
    pub eligible: bool,
    pub exposure: bool,
    pub correct: Option<bool>,
    pub attempt_accuracy: Option<f64>,
    pub final_accuracy: Option<f64>,
    pub first_exact: Option<bool>,
    pub final_exact: Option<bool>,
    pub expected: Option<String>,
    pub first_answer: Option<String>,
    pub item: Item,
    pub corpus: String,
    pub corpus_version: u8,
    pub stage: String,
    pub task: String,
    pub family: String,
    pub repertoire: String,
    pub content_id: String,
    pub accepted: Vec<String>,
}
fn normalized(value: &str) -> Result<String, String> {
    if value.len() > 512 || !value.is_ascii() {
        return Err("Invalid message response".into());
    }
    let value = value
        .split_ascii_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_uppercase();
    if !value.chars().all(|c| c == ' ' || pattern(c).is_some()) {
        return Err("Unsupported message response symbol".into());
    }
    Ok(value)
}
fn copy_accuracy(expected: &str, answer: &str) -> Result<Option<f64>, String> {
    let symbols = |text: &str| {
        text.chars()
            .map(|character| Symbol {
                character,
                at_ns: 0,
            })
            .collect::<Vec<_>>()
    };
    Ok(scoring::score_copy(&symbols(expected), &symbols(answer))
        .map_err(|e| e.to_string())?
        .primary
        .accuracy)
}
pub fn evaluate(a: &Activity) -> Result<Outcome, String> {
    if a.version != VERSION
        || a.kind != "message"
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
    {
        return Err("Invalid message activity".into());
    }
    let item = resolve(&a.item, a.c, a.e)?;
    let listening = item.task == "listen";
    if listening {
        if a.answer.is_some()
            || !a.attempts.is_empty()
            || a.self_report
                .as_deref()
                .is_some_and(|r| !["understood", "partly", "missed"].contains(&r))
            || (a.self_report.is_some() && !a.finished)
        {
            return Err(
                "Listening reports cannot contain objective answers or unsupported self-reports"
                    .into(),
            );
        }
    } else if a.self_report.is_some() || a.answer.is_some() == a.attempts.is_empty() {
        return Err(
            "Objective responses must retain submitted answers and cannot contain self-reports"
                .into(),
        );
    }
    let attempts = a
        .attempts
        .iter()
        .map(|s| normalized(s))
        .collect::<Result<Vec<_>, _>>()?;
    let answer = a.answer.as_deref().map(normalized).transpose()?;
    if !attempts.is_empty() && attempts.last() != answer.as_ref() {
        return Err("Final message answer and submissions disagree".into());
    }
    let first = attempts.first().cloned();
    let exact = |value: &str| item.accepted.iter().any(|expected| expected == value);
    let first_exact = first.as_deref().map(exact);
    let final_exact = answer.as_deref().map(exact);
    let accuracy = |value: &str| {
        if item.task == "copy" {
            copy_accuracy(&item.text, value)
        } else {
            Ok(Some(if exact(value) { 1.0 } else { 0.0 }))
        }
    };
    let attempt_accuracy = first.as_deref().map(accuracy).transpose()?.flatten();
    let final_accuracy = answer.as_deref().map(accuracy).transpose()?.flatten();
    Ok(Outcome {
        eligible: !listening
            && a.finished
            && !a.interrupted
            && !a.replay
            && !a.revealed
            && !a.review
            && first.is_some(),
        exposure: a.finished && !a.interrupted,
        correct: first_exact,
        attempt_accuracy,
        final_accuracy,
        first_exact,
        final_exact,
        expected: item.expected.clone(),
        first_answer: first,
        corpus: CORPUS.into(),
        corpus_version: VERSION,
        stage: item.stage.clone(),
        task: item.task.clone(),
        family: item.family.clone(),
        repertoire: item.repertoire.clone(),
        content_id: item.content_id.clone(),
        accepted: item.accepted.clone(),
        item,
    })
}
pub fn encode(activity: &Activity) -> Result<Vec<u8>, String> {
    evaluate(activity)?;
    let mut bytes = MAGIC.to_vec();
    bytes.extend(postcard::to_allocvec(activity).map_err(|e| e.to_string())?);
    if bytes.len() > MAX_PACKET {
        return Err("Message packet too large".into());
    }
    Ok(bytes)
}
pub fn decode(bytes: &[u8]) -> Result<(Activity, Outcome), String> {
    if bytes.len() > MAX_PACKET || !bytes.starts_with(MAGIC) {
        return Err("Invalid message packet".into());
    }
    let (activity, rest): (Activity, _) =
        postcard::take_from_bytes(&bytes[MAGIC.len()..]).map_err(|e| e.to_string())?;
    if !rest.is_empty() {
        return Err("Trailing message packet data".into());
    }
    let outcome = evaluate(&activity)?;
    Ok((activity, outcome))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn item(index: usize, task: &str) -> Item {
        make_item(
            index,
            task,
            "mixed",
            &repertoire(SYMBOLS).unwrap(),
            pace(20.0, 5.0).unwrap(),
        )
        .unwrap()
    }
    fn activity(item: &Item) -> Activity {
        let answer = item.expected.clone();
        Activity {
            version: 1,
            id: "presented-0".into(),
            trial_id: "presented".into(),
            revision: 0,
            item: item.id.clone(),
            sentence: 0,
            kind: "message".into(),
            input: "keyboard".into(),
            c: 20.0,
            e: 5.0,
            attempts: answer.iter().cloned().collect(),
            answer,
            replay: false,
            revealed: false,
            review: false,
            interrupted: false,
            finished: true,
            self_report: None,
            created: 1,
            familiar: false,
        }
    }
    #[test]
    fn all_original_content_has_coherent_metadata_and_resolves_for_each_task() {
        let mut texts = BTreeSet::new();
        for index in 0..CONTENT_COUNT {
            let copy = item(index, "copy");
            assert!(texts.insert(copy.text.clone()));
            assert!(copy.required.chars().all(|c| SYMBOLS.contains(c)));
            assert!(copy.seconds > 0.0 && copy.seconds < 180.0);
            assert!(
                (if copy.stage == "phrase" { 3..=4 } else { 6..=8 }).contains(&copy.word_count)
            );
            assert!(
                !crate::planner::corpus()
                    .into_iter()
                    .filter(|p| p.check)
                    .any(|p| p.text == copy.text)
            );
            for task in TASKS {
                let value = item(index, task);
                let resolved = resolve(&value.id, 20.0, 5.0).unwrap();
                assert_eq!(resolved.text, copy.text);
                assert_eq!(resolved.content_id, copy.content_id);
                assert_eq!(resolved.task, task);
                let outcome = evaluate(&activity(&value)).unwrap();
                if task == "listen" {
                    assert_eq!(outcome.correct, None);
                    assert!(!outcome.eligible);
                } else {
                    assert_eq!(outcome.first_exact, Some(true));
                    assert_eq!(outcome.attempt_accuracy, Some(1.0));
                    assert!(outcome.eligible);
                }
                if task == "detail" {
                    assert_eq!(resolved.choices.len(), 4);
                    assert_eq!(
                        resolved
                            .choices
                            .iter()
                            .filter(|c| Some(&c.id) == resolved.expected.as_ref())
                            .count(),
                        1
                    );
                }
            }
        }
        assert_eq!(texts.len(), 256);
    }
    #[test]
    fn repertoire_filtering_never_broadens_and_generation_is_unique_and_target_width_stable() {
        let config = Config {
            seed: 42,
            count: 30,
            stage: "message".into(),
            repertoire: "GUVSAZWDPRMEBCNXJQKT".into(),
            ..Config::default()
        };
        let generated = generate(&config).unwrap();
        assert_eq!(generated.available, 3);
        assert_eq!(
            generated
                .items
                .iter()
                .map(|i| i.content_id.as_str())
                .collect::<Vec<_>>(),
            ["m1-133", "m1-196", "m1-193"]
        );
        assert!(
            generated
                .items
                .iter()
                .all(|i| i.required.chars().all(|c| config.repertoire.contains(c)))
        );
        assert_eq!(
            generated
                .items
                .iter()
                .map(|i| &i.id)
                .collect::<BTreeSet<_>>()
                .len(),
            generated.items.len()
        );
        let reversed = Config {
            repertoire: config.repertoire.chars().rev().collect(),
            ..config.clone()
        };
        assert_eq!(
            generate(&reversed)
                .unwrap()
                .items
                .iter()
                .map(|i| &i.id)
                .collect::<Vec<_>>(),
            generated.items.iter().map(|i| &i.id).collect::<Vec<_>>()
        );
        for allowed in ["", "KM"] {
            let empty = generate(&Config {
                repertoire: allowed.into(),
                ..Config::default()
            })
            .unwrap();
            assert!(empty.items.is_empty());
            assert_eq!(empty.available, 0);
            assert!(empty.reason.is_some());
        }
        let phrase = generate(&Config {
            repertoire: config.repertoire.clone(),
            ..Config::default()
        })
        .unwrap();
        assert!(phrase.items.iter().any(|i| i.text == "SEND A RED MAP"));
    }
    #[test]
    fn content_identity_is_independent_of_task_configuration_and_requested_pace() {
        let copy = item(193, "copy");
        let detail = make_item(
            193,
            "detail",
            "object",
            &repertoire(SYMBOLS).unwrap(),
            pace(35.0, 10.0).unwrap(),
        )
        .unwrap();
        assert_eq!(copy.text, detail.text);
        assert_eq!(copy.content_id, detail.content_id);
        assert_ne!(copy.id, detail.id);
        assert!(detail.seconds < copy.seconds);
        let slow = resolve(&copy.id, 15.0, 5.0).unwrap();
        assert_eq!(slow.content_id, copy.content_id);
        assert_eq!(slow.id, copy.id);
    }
    #[test]
    fn copy_first_submission_remains_a_miss_after_an_assisted_exact_repair() {
        let item = item(193, "copy");
        let mut a = activity(&item);
        a.answer = Some("SEND A RED NAP AT DAWN".into());
        a.attempts = vec![a.answer.clone().unwrap()];
        let first = evaluate(&a).unwrap();
        assert!(first.eligible);
        assert_eq!(first.first_exact, Some(false));
        assert!(first.attempt_accuracy.unwrap() < 1.0);
        let saved = encode(&a).unwrap();
        a.revision = 1;
        a.id = "presented-1".into();
        a.answer = item.expected.clone();
        a.attempts.push(a.answer.clone().unwrap());
        a.revealed = true;
        let repaired = evaluate(&a).unwrap();
        assert!(!repaired.eligible);
        assert_eq!(repaired.first_exact, Some(false));
        assert_eq!(repaired.final_exact, Some(true));
        assert_eq!(repaired.attempt_accuracy, first.attempt_accuracy);
        assert_eq!(repaired.final_accuracy, Some(1.0));
        assert_eq!(decode(&saved).unwrap().1.first_exact, Some(false));
        a.attempts = vec![
            a.answer.clone().unwrap(),
            a.answer.clone().unwrap(),
            a.answer.clone().unwrap(),
        ];
        assert!(evaluate(&a).is_err());
    }
    #[test]
    fn fact_aliases_unknowns_assistance_and_familiarity_have_separate_meanings() {
        let i = item(7, "detail");
        assert_eq!(i.expected.as_deref(), Some("NINE"));
        for answer in ["NINE", "9", "at nine", "  NINE  "] {
            let mut a = activity(&i);
            a.answer = Some(answer.into());
            a.attempts = vec![answer.into()];
            assert_eq!(evaluate(&a).unwrap().first_exact, Some(true));
        }
        let mut a = activity(&i);
        a.answer = Some(String::new());
        a.attempts = vec![String::new()];
        let unknown = evaluate(&a).unwrap();
        assert!(unknown.eligible);
        assert_eq!(unknown.first_exact, Some(false));
        assert_eq!(unknown.attempt_accuracy, Some(0.0));
        a = activity(&i);
        a.familiar = true;
        assert!(evaluate(&a).unwrap().eligible);
        for flag in [0, 1, 2, 3] {
            let mut a = activity(&i);
            match flag {
                0 => a.replay = true,
                1 => a.revealed = true,
                2 => a.review = true,
                _ => a.interrupted = true,
            }
            assert!(!evaluate(&a).unwrap().eligible);
        }
        let mut copy = activity(&item(7, "copy"));
        copy.answer = Some("9".into());
        copy.attempts = vec!["9".into()];
        assert_eq!(evaluate(&copy).unwrap().first_exact, Some(false));
    }
    #[test]
    fn self_reports_and_unanswered_exposures_never_become_accuracy() {
        for report in [None, Some("understood"), Some("partly"), Some("missed")] {
            let mut a = activity(&item(0, "listen"));
            a.self_report = report.map(str::to_owned);
            let o = evaluate(&a).unwrap();
            assert!(o.exposure);
            assert!(!o.eligible);
            assert_eq!(o.correct, None);
            assert_eq!(o.attempt_accuracy, None);
            assert_eq!(o.final_accuracy, None);
        }
        let mut a = activity(&item(0, "listen"));
        a.self_report = Some("partly".into());
        a.finished = false;
        assert!(evaluate(&a).is_err());
        a.self_report = None;
        a.interrupted = true;
        let o = evaluate(&a).unwrap();
        assert!(!o.exposure);
        assert!(!o.eligible);
        a.finished = true;
        a.self_report = Some("perfect".into());
        assert!(evaluate(&a).is_err());
        a = activity(&item(0, "copy"));
        a.self_report = Some("understood".into());
        assert!(evaluate(&a).is_err());
        a.self_report = None;
        a.answer = None;
        a.attempts.clear();
        let o = evaluate(&a).unwrap();
        assert!(o.exposure);
        assert!(!o.eligible);
        assert_eq!(o.first_exact, None);
    }
    #[test]
    fn canonical_ids_configuration_and_submission_bounds_are_enforced() {
        for (c, e) in [
            (0.0, 0.0),
            (f64::NAN, 5.0),
            (20.0, f64::INFINITY),
            (20.0, 21.0),
            (121.0, 5.0),
            (20.0, 0.0),
        ] {
            assert!(
                generate(&Config {
                    c,
                    e,
                    ..Config::default()
                })
                .is_err()
            );
        }
        for count in [0, 31] {
            assert!(
                generate(&Config {
                    count,
                    ..Config::default()
                })
                .is_err()
            );
        }
        for allowed in [
            "ABC?*",
            "世界",
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,?/=+A",
        ] {
            assert!(
                generate(&Config {
                    repertoire: allowed.into(),
                    ..Config::default()
                })
                .is_err()
            );
        }
        for (stage, task, family) in [
            ("story", "copy", "mixed"),
            ("phrase", "mastery", "mixed"),
            ("message", "detail", "countries"),
        ] {
            assert!(
                generate(&Config {
                    stage: stage.into(),
                    task: task.into(),
                    family: family.into(),
                    ..Config::default()
                })
                .is_err()
            );
        }
        let base = item(0, "copy");
        for id in [
            base.id.replace("m1-0", "m1-00"),
            base.id.replace("m1-0", "m1-256"),
            base.id.replace("msg1:", "msg2:"),
            "msg1:copy:mixed:KM:m1-0".into(),
        ] {
            assert!(resolve(&id, 20.0, 5.0).is_err());
        }
        let mut a = activity(&base);
        a.attempts.clear();
        assert!(evaluate(&a).is_err());
        a = activity(&base);
        a.answer = Some("WRONG".into());
        assert!(evaluate(&a).is_err());
        a = activity(&base);
        a.revision = 32;
        a.id = "presented-32".into();
        assert!(evaluate(&a).is_err());
        a = activity(&base);
        a.created = -1;
        assert!(evaluate(&a).is_err());
        a = activity(&base);
        a.input = "other".into();
        assert!(evaluate(&a).is_err());
        a = activity(&base);
        a.answer = Some("A".repeat(513));
        a.attempts = vec![a.answer.clone().unwrap()];
        assert!(evaluate(&a).is_err());
    }
    #[test]
    fn packets_round_trip_with_a_separate_magic_and_reject_corruption() {
        let a = activity(&item(3, "detail"));
        let packet = encode(&a).unwrap();
        assert!(packet.starts_with(MAGIC));
        assert!(!packet.starts_with(crate::prosigns::MAGIC));
        let (decoded, outcome) = decode(&packet).unwrap();
        assert_eq!(decoded.id, a.id);
        assert_eq!(outcome.first_exact, Some(true));
        let mut trailing = packet.clone();
        trailing.push(0);
        assert!(decode(&trailing).is_err());
        assert!(decode(&packet[..packet.len() - 1]).is_err());
        assert!(decode(&vec![0; MAX_PACKET + 1]).is_err());
        let mut wrong = packet.clone();
        wrong[7] = b'2';
        assert!(decode(&wrong).is_err());
    }
    #[test]
    fn legacy_story_and_reserved_assessment_assets_remain_byte_identical() {
        assert_eq!(
            format!(
                "{:x}",
                Sha256::digest(include_bytes!("../../../assets/stories.tsv"))
            ),
            "085dcd8adbaccb689467dc1d63c2ad4667f141dd09874a68871cee8a2ed23a15"
        );
        assert_eq!(
            format!(
                "{:x}",
                Sha256::digest(include_bytes!("../../../assets/corpus.tsv"))
            ),
            "bd5e65439462a9c739e02ccd9fd52d2defa5dbb8a41fc2e93283586a8949565d"
        );
        let old = crate::language::Activity {
            version: 1,
            id: "legacy-story".into(),
            item: "story-1".into(),
            sentence: 0,
            kind: "story".into(),
            input: "keyboard".into(),
            c: 20.0,
            e: 10.0,
            answer: None,
            attempts: Vec::new(),
            replay: false,
            revealed: false,
            review: false,
            interrupted: false,
            finished: true,
            self_report: Some(true),
            created: 1,
        };
        let bytes = postcard::to_allocvec(&old).unwrap();
        assert_eq!(
            format!("{:x}", Sha256::digest(&bytes)),
            "67893385b783ee733ddb265e7260cc010b9d0160c17d557a6957eef6dcc0334a"
        );
        let decoded: crate::language::Activity = postcard::from_bytes(&bytes).unwrap();
        assert_eq!(decoded.item, "story-1");
        let outcome = crate::language::evaluate(&decoded).unwrap();
        assert!(!outcome.eligible);
        assert_eq!(outcome.correct, None);
        assert!(!bytes.starts_with(MAGIC));
    }
}
