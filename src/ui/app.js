const { ipcRenderer } = require('electron');

// Performance Timer Class
class PerformanceTimer {
    constructor() {
        this.timers = new Map();
        this.performanceLog = [];
    }

    start(operation) {
        const startTime = performance.now();
        this.timers.set(operation, startTime);
        console.log(`⏱️ Started timing: ${operation}`);
        this.updatePerformanceIndicator(`Loading ${operation}...`);
        return startTime;
    }

    end(operation) {
        const startTime = this.timers.get(operation);
        if (!startTime) {
            console.warn(`❌ No timer found for operation: ${operation}`);
            return 0;
        }

        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        this.timers.delete(operation);
        
        const logEntry = {
            operation,
            duration,
            timestamp: new Date().toISOString()
        };
        
        this.performanceLog.push(logEntry);
        
        // Keep only last 50 entries
        if (this.performanceLog.length > 50) {
            this.performanceLog = this.performanceLog.slice(-50);
        }
        
        console.log(`⏱️ Completed: ${operation} in ${duration}ms`);
        this.updatePerformanceIndicator(`${operation}: ${duration}ms`, duration);
        
        return duration;
    }

    updatePerformanceIndicator(text, duration = null) {
        const indicator = document.getElementById('performance-indicator');
        const performanceText = document.getElementById('performance-text');
        
        if (indicator && performanceText) {
            performanceText.textContent = text;
            indicator.classList.add('show');
            
            // Color coding based on performance
            if (duration !== null) {
                if (duration < 100) {
                    indicator.style.backgroundColor = 'rgba(0, 255, 136, 0.8)'; // Green - Fast
                } else if (duration < 500) {
                    indicator.style.backgroundColor = 'rgba(255, 193, 7, 0.8)'; // Yellow - Moderate
                } else {
                    indicator.style.backgroundColor = 'rgba(255, 68, 68, 0.8)'; // Red - Slow
                }
                
                // Auto-hide after 3 seconds
                setTimeout(() => {
                    indicator.classList.remove('show');
                }, 3000);
            }
        }
    }

    getStats() {
        if (this.performanceLog.length === 0) return null;
        
        const durations = this.performanceLog.map(entry => entry.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const max = Math.max(...durations);
        const min = Math.min(...durations);
        
        return {
            total: this.performanceLog.length,
            averageMs: Math.round(avg),
            maxMs: max,
            minMs: min,
            recent: this.performanceLog.slice(-10)
        };
    }
}

// Loading Manager Class  
class LoadingManager {
    constructor() {
        this.activeLoaders = new Set();
    }

    show(pageId, operation = 'Loading') {
        const loaderId = `${pageId}-loading`;
        const timeId = `${pageId}-time`;
        const loader = document.getElementById(loaderId);
        const timeDisplay = document.getElementById(timeId);
        
        if (loader) {
            loader.classList.remove('hidden');
            this.activeLoaders.add(loaderId);
            
            // Update loading text based on operation
            const loadingText = loader.querySelector('.loading-text');
            if (loadingText) {
                loadingText.textContent = operation;
            }
            
            // Start timer update
            if (timeDisplay) {
                const startTime = performance.now();
                const updateTimer = setInterval(() => {
                    const elapsed = Math.round(performance.now() - startTime);
                    timeDisplay.textContent = `${elapsed}ms`;
                }, 50);
                
                // Store timer reference for cleanup
                loader.dataset.timerId = updateTimer;
            }
        }
    }

    hide(pageId, finalTime = null) {
        const loaderId = `${pageId}-loading`;
        const timeId = `${pageId}-time`;
        const loader = document.getElementById(loaderId);
        const timeDisplay = document.getElementById(timeId);
        
        if (loader) {
            loader.classList.add('hidden');
            this.activeLoaders.delete(loaderId);
            
            // Clear timer
            if (loader.dataset.timerId) {
                clearInterval(loader.dataset.timerId);
                delete loader.dataset.timerId;
            }
            
            // Set final time if provided
            if (timeDisplay && finalTime !== null) {
                timeDisplay.textContent = `${finalTime}ms`;
            }
        }
    }

    hideAll() {
        this.activeLoaders.forEach(loaderId => {
            const loader = document.getElementById(loaderId);
            if (loader) {
                loader.classList.add('hidden');
                if (loader.dataset.timerId) {
                    clearInterval(loader.dataset.timerId);
                    delete loader.dataset.timerId;
                }
            }
        });
        this.activeLoaders.clear();
    }
}

class GptUI {
    constructor() {
        this.currentPage = 'dashboard';
        this.isListening = false;
        this.isGptInitialized = false;
        this.chatMessages = [];
        this.projects = [];
        this.notes = [];
        this.performanceTimer = new PerformanceTimer();
        this.loadingManager = new LoadingManager();
    }

    async initialize() {
        console.log('🎨 Initializing GPT UI...');
        
        // Send log to main process
        const { ipcRenderer } = require('electron');
        
        // Check initial modal state
        const setupModal = document.getElementById('setupModal');
        console.log('🔍 Initial setup modal state:', setupModal ? setupModal.classList.toString() : 'NOT FOUND');
        ipcRenderer.send('log-message', `🔍 Frontend: Initial modal classes: ${setupModal ? setupModal.classList.toString() : 'NOT FOUND'}`);
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup IPC listeners
        this.setupIPCListeners();
        
        // Check if setup is needed
        console.log('🔍 About to check setup status...');
        await this.checkSetupStatus();
        console.log('🔍 Setup status check completed');
        
        // Check modal state after setup check
        console.log('🔍 Setup modal state after check:', setupModal ? setupModal.classList.toString() : 'NOT FOUND');
        ipcRenderer.send('log-message', `🔍 Frontend: Modal classes after check: ${setupModal ? setupModal.classList.toString() : 'NOT FOUND'}`);
        
        // Additional debugging - check if modal is actually visible
        if (setupModal) {
            const computedStyle = window.getComputedStyle(setupModal);
            console.log('🔍 Modal computed display:', computedStyle.display);
            console.log('🔍 Modal computed visibility:', computedStyle.visibility);
            ipcRenderer.send('log-message', `🔍 Frontend: Modal display: ${computedStyle.display}, visibility: ${computedStyle.visibility}`);
        }
        
        // Load initial data
        await this.loadDashboardData();
        
        // Check GPT status
        await this.updateStatus();
        
        console.log('✅ GPT UI initialized');
    }

    async checkSetupStatus() {
        console.log('🔍 UI checkSetupStatus() called - starting setup check');
        
        // Send log to main process
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log-message', '🔍 Frontend: checkSetupStatus() called');
        
        try {
            const needsSetup = await ipcRenderer.invoke('check-setup-status');
            console.log('🔍 UI Setup check - needs setup:', needsSetup);
            ipcRenderer.send('log-message', `🔍 Frontend: Setup check result - needs setup: ${needsSetup}`);
            
            if (needsSetup) {
                console.log('📝 Showing setup modal...');
                ipcRenderer.send('log-message', '📝 Frontend: About to show setup modal');
                this.showSetupModal();
            } else {
                console.log('✅ API key already configured, skipping setup');
                ipcRenderer.send('log-message', '✅ Frontend: API key configured, skipping setup - HIDING MODAL');
                this.hideSetupModal();
            }
        } catch (error) {
            console.error('❌ Error checking setup status:', error);
            ipcRenderer.send('log-message', `❌ Frontend: Error checking setup - ${error.message}`);
            // Only show setup on error if we really can't determine the status
            console.log('⚠️ Showing setup modal due to error');
            this.showSetupModal();
        }
    }

    skipSetup() {
        console.log('⏭️ Skipping setup - user chose to configure later');
        this.hideSetupModal();
        
        // Show a message indicating they can configure later in settings
        this.showNotification('Setup skipped. You can configure your API key in Settings later.', 'info');
        
        // Optionally disable certain features until configured
        this.updateStatus('Not Configured');
    }

    hideSetupModal() {
        console.log('❌ hideSetupModal() called');
        const modal = document.getElementById('setupModal');
        console.log('❌ Setup modal element found:', !!modal);
        if (modal) {
            console.log('❌ Modal classes before:', modal.classList.toString());
            modal.classList.add('hidden');
            console.log('❌ Modal classes after:', modal.classList.toString());
        }
    }

    showSetupModal() {
        console.log('📱 showSetupModal() called');
        const modal = document.getElementById('setupModal');
        console.log('📱 Setup modal element found:', !!modal);
        if (modal) {
            console.log('📱 Modal classes before:', modal.classList.toString());
            modal.classList.remove('hidden');
            console.log('📱 Modal classes after:', modal.classList.toString());
        }
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

        document.getElementById('newProjectBtn').addEventListener('click', () => {
            this.createNewProject();
        });

        // Project view tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.getAttribute('data-view');
                this.switchProjectView(view);
            });
        });

        // Inventory filters
        document.getElementById('categoryFilter').addEventListener('change', () => {
            this.loadInventory();
        });

        document.getElementById('refreshInventoryBtn').addEventListener('click', () => {
            this.loadInventory();
        });

        // Timeline navigation
        document.getElementById('timelinePrev').addEventListener('click', () => {
            this.navigateTimeline(-1);
        });

        document.getElementById('timelineNext').addEventListener('click', () => {
            this.navigateTimeline(1);
        });

        // Setup modal events
        document.getElementById('toggleSetupApiKey').addEventListener('click', () => {
            this.togglePasswordVisibility('setupApiKey', 'toggleSetupApiKey');
        });

        document.getElementById('testApiKey').addEventListener('click', () => {
            this.testApiKey();
        });

        document.getElementById('completeSetup').addEventListener('click', () => {
            this.completeSetup();
        });

        document.getElementById('skipSetup').addEventListener('click', (e) => {
            console.log('🔄 Skip setup button clicked');
            e.preventDefault();
            this.skipSetup();
        });

        // Settings events
        document.getElementById('toggleApiKey').addEventListener('click', () => {
            this.togglePasswordVisibility('apiKeyInput', 'toggleApiKey');
        });

        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('savePrinterBtn').addEventListener('click', () => {
            this.savePrinterSettings();
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
        
        // Listen for project updates
        ipcRenderer.on('projects-updated', () => {
            console.log('📡 Received projects-updated broadcast, refreshing...');
            if (this.currentPage === 'projects') {
                this.loadProjects();
            }
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
            // Also clear Kanban board
            this.clearKanbanBoard();
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
        
        // Also update the Kanban board with projects
        this.renderKanbanBoard(this.projects);
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

    async updateStatus(customStatus = null) {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');
        
        if (customStatus) {
            statusText.textContent = customStatus;
            statusDot.className = 'status-dot offline';
            return;
        }
        
        try {
            // Check if GPT is properly configured and working
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

    togglePasswordVisibility(inputId, buttonId) {
        const input = document.getElementById(inputId);
        const button = document.getElementById(buttonId);
        
        if (input.type === 'password') {
            input.type = 'text';
            button.textContent = 'Hide';
        } else {
            input.type = 'password';
            button.textContent = 'Show';
        }
    }

    async testApiKey() {
        const apiKey = document.getElementById('setupApiKey').value.trim();
        const testResult = document.getElementById('testResult');
        const testButton = document.getElementById('testApiKey');
        const completeButton = document.getElementById('completeSetup');
        
        if (!apiKey) {
            this.showTestResult('Please enter an API key first.', false);
            return;
        }

        if (!apiKey.startsWith('sk-')) {
            this.showTestResult('API key should start with "sk-"', false);
            return;
        }

        testButton.textContent = 'Testing...';
        testButton.disabled = true;

        try {
            const isValid = await ipcRenderer.invoke('test-api-key', apiKey);
            if (isValid) {
                this.showTestResult('✅ API key is valid! GPT is ready to assist you.', true);
                completeButton.disabled = false;
            } else {
                this.showTestResult('❌ Invalid API key. Please check and try again.', false);
            }
        } catch (error) {
            this.showTestResult('❌ Error testing API key: ' + error.message, false);
        }

        testButton.textContent = 'Test API Key';
        testButton.disabled = false;
    }

    showTestResult(message, isSuccess) {
        const testResult = document.getElementById('testResult');
        testResult.textContent = message;
        testResult.className = `test-result ${isSuccess ? 'success' : 'error'}`;
        testResult.classList.remove('hidden');
    }

    async completeSetup() {
        const apiKey = document.getElementById('setupApiKey').value.trim();
        
        try {
            await ipcRenderer.invoke('save-api-key', apiKey);
            this.hideSetupModal();
            
            // Show success message
            this.showNotification('Setup completed! GPT AI Agent is now ready.', 'success');
            
            // Refresh the interface
            await this.loadDashboardData();
            await this.updateStatus();
        } catch (error) {
            this.showNotification('Error saving configuration: ' + error.message, 'error');
        }
    }

    async saveSettings() {
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        const model = document.getElementById('modelSelect').value;
        
        try {
            await ipcRenderer.invoke('save-settings', { apiKey, model });
            this.showNotification('Settings saved successfully!', 'success');
        } catch (error) {
            this.showNotification('Error saving settings: ' + error.message, 'error');
        }
    }

    async savePrinterSettings() {
        const printerIP = document.getElementById('printerIP').value.trim();
        const accessCode = document.getElementById('printerAccessCode').value.trim();
        
        try {
            await ipcRenderer.invoke('save-printer-settings', { printerIP, accessCode });
            this.showNotification('Printer settings saved successfully!', 'success');
        } catch (error) {
            this.showNotification('Error saving printer settings: ' + error.message, 'error');
        }
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
            background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--error-color)' : 'var(--primary-color)'};
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
        document.querySelector(`[data-view="${view}"]`).classList.add('active');

        // Hide all views
        document.querySelectorAll('.project-view').forEach(view => {
            view.classList.add('hidden');
        });

        // Show selected view
        document.getElementById(`projects-${view}-view`).classList.remove('hidden');

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
            const projects = await ipcRenderer.invoke('get-projects');
            const timelineData = await ipcRenderer.invoke('get-project-timeline');
            this.renderTimeline(timelineData || []);
        } catch (error) {
            console.error('Error loading timeline:', error);
        }
    }

    renderTimeline(events) {
        const timelineContent = document.getElementById('timelineContent');
        
        if (events.length === 0) {
            timelineContent.innerHTML = `
                <div style="text-align: center; color: #666; padding: 40px;">
                    No timeline events yet. Create a project to get started!
                </div>
            `;
            return;
        }

        // Sort events by date
        events.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

        // Create timeline visualization
        const timelineHTML = `
            <div class="timeline-track"></div>
            ${events.map((event, index) => {
                const position = (index / (events.length - 1)) * 100;
                return `
                    <div class="timeline-event" style="left: ${position}%">
                        <div class="timeline-event-title">${event.title}</div>
                        <div class="timeline-event-date">${new Date(event.start_date).toLocaleDateString()}</div>
                        <div style="font-size: 12px; margin-top: 5px;">${event.description || ''}</div>
                    </div>
                `;
            }).join('')}
        `;

        timelineContent.innerHTML = timelineHTML;
    }

    async loadKanbanBoard() {
        try {
            const tasks = await ipcRenderer.invoke('get-all-tasks');
            this.renderKanbanBoard(tasks || []);
        } catch (error) {
            console.error('Error loading kanban board:', error);
        }
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
    
    clearKanbanBoard() {
        const columnIds = ['planningTasks', 'progressTasks', 'reviewTasks', 'completedTasks'];
        columnIds.forEach(columnId => {
            const container = document.getElementById(columnId);
            if (container) {
                container.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">No projects</div>';
            }
        });
    }

    async loadInventory() {
        try {
            const category = document.getElementById('categoryFilter').value;
            const inventory = await ipcRenderer.invoke('get-inventory', { category });
            this.renderInventory(inventory || []);
            this.updateInventoryStats(inventory || []);
        } catch (error) {
            console.error('Error loading inventory:', error);
        }
    }

    renderInventory(items) {
        const inventoryList = document.getElementById('inventoryList');
        
        if (items.length === 0) {
            inventoryList.innerHTML = `
                <div style="text-align: center; color: #666; padding: 40px; grid-column: 1 / -1;">
                    No inventory items found. Add items to get started!
                </div>
            `;
            return;
        }

        inventoryList.innerHTML = items.map(item => `
            <div class="inventory-item ${item.isLowStock ? 'low-stock' : ''}">
                <div class="inventory-header">
                    <div class="inventory-name">${item.name}</div>
                    <div class="inventory-category">${item.category}</div>
                </div>
                
                <div class="inventory-details">
                    <div class="inventory-stat">
                        <div class="inventory-stat-value">${item.quantity}</div>
                        <div class="inventory-stat-label">${item.unit}</div>
                    </div>
                    <div class="inventory-stat">
                        <div class="inventory-stat-value">$${(item.cost_per_unit * item.quantity).toFixed(2)}</div>
                        <div class="inventory-stat-label">Total Value</div>
                    </div>
                </div>
                
                <div style="font-size: 12px; color: #ccc; margin-bottom: 10px;">
                    ${item.description || 'No description'}
                </div>
                
                ${item.location ? `<div style="font-size: 11px; color: #999;">📍 ${item.location}</div>` : ''}
                
                ${item.isLowStock ? `
                    <div class="low-stock-warning">
                        ⚠️ Low Stock Alert! (${item.quantity} remaining)
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    updateInventoryStats(items) {
        const stats = {
            totalItems: items.length,
            lowStockItems: items.filter(item => item.isLowStock).length,
            inventoryValue: items.reduce((total, item) => total + (item.cost_per_unit * item.quantity), 0),
            categories: [...new Set(items.map(item => item.category))].length
        };

        document.getElementById('totalItems').textContent = stats.totalItems;
        document.getElementById('lowStockItems').textContent = stats.lowStockItems;
        document.getElementById('inventoryValue').textContent = `$${stats.inventoryValue.toFixed(2)}`;
        document.getElementById('categories').textContent = stats.categories;
    }

    navigateTimeline(direction) {
        // Timeline navigation logic - could implement month/week navigation
        console.log('Navigate timeline:', direction);
    }
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM LOADED - Starting UI initialization');
    const ui = new GptUI();
    ui.initialize();
    
    // Make UI available globally for debugging
    window.gptUI = ui;
    
    // Send log to main process
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('log-message', '🚀 Frontend: DOM loaded and UI initialized');
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
