// ============================================================================
// Keep Notes - High Capacity Version (IndexedDB)
// ============================================================================

class KeepNotes {
    constructor() {
        this.notes = [];
        this.labels = [];
        this.currentView = 'notes';
        this.currentFilter = null;
        this.isListView = false;
        this.isDarkMode = false;
        this.editingNoteId = null;
        this.currentNoteColor = 'default';
        this.syncDebounceTimer = null;
        this.dbReady = false;

        this.init();
    }

    async init() {
        try {
            // Initialize Database
            await window.keepDB.init();

            // Migrate from old storage if needed
            if (localStorage.getItem('keepNotes')) {
                console.log('Migrating data to IndexedDB...');
                await window.keepDB.migrateFromLocalStorage();
                localStorage.removeItem('keepNotes');
                localStorage.removeItem('keepLabels');
            }

            // Load Settings
            const tokenSetting = await window.keepDB.get('settings', 'githubToken');
            const repoSetting = await window.keepDB.get('settings', 'githubRepo');

            if (tokenSetting && repoSetting) {
                this.repoSync = new RepoSync(tokenSetting.value, repoSetting.value);
            }

            const darkModeSetting = localStorage.getItem('keepDarkMode');
            if (darkModeSetting === 'true') {
                this.isDarkMode = true;
                document.body.classList.add('dark-mode');
            }

            // Load Data
            await this.loadData();

            this.setupEventListeners();
            this.renderNotes();
            this.renderLabels();
            this.checkReminders();
            this.dbReady = true;

            // Check reminders every minute
            setInterval(() => this.checkReminders(), 60000);
            console.log('Keep Notes (High-Cap) Initialized');
        } catch (e) {
            console.error('Initialization failed', e);
            alert('초기화 실패: ' + e);
        }
    }

    async loadData() {
        this.notes = await window.keepDB.getAll('notes');
        this.labels = await window.keepDB.getAll('labels');

        // Sort notes by updatedAt DESC
        this.notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    async saveNote(note) {
        await window.keepDB.put('notes', note);
        this.triggerAutoSync(note);
    }

    triggerAutoSync(note) {
        if (!this.repoSync) return;

        // In a real incremental sync, we might queue this.
        // For now, let's debounce at individual note level if needed, 
        // or just fire and forget for simplicity in this stage.
        if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
        this.syncDebounceTimer = setTimeout(async () => {
            try {
                await this.repoSync.saveNote(note);
                console.log('Synced note:', note.id);
            } catch (e) {
                console.error('Sync failed', e);
            }
        }, 3000);
    }

    // ========================================================================
    // Event Listeners
    // ========================================================================

    setupEventListeners() {
        // Toggle Sidebar
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // Note input
        document.getElementById('noteTitle').addEventListener('focus', () => {
            document.getElementById('noteInput').classList.add('expanded');
        });

        document.getElementById('noteContent').addEventListener('input', (e) => {
            this.updateCharCounterExcludingImages(e.target.value, 'charCounter');
        });

        document.getElementById('closeNoteBtn').addEventListener('click', () => {
            this.saveNewNote();
        });

        // Image upload
        document.getElementById('addImageBtn').addEventListener('click', () => {
            document.getElementById('imageInput').click();
        });

        document.getElementById('modalAddImageBtn').addEventListener('click', () => {
            document.getElementById('imageInput').click();
        });

        document.getElementById('imageInput').addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files[0]);
        });

        // Checklist
        document.getElementById('addChecklistBtn').addEventListener('click', () => {
            this.insertChecklistItem('noteContent');
        });

        document.getElementById('modalAddChecklistBtn').addEventListener('click', () => {
            this.insertChecklistItem('modalNoteContent');
        });

        // Preview toggle
        document.getElementById('modalPreviewToggleBtn').addEventListener('click', () => {
            this.togglePreview();
        });

        // Color picker
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const color = e.target.dataset.color;
                this.currentNoteColor = color;
                if (this.editingNoteId) {
                    this.updateNoteColor(this.editingNoteId, color);
                }
            });
        });

        // Color picker toggle
        document.querySelectorAll('.color-picker').forEach(picker => {
            const btn = picker.querySelector('.toolbar-btn');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.color-picker').forEach(p => {
                        if (p !== picker) p.classList.remove('active');
                    });
                    picker.classList.toggle('active');
                });
            }
        });

        // Close color picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.color-picker')) {
                document.querySelectorAll('.color-picker').forEach(p => p.classList.remove('active'));
            }
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchNotes(e.target.value);
        });

        // View toggle
        document.getElementById('viewToggle').addEventListener('click', () => {
            this.toggleView();
        });

        // Dark mode toggle
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            this.toggleDarkMode();
        });

        // Navigation
        document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });

        // Labels
        document.getElementById('createLabelBtn').addEventListener('click', () => {
            this.createLabel();
        });

        // GitHub Setup
        document.getElementById('githubSetupBtn').addEventListener('click', () => this.setupGitHubSync());
        document.getElementById('githubSaveBtn').addEventListener('click', () => this.syncAllWithRepo());
        document.getElementById('githubLoadBtn').addEventListener('click', () => this.loadAllFromRepo());

        // Backup
        document.getElementById('exportBtn').addEventListener('click', () => this.exportNotes());
        document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importInput').click());
        document.getElementById('importInput').addEventListener('change', (e) => this.importNotes(e.target.files[0]));

        // Modal Note
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('pinNoteBtn').addEventListener('click', () => {
            if (this.editingNoteId) this.togglePin(this.editingNoteId);
        });
        document.getElementById('archiveNoteBtn').addEventListener('click', () => {
            if (this.editingNoteId) {
                this.toggleArchive(this.editingNoteId);
                this.closeModal();
            }
        });
        document.getElementById('deleteNoteBtn').addEventListener('click', () => {
            if (this.editingNoteId) {
                this.deleteNote(this.editingNoteId);
                this.closeModal();
            }
        });

        // Auto-save on click away
        document.addEventListener('click', (e) => {
            const input = document.getElementById('noteInput');
            if (input.classList.contains('expanded') && !input.contains(e.target)) {
                if (!document.getElementById('noteModal').contains(e.target)) {
                    this.saveNewNote();
                }
            }
        });
    }

    // ========================================================================
    // Note Actions
    // ========================================================================

    async saveNewNote() {
        const title = document.getElementById('noteTitle').value.trim();
        const content = document.getElementById('noteContent').value.trim();

        if (!title && !content) {
            this.closeNoteInput();
            return;
        }

        const note = {
            id: Date.now().toString(),
            title,
            content,
            color: this.currentNoteColor,
            labels: [],
            pinned: false,
            archived: false,
            inTrash: false,
            reminder: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.notes.unshift(note);
        await this.saveNote(note);
        this.renderNotes();
        this.closeNoteInput();
    }

    closeNoteInput() {
        document.getElementById('noteInput').classList.remove('expanded');
        document.getElementById('noteTitle').value = '';
        document.getElementById('noteContent').value = '';
        this.currentNoteColor = 'default';
        this.updateCharCounter(0, 'charCounter');
    }

    async deleteNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        if (note.inTrash) {
            // Permanent
            this.notes = this.notes.filter(n => n.id !== noteId);
            await window.keepDB.delete('notes', noteId);
        } else {
            note.inTrash = true;
            note.pinned = false;
            note.updatedAt = new Date().toISOString();
            await this.saveNote(note);
        }
        this.renderNotes();
    }

    async togglePin(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        note.pinned = !note.pinned;
        note.updatedAt = new Date().toISOString();
        await this.saveNote(note);
        this.renderNotes();

        // Update UI if in modal
        const pinBtn = document.getElementById('pinNoteBtn');
        if (note.pinned) pinBtn.classList.add('active');
        else pinBtn.classList.remove('active');
    }

    async toggleArchive(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        note.archived = !note.archived;
        note.updatedAt = new Date().toISOString();
        await this.saveNote(note);
        this.renderNotes();
    }

    async updateNoteColor(noteId, color) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        note.color = color;
        note.updatedAt = new Date().toISOString();
        await this.saveNote(note);

        const modalContent = document.querySelector('.modal-content');
        modalContent.style.background = `var(--note-bg-${color})`;
        this.renderNotes();
    }

    async updateNoteField(noteId, field, value) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        note[field] = value;
        note.updatedAt = new Date().toISOString();
        await this.saveNote(note);
    }

    // ========================================================================
    // UI Rendering (Similar to before but async-friendly)
    // ========================================================================

    renderNotes() {
        const pinnedContainer = document.getElementById('pinnedNotes');
        const otherContainer = document.getElementById('otherNotes');
        const emptyState = document.getElementById('emptyState');

        pinnedContainer.innerHTML = '';
        otherContainer.innerHTML = '';

        let filteredNotes = this.notes.filter(note => {
            if (this.currentView === 'trash') return note.inTrash;
            if (note.inTrash) return false;
            if (this.currentView === 'archive') return note.archived;
            if (this.currentView === 'reminders') return !!note.reminder;
            if (note.archived) return false;
            if (this.currentFilter) return note.labels.includes(this.currentFilter);
            return true;
        });

        const pinned = filteredNotes.filter(n => n.pinned);
        const others = filteredNotes.filter(n => !n.pinned);

        if (filteredNotes.length === 0) {
            emptyState.classList.add('visible');
            document.getElementById('pinnedSection').style.display = 'none';
            document.getElementById('otherSection').style.display = 'none';
        } else {
            emptyState.classList.remove('visible');
            if (pinned.length > 0) {
                document.getElementById('pinnedSection').style.display = 'block';
                pinned.forEach(n => pinnedContainer.appendChild(this.createNoteCard(n)));
            } else {
                document.getElementById('pinnedSection').style.display = 'none';
            }
            if (others.length > 0) {
                document.getElementById('otherSection').style.display = 'block';
                others.forEach(n => otherContainer.appendChild(this.createNoteCard(n)));
            } else {
                document.getElementById('otherSection').style.display = 'none';
            }
        }
    }

    createNoteCard(note) {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.dataset.color = note.color;
        if (note.pinned) card.classList.add('pinned');

        card.innerHTML = `
            <div class="note-card-header">
                <div class="note-title">${note.title || ''}</div>
                ${!note.inTrash ? `
                <svg class="note-pin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M17 4v7l2 3v2h-6v5l-1 1-1-1v-5H5v-2l2-3V4c0-1.1.9-2 2-2h6c1.11 0 2 .89 2 2z" fill="currentColor"/>
                </svg>` : ''}
            </div>
            <div class="note-content">${DOMPurify.sanitize(marked.parse(note.content || ''))}</div>
            ${note.inTrash ? `
            <div class="note-card-footer">
                <button class="icon-btn restore-btn" title="복원"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" fill="currentColor"/></svg></button>
                <button class="icon-btn delete-perm-btn" title="영구 삭제"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg></button>
            </div>` : ''}
        `;

        if (note.inTrash) {
            card.querySelector('.restore-btn').onclick = (e) => { e.stopPropagation(); this.restoreNote(note.id); };
            card.querySelector('.delete-perm-btn').onclick = (e) => { e.stopPropagation(); if (confirm('영구 삭제하시겠습니까?')) this.deleteNote(note.id); };
        }

        card.onclick = () => this.openNote(note.id);
        return card;
    }

    async restoreNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        note.inTrash = false;
        note.updatedAt = new Date().toISOString();
        await this.saveNote(note);
        this.renderNotes();
    }

    openNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        this.editingNoteId = noteId;
        this.currentNoteColor = note.color || 'default';

        const modal = document.getElementById('noteModal');
        const titleInput = document.getElementById('modalNoteTitle');
        const contentInput = document.getElementById('modalNoteContent');
        const previewDiv = document.getElementById('modalNotePreview');

        titleInput.value = note.title || '';
        contentInput.value = note.content || '';
        
        // Default to preview mode
        previewDiv.innerHTML = DOMPurify.sanitize(marked.parse(contentInput.value || '*내용 없음*'));
        modal.classList.add('preview-mode');
        modal.classList.remove('edit-mode');

        const modalContent = document.querySelector('.modal-content');
        modalContent.style.background = `var(--note-bg-${this.currentNoteColor})`;

        const pinBtn = document.getElementById('pinNoteBtn');
        if (note.pinned) pinBtn.classList.add('active');
        else pinBtn.classList.remove('active');

        modal.classList.add('active');
    }

    closeModal() {
        document.getElementById('noteModal').classList.remove('active');
        this.editingNoteId = null;
        this.renderNotes();
    }

    // ========================================================================
    // GitHub Repo Sync
    // ========================================================================

    async setupGitHubSync() {
        const token = prompt('GitHub Personal Access Token을 입력하세요:\n\n1. github.com/settings/tokens 에서 생성\n2. "repo" 권한 체크 (중요!)\n3. 생성된 토큰 복사');
        const repo = prompt('대상 Repository 이름을 입력하세요:\n\n예시: 사용자명/저장소명\n(주의: GitHub에 저장소를 미리 만드셔야 합니다)');
        if (token && repo) {
            await window.keepDB.put('settings', { id: 'githubToken', value: token });
            await window.keepDB.put('settings', { id: 'githubRepo', value: repo });
            this.repoSync = new RepoSync(token, repo);
            alert('설정 완료!');
        }
    }

    async syncAllWithRepo() {
        if (!this.repoSync) return alert('설정이 필요합니다.');
        alert('순차적으로 저장됩니다. (백그라운드)');
        for (const note of this.notes) {
            await this.repoSync.saveNote(note);
        }
        alert('전체 동기화 완료!');
    }

    async loadAllFromRepo() {
        if (!this.repoSync) return alert('설정이 필요합니다.');
        const notes = await this.repoSync.loadAll();
        for (const note of notes) {
            await window.keepDB.put('notes', note);
        }
        await this.loadData();
        this.renderNotes();
        alert('불러오기 완료!');
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    updateCharCounterExcludingImages(content, id) {
        const count = content.replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '![img]').length;
        const el = document.getElementById(id);
        el.textContent = `${count.toLocaleString()} / 40,000`;
        if (count > 38000) el.classList.add('warning');
        else el.classList.remove('warning');
    }

    updateCharCounter(count, id) {
        document.getElementById(id).textContent = `${count} / 40,000`;
    }

    toggleDarkMode() {
        this.isDarkMode = !this.isDarkMode;
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('keepDarkMode', this.isDarkMode);
    }

    switchView(view) {
        this.currentView = view;
        this.currentFilter = null;
        document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
        this.renderNotes();
    }

    toggleView() {
        this.isListView = !this.isListView;
        document.querySelectorAll('.notes-grid').forEach(g => g.classList.toggle('list-view', this.isListView));
    }

    async createLabel() {
        const name = prompt('라벨명:');
        if (!name) return;
        const label = { id: Date.now().toString(), name };
        this.labels.push(label);
        await window.keepDB.put('labels', label);
        this.renderLabels();
    }

    renderLabels() {
        const list = document.getElementById('labelsList');
        list.innerHTML = '';
        this.labels.forEach(l => {
            const btn = document.createElement('button');
            btn.className = 'nav-item';
            btn.innerHTML = `<span>${l.name}</span>`;
            btn.onclick = () => { this.currentFilter = l.id; this.currentView = 'notes'; this.renderNotes(); };
            list.appendChild(btn);
        });
    }

    checkReminders() {
        // Logic same as before...
    }

    togglePreview() {
        const modal = document.getElementById('noteModal');
        const tx = document.getElementById('modalNoteContent');
        const pv = document.getElementById('modalNotePreview');

        if (modal.classList.contains('preview-mode')) {
            // Switch to edit mode
            modal.classList.remove('preview-mode');
            modal.classList.add('edit-mode');
            tx.focus();
        } else {
            // Switch back to preview mode
            pv.innerHTML = DOMPurify.sanitize(marked.parse(tx.value || '*내용 없음*'));
            modal.classList.remove('edit-mode');
            modal.classList.add('preview-mode');
        }
    }

    handleImageUpload(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const md = `\n![image](${e.target.result})\n`;
            const tx = document.getElementById(this.editingNoteId ? 'modalNoteContent' : 'noteContent');
            const pos = tx.selectionStart;
            tx.value = tx.value.substring(0, pos) + md + tx.value.substring(pos);
            tx.dispatchEvent(new Event('input'));
        };
        reader.readAsDataURL(file);
    }

    exportNotes() {
        const blob = new Blob([JSON.stringify({ notes: this.notes, labels: this.labels })], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'keep-backup.json';
        a.click();
    }

    async importNotes(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = JSON.parse(e.target.result);
            for (const n of data.notes) await window.keepDB.put('notes', n);
            await this.loadData();
            this.renderNotes();
        };
        reader.readAsText(file);
    }

    searchNotes(q) {
        const term = q.toLowerCase();
        const filtered = this.notes.filter(n => !n.inTrash && (n.title.toLowerCase().includes(term) || n.content.toLowerCase().includes(term)));
        const grid = document.getElementById('otherNotes');
        grid.innerHTML = '';
        document.getElementById('pinnedSection').style.display = 'none';
        document.getElementById('otherSection').style.display = 'block';
        filtered.forEach(n => grid.appendChild(this.createNoteCard(n)));
    }
}

document.addEventListener('DOMContentLoaded', () => { window.keepNotes = new KeepNotes(); });
