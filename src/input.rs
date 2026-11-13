//! A single raw-mode reader; rendering never participates in input capture.
use crossterm::{
    event::{
        self, DisableBracketedPaste, EnableBracketedPaste, Event, KeyCode, KeyEventKind,
        KeyModifiers,
    },
    execute, terminal,
};
use rtrb::{Consumer, RingBuffer};
use std::{
    io,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
#[derive(Debug, Clone, Copy)]
pub enum Key {
    Character(char),
    Backspace,
    PasteRejected,
    Unsupported(char),
    Enter,
    Unknown,
    Up,
    Down,
    Left,
    Right,
    Pause,
    Replay,
    Progress,
    Escape,
    Quit,
}
#[derive(Debug, Clone, Copy)]
pub struct InputEvent {
    pub key: Key,
    pub received: Instant,
    pub sequence: u64,
}
pub struct Input {
    pub events: Consumer<InputEvent>,
    pub error: Arc<Mutex<Option<String>>>,
    finished: Arc<AtomicBool>,
    reader: Option<JoinHandle<()>>,
}
impl Input {
    pub fn start(stop: Arc<AtomicBool>, fault: Arc<AtomicBool>) -> io::Result<Self> {
        terminal::enable_raw_mode()?;
        if let Err(error) = execute!(io::stdout(), EnableBracketedPaste) {
            let _ = terminal::disable_raw_mode();
            return Err(error);
        }
        let (mut sender, events) = RingBuffer::new(4096);
        let finished = Arc::new(AtomicBool::new(false));
        let reader_finished = finished.clone();
        let error = Arc::new(Mutex::new(None));
        let reader_error = error.clone();
        let reader = thread::Builder::new()
            .name("cw-input".into())
            .spawn(move || {
                let mut sequence = 0;
                while !reader_finished.load(Ordering::Acquire) {
                    let result = (|| -> io::Result<()> {
                        if !event::poll(Duration::from_millis(20))? {
                            return Ok(());
                        }
                        let event = event::read()?;
                        let received = Instant::now();
                        let key = match event {
                            Event::Key(k) if k.kind != KeyEventKind::Release => match k.code {
                                KeyCode::Esc => {
                                    stop.store(true, Ordering::Release);
                                    Some(Key::Escape)
                                }
                                KeyCode::Char('c')
                                    if k.modifiers.contains(KeyModifiers::CONTROL) =>
                                {
                                    stop.store(true, Ordering::Release);
                                    Some(Key::Quit)
                                }
                                KeyCode::Backspace => Some(Key::Backspace),
                                KeyCode::Enter => Some(Key::Enter),
                                KeyCode::Tab => Some(Key::Unknown),
                                KeyCode::Up => Some(Key::Up),
                                KeyCode::Down => Some(Key::Down),
                                KeyCode::Left => Some(Key::Left),
                                KeyCode::Right => Some(Key::Right),
                                KeyCode::F(5) => Some(Key::Pause),
                                KeyCode::F(6) => Some(Key::Replay),
                                KeyCode::F(1) => Some(Key::Progress),
                                KeyCode::Char(c)
                                    if (crate::timing::pattern(c).is_some() || c == ' ')
                                        && !k.modifiers.intersects(
                                            KeyModifiers::CONTROL | KeyModifiers::ALT,
                                        ) =>
                                {
                                    Some(Key::Character(c))
                                }
                                KeyCode::Char(c) => Some(Key::Unsupported(c)),
                                _ => None,
                            },
                            Event::Paste(_) => Some(Key::PasteRejected),
                            _ => None,
                        };
                        if let Some(key) = key {
                            sequence += 1;
                            if sender
                                .push(InputEvent {
                                    key,
                                    received,
                                    sequence,
                                })
                                .is_err()
                            {
                                return Err(io::Error::other("input event limit/queue exceeded"));
                            }
                        }
                        Ok(())
                    })();
                    if let Err(error) = result {
                        if let Ok(mut slot) = reader_error.lock() {
                            *slot = Some(error.to_string());
                        }
                        fault.store(true, Ordering::Release);
                        stop.store(true, Ordering::Release);
                        break;
                    }
                }
            });
        match reader {
            Ok(reader) => Ok(Self {
                events,
                error,
                finished,
                reader: Some(reader),
            }),
            Err(error) => {
                let _ = execute!(io::stdout(), DisableBracketedPaste);
                let _ = terminal::disable_raw_mode();
                Err(error)
            }
        }
    }
}
impl Drop for Input {
    fn drop(&mut self) {
        self.finished.store(true, Ordering::Release);
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        let _ = execute!(io::stdout(), DisableBracketedPaste);
        let _ = terminal::disable_raw_mode();
    }
}
