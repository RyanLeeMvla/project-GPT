const { app, BrowserWindow, ipcMain, Menu, Tray, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const GptCore = require('./core/gpt-core');
const VoiceManager = require('./voice/voice-manager');
const SecurityManager = require('./security/security-manager');
const ProjectManager = require('./projects/project-manager');
const CodeRewriter = require('./core/code-rewriter');
const config = require('../config/settings.json');

class GptApp {
    constructor() {
        this.mainWindow = null;
        this.tray = null;
        this.gptCore = null;
        this.voiceManager = null;
        this.codeRewriter = null;
        this.isListening = false;
        this.isInitialized = false;
        this.reminderCheckInterval = null;
        this.notificationHistory = new Map();
    }

    async initialize() {
        console.log('🤖 GPT AI Agent Starting...');
        
        try {
            // Initialize core components with model configuration
            const modelConfig = config.openai.models || {
                chat: { model: "gpt-3.5-turbo", maxTokens: 1000, temperature: 0.7 },
                codeGeneration: { model: "gpt-4o", maxTokens: 4000, temperature: 0.2 },
                complexReasoning: { model: "o1-preview", maxTokens: 8000, temperature: 1.0 },
                fallback: "gpt-4-turbo"
            };
            
            this.gptCore = new GptCore(config.openai.apiKey, modelConfig);
            this.securityManager = new SecurityManager();
            this.projectManager = new ProjectManager();
            this.codeRewriter = new CodeRewriter();

            // Setup IPC handlers
            this.setupIPCHandlers();
            
            // Initialize components (voice manager will be initialized after window creation)
            await this.gptCore.initialize();
            await this.securityManager.initialize();
            await this.projectManager.initialize();
            await this.codeRewriter.initialize();
            
            // Connect codeRewriter to GPT core for adaptive functionality
            this.gptCore.codeRewriter = this.codeRewriter;
            this.gptCore.setCodeRewriter = (codeRewriter) => { this.gptCore.codeRewriter = codeRewriter; };
            
            // Connect code rewriter to GPT core for adaptive functionality
            this.gptCore.setCodeRewriter(this.codeRewriter);

            this.isInitialized = true;
            console.log('✅ GPT initialized successfully');
            
            // Initialize notification system
            this.initializeNotificationSystem();
            
            // Voice manager will be initialized after window creation

        } catch (error) {
            console.error('❌ Failed to initialize GPT:', error);
            throw error;
        }
    }

    createWindow() {
        // Set App User Model ID for Windows notifications
        if (process.platform === 'win32') {
            app.setAppUserModelId('com.projectgpt.app');
        }
        
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
            icon: path.join(__dirname, '../assets/gpt-icon.png'),
            show: true, // Show the window immediately
            skipTaskbar: false, // Show in taskbar
            title: 'GPT AI Agent'
        });

        // Load the HTML file
        const htmlPath = path.join(__dirname, 'ui/index.html');
        console.log('📱 Loading UI from:', htmlPath);
        
        this.mainWindow.loadFile(htmlPath)
            .then(async () => {
                console.log('✅ UI loaded successfully');
                this.mainWindow.show(); // Ensure window is visible
                
                // Set main window reference for debug messaging
                if (this.gptCore) {
                    this.gptCore.setMainWindow(this.mainWindow);
                }
                
                // Initialize voice manager now that window is ready
                await this.initializeVoiceManager();
            })
            .catch((error) => {
                console.error('❌ Failed to load UI:', error);
            });

        // Create system tray
        this.createTray();

        // Hide window instead of closing
        this.mainWindow.on('close', (event) => {
            if (!app.isQuiting) {
                event.preventDefault();
                this.mainWindow.hide();
            }
        });

        if (process.argv.includes('--dev')) {
            // Uncomment the line below if you want DevTools to auto-open in dev mode
            // this.mainWindow.webContents.openDevTools();
        }
    }

    createTray() {
        const iconPath = path.join(__dirname, '../assets/gpt-tray.svg');
        try {
            this.tray = new Tray(iconPath);
        } catch (error) {
            console.log('⚠️ Tray icon not found, skipping tray creation');
            return;
        }
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show GPT',
                click: () => {
                    this.mainWindow.show();
                }
            },
            {
                label: this.isListening ? 'Stop Listening' : 'Start Listening',
                click: () => {
                    if (this.isListening) {
                        this.stopListening();
                    } else {
                        this.startListening();
                    }
                }
            },
            {
                label: 'Settings',
                click: () => {
                    this.mainWindow.show();
                    this.mainWindow.webContents.send('navigate-to', 'settings');
                }
            },
            { type: 'separator' },
            {
                label: 'Quit GPT',
                click: () => {
                    app.isQuiting = true;
                    app.quit();
                }
            }
        ]);

        this.tray.setContextMenu(contextMenu);
        this.tray.setToolTip('GPT AI Agent');
        
        this.tray.on('double-click', () => {
            this.mainWindow.show();
        });
    }

    async initializeVoiceManager() {
        try {
            this.voiceManager = new VoiceManager(this.mainWindow);
            await this.voiceManager.initialize();
            console.log('🎤 Voice Manager initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Voice Manager:', error);
        }
    }

    initializeNotificationSystem() {
        console.log('🔔 Initializing notification system...');
        
        // Check if notifications are supported
        if (!Notification.isSupported()) {
            console.log('⚠️ System notifications not supported on this platform');
            return;
        } else {
            console.log('✅ System notifications are supported');
        }
        
        // Start checking for due reminders every 30 seconds
        this.reminderCheckInterval = setInterval(() => {
            this.checkDueReminders();
        }, 30000); // Check every 30 seconds
        
        // Also check immediately
        setTimeout(() => {
            this.checkDueReminders();
        }, 5000); // Wait 5 seconds after startup
        
        console.log('✅ Notification system initialized');
    }
    
    async checkDueReminders() {
        try {
            // Get all due reminders
            const result = await this.projectManager.executeAction({
                action: 'get_due_reminders',
                data: {}
            });
            
            if (result.success && result.data && result.data.length > 0) {
                console.log(`🔔 Found ${result.data.length} due reminders`);
                
                for (const reminder of result.data) {
                    await this.showReminderNotification(reminder);
                }
            }
        } catch (error) {
            console.error('Error checking due reminders:', error);
        }
    }
    
    async showReminderNotification(reminder) {
        try {
            console.log('🔔 Attempting to show notification for reminder:', reminder.title);
            
            // Check if we've already shown this reminder recently (within last 10 minutes)
            const reminderKey = `${reminder.id}-${reminder.reminder_date}`;
            const lastShown = this.notificationHistory.get(reminderKey);
            const now = new Date();
            
            if (lastShown && (now - lastShown) < 10 * 60 * 1000) {
                console.log('🔔 Skipping notification - already shown recently for:', reminder.title);
                return; // Don't show again within 10 minutes
            }
            
            // Get project name for context
            const projectResult = await this.projectManager.executeAction({
                action: 'get_project',
                data: { id: reminder.project_id }
            });
            
            const projectName = projectResult.success ? projectResult.data.name : 'Unknown Project';
            console.log('🔔 Project name for notification:', projectName);
            
            // Check if main window exists for debugging
            console.log('🔔 Main window exists:', !!this.mainWindow);
            
            // Create notification options
            const notificationOptions = {
                title: `📅 Project Reminder: ${reminder.title}`,
                body: `${projectName}\n${reminder.description || 'No description'}`,
                icon: path.join(__dirname, '../assets/gpt-icon.png'),
                urgency: reminder.priority === 3 ? 'critical' : reminder.priority === 2 ? 'normal' : 'low',
                timeoutType: 'never', // Don't auto-dismiss
                sound: 'default',
                silent: false, // Make sure sound is enabled
                tag: `reminder-${reminder.id}`, // Unique tag for this reminder
                renotify: true, // Allow renotification
                actions: [
                    {
                        type: 'button',
                        text: 'Snooze 15 min'
                    },
                    {
                        type: 'button', 
                        text: 'Mark Done'
                    }
                ]
            };
            
            console.log('🔔 Creating notification with options:', JSON.stringify(notificationOptions, null, 2));
            
            // Create the notification
            const notification = new Notification(notificationOptions);
            
            console.log('🔔 Notification object created successfully');
            
            // Handle notification events
            notification.on('click', () => {
                console.log('🔔 Reminder notification clicked for:', reminder.title);
                
                // Show main window and navigate to project
                if (this.mainWindow) {
                    this.mainWindow.show();
                    this.mainWindow.webContents.send('show-project-reminder', {
                        projectId: reminder.project_id,
                        reminderId: reminder.id
                    });
                    console.log('🔔 Sent show-project-reminder IPC message');
                } else {
                    console.log('⚠️ Main window not available for navigation');
                }
            });
            
            notification.on('action', async (event, index) => {
                console.log('🔔 Notification action clicked:', index, 'for reminder:', reminder.title);
                
                if (index === 0) {
                    // Snooze for 15 minutes
                    console.log('🔔 Snoozing reminder for 15 minutes');
                    const snoozeUntil = new Date(Date.now() + 15 * 60 * 1000);
                    await this.projectManager.executeAction({
                        action: 'snooze_reminder',
                        data: {
                            id: reminder.id,
                            snoozeUntil: snoozeUntil.toISOString()
                        }
                    });
                    
                    // Show confirmation
                    const snoozeNotification = new Notification({
                        title: 'Reminder Snoozed',
                        body: `"${reminder.title}" snoozed for 15 minutes`,
                        icon: path.join(__dirname, '../assets/gpt-icon.png')
                    });
                    snoozeNotification.show();
                    console.log('🔔 Snooze confirmation notification shown');
                    
                } else if (index === 1) {
                    // Mark as done (deactivate)
                    console.log('🔔 Marking reminder as done');
                    await this.projectManager.executeAction({
                        action: 'update_reminder',
                        data: {
                            id: reminder.id,
                            isActive: false
                        }
                    });
                    
                    // Show confirmation
                    const doneNotification = new Notification({
                        title: 'Reminder Completed',
                        body: `"${reminder.title}" marked as done`,
                        icon: path.join(__dirname, '../assets/gpt-icon.png')
                    });
                    doneNotification.show();
                    console.log('🔔 Completion confirmation notification shown');
                }
            });
            
            notification.on('show', () => {
                console.log('🔔 Notification successfully shown for:', reminder.title);
            });
            
            notification.on('close', () => {
                console.log('🔔 Notification closed for:', reminder.title);
            });
            
            notification.on('error', (error) => {
                console.error('🔔 Notification error for:', reminder.title, error);
            });
            
            // Show the notification
            console.log('🔔 Calling notification.show()...');
            notification.show();
            
            // Remember that we showed this notification
            this.notificationHistory.set(reminderKey, now);
            
            console.log(`🔔 Notification process completed for reminder: ${reminder.title}`);
            
        } catch (error) {
            console.error('❌ Error showing reminder notification:', error);
            console.error('❌ Stack trace:', error.stack);
        }
    }

    setupIPCHandlers() {
        // Log handler for frontend debugging
        ipcMain.on('log-message', (event, message) => {
            console.log(message);
        });
        
        // Setup and configuration handlers
        ipcMain.handle('check-setup-status', async () => {
            try {
                const configPath = path.join(__dirname, '../config/settings.json');
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                
                // Check if API key exists and is not the placeholder
                const apiKey = config.openai.apiKey;
                const needsSetup = !apiKey || 
                                 apiKey === 'YOUR_OPENAI_API_KEY_HERE' || 
                                 apiKey.trim() === '' ||
                                 !apiKey.startsWith('sk-');
                
                console.log('🔍 Setup check - API key configured:', !needsSetup);
                return needsSetup;
            } catch (error) {
                console.log('⚠️ Error checking setup status, assuming setup needed:', error.message);
                return true; // Show setup if config is missing
            }
        });

        ipcMain.handle('test-api-key', async (event, apiKey) => {
            try {
                const { OpenAI } = require('openai');
                const openai = new OpenAI({ apiKey });
                
                // Test with a simple completion
                const response = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 5
                });
                
                return true;
            } catch (error) {
                console.error('API key test failed:', error);
                return false;
            }
        });

        ipcMain.handle('save-api-key', async (event, apiKey) => {
            try {
                const configPath = path.join(__dirname, '../config/settings.json');
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                
                config.openai.apiKey = apiKey;
                
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                
                // Reinitialize GPT Core with new API key
                this.gptCore = new GptCore(apiKey);
                await this.gptCore.initialize();
                
                return true;
            } catch (error) {
                console.error('Error saving API key:', error);
                throw error;
            }
        });

        ipcMain.handle('save-settings', async (event, settings) => {
            try {
                const configPath = path.join(__dirname, '../config/settings.json');
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                
                if (settings.apiKey) config.openai.apiKey = settings.apiKey;
                if (settings.model) config.openai.model = settings.model;
                
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                
                return true;
            } catch (error) {
                console.error('Error saving settings:', error);
                throw error;
            }
        });

        ipcMain.handle('save-printer-settings', async (event, settings) => {
            try {
                const configPath = path.join(__dirname, '../config/fabrication.json');
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                
                if (settings.printerIP) {
                    config.bambuLab.printers[0].ip = settings.printerIP;
                }
                if (settings.accessCode) {
                    config.bambuLab.printers[0].accessCode = settings.accessCode;
                }
                
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                
                return true;
            } catch (error) {
                console.error('Error saving printer settings:', error);
                throw error;
            }
        });

        // Voice control handlers
        ipcMain.handle('start-listening', () => {
            return this.startListening();
        });

        ipcMain.handle('stop-listening', () => {
            return this.stopListening();
        });

        // AI interaction handlers with model selection
        ipcMain.handle('send-command', async (event, command, options = {}) => {
            const modelType = options.modelType || 'chat'; // default to chat model
            const result = await this.gptCore.processCommand(command, modelType);
            
            // Check if this was a project management command and broadcast update
            const projectKeywords = ['project', 'move', 'stage', 'status', 'create', 'update', 'planning', 'testing', 'completed'];
            const isProjectCommand = projectKeywords.some(keyword => 
                command.toLowerCase().includes(keyword) || 
                (result.message && result.message.toLowerCase().includes(keyword))
            );
            
            if (isProjectCommand && this.mainWindow) {
                console.log('📡 Broadcasting project update to frontend...');
                this.mainWindow.webContents.send('projects-updated');
            }
            
            return result;
        });

        // Project management handlers
        ipcMain.handle('get-projects', async () => {
            return await this.projectManager.getAllProjects();
        });

        ipcMain.handle('create-project', async (event, projectData) => {
            return await this.projectManager.createProject(projectData);
        });

        ipcMain.handle('delete-project', async (event, projectId) => {
            return await this.projectManager.deleteProject(projectId);
        });

        ipcMain.handle('edit-project', async (event, projectId, updates) => {
            return await this.projectManager.updateProject(projectId, updates);
        });

        // Generic project action handler for notes and reminders
        ipcMain.handle('project-action', async (event, actionData) => {
            try {
                console.log('🔧 Project action received:', actionData);
                return await this.projectManager.executeAction(actionData);
            } catch (error) {
                console.error('Error executing project action:', error);
                return { success: false, error: error.message };
            }
        });

        // Notification handlers
        ipcMain.handle('show-notification', async (event, options) => {
            try {
                console.log('🔔 IPC: show-notification called with options:', options);
                
                if (!Notification.isSupported()) {
                    console.log('⚠️ IPC: Notifications not supported');
                    return { success: false, error: 'Notifications not supported on this platform' };
                }
                
                const notification = new Notification(options);
                
                notification.on('show', () => {
                    console.log('🔔 IPC: Test notification shown successfully');
                });
                
                notification.on('error', (error) => {
                    console.error('🔔 IPC: Test notification error:', error);
                });
                
                notification.show();
                console.log('🔔 IPC: Test notification.show() called');
                
                return { success: true };
            } catch (error) {
                console.error('❌ IPC: Error showing notification:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('test-system-notification', async (event) => {
            try {
                console.log('🔔 IPC: test-system-notification called');
                
                if (!Notification.isSupported()) {
                    console.log('⚠️ IPC: System notifications not supported');
                    return { success: false, error: 'System notifications not supported on this platform' };
                }
                
                // First try a simple notification without actions
                const simpleNotification = new Notification({
                    title: 'ProjectGPT Simple Test',
                    body: 'This is a simple test notification - no actions',
                    icon: path.join(__dirname, '../assets/gpt-icon.png'),
                    silent: false,
                    urgency: 'normal'
                });
                
                simpleNotification.on('show', () => {
                    console.log('🔔 IPC: Simple test notification shown successfully');
                });
                
                simpleNotification.on('click', () => {
                    console.log('🔔 IPC: Simple test notification clicked');
                });
                
                simpleNotification.on('error', (error) => {
                    console.error('🔔 IPC: Simple test notification error:', error);
                });
                
                simpleNotification.show();
                console.log('🔔 IPC: Simple test notification.show() called');
                
                // Wait a bit, then try a notification with actions
                setTimeout(() => {
                    try {
                        const actionNotification = new Notification({
                            title: 'ProjectGPT Action Test',
                            body: 'This notification has action buttons',
                            icon: path.join(__dirname, '../assets/gpt-icon.png'),
                            silent: false,
                            urgency: 'normal',
                            actions: [
                                {
                                    type: 'button',
                                    text: 'Test Action'
                                }
                            ]
                        });
                        
                        actionNotification.on('show', () => {
                            console.log('🔔 IPC: Action test notification shown successfully');
                        });
                        
                        actionNotification.on('error', (error) => {
                            console.error('🔔 IPC: Action test notification error:', error);
                        });
                        
                        actionNotification.show();
                        console.log('🔔 IPC: Action test notification.show() called');
                        
                    } catch (error) {
                        console.error('🔔 IPC: Error with action notification:', error);
                    }
                }, 2000);
                
                return { success: true, message: 'Test notifications sent' };
            } catch (error) {
                console.error('❌ IPC: Error showing test notification:', error);
                return { success: false, error: error.message };
            }
        });

        // Debug handler to check reminders
        ipcMain.handle('debug-reminders', async (event) => {
            try {
                console.log('🔍 DEBUG: Checking all reminders...');
                
                // Get all reminders
                const allReminders = await this.projectManager.executeAction({
                    action: 'get_reminders',
                    data: { projectId: null, includeInactive: true }
                });
                
                console.log('🔍 DEBUG: All reminders:', JSON.stringify(allReminders, null, 2));
                
                // Get due reminders
                const dueReminders = await this.projectManager.executeAction({
                    action: 'get_due_reminders',
                    data: {}
                });
                
                console.log('🔍 DEBUG: Due reminders:', JSON.stringify(dueReminders, null, 2));
                
                const now = new Date();
                console.log('🔍 DEBUG: Current time:', now.toISOString());
                
                return { 
                    success: true, 
                    allReminders: allReminders.data,
                    dueReminders: dueReminders.data,
                    currentTime: now.toISOString()
                };
            } catch (error) {
                console.error('❌ DEBUG: Error checking reminders:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-due-reminders', async () => {
            try {
                return await this.projectManager.executeAction({
                    action: 'get_due_reminders',
                    data: {}
                });
            } catch (error) {
                console.error('Error getting due reminders:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle notification actions
        ipcMain.on('show-project-reminder', (event, data) => {
            console.log('🔔 Showing project reminder:', data);
            // This will be handled by the frontend
        });

        // Add missing IPC handlers for project management
        ipcMain.handle('get-all-tasks', async () => {
            try {
                // For now, return empty array since we don't have a dedicated tasks table in use
                // This can be extended later to include actual task data
                return [];
            } catch (error) {
                console.error('Error getting tasks:', error);
                return [];
            }
        });

        ipcMain.handle('get-project-timeline', async (event, projectId = null) => {
            try {
                if (projectId) {
                    return await this.projectManager.getProjectTimeline(projectId);
                } else {
                    // Return all timeline events if no specific project ID
                    return [];
                }
            } catch (error) {
                console.error('Error getting project timeline:', error);
                return [];
            }
        });

        ipcMain.handle('get-notes', async (event, projectId = null) => {
            try {
                const notes = await this.projectManager.getNotes(projectId);
                return { notes: notes };
            } catch (error) {
                console.error('Error getting notes:', error);
                return { notes: [] };
            }
        });

        // System status handlers
        ipcMain.handle('get-status', () => {
            return {
                isListening: this.isListening,
                isInitialized: this.isInitialized,
                uptime: process.uptime()
            };
        });

        ipcMain.handle('check-gpt-status', async () => {
            try {
                // Check if GPT core is initialized and API key is valid
                if (this.gptCore && this.isInitialized) {
                    const configPath = path.join(__dirname, '../config/settings.json');
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    const apiKey = config.openai.apiKey;
                    
                    return apiKey && 
                           apiKey !== 'YOUR_OPENAI_API_KEY_HERE' && 
                           apiKey.startsWith('sk-') && 
                           apiKey.trim() !== '';
                }
                return false;
            } catch (error) {
                console.error('Error checking GPT status:', error);
                return false;
            }
        });

        // Code rewriting handlers
        ipcMain.handle('rewrite-code', async (event, conversation, actionType) => {
            try {
                console.log('🔧 Starting code rewrite for action:', actionType);
                
                // Get full source context
                const sourceContext = this.codeRewriter.getSourceContext();
                
                // Create backup
                const backupId = await this.codeRewriter.createBackup();
                
                // Generate code changes using GPT
                const prompt = this.buildCodeRewritePrompt(conversation, sourceContext, actionType);
                const codeResponse = await this.gptCore.processCommand(prompt, 'codeGeneration');
                
                // Parse the response to get structured code changes
                let codeChanges;
                try {
                    const jsonMatch = codeResponse.match(/\{[\s\S]*\}/);
                    codeChanges = JSON.parse(jsonMatch ? jsonMatch[0] : codeResponse);
                } catch (parseError) {
                    throw new Error('Failed to parse code generation response');
                }
                
                // Apply the code changes
                await this.codeRewriter.applyCodeChanges(codeChanges.changes);
                
                return {
                    success: true,
                    description: codeChanges.description,
                    needsRestart: codeChanges.needsRestart || false,
                    backupId: backupId
                };
                
            } catch (error) {
                console.error('❌ Code rewrite failed:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        ipcMain.handle('get-source-context', async () => {
            return this.codeRewriter.getSourceContext();
        });

        ipcMain.handle('restore-backup', async (event, backupId) => {
            try {
                await this.codeRewriter.restoreBackup(backupId);
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('trigger-restart', async () => {
            try {
                console.log('🔄 Restart triggered by frontend');
                await this.codeRewriter.triggerRestart();
                return { success: true };
            } catch (error) {
                console.error('Error triggering restart:', error);
                return { success: false, error: error.message };
            }
        });

        // ========================
        // AUTONOMOUS PERMANENT MODIFICATION HANDLERS
        // ========================
        
        // Enable autonomous permanent code changes
        ipcMain.handle('enable-autonomous-changes', async (event, conversation) => {
            try {
                console.log('🤖 AUTONOMOUS MODE: Enabling permanent code modifications...');
                
                // Add progress update callback to GPT core
                this.gptCore.sendProgressUpdate = (step, progress, message) => {
                    if (this.mainWindow) {
                        this.mainWindow.webContents.send('rewriting-progress', {
                            step, progress, message
                        });
                    }
                };
                
                // Get full source context
                const sourceContext = this.codeRewriter.getSourceContext();
                
                // Apply autonomous permanent changes with backup safety
                const result = await this.codeRewriter.generateAndApplyChanges(
                    conversation, 
                    sourceContext, 
                    this.gptCore
                );
                
                // Clean up progress callback
                delete this.gptCore.sendProgressUpdate;
                
                // Send completion notification
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('rewriting-complete', {
                        success: true,
                        message: `${result.successCount || 0} changes applied successfully`
                    });
                }
                
                // Broadcast update to frontend if changes were made
                if (result.successCount > 0 && this.mainWindow) {
                    this.mainWindow.webContents.send('autonomous-changes-applied', {
                        changesCount: result.successCount,
                        description: result.description
                    });
                }
                
                return {
                    success: true,
                    ...result
                };
                
            } catch (error) {
                console.error('❌ AUTONOMOUS MODE FAILED:', error);
                
                // Clean up progress callback
                delete this.gptCore.sendProgressUpdate;
                
                // Send failure notification
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('rewriting-complete', {
                        success: false,
                        error: error.message
                    });
                }
                
                return {
                    success: false,
                    error: error.message,
                    autonomousMode: true
                };
            }
        });
        
        // Rollback autonomous changes
        ipcMain.handle('autonomous-rollback', async (event, backupIndex = 0) => {
            try {
                console.log(`🔄 AUTONOMOUS ROLLBACK: Requesting rollback to backup ${backupIndex}...`);
                
                const result = await this.codeRewriter.autonomousRollback(backupIndex);
                
                // Broadcast rollback completion to frontend
                if (result.success && this.mainWindow) {
                    this.mainWindow.webContents.send('autonomous-rollback-completed', result);
                }
                
                return result;
                
            } catch (error) {
                console.error('❌ AUTONOMOUS ROLLBACK FAILED:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });
        
        // Get available backups for rollback UI
        ipcMain.handle('get-backup-list', async () => {
            try {
                const backups = await this.codeRewriter.getBackupList();
                return {
                    success: true,
                    backups: backups
                };
            } catch (error) {
                console.error('❌ GET BACKUP LIST FAILED:', error);
                return {
                    success: false,
                    error: error.message,
                    backups: []
                };
            }
        });
    }

    buildCodeRewritePrompt(conversation, sourceContext, actionType) {
        return `
CONTEXT: You are a code rewriting agent that dynamically adds missing functionality to applications.

MISSING ACTION: ${actionType}
CONVERSATION: ${conversation.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

CURRENT CODEBASE STRUCTURE:
${Object.entries(sourceContext).map(([file, info]) => 
    `${file}: ${info.classes.join(', ')} | functions: ${info.functions.join(', ')}`
).join('\n')}

KEY SOURCE FILES:
${Object.entries(sourceContext).slice(0, 3).map(([file, info]) => 
    `\n=== ${file} ===\n${info.content.substring(0, 3000)}...`
).join('\n')}

TASK: Generate JSON with specific code changes to implement the missing "${actionType}" functionality.

REQUIREMENTS:
1. Add the missing functionality to handle "${actionType}"
2. Integrate seamlessly with existing code patterns
3. Include proper error handling
4. Update multiple files if needed (backend + frontend)

RESPONSE FORMAT (JSON only, no markdown):
{
    "changes": [
        {
            "filePath": "src/path/to/file.js",
            "operation": "addMethod|updateMethod|insertAfter|replaceSection",
            "method": "methodName",
            "content": "complete working code",
            "search": "text to find for replacement",
            "insertAfter": "text to insert after"
        }
    ],
    "description": "Added ${actionType} functionality with full CRUD operations",
    "needsRestart": false
}`;
    }
}

// Electron app lifecycle
const gptApp = new GptApp();

app.whenReady().then(async () => {
    await gptApp.initialize();
    gptApp.createWindow();
});

app.on('window-all-closed', () => {
    // Keep running in background on all platforms
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        gptApp.createWindow();
    }
});

// Handle app closing
app.on('before-quit', () => {
    app.isQuiting = true;
    
    // Clean up notification system
    if (gptApp.reminderCheckInterval) {
        clearInterval(gptApp.reminderCheckInterval);
    }
});

// Export for testing
module.exports = GptApp;
