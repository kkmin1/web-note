// IndexedDB Wrapper for Keep Notes
class KeepDB {
    constructor() {
        this.dbName = 'KeepNotesDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('labels')) {
                    db.createObjectStore('labels', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject('IndexedDB error: ' + event.target.errorCode);
            };
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Migration helper
    async migrateFromLocalStorage() {
        const notes = localStorage.getItem('keepNotes');
        const labels = localStorage.getItem('keepLabels');
        const syncId = localStorage.getItem('keepNotesGistId');
        const token = localStorage.getItem('githubToken');
        const repo = localStorage.getItem('githubRepo');

        if (notes) {
            const parsedNotes = JSON.parse(notes);
            for (const note of parsedNotes) {
                await this.put('notes', note);
            }
            // localStorage.removeItem('keepNotes'); // Keep for safety until confirmed
        }

        if (labels) {
            const parsedLabels = JSON.parse(labels);
            for (const label of parsedLabels) {
                await this.put('labels', label);
            }
        }

        // Migrate settings
        if (token) await this.put('settings', { id: 'githubToken', value: token });
        if (repo) await this.put('settings', { id: 'githubRepo', value: repo });
        if (syncId) await this.put('settings', { id: 'syncId', value: syncId });
    }
}

window.keepDB = new KeepDB();
