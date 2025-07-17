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

        // ========================
        // AUTONOMOUS MODE CONTROLS
        // ========================
        
        // Autonomous mode toggle
        document.getElementById('autonomousMode').addEventListener('change', (e) => {
            this.handleAutonomousModeToggle(e.target.checked);
        });

        // Backup management button
        document.getElementById('backupBtn').addEventListener('click', () => {
            this.showBackupModal();
        });

        // Emergency rollback button
        document.getElementById('rollbackBtn').addEventListener('click', () => {
            this.performEmergencyRollback();
        });

        // Backup modal controls
        document.getElementById('closeBackupModal').addEventListener('click', () => {
            this.hideBackupModal();
        });

        document.getElementById('closeBackupModalBtn').addEventListener('click', () => {
            this.hideBackupModal();
        });

        // Listen for autonomous changes applied
        ipcRenderer.on('autonomous-changes-applied', (event, data) => {
            this.handleAutonomousChangesApplied(data);
        });

        // Listen for autonomous rollback completed
        ipcRenderer.on('autonomous-rollback-completed', (event, data) => {
            this.handleAutonomousRollbackCompleted(data);
        });

        // Listen for rewriting progress updates
        ipcRenderer.on('rewriting-progress', (event, data) => {
            this.updateRewritingProgress(data.step, data.progress, data.message);
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
        
        // Listen for notification click events
        ipcRenderer.on('show-project-reminder', (event, data) => {
            console.log('🔔 Received show-project-reminder event:', data);
            this.handleNotificationClick(data);
        });
        
        // Listen for rewriting completion
        ipcRenderer.on('rewriting-complete', (event, data) => {
            this.hideRewritingModal();
            if (data.success) {
                this.showNotification(`✅ ${data.message}`, 'success');
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
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
                <div class="project-content">
                    <div class="project-name">${project.name}</div>
                    <div class="project-meta">
                        ${project.type} • ${project.status} • 
                        Created: ${new Date(project.created_at).toLocaleDateString()}
                    </div>
                </div>
                <div class="project-actions">
                    <button class="btn-edit" data-project-id="${project.id}" title="Edit Project">
                        ✏️
                    </button>
                    <button class="btn-delete" data-project-id="${project.id}" title="Delete Project">
                        🗑️
                    </button>
                </div>
            </div>
        `).join('');

        // Add click listeners to project items
        document.querySelectorAll('.project-item[data-project-id]').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't open project if clicking on edit or delete button
                if (e.target.classList.contains('btn-delete') || e.target.classList.contains('btn-edit')) {
                    return;
                }
                const projectId = e.currentTarget.getAttribute('data-project-id');
                this.openProject(projectId);
            });
        });

        // Add edit button listeners
        document.querySelectorAll('.btn-edit').forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent triggering project open
                const projectId = e.target.getAttribute('data-project-id');
                const project = this.projects.find(p => p.id == projectId);
                
                if (!project) {
                    this.showError('Project not found');
                    return;
                }
                
                await this.showEditProjectModal(project);
            });
        });

        // Add delete button listeners
        document.querySelectorAll('.btn-delete').forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent triggering project open
                const projectId = e.target.getAttribute('data-project-id');
                const project = this.projects.find(p => p.id == projectId);
                
                if (!project) {
                    this.showError('Project not found');
                    return;
                }
                
                if (confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
                    await this.deleteProject(projectId);
                }
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
        
        // Check if autonomous mode is enabled
        const autonomousMode = document.getElementById('autonomousMode').checked;
        
        // Send to GPT
        try {
            let response;
            
            if (autonomousMode) {
                // Use autonomous permanent changes
                console.log('🤖 AUTONOMOUS MODE: Sending request for permanent changes...');
                
                // Show rewriting modal with progress
                this.showRewritingModal();
                
                // Create conversation context
                const conversation = this.getChatHistory();
                conversation.push({ role: 'user', content: message });
                
                response = await ipcRenderer.invoke('enable-autonomous-changes', conversation);
                
                // Hide rewriting modal
                this.hideRewritingModal();
                
                if (response.success) {
                    this.addChatMessage({
                        sender: 'gpt',
                        message: `🤖 AUTONOMOUS MODE: ${response.description || 'Changes applied successfully'}\n\n✅ Permanent changes: ${response.permanentChangesApplied || 0}\n❌ Failed changes: ${response.failedChanges || 0}\n🛡️ Backup created: ${response.backupCreated ? 'Yes' : 'No'}`,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    this.addChatMessage({
                        sender: 'gpt',
                        message: `❌ AUTONOMOUS MODE FAILED: ${response.error || 'Unknown error occurred'}`,
                        timestamp: new Date().toISOString()
                    });
                }
            } else {
                // Use regular chat mode
                response = await ipcRenderer.invoke('send-command', message);
                this.handleGptResponse({
                    command: message,
                    response: response,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error sending message to GPT:', error);
            this.addChatMessage({
                sender: 'gpt',
                message: `Sorry, I encountered an error processing your request: ${error.message}`,
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
        let senderClass, senderName;
        
        switch (messageData.sender) {
            case 'user':
                senderClass = 'user';
                senderName = 'You';
                break;
            case 'system':
                senderClass = 'system';
                senderName = 'System';
                break;
            default:
                senderClass = 'gpt';
                senderName = 'GPT';
        }
        
        // Check if this is a system status message (contains the ASCII box art)
        const isSystemStatus = messageData.message && messageData.message.includes('╭─────────── 🖥️ System Status ───────────╮');
        
        // For system status messages, use monospace font and preserve formatting
        if (isSystemStatus) {
            return `
                <div class="message ${senderClass}">
                    <div class="message-header">${senderName} - ${time}</div>
                    <pre style="font-family: 'Courier New', Consolas, monospace; white-space: pre; margin: 0; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; overflow-x: auto;">${messageData.message}</pre>
                </div>
            `;
        }
        
        // For regular messages, use normal HTML escaping
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
            const projects = await ipcRenderer.invoke('get-projects');
            console.log('🏗️ Kanban: Loaded projects:', projects);
            this.renderKanbanBoard(projects || []);
        } catch (error) {
            console.error('Error loading kanban board:', error);
        }
    }

    renderKanbanBoard(projects) {
        console.log('🏗️ Kanban: Rendering with projects:', projects);
        const columns = {
            planning: projects.filter(p => p.status === 'planning'),
            in_progress: projects.filter(p => p.status === 'in_progress' || p.status === 'active'),
            review: projects.filter(p => p.status === 'review'),
            completed: projects.filter(p => p.status === 'completed')
        };
        
        console.log('🏗️ Kanban: Column distribution:', columns);

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

    // ========================
    // AUTONOMOUS MODE METHODS
    // ========================
    
    handleAutonomousModeToggle(enabled) {
        const statusElement = document.getElementById('autonomousStatus');
        
        if (enabled) {
            statusElement.textContent = 'ENABLED - Changes will be permanent with backup safety';
            statusElement.className = 'autonomous-status enabled';
            
            this.addChatMessage({
                sender: 'system',
                message: '🤖 AUTONOMOUS MODE ENABLED: All feature requests will now make permanent changes to your codebase with automatic backup protection.',
                timestamp: new Date().toISOString()
            });
        } else {
            statusElement.textContent = 'Disabled - Changes will be temporary';
            statusElement.className = 'autonomous-status disabled';
            
            this.addChatMessage({
                sender: 'system',
                message: '🔄 AUTONOMOUS MODE DISABLED: Returning to temporary conversation-only mode.',
                timestamp: new Date().toISOString()
            });
        }
    }
    
    async showBackupModal() {
        const modal = document.getElementById('backupModal');
        const backupsList = document.getElementById('backupsList');
        
        modal.style.display = 'flex';
        
        try {
            // Load available backups
            const result = await ipcRenderer.invoke('get-backup-list');
            
            if (result.success && result.backups.length > 0) {
                backupsList.innerHTML = result.backups.map((backup, index) => `
                    <div class="backup-item">
                        <div class="backup-info-text">
                            <div><strong>Backup ${index}</strong> - ${new Date(backup.timestamp).toLocaleString()}</div>
                            <div style="font-size: 11px;">${backup.date}</div>
                        </div>
                        <div class="backup-actions">
                            <button class="btn btn-secondary" onclick="gptUI.restoreBackup(${backup.timestamp})" style="padding: 4px 8px; font-size: 11px;">
                                🔄 Restore
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                backupsList.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                        <div style="font-size: 48px; margin-bottom: 15px;">🛡️</div>
                        <div>No backups available yet</div>
                        <div style="font-size: 12px; margin-top: 8px;">Backups will be created automatically when autonomous mode makes permanent changes</div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Failed to load backups:', error);
            backupsList.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--error-color);">
                    <div>❌ Failed to load backups</div>
                    <div style="font-size: 12px; margin-top: 8px;">${error.message}</div>
                </div>
            `;
        }
    }
    
    hideBackupModal() {
        document.getElementById('backupModal').style.display = 'none';
    }
    
    async performEmergencyRollback() {
        if (!confirm('⚠️ EMERGENCY ROLLBACK: This will restore your codebase to the most recent backup. Continue?')) {
            return;
        }
        
        try {
            const result = await ipcRenderer.invoke('autonomous-rollback', 0);
            
            if (result.success) {
                this.addChatMessage({
                    sender: 'system',
                    message: `✅ EMERGENCY ROLLBACK COMPLETED: ${result.message}`,
                    timestamp: new Date().toISOString()
                });
            } else {
                this.addChatMessage({
                    sender: 'system',
                    message: `❌ EMERGENCY ROLLBACK FAILED: ${result.error}`,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            this.addChatMessage({
                sender: 'system',
                message: `❌ EMERGENCY ROLLBACK ERROR: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    async restoreBackup(timestamp) {
        if (!confirm(`🔄 RESTORE BACKUP: This will restore your codebase to the backup from ${new Date(timestamp).toLocaleString()}. Continue?`)) {
            return;
        }
        
        try {
            const result = await ipcRenderer.invoke('autonomous-rollback', timestamp);
            
            if (result.success) {
                this.addChatMessage({
                    sender: 'system',
                    message: `✅ BACKUP RESTORED: ${result.message}`,
                    timestamp: new Date().toISOString()
                });
                this.hideBackupModal();
            } else {
                this.addChatMessage({
                    sender: 'system',
                    message: `❌ BACKUP RESTORE FAILED: ${result.error}`,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            this.addChatMessage({
                sender: 'system',
                message: `❌ BACKUP RESTORE ERROR: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    handleAutonomousChangesApplied(data) {
        this.addChatMessage({
            sender: 'system',
            message: `🎉 AUTONOMOUS CHANGES APPLIED: ${data.changesCount} permanent modifications completed successfully!\n\n${data.description}`,
            timestamp: new Date().toISOString()
        });
    }
    
    handleAutonomousRollbackCompleted(data) {
        this.addChatMessage({
            sender: 'system',
            message: `🔄 ROLLBACK COMPLETED: ${data.message}`,
            timestamp: new Date().toISOString()
        });
    }
    
    getChatHistory() {
        const messages = document.querySelectorAll('.message');
        const history = [];
        
        messages.forEach(msg => {
            const role = msg.classList.contains('gpt') ? 'assistant' : 'user';
            const content = msg.querySelector('div:last-child').textContent;
            if (content && !content.startsWith('🤖') && !content.startsWith('✅') && !content.startsWith('❌')) {
                history.push({ role, content });
            }
        });
        
        return history.slice(-10); // Keep last 10 messages for context
    }

    // ========================
    // REWRITING MODAL METHODS
    // ========================
    
    showRewritingModal(initialMessage = 'Preparing autonomous changes...') {
        const modal = document.getElementById('rewritingModal');
        const progressBar = document.querySelector('#rewritingProgress .progress-fill');
        const statusText = document.getElementById('rewritingStatus');
        
        if (modal) {
            modal.style.display = 'flex';
            if (progressBar) {
                progressBar.style.width = '0%';
            }
            if (statusText) {
                statusText.textContent = initialMessage;
            }
        }
    }
    
    updateRewritingProgress(step, progress, message) {
        const progressBar = document.querySelector('#rewritingProgress .progress-fill');
        const statusText = document.getElementById('rewritingStatus');
        
        if (progressBar && statusText) {
            // Progress is always sent as a percentage value (10, 30, 50, 70, 90, 100)
            const percentage = Math.round(progress);
            progressBar.style.width = `${percentage}%`;
            statusText.textContent = message || `Step ${step} - ${percentage}%`;
            
            console.log(`🔄 Rewriting Progress: ${percentage}% - ${message}`);
        }
    }
    
    hideRewritingModal() {
        const modal = document.getElementById('rewritingModal');
        if (modal) {
            // Add fade out animation
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.opacity = '1'; // Reset for next time
            }, 300);
        }
    }

    async deleteProject(projectId) {
        try {
            if (!projectId) {
                this.showError('Invalid project ID');
                return;
            }
            
            console.log('Deleting project with ID:', projectId);
            const result = await ipcRenderer.invoke('delete-project', projectId);
            console.log('Delete result:', result);
            
            if (result && result.success) {
                this.showSuccess('Project deleted successfully!');
                await this.loadProjects(); // Refresh the projects list
            } else {
                this.showError('Failed to delete project: ' + (result?.error || result?.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error deleting project:', error);
            this.showError('Failed to delete project: ' + error.message);
        }
    }

    async showEditProjectModal(project) {
        // Create a modal overlay if it doesn't exist
        let modal = document.getElementById('editProjectModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'editProjectModal';
            modal.className = 'modal-overlay';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.85);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            `;
            
            modal.innerHTML = `
                <div class="modal-content" style="
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 12px;
                    padding: 24px;
                    width: 90%;
                    max-width: 500px;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                ">
                    <div class="modal-header" style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 16px;
                        border-bottom: 1px solid #333;
                    ">
                        <h2 style="margin: 0; color: #ffffff;">Edit Project</h2>
                        <button id="closeEditModal" style="
                            background: none;
                            border: none;
                            font-size: 24px;
                            cursor: pointer;
                            color: #ccc;
                        ">&times;</button>
                    </div>
                    
                    <div class="modal-tabs" style="
                        display: flex;
                        margin-bottom: 20px;
                        border-bottom: 1px solid #333;
                    ">
                        <button class="tab-button active" data-tab="details" style="
                            padding: 12px 20px;
                            border: none;
                            background: none;
                            color: #00d4ff;
                            cursor: pointer;
                            border-bottom: 2px solid #00d4ff;
                            font-weight: 500;
                        ">Details</button>
                        <button class="tab-button" data-tab="notes" style="
                            padding: 12px 20px;
                            border: none;
                            background: none;
                            color: #ccc;
                            cursor: pointer;
                            border-bottom: 2px solid transparent;
                        ">Notes</button>
                        <button class="tab-button" data-tab="reminders" style="
                            padding: 12px 20px;
                            border: none;
                            background: none;
                            color: #ccc;
                            cursor: pointer;
                            border-bottom: 2px solid transparent;
                        ">Reminders</button>
                    </div>
                    
                    <div class="tab-content">
                        <div id="details-tab" class="tab-pane active">
                            <form id="editProjectForm">
                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 500;">
                                        Project Name *
                                    </label>
                                    <input type="text" id="editProjectName" required style="
                                        width: 100%;
                                        padding: 12px;
                                        border: 1px solid #333;
                                        border-radius: 6px;
                                        background: #2a2a2a;
                                        color: #ffffff;
                                        font-size: 14px;
                                    ">
                                </div>
                                
                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 500;">
                                        Description
                                    </label>
                                    <textarea id="editProjectDescription" rows="3" style="
                                        width: 100%;
                                        padding: 12px;
                                        border: 1px solid #333;
                                        border-radius: 6px;
                                        background: #2a2a2a;
                                        color: #ffffff;
                                        font-size: 14px;
                                        resize: vertical;
                                    "></textarea>
                                </div>
                                
                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 500;">
                                        Type
                                    </label>
                                    <select id="editProjectType" style="
                                        width: 100%;
                                        padding: 12px;
                                        border: 1px solid #333;
                                        border-radius: 6px;
                                        background: #2a2a2a;
                                        color: #ffffff;
                                        font-size: 14px;
                                    ">
                                        <option value="general">General</option>
                                        <option value="development">Development</option>
                                        <option value="research">Research</option>
                                        <option value="design">Design</option>
                                        <option value="marketing">Marketing</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                
                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 500;">
                                        Status
                                    </label>
                                    <select id="editProjectStatus" style="
                                        width: 100%;
                                        padding: 12px;
                                        border: 1px solid #333;
                                        border-radius: 6px;
                                        background: #2a2a2a;
                                        color: #ffffff;
                                        font-size: 14px;
                                    ">
                                        <option value="active">Active</option>
                                        <option value="planning">Planning</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="testing">Testing</option>
                                        <option value="completed">Completed</option>
                                        <option value="on_hold">On Hold</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                                
                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 500;">
                                        Priority (1-5)
                                    </label>
                                    <input type="number" id="editProjectPriority" min="1" max="5" style="
                                        width: 100%;
                                        padding: 12px;
                                        border: 1px solid #333;
                                        border-radius: 6px;
                                        background: #2a2a2a;
                                        color: #ffffff;
                                        font-size: 14px;
                                    ">
                                </div>
                                
                                <div class="form-actions" style="
                                    display: flex;
                                    gap: 12px;
                                    margin-top: 24px;
                                    padding-top: 16px;
                                    border-top: 1px solid #333;
                                ">
                                    <button type="button" id="cancelEditProject" style="
                                        flex: 1;
                                        padding: 12px 20px;
                                        border: 1px solid #333;
                                        border-radius: 6px;
                                        background: #2a2a2a;
                                        color: #ffffff;
                                        cursor: pointer;
                                        font-size: 14px;
                                        transition: all 0.3s ease;
                                    ">Cancel</button>
                                    <button type="submit" id="saveEditProject" style="
                                        flex: 1;
                                        padding: 12px 20px;
                                        border: none;
                                        border-radius: 6px;
                                        background: #00d4ff;
                                        color: white;
                                        cursor: pointer;
                                        font-size: 14px;
                                        font-weight: 500;
                                        transition: all 0.3s ease;
                                    ">Save Changes</button>
                                </div>
                            </form>
                        </div>
                        
                        <div id="notes-tab" class="tab-pane" style="display: none;">
                            <div class="notes-section">
                                <div class="add-note-form" style="
                                    background: #2a2a2a;
                                    padding: 16px;
                                    border-radius: 8px;
                                    margin-bottom: 20px;
                                ">
                                    <h3 style="margin: 0 0 16px 0; color: #ffffff; font-size: 16px;">Add New Note</h3>
                                    <textarea id="newNoteContent" placeholder="Write your note here..." style="
                                        width: 100%;
                                        padding: 12px;
                                        border: 1px solid #333;
                                        border-radius: 6px;
                                        background: #1a1a1a;
                                        color: #ffffff;
                                        font-size: 14px;
                                        resize: vertical;
                                        min-height: 80px;
                                    "></textarea>
                                    <div style="
                                        display: flex;
                                        gap: 8px;
                                        margin-top: 12px;
                                    ">
                                        <input type="text" id="newNoteTags" placeholder="Tags (comma separated)" style="
                                            flex: 1;
                                            padding: 8px;
                                            border: 1px solid #333;
                                            border-radius: 4px;
                                            background: #1a1a1a;
                                            color: #ffffff;
                                            font-size: 12px;
                                        ">
                                        <button type="button" id="addProjectNote" style="
                                            padding: 8px 16px;
                                            border: none;
                                            border-radius: 4px;
                                            background: #00d4ff;
                                            color: white;
                                            cursor: pointer;
                                            font-size: 12px;
                                            font-weight: 500;
                                        ">Add Note</button>
                                    </div>
                                </div>
                                
                                <div class="notes-list" id="projectNotesList" style="
                                    max-height: 300px;
                                    overflow-y: auto;
                                ">
                                    <!-- Notes will be loaded here -->
                                </div>
                            </div>
                        </div>
                        
                        <div id="reminders-tab" class="tab-pane" style="display: none;">
                            <div class="reminders-section">
                                <div class="add-reminder-form" style="
                                    background: #2a2a2a;
                                    padding: 16px;
                                    border-radius: 8px;
                                    margin-bottom: 20px;
                                ">
                                    <h3 style="margin: 0 0 16px 0; color: #ffffff; font-size: 16px;">Add New Reminder</h3>
                                    <div class="form-group" style="margin-bottom: 12px;">
                                        <input type="text" id="newReminderTitle" placeholder="Reminder title..." style="
                                            width: 100%;
                                            padding: 12px;
                                            border: 1px solid #333;
                                            border-radius: 6px;
                                            background: #1a1a1a;
                                            color: #ffffff;
                                            font-size: 14px;
                                        ">
                                    </div>
                                    <div class="form-group" style="margin-bottom: 12px;">
                                        <textarea id="newReminderDescription" placeholder="Description (optional)..." style="
                                            width: 100%;
                                            padding: 12px;
                                            border: 1px solid #333;
                                            border-radius: 6px;
                                            background: #1a1a1a;
                                            color: #ffffff;
                                            font-size: 14px;
                                            resize: vertical;
                                            min-height: 60px;
                                        "></textarea>
                                    </div>
                                    <div style="
                                        display: flex;
                                        gap: 12px;
                                        margin-bottom: 12px;
                                    ">
                                        <div style="flex: 1;">
                                            <label style="display: block; margin-bottom: 4px; color: #ccc; font-size: 12px;">Date</label>
                                            <input type="date" id="newReminderDate" style="
                                                width: 100%;
                                                padding: 8px;
                                                border: 1px solid #333;
                                                border-radius: 4px;
                                                background: #1a1a1a;
                                                color: #ffffff;
                                                font-size: 12px;
                                            ">
                                        </div>
                                        <div style="flex: 1;">
                                            <label style="display: block; margin-bottom: 4px; color: #ccc; font-size: 12px;">Time</label>
                                            <input type="time" id="newReminderTime" style="
                                                width: 100%;
                                                padding: 8px;
                                                border: 1px solid #333;
                                                border-radius: 4px;
                                                background: #1a1a1a;
                                                color: #ffffff;
                                                font-size: 12px;
                                            ">
                                        </div>
                                    </div>
                                    <div style="
                                        display: flex;
                                        gap: 12px;
                                        margin-bottom: 12px;
                                        align-items: center;
                                    ">
                                        <label style="
                                            display: flex;
                                            align-items: center;
                                            color: #ccc;
                                            font-size: 12px;
                                            cursor: pointer;
                                        ">
                                            <input type="checkbox" id="newReminderRecurring" style="
                                                margin-right: 8px;
                                                transform: scale(1.2);
                                            ">
                                            Recurring Reminder
                                        </label>
                                        <select id="newReminderRecurrence" style="
                                            padding: 6px;
                                            border: 1px solid #333;
                                            border-radius: 4px;
                                            background: #1a1a1a;
                                            color: #ffffff;
                                            font-size: 12px;
                                            display: none;
                                        ">
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                            <option value="yearly">Yearly</option>
                                        </select>
                                    </div>
                                    <div style="
                                        display: flex;
                                        gap: 8px;
                                        align-items: center;
                                    ">
                                        <select id="newReminderPriority" style="
                                            padding: 8px;
                                            border: 1px solid #333;
                                            border-radius: 4px;
                                            background: #1a1a1a;
                                            color: #ffffff;
                                            font-size: 12px;
                                        ">
                                            <option value="1">Low Priority</option>
                                            <option value="2">Medium Priority</option>
                                            <option value="3" selected>High Priority</option>
                                        </select>
                                        <button type="button" id="addProjectReminder" style="
                                            padding: 8px 16px;
                                            border: none;
                                            border-radius: 4px;
                                            background: #00d4ff;
                                            color: white;
                                            cursor: pointer;
                                            font-size: 12px;
                                            font-weight: 500;
                                        ">Add Reminder</button>
                                    </div>
                                </div>
                                
                                <div class="reminders-list" id="projectRemindersList" style="
                                    max-height: 300px;
                                    overflow-y: auto;
                                ">
                                    <!-- Reminders will be loaded here -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Add tab switching functionality
            const tabButtons = modal.querySelectorAll('.tab-button');
            const tabPanes = modal.querySelectorAll('.tab-pane');
            
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const targetTab = button.dataset.tab;
                    
                    // Update button styles
                    tabButtons.forEach(btn => {
                        btn.style.color = '#ccc';
                        btn.style.borderBottom = '2px solid transparent';
                    });
                    button.style.color = '#00d4ff';
                    button.style.borderBottom = '2px solid #00d4ff';
                    
                    // Show/hide tab content
                    tabPanes.forEach(pane => {
                        pane.style.display = 'none';
                    });
                    document.getElementById(`${targetTab}-tab`).style.display = 'block';
                    
                    // Load content when switching to notes or reminders
                    if (targetTab === 'notes') {
                        this.loadProjectNotes(project.id);
                    } else if (targetTab === 'reminders') {
                        this.loadProjectReminders(project.id);
                    }
                });
            });
            
            // Add recurring reminder toggle
            const recurringCheckbox = document.getElementById('newReminderRecurring');
            const recurrenceSelect = document.getElementById('newReminderRecurrence');
            
            recurringCheckbox.addEventListener('change', () => {
                recurrenceSelect.style.display = recurringCheckbox.checked ? 'block' : 'none';
            });
        }
        
        // Populate form with project data
        document.getElementById('editProjectName').value = project.name || '';
        document.getElementById('editProjectDescription').value = project.description || '';
        document.getElementById('editProjectType').value = project.type || 'general';
        document.getElementById('editProjectStatus').value = project.status || 'active';
        document.getElementById('editProjectPriority').value = project.priority || 1;
        
        // Store project ID for saving
        modal.dataset.projectId = project.id;
        
        // Load initial content
        this.loadProjectNotes(project.id);
        this.loadProjectReminders(project.id);
        
        // Show modal
        modal.style.display = 'flex';
        
        // Add event listeners
        this.addProjectModalEventListeners(modal, project);
    }

    addProjectModalEventListeners(modal, project) {
        // Add note functionality
        const addNoteBtn = document.getElementById('addProjectNote');
        const noteContent = document.getElementById('newNoteContent');
        const noteTags = document.getElementById('newNoteTags');
        
        if (addNoteBtn) {
            addNoteBtn.addEventListener('click', async () => {
                const content = noteContent.value.trim();
                if (!content) return;
                
                try {
                    const response = await ipcRenderer.invoke('project-action', {
                        action: 'add_project_note',
                        data: {
                            projectId: project.id,
                            content: content,
                            tags: noteTags.value.split(',').map(tag => tag.trim()).filter(tag => tag),
                            createdBy: 'manual'
                        }
                    });
                    
                    if (response.success) {
                        noteContent.value = '';
                        noteTags.value = '';
                        this.loadProjectNotes(project.id);
                        this.showNotification('Note added successfully', 'success');
                    } else {
                        this.showNotification('Failed to add note: ' + response.error, 'error');
                    }
                } catch (error) {
                    console.error('Error adding note:', error);
                    this.showNotification('Error adding note', 'error');
                }
            });
        }
        
        // Add reminder functionality
        const addReminderBtn = document.getElementById('addProjectReminder');
        const reminderTitle = document.getElementById('newReminderTitle');
        const reminderDescription = document.getElementById('newReminderDescription');
        const reminderDate = document.getElementById('newReminderDate');
        const reminderTime = document.getElementById('newReminderTime');
        const reminderRecurring = document.getElementById('newReminderRecurring');
        const reminderRecurrence = document.getElementById('newReminderRecurrence');
        const reminderPriority = document.getElementById('newReminderPriority');
        
        if (addReminderBtn) {
            addReminderBtn.addEventListener('click', async () => {
                const title = reminderTitle.value.trim();
                const date = reminderDate.value;
                const time = reminderTime.value;
                
                if (!title || !date || !time) {
                    this.showNotification('Please fill in title, date, and time', 'error');
                    return;
                }
                
                const reminderDateTime = new Date(`${date}T${time}`);
                
                try {
                    const reminderData = {
                        projectId: project.id,
                        title: title,
                        description: reminderDescription.value.trim(),
                        reminderDate: reminderDateTime.toISOString(),
                        isRecurring: reminderRecurring.checked,
                        priority: parseInt(reminderPriority.value),
                        createdBy: 'manual'
                    };
                    
                    if (reminderRecurring.checked) {
                        reminderData.recurrencePattern = {
                            type: reminderRecurrence.value,
                            interval: 1
                        };
                    }
                    
                    const response = await ipcRenderer.invoke('project-action', {
                        action: 'add_reminder',
                        data: reminderData
                    });
                    
                    if (response.success) {
                        reminderTitle.value = '';
                        reminderDescription.value = '';
                        reminderDate.value = '';
                        reminderTime.value = '';
                        reminderRecurring.checked = false;
                        reminderRecurrence.style.display = 'none';
                        reminderPriority.value = '3';
                        this.loadProjectReminders(project.id);
                        this.showNotification('Reminder added successfully', 'success');
                    } else {
                        this.showNotification('Failed to add reminder: ' + response.error, 'error');
                    }
                } catch (error) {
                    console.error('Error adding reminder:', error);
                    this.showNotification('Error adding reminder', 'error');
                }
            });
        }
        
        // Add existing modal event listeners
        const closeBtn = document.getElementById('closeEditModal');
        const cancelBtn = document.getElementById('cancelEditProject');
        const saveBtn = document.getElementById('saveEditProject');
        const form = document.getElementById('editProjectForm');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
                document.body.removeChild(modal);
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modal.style.display = 'none';
                document.body.removeChild(modal);
            });
        }
        
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProjectChanges(project.id);
            });
        }
    }
    
    setupEditModalListeners() {
        const modal = document.getElementById('editProjectModal');
        const closeBtn = document.getElementById('closeEditModal');
        const cancelBtn = document.getElementById('cancelEditProject');
        const form = document.getElementById('editProjectForm');
        
        // Close modal handlers
        const closeModal = () => {
            modal.style.display = 'none';
        };
        
        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;
        
        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };
        
        // Form submission
        form.onsubmit = async (e) => {
            e.preventDefault();
            await this.saveProjectEdits();
        };
    }
    
    async saveProjectEdits() {
        const modal = document.getElementById('editProjectModal');
        const projectId = modal.dataset.projectId;
        
        const updates = {
            name: document.getElementById('editProjectName').value.trim(),
            description: document.getElementById('editProjectDescription').value.trim(),
            type: document.getElementById('editProjectType').value,
            status: document.getElementById('editProjectStatus').value,
            priority: parseInt(document.getElementById('editProjectPriority').value)
        };
        
        // Validation
        if (!updates.name) {
            this.showError('Project name is required');
            return;
        }
        
        try {
            console.log('Updating project with ID:', projectId, 'Updates:', updates);
            const result = await ipcRenderer.invoke('edit-project', projectId, updates);
            console.log('Edit result:', result);
            
            if (result && result.success) {
                this.showSuccess('Project updated successfully!');
                modal.style.display = 'none';
                await this.loadProjects(); // Refresh the projects list
            } else {
                this.showError('Failed to update project: ' + (result?.error || result?.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error updating project:', error);
            this.showError('Failed to update project: ' + error.message);
        }
    }

    async loadProjectNotes(projectId) {
        try {
            const response = await ipcRenderer.invoke('project-action', {
                action: 'get_project_notes',
                data: { projectId: projectId, limit: 50 }
            });
            
            if (response.success) {
                this.displayProjectNotes(response.data);
            }
        } catch (error) {
            console.error('Error loading project notes:', error);
        }
    }
    
    displayProjectNotes(notes) {
        const notesList = document.getElementById('projectNotesList');
        if (!notesList) return;
        
        if (notes.length === 0) {
            notesList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No notes yet</div>';
            return;
        }
        
        notesList.innerHTML = notes.map(note => `
            <div class="note-item" style="
                background: #2a2a2a;
                padding: 16px;
                border-radius: 8px;
                margin-bottom: 12px;
                border-left: 3px solid #00d4ff;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 8px;
                ">
                    <div style="
                        font-size: 12px;
                        color: #999;
                    ">
                        ${new Date(note.created_at).toLocaleDateString()} ${new Date(note.created_at).toLocaleTimeString()}
                    </div>
                    <div style="
                        display: flex;
                        gap: 8px;
                    ">
                        ${note.tags ? note.tags.split(',').map(tag => tag.trim()).filter(tag => tag).map(tag => 
                            `<span style="
                                background: #00d4ff;
                                color: white;
                                padding: 2px 6px;
                                border-radius: 3px;
                                font-size: 10px;
                            ">${tag}</span>`
                        ).join('') : ''}
                    </div>
                </div>
                <div style="
                    color: #fff;
                    line-height: 1.4;
                    white-space: pre-wrap;
                ">${note.content}</div>
            </div>
        `).join('');
    }
    
    async loadProjectReminders(projectId) {
        try {
            const response = await ipcRenderer.invoke('project-action', {
                action: 'get_reminders',
                data: { projectId: projectId, includeInactive: false }
            });
            
            if (response.success) {
                this.displayProjectReminders(response.data);
            }
        } catch (error) {
            console.error('Error loading project reminders:', error);
        }
    }
    
    displayProjectReminders(reminders) {
        const remindersList = document.getElementById('projectRemindersList');
        if (!remindersList) return;
        
        if (reminders.length === 0) {
            remindersList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No reminders yet</div>';
            return;
        }
        
        remindersList.innerHTML = reminders.map(reminder => {
            const reminderDate = new Date(reminder.reminder_date);
            const isOverdue = reminderDate < new Date();
            const priorityColor = reminder.priority === 3 ? '#ff4444' : 
                                 reminder.priority === 2 ? '#ffaa00' : '#00d4ff';
            
            return `
                <div class="reminder-item" style="
                    background: #2a2a2a;
                    padding: 16px;
                    border-radius: 8px;
                    margin-bottom: 12px;
                    border-left: 3px solid ${priorityColor};
                    ${isOverdue ? 'border: 2px solid #ff4444;' : ''}
                ">
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 8px;
                    ">
                        <div style="
                            font-weight: 500;
                            color: #fff;
                            font-size: 14px;
                        ">${reminder.title}</div>
                        <div style="
                            display: flex;
                            gap: 8px;
                            align-items: center;
                        ">
                            ${reminder.is_recurring ? `<span style="
                                background: #00d4ff;
                                color: white;
                                padding: 2px 6px;
                                border-radius: 3px;
                                font-size: 10px;
                            ">Recurring</span>` : ''}
                            ${isOverdue ? `<span style="
                                background: #ff4444;
                                color: white;
                                padding: 2px 6px;
                                border-radius: 3px;
                                font-size: 10px;
                            ">Overdue</span>` : ''}
                            <button onclick="window.gptUI.snoozeReminder(${reminder.id})" style="
                                background: #666;
                                color: white;
                                border: none;
                                padding: 4px 8px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                            ">Snooze</button>
                            <button onclick="window.gptUI.deleteReminder(${reminder.id})" style="
                                background: #ff4444;
                                color: white;
                                border: none;
                                padding: 4px 8px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 10px;
                            ">Delete</button>
                        </div>
                    </div>
                    <div style="
                        color: #ccc;
                        font-size: 13px;
                        margin-bottom: 8px;
                    ">
                        📅 ${reminderDate.toLocaleDateString()} ${reminderDate.toLocaleTimeString()}
                    </div>
                    ${reminder.description ? `<div style="
                        color: #fff;
                        line-height: 1.4;
                        white-space: pre-wrap;
                    ">${reminder.description}</div>` : ''}
                </div>
            `;
        }).join('');
    }
    
    async snoozeReminder(reminderId) {
        const snoozeMinutes = prompt('Snooze for how many minutes?', '60');
        if (!snoozeMinutes) return;
        
        const snoozeUntil = new Date(Date.now() + parseInt(snoozeMinutes) * 60 * 1000);
        
        try {
            const response = await ipcRenderer.invoke('project-action', {
                action: 'snooze_reminder',
                data: { id: reminderId, snoozeUntil: snoozeUntil.toISOString() }
            });
            
            if (response.success) {
                this.showNotification('Reminder snoozed', 'success');
                // Reload reminders for current project
                const modal = document.getElementById('editProjectModal');
                if (modal) {
                    this.loadProjectReminders(modal.dataset.projectId);
                }
            }
        } catch (error) {
            console.error('Error snoozing reminder:', error);
            this.showNotification('Error snoozing reminder', 'error');
        }
    }
    
    async deleteReminder(reminderId) {
        if (!confirm('Are you sure you want to delete this reminder?')) return;
        
        try {
            const response = await ipcRenderer.invoke('project-action', {
                action: 'delete_reminder',
                data: { id: reminderId }
            });
            
            if (response.success) {
                this.showNotification('Reminder deleted', 'success');
                // Reload reminders for current project
                const modal = document.getElementById('editProjectModal');
                if (modal) {
                    this.loadProjectReminders(modal.dataset.projectId);
                }
            }
        } catch (error) {
            console.error('Error deleting reminder:', error);
            this.showNotification('Error deleting reminder', 'error');
        }
    }
    
    // Handle notification click events
    async handleNotificationClick(data) {
        console.log('🔔 Handling notification click:', data);
        
        // Switch to projects view
        this.switchProjectView('main');
        
        // Find and open the project
        if (data.projectId) {
            await this.openProject(data.projectId);
        }
    }
    
    // Test notification system
    async testNotification() {
        try {
            console.log('🔔 Frontend: Testing notification system...');
            
            const result = await ipcRenderer.invoke('test-system-notification');
            console.log('🔔 Frontend: Test notification result:', result);
            
            if (result.success) {
                this.showNotification('Test notification sent!', 'success');
            } else {
                this.showNotification('Failed to send notification: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('🔔 Frontend: Error testing notification:', error);
            this.showNotification('Error testing notification: ' + error.message, 'error');
        }
    }

    // Debug reminders
    async debugReminders() {
        try {
            console.log('🔍 Frontend: Debugging reminders...');
            
            const result = await ipcRenderer.invoke('debug-reminders');
            console.log('🔍 Frontend: Debug reminders result:', result);
            
            if (result.success) {
                console.log('🔍 All reminders:', result.allReminders);
                console.log('🔍 Due reminders:', result.dueReminders);
                console.log('🔍 Current time:', result.currentTime);
                
                this.showNotification(`Found ${result.allReminders?.length || 0} total reminders, ${result.dueReminders?.length || 0} due`, 'info');
            } else {
                this.showNotification('Failed to debug reminders: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('🔍 Frontend: Error debugging reminders:', error);
            this.showNotification('Error debugging reminders: ' + error.message, 'error');
        }
    }
}

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
