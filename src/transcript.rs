//! Timestamp-preserving input history, independent of audio and terminal APIs.
use crate::timing::pattern;
use std::fmt;

pub const MAX_INPUT_EVENTS: usize = 16_384;

/// Nanoseconds are relative to the same monotonic session origin as audio onsets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Symbol {
    pub character: char,
    pub at_ns: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Edit {
    Type(char),
    Backspace,
    PasteRejected,
    Unsupported(char),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct InputRecord {
    pub edit: Edit,
    pub at_ns: u64,
    pub accepted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum InputError {
    TimeWentBackwards,
    EventLimit,
}
impl fmt::Display for InputError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TimeWentBackwards => "input timestamps must not go backwards",
            Self::EventLimit => "input event limit reached; block must be marked compromised",
        })
    }
}
impl std::error::Error for InputError {}

#[derive(Debug, Default)]
pub struct Transcript {
    events: Vec<InputRecord>,
    attempts: Vec<Symbol>,
    final_text: Vec<Symbol>,
}
impl Transcript {
    /// Invalid printable input and paste are recorded but never enter either text stream.
    pub fn record(&mut self, edit: Edit, at_ns: u64) -> Result<bool, InputError> {
        if self.events.len() >= MAX_INPUT_EVENTS {
            return Err(InputError::EventLimit);
        }
        if self
            .events
            .last()
            .is_some_and(|previous| previous.at_ns > at_ns)
        {
            return Err(InputError::TimeWentBackwards);
        }
        let accepted = match edit {
            Edit::Type(c) => {
                let character = if c.is_ascii_whitespace() {
                    ' '
                } else {
                    c.to_ascii_uppercase()
                };
                if character == ' ' || pattern(character).is_some() {
                    let symbol = Symbol { character, at_ns };
                    self.attempts.push(symbol);
                    self.final_text.push(symbol);
                    true
                } else {
                    false
                }
            }
            Edit::Backspace => {
                self.final_text.pop();
                true
            }
            Edit::PasteRejected | Edit::Unsupported(_) => false,
        };
        self.events.push(InputRecord {
            edit,
            at_ns,
            accepted,
        });
        Ok(accepted)
    }
    pub fn events(&self) -> &[InputRecord] {
        &self.events
    }
    pub fn attempts(&self) -> &[Symbol] {
        &self.attempts
    }
    pub fn final_text(&self) -> &[Symbol] {
        &self.final_text
    }
    pub fn final_string(&self) -> String {
        self.final_text.iter().map(|s| s.character).collect()
    }
    pub fn attempt_string(&self) -> String {
        self.attempts.iter().map(|s| s.character).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn corrections_keep_original_attempts_and_surviving_timestamps() {
        let mut t = Transcript::default();
        for (edit, at) in [
            (Edit::Type('a'), 1),
            (Edit::Type('x'), 2),
            (Edit::Backspace, 3),
            (Edit::Type('b'), 4),
        ] {
            assert!(t.record(edit, at).unwrap());
        }
        assert_eq!(t.attempt_string(), "AXB");
        assert_eq!(t.final_string(), "AB");
        assert_eq!(t.final_text()[1].at_ns, 4);
        assert_eq!(t.attempts()[1].at_ns, 2);
        assert_eq!(t.events()[0].edit, Edit::Type('a'));
    }
    #[test]
    fn empty_backspace_rejections_and_whitespace_remain_auditable() {
        let mut t = Transcript::default();
        assert!(t.record(Edit::Backspace, 0).unwrap());
        assert!(!t.record(Edit::Type('@'), 1).unwrap());
        assert!(!t.record(Edit::PasteRejected, 2).unwrap());
        assert!(t.record(Edit::Type('\t'), 3).unwrap());
        assert_eq!(t.attempt_string(), " ");
        assert_eq!(t.events().len(), 4);
        assert!(!t.events()[1].accepted);
    }
    #[test]
    fn invalid_event_does_not_partially_mutate_state() {
        let mut t = Transcript::default();
        t.record(Edit::Type('A'), 5).unwrap();
        assert_eq!(
            t.record(Edit::Backspace, 4),
            Err(InputError::TimeWentBackwards)
        );
        assert_eq!(t.final_string(), "A");
        assert_eq!(t.events().len(), 1);
    }
    #[test]
    fn event_limit_is_explicit_and_includes_rejected_events() {
        let mut t = Transcript::default();
        for _ in 0..MAX_INPUT_EVENTS {
            t.record(Edit::PasteRejected, 0).unwrap();
        }
        assert_eq!(t.record(Edit::Type('A'), 0), Err(InputError::EventLimit));
        assert!(t.attempts().is_empty());
    }
}
