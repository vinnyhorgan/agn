const databaseName = "agn-local-library";
const databaseVersion = 1;
const deckStoreName = "sir-decks";

export interface StoredSirDeck {
  id: string;
  sourceLabel: string;
  fileName: string;
  contentHash: string;
  uploadedAt: number;
  data: ArrayBuffer;
}

export async function listStoredSirDecks(): Promise<StoredSirDeck[]> {
  const database = await openDatabase();

  try {
    const decks = await requestToPromise(
      database.transaction(deckStoreName, "readonly").objectStore(deckStoreName).getAll(),
    );

    return (decks as StoredSirDeck[]).sort(
      (left, right) => left.uploadedAt - right.uploadedAt,
    );
  } finally {
    database.close();
  }
}

export async function storeSirDeck(deck: StoredSirDeck): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(deckStoreName, "readwrite");
    transaction.objectStore(deckStoreName).put(deck);
    await transactionToPromise(transaction);
  } finally {
    database.close();
  }
}

export async function deleteStoredSirDeck(deckId: string): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(deckStoreName, "readwrite");
    transaction.objectStore(deckStoreName).delete(deckId);
    await transactionToPromise(transaction);
  } finally {
    database.close();
  }
}

export async function hashSirArchive(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(deckStoreName)) {
        const store = database.createObjectStore(deckStoreName, { keyPath: "id" });
        store.createIndex("contentHash", "contentHash", { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Local storage transaction was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Local storage transaction failed."));
  });
}
