import { api } from "./api";

type QueuedOrder = {
  id?: number;
  payload: { customer_id: number; lines: { product_id: number; quantity: number }[] };
  queued_at: string;
};

const DB_NAME = "snackflow-offline";
const STORE_NAME = "queued-orders";

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOrder(payload: QueuedOrder["payload"]): Promise<void> {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ payload, queued_at: new Date().toISOString() } satisfies QueuedOrder);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function syncQueuedOrders(): Promise<number> {
  const db = await openQueue();
  const queued = await new Promise<QueuedOrder[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as QueuedOrder[]);
    request.onerror = () => reject(request.error);
  });

  let synced = 0;
  for (const order of queued) {
    try {
      await api("/api/orders", { method: "POST", body: JSON.stringify(order.payload) });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(order.id!);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      synced += 1;
    } catch {
      // Stop on the first failure. Keep this and later orders queued in original order.
      break;
    }
  }
  db.close();
  return synced;
}
