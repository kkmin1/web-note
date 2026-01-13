// GitHub Repository-based Sync (Incremental)
class RepoSync {
    constructor(token, repo) {
        this.token = token;
        this.repo = repo; // Format: 'username/repo'
        this.apiUrl = 'https://api.github.com';
    }

    // Save a single note
    async saveNote(note) {
        const path = `data/notes/${note.id}.json`;
        return this.uploadFile(path, JSON.stringify(note, null, 2), `Update note: ${note.title || note.id}`);
    }

    // Delete a single note
    async deleteNote(noteId) {
        const path = `data/notes/${noteId}.json`;
        const url = `${this.apiUrl}/repos/${this.repo}/contents/${path}`;

        try {
            // 1. Get SHA first
            const getRes = await fetch(url, {
                headers: { 'Authorization': `token ${this.token}` }
            });
            if (!getRes.ok) return; // Already gone

            const fileData = await getRes.json();

            // 2. Delete
            await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Delete note: ${noteId}`,
                    sha: fileData.sha
                })
            });
        } catch (e) {
            console.error('Failed to delete note from GitHub', e);
        }
    }

    async uploadFile(path, content, message) {
        const url = `${this.apiUrl}/repos/${this.repo}/contents/${path}`;

        // 1. Check if file exists to get its SHA
        let sha = null;
        try {
            const getRes = await fetch(url, {
                headers: { 'Authorization': `token ${this.token}` }
            });
            if (getRes.ok) {
                const fileData = await getRes.json();
                sha = fileData.sha;
            }
        } catch (e) {
            console.log('File does not exist yet');
        }

        // 2. Upload/Update
        const body = {
            message: message,
            content: btoa(unescape(encodeURIComponent(content))), // Unicode safe base64
            sha: sha
        };

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message);
        }

        return await res.json();
    }

    // Load all notes from repo (Initial setup)
    async loadAll() {
        const url = `${this.apiUrl}/repos/${this.repo}/contents/data/notes`;
        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `token ${this.token}` }
            });
            if (!res.ok) return [];

            const files = await res.json();
            const notes = [];
            for (const file of files) {
                if (file.name.endsWith('.json')) {
                    const contentRes = await fetch(file.download_url);
                    const note = await contentRes.json();
                    notes.push(note);
                }
            }
            return notes;
        } catch (e) {
            console.error('Failed to load notes from repo', e);
            return [];
        }
    }
}
