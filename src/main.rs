use dih_dah_dojo::{
    audio,
    input::{Input, Key},
    timing::{Schedule, Timing},
};
use std::{
    error::Error,
    io::{self, IsTerminal, Write},
    sync::atomic::Ordering,
    thread,
    time::{Duration, Instant},
};
fn main() {
    if let Err(error) = run() {
        eprintln!("Error: {error}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn Error>> {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || args[0] == "--help" {
        println!(
            "CW timing/audio spike (not adaptive training yet)\n\n  dih_dah_dojo inspect [TEXT [CHAR_WPM EFFECTIVE_WPM]]\n  dih_dah_dojo probe [TEXT [CHAR_WPM EFFECTIVE_WPM]] [--no-input]\n\nDefaults: PARIS, 20/5 WPM. Probe plays a quiet 600 Hz tone.\nType while listening; Backspace edits your transcript. Esc/Ctrl-C stops.\ninspect does not open audio; --no-input supports noninteractive audio checks."
        );
        return Ok(());
    }
    let no_input = args.iter().any(|v| v == "--no-input");
    args.retain(|v| v != "--no-input");
    if args.len() > 4 {
        return Err("too many arguments; use --help".into());
    }
    let command = args[0].as_str();
    if !["inspect", "probe"].contains(&command) {
        return Err("expected inspect or probe".into());
    }
    let text = args.get(1).map_or("PARIS", String::as_str);
    let c = args.get(2).map_or(Ok(20.0), |v| v.parse::<f64>())?;
    let e = args.get(3).map_or(Ok(5.0), |v| v.parse::<f64>())?;
    let schedule = Schedule::compile(text, Timing::new(c, e)?, 48000)?;
    if command == "inspect" {
        println!(
            "{} characters, {} segments, {} frames at {} Hz ({:.6} s)",
            schedule.characters.len(),
            schedule.segments.len(),
            schedule.frames,
            schedule.sample_rate,
            schedule.frames as f64 / 48000.0
        );
        for ch in schedule.characters {
            println!("{}: onset={} end={} frames", ch.symbol, ch.start, ch.end);
        }
        return Ok(());
    }
    if !no_input && !io::stdin().is_terminal() {
        return Err("interactive probe needs a terminal; use --no-input for audio-only".into());
    }
    let origin = Instant::now();
    let mut output = audio::open(text, c, e, origin)?;
    println!("Native audio probe: {}", output.description);
    println!("Unverified device timing. Esc/Ctrl-C stops; type your copy below.");
    let mut input = if no_input {
        None
    } else {
        Some(Input::start(output.stop.clone(), output.fault.clone())?)
    };
    let mut reports = Vec::new();
    let mut input_delays = Vec::new();
    let mut transcript = String::new();
    let mut attempts = String::new();
    let mut last_draw = Instant::now();
    let mut last_callback = Instant::now();
    let mut rejected = 0usize;
    let mut needs_draw = true;
    output.play()?;
    let mut fault_since = None;
    while !output.done.load(Ordering::Acquire) {
        while let Ok(report) = output.reports.pop() {
            reports.push(report);
            last_callback = Instant::now();
        }
        if let Some(input) = input.as_mut() {
            while let Ok(event) = input.events.pop() {
                input_delays.push(event.received.elapsed().as_nanos() as u64);
                needs_draw = true;
                match event.key {
                    Key::Character(c) => {
                        transcript.push(c);
                        attempts.push(c);
                    }
                    Key::Backspace => {
                        transcript.pop();
                    }
                    Key::PasteRejected | Key::Unsupported => {
                        rejected += 1;
                    }
                }
            }
        }
        if needs_draw && last_draw.elapsed() >= Duration::from_millis(33) && !no_input {
            // Skip stale frames; this path never owns input capture or audio rendering.
            print!("\r\x1b[2K{transcript}  [rejected input: {rejected}]");
            io::stdout().flush()?;
            last_draw = Instant::now();
            needs_draw = false;
        }
        if output.fault.load(Ordering::Acquire) {
            output.stop.store(true, Ordering::Release);
            let since = fault_since.get_or_insert_with(Instant::now);
            if since.elapsed() > Duration::from_millis(500) {
                break;
            }
        }
        if last_callback.elapsed() > Duration::from_secs(2) {
            output.stop.store(true, Ordering::Release);
            return Err("audio callbacks stalled for two seconds; probe compromised".into());
        }
        if origin.elapsed() > Duration::from_secs(190) {
            output.stop.store(true, Ordering::Release);
            return Err("audio watchdog expired".into());
        }
        thread::sleep(Duration::from_millis(1));
    }
    // Output timestamp predicts delivery, not actual sound at the listener's ear.
    let drain = reports
        .last()
        .map_or(0, |r| r.predicted_lead_ns)
        .min(1_000_000_000);
    thread::sleep(Duration::from_nanos(drain));
    while let Ok(report) = output.reports.pop() {
        reports.push(report);
    }
    let fault = output.fault.load(Ordering::Acquire);
    let fault_kind = output.fault_kind.load(Ordering::Acquire);
    let input_error = input
        .as_ref()
        .and_then(|v| v.error.lock().ok().and_then(|s| s.clone()));
    let rate = output.sample_rate;
    drop(output); // destroy stream before restoring the terminal
    drop(input);
    println!("\nAttempts: {attempts}\nFinal:    {transcript}");
    let render: Vec<u64> = reports.iter().map(|r| r.render_ns).collect();
    let frames: Vec<u64> = reports.iter().map(|r| r.frames as u64).collect();
    let max_util = reports
        .iter()
        .map(|r| r.render_ns as f64 / (r.frames as f64 / rate as f64 * 1e9))
        .fold(0.0, f64::max);
    println!(
        "Callbacks: {}; actual frames min/max: {}/{}; render p99: {:.3} ms; max callback budget used: {:.1}%",
        reports.len(),
        frames.iter().min().unwrap_or(&0),
        frames.iter().max().unwrap_or(&0),
        quantile(&render, 0.99) as f64 / 1e6,
        100.0 * max_util
    );
    println!(
        "Input receipt-to-coordinator p99: {:.3} ms ({} events)",
        quantile(&input_delays, 0.99) as f64 / 1e6,
        input_delays.len()
    );
    println!(
        "No physical loopback measurement was performed. Adaptive scoring/rescue and durable history are not part of this spike."
    );
    if fault {
        return Err(format!("probe compromised: audio fault code {fault_kind} (1=telemetry loss, 2=xrun, 3=device change, 4=realtime denied, 5=backend); input error={input_error:?}").into());
    }
    if reports.is_empty() {
        return Err("no audio callbacks received".into());
    }
    Ok(())
}
fn quantile(values: &[u64], q: f64) -> u64 {
    if values.is_empty() {
        return 0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    sorted[((q * sorted.len() as f64).ceil() as usize)
        .saturating_sub(1)
        .min(sorted.len() - 1)]
}
