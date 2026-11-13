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

#[test]
fn transport_handoff_and_full_retirement_queue_do_not_allocate_or_deallocate() {
    use dih_dah_dojo::transport::{Controls, Kernel, Prepared};
    use std::sync::Arc;
    let (mut ready, receive) = rtrb::RingBuffer::new(2);
    let (retire, _retired) = rtrb::RingBuffer::new(1);
    let (events, _events) = rtrb::RingBuffer::new(8192);
    let controls = Arc::new(Controls::new());
    for id in [1, 2] {
        ready
            .push(
                Prepared::new(
                    id,
                    Schedule::compile("E", Timing::new(20.0, 20.0).unwrap(), 1000).unwrap(),
                    100.0,
                    false,
                )
                .unwrap(),
            )
            .ok()
            .unwrap();
    }
    let mut kernel = Kernel::new(receive, retire, events, controls.clone());
    CALLS.with(|c| c.set(0));
    ACTIVE.with(|a| a.set(true));
    for frame in 0..2048 {
        if frame % 128 == 0 {
            kernel.begin_callback();
        }
        std::hint::black_box(kernel.sample());
    }
    ACTIVE.with(|a| a.set(false));
    assert_eq!(CALLS.with(Cell::get), 0);
    assert!(controls.fault.load(std::sync::atomic::Ordering::Acquire));
}
