//! Dedicated transaction writer. Acknowledgments mean the transaction committed.
use crate::{history::History, learner::Profile, recording::Record};
use std::{
    path::PathBuf,
    sync::mpsc::{self, Receiver, SyncSender},
    thread::{self, JoinHandle},
};

pub enum Operation {
    Append(Box<Record>, Box<Profile>),
    Export(PathBuf),
    Reset,
}
struct Request {
    operation: Operation,
    reply: SyncSender<Result<u64, String>>,
}
pub struct Writer {
    sender: Option<SyncSender<Request>>,
    thread: Option<JoinHandle<()>>,
}
impl Writer {
    pub fn start(mut history: History) -> std::io::Result<Self> {
        let (sender, receive) = mpsc::sync_channel::<Request>(2);
        let thread = thread::Builder::new()
            .name("cw-history-writer".into())
            .spawn(move || {
                while let Ok(request) = receive.recv() {
                    let result = match request.operation {
                        Operation::Append(record, profile) => {
                            if record.schema >= 4 {
                                history.append(record.as_ref(), &profile.policy_snapshot())
                            } else {
                                history.append(record.as_ref(), profile.as_ref())
                            }
                        }
                        Operation::Export(path) => history.export(path).map(|_| 0),
                        Operation::Reset => history.reset("DELETE").map(|_| 0),
                    }
                    .map_err(|error| error.to_string());
                    let _ = request.reply.send(result);
                }
            })?;
        Ok(Self {
            sender: Some(sender),
            thread: Some(thread),
        })
    }
    pub fn request(&self, operation: Operation) -> Result<Receiver<Result<u64, String>>, String> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .as_ref()
            .ok_or("history writer has stopped")?
            .try_send(Request { operation, reply })
            .map_err(|error| format!("history queue unavailable; stop practice: {error}"))?;
        Ok(receive)
    }
    pub fn finish(mut self) -> Result<(), String> {
        self.sender.take();
        if let Some(thread) = self.thread.take() {
            thread
                .join()
                .map_err(|_| "history writer panicked".to_string())?;
        }
        Ok(())
    }
}
impl Drop for Writer {
    fn drop(&mut self) {
        self.sender.take();
        if let Some(thread) = self.thread.take()
            && thread.is_finished()
        {
            let _ = thread.join();
        }
    }
}
