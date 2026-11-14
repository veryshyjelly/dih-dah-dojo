//! Stable delivery marker tags shared by native and browser transports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum EventKind {
    Started,
    CharacterStart,
    CharacterEnd,
    RescueStart,
    RescueEnd,
    Paused,
    Resumed,
    Finished,
    Stopped,
    Clock,
    RenderStats,
}
