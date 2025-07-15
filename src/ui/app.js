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
            this.renderProjects();
            this.renderKanbanBoard(this.projects);
        } catch (error) {
            console.error('Error loading projects:', error);
            this.renderProjectsError();
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
                <div class="project-name">${project.name}</div>
                <div class="project-meta">
                    ${project.type} • ${project.status} • 
                    Created: ${new Date(project.created_at).toLocaleDateString()}
                </div>
            </div>
        `).join('');

        // Add click listeners to project items
        document.querySelectorAll('.project-item[data-project-id]').forEach(item => {
            item.addEventListener('click', (e) => {
                const projectId = e.currentTarget.getAttribute('data-project-id');
                this.openProject(projectId);
            });
        });
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
                    <div class="task-title">${project.name}</div>
                    <div class="task-meta">
                        ${project.type} • Priority: ${project.priority || 1}
                    </div>
                    <div class="task-meta">
                        Created: ${new Date(project.created_at).toLocaleDateString()}
                    </div>
                </div>
            `).join('');
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
                notesList.innerHTML = `
                    <div class="project-item" style="text-align: center; color: #666;">
                        No notes yet. Use voice commands to create notes!
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading notes:', error);
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
            const response = await ipcRenderer.invoke('send-command', message);
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
        
        this.addChatMessage({
            sender: 'gpt',
            message: data.response.message || data.response,
            timestamp: data.timestamp
        });
        
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

    // Method to force refresh current page data
    async refreshCurrentPage() {
        console.log('🔄 Force refreshing current page:', this.currentPage);
        await this.loadPageData(this.currentPage);
    }
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
