//! UI stays on the main thread; the coordinator never waits for terminal drawing.
use ratatui::{
    Terminal,
    backend::CrosstermBackend,
    layout::{Alignment, Constraint, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{
        Axis, Block, BorderType, Borders, Chart, Dataset, Gauge, GraphType, List, ListItem,
        ListState, Paragraph, Wrap,
    },
};
use rtrb::{Consumer, Producer, PushError, RingBuffer};
use std::{
    io,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Presentation {
    pub plain: bool,
    pub monochrome: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MenuPage {
    pub instruments: Vec<String>,
    pub actions: Vec<String>,
    pub selected: usize,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecognitionState {
    Listening,
    Waiting,
    Captured,
    Unknown,
    Replay,
    Timeout,
    Interrupted,
}
impl RecognitionState {
    fn label(self) -> &'static str {
        match self {
            Self::Listening => "LISTENING",
            Self::Waiting => "WAITING FOR RESPONSE",
            Self::Captured => "ANSWER CAPTURED",
            Self::Unknown => "UNKNOWN",
            Self::Replay => "REPLAY REQUESTED - ASSISTED",
            Self::Timeout => "TIMED OUT",
            Self::Interrupted => "INTERRUPTED - TECHNICAL / CONTROL",
        }
    }
}
#[derive(Debug, Clone, PartialEq)]
pub struct RecognitionPage {
    pub response: Option<char>,
    pub caption: String,
    pub state: RecognitionState,
    pub speed: u8,
    pub timeout: u8,
    pub assisted: bool,
    pub rejected: u32,
}
#[derive(Debug, Clone, PartialEq)]
pub struct CopyingPage {
    pub transcript: String,
    pub character_wpm: u8,
    pub effective_wpm: u8,
    pub elapsed_seconds: u64,
    pub gaps: u8,
    pub rejected: usize,
    pub transmission: String,
}
#[derive(Debug, Clone, PartialEq)]
pub struct FeedbackPage {
    pub answer: Option<String>,
    pub expected: char,
    pub pattern: String,
    pub explanation: String,
    pub assisted: bool,
}
#[derive(Debug, Clone, PartialEq)]
pub struct SummaryPage {
    pub accuracy: String,
    pub pace: String,
    pub adaptation: String,
    pub evidence: String,
    pub remaining_ms: u64,
    pub held: bool,
}
#[derive(Debug, Clone, PartialEq)]
pub struct AudioPage {
    pub volume: u8,
    pub frequency: u16,
    pub selected: usize,
    pub preview: String,
}
#[derive(Debug, Clone, PartialEq)]
pub enum Page {
    Notice {
        lines: Vec<String>,
        scroll: u16,
    },
    Dashboard(MenuPage),
    Practice(MenuPage),
    Recognition(RecognitionPage),
    Copying(CopyingPage),
    Feedback(FeedbackPage),
    Summary(SummaryPage),
    Audio(AudioPage),
    Progress {
        data: Arc<crate::progress::ProgressData>,
        focus: usize,
        expanded: bool,
        point: usize,
        scroll: u16,
    },
}
#[derive(Debug, Clone, PartialEq)]
pub struct View {
    pub title: String,
    pub page: Page,
    pub footer: String,
    pub presentation: Presentation,
}
impl View {
    pub fn message(title: impl Into<String>, body: impl Into<String>) -> Self {
        Self::page(
            title,
            Page::Notice {
                lines: body.into().lines().map(str::to_string).collect(),
                scroll: 0,
            },
        )
    }
    pub fn page(title: impl Into<String>, page: Page) -> Self {
        Self {
            title: title.into(),
            page,
            footer: "Esc: return | Ctrl-C: quit".into(),
            presentation: Presentation::default(),
        }
    }
}
struct QueuedView {
    view: View,
    submitted: Instant,
}
pub struct Sender {
    queue: Producer<QueuedView>,
    pending: Option<QueuedView>,
    pub measurements: Option<Arc<crate::latency::Measurements>>,
    last: Option<View>,
}
impl Sender {
    pub fn send(&mut self, view: View) {
        if self.last.as_ref() == Some(&view) {
            return;
        }
        self.last = Some(view.clone());
        if self.pending.take().is_some()
            && let Some(metrics) = &self.measurements
        {
            metrics.coalesced_view();
        }
        let view = QueuedView {
            view,
            submitted: Instant::now(),
        };
        match self.queue.push(view) {
            Ok(()) => self.pending = None,
            Err(PushError::Full(view)) => self.pending = Some(view),
        }
    }
    pub fn redraw(&mut self) {
        if let Some(view) = self.last.take() {
            self.send(view);
        }
    }
    pub fn flush(&mut self) {
        if let Some(view) = self.pending.take()
            && let Err(PushError::Full(view)) = self.queue.push(view)
        {
            self.pending = Some(view);
        }
    }
}
// Console renderer: all coordinates and visual state are presentation-only.
#[derive(Clone, Copy)]
struct Palette {
    background: Color,
    panel: Color,
    amber: Color,
    cyan: Color,
    text: Color,
    muted: Color,
    fault: Color,
}
impl Palette {
    fn new(monochrome: bool) -> Self {
        if monochrome {
            return Self {
                background: Color::Reset,
                panel: Color::Reset,
                amber: Color::Reset,
                cyan: Color::Reset,
                text: Color::Reset,
                muted: Color::Reset,
                fault: Color::Reset,
            };
        }
        Self {
            background: Color::Rgb(11, 17, 24),
            panel: Color::Rgb(17, 29, 41),
            amber: Color::Rgb(255, 180, 84),
            cyan: Color::Rgb(139, 233, 253),
            text: Color::Rgb(218, 227, 237),
            muted: Color::Rgb(138, 155, 174),
            fault: Color::Rgb(255, 107, 107),
        }
    }
}
fn text_mode(text: &str, plain: bool) -> String {
    if !plain {
        return text.to_string();
    }
    text.chars()
        .map(|c| match c {
            '·' | '•' | '│' => '|',
            '—' | '–' | '─' => '-',
            '→' | '›' => '>',
            '…' => '.',
            '×' => 'x',
            '↑' => '^',
            '↓' => 'v',
            c if c.is_ascii() => c,
            _ => ' ',
        })
        .collect()
}
fn panel(title: &str, selected: bool, palette: Palette, plain: bool) -> Block<'_> {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Plain)
        .border_style(Style::default().fg(if selected {
            palette.cyan
        } else {
            palette.muted
        }))
        .style(Style::default().bg(palette.panel).fg(palette.text))
        .title(title.to_string());
    if plain {
        block.border_set(ratatui::symbols::border::Set {
            top_left: "+",
            top_right: "+",
            bottom_left: "+",
            bottom_right: "+",
            vertical_left: "|",
            vertical_right: "|",
            horizontal_top: "-",
            horizontal_bottom: "-",
        })
    } else {
        block
    }
}
fn paragraph(frame: &mut ratatui::Frame, area: Rect, text: &str, palette: Palette, plain: bool) {
    frame.render_widget(
        Paragraph::new(text_mode(text, plain))
            .style(Style::default().fg(palette.text))
            .wrap(Wrap { trim: false }),
        area,
    );
}
pub fn paint(frame: &mut ratatui::Frame, view: &View) {
    let area = frame.area();
    let plain = view.presentation.plain;
    let palette = Palette::new(view.presentation.monochrome);
    frame.render_widget(
        Block::default().style(Style::default().bg(palette.background).fg(palette.text)),
        area,
    );
    let tiny = area.width < 80 || area.height < 24;
    let wide = area.width >= 110 && area.height >= 30;
    let parts = Layout::vertical([
        Constraint::Length(if tiny { 2 } else { 3 }),
        Constraint::Min(1),
        Constraint::Length(1),
        Constraint::Length(if tiny { 2 } else { 3 }),
    ])
    .split(area);
    let section = match &view.page {
        Page::Dashboard(_) => Some(0),
        Page::Practice(_) => Some(1),
        Page::Progress { .. } => Some(2),
        Page::Audio(_) => Some(3),
        _ => None,
    };
    let station = Line::from(vec![
        Span::styled(" CW / DOJO ", Style::default().fg(palette.amber).bold()),
        Span::styled(
            "  RECEIVE  /  LEARN  /  REPEAT",
            Style::default().fg(palette.muted),
        ),
    ]);
    let mut header = vec![station];
    if !tiny {
        header.push(Line::from(
            ["1 Dashboard", "2 Practice", "3 Progress", "4 Audio"]
                .iter()
                .enumerate()
                .flat_map(|(i, label)| {
                    [
                        Span::styled(
                            format!(" {label} "),
                            if section == Some(i) {
                                Style::default()
                                    .fg(palette.cyan)
                                    .add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
                            } else {
                                Style::default().fg(palette.muted)
                            },
                        ),
                        Span::raw(" "),
                    ]
                })
                .collect::<Vec<_>>(),
        ));
    }
    header.push(Line::styled(
        text_mode(&format!(" {}", view.title), plain),
        Style::default()
            .fg(
                if view.title.contains("Reset")
                    || view.title.contains("failed")
                    || view.title.contains("could not")
                {
                    palette.fault
                } else {
                    palette.amber
                },
            )
            .bold(),
    ));
    frame.render_widget(Paragraph::new(header), parts[0]);
    let body = parts[1];
    frame.render_widget(
        Block::default().style(Style::default().bg(palette.panel)),
        body,
    );
    match &view.page {
        Page::Notice { lines, scroll } => {
            frame.render_widget(
                Paragraph::new(text_mode(&lines.join("\n"), plain))
                    .scroll((*scroll, 0))
                    .wrap(Wrap { trim: false })
                    .block(panel(" MESSAGE ", false, palette, plain)),
                body,
            );
        }
        Page::Dashboard(menu) | Page::Practice(menu) => {
            render_menu(frame, body, menu, palette, plain, wide)
        }
        Page::Recognition(page) => render_recognition(frame, body, page, palette, plain),
        Page::Copying(page) => render_copying(frame, body, page, palette, plain),
        Page::Feedback(page) => {
            let sections = Layout::vertical([
                Constraint::Length(2),
                Constraint::Min(1),
                Constraint::Length(3),
            ])
            .split(body);
            paragraph(
                frame,
                sections[0],
                &format!(
                    "Your answer: {}",
                    page.answer.as_deref().unwrap_or("not requested (teaching)")
                ),
                palette,
                plain,
            );
            render_readout(frame, sections[1], Some(page.expected), palette, plain);
            paragraph(
                frame,
                sections[2],
                &format!(
                    "Expected: {}   {}\n{} | {}",
                    page.expected,
                    page.pattern,
                    if page.assisted {
                        "ASSISTED / DISCLOSED"
                    } else {
                        "FEEDBACK"
                    },
                    page.explanation
                ),
                palette,
                plain,
            );
        }
        Page::Summary(page) => {
            let sections = Layout::vertical([
                Constraint::Length(3),
                Constraint::Length(4),
                Constraint::Min(2),
                Constraint::Length(2),
            ])
            .split(body);
            frame.render_widget(
                Paragraph::new(text_mode(&page.accuracy, plain))
                    .wrap(Wrap { trim: false })
                    .block(panel(" ACCURACY ", true, palette, plain)),
                sections[0],
            );
            frame.render_widget(
                Paragraph::new(text_mode(&page.pace, plain))
                    .wrap(Wrap { trim: false })
                    .block(panel(" REQUESTED / DELIVERED PACE ", false, palette, plain)),
                sections[1],
            );
            frame.render_widget(
                Paragraph::new(text_mode(
                    &format!("Adaptation: {}\n{}", page.adaptation, page.evidence),
                    plain,
                ))
                .wrap(Wrap { trim: false })
                .block(panel(" BLOCK SAVED ", false, palette, plain)),
                sections[2],
            );
            paragraph(
                frame,
                sections[3],
                &if page.held {
                    "HOLD - saved result | Space resumes countdown".into()
                } else {
                    format!(
                        "Next block in {} s | Space holds countdown",
                        page.remaining_ms.div_ceil(1000)
                    )
                },
                palette,
                plain,
            );
        }
        Page::Audio(page) => {
            let sections = Layout::vertical([
                Constraint::Length(4),
                Constraint::Length(4),
                Constraint::Min(1),
            ])
            .split(body);
            for (i, (name, value, max, label)) in [
                (
                    " VOLUME ",
                    page.volume as u64,
                    100,
                    format!("{}%", page.volume),
                ),
                (
                    " FREQUENCY ",
                    (page.frequency - 300) as u64,
                    700,
                    format!("{} Hz", page.frequency),
                ),
            ]
            .into_iter()
            .enumerate()
            {
                let block = panel(name, page.selected == i, palette, plain);
                if plain {
                    let fill = (value * 20 / max) as usize;
                    frame.render_widget(
                        Paragraph::new(format!(
                            "[{}{}] {label}",
                            "=".repeat(fill),
                            " ".repeat(20 - fill)
                        ))
                        .block(block),
                        sections[i],
                    );
                } else {
                    frame.render_widget(
                        Gauge::default()
                            .ratio(value as f64 / max as f64)
                            .label(label)
                            .gauge_style(Style::default().fg(if i == 0 {
                                palette.amber
                            } else {
                                palette.cyan
                            }))
                            .block(block),
                        sections[i],
                    );
                }
            }
            paragraph(
                frame,
                sections[2],
                &format!(
                    "{}\nPreview is unscored. Adjustments automatically preview the latest settings.",
                    page.preview
                ),
                palette,
                plain,
            );
        }
        Page::Progress {
            data,
            focus,
            expanded,
            point,
            scroll,
        } => render_progress(
            frame, body, data, *focus, *expanded, *point, *scroll, palette, plain, wide,
        ),
    }
    let status = if tiny {
        " Resize to 80x24 | Timing estimated | Ctrl-C: quit"
    } else {
        " LOCAL / OFFLINE | Timing estimated | ?: help (idle / paused)"
    };
    frame.render_widget(
        Paragraph::new(status).style(Style::default().fg(palette.muted)),
        parts[2],
    );
    frame.render_widget(
        Paragraph::new(text_mode(&view.footer, plain))
            .wrap(Wrap { trim: false })
            .style(Style::default().fg(palette.amber)),
        parts[3],
    );
}
fn render_menu(
    frame: &mut ratatui::Frame,
    area: Rect,
    menu: &MenuPage,
    palette: Palette,
    plain: bool,
    wide: bool,
) {
    let parts = if wide {
        Layout::horizontal([Constraint::Percentage(55), Constraint::Percentage(45)]).split(area)
    } else {
        Layout::vertical([
            Constraint::Length((menu.instruments.len() as u16 + 2).min(area.height / 2)),
            Constraint::Min(1),
        ])
        .split(area)
    };
    frame.render_widget(
        Paragraph::new(text_mode(&menu.instruments.join("\n"), plain))
            .wrap(Wrap { trim: false })
            .block(panel(" STATION STATUS ", false, palette, plain)),
        parts[0],
    );
    let items = menu
        .actions
        .iter()
        .map(|action| {
            ListItem::new(text_mode(action, plain)).style(Style::default().fg(
                if action.contains("Reset") {
                    palette.fault
                } else {
                    palette.text
                },
            ))
        })
        .collect::<Vec<_>>();
    let list = List::new(items)
        .block(panel(" SELECT / ENTER ", true, palette, plain))
        .highlight_symbol("> ")
        .highlight_style(
            Style::default()
                .fg(palette.cyan)
                .add_modifier(Modifier::BOLD | Modifier::REVERSED),
        );
    frame.render_stateful_widget(
        list,
        parts[1],
        &mut ListState::default().with_selected(Some(menu.selected)),
    );
}
fn render_recognition(
    frame: &mut ratatui::Frame,
    area: Rect,
    page: &RecognitionPage,
    palette: Palette,
    plain: bool,
) {
    if area.height < 6 {
        paragraph(
            frame,
            area,
            &format!(
                "Response: {}\n{}\n{} WPM",
                page.caption,
                page.state.label(),
                page.speed
            ),
            palette,
            plain,
        );
        return;
    }
    let parts = Layout::vertical([
        Constraint::Length(2),
        Constraint::Min(1),
        Constraint::Length(3),
    ])
    .split(area);
    let state_color = if page.state == RecognitionState::Interrupted {
        palette.fault
    } else {
        palette.cyan
    };
    frame.render_widget(
        Paragraph::new(format!(
            "{} {}",
            if plain { "*" } else { "●" },
            page.state.label()
        ))
        .alignment(Alignment::Center)
        .style(Style::default().fg(state_color).bold()),
        parts[0],
    );
    render_readout(frame, parts[1], page.response, palette, plain);
    frame.render_widget(
        Paragraph::new(vec![
            Line::from(text_mode(&format!("Response: {}", page.caption), plain)),
            Line::from(format!(
                "{} WPM | {} s response window | rejected {}",
                page.speed, page.timeout, page.rejected
            )),
            Line::from(if page.assisted {
                "ASSISTED REPETITION"
            } else {
                "INDEPENDENT ATTEMPT"
            }),
        ])
        .alignment(Alignment::Center)
        .style(Style::default().fg(palette.text)),
        parts[2],
    );
}
fn render_copying(
    frame: &mut ratatui::Frame,
    area: Rect,
    page: &CopyingPage,
    palette: Palette,
    plain: bool,
) {
    if area.height < 5 {
        let rows = transcript_rows(&page.transcript, area.width as usize, plain);
        let offset = rows.len().saturating_sub(area.height as usize);
        frame.render_widget(
            Paragraph::new(rows[offset..].join("\n")).style(Style::default().fg(palette.cyan)),
            area,
        );
        return;
    }
    let parts = Layout::vertical([Constraint::Length(2), Constraint::Min(1)]).split(area);
    paragraph(
        frame,
        parts[0],
        &format!(
            "C/E {}/{} WPM | {} s | {} | catch-up gaps {} | rejected {}",
            page.character_wpm,
            page.effective_wpm,
            page.elapsed_seconds,
            page.transmission,
            page.gaps,
            page.rejected
        ),
        palette,
        plain,
    );
    let block = panel(" RECEIVED COPY / TAIL EDITING ", true, palette, plain);
    let inner = block.inner(parts[1]);
    frame.render_widget(block, parts[1]);
    // Hard-wrap every cell (including spaces), so the last caret always remains visible.
    let rows = transcript_rows(&page.transcript, inner.width as usize, plain);
    let offset = rows.len().saturating_sub(inner.height as usize);
    frame.render_widget(
        Paragraph::new(rows[offset..].join("\n")).style(Style::default().fg(palette.cyan)),
        inner,
    );
}
fn transcript_rows(text: &str, width: usize, plain: bool) -> Vec<String> {
    let width = width.max(1);
    let text = format!("{text}{}", if plain { "_" } else { "▌" });
    text.chars()
        .collect::<Vec<_>>()
        .chunks(width)
        .map(|row| row.iter().collect())
        .collect()
}
fn render_readout(
    frame: &mut ratatui::Frame,
    area: Rect,
    response: Option<char>,
    palette: Palette,
    plain: bool,
) {
    if area.height < 5 || area.width < 10 {
        frame.render_widget(
            Paragraph::new(response.map_or_else(|| "...".into(), |c| c.to_string()))
                .alignment(Alignment::Center)
                .style(Style::default().fg(palette.amber).bold()),
            area,
        );
        return;
    }
    let pixels = response.map(glyph).unwrap_or([0, 0, 0b10101, 0, 0]);
    let rows: Vec<Line> = pixels
        .iter()
        .map(|bits| {
            Line::from(
                (0..5)
                    .rev()
                    .map(|bit| {
                        if bits & (1 << bit) != 0 {
                            if plain { "##" } else { "██" }
                        } else {
                            "  "
                        }
                    })
                    .collect::<String>(),
            )
        })
        .collect();
    let centered = Rect::new(
        area.x,
        area.y + area.height.saturating_sub(5) / 2,
        area.width,
        5,
    );
    frame.render_widget(
        Paragraph::new(rows)
            .alignment(Alignment::Center)
            .style(Style::default().fg(palette.amber).bold()),
        centered,
    );
}
/// A fixed five-row alphabet covers the entire supported repertoire without a font dependency.
fn glyph(c: char) -> [u8; 5] {
    match c.to_ascii_uppercase() {
        'A' => [14, 17, 31, 17, 17],
        'B' => [30, 17, 30, 17, 30],
        'C' => [15, 16, 16, 16, 15],
        'D' => [30, 17, 17, 17, 30],
        'E' => [31, 16, 30, 16, 31],
        'F' => [31, 16, 30, 16, 16],
        'G' => [15, 16, 23, 17, 15],
        'H' => [17, 17, 31, 17, 17],
        'I' => [31, 4, 4, 4, 31],
        'J' => [7, 2, 2, 18, 12],
        'K' => [17, 18, 28, 18, 17],
        'L' => [16, 16, 16, 16, 31],
        'M' => [17, 27, 21, 17, 17],
        'N' => [17, 25, 21, 19, 17],
        'O' => [14, 17, 17, 17, 14],
        'P' => [30, 17, 30, 16, 16],
        'Q' => [14, 17, 21, 18, 13],
        'R' => [30, 17, 30, 18, 17],
        'S' => [15, 16, 14, 1, 30],
        'T' => [31, 4, 4, 4, 4],
        'U' => [17, 17, 17, 17, 14],
        'V' => [17, 17, 17, 10, 4],
        'W' => [17, 17, 21, 27, 17],
        'X' => [17, 10, 4, 10, 17],
        'Y' => [17, 10, 4, 4, 4],
        'Z' => [31, 2, 4, 8, 31],
        '0' => [14, 19, 21, 25, 14],
        '1' => [4, 12, 4, 4, 14],
        '2' => [30, 1, 14, 16, 31],
        '3' => [30, 1, 14, 1, 30],
        '4' => [18, 18, 31, 2, 2],
        '5' => [31, 16, 30, 1, 30],
        '6' => [14, 16, 30, 17, 14],
        '7' => [31, 1, 2, 4, 4],
        '8' => [14, 17, 14, 17, 14],
        '9' => [14, 17, 15, 1, 14],
        '.' => [0, 0, 0, 6, 6],
        ',' => [0, 0, 6, 6, 4],
        '?' => [14, 17, 2, 0, 2],
        '/' => [1, 2, 4, 8, 16],
        '=' => [0, 31, 0, 31, 0],
        '+' => [0, 4, 31, 4, 0],
        _ => [0; 5],
    }
}
#[allow(clippy::too_many_arguments)]
fn render_progress(
    frame: &mut ratatui::Frame,
    area: Rect,
    data: &crate::progress::ProgressData,
    focus: usize,
    expanded: bool,
    point: usize,
    scroll: u16,
    palette: Palette,
    plain: bool,
    wide: bool,
) {
    if expanded && focus < 3 {
        let parts = Layout::vertical([Constraint::Percentage(52), Constraint::Min(1)]).split(area);
        render_graph(
            frame,
            parts[0],
            &data.graphs[focus],
            true,
            Some(point),
            palette,
            plain,
        );
        let graph = &data.graphs[focus];
        let detail = graph.points.get(point).map_or_else(
            || "No eligible points. Complete comparable independent practice first.".into(),
            |p| {
                format!(
                    "Point {}/{} | {}\n{}\n{}",
                    point + 1,
                    graph.points.len(),
                    graph.context,
                    p.detail.join("\n"),
                    graph
                        .trend
                        .as_deref()
                        .unwrap_or("Sparse evidence: no trend inferred")
                )
            },
        );
        frame.render_widget(
            Paragraph::new(text_mode(&detail, plain))
                .scroll((scroll, 0))
                .wrap(Wrap { trim: false })
                .block(panel(
                    " SELECTED POINT / TESTED CONDITIONS ",
                    false,
                    palette,
                    plain,
                )),
            parts[1],
        );
        return;
    }
    if expanded {
        let detail = if focus == 3 {
            data.characters.get(point).map(|c| c.detail.join("\n"))
        } else {
            data.history.get(point).map(|lines| lines.join("\n"))
        };
        let detail = detail.unwrap_or_else(|| {
            "No history yet. Assisted and interrupted results will appear here separately.".into()
        });
        frame.render_widget(
            Paragraph::new(text_mode(&detail, plain))
                .scroll((scroll, 0))
                .wrap(Wrap { trim: false })
                .block(panel(
                    if focus == 3 {
                        " CHARACTER DETAIL "
                    } else {
                        " HISTORY DETAIL "
                    },
                    true,
                    palette,
                    plain,
                )),
            area,
        );
        return;
    }
    let parts = Layout::vertical([
        Constraint::Percentage(if wide { 55 } else { 50 }),
        Constraint::Min(1),
    ])
    .split(area);
    let cards = Layout::horizontal([Constraint::Ratio(1, 3); 3]).split(parts[0]);
    for (i, graph) in data.graphs.iter().enumerate() {
        render_graph(frame, cards[i], graph, focus == i, None, palette, plain);
    }
    let lower = Layout::horizontal([
        Constraint::Percentage(if wide { 55 } else { 65 }),
        Constraint::Min(1),
    ])
    .split(parts[1]);
    let grid = data
        .characters
        .chunks(14)
        .map(|row| {
            row.iter()
                .map(|c| format!("{}{} ", c.symbol, if c.introduced { '+' } else { '.' }))
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("\n");
    frame.render_widget(
        Paragraph::new(format!(
            "{grid}\n+ introduced / . not introduced\nEnter: character estimates and review"
        ))
        .style(Style::default().fg(palette.cyan))
        .block(panel(" CHARACTER GRID ", focus == 3, palette, plain)),
        lower[0],
    );
    let history = data
        .history
        .iter()
        .take(3)
        .filter_map(|lines| lines.first())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");
    frame.render_widget(
        Paragraph::new(text_mode(
            &format!(
                "Range: latest {} eligible blocks\n{}\nEnter: inspect all results",
                data.range.label(),
                if history.is_empty() {
                    "No practice history"
                } else {
                    &history
                }
            ),
            plain,
        ))
        .wrap(Wrap { trim: false })
        .block(panel(" HISTORY / ASSISTANCE ", focus == 4, palette, plain)),
        lower[1],
    );
}
fn render_graph(
    frame: &mut ratatui::Frame,
    area: Rect,
    graph: &crate::progress::Graph,
    selected: bool,
    point: Option<usize>,
    palette: Palette,
    plain: bool,
) {
    let block = panel(&graph.title, selected, palette, plain);
    let inner = block.inner(area);
    frame.render_widget(block, area);
    if graph.points.is_empty() {
        paragraph(
            frame,
            inner,
            "No eligible blocks yet.\nNo trend inferred.",
            palette,
            plain,
        );
        return;
    }
    let sections = Layout::vertical([Constraint::Min(1), Constraint::Length(2)]).split(inner);
    let primary: Vec<_> = graph
        .points
        .iter()
        .enumerate()
        .map(|(i, p)| (i as f64, p.primary))
        .collect();
    let secondary: Vec<_> = graph
        .points
        .iter()
        .enumerate()
        .filter_map(|(i, p)| p.secondary.map(|v| (i as f64, v)))
        .collect();
    let milestones: Vec<_> = graph
        .points
        .iter()
        .enumerate()
        .filter(|(_, p)| p.milestone)
        .map(|(i, p)| (i as f64, p.secondary.unwrap_or(p.primary)))
        .collect();
    let max = primary
        .iter()
        .chain(&secondary)
        .map(|(_, v)| *v)
        .fold(1.0, f64::max)
        * 1.1;
    let selected_point: Vec<_> = point
        .and_then(|i| primary.get(i).copied())
        .into_iter()
        .collect();
    if plain {
        let w = sections[0].width as usize;
        let h = sections[0].height as usize;
        let mut cells = vec![vec![' '; w]; h];
        for (values, symbol) in [
            (
                &primary,
                if graph.primary_label == "requested C" {
                    'C'
                } else if graph.primary_label == "median" {
                    'm'
                } else {
                    'a'
                },
            ),
            (
                &secondary,
                if graph.primary_label == "median" {
                    'p'
                } else {
                    'E'
                },
            ),
            (&milestones, '*'),
            (&selected_point, '@'),
        ] {
            for (x, y) in values {
                let col = (*x * w.saturating_sub(1) as f64
                    / (graph.points.len().saturating_sub(1).max(1)) as f64)
                    .round() as usize;
                let row = h
                    .saturating_sub(1)
                    .saturating_sub((*y / max * h.saturating_sub(1) as f64).round() as usize);
                if row < h && col < w {
                    cells[row][col] = symbol;
                }
            }
        }
        frame.render_widget(
            Paragraph::new(
                cells
                    .into_iter()
                    .map(|r| r.into_iter().collect::<String>())
                    .collect::<Vec<_>>()
                    .join("\n"),
            ),
            sections[0],
        );
    } else {
        let datasets = vec![
            Dataset::default()
                .name(graph.primary_label.as_str())
                .data(&primary)
                .marker(ratatui::symbols::Marker::Dot)
                .graph_type(GraphType::Scatter)
                .style(Style::default().fg(palette.amber)),
            Dataset::default()
                .name(graph.secondary_label.as_deref().unwrap_or(""))
                .data(&secondary)
                .marker(ratatui::symbols::Marker::Dot)
                .graph_type(GraphType::Scatter)
                .style(Style::default().fg(palette.cyan)),
            Dataset::default()
                .name("* verified")
                .data(&milestones)
                .marker(ratatui::symbols::Marker::Block)
                .style(Style::default().fg(palette.text)),
            Dataset::default()
                .name("selected")
                .data(&selected_point)
                .marker(ratatui::symbols::Marker::Block)
                .style(Style::default().fg(palette.fault)),
        ];
        frame.render_widget(
            Chart::new(datasets)
                .x_axis(
                    Axis::default()
                        .bounds([0.0, graph.points.len().saturating_sub(1).max(1) as f64]),
                )
                .y_axis(
                    Axis::default()
                        .bounds([0.0, max])
                        .labels(["0".to_string(), format!("{max:.0}")]),
                )
                .style(Style::default().fg(palette.muted).bg(palette.panel)),
            sections[0],
        );
    }
    let sparse = if graph.points.len() < 6 {
        "sparse / no trend"
    } else {
        "actual points"
    };
    let legend = if graph.primary_label == "requested C" {
        "C/E WPM | * verified"
    } else if graph.primary_label == "median" {
        "median/p90 ms | typing"
    } else {
        "attempt % | independent"
    };
    paragraph(
        frame,
        sections[1],
        &format!("n={} | {sparse}\n{legend}", graph.points.len()),
        palette,
        plain,
    );
}
struct TerminalGuard {
    terminal: Terminal<CrosstermBackend<io::Stdout>>,
}
impl TerminalGuard {
    fn enter() -> io::Result<Self> {
        let mut stdout = io::stdout();
        crossterm::execute!(
            stdout,
            crossterm::terminal::EnterAlternateScreen,
            crossterm::cursor::Hide
        )?;
        match Terminal::new(CrosstermBackend::new(stdout)) {
            Ok(terminal) => Ok(Self { terminal }),
            Err(error) => {
                let _ = crossterm::execute!(
                    io::stdout(),
                    crossterm::terminal::LeaveAlternateScreen,
                    crossterm::cursor::Show
                );
                Err(error)
            }
        }
    }
}
impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = crossterm::execute!(
            self.terminal.backend_mut(),
            crossterm::terminal::LeaveAlternateScreen,
            crossterm::cursor::Show
        );
        let _ = crossterm::terminal::disable_raw_mode();
    }
}
pub fn run<F>(
    quit: Arc<AtomicBool>,
    measurements: Option<Arc<crate::latency::Measurements>>,
    coordinator: F,
) -> Result<(), Box<dyn std::error::Error>>
where
    F: FnOnce(Sender) -> Result<(), String> + Send + 'static,
{
    let mut terminal = TerminalGuard::enter()?;
    let (queue, mut receive): (Producer<QueuedView>, Consumer<QueuedView>) = RingBuffer::new(2);
    let worker_measurements = measurements.clone();
    let worker = thread::Builder::new()
        .name("cw-coordinator".into())
        .spawn(move || {
            coordinator(Sender {
                queue,
                pending: None,
                last: None,
                measurements: worker_measurements,
            })
        })?;
    let mut current = QueuedView {
        view: View::message(
            "Starting CW DOJO",
            "Loading local history and preparing practice...",
        ),
        submitted: Instant::now(),
    };
    let mut draw_error = None;
    while !worker.is_finished() {
        let mut changed = false;
        while let Ok(view) = receive.pop() {
            if changed && let Some(metrics) = &measurements {
                metrics.coalesced_view();
            }
            current = view;
            changed = true;
        }
        if changed {
            let started = Instant::now();
            let result = terminal.terminal.draw(|frame| paint(frame, &current.view));
            if let Some(metrics) = &measurements {
                metrics.draw(current.submitted.elapsed(), started.elapsed());
            }
            if let Err(error) = result {
                draw_error = Some(error);
                quit.store(true, Ordering::Release);
                break;
            }
        }
        thread::sleep(Duration::from_millis(16));
    }
    let result = worker.join().map_err(|_| "session coordinator panicked")?;
    drop(terminal);
    if let Some(error) = draw_error {
        return Err(error.into());
    }
    result.map_err(Into::into)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocked_renderer_coalesces_bounded_work_and_retains_the_latest_view() {
        let (queue, mut receive) = RingBuffer::new(1);
        let mut sender = Sender {
            queue,
            pending: None,
            measurements: None,
            last: None,
        };
        sender.send(View::message("first", "queued"));
        for i in 0..1000 {
            sender.send(View::message(format!("latest-{i}"), "replace stale work"));
        }
        assert_eq!(receive.pop().unwrap().view.title, "first");
        sender.flush();
        assert_eq!(receive.pop().unwrap().view.title, "latest-999");
        assert!(receive.pop().is_err());
        assert!(sender.pending.is_none());
    }
    #[test]
    fn terminal_view_shows_controls_and_selection_without_audio() {
        let backend = ratatui::backend::TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut view = View::page(
            "CW DOJO",
            Page::Dashboard(MenuPage {
                instruments: vec!["Ready to continue".into()],
                actions: vec!["Adaptive practice".into(), "Progress".into()],
                selected: 0,
            }),
        );
        view.footer = "Enter: select · Esc: back".into();
        terminal.draw(|frame| paint(frame, &view)).unwrap();
        let text = format!("{:?}", terminal.backend().buffer());
        assert!(text.contains("CW DOJO"));
        assert!(text.contains("Adaptive practice"));
        assert!(text.contains("Enter: select"));
    }
}
