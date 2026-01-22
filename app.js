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
        this.labelMenuContextId = null;
        this.longPressTimer = null;
        this.directoryHandle = null;
        this.mediaCache = new Map(); // Store temporary object URLs for immediate preview

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

            // Load Folder Handle
            const folderSetting = await window.keepDB.get('settings', 'directoryHandle');
            if (folderSetting) {
                this.directoryHandle = folderSetting.value;
            }

            this.setupEventListeners();
            this.setupMarked();
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

        // Local Folder Setup: Implicitly handled via image upload

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

        // Modal Label Toggle
        document.getElementById('modalLabelBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            const options = document.getElementById('modalLabelOptions');
            const isActive = options.style.display === 'block';
            options.style.display = isActive ? 'none' : 'block';
            if (!isActive) this.renderModalLabelOptions();
        });

        // Close label options when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.label-picker')) {
                const options = document.getElementById('modalLabelOptions');
                if (options) options.style.display = 'none';
            }
        });

        // Context Menu Handlers
        document.getElementById('renameLabelBtn').addEventListener('click', () => {
            if (this.labelMenuContextId) this.renameLabel(this.labelMenuContextId);
            this.hideLabelContextMenu();
        });

        document.getElementById('deleteLabelBtn').addEventListener('click', () => {
            if (this.labelMenuContextId) this.deleteLabel(this.labelMenuContextId);
            this.hideLabelContextMenu();
        });

        document.addEventListener('click', () => this.hideLabelContextMenu());
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.nav-item')) this.hideLabelContextMenu();
        });

        // Auto-save on click away (New Note & Modal)
        document.addEventListener('click', (e) => {
            const input = document.getElementById('noteInput');
            const modal = document.getElementById('noteModal');
            const modalContent = document.querySelector('.modal-content');

            // 1. New note click away
            if (input.classList.contains('expanded') && !input.contains(e.target) && !modal.contains(e.target)) {
                this.saveNewNote();
            }
        });

        // Modal Input Listeners for Auto-save & Counter
        document.getElementById('modalNoteTitle').addEventListener('input', () => this.autoSaveModal());
        document.getElementById('modalNoteContent').addEventListener('input', (e) => {
            this.updateCharCounterExcludingImages(e.target.value, 'modalCharCounter');
            this.autoSaveModal();
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
            // 1. Trash view only shows trashed notes
            if (this.currentView === 'trash') return note.inTrash;

            // 2. All other views hide trashed notes
            if (note.inTrash) return false;

            // 3. If a label filter is active, show matching notes regardless of archive status
            if (this.currentFilter) return note.labels.includes(this.currentFilter);

            // 4. Archive view shows only archived notes
            if (this.currentView === 'archive') return note.archived;

            // 5. Reminders view
            if (this.currentView === 'reminders') return !!note.reminder;

            // 6. Default "Notes" view hides archived notes
            if (note.archived) return false;

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

            // Render pinned notes (usually small number)
            if (pinned.length > 0) {
                document.getElementById('pinnedSection').style.display = 'block';
                pinned.forEach(n => pinnedContainer.appendChild(this.createNoteCard(n)));
            } else {
                document.getElementById('pinnedSection').style.display = 'none';
            }

            // Render other notes with pagination to prevent browser freeze
            if (others.length > 0) {
                document.getElementById('otherSection').style.display = 'block';

                const INITIAL_RENDER_COUNT = 200;
                const toRender = others.slice(0, INITIAL_RENDER_COUNT);
                const remaining = others.length - INITIAL_RENDER_COUNT;

                toRender.forEach(n => otherContainer.appendChild(this.createNoteCard(n)));

                // Add "Load More" button if there are more notes
                if (remaining > 0) {
                    const loadMoreBtn = document.createElement('div');
                    loadMoreBtn.className = 'load-more-btn';
                    loadMoreBtn.innerHTML = `<button class="btn-primary">더 보기 (${remaining}개 남음)</button>`;
                    loadMoreBtn.style.cssText = 'text-align: center; padding: 20px; grid-column: 1/-1;';

                    loadMoreBtn.querySelector('button').onclick = () => {
                        loadMoreBtn.remove();
                        const nextBatch = others.slice(INITIAL_RENDER_COUNT, INITIAL_RENDER_COUNT + 200);
                        nextBatch.forEach(n => otherContainer.appendChild(this.createNoteCard(n)));

                        const stillRemaining = others.length - INITIAL_RENDER_COUNT - 200;
                        if (stillRemaining > 0) {
                            this.renderNotes(); // Re-render to show updated count
                        }
                    };

                    otherContainer.appendChild(loadMoreBtn);
                }
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
            <div class="note-labels">
                ${(note.labels || []).map(labelId => {
            const label = this.labels.find(l => l.id === labelId);
            return label ? `<span class="note-label">${label.name}</span>` : '';
        }).join('')}
            </div>
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

    async closeModal() {
        if (this.editingNoteId) {
            await this.autoSaveModal();
        }
        document.getElementById('noteModal').classList.remove('active');
        this.editingNoteId = null;
        this.renderNotes();
    }

    async autoSaveModal() {
        if (!this.editingNoteId) return;
        const note = this.notes.find(n => n.id === this.editingNoteId);
        if (!note) return;

        const newTitle = document.getElementById('modalNoteTitle').value;
        const newContent = document.getElementById('modalNoteContent').value;

        // Only save if there's a change
        if (note.title !== newTitle || note.content !== newContent) {
            note.title = newTitle;
            note.content = newContent;
            note.updatedAt = new Date().toISOString();
            await this.saveNote(note);
        }
    }

    // ========================================================================
    // GitHub Repo Sync
    // ========================================================================

    async setupGitHubSync() {
        const token = prompt('GitHub Personal Access Token을 입력하세요:\n\n1. github.com/settings/tokens 에서 생성\n2. "repo" 권한 체크 (중요!)\n3. 생성된 토큰 복사');
        let repo = prompt('대상 Repository 이름을 입력하세요:\n\n예시: 사용자명/저장소명\n(주의: GitHub에 저장소를 미리 만드셔야 합니다)');
        if (token && repo) {
            // Sanitize: extract 'username/repo' if full URL is given
            if (repo.includes('github.com/')) {
                repo = repo.split('github.com/')[1].replace(/\/$/, '');
            }
            await window.keepDB.put('settings', { id: 'githubToken', value: token });
            await window.keepDB.put('settings', { id: 'githubRepo', value: repo });
            this.repoSync = new RepoSync(token, repo);
            alert('설정 완료!');
        }
    }

    async syncAllWithRepo() {
        if (!this.repoSync) return alert('설정이 필요합니다.');
        alert('순차적으로 저장됩니다. (백그라운드)');

        // Sync labels first
        await this.repoSync.saveLabels(this.labels);

        for (const note of this.notes) {
            await this.repoSync.saveNote(note);
        }
        alert('전체 동기화 완료!');
    }

    async loadAllFromRepo() {
        if (!this.repoSync) return alert('설정이 필요합니다.');
        alert('데이터를 불러오는 중입니다. 잠시만 기다려 주세요...');

        // 1. Try to load from bundle first (One request for everything)
        const bundle = await this.repoSync.loadBundle();

        if (bundle) {
            // Load labels from bundle
            if (bundle.labels) {
                for (const label of bundle.labels) {
                    await window.keepDB.put('labels', label);
                }
            }
            // Load notes from bundle
            if (bundle.notes) {
                for (const note of bundle.notes) {
                    await window.keepDB.put('notes', note);
                }
            }
        } else {
            // 2. Fallback to individual requests (Slow)
            const labels = await this.repoSync.loadLabels();
            for (const label of labels) {
                await window.keepDB.put('labels', label);
            }
            const notes = await this.repoSync.loadAll();
            for (const note of notes) {
                await window.keepDB.put('notes', note);
            }
        }

        await this.loadData();
        this.renderLabels();
        this.renderNotes();
        alert('모든 데이터를 성공적으로 불러왔습니다!');
    }
    ivory

    // ========================================================================
    // Helpers
    // ========================================================================

    updateCharCounterExcludingImages(content, id) {
        // Exclude both base64 and relative media paths from char count
        const count = content.replace(/!\[.*?\]\(data:image\/[^)]+\)/g, '![img]').replace(/!\[.*?\]\(media\/[^)]+\)/g, '![img]').length;
        const el = document.getElementById(id);
        el.textContent = `${count.toLocaleString()} / 40,000`;
        if (count > 38000) el.classList.add('warning');
        else el.classList.remove('warning');
    }

    async updateFolderStatus(connected) {
        // No button to update anymore, but we could add a subtle indicator if needed
    }

    async ensureFolderConnection() {
        // Mobile or non-supported browsers
        if (!window.showDirectoryPicker) return false;

        // 1. If we have a handle, check/request permission
        if (this.directoryHandle) {
            const hasPermission = await this.verifyFolderPermission();
            if (hasPermission) return true;
        }

        // 2. Only on PC, if neither is connected, ask to select
        // Check if we are in a context where we want to ask (i.e. not mobile)
        if (!this.repoSync) {
            try {
                alert('이미지를 로컬 PC에 직접 저장하기 위해 [프로젝트 루트 폴더]를 선택해 주세요.\n(깃허브 동기화를 사용 중이라면 무시하셔도 됩니다.)');
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                if (handle.name === 'media') {
                    alert('주의: "media" 폴더가 아닌 상위 폴더를 선택해 주세요.');
                    return false;
                }
                this.directoryHandle = handle;
                await window.keepDB.put('settings', { id: 'directoryHandle', value: this.directoryHandle });
                await this.directoryHandle.getDirectoryHandle('media', { create: true });
                return true;
            } catch (err) {
                console.warn('Folder selection skipped/failed');
                return false;
            }
        }
        return false;
    }

    async verifyFolderPermission() {
        if (!this.directoryHandle) return false;

        // Check if we still have permission
        const options = { mode: 'readwrite' };
        if ((await this.directoryHandle.queryPermission(options)) === 'granted') {
            return true;
        }

        // Request permission (must be triggered by user gesture, but here we might be inside a click handler)
        try {
            if ((await this.directoryHandle.requestPermission(options)) === 'granted') {
                return true;
            }
        } catch (e) {
            console.error('Permission request failed', e);
        }
        return false;
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
        const sortedLabels = [...this.labels].sort((a, b) => a.name.localeCompare(b.name));

        sortedLabels.forEach(l => {
            const btn = document.createElement('button');
            btn.className = 'nav-item';
            btn.innerHTML = `<span>${l.name}</span>`;

            // View label notes
            btn.onclick = (e) => {
                this.currentFilter = l.id;
                this.currentView = 'notes';
                this.renderNotes();
            };

            // Context Menu (Right Click)
            btn.oncontextmenu = (e) => {
                e.preventDefault();
                this.showLabelContextMenu(l.id, e.clientX, e.clientY);
            };

            // Long Press (Touch)
            btn.ontouchstart = (e) => {
                this.longPressTimer = setTimeout(() => {
                    this.showLabelContextMenu(l.id, e.touches[0].clientX, e.touches[0].clientY);
                }, 600);
            };
            btn.ontouchend = () => clearTimeout(this.longPressTimer);
            btn.ontouchmove = () => clearTimeout(this.longPressTimer);

            list.appendChild(btn);
        });
    }

    showLabelContextMenu(id, x, y) {
        this.labelMenuContextId = id;
        const menu = document.getElementById('labelContextMenu');
        menu.style.display = 'block';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }

    hideLabelContextMenu() {
        const menu = document.getElementById('labelContextMenu');
        if (menu) menu.style.display = 'none';
        this.labelMenuContextId = null;
    }

    setupMarked() {
        const renderer = new marked.Renderer();
        const self = this;

        renderer.image = function (href, title, text) {
            // Check if this is a media folder image and if we have it in cache
            if (href.startsWith('media/')) {
                const filename = href.split('/').pop();
                if (self.mediaCache.has(filename)) {
                    href = self.mediaCache.get(filename);
                }
            }
            return `<img src="${href}" alt="${text || ''}" title="${title || ''}">`;
        };

        marked.setOptions({ renderer });
    }

    async renameLabel(id) {
        const label = this.labels.find(l => l.id === id);
        if (!label) return;
        const newName = prompt('라벨 이름 변경:', label.name);
        if (newName && newName !== label.name) {
            label.name = newName;
            await window.keepDB.put('labels', label);
            this.renderLabels();
            this.renderNotes(); // Update label names on cards if needed
        }
    }

    async deleteLabel(id) {
        if (!confirm('이 라벨을 삭제하시겠습니까? (메모는 삭제되지 않습니다)')) return;

        // Remove from memory
        this.labels = this.labels.filter(l => l.id !== id);

        // Remove from all notes
        this.notes.forEach(note => {
            if (note.labels.includes(id)) {
                note.labels = note.labels.filter(lid => lid !== id);
                this.saveNote(note);
            }
        });

        // Remove from DB
        await window.keepDB.delete('labels', id);

        if (this.currentFilter === id) this.currentFilter = null;

        this.renderLabels();
        this.renderNotes();
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
        const ext = file.name.split('.').pop() || 'png';
        const filename = `media_${Date.now()}.${ext}`;
        const reader = new FileReader();

        reader.onload = async (e) => {
            const base64Data = e.target.result;
            let savedLocally = false;
            let syncedToGithub = false;

            // Store in memory cache for immediate display (Crucial for GitHub Pages lag)
            this.mediaCache.set(filename, base64Data);

            // 1. Local Saving (Only if supported)
            if (window.showDirectoryPicker) {
                const isConnected = await this.ensureFolderConnection();
                if (isConnected && this.directoryHandle) {
                    try {
                        const mediaDir = await this.directoryHandle.getDirectoryHandle('media', { create: true });
                        const fileHandle = await mediaDir.getFileHandle(filename, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(file);
                        await writable.close();
                        savedLocally = true;
                    } catch (err) {
                        console.error('Local save failed', err);
                    }
                }
            }

            // 2. Sync to GitHub
            if (this.repoSync) {
                try {
                    console.log('Syncing image to GitHub...');
                    await this.repoSync.saveMedia(filename, base64Data);
                    syncedToGithub = true;
                } catch (err) {
                    console.error('GitHub sync failed', err);
                    alert('GitHub 이미지 전송 실패: ' + err.message);
                }
            }

            if (!savedLocally && !syncedToGithub) {
                alert('경고: 이미지가 저장되지 않았습니다. [동기화 설정]이나 [로컬 폴더 연결]이 필요합니다.');
            } else {
                console.log('Image saved successfully' + (syncedToGithub ? ' & synced' : ''));
            }

            // 3. Insert Markdown link
            const md = `\n![image](media/${filename})\n`;
            const tx = document.getElementById(this.editingNoteId ? 'modalNoteContent' : 'noteContent');
            const pos = tx.selectionStart;
            tx.value = tx.value.substring(0, pos) + md + tx.value.substring(pos);
            tx.dispatchEvent(new Event('input'));

            // Force re-render preview if visible
            if (this.editingNoteId) {
                const preview = document.getElementById('modalNotePreview');
                if (preview && document.getElementById('noteModal').classList.contains('preview-mode')) {
                    preview.innerHTML = DOMPurify.sanitize(marked.parse(tx.value));
                }
            }
        };
        reader.readAsDataURL(file);
    }

    renderModalLabelOptions() {
        const container = document.getElementById('modalLabelOptions');
        const note = this.notes.find(n => n.id === this.editingNoteId);
        if (!note || !container) return;

        container.innerHTML = '';
        if (this.labels.length === 0) {
            container.innerHTML = '<div class="label-option" style="padding: 10px;">라벨이 없습니다.</div>';
            return;
        }

        const sortedLabels = [...this.labels].sort((a, b) => a.name.localeCompare(b.name));

        sortedLabels.forEach(label => {
            const div = document.createElement('div');
            div.className = 'label-option';
            const isChecked = (note.labels || []).includes(label.id);

            div.innerHTML = `
                <input type="checkbox" id="label-${label.id}" ${isChecked ? 'checked' : ''}>
                <label for="label-${label.id}">${label.name}</label>
            `;

            div.querySelector('input').addEventListener('change', (e) => {
                if (!note.labels) note.labels = [];
                if (e.target.checked) {
                    if (!note.labels.includes(label.id)) note.labels.push(label.id);
                } else {
                    note.labels = note.labels.filter(id => id !== label.id);
                }
                note.updatedAt = new Date().toISOString();
                this.saveNote(note);
            });

            container.appendChild(div);
        });
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
            try {
                const data = JSON.parse(e.target.result);

                // Import labels first (small amount, can do all at once)
                if (data.labels && data.labels.length > 0) {
                    console.log(`Importing ${data.labels.length} labels...`);
                    for (const l of data.labels) {
                        await window.keepDB.put('labels', l);
                    }
                    console.log('Labels imported successfully');
                }

                // Import notes in batches to avoid memory issues
                if (data.notes && data.notes.length > 0) {
                    const BATCH_SIZE = 100;
                    const totalNotes = data.notes.length;
                    console.log(`Importing ${totalNotes} notes in batches of ${BATCH_SIZE}...`);

                    for (let i = 0; i < totalNotes; i += BATCH_SIZE) {
                        const batch = data.notes.slice(i, i + BATCH_SIZE);

                        // Process batch
                        for (const n of batch) {
                            await window.keepDB.put('notes', n);
                        }

                        // Progress update
                        const progress = Math.min(i + BATCH_SIZE, totalNotes);
                        console.log(`Progress: ${progress}/${totalNotes} notes imported`);

                        // Give browser a chance to breathe
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                    console.log('All notes imported successfully');
                }

                // Reload data from IndexedDB
                console.log('Reloading data from IndexedDB...');
                await this.loadData();

                // Render UI
                this.renderLabels();
                this.renderNotes();

                console.log('Import complete. Labels:', this.labels.length, 'Notes:', this.notes.length);
                alert(`데이터 불러오기 완료!\n라벨: ${this.labels.length}개\n메모: ${this.notes.length}개`);
            } catch (error) {
                console.error('Import failed:', error);
                alert('데이터 불러오기 실패: ' + error.message);
            }
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
