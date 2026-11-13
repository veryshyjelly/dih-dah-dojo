//! Reproducible worker benchmark; never opens audio or changes practice history.
use dih_dah_dojo::{scoring::live_alignment, transcript::Symbol};
use std::{hint::black_box, time::Instant};
fn main() {
    for (name, n, m) in [
        ("short-copy", 400, 400),
        ("long-check", 1300, 1300),
        ("long-check-skip", 1300, 1200),
        ("resource-boundary-extra-input", 1300, 3000),
    ] {
        let symbols = |count| {
            vec![
                Symbol {
                    character: 'E',
                    at_ns: 0
                };
                count
            ]
        };
        let target = symbols(n);
        let response = symbols(m);
        let mut samples = Vec::new();
        black_box(live_alignment(&target, &response).unwrap());
        for _ in 0..40 {
            let start = Instant::now();
            black_box(live_alignment(black_box(&target), black_box(&response)).unwrap());
            samples.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        samples.sort_by(f64::total_cmp);
        println!(
            "{name}: target={n}, response={m}, median_ms={:.3}, p99_ms={:.3}",
            samples[19], samples[39]
        );
    }
}
