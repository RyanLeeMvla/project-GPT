const { ipcRenderer } = require('electron');

class GptUI {
    constructor() {
        this.currentPage = 'dashboard';
        this.isListening = false;
        this.isGptInitialized = false;
        this.chatMessages = [];
        this.projects = [];
        this.notes = [];
        this.webSpeechRecognition = null; // Browser-based speech recognition
        this.lastTranscript = '';
        
        // Hardcoded inventory system with persistence
        this.initializeInventory();
        
        // Adaptive Feature Generation System
        this.currentWorkflow = null;
        this.featureBackups = [];
        this.featureFlags = new Map();
    }

    async initialize() {
        console.log('🎨 Initializing GPT UI...');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup IPC listeners
        this.setupIPCListeners();
        
        // Auto-skip setup modal
        setTimeout(() => {
            const setupModal = document.getElementById('setupModal');
            if (setupModal) {
                setupModal.classList.add('hidden');
                console.log('🚀 Setup modal auto-hidden');
            }
        }, 1000);
        
        // Load initial data
        await this.loadDashboardData();
        
        // Check GPT status
        await this.updateStatus();
        
        console.log('✅ GPT UI initialized');
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = e.target.getAttribute('data-page');
                this.navigateToPage(page);
            });
        });

        // Voice control
        const voiceButton = document.getElementById('voiceButton');
        if (voiceButton) {
            voiceButton.addEventListener('click', () => {
                this.toggleVoiceListening();
            });
        }

        // Chat input
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendChatMessage();
                }
            });
        }

        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendChatMessage();
            });
        }

        const newProjectBtn = document.getElementById('newProjectBtn');
        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', () => {
                this.createNewProject();
            });
        }

        const newInventoryBtn = document.getElementById('newInventoryBtn');
        if (newInventoryBtn) {
            newInventoryBtn.addEventListener('click', () => {
                this.createNewInventoryItem();
            });
        }

        // Project view tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.getAttribute('data-view');
                this.switchProjectView(view);
            });
        });

        // Text fallback button
        const textFallbackBtn = document.getElementById('textFallback');
        if (textFallbackBtn) {
            textFallbackBtn.addEventListener('click', () => {
                this.showFallbackInput();
            });
        }

        console.log('✅ Event listeners setup complete');

        // Set up event delegation for dynamically created elements
        this.setupEventDelegation();
    }

    setupEventDelegation() {
        // Handle project item clicks
        document.addEventListener('click', (e) => {
            // Handle delete button clicks
            if (e.target.classList.contains('delete-btn')) {
                e.stopPropagation(); // Prevent project item click
                const projectId = e.target.getAttribute('data-project-id');
                if (projectId) {
                    this.deleteProject(projectId);
                }
                return;
            }

            // Handle project item clicks
            if (e.target.closest('.project-item')) {
                const projectId = e.target.closest('.project-item').getAttribute('data-project-id');
                if (projectId) {
                    this.openProject(projectId);
                }
                return;
            }

            // Handle task card clicks
            if (e.target.closest('.task-card')) {
                const projectId = e.target.closest('.task-card').getAttribute('data-project-id');
                if (projectId) {
                    this.openProject(projectId);
                }
                return;
            }
        });

        // Setup modal handlers
        const setupModal = document.getElementById('setupModal');
        if (setupModal) {
            const skipBtn = setupModal.querySelector('button[onclick*="Skip"]');
            if (skipBtn) {
                skipBtn.addEventListener('click', () => {
                    setupModal.classList.add('hidden');
                });
            }
            
            const completeBtn = setupModal.querySelector('button[onclick*="Complete"]');
            if (completeBtn) {
                completeBtn.addEventListener('click', () => {
                    setupModal.classList.add('hidden');
                });
            }
        }

        console.log('✅ Event delegation setup complete');
    }

    setupIPCListeners() {
        // Listen for GPT responses
        ipcRenderer.on('gpt-response', (event, data) => {
            this.handleGptResponse(data);
        });

        // Listen for navigation requests
        ipcRenderer.on('navigate-to', (event, page) => {
            this.navigateToPage(page);
        });

        // Listen for status updates
        ipcRenderer.on('status-update', (event, status) => {
            this.updateStatusDisplay(status);
        });
        
        // Listen for voice transcripts
        ipcRenderer.on('voice-transcript', (event, data) => {
            console.log('🎤 Received voice transcript:', data);
            this.hideRecordingIndicator();
            if (data.transcript && data.transcript.trim()) {
                this.showTranscript(data.transcript);
                this.showSuccess('Voice successfully transcribed!');
            } else {
                this.showError('No speech detected. Please try again.');
            }
        });
        
        // Listen for voice errors
        ipcRenderer.on('voice-error', (event, error) => {
            console.error('🎤 Voice error:', error);
            this.hideRecordingIndicator();
            this.showError('Voice recognition error: ' + error.message);
        });
        
        // Listen for project updates
        ipcRenderer.on('projects-updated', () => {
            console.log('📡 Received projects-updated broadcast, refreshing...');
            if (this.currentPage === 'projects') {
                this.loadProjects();
            }
            // Also update dashboard if we're there (for project counts)
            if (this.currentPage === 'dashboard') {
                this.loadDashboardData();
            }
        });
    }

    async navigateToPage(page) {
        console.log(`🔄 Navigating to: ${page}`);
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const pageNav = document.querySelector(`[data-page="${page}"]`);
        if (pageNav) {
            pageNav.classList.add('active');
        }

        // Hide all content
        document.querySelectorAll('.page-content').forEach(content => {
            content.classList.add('hidden');
        });

        // Show selected content
        const targetPage = document.getElementById(`${page}-content`);
        if (targetPage) {
            targetPage.classList.remove('hidden');
        }

        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            chat: 'Chat with GPT',
            projects: 'Project Management',
            fabrication: '3D Printing Control',
            inventory: 'Inventory Management',
            notes: 'Notes & Documentation',
            settings: 'Settings'
        };
        const titleElement = document.getElementById('pageTitle');
        if (titleElement) {
            titleElement.textContent = titles[page] || page;
        }

        this.currentPage = page;

        // Load page-specific data
        await this.loadPageData(page);
    }

    async loadPageData(page) {
        switch (page) {
            case 'dashboard':
                await this.loadDashboardData();
                break;
            case 'chat':
                await this.loadChatHistory();
                break;
            case 'projects':
                await this.loadProjects();
                break;
            case 'fabrication':
                await this.loadFabricationStatus();
                break;
            case 'inventory':
                await this.loadInventory();
                break;
            case 'notes':
                await this.loadNotes();
                break;
        }
    }

    async loadDashboardData() {
        try {
            const projects = await ipcRenderer.invoke('get-projects');
            
            // Update stats
            const activeProjectsEl = document.getElementById('activeProjects');
            if (activeProjectsEl) {
                activeProjectsEl.textContent = projects?.filter(p => p.status === 'active')?.length || 0;
            }
            
            console.log('📊 Dashboard data loaded');
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async loadProjects() {
        try {
            const projects = await ipcRenderer.invoke('get-projects');
            this.projects = projects || [];
            
            // If no projects exist, create a sample project for demo purposes
            if (this.projects.length === 0) {
                await this.createSampleProject();
                const updatedProjects = await ipcRenderer.invoke('get-projects');
                this.projects = updatedProjects || [];
            }
            
            this.renderProjects();
            this.renderKanbanBoard(this.projects);
        } catch (error) {
            console.error('Error loading projects:', error);
            this.renderProjectsError();
        }
    }

    async createSampleProject() {
        try {
            const sampleProject = {
                name: "Sample Project",
                description: "This is a demo project to showcase basic functionality",
                type: "software",
                status: "in_progress",
                priority: 2,
                progress: 25,
                tags: "demo, sample, test"
            };

            await ipcRenderer.invoke('create-project', sampleProject);

            console.log('📝 Sample project created for demo');
        } catch (error) {
            console.error('Error creating sample project:', error);
        }
    }

    renderProjects() {
        const projectsList = document.getElementById('projectsList');
        if (!projectsList) return;
        
        if (this.projects.length === 0) {
            projectsList.innerHTML = `
                <div class="project-item" style="text-align: center; color: #666;">
                    No projects yet. Create your first project!
                </div>
            `;
            return;
        }

        projectsList.innerHTML = this.projects.map(project => `
            <div class="project-item" data-project-id="${project.id}">
                <div class="project-content">
                    <div class="project-name">${project.name}</div>
                    <div class="project-meta">
                        ${project.type} • ${project.status} • 
                        Created: ${new Date(project.created_at).toLocaleDateString()}
                    </div>
                </div>
                <div class="project-actions">
                    <button class="delete-btn" data-project-id="${project.id}" style="background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Delete</button>
                </div>
            </div>
        `).join('');
    }

    renderKanbanBoard(projects) {
        const columns = {
            planning: projects.filter(p => p.status === 'planning'),
            in_progress: projects.filter(p => p.status === 'in_progress'),
            review: projects.filter(p => p.status === 'review'),
            completed: projects.filter(p => p.status === 'completed')
        };

        Object.keys(columns).forEach(status => {
            const columnId = status === 'in_progress' ? 'progressTasks' : 
                           status === 'planning' ? 'planningTasks' :
                           status === 'review' ? 'reviewTasks' : 'completedTasks';
            
            const container = document.getElementById(columnId);
            
            if (!container) {
                console.error(`Kanban container not found: ${columnId}`);
                return;
            }
            
            if (columns[status].length === 0) {
                container.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">No projects</div>';
                return;
            }

            container.innerHTML = columns[status].map(project => `
                <div class="task-card" data-project-id="${project.id}">
                    <div class="task-content">
                        <div class="task-title">${project.name}</div>
                        <div class="task-meta">
                            ${project.type} • Priority: ${project.priority || 1}
                        </div>
                        <div class="task-meta">
                            Created: ${new Date(project.created_at).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            `).join('');

            // Event delegation handles all interactions now
        });
    }

    renderProjectsError() {
        const projectsList = document.getElementById('projectsList');
        if (projectsList) {
            projectsList.innerHTML = `
                <div class="project-item" style="text-align: center; color: #ff4444;">
                    Error loading projects. Please try again.
                </div>
            `;
        }
    }

    async loadInventory() {
        try {
            const inventoryList = document.getElementById('inventoryList');
            if (inventoryList) {
                if (this.inventory.length === 0) {
                    inventoryList.innerHTML = `
                        <div class="inventory-item" style="text-align: center; color: #666;">
                            No inventory items yet. Add items using voice commands!
                        </div>
                    `;
                } else {
                    inventoryList.innerHTML = this.inventory.map(item => `
                        <div class="inventory-item" data-item-id="${item.id}">
                            <div class="item-info">
                                <div class="item-name">${item.name}</div>
                                <div class="item-meta">
                                    ${item.category} • ${item.quantity} ${item.unit} • ${item.location}
                                </div>
                                <div class="item-supplier">Supplier: ${item.supplier}</div>
                            </div>
                            <div class="item-actions">
                                <button onclick="window.gptUI.editInventoryItem(${item.id})" class="btn-small">Edit</button>
                                <button onclick="window.gptUI.removeInventoryItem(${item.id})" class="btn-small btn-danger">Remove</button>
                            </div>
                        </div>
                    `).join('');
                }
            }
            
            // Update inventory stats
            const totalItems = document.getElementById('totalItems');
            if (totalItems) {
                totalItems.textContent = this.inventory.length;
            }
            
            const lowStockItems = document.getElementById('lowStockItems');
            if (lowStockItems) {
                const lowStock = this.inventory.filter(item => item.quantity <= 2);
                lowStockItems.textContent = lowStock.length;
            }
            
        } catch (error) {
            console.error('Error loading inventory:', error);
        }
    }

    async loadNotes() {
        try {
            const notesList = document.getElementById('notesList');
            if (notesList) {
                // Fetch notes from the backend
                const notesResponse = await ipcRenderer.invoke('get-notes', null);

                if (notesResponse && notesResponse.notes && notesResponse.notes.length > 0) {
                    // Display the notes
                    notesList.innerHTML = notesResponse.notes.map(note => `
                        <div class="project-item note-item" data-note-id="${note.id}">
                            <div class="note-header">
                                <strong>${note.content}</strong>
                                <span class="note-date">${new Date(note.created_at || note.timestamp).toLocaleDateString()}</span>
                            </div>
                            ${note.context ? `<div class="note-context">${note.context}</div>` : ''}
                            ${note.tags ? `<div class="note-tags">${note.tags}</div>` : ''}
                            <div class="note-actions">
                                <button class="btn-edit" onclick="window.gptUI.editNote(${note.id})">Edit</button>
                                <button class="btn-delete" onclick="window.gptUI.deleteNote(${note.id})">Delete</button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    // No notes found
                    notesList.innerHTML = `
                        <div class="project-item" style="text-align: center; color: #666;">
                            No notes yet. Use voice commands to create notes!
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Error loading notes:', error);
            const notesList = document.getElementById('notesList');
            if (notesList) {
                notesList.innerHTML = `
                    <div class="project-item" style="text-align: center; color: #ff6b6b;">
                        Error loading notes. Please try again.
                    </div>
                `;
            }
        }
    }

    async loadFabricationStatus() {
        try {
            const printerStatus = document.getElementById('printerStatus');
            if (printerStatus) {
                printerStatus.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-value">Not Connected</div>
                        <div class="stat-label">Bambu Lab Printer</div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading fabrication status:', error);
        }
    }

    async loadChatHistory() {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;
        
        // Add existing messages from memory
        if (this.chatMessages.length > 0) {
            messagesContainer.innerHTML = this.chatMessages.map(msg => 
                this.createMessageHTML(msg)
            ).join('');
        }
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async toggleVoiceListening() {
        try {
            if (this.isListening) {
                this.stopBrowserSpeechRecognition();
                this.isListening = false;
                this.updateVoiceButton();
                this.hideRecordingIndicator();
            } else {
                const started = this.startBrowserSpeechRecognition();
                if (started) {
                    this.isListening = true;
                    this.updateVoiceButton();
                    this.showRecordingIndicator();
                } else {
                    this.showError('Speech recognition not supported in this browser');
                }
            }
        } catch (error) {
            console.error('Error toggling voice listening:', error);
            this.showError('Failed to toggle voice listening: ' + error.message);
        }
    }

    startBrowserSpeechRecognition() {
        // Check if Web Speech API is available
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error('Web Speech API not supported');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.webSpeechRecognition = new SpeechRecognition();
        
        // Configure recognition
        this.webSpeechRecognition.continuous = false; // Stop after one result
        this.webSpeechRecognition.interimResults = true;
        this.webSpeechRecognition.lang = 'en-US';
        this.webSpeechRecognition.maxAlternatives = 1;

        // Event handlers
        this.webSpeechRecognition.onstart = () => {
            console.log('🎤 Browser speech recognition started');
            this.showRecordingIndicator();
        };

        this.webSpeechRecognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Show interim results
            if (interimTranscript) {
                this.showTranscript(`${finalTranscript}${interimTranscript}`, false);
            }

            // Process final result
            if (finalTranscript.trim()) {
                console.log(`🎤 Final transcript: "${finalTranscript}"`);
                this.lastTranscript = finalTranscript.trim();
                this.showTranscript(this.lastTranscript, true);
                this.hideRecordingIndicator();
                this.isListening = false;
                this.updateVoiceButton();
            }
        };

        this.webSpeechRecognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.hideRecordingIndicator();
            this.isListening = false;
            this.updateVoiceButton();
            
            let errorMessage = 'Speech recognition error';
            let showRetry = true;
            
            switch(event.error) {
                case 'network':
                    errorMessage = 'Network error. Please check your internet connection and try again.';
                    break;
                case 'no-speech':
                    errorMessage = 'No speech detected. Please try again and speak clearly.';
                    break;
                case 'audio-capture':
                    errorMessage = 'Microphone not accessible. Please check permissions.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Microphone access denied. Please allow microphone access and refresh the page.';
                    showRetry = false;
                    break;
                case 'service-not-allowed':
                    errorMessage = 'Speech service not allowed. Try using the text input instead.';
                    showRetry = false;
                    break;
                default:
                    errorMessage = `Speech recognition error: ${event.error}. Try using the text input below.`;
            }
            
            this.showError(errorMessage);
            
            // Offer alternative input method
            if (event.error === 'network' || event.error === 'service-not-allowed') {
                this.showFallbackInput();
            }
        };

        this.webSpeechRecognition.onend = () => {
            console.log('🎤 Speech recognition ended');
            this.hideRecordingIndicator();
            this.isListening = false;
            this.updateVoiceButton();
        };

        // Start recognition
        try {
            this.webSpeechRecognition.start();
            return true;
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            this.showFallbackInput();
            return false;
        }
    }

    showFallbackInput() {
        // Show the "Type Instead" button
        const textFallbackBtn = document.getElementById('textFallback');
        if (textFallbackBtn) {
            textFallbackBtn.style.display = 'inline-block';
        }
        
        // Show a simple input dialog as fallback
        setTimeout(() => {
            const userInput = prompt('Voice recognition failed. Please type your message:');
            if (userInput && userInput.trim()) {
                this.showTranscript(userInput.trim(), true);
                this.showSuccess('Message entered successfully!');
            }
            // Hide the fallback button after use
            if (textFallbackBtn) {
                textFallbackBtn.style.display = 'none';
            }
        }, 500);
    }

    stopBrowserSpeechRecognition() {
        if (this.webSpeechRecognition) {
            this.webSpeechRecognition.stop();
            this.webSpeechRecognition = null;
        }
    }

    updateVoiceButton() {
        const voiceButton = document.getElementById('voiceButton');
        const voiceStatus = document.getElementById('voiceStatus');
        
        if (voiceButton) {
            if (this.isListening) {
                voiceButton.classList.add('listening');
                voiceButton.textContent = '🔴';
            } else {
                voiceButton.classList.remove('listening');
                voiceButton.textContent = '🎤';
            }
        }
        
        if (voiceStatus) {
            voiceStatus.textContent = this.isListening ? 'Listening...' : 'Ready to listen';
        }
    }

    showRecordingIndicator() {
        const indicator = document.getElementById('recordingIndicator');
        if (indicator) {
            indicator.textContent = '🎙️ Recording... Speak now!';
            indicator.classList.add('active');
        }
        
        this.clearTranscriptPreview();
    }

    hideRecordingIndicator() {
        const indicator = document.getElementById('recordingIndicator');
        if (indicator) {
            indicator.classList.remove('active');
        }
    }

    showTranscript(transcript, isFinal = true) {
        const preview = document.getElementById('transcriptPreview');
        const sendBtn = document.getElementById('sendToChat');
        const clearBtn = document.getElementById('clearTranscript');
        
        if (preview) {
            preview.textContent = transcript;
            preview.classList.add('has-content');
            
            // Add visual indicator for interim vs final results
            if (!isFinal) {
                preview.style.fontStyle = 'italic';
                preview.style.opacity = '0.7';
            } else {
                preview.style.fontStyle = 'normal';
                preview.style.opacity = '1';
            }
        }
        
        // Only show action buttons for final results
        if (isFinal) {
            if (sendBtn) {
                sendBtn.style.display = 'inline-block';
                sendBtn.onclick = () => this.sendTranscriptToChat(transcript);
            }
            
            if (clearBtn) {
                clearBtn.style.display = 'inline-block';
                clearBtn.onclick = () => this.clearTranscriptPreview();
            }
            
            // Auto-send to chat after a short delay (unless user clears it)
            setTimeout(() => {
                if (preview.classList.contains('has-content') && preview.textContent === transcript) {
                    this.sendTranscriptToChat(transcript);
                }
            }, 3000);
        }
    }

    clearTranscriptPreview() {
        const preview = document.getElementById('transcriptPreview');
        const sendBtn = document.getElementById('sendToChat');
        const clearBtn = document.getElementById('clearTranscript');
        
        if (preview) {
            preview.textContent = 'Transcript will appear here...';
            preview.classList.remove('has-content');
            preview.style.fontStyle = 'italic';
            preview.style.opacity = '1';
        }
        
        if (sendBtn) sendBtn.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
    }

    async sendTranscriptToChat(transcript) {
        try {
            // Navigate to chat page if not already there
            if (this.currentPage !== 'chat') {
                await this.navigateToPage('chat');
            }
            
            // Add transcript as user message and send to GPT
            this.addChatMessage({
                sender: 'user',
                message: transcript,
                timestamp: new Date().toISOString()
            });
            
            // Send to GPT
            const response = await ipcRenderer.invoke('send-command', transcript);
            this.handleGptResponse({
                command: transcript,
                response: response,
                timestamp: new Date().toISOString()
            });
            
            // Clear the transcript preview
            this.clearTranscriptPreview();
            
            // Show success feedback
            this.showSuccess('Voice message sent to GPT successfully!');
            
        } catch (error) {
            console.error('Error sending transcript to chat:', error);
            this.showError('Failed to send voice message to chat');
        }
    }

    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        
        const message = input.value.trim();
        if (!message) return;
        
        // Clear input
        input.value = '';
        
        // Add user message to chat
        this.addChatMessage({
            sender: 'user',
            message: message,
            timestamp: new Date().toISOString()
        });
        
        // Send to GPT
        try {
            const response = await ipcRenderer.invoke('send-command', message, { modelType: 'chat' });
            this.handleGptResponse({
                command: message,
                response: response,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error sending message to GPT:', error);
            this.addChatMessage({
                sender: 'gpt',
                message: 'Sorry, I encountered an error processing your request.',
                timestamp: new Date().toISOString()
            });
        }
    }

    handleGptResponse(data) {
        const responseMessage = this.extractResponse(data.response);
        
        // Check if we're in a feature generation workflow
        if (this.currentWorkflow) {
            this.handleWorkflowContinuation(data.command, responseMessage);
            return;
        }
        
        // Check for feature generation intent (but let GPT decide everything)
        this.checkFeatureGenerationIntent(data.command, responseMessage);
        
        // Process normal chat response
        this.addChatMessage({
            sender: 'gpt',
            message: responseMessage,
            timestamp: data.timestamp || new Date().toISOString()
        });
        
        // Check if this is an inventory command and process it locally
        if (data.command) {
            const inventoryResponse = this.processInventoryCommand(data.command);
            if (inventoryResponse) {
                this.addChatMessage({
                    sender: 'gpt',
                    message: inventoryResponse,
                    timestamp: data.timestamp
                });
                return;
            }
        }
        
        // Check if this was a project management or inventory command and refresh
        const projectKeywords = ['project', 'move', 'stage', 'status', 'create', 'update', 'planning', 'testing', 'completed'];
        const inventoryKeywords = ['inventory', 'add', 'remove', 'stock', 'pla', 'petg', 'filament', 'nozzle'];
        const command = data.command ? data.command.toLowerCase() : '';
        const response = data.response ? (data.response.message || data.response).toLowerCase() : '';
        
        const isProjectCommand = projectKeywords.some(keyword => 
            command.includes(keyword) || response.includes(keyword)
        );
        
        const isInventoryCommand = inventoryKeywords.some(keyword => 
            command.includes(keyword) || response.includes(keyword)
        );
        
        if (isProjectCommand) {
            console.log('🔄 Project command detected, refreshing projects...');
            // Refresh projects if we're on the projects page
            if (this.currentPage === 'projects') {
                // Immediate refresh for better responsiveness
                this.loadProjects();
                // Also add a delayed refresh to ensure DB changes are reflected
                setTimeout(() => this.loadProjects(), 1000);
            }
        }
        
        if (isInventoryCommand) {
            console.log('📦 Inventory command detected, refreshing inventory...');
            // Refresh inventory if we're on that page
            if (this.currentPage === 'inventory') {
                this.loadInventory();
            }
        }
        
        // Update current page if we're on chat
        if (this.currentPage === 'chat') {
            this.loadChatHistory();
        }
    }

    addChatMessage(messageData) {
        this.chatMessages.push(messageData);
        
        // Keep only last 100 messages
        if (this.chatMessages.length > 100) {
            this.chatMessages = this.chatMessages.slice(-100);
        }
        
        // If we're on the chat page, update the display
        if (this.currentPage === 'chat') {
            const messagesContainer = document.getElementById('chatMessages');
            if (messagesContainer) {
                messagesContainer.innerHTML += this.createMessageHTML(messageData);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
    }

    createMessageHTML(messageData) {
        const time = new Date(messageData.timestamp).toLocaleTimeString();
        const senderClass = messageData.sender === 'user' ? 'user' : 'gpt';
        const senderName = messageData.sender === 'user' ? 'You' : 'GPT';
        
        return `
            <div class="message ${senderClass}">
                <div class="message-header">${senderName} - ${time}</div>
                <div>${this.escapeHtml(messageData.message)}</div>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async createNewProject() {
        // Simple project creation dialog
        const projectName = prompt('Enter project name:');
        if (!projectName) return;
        
        const projectType = prompt('Enter project type (general, 3d-printing, development):') || 'general';
        
        try {
            const project = await ipcRenderer.invoke('create-project', {
                name: projectName,
                type: projectType,
                description: `Created via GPT UI on ${new Date().toLocaleDateString()}`
            });
            
            if (project) {
                this.showSuccess(`Project "${projectName}" created successfully!`);
                await this.loadProjects();
            }
        } catch (error) {
            console.error('Error creating project:', error);
            this.showError('Failed to create project');
        }
    }

    async createNewInventoryItem() {
        // Simple inventory item creation dialog
        const itemName = prompt('Enter item name (e.g., "1kg White PLA"):');
        if (!itemName) return;
        
        const quantity = prompt('Enter quantity:', '1');
        if (!quantity || isNaN(quantity)) return;
        
        const unit = prompt('Enter unit (kg, pcs, bottle, etc.):', 'pcs');
        const supplier = prompt('Enter supplier:', 'Bambu Lab');
        
        try {
            const itemData = {
                name: itemName,
                quantity: quantity,
                unit: unit || 'pcs',
                supplier: supplier || 'Bambu Lab'
            };
            
            const newItem = this.addInventoryItem(itemData);
            this.showSuccess(`Item "${itemName}" added to inventory successfully!`);
            
        } catch (error) {
            console.error('Error creating inventory item:', error);
            this.showError('Failed to create inventory item');
        }
    }

    async openProject(projectId) {
        console.log('Opening project:', projectId);
        this.showInfo(`Project ${projectId} selected`);
    }

    async deleteProject(projectId) {
        // Confirm deletion
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }

        try {
            const result = await ipcRenderer.invoke('delete-project', projectId);
            
            if (result.success) {
                this.showSuccess('Project deleted successfully');
                
                // Refresh the projects list
                await this.loadProjects();
                
                // Update dashboard if we're there
                if (this.currentPage === 'dashboard') {
                    this.loadDashboardData();
                }
            } else {
                this.showError('Failed to delete project');
            }
        } catch (error) {
            console.error('Error deleting project:', error);
            this.showError('Failed to delete project: ' + error.message);
        }
    }

    // Hardcoded inventory system with persistence
    initializeInventory() {
        // Try to load existing inventory from localStorage
        const savedInventory = localStorage.getItem('gpt-inventory');
        const savedNextId = localStorage.getItem('gpt-inventory-next-id');
        
        if (savedInventory) {
            // Load from storage
            this.inventory = JSON.parse(savedInventory);
            this.nextInventoryId = savedNextId ? parseInt(savedNextId) : 6;
            console.log('📦 Loaded inventory from localStorage:', this.inventory.length, 'items');
        } else {
            // Initialize with default items only if no saved data exists
            this.inventory = [
                { id: 1, name: '1kg White PLA', category: 'raw_material', quantity: 5, unit: 'kg', location: 'Storage A', supplier: 'Bambu Lab' },
                { id: 2, name: '1kg Black PLA', category: 'raw_material', quantity: 3, unit: 'kg', location: 'Storage A', supplier: 'Bambu Lab' },
                { id: 3, name: '1kg PETG Clear', category: 'raw_material', quantity: 2, unit: 'kg', location: 'Storage B', supplier: 'Bambu Lab' },
                { id: 4, name: 'Nozzle 0.4mm', category: 'component', quantity: 10, unit: 'pcs', location: 'Toolbox', supplier: 'Bambu Lab' },
                { id: 5, name: 'Print Bed Adhesive', category: 'tool', quantity: 1, unit: 'bottle', location: 'Workbench', supplier: 'Generic' }
            ];
            this.nextInventoryId = 6;
            this.saveInventoryToStorage();
            console.log('📦 Initialized inventory with default items');
        }
    }

    saveInventoryToStorage() {
        try {
            localStorage.setItem('gpt-inventory', JSON.stringify(this.inventory));
            localStorage.setItem('gpt-inventory-next-id', this.nextInventoryId.toString());
            console.log('💾 Saved inventory to localStorage');
        } catch (error) {
            console.error('Error saving inventory to localStorage:', error);
        }
    }

    // Hardcoded inventory management methods
    addInventoryItem(itemData) {
        const newItem = {
            id: this.nextInventoryId++,
            name: itemData.name,
            category: itemData.category || 'raw_material',
            quantity: parseInt(itemData.quantity) || 1,
            unit: itemData.unit || 'pcs',
            location: itemData.location || 'Storage',
            supplier: itemData.supplier || 'Unknown'
        };
        
        this.inventory.push(newItem);
        this.saveInventoryToStorage(); // Save changes
        console.log('📦 Added inventory item:', newItem);
        
        // Refresh inventory display if we're on that page
        if (this.currentPage === 'inventory') {
            this.loadInventory();
        }
        
        return newItem;
    }

    editInventoryItem(itemId) {
        const item = this.inventory.find(i => i.id === itemId);
        if (!item) {
            this.showError('Item not found');
            return;
        }

        const newQuantity = prompt(`Enter new quantity for ${item.name}:`, item.quantity);
        if (newQuantity !== null && !isNaN(newQuantity)) {
            item.quantity = parseInt(newQuantity);
            this.saveInventoryToStorage(); // Save changes
            this.loadInventory();
            this.showSuccess(`Updated quantity for ${item.name}`);
        }
    }

    removeInventoryItem(itemId) {
        const item = this.inventory.find(i => i.id === itemId);
        if (!item) {
            this.showError('Item not found');
            return;
        }

        if (confirm(`Are you sure you want to remove ${item.name} from inventory?`)) {
            this.inventory = this.inventory.filter(i => i.id !== itemId);
            this.saveInventoryToStorage(); // Save changes
            this.loadInventory();
            this.showSuccess(`Removed ${item.name} from inventory`);
        }
    }

    // Hardcoded command processing for inventory
    processInventoryCommand(command) {
        const lowerCommand = command.toLowerCase();
        
        // Parse "add [quantity] [unit] [name] from [supplier] to inventory"
        const addMatch = lowerCommand.match(/add (\d+)(?:\s*(\w+))?\s+(.+?)\s+(?:from\s+(.+?)\s+)?to\s+inventory/);
        if (addMatch) {
            const [, quantity, unit, name, supplier] = addMatch;
            
            // Determine category based on name
            let category = 'raw_material';
            if (name.includes('pla') || name.includes('petg') || name.includes('filament')) {
                category = 'raw_material';
            } else if (name.includes('nozzle') || name.includes('extruder') || name.includes('hotend')) {
                category = 'component';
            } else if (name.includes('adhesive') || name.includes('tool') || name.includes('scraper')) {
                category = 'tool';
            }
            
            const itemData = {
                name: name.trim(),
                category: category,
                quantity: quantity,
                unit: unit || (category === 'raw_material' ? 'kg' : 'pcs'),
                supplier: supplier || 'Bambu Lab',
                location: category === 'raw_material' ? 'Storage A' : 'Toolbox'
            };
            
            const newItem = this.addInventoryItem(itemData);
            return `Successfully added ${quantity} ${itemData.unit} of ${name} to inventory. Item ID: ${newItem.id}`;
        }
        
        return null; // Command not recognized as inventory command
    }

    async updateStatus() {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        
        if (!statusText || !statusDot) return;
        
        try {
            const isConfigured = await ipcRenderer.invoke('check-gpt-status');
            
            if (isConfigured) {
                statusText.textContent = 'Online';
                statusDot.className = 'status-dot online';
            } else {
                statusText.textContent = 'Not Configured';
                statusDot.className = 'status-dot offline';
            }
        } catch (error) {
            console.error('Error checking GPT status:', error);
            statusText.textContent = 'Error';
            statusDot.className = 'status-dot offline';
        }
    }

    updateStatusDisplay(status) {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        
        if (!statusText || !statusDot) return;
        
        if (status.isInitialized) {
            statusText.textContent = status.isListening ? 'Listening' : 'Online';
            statusDot.className = status.isListening ? 'status-dot listening' : 'status-dot';
        } else {
            statusText.textContent = 'Initializing...';
            statusDot.className = 'status-dot offline';
        }
        
        this.isListening = status.isListening || false;
        this.updateVoiceButton();
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    showNotification(message, type = 'info') {
        // Create a simple notification system
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 2000;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    switchProjectView(view) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-view="${view}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Hide all views
        document.querySelectorAll('.project-view').forEach(view => {
            view.classList.add('hidden');
        });

        // Show selected view
        const targetView = document.getElementById(`projects-${view}-view`);
        if (targetView) {
            targetView.classList.remove('hidden');
        }

        // Load appropriate data
        switch(view) {
            case 'list':
                this.loadProjects();
                break;
            case 'timeline':
                this.loadProjectTimeline();
                break;
            case 'kanban':
                this.loadKanbanBoard();
                break;
        }
    }

    async loadProjectTimeline() {
        try {
            const timelineContent = document.getElementById('timelineContent');
            if (timelineContent) {
                timelineContent.innerHTML = `
                    <div style="text-align: center; color: #666; padding: 40px;">
                        No timeline events yet. Create a project to get started!
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading timeline:', error);
        }
    }

    async loadKanbanBoard() {
        try {
            const projects = await ipcRenderer.invoke('get-projects');
            this.renderKanbanBoard(projects || []);
        } catch (error) {
            console.error('Error loading kanban board:', error);
        }
    }

    // ==================== ADAPTIVE FEATURE GENERATION SYSTEM ====================
    
    // Extract response safely
    extractResponse(response) {
        if (typeof response === 'string') {
            return response;
        } else if (response && response.message) {
            return response.message;
        } else if (response && response.result) {
            return response.result;
        } else if (response && response.text) {
            return response.text;
        } else if (response && typeof response === 'object') {
            return JSON.stringify(response);
        }
        return 'I received your message and processed it successfully.';
    }

    // Let GPT decide if this is a feature request and how to respond
    async checkFeatureGenerationIntent(userInput, gptResponse) {
        const intentPrompt = `
        CONTEXT: You are an AI assistant that can generate features for applications in real-time.
        
        USER INPUT: "${userInput}"
        YOUR RESPONSE: "${gptResponse}"
        
        ANALYSIS TASK:
        1. Is the user requesting a NEW FEATURE to be built/added to their application?
        2. Should you offer to generate this feature?
        
        Feature requests include:
        - Adding new functionality that doesn't exist
        - Making elements interactive (draggable, clickable, etc.)
        - Creating new UI components  
        - Adding integrations
        - Enhancing existing features
        
        NOT feature requests:
        - General questions about existing features
        - Using current functionality
        - Asking for information
        
        RESPOND WITH:
        If this IS a feature request: "START_WORKFLOW: [natural conversational response asking if they want you to build this feature]"
        If this is NOT a feature request: "NORMAL_CHAT"
        
        Make your response sound natural and human-like, as if you're Jarvis talking to Tony Stark.
        `;
        
        try {
            const intentResponse = await ipcRenderer.invoke('send-command', intentPrompt, { modelType: 'chat' });
            const intentResult = this.extractResponse(intentResponse);
            
            if (intentResult.startsWith('START_WORKFLOW:')) {
                const conversationalResponse = intentResult.replace('START_WORKFLOW:', '').trim();
                
                // Start workflow with GPT's natural response
                this.currentWorkflow = {
                    stage: 'initial',
                    originalInput: userInput,
                    conversationHistory: [
                        { role: 'user', content: userInput },
                        { role: 'assistant', content: conversationalResponse }
                    ]
                };
                
                this.addChatMessage({
                    sender: 'gpt',
                    message: conversationalResponse,
                    timestamp: new Date().toISOString(),
                    isWorkflowMessage: true
                });
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('Intent analysis failed:', error);
            return false;
        }
    }

    // Continue workflow with completely dynamic GPT responses
    async handleWorkflowContinuation(userInput, originalGptResponse) {
        // Add user input to conversation history
        this.currentWorkflow.conversationHistory.push({
            role: 'user',
            content: userInput
        });
        
        // Build conversation context for GPT
        const workflowPrompt = `
        CONTEXT: You are an AI assistant conducting a feature generation workflow. You can actually build features for applications in real-time.
        
        CONVERSATION HISTORY:
        ${this.currentWorkflow.conversationHistory.map(msg => 
            `${msg.role.toUpperCase()}: ${msg.content}`
        ).join('\n')}
        
        WORKFLOW STAGES (current stage: ${this.currentWorkflow.stage}):
        1. initial - You offered to build a feature, waiting for user confirmation
        2. gathering - Getting details about what they want
        3. planning - Confirming implementation approach
        4. executing - Actually generating the feature
        5. complete - Feature has been built
        
        YOUR TASK:
        Respond naturally to continue this conversation. You can:
        - Ask clarifying questions about the feature
        - Confirm what you understand
        - Explain what you'll build
        - Ask for permission to proceed
        - Cancel if user wants to stop
        
        SPECIAL COMMANDS:
        If you're ready to generate the feature, end your response with: "EXECUTE_FEATURE_GENERATION"
        If the user wants to cancel, end your response with: "CANCEL_WORKFLOW"
        If you need to gather more info, end with: "CONTINUE_GATHERING"
        If you're confirming the plan, end with: "CONFIRM_PLAN"
        
        Respond like Jarvis - intelligent, helpful, conversational, and slightly witty.
        `;
        
        try {
            const workflowResponse = await ipcRenderer.invoke('send-command', workflowPrompt, { modelType: 'chat' });
            const response = this.extractResponse(workflowResponse);
            
            // Extract command and clean response
            let cleanResponse = response;
            let command = null;
            
            const commands = ['EXECUTE_FEATURE_GENERATION', 'CANCEL_WORKFLOW', 'CONTINUE_GATHERING', 'CONFIRM_PLAN'];
            for (const cmd of commands) {
                if (response.includes(cmd)) {
                    command = cmd;
                    cleanResponse = response.replace(cmd, '').trim();
                    break;
                }
            }
            
            // Add GPT response to conversation
            this.currentWorkflow.conversationHistory.push({
                role: 'assistant',
                content: cleanResponse
            });
            
            // Display the response
            this.addChatMessage({
                sender: 'gpt',
                message: cleanResponse,
                timestamp: new Date().toISOString(),
                isWorkflowMessage: true
            });
            
            // Execute commands
            await this.executeWorkflowCommand(command);
            
        } catch (error) {
            console.error('Workflow continuation failed:', error);
            this.addChatMessage({
                sender: 'gpt',
                message: "I encountered an error continuing our conversation. Let's start over - what would you like me to help you build?",
                timestamp: new Date().toISOString(),
                isWorkflowMessage: true
            });
        }
    }

    async executeWorkflowCommand(command) {
        switch (command) {
            case 'EXECUTE_FEATURE_GENERATION':
                await this.executeFeatureGeneration();
                break;
                
            case 'CANCEL_WORKFLOW':
                this.currentWorkflow = null;
                break;
                
            case 'CONTINUE_GATHERING':
                this.currentWorkflow.stage = 'gathering';
                break;
                
            case 'CONFIRM_PLAN':
                this.currentWorkflow.stage = 'planning';
                break;
        }
    }

    async executeFeatureGeneration() {
        this.currentWorkflow.stage = 'executing';
        
        // Show "Rewriting App" UI
        this.showFeatureGenerationUI();
        
        try {
            // Extract the missing action type from conversation
            const actionType = this.extractActionType();
            
            console.log('🔧 Executing real code generation for:', actionType);
            
            // Call the backend code rewriter
            const rewriteResult = await ipcRenderer.invoke('rewrite-code', 
                this.currentWorkflow.conversationHistory, 
                actionType
            );
            
            this.hideFeatureGenerationUI();
            
            if (rewriteResult.success) {
                // Show success message
                this.addChatMessage({
                    sender: 'gpt',
                    message: `✅ Successfully implemented ${actionType} functionality! ${rewriteResult.description}`,
                    timestamp: new Date().toISOString(),
                    isWorkflowMessage: true
                });
                
                if (rewriteResult.needsRestart) {
                    this.addChatMessage({
                        sender: 'gpt',
                        message: "🔄 The application needs to be restarted to use the new feature. Please restart the app.",
                        timestamp: new Date().toISOString(),
                        isWorkflowMessage: true
                    });
                } else {
                    // Try to refresh the current page to load new functionality
                    await this.refreshCurrentPage();
                }
                
            } else {
                throw new Error(rewriteResult.error || 'Code generation failed');
            }
            
            this.currentWorkflow = null;
            
        } catch (error) {
            this.hideFeatureGenerationUI();
            
            console.error('❌ Feature generation failed:', error);
            
            this.addChatMessage({
                sender: 'gpt',
                message: `❌ Failed to generate the feature: ${error.message}. The codebase remains unchanged.`,
                timestamp: new Date().toISOString(),
                isWorkflowMessage: true
            });
            
            this.currentWorkflow = null;
        }
    }

    extractActionType() {
        // Extract the action type from the conversation history
        const conversation = this.currentWorkflow.conversationHistory.map(msg => msg.content).join(' ');
        
        // Look for common action patterns
        if (conversation.includes('note') || conversation.includes('add note')) {
            return 'note_taking';
        } else if (conversation.includes('task') || conversation.includes('todo')) {
            return 'task_management';
        } else if (conversation.includes('file') || conversation.includes('document')) {
            return 'file_management';
        } else {
            // Try to extract from the original input
            const firstUserMessage = this.currentWorkflow.conversationHistory.find(msg => msg.role === 'user');
            return firstUserMessage ? firstUserMessage.content.split(' ')[0] + '_feature' : 'unknown_feature';
        }
    }

    // Dynamic feature application
    async applyGeneratedFeature(feature) {
        try {
            // Create backup
            this.createCodeBackup();
            
            // Execute the generated code
            const codeFunction = new Function('return ' + feature.code)();
            const result = await codeFunction.call(this);
            
            // Apply any UI changes if specified
            if (feature.uiChanges && feature.uiChanges !== 'none') {
                await this.applyUIChanges(feature.uiChanges);
            }
            
            // Refresh affected areas
            await this.refreshCurrentPage();
            
            console.log('✅ Feature applied successfully:', feature.description);
            
        } catch (error) {
            // Restore backup if something fails
            this.restoreCodeBackup();
            throw error;
        }
    }

    showFeatureGenerationUI() {
        // Lock all interactables
        document.body.style.pointerEvents = 'none';
        
        const modal = document.createElement('div');
        modal.id = 'featureGenerationModal';
        modal.className = 'feature-generation-modal';
        modal.innerHTML = `
            <div class="feature-generation-content">
                <div class="generation-spinner"></div>
                <h2>🔧 Rewriting Application</h2>
                <p>Generating and implementing your new feature...</p>
                <div class="progress-steps">
                    <div class="step active">📝 Analyzing requirements</div>
                    <div class="step">⚡ Generating code</div>
                    <div class="step">🧪 Testing implementation</div>
                    <div class="step">🚀 Deploying feature</div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 25%"></div>
                </div>
            </div>
        `;
        
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            pointer-events: auto;
        `;
        
        const content = modal.querySelector('.feature-generation-content');
        content.style.cssText = `
            background: #1a1a1a;
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            color: white;
        `;
        
        const spinner = modal.querySelector('.generation-spinner');
        spinner.style.cssText = `
            width: 50px;
            height: 50px;
            border: 4px solid #333;
            border-top: 4px solid #00bcd4;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        `;
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(modal);
    }

    hideFeatureGenerationUI() {
        const modal = document.getElementById('featureGenerationModal');
        if (modal) {
            document.body.removeChild(modal);
        }
        
        // Restore interactables
        document.body.style.pointerEvents = 'auto';
    }

    async refreshCurrentPage() {
        // Refresh the current page to potentially load new functionality
        await this.loadPageData(this.currentPage);
        console.log('🔄 Current page refreshed:', this.currentPage);
    }

    // Helper methods for dynamic app analysis
    getAllMethodNames() {
        const methods = [];
        for (let prop in this) {
            if (typeof this[prop] === 'function' && !prop.startsWith('_')) {
                methods.push(prop);
            }
        }
        return methods;
    }

    getCurrentPageStructure() {
        const currentPageElement = document.querySelector(`#${this.currentPage}-content`);
        if (!currentPageElement) return { page: this.currentPage, elements: [] };
        
        return {
            page: this.currentPage,
            elements: Array.from(currentPageElement.querySelectorAll('[id]')).map(el => ({
                tag: el.tagName,
                id: el.id,
                classes: Array.from(el.classList)
            }))
        };
    }

    getCurrentAppData() {
        return {
            currentPage: this.currentPage,
            projectsCount: this.projects?.length || 0,
            inventoryCount: this.inventory?.length || 0,
            notesCount: this.notes?.length || 0,
            messagesCount: this.chatMessages?.length || 0
        };
    }

    createCodeBackup() {
        const backup = {
            timestamp: Date.now(),
            methods: {},
            data: {
                projects: [...(this.projects || [])],
                inventory: [...(this.inventory || [])],
                notes: [...(this.notes || [])],
                chatMessages: [...(this.chatMessages || [])]
            }
        };
        
        // Backup current methods
        for (let prop in this) {
            if (typeof this[prop] === 'function') {
                backup.methods[prop] = this[prop].toString();
            }
        }
        
        this.featureBackups.push(backup);
        console.log('💾 Code backup created');
    }

    restoreCodeBackup() {
        if (this.featureBackups.length === 0) return;
        
        const backup = this.featureBackups.pop();
        
        // Restore data
        this.projects = backup.data.projects;
        this.inventory = backup.data.inventory;
        this.notes = backup.data.notes;
        this.chatMessages = backup.data.chatMessages;
        
        console.log('🔄 Code backup restored');
    }

    async applyUIChanges(changes) {
        // This would be implemented to apply UI modifications
        // For now, just refresh the current page
        await this.refreshCurrentPage();
    }

    // ==================== END ADAPTIVE FEATURE GENERATION SYSTEM ====================
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM LOADED - Starting UI initialization');
    const ui = new GptUI();
    ui.initialize();
    
    // Make UI available globally for debugging
    window.gptUI = ui;
    
    console.log('✅ UI initialization complete');
});
