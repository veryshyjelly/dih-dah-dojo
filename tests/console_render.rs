//! Reviewable terminal fixtures, with explicit accessibility and disclosure assertions.
use dih_dah_dojo::{
    progress::{self, Character, Graph, Point},
    screen::{
        self, AudioPage, CopyingPage, FeedbackPage, MenuPage, Page, Presentation, RecognitionPage,
        RecognitionState, SummaryPage, View,
    },
    timing::SYMBOLS,
};
use ratatui::{Terminal, backend::TestBackend, buffer::Buffer, style::Color};
use std::{path::PathBuf, sync::Arc};

fn render(view: &View, width: u16, height: u16) -> Buffer {
    let mut terminal = Terminal::new(TestBackend::new(width, height)).unwrap();
    terminal.draw(|frame| screen::paint(frame, view)).unwrap();
    terminal.backend().buffer().clone()
}
fn text(buffer: &Buffer) -> String {
    (0..buffer.area.height)
        .map(|y| {
            (0..buffer.area.width)
                .map(|x| buffer[(x, y)].symbol())
                .collect::<String>()
                .trim_end()
                .to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}
fn recognition(symbol: Option<char>, state: RecognitionState) -> View {
    View::page(
        "Recognition",
        Page::Recognition(RecognitionPage {
            response: symbol,
            caption: symbol.map_or_else(|| "...".into(), |c| c.to_string()),
            state,
            speed: 20,
            timeout: 3,
            assisted: false,
            rejected: 0,
        }),
    )
}
fn fixtures() -> Vec<(&'static str, View)> {
    let menu = MenuPage {
        instruments: vec![
            "NEXT AUTOMATIC SPEED C 20 / E 5 WPM".into(),
            "COVERAGE 12/42 introduced | SESSIONS 3".into(),
            "No verified milestone yet".into(),
        ],
        actions: vec![
            "Continue Training".into(),
            "Choose Practice".into(),
            "Progress".into(),
            "Audio".into(),
            "Data: Export binary backup".into(),
            "Data: Reset history".into(),
            "Quit".into(),
        ],
        selected: 0,
    };
    let mut data = progress::prepare(&[], progress::Range::Thirty);
    data.characters = SYMBOLS
        .chars()
        .map(|symbol| Character {
            symbol,
            introduced: "KM".contains(symbol),
            detail: vec![
                format!("Character {symbol}"),
                "Recognition: unobserved".into(),
                "Copying: unobserved".into(),
                "Review: due".into(),
            ],
        })
        .collect();
    let empty = Arc::new(data.clone());
    data.graphs[0] = Graph {
        title: "Copying pace / WPM".into(),
        primary_label: "requested C".into(),
        secondary_label: Some("requested E".into()),
        context: "Copying/Groups".into(),
        trend: None,
        points: vec![Point {
            primary: 20.0,
            secondary: Some(5.0),
            milestone: true,
            detail: vec![
                "2026-11-14 | Check | COMPLETE | INDEPENDENT".into(),
                "Copying/Groups 20/5 WPM | repertoire KM | cw-policy-v1.2 | corpus none".into(),
                "Attempt 98.0% | final 99.0% | targets 100 | independent observations 100".into(),
                "Requested 20/5 WPM | delivered 25 characters/min".into(),
                "VERIFIED: qualifying checks on different dates at these conditions".into(),
            ],
        }],
    };
    data.graphs[1] = Graph {
        title: "Attempt accuracy / %".into(),
        primary_label: "attempt".into(),
        secondary_label: None,
        context: "Recognition/Isolated 20/0 WPM | repertoire KM | cw-policy-v1.2".into(),
        trend: None,
        points: [92.0, 95.0, 93.0]
            .into_iter()
            .map(|value| Point {
                primary: value,
                secondary: None,
                milestone: false,
                detail: vec![format!("2026-11-14 | Attempt {value}% | independent n=20")],
            })
            .collect(),
    };
    data.graphs[2] = Graph {
        title: "Latency / ms (typing)".into(),
        primary_label: "median".into(),
        secondary_label: Some("p90".into()),
        context: "Recognition/Isolated 20/0 WPM | repertoire KM | cw-policy-v1.2".into(),
        trend: None,
        points: vec![Point {
            primary: 400.0,
            secondary: Some(750.0),
            milestone: false,
            detail: vec![
                "2026-11-14 | COMPLETE | INDEPENDENT".into(),
                "Typing-inclusive median 400 ms / p90 750 ms | n=8".into(),
            ],
        }],
    };
    data.history = vec![vec![
        "2026-11-14 | Recognition | INTERRUPTED / TECHNICAL".into(),
        "Assisted repetitions remain separate".into(),
    ]];
    let data = Arc::new(data);
    vec![
        ("dashboard", View::page("Dashboard", Page::Dashboard(menu))),
        (
            "launcher",
            View::page(
                "Practice launcher",
                Page::Practice(MenuPage {
                    instruments: vec!["Choose a practice mode".into()],
                    actions: vec![
                        "Adaptive (default)".into(),
                        "Recognition".into(),
                        "Copying".into(),
                    ],
                    selected: 0,
                }),
            ),
        ),
        (
            "recognition",
            recognition(Some('?'), RecognitionState::Captured),
        ),
        (
            "copying",
            View::page(
                "Continuous copying",
                Page::Copying(CopyingPage {
                    transcript: format!("{}LATEST COPY", "OLD COPY ".repeat(200)),
                    character_wpm: 20,
                    effective_wpm: 5,
                    elapsed_seconds: 42,
                    gaps: 1,
                    rejected: 2,
                    transmission: "RECEIVING".into(),
                }),
            ),
        ),
        (
            "feedback",
            View::page(
                "Correct answer",
                Page::Feedback(FeedbackPage {
                    answer: Some("Z".into()),
                    expected: 'K',
                    pattern: "-.-".into(),
                    explanation: "Listen to the whole sound".into(),
                    assisted: true,
                }),
            ),
        ),
        (
            "summary",
            View::page(
                "Copying block saved",
                Page::Summary(SummaryPage {
                    accuracy: "Attempt: 95.0% | final: 98.0%".into(),
                    pace: "Requested 20/5 WPM\nDelivered 25 characters/min".into(),
                    adaptation: "Hold speed; more evidence needed".into(),
                    evidence: "Independent result | no technical interruption".into(),
                    remaining_ms: 3000,
                    held: true,
                }),
            ),
        ),
        (
            "audio",
            View::page(
                "Audio settings",
                Page::Audio(AudioPage {
                    volume: 45,
                    frequency: 650,
                    selected: 1,
                    preview: "PLAYING PREVIEW".into(),
                }),
            ),
        ),
        (
            "progress-empty",
            View::page(
                "Progress",
                Page::Progress {
                    data: empty,
                    focus: 0,
                    expanded: false,
                    point: 0,
                    scroll: 0,
                },
            ),
        ),
        (
            "progress-sparse",
            View::page(
                "Progress",
                Page::Progress {
                    data: data.clone(),
                    focus: 0,
                    expanded: false,
                    point: 0,
                    scroll: 0,
                },
            ),
        ),
        (
            "graph-detail",
            View::page(
                "Progress",
                Page::Progress {
                    data: data.clone(),
                    focus: 0,
                    expanded: true,
                    point: 0,
                    scroll: 0,
                },
            ),
        ),
        (
            "latency-detail",
            View::page(
                "Progress",
                Page::Progress {
                    data: data.clone(),
                    focus: 2,
                    expanded: true,
                    point: 0,
                    scroll: 0,
                },
            ),
        ),
        (
            "character-detail",
            View::page(
                "Progress",
                Page::Progress {
                    data: data.clone(),
                    focus: 3,
                    expanded: true,
                    point: 10,
                    scroll: 0,
                },
            ),
        ),
        (
            "history-detail",
            View::page(
                "Progress",
                Page::Progress {
                    data,
                    focus: 4,
                    expanded: true,
                    point: 0,
                    scroll: 0,
                },
            ),
        ),
        (
            "paused",
            View::message(
                "Practice paused",
                "The affected trial/block is excluded from unassisted assessment.\nF5: resume | ?: help | Esc: end session",
            ),
        ),
        (
            "reset",
            View::message(
                "Reset local learning history",
                "Type DELETE then Enter to confirm; Esc cancels.\nDEL",
            ),
        ),
    ]
}
#[test]
fn console_rendering_fixtures_at_compact_wide_and_accessible_sizes() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/console");
    let update = std::env::var_os("CW_UPDATE_FIXTURES").is_some();
    if update {
        std::fs::create_dir_all(&root).unwrap();
    }
    for (name, mut view) in fixtures() {
        view.footer =
            "Tab: focus | Enter: activate | F5: pause | Esc: finish | Ctrl-C: quit".into();
        for (style, width, height, presentation) in [
            ("compact", 80, 24, Presentation::default()),
            ("wide", 110, 30, Presentation::default()),
            (
                "mono",
                80,
                24,
                Presentation {
                    plain: false,
                    monochrome: true,
                },
            ),
            (
                "plain",
                80,
                24,
                Presentation {
                    plain: true,
                    monochrome: false,
                },
            ),
        ] {
            view.presentation = presentation;
            let buffer = render(&view, width, height);
            let actual = text(&buffer);
            let path = root.join(format!("{name}-{style}.txt"));
            if update {
                std::fs::write(&path, &actual).unwrap();
            }
            assert_eq!(
                std::fs::read_to_string(&path).unwrap(),
                actual,
                "{}",
                path.display()
            );
            if presentation.plain {
                assert!(actual.is_ascii(), "{name}");
            }
            if presentation.monochrome {
                for cell in &buffer.content {
                    assert_eq!(cell.fg, Color::Reset, "{name}");
                    assert_eq!(cell.bg, Color::Reset, "{name}");
                }
            }
        }
    }
}
#[test]
fn every_recognition_symbol_has_a_distinct_large_readout_and_literal_caption() {
    let mut readouts = std::collections::BTreeSet::new();
    for symbol in SYMBOLS.chars() {
        let view = recognition(Some(symbol), RecognitionState::Captured);
        let buffer = render(&view, 80, 24);
        let output = text(&buffer);
        assert!(output.contains(&format!("Response: {symbol}")));
        assert!(output.contains("ANSWER CAPTURED"));
        let pixels = buffer
            .content
            .iter()
            .filter(|cell| cell.symbol() == "█")
            .count();
        assert!(pixels >= 8, "large readout missing for {symbol}");
        assert!(readouts.insert(output), "duplicate symbol {symbol}");
    }
}
#[test]
fn undisclosed_recognition_and_copying_never_receive_transmitted_content() {
    let output = text(&render(
        &recognition(None, RecognitionState::Listening),
        80,
        24,
    ));
    assert!(output.contains("LISTENING"));
    assert!(!output.contains("Expected:"));
    assert!(!output.contains("-.-"));
    let copy = fixtures()
        .into_iter()
        .find(|(name, _)| *name == "copying")
        .unwrap()
        .1;
    for (width, height) in [(80, 24), (110, 30), (40, 12), (20, 8), (1, 1)] {
        let output = text(&render(&copy, width, height));
        if width >= 40 {
            assert!(output.contains("LATEST COPY▌"));
        }
        if (40..80).contains(&width) {
            assert!(output.contains("Resize to"));
        }
        assert!(!output.contains("correctness"));
        assert!(!output.contains("Attempt:"));
    }
}
#[test]
fn response_states_and_feedback_keep_answer_assistance_and_expected_separate() {
    for (state, label) in [
        (RecognitionState::Listening, "LISTENING"),
        (RecognitionState::Waiting, "WAITING FOR RESPONSE"),
        (RecognitionState::Captured, "ANSWER CAPTURED"),
        (RecognitionState::Unknown, "UNKNOWN"),
        (RecognitionState::Replay, "REPLAY REQUESTED"),
        (RecognitionState::Timeout, "TIMED OUT"),
        (RecognitionState::Interrupted, "INTERRUPTED"),
    ] {
        assert!(text(&render(&recognition(None, state), 80, 24)).contains(label));
    }
    let feedback = fixtures()
        .into_iter()
        .find(|(name, _)| *name == "feedback")
        .unwrap()
        .1;
    let output = text(&render(&feedback, 80, 24));
    assert!(output.contains("Your answer: Z"));
    assert!(output.contains("Expected: K"));
    assert!(output.contains("ASSISTED / DISCLOSED"));
}
