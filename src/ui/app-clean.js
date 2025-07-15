const { ipcRenderer } = require('electron');

class GptUI {
    constructor() {
        this.currentPage = 'dashboard';
        this.isListening = false;
        this.isGptInitialized = false;
        this.chatMessages = [];
        this.projects = [];
        this.notes = [];
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

        // Project view tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.getAttribute('data-view');
                this.switchProjectView(view);
            });
        });

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
        
        // Listen for project updates
        ipcRenderer.on('projects-updated', () => {
            console.log('📡 Received projects-updated broadcast, refreshing...');
            if (this.currentPage === 'projects') {
                this.loadProjects();
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
                await ipcRenderer.invoke('stop-listening');
                this.isListening = false;
                this.updateVoiceButton();
            } else {
                const success = await ipcRenderer.invoke('start-listening');
                if (success) {
                    this.isListening = true;
                    this.updateVoiceButton();
                }
            }
        } catch (error) {
            console.error('Error toggling voice listening:', error);
            this.showError('Failed to toggle voice listening');
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
        this.addChatMessage({
            sender: 'gpt',
            message: data.response.message || data.response,
            timestamp: data.timestamp
        });
        
        // Check if this was a project management command and refresh projects
        const projectKeywords = ['project', 'move', 'stage', 'status', 'create', 'update', 'planning', 'testing', 'completed'];
        const command = data.command ? data.command.toLowerCase() : '';
        const response = data.response ? (data.response.message || data.response).toLowerCase() : '';
        
        const isProjectCommand = projectKeywords.some(keyword => 
            command.includes(keyword) || response.includes(keyword)
        );
        
        if (isProjectCommand) {
            console.log('🔄 Project command detected, refreshing projects...');
            // Refresh projects if we're on the projects page
            if (this.currentPage === 'projects') {
                setTimeout(() => this.loadProjects(), 500); // Small delay to ensure DB is updated
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

    async openProject(projectId) {
        console.log('Opening project:', projectId);
        this.showInfo(`Project ${projectId} selected`);
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
