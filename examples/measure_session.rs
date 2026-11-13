//! macOS development harness: real PTY typing/drawing/audio plus separate Rust CPU/disk load.
//! Uses only an isolated synthetic profile. It does not measure acoustic/physical latency.
use dih_dah_dojo::{
    commands,
    control::Controller,
    history::History,
    learner::{Context, Profile},
    recording::{Kind, Record},
    scoring::align,
    timing::SYMBOLS,
    transcript::Symbol,
};
use std::{
    collections::BTreeMap,
    error::Error,
    fs,
    io::{Read, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
type Result<T> = std::result::Result<T, Box<dyn Error>>;
struct Workers {
    stop: Arc<AtomicBool>,
    jobs: Vec<JoinHandle<std::result::Result<(), String>>>,
}
impl Drop for Workers {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        for job in self.jobs.drain(..) {
            let _ = job.join();
        }
    }
}
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        if self.0.try_wait().ok().flatten().is_none() {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}
fn main() -> Result<()> {
    if !cfg!(target_os = "macos") {
        return Err("this PTY harness uses macOS /usr/bin/script".into());
    }
    let seconds = std::env::args()
        .nth(1)
        .map_or(Ok(60), |s| s.parse::<u64>())?;
    if !(5..=3600).contains(&seconds) {
        return Err("duration must be 5..3600 seconds".into());
    }
    let binary = PathBuf::from(
        std::env::args()
            .nth(2)
            .unwrap_or_else(|| "target/release/dih_dah_dojo".into()),
    )
    .canonicalize()?;
    let directory = std::env::temp_dir().join(format!(
        "cw-session-measure-{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    ));
    fs::create_dir(&directory)?;
    let mut profile = Profile {
        entry_complete: true,
        volume: 0,
        ..Profile::default()
    };
    for c in SYMBOLS.chars() {
        profile.introduce(c, 0);
    }
    let mut seed = Record::new(
        "synthetic-load-only",
        Context::recognition(20),
        Kind::Teaching,
    );
    seed.decision = "Synthetic workload fixture; not human learning evidence".into();
    seed.apply_policy(&mut Controller::default(), &mut profile);
    History::open(directory.join("practice.redb"))?.append(&seed, &profile)?;

    let stop = Arc::new(AtomicBool::new(false));
    let scored = Arc::new(AtomicU64::new(0));
    let written = Arc::new(AtomicU64::new(0));
    let mut workers = Workers {
        stop: stop.clone(),
        jobs: Vec::new(),
    };
    let cpu_stop = stop.clone();
    let cpu_count = scored.clone();
    workers.jobs.push(thread::spawn(move || {
        let target: Vec<_> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            .repeat(8)
            .chars()
            .map(|character| Symbol {
                character,
                at_ns: 0,
            })
            .collect();
        while !cpu_stop.load(Ordering::Acquire) {
            std::hint::black_box(
                align(&target, &target[..target.len() - 1], false).map_err(|e| e.to_string())?,
            );
            cpu_count.fetch_add(1, Ordering::Relaxed);
        }
        Ok(())
    }));
    let disk_stop = stop.clone();
    let disk_count = written.clone();
    let disk_path = directory.join("load.redb");
    workers.jobs.push(thread::spawn(move || {
        let mut history = History::open(disk_path).map_err(|e| e.to_string())?;
        let mut sequence = 0u64;
        while !disk_stop.load(Ordering::Acquire) {
            sequence += 1;
            history
                .append(&sequence, &sequence)
                .map_err(|e| e.to_string())?;
            disk_count.store(sequence, Ordering::Relaxed);
            thread::sleep(Duration::from_millis(50));
        }
        Ok(())
    }));
    let report = directory.join("session-latency.txt");
    println!(
        "Isolated synthetic workload: {}\nDuration: {seconds} s; silent audio; 10 key events/s",
        directory.display()
    );
    let mut child = Process(
        Command::new("/usr/bin/script")
            .args([
                "-q",
                "/dev/null",
                "/bin/sh",
                "-c",
                "stty rows 30 cols 100; exec \"$@\"",
                "cw-session-measure",
            ])
            .arg(binary)
            .args([
                "train",
                "--mode",
                "copying",
                "--skip-readiness",
                "--session-seconds",
                "3600",
                "--data-dir",
            ])
            .arg(&directory)
            .arg("--latency-report")
            .arg(&report)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?,
    );
    let mut input = child.0.stdin.take().ok_or("missing PTY input")?;
    let mut output = child.0.stdout.take().ok_or("missing PTY output")?;
    let bytes = Arc::new(AtomicU64::new(0));
    let output_bytes = bytes.clone();
    let reader = thread::spawn(move || -> std::io::Result<()> {
        let mut buffer = [0u8; 8192];
        loop {
            let n = output.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            output_bytes.fetch_add(n as u64, Ordering::Relaxed);
        }
        Ok(())
    });
    thread::sleep(Duration::from_secs(1));
    if child.0.try_wait()?.is_some() {
        return Err("trainer exited before practice".into());
    }
    input.write_all(b"\r")?;
    let started = Instant::now();
    let mut next = started;
    let mut heartbeat = started;
    let keys = b"KMURSNAPTL?@\x7f ";
    let mut sent = 0u64;
    while started.elapsed() < Duration::from_secs(seconds) {
        if child.0.try_wait()?.is_some() {
            return Err("trainer exited during workload; inspect its report".into());
        }
        if Instant::now() >= next {
            input.write_all(&[keys[sent as usize % keys.len()]])?;
            sent += 1;
            next += Duration::from_millis(100);
        }
        if heartbeat.elapsed() >= Duration::from_secs(30) {
            println!(
                "elapsed={:.0}s sent={sent} terminal_bytes={} scoring_jobs={} durable_writes={}",
                started.elapsed().as_secs_f64(),
                bytes.load(Ordering::Relaxed),
                scored.load(Ordering::Relaxed),
                written.load(Ordering::Relaxed)
            );
            heartbeat = Instant::now();
        }
        thread::sleep(Duration::from_millis(1));
    }
    input.write_all(&[3])?;
    let shutdown = Instant::now();
    let status = loop {
        if let Some(status) = child.0.try_wait()? {
            break status;
        }
        if shutdown.elapsed() > Duration::from_secs(15) {
            return Err("trainer shutdown exceeded 15 seconds".into());
        }
        thread::sleep(Duration::from_millis(10));
    };
    drop(input);
    reader.join().map_err(|_| "PTY reader panicked")??;
    stop.store(true, Ordering::Release);
    for job in workers.jobs.drain(..) {
        job.join()
            .map_err(|_| "load worker panicked")?
            .map_err(|e| format!("load worker failed: {e}"))?;
    }
    if !status.success() {
        return Err("PTY wrapper failed".into());
    }
    let text = fs::read_to_string(&report)?;
    let values: BTreeMap<_, _> = text
        .lines()
        .filter_map(|line| line.split_once('='))
        .collect();
    let number = |key: &str| -> Result<u64> {
        Ok(values
            .get(key)
            .ok_or_else(|| format!("missing {key}"))?
            .parse()?)
    };
    if values.get("status") != Some(&"completed")
        || values.get("fault") != Some(&"false")
        || number("callback_deadline_misses")? != 0
        || number("input_sequence_gaps")? != 0
    {
        return Err(format!("workload failed; preserve {}\n{text}", directory.display()).into());
    }
    if number("input_receipt_to_coordinator_count")? < sent + 2 {
        return Err("not all scripted input events were handled".into());
    }
    if number("input_receipt_to_coordinator_p99_upper_ns")? > 5_000_000
        || number("view_submission_to_draw_completion_p99_upper_ns")? > 50_000_000
    {
        return Err(format!("software latency target exceeded\n{text}").into());
    }
    let rate = number("sample_rate")?;
    if rate == 0
        || number("audio_frames")? / rate < seconds.saturating_sub(5)
        || number("audio_render_count")? == 0
    {
        return Err("native callback coverage did not span the workload".into());
    }
    let loaded = commands::load(directory.clone())?;
    let copying = loaded
        .records
        .iter()
        .filter(|r| r.kind == Kind::Copying)
        .count();
    let complete = loaded
        .records
        .iter()
        .filter(|r| r.kind == Kind::Copying && r.completed && r.compromised.is_none())
        .count();
    if copying == 0 || (complete as u64) < seconds / 100 || number("compromised_blocks")? > 1 {
        return Err("practice did not continue through the scripted workload".into());
    }
    if loaded
        .records
        .iter()
        .filter(|r| r.kind == Kind::Copying)
        .any(|r| {
            !r.selection_reason
                .contains("Learner-selected mode: Copying.")
        })
    {
        return Err("mode override was not identified in saved results".into());
    }
    if !loaded.records.iter().flat_map(|r| &r.inputs).any(|event| {
        matches!(event.edit, dih_dah_dojo::transcript::Edit::Unsupported('@')) && !event.accepted
    }) {
        return Err("scripted unsupported input was not preserved as rejected".into());
    }
    println!(
        "PASS: {} scripted keys, {} terminal bytes, {} replay-verified records\n{text}Report: {}",
        sent,
        bytes.load(Ordering::Relaxed),
        loaded.records.len(),
        report.display()
    );
    Ok(())
}
