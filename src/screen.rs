//! UI stays on the main thread; the coordinator never waits for terminal drawing.
use ratatui::{
    Terminal,
    backend::CrosstermBackend,
    layout::{Constraint, Layout},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap},
};
use rtrb::{Consumer, Producer, PushError, RingBuffer};
use std::{
    io,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct View {
    pub title: String,
    pub subtitle: String,
    pub lines: Vec<String>,
    pub options: Vec<String>,
    pub selected: usize,
    pub footer: String,
    pub scroll: u16,
}
impl View {
    pub fn message(title: impl Into<String>, body: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            subtitle: "CW DOJO · local adaptive practice".into(),
            lines: body.into().lines().map(str::to_string).collect(),
            options: Vec::new(),
            selected: 0,
            footer: "Esc: return · Ctrl-C: quit".into(),
            scroll: 0,
        }
    }
}
pub struct Sender {
    queue: Producer<View>,
    pending: Option<View>,
    last: Option<View>,
}
impl Sender {
    pub fn send(&mut self, view: View) {
        if self.last.as_ref() == Some(&view) {
            return;
        }
        self.last = Some(view.clone());
        match self.queue.push(view) {
            Ok(()) => self.pending = None,
            Err(PushError::Full(view)) => self.pending = Some(view),
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
pub fn paint(frame: &mut ratatui::Frame, view: &View) {
    let area = frame.area();
    let layout = Layout::vertical([
        Constraint::Length(3),
        Constraint::Min(3),
        Constraint::Length(3),
    ])
    .split(area);
    let heading = Paragraph::new(view.subtitle.as_str())
        .style(Style::default().fg(Color::Cyan))
        .block(
            Block::default()
                .title(view.title.as_str())
                .borders(Borders::ALL),
        );
    frame.render_widget(heading, layout[0]);
    if view.options.is_empty() {
        frame.render_widget(
            Paragraph::new(view.lines.join("\n"))
                .scroll((view.scroll, 0))
                .wrap(Wrap { trim: false })
                .block(Block::default().borders(Borders::ALL)),
            layout[1],
        );
    } else {
        let content = Layout::vertical([
            Constraint::Length(view.lines.len().min(5) as u16 + 1),
            Constraint::Min(1),
        ])
        .split(layout[1]);
        frame.render_widget(
            Paragraph::new(view.lines.join("\n")).wrap(Wrap { trim: false }),
            content[0],
        );
        let items: Vec<_> = view
            .options
            .iter()
            .map(|text| ListItem::new(text.as_str()))
            .collect();
        let list = List::new(items).highlight_symbol("› ").highlight_style(
            Style::default()
                .fg(Color::Black)
                .bg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        );
        let mut state = ListState::default().with_selected(Some(view.selected));
        frame.render_stateful_widget(list, content[1], &mut state);
    }
    frame.render_widget(
        Paragraph::new(view.footer.as_str())
            .wrap(Wrap { trim: false })
            .style(Style::default().fg(Color::Yellow))
            .block(Block::default().borders(Borders::ALL)),
        layout[2],
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
pub fn run<F>(quit: Arc<AtomicBool>, coordinator: F) -> Result<(), Box<dyn std::error::Error>>
where
    F: FnOnce(Sender) -> Result<(), String> + Send + 'static,
{
    let mut terminal = TerminalGuard::enter()?;
    let (queue, mut receive): (Producer<View>, Consumer<View>) = RingBuffer::new(2);
    let worker = thread::Builder::new()
        .name("cw-coordinator".into())
        .spawn(move || {
            coordinator(Sender {
                queue,
                pending: None,
                last: None,
            })
        })?;
    let mut current = View::message(
        "Starting CW DOJO",
        "Loading local history and preparing practice...",
    );
    let mut draw_error = None;
    while !worker.is_finished() {
        let mut changed = false;
        while let Ok(view) = receive.pop() {
            current = view;
            changed = true;
        }
        if changed && let Err(error) = terminal.terminal.draw(|frame| paint(frame, &current)) {
            draw_error = Some(error);
            quit.store(true, Ordering::Release);
            break;
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
    fn terminal_view_shows_controls_and_selection_without_audio() {
        let backend = ratatui::backend::TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut view = View::message("CW DOJO", "Ready to continue");
        view.options = vec!["Adaptive practice".into(), "Progress".into()];
        view.footer = "Enter: select · Esc: back".into();
        terminal.draw(|frame| paint(frame, &view)).unwrap();
        let text = format!("{:?}", terminal.backend().buffer());
        assert!(text.contains("CW DOJO"));
        assert!(text.contains("Adaptive practice"));
        assert!(text.contains("Enter: select"));
    }
}
