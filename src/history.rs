//! Transactional, binary history. No database work is permitted on the audio thread.
use redb::{Database, Durability, ReadableDatabase, ReadableTable, TableDefinition};
use serde::{Serialize, de::DeserializeOwned};
use std::{
    error::Error,
    fs::{self, File, OpenOptions},
    io::{self, BufReader, BufWriter, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

pub type Result<T> = std::result::Result<T, Box<dyn Error>>;
const META: TableDefinition<&str, u64> = TableDefinition::new("metadata");
const EVENTS: TableDefinition<u64, &[u8]> = TableDefinition::new("events");
const HEAD: TableDefinition<&str, &[u8]> = TableDefinition::new("head");
const SCHEMA: u64 = 1;
const MAX_VALUE: usize = 8 * 1024 * 1024;
const BACKUP_MAGIC: &[u8; 8] = b"CWBACK01";

struct ProcessLock(File);
impl Drop for ProcessLock {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}

pub struct History {
    db: Database,
    _lock: ProcessLock,
    path: PathBuf,
}
impl History {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            fs::create_dir_all(parent)?;
        }
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path.with_extension("lock"))?;
        lock.try_lock().map_err(|e| {
            io::Error::other(format!(
                "history is already in use or cannot be locked: {e}"
            ))
        })?;
        let lock = ProcessLock(lock);
        let new = !path.exists();
        let db = Database::create(path)?;
        if new {
            let mut transaction = db.begin_write()?;
            transaction.set_durability(Durability::Immediate)?;
            {
                let mut meta = transaction.open_table(META)?;
                meta.insert("schema", SCHEMA)?;
                meta.insert("next", 1)?;
            }
            transaction.open_table(EVENTS)?;
            transaction.open_table(HEAD)?;
            transaction.commit()?;
        }
        let read = db.begin_read()?;
        let schema = read
            .open_table(META)?
            .get("schema")?
            .ok_or("missing history schema; preserve the database and investigate")?
            .value();
        if schema != SCHEMA {
            return Err(format!(
                "unsupported history schema {schema}; expected {SCHEMA}; no migration was attempted"
            )
            .into());
        }
        Ok(Self {
            db,
            _lock: lock,
            path: path.to_path_buf(),
        })
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    /// Record and derived state become visible atomically; acknowledge only after commit.
    pub fn append<R: Serialize, S: Serialize>(&mut self, record: &R, state: &S) -> Result<u64> {
        let payload = encode(record)?;
        let state = encode(state)?;
        let mut transaction = self.db.begin_write()?;
        transaction.set_durability(Durability::Immediate)?;
        let sequence;
        {
            let mut meta = transaction.open_table(META)?;
            sequence = meta.get("next")?.ok_or("missing event sequence")?.value();
            let next = sequence
                .checked_add(1)
                .ok_or("history sequence exhausted")?;
            let mut events = transaction.open_table(EVENTS)?;
            if events.insert(sequence, payload.as_slice())?.is_some() {
                return Err("event sequence collision; transaction aborted".into());
            }
            transaction
                .open_table(HEAD)?
                .insert("state", state.as_slice())?;
            meta.insert("next", next)?;
        }
        transaction.commit()?;
        Ok(sequence)
    }
    pub fn state<S: DeserializeOwned>(&self) -> Result<Option<S>> {
        let transaction = self.db.begin_read()?;
        let table = transaction.open_table(HEAD)?;
        table.get("state")?.map(|v| decode(v.value())).transpose()
    }
    pub fn records<R: DeserializeOwned>(&self) -> Result<Vec<(u64, R)>> {
        let transaction = self.db.begin_read()?;
        let table = transaction.open_table(EVENTS)?;
        let mut out = Vec::new();
        for row in table.iter()? {
            let (key, value) = row?;
            out.push((key.value(), decode(value.value())?));
        }
        for (i, (sequence, _)) in out.iter().enumerate() {
            if *sequence != i as u64 + 1 {
                return Err("non-contiguous event sequence; history was not reset".into());
            }
        }
        Ok(out)
    }
    /// Logical deletion in one transaction, never a partially emptied history.
    /// This is not secure physical erasure of freed pages/backups.
    pub fn reset(&mut self, confirmation: &str) -> Result<()> {
        if confirmation != "DELETE" {
            return Err("reset requires the exact confirmation DELETE".into());
        }
        let mut transaction = self.db.begin_write()?;
        transaction.set_durability(Durability::Immediate)?;
        transaction.delete_table(EVENTS)?;
        transaction.open_table(EVENTS)?;
        transaction.delete_table(HEAD)?;
        transaction.open_table(HEAD)?;
        transaction.open_table(META)?.insert("next", 1)?;
        transaction.commit()?;
        Ok(())
    }
    /// Portable binary backup of a single consistent read snapshot, not a live file copy.
    /// Existing destinations are never overwritten.
    pub fn export(&self, path: impl AsRef<Path>) -> Result<()> {
        let read = self.db.begin_read()?;
        let events = read.open_table(EVENTS)?;
        let head = read.open_table(HEAD)?;
        let metadata = read.open_table(META)?;
        let count = metadata
            .get("next")?
            .ok_or("missing next sequence")?
            .value()
            .checked_sub(1)
            .ok_or("invalid next sequence")?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path.as_ref())?;
        file.write_all(BACKUP_MAGIC)?;
        file.write_all(&0u32.to_le_bytes())?;
        let mut output = ChecksumIo::new(BufWriter::new(file));
        write_uint(&mut output, SCHEMA)?;
        if let Some(state) = head.get("state")? {
            output.write_all(&[1])?;
            write_value(&mut output, state.value())?;
        } else {
            output.write_all(&[0])?;
        }
        write_uint(&mut output, count)?;
        let mut expected = 1u64;
        for entry in events.iter()? {
            let (key, value) = entry?;
            if key.value() != expected {
                return Err("history sequence gap; preserve database".into());
            }
            write_uint(&mut output, key.value())?;
            write_value(&mut output, value.value())?;
            expected = expected.checked_add(1).ok_or("history sequence overflow")?;
        }
        if expected - 1 != count {
            return Err("history row count differs from metadata".into());
        }
        output.flush()?;
        let checksum = output.checksum();
        let file = output.inner.get_mut();
        file.seek(SeekFrom::Start(8))?;
        file.write_all(&checksum.to_le_bytes())?;
        file.sync_all()?;
        sync_parent(path.as_ref())?;
        Ok(())
    }
    /// Stream the stable Postcard container without allocating its complete history.
    pub fn verify_export(path: impl AsRef<Path>) -> Result<usize> {
        let mut file = BufReader::new(File::open(path)?);
        let mut header = [0u8; 12];
        file.read_exact(&mut header)?;
        if &header[..8] != BACKUP_MAGIC {
            return Err("invalid binary backup magic".into());
        }
        let expected = u32::from_le_bytes(header[8..12].try_into()?);
        let mut input = ChecksumIo::new(file);
        if read_uint(&mut input)? != SCHEMA {
            return Err("unsupported backup schema".into());
        }
        let mut workspace = [0u8; 64 * 1024];
        let mut tag = [0u8; 1];
        input.read_exact(&mut tag)?;
        match tag[0] {
            0 => {}
            1 => read_value(&mut input, &mut workspace)?,
            _ => return Err("invalid backup state tag".into()),
        }
        let count = usize::try_from(read_uint(&mut input)?)?;
        for index in 0..count {
            if read_uint(&mut input)? != index as u64 + 1 {
                return Err("backup sequence gap".into());
            }
            read_value(&mut input, &mut workspace)?;
        }
        if input.read(&mut tag)? != 0 {
            return Err("trailing backup bytes".into());
        }
        if input.checksum() != expected {
            return Err("backup checksum mismatch".into());
        }
        Ok(count)
    }
}
fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    let bytes = postcard::to_allocvec(value)?;
    if bytes.len() > MAX_VALUE {
        return Err("record exceeds 8 MiB storage limit".into());
    }
    Ok(bytes)
}
fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    if bytes.len() > MAX_VALUE {
        return Err("oversized record; history preserved".into());
    }
    let (value, remaining) = postcard::take_from_bytes(bytes)?;
    if !remaining.is_empty() {
        return Err("trailing record bytes; incompatible/corrupted history preserved".into());
    }
    Ok(value)
}
fn sync_parent(path: &Path) -> io::Result<()> {
    File::open(
        path.parent()
            .filter(|v| !v.as_os_str().is_empty())
            .unwrap_or(Path::new(".")),
    )?
    .sync_all()
}
const CRC_TABLE: [u32; 256] = {
    let mut table = [0; 256];
    let mut i = 0;
    while i < 256 {
        let mut value = i as u32;
        let mut bit = 0;
        while bit < 8 {
            value = (value >> 1) ^ (0xedb88320u32 & 0u32.wrapping_sub(value & 1));
            bit += 1;
        }
        table[i] = value;
        i += 1;
    }
    table
};
struct ChecksumIo<T> {
    inner: T,
    crc: u32,
}
impl<T> ChecksumIo<T> {
    fn new(inner: T) -> Self {
        Self { inner, crc: !0 }
    }
    fn checksum(&self) -> u32 {
        !self.crc
    }
    fn update(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.crc = CRC_TABLE[((self.crc ^ *byte as u32) & 255) as usize] ^ (self.crc >> 8);
        }
    }
}
impl<T: Write> Write for ChecksumIo<T> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let count = self.inner.write(bytes)?;
        self.update(&bytes[..count]);
        Ok(count)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}
impl<T: Read> Read for ChecksumIo<T> {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        let count = self.inner.read(bytes)?;
        self.update(&bytes[..count]);
        Ok(count)
    }
}
fn write_uint(output: &mut impl Write, value: u64) -> Result<()> {
    let mut buffer = [0u8; 10];
    output.write_all(postcard::to_slice(&value, &mut buffer)?)?;
    Ok(())
}
fn write_value(output: &mut impl Write, value: &[u8]) -> Result<()> {
    if value.len() > MAX_VALUE {
        return Err("oversized backup value".into());
    }
    write_uint(output, value.len() as u64)?;
    output.write_all(value)?;
    Ok(())
}
fn read_uint(input: &mut impl Read) -> Result<u64> {
    let mut value = 0u64;
    for shift in (0..70).step_by(7) {
        let mut byte = [0u8; 1];
        input.read_exact(&mut byte)?;
        if shift == 63 && byte[0] > 1 {
            return Err("backup varint overflow".into());
        }
        value |= ((byte[0] & 127) as u64) << shift;
        if byte[0] & 128 == 0 {
            if shift > 0 && byte[0] == 0 {
                return Err("noncanonical backup varint".into());
            }
            return Ok(value);
        }
    }
    Err("unterminated backup varint".into())
}
fn read_value(input: &mut impl Read, workspace: &mut [u8]) -> Result<()> {
    let mut left = usize::try_from(read_uint(input)?)?;
    if left > MAX_VALUE {
        return Err("oversized backup value".into());
    }
    while left > 0 {
        let count = left.min(workspace.len());
        input.read_exact(&mut workspace[..count])?;
        left -= count;
    }
    Ok(())
}
#[cfg(test)]
fn crc32(bytes: &[u8]) -> u32 {
    let mut checksum = ChecksumIo::new(io::sink());
    checksum.update(bytes);
    checksum.checksum()
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static ID: AtomicU64 = AtomicU64::new(0);
    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let p = std::env::temp_dir().join(format!(
                "cw-redb-{}-{}-{}",
                std::process::id(),
                chrono::Utc::now().timestamp_nanos_opt().unwrap(),
                ID.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&p).unwrap();
            Self(p)
        }
        fn db(&self) -> PathBuf {
            self.0.join("practice.redb")
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn record_and_state_survive_reopen_and_reset_is_atomic() {
        let temp = Temp::new();
        {
            let mut h = History::open(temp.db()).unwrap();
            assert_eq!(h.append(&"first", &7u64).unwrap(), 1);
            assert_eq!(h.append(&"second", &8u64).unwrap(), 2);
            assert!(History::open(temp.db()).is_err());
        }
        let mut h = History::open(temp.db()).unwrap();
        assert_eq!(h.state::<u64>().unwrap(), Some(8));
        assert_eq!(
            h.records::<String>().unwrap(),
            vec![(1, "first".into()), (2, "second".into())]
        );
        assert!(h.reset("no").is_err());
        assert_eq!(h.records::<String>().unwrap().len(), 2);
        h.reset("DELETE").unwrap();
        assert!(h.records::<String>().unwrap().is_empty());
        assert_eq!(h.state::<u64>().unwrap(), None);
        assert_eq!(h.append(&"new", &9u64).unwrap(), 1);
    }
    #[test]
    fn export_is_consistent_binary_checksummed_and_non_overwriting() {
        let temp = Temp::new();
        let mut h = History::open(temp.db()).unwrap();
        h.append(&"record", &9u64).unwrap();
        let backup = temp.0.join("practice.cwbackup");
        h.export(&backup).unwrap();
        assert_eq!(History::verify_export(&backup).unwrap(), 1);
        assert!(h.export(&backup).is_err());
        let mut bytes = fs::read(&backup).unwrap();
        *bytes.last_mut().unwrap() ^= 1;
        fs::write(&backup, bytes).unwrap();
        assert!(History::verify_export(&backup).is_err());
        assert_eq!(crc32(b"123456789"), 0xcbf43926);
    }
    #[test]
    fn streaming_export_is_byte_identical_to_the_original_postcard_container() {
        let temp = Temp::new();
        let mut history = History::open(temp.db()).unwrap();
        for i in 0..130u64 {
            history.append(&vec![i as u8; 300], &i).unwrap();
        }
        let read = history.db.begin_read().unwrap();
        let table = read.open_table(EVENTS).unwrap();
        let rows: Vec<_> = table
            .iter()
            .unwrap()
            .map(|entry| {
                let (key, value) = entry.unwrap();
                (key.value(), value.value().to_vec())
            })
            .collect();
        let state = read
            .open_table(HEAD)
            .unwrap()
            .get("state")
            .unwrap()
            .map(|v| v.value().to_vec());
        let original = postcard::to_allocvec(&(SCHEMA, state, rows)).unwrap();
        let backup = temp.0.join("stream.cwbackup");
        history.export(&backup).unwrap();
        let bytes = fs::read(&backup).unwrap();
        assert_eq!(&bytes[12..], &original);
        assert_eq!(&bytes[8..12], &crc32(&original).to_le_bytes());
        assert_eq!(History::verify_export(&backup).unwrap(), 130);
    }
    #[test]
    fn aborted_write_never_changes_head_or_records() {
        let temp = Temp::new();
        let mut h = History::open(temp.db()).unwrap();
        h.append(&"good", &1u64).unwrap();
        {
            let txn = h.db.begin_write().unwrap();
            txn.open_table(HEAD)
                .unwrap()
                .insert("state", encode(&99u64).unwrap().as_slice())
                .unwrap();
            txn.open_table(EVENTS)
                .unwrap()
                .insert(2, encode(&"bad").unwrap().as_slice())
                .unwrap();
        }
        assert_eq!(h.state::<u64>().unwrap(), Some(1));
        assert_eq!(h.records::<String>().unwrap().len(), 1);
    }
    #[test]
    fn corrupt_file_is_not_replaced_with_an_empty_profile() {
        let temp = Temp::new();
        fs::write(temp.db(), b"not a database").unwrap();
        assert!(History::open(temp.db()).is_err());
        assert_eq!(fs::read(temp.db()).unwrap(), b"not a database");
    }
    #[test]
    fn child_process_exit() {
        let Some(path) = std::env::var_os("CW_HISTORY_CRASH_TEST") else {
            return;
        };
        let h = History::open(path).unwrap();
        let txn = h.db.begin_write().unwrap();
        txn.open_table(HEAD)
            .unwrap()
            .insert("state", encode(&99u64).unwrap().as_slice())
            .unwrap();
        txn.open_table(EVENTS)
            .unwrap()
            .insert(2, encode(&"uncommitted").unwrap().as_slice())
            .unwrap();
        std::process::exit(17); // bypass all Rust drops to simulate a process failure
    }
    #[test]
    fn process_exit_during_transaction_recovers_last_committed_state() {
        let temp = Temp::new();
        {
            let mut h = History::open(temp.db()).unwrap();
            h.append(&"committed", &1u64).unwrap();
        }
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "history::tests::child_process_exit"])
            .env("CW_HISTORY_CRASH_TEST", temp.db())
            .output()
            .unwrap();
        assert_eq!(child.status.code(), Some(17));
        let h = History::open(temp.db()).unwrap();
        assert_eq!(h.state::<u64>().unwrap(), Some(1));
        assert_eq!(
            h.records::<String>().unwrap(),
            vec![(1, "committed".into())]
        );
    }
}
