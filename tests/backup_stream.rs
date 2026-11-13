//! Archive verification must not allocate the complete archive or individual payloads.
use dih_dah_dojo::history::History;
use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
};
thread_local! {
    static ACTIVE: Cell<bool> = const { Cell::new(false) };
    static LARGEST: Cell<usize> = const { Cell::new(0) };
}
struct Meter;
unsafe impl GlobalAlloc for Meter {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if ACTIVE.with(Cell::get) {
            LARGEST.with(|value| value.set(value.get().max(layout.size())));
        }
        unsafe { System.alloc(layout) }
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) }
    }
    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        if ACTIVE.with(Cell::get) {
            LARGEST.with(|value| value.set(value.get().max(size)));
        }
        unsafe { System.realloc(pointer, layout, size) }
    }
}
#[global_allocator]
static ALLOCATOR: Meter = Meter;
#[test]
fn multi_megabyte_backup_verifies_with_small_fixed_heap_allocations() {
    let directory = std::env::temp_dir().join(format!("cw-streamed-backup-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let backup = directory.join("large.cwbackup");
    {
        let mut history = History::open(directory.join("practice.redb")).unwrap();
        let payload = vec![128u8; 3 * 1024 * 1024];
        history.append(&payload, &payload).unwrap();
        history.append(&payload, &payload).unwrap();
        history.export(&backup).unwrap();
    }
    assert!(std::fs::metadata(&backup).unwrap().len() > 9 * 1024 * 1024);
    ACTIVE.with(|active| active.set(true));
    let result = History::verify_export(&backup);
    ACTIVE.with(|active| active.set(false));
    assert_eq!(result.unwrap(), 2);
    assert!(
        LARGEST.with(Cell::get) <= 64 * 1024,
        "verification allocated an archive/payload-sized buffer"
    );
    std::fs::remove_dir_all(directory).unwrap();
}
