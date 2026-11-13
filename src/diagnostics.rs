//! Device diagnostics. Results describe the observed route, not acoustic certification.
use crate::{
    clock::ClockMap,
    history::History,
    live_audio::LiveOutput,
    scoring::align,
    timing::{Schedule, Timing},
    transcript::Symbol,
    transport::{Controls, EventKind, Prepared},
};
use std::{
    error::Error,
    fs,
    io::Write,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

pub fn run(args: &[String]) -> Result<(), Box<dyn Error>> {
    let mut seconds = 10u64;
    let mut silent = false;
    let mut stress = false;
    let mut report = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--seconds" => {
                i += 1;
                seconds = args.get(i).ok_or("missing --seconds value")?.parse()?;
            }
            "--silent" => silent = true,
            "--stress" => stress = true,
            "--report" => {
                i += 1;
                report = Some(PathBuf::from(args.get(i).ok_or("missing --report path")?));
            }
            _ => {
                return Err(
                    "diagnose accepts --seconds 1..3600, --silent, --stress, --report PATH".into(),
                );
            }
        }
        i += 1;
    }
    if !(1..=3600).contains(&seconds) {
        return Err("diagnostic duration must be 1..3600 seconds".into());
    }
    let mut report_file = report
        .as_ref()
        .map(|path| {
            fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(path)
        })
        .transpose()?;
    let origin = Instant::now();
    let controls = Arc::new(Controls::new());
    controls.volume(if silent { 0 } else { 50 });
    let mut audio = LiveOutput::open(controls.clone(), origin)?;
    let mut clocks = ClockMap::default();
    let mut render = Vec::new();
    let mut sizes = Vec::new();
    let mut max_ratio = 0f64;
    let mut misses = 0u64;
    let mut count = 0u64;
    let mut block = 0u64;
    let mut epoch_error: Option<String> = None;
    let stopped = Arc::new(AtomicBool::new(false));
    let mut workers = Vec::new();
    let mut stress_directory = None;
    if stress {
        let directory = std::env::temp_dir().join(format!(
            "cw-diagnostic-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        fs::create_dir(&directory)?;
        let path = directory.join("stress.redb");
        stress_directory = Some(directory);

        let stop = stopped.clone();
        workers.push(thread::spawn(move || -> Result<(), String> {
            let source = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(8);
            let target: Vec<_> = source
                .chars()
                .map(|character| Symbol {
                    character,
                    at_ns: 0,
                })
                .collect();
            let response = target[..target.len() - 1].to_vec();
            while !stop.load(Ordering::Acquire) {
                align(&target, &response, false).map_err(|e| e.to_string())?;
            }
            Ok(())
        }));
        let stop = stopped.clone();
        workers.push(thread::spawn(move || -> Result<(), String> {
            let mut history = History::open(path).map_err(|e| e.to_string())?;
            let mut n = 0u64;
            while !stop.load(Ordering::Acquire) {
                n += 1;
                history.append(&n, &n).map_err(|e| e.to_string())?;
                thread::sleep(Duration::from_millis(50));
            }
            Ok(())
        }));
    }
    println!(
        "Diagnostic: {}; {} seconds; silent={silent}; CPU/storage stress={stress}",
        audio.description, seconds
    );
    let measurement_start = Instant::now();
    let mut last_callback = Instant::now();
    let mut last_progress = Instant::now();
    let result = (|| -> Result<(), Box<dyn Error>> {
        while measurement_start.elapsed() < Duration::from_secs(seconds)
            && !controls.fault.load(Ordering::Acquire)
        {
            while let Ok(event) = audio.events.pop() {
                match event.kind {
                    EventKind::Clock => {
                        last_callback = Instant::now();
                        if let Err(error) = clocks.observe(event) {
                            epoch_error = Some(error.to_string());
                            controls.fault.store(true, Ordering::Release);
                        }
                    }
                    EventKind::RenderStats => {
                        count += 1;
                        render.push(event.value);
                        sizes.push(event.character);
                        let ratio = event.value as f64
                            / (event.character as f64 / audio.sample_rate as f64 * 1e9);
                        max_ratio = max_ratio.max(ratio);
                        if ratio >= 1.0 {
                            misses += 1;
                        }
                    }
                    _ => {}
                }
            }
            audio.collect_retired();
            if !controls.busy.load(Ordering::Acquire) {
                block += 1;
                let schedule =
                    Schedule::compile("PARIS PARIS", Timing::new(20.0, 20.0)?, audio.sample_rate)?;
                audio.submit(Prepared::new(block, schedule, 600.0, false)?)?;
            }
            if last_callback.elapsed() > Duration::from_secs(2) {
                return Err("audio callbacks stopped for two seconds".into());
            }
            if last_progress.elapsed() > Duration::from_secs(30) {
                println!(
                    "elapsed {} s; {count} callbacks; max render budget {:.2}%",
                    measurement_start.elapsed().as_secs(),
                    100.0 * max_ratio
                );
                last_progress = Instant::now();
            }
            thread::sleep(Duration::from_millis(1));
        }
        Ok(())
    })();
    controls.stop.store(true, Ordering::Release);
    stopped.store(true, Ordering::Release);
    for worker in workers {
        match worker.join() {
            Ok(Ok(())) => {}
            Ok(Err(error)) => epoch_error = Some(error),
            Err(_) => epoch_error = Some("stress worker panicked".into()),
        }
    }
    let fault = controls.fault.load(Ordering::Acquire);
    let fault_kind = audio.fault_kind.load(Ordering::Acquire);
    drop(audio);
    if let Some(path) = stress_directory {
        fs::remove_dir_all(path)?;
    }
    render.sort_unstable();
    sizes.sort_unstable();
    let p99 = render
        .get(((render.len() as f64 * 0.99).ceil() as usize).saturating_sub(1))
        .copied()
        .unwrap_or(0);
    let summary = format!(
        "elapsed_seconds={}\ncallbacks={count}\nactual_buffer_min={}\nactual_buffer_max={}\nrender_p99_ms={:.6}\nmax_render_budget_percent={:.3}\ncallback_deadline_misses={misses}\nclock_mapping_residual_p99_ms={:.6}\nclock_calibrated={}\nfault={fault}\nbackend_fault_code={fault_kind}\nclock_or_worker_error={epoch_error:?}\nphysical_loopback_performed=false\n",
        measurement_start.elapsed().as_secs_f64(),
        sizes.first().copied().unwrap_or(0),
        sizes.last().copied().unwrap_or(0),
        p99 as f64 / 1e6,
        max_ratio * 100.0,
        clocks.residual_p99_ns as f64 / 1e6,
        clocks.calibrated()
    );
    println!("{summary}");
    if let Some(file) = report_file.as_mut() {
        file.write_all(summary.as_bytes())?;
        file.sync_all()?;
    }
    result?;
    if fault || misses > 0 || epoch_error.is_some() || count == 0 {
        return Err("diagnostic did not meet observed callback/fault criteria; see report".into());
    }
    Ok(())
}
