//! Sample-clock Morse scheduling. All allocation occurs before playback.
use std::fmt;

pub const SYMBOLS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,?/=+";
const PATTERNS: [&str; 42] = [
    ".-", "-...", "-.-.", "-..", ".", "..-.", "--.", "....", "..", ".---", "-.-", ".-..", "--",
    "-.", "---", ".--.", "--.-", ".-.", "...", "-", "..-", "...-", ".--", "-..-", "-.--", "--..",
    "-----", ".----", "..---", "...--", "....-", ".....", "-....", "--...", "---..", "----.",
    ".-.-.-", "--..--", "..--..", "-..-.", "-...-", ".-.-.",
];

#[derive(Debug, Clone, PartialEq)]
pub struct TimingError(pub String);
impl fmt::Display for TimingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for TimingError {}

pub fn pattern(symbol: char) -> Option<&'static str> {
    SYMBOLS
        .chars()
        .position(|c| c == symbol.to_ascii_uppercase())
        .map(|i| PATTERNS[i])
}

#[derive(Debug, Clone, Copy)]
pub struct Timing {
    pub dot: f64,
    pub spacing: f64,
}
impl Timing {
    pub fn new(character_wpm: f64, effective_wpm: f64) -> Result<Self, TimingError> {
        if !character_wpm.is_finite()
            || !effective_wpm.is_finite()
            || effective_wpm <= 0.0
            || effective_wpm > character_wpm
        {
            return Err(TimingError(
                "speeds must be finite with 0 < effective <= character WPM".into(),
            ));
        }
        let dot = 1.2 / character_wpm;
        let spacing = (60.0 / effective_wpm - 31.0 * dot) / 19.0;
        Ok(Self { dot, spacing })
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Segment {
    pub start: u64,
    pub end: u64,
    pub tone: bool,
}
#[derive(Debug, Clone, Copy)]
pub struct Character {
    pub symbol: char,
    pub start: u64,
    pub end: u64,
}
#[derive(Debug)]
pub struct Schedule {
    pub sample_rate: u32,
    pub segments: Vec<Segment>,
    pub characters: Vec<Character>,
    pub frames: u64,
}

impl Schedule {
    /// Compile the whole block before starting output. A final word gap is included.
    pub fn compile(text: &str, timing: Timing, sample_rate: u32) -> Result<Self, TimingError> {
        if sample_rate == 0
            || !timing.dot.is_finite()
            || !timing.spacing.is_finite()
            || timing.dot <= 0.0
            || timing.spacing < timing.dot - 1e-12
        {
            return Err(TimingError("invalid sample rate or timing".into()));
        }
        let symbols: Vec<char> = text
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .map(|c| c.to_ascii_uppercase())
            .collect();
        if symbols.is_empty() || symbols.len() > 4096 {
            return Err(TimingError(
                "supply 1–4096 supported characters/spaces".into(),
            ));
        }
        if let Some(c) = symbols.iter().find(|&&c| c != ' ' && pattern(c).is_none()) {
            return Err(TimingError(format!("unsupported symbol: {c}")));
        }
        let mut out = Self {
            sample_rate,
            segments: Vec::new(),
            characters: Vec::new(),
            frames: 0,
        };
        let mut ideal = 0.0;
        let mut add = |out: &mut Self, seconds: f64, tone: bool| -> Result<(), TimingError> {
            ideal += seconds * f64::from(sample_rate);
            if !ideal.is_finite() || ideal > f64::from(sample_rate) * 180.0 {
                return Err(TimingError(
                    "prototype blocks must fit within 180 seconds".into(),
                ));
            }
            let end = ideal.round() as u64;
            if end <= out.frames {
                return Err(TimingError("element shorter than one sample".into()));
            }
            out.segments.push(Segment {
                start: out.frames,
                end,
                tone,
            });
            out.frames = end;
            Ok(())
        };
        for (index, &symbol) in symbols.iter().enumerate() {
            if symbol == ' ' {
                continue;
            }
            let start = out.frames;
            for (i, element) in pattern(symbol).expect("validated").chars().enumerate() {
                if i > 0 {
                    add(&mut out, timing.dot, false)?;
                }
                add(
                    &mut out,
                    timing.dot * if element == '-' { 3.0 } else { 1.0 },
                    true,
                )?;
            }
            out.characters.push(Character {
                symbol,
                start,
                end: out.frames,
            });
            let word_end = symbols.get(index + 1).is_none_or(|&c| c == ' ');
            add(
                &mut out,
                timing.spacing * if word_end { 7.0 } else { 3.0 },
                false,
            )?;
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repertoire_is_exact_and_patterns_unique() {
        assert_eq!(SYMBOLS.len(), 42);
        let patterns: std::collections::HashSet<_> =
            SYMBOLS.chars().map(|c| pattern(c).unwrap()).collect();
        assert_eq!(patterns.len(), 42);
        assert_eq!(pattern('='), Some("-...-"));
        assert_eq!(pattern('+'), Some(".-.-."));
        assert_eq!(pattern('a'), pattern('A'));
    }
    #[test]
    fn paris_fixtures_and_cumulative_rounding() {
        for rate in [44100, 48000, 96000] {
            for c in 12..=35 {
                for e in 3..=c {
                    let t = Timing::new(c as f64, e as f64).unwrap();
                    let s = Schedule::compile("PARIS", t, rate).unwrap();
                    let expected = 60.0 / e as f64 * rate as f64;
                    assert!((s.frames as f64 - expected).abs() <= 0.500001);
                    assert!(s.segments.windows(2).all(|p| p[0].end == p[1].start));
                    assert_eq!(s.characters.len(), 5);
                }
            }
        }
    }
    #[test]
    fn spacing_replaces_character_gap() {
        let s = Schedule::compile("E E", Timing::new(20.0, 20.0).unwrap(), 48000).unwrap();
        assert_eq!(s.segments.len(), 4);
        assert_eq!(s.characters[1].start, 23040); // dot + seven-dot gap
        assert_eq!(s.frames, 46080);
    }
    #[test]
    fn invalid_inputs_do_not_reach_audio() {
        for (c, e) in [
            (0.0, 0.0),
            (20.0, 21.0),
            (f64::NAN, 5.0),
            (20.0, f64::INFINITY),
        ] {
            assert!(Timing::new(c, e).is_err());
        }
        let t = Timing::new(20.0, 5.0).unwrap();
        for text in ["", "  ", "É", "ABC@"] {
            assert!(Schedule::compile(text, t, 48000).is_err());
        }
        assert!(Schedule::compile("E", t, 0).is_err());
    }
}
