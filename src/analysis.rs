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
                            let result = scoring::live_alignment(&target, &response)
                                .map_err(|e| e.to_string());
                            let _ = publish.send(LiveResult {
                                block,
                                revision,
                                at_ns,
                                result,
                            });
                        }
                        Job::Final(mut record, reply) => {
                            let result = record.derive().map(|_| record).map_err(|e| e.to_string());
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
