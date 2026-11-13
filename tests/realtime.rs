//! Detect allocation/deallocation in the application's render path without a device.
use dih_dah_dojo::{
    synth::Synth,
    timing::{Schedule, Timing},
};
use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
};
struct Counted;
thread_local! {static ACTIVE:Cell<bool>=const {Cell::new(false)};static CALLS:Cell<usize>=const {Cell::new(0)};}
unsafe impl GlobalAlloc for Counted {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        ACTIVE.with(|v| {
            if v.get() {
                CALLS.with(|c| c.set(c.get() + 1))
            }
        });
        unsafe { System.alloc(l) }
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        ACTIVE.with(|v| {
            if v.get() {
                CALLS.with(|c| c.set(c.get() + 1))
            }
        });
        unsafe { System.dealloc(p, l) }
    }
}
#[global_allocator]
static ALLOC: Counted = Counted;
#[test]
fn prepared_sample_loop_never_allocates_or_deallocates() {
    let mut synth = Synth::new(
        Schedule::compile("PARIS 123", Timing::new(20.0, 10.0).unwrap(), 48000).unwrap(),
        600.0,
    )
    .unwrap();
    CALLS.with(|c| c.set(0));
    ACTIVE.with(|a| a.set(true));
    while !synth.done() {
        std::hint::black_box(synth.sample());
    }
    synth.stop();
    std::hint::black_box(synth.sample());
    ACTIVE.with(|a| a.set(false));
    assert_eq!(CALLS.with(Cell::get), 0);
}
