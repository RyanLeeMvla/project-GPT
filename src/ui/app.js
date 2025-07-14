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
        document.getElementById('voiceButton').addEventListener('click', () => {
            this.toggleVoiceListening();
        });

        // Chat input
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendChatMessage();
        });

        // New project button
        document.getElementById('newProjectBtn').addEventListener('click', () => {
            this.createNewProject();
        });
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
    }

    async navigateToPage(page) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`).classList.add('active');

        // Hide all content
        document.querySelectorAll('.page-content').forEach(content => {
            content.classList.add('hidden');
        });

        // Show selected content
        document.getElementById(`${page}-content`).classList.remove('hidden');

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
        document.getElementById('pageTitle').textContent = titles[page] || page;

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
            const status = await ipcRenderer.invoke('get-status');
            const projects = await ipcRenderer.invoke('get-projects');
            
            // Update stats
            document.getElementById('activeProjects').textContent = 
                projects?.filter(p => p.status === 'active')?.length || 0;
            
            // TODO: Load other dashboard data
            document.getElementById('completedTasks').textContent = '0';
            document.getElementById('printsInProgress').textContent = '0';
            document.getElementById('totalNotes').textContent = '0';
            
            this.isGptInitialized = status?.isInitialized || false;
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async loadProjects() {
        try {
            const projects = await ipcRenderer.invoke('get-projects');
            this.projects = projects || [];
            this.renderProjects();
        } catch (error) {
            console.error('Error loading projects:', error);
            this.renderProjectsError();
        }
    }

    renderProjects() {
        const projectsList = document.getElementById('projectsList');
        
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

    renderProjectsError() {
        const projectsList = document.getElementById('projectsList');
        projectsList.innerHTML = `
            <div class="project-item" style="text-align: center; color: #ff4444;">
                Error loading projects. Please try again.
            </div>
        `;
    }

    async loadNotes() {
        try {
            // TODO: Implement notes loading
            const notesList = document.getElementById('notesList');
            notesList.innerHTML = `
                <div class="project-item" style="text-align: center; color: #666;">
                    No notes yet. Use "GPT, log that instance" to create notes!
                </div>
            `;
        } catch (error) {
            console.error('Error loading notes:', error);
        }
    }

    async loadFabricationStatus() {
        try {
            // TODO: Implement fabrication status loading
            const printerStatus = document.getElementById('printerStatus');
            printerStatus.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">Not Connected</div>
                    <div class="stat-label">Bambu Lab Printer</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">Configure</div>
                    <div class="stat-label">Setup Required</div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading fabrication status:', error);
        }
    }

    async loadChatHistory() {
        const messagesContainer = document.getElementById('chatMessages');
        
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
        
        if (this.isListening) {
            voiceButton.classList.add('listening');
            voiceButton.textContent = '🔴';
            voiceStatus.textContent = 'Listening...';
        } else {
            voiceButton.classList.remove('listening');
            voiceButton.textContent = '🎤';
            voiceStatus.textContent = 'Ready to listen';
        }
    }

    async sendChatMessage() {
        const input = document.getElementById('chatInput');
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
            messagesContainer.innerHTML += this.createMessageHTML(messageData);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        // TODO: Implement project detail view
        console.log('Opening project:', projectId);
        this.showInfo(`Project ${projectId} selected`);
    }

    async updateStatus() {
        try {
            const status = await ipcRenderer.invoke('get-status');
            this.updateStatusDisplay(status);
        } catch (error) {
            console.error('Error updating status:', error);
            this.updateStatusDisplay({ isInitialized: false, isListening: false });
        }
    }

    updateStatusDisplay(status) {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        
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
        // Simple notification system
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;
        
        switch (type) {
            case 'success':
                notification.style.background = 'var(--success-color)';
                break;
            case 'error':
                notification.style.background = 'var(--error-color)';
                break;
            default:
                notification.style.background = 'var(--primary-color)';
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const ui = new GptUI();
    ui.initialize();
    
    // Make UI available globally for debugging
    window.gptUI = ui;
});

// Add notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
