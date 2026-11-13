//! Heavy alignment/final scoring runs on this worker, never on input/audio/UI lanes.
use crate::{
    recording::Record,
    scoring::{self, LiveAlignment},
    transcript::Symbol,
};
use std::{
    sync::mpsc::{self, Receiver, SyncSender, TrySendError},
    thread::{self, JoinHandle},
};
#[derive(Debug)]
pub struct LiveResult {
    pub block: u64,
    pub revision: u64,
    pub at_ns: u64,
    pub processing_ns: u64,
    pub result: Result<LiveAlignment, String>,
}
enum Job {
    Live {
        block: u64,
        revision: u64,
        at_ns: u64,
        target: Vec<Symbol>,
        response: Vec<Symbol>,
    },
    Final(Box<Record>, SyncSender<Result<Box<Record>, String>>),
}
pub struct Analysis {
    sender: Option<SyncSender<Job>>,
    pending: Option<Job>,
    pub results: Receiver<LiveResult>,
    worker: Option<JoinHandle<()>>,
}
impl Analysis {
    pub fn start() -> std::io::Result<Self> {
        let (sender, receive) = mpsc::sync_channel::<Job>(1);
        let (publish, results) = mpsc::sync_channel(4);
        let worker = thread::Builder::new()
            .name("cw-analysis".into())
            .spawn(move || {
                while let Ok(job) = receive.recv() {
                    match job {
                        Job::Live {
                            block,
                            revision,
                            at_ns,
                            target,
                            response,
                        } => {
                            let started = std::time::Instant::now();
                            let result = scoring::live_alignment(&target, &response)
                                .map_err(|e| e.to_string());
                            let _ = publish.send(LiveResult {
                                block,
                                revision,
                                at_ns,
                                processing_ns: started.elapsed().as_nanos().min(u64::MAX as u128)
                                    as u64,
                                result,
                            });
                        }
                        Job::Final(mut record, reply) => {
                            let result = match record.derive() {
                                Ok(()) => Ok(record),
                                Err(error)
                                    if record.context.mode == crate::learner::Mode::Copying
                                        && record.validate().is_ok() =>
                                {
                                    record.compromised =
                                        Some(format!("final scoring unavailable: {error}"));
                                    record.derive().map(|_| record).map_err(|e| e.to_string())
                                }
                                Err(error) => Err(error.to_string()),
                            };
                            let _ = reply.send(result);
                        }
                    }
                }
            })?;
        Ok(Self {
            sender: Some(sender),
            pending: None,
            results,
            worker: Some(worker),
        })
    }
    pub fn live(
        &mut self,
        block: u64,
        revision: u64,
        at_ns: u64,
        target: Vec<Symbol>,
        response: Vec<Symbol>,
    ) {
        if matches!(self.pending, Some(Job::Final(..))) {
            return;
        }
        self.pending = Some(Job::Live {
            block,
            revision,
            at_ns,
            target,
            response,
        });
        self.flush();
    }
    pub fn flush(&mut self) {
        if let Some(job) = self.pending.take()
            && let Some(sender) = &self.sender
        {
            match sender.try_send(job) {
                Ok(()) => {}
                Err(TrySendError::Full(job)) => self.pending = Some(job),
                Err(TrySendError::Disconnected(_)) => {}
            }
        }
    }
    pub fn final_score(
        &mut self,
        record: Record,
    ) -> Result<Receiver<Result<Box<Record>, String>>, String> {
        if matches!(self.pending, Some(Job::Final(..))) {
            return Err("mandatory final scoring already pending".into());
        }
        self.pending = None;
        let (reply, receive) = mpsc::sync_channel(1);
        // Queue as mandatory pending work; no more live submissions until it is received.
        let job = Job::Final(Box::new(record), reply);
        let sender = self.sender.as_ref().ok_or("analysis worker stopped")?;
        match sender.try_send(job) {
            Ok(()) => {}
            Err(TrySendError::Full(job)) => self.pending = Some(job),
            Err(TrySendError::Disconnected(_)) => return Err("analysis worker disconnected".into()),
        }
        Ok(receive)
    }
}
impl Drop for Analysis {
    fn drop(&mut self) {
        self.pending.take();
        self.sender.take();
        if let Some(worker) = self.worker.take()
            && worker.is_finished()
        {
            let _ = worker.join();
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mandatory_final_scoring_survives_a_full_live_result_queue() {
        use crate::{
            learner::Context,
            recording::{Kind, RecognitionTrial},
        };
        let mut analysis = Analysis::start().unwrap();
        // Four published results fill the result channel; job five blocks publication
        // and job six occupies the work queue before final scoring is submitted.
        for revision in 0..6 {
            analysis
                .sender
                .as_ref()
                .unwrap()
                .send(Job::Live {
                    block: 1,
                    revision,
                    at_ns: 0,
                    target: vec![Symbol {
                        character: 'K',
                        at_ns: 0,
                    }],
                    response: vec![Symbol {
                        character: 'K',
                        at_ns: 0,
                    }],
                })
                .unwrap();
        }
        let mut record = Record::new("pressure", Context::recognition(20), Kind::Recognition);
        record.trials.push(RecognitionTrial {
            symbol: 'K',
            onset_ns: 0,
            end_ns: 1,
            response: Some(Symbol {
                character: 'K',
                at_ns: 2,
            }),
            assisted: false,
            compromised: false,
            explicit_unknown: false,
        });
        let reply = analysis.final_score(record).unwrap();
        let start = std::time::Instant::now();
        loop {
            while analysis.results.try_recv().is_ok() {}
            analysis.flush();
            if let Ok(result) = reply.try_recv() {
                assert_eq!(result.unwrap().metrics.attempt_accuracy, Some(1.0));
                break;
            }
            assert!(start.elapsed() < std::time::Duration::from_secs(2));
            thread::sleep(std::time::Duration::from_millis(1));
        }
    }
}
