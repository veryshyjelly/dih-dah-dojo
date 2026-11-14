import type { BlockUpload } from './types';
type Pending = BlockUpload & { owner: string; created: number };
let connection: Promise<IDBDatabase> | null = null;
function database() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('dih-dah-dojo', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('outbox', { keyPath: 'id' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  }));
}
export async function putPending(owner: string, block: BlockUpload) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').put({
      ...block,
      owner,
      created: Date.now(),
    } satisfies Pending);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function pending(owner: string) {
  const db = await database();
  return new Promise<Pending[]>((resolve, reject) => {
    const get = db.transaction('outbox').objectStore('outbox').getAll();
    get.onsuccess = () =>
      resolve(
        (get.result as Pending[])
          .filter((v) => v.owner === owner)
          .sort((a, b) => a.created - b.created),
      );
    get.onerror = () => reject(get.error);
  });
}
export async function removePending(id: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
