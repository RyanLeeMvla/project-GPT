const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const GptCore = require('./core/gpt-core');
const VoiceManager = require('./voice/voice-manager');
const SecurityManager = require('./security/security-manager');
const ProjectManager = require('./projects/project-manager');
const config = require('../config/settings.json');

class GptApp {
    constructor() {
        this.mainWindow = null;
        this.tray = null;
        this.gptCore = null;
        this.voiceManager = null;
        this.isListening = false;
        this.isInitialized = false;
    }

    async initialize() {
        console.log('🤖 GPT AI Agent Starting...');
        
        try {
            // Initialize core components (except voice manager)
            this.gptCore = new GptCore(config.openai.apiKey);
            this.securityManager = new SecurityManager();
            this.projectManager = new ProjectManager();

            // Setup IPC handlers
            this.setupIPCHandlers();
            
            // Initialize components (voice manager will be initialized after window creation)
            await this.gptCore.initialize();
            await this.securityManager.initialize();
            await this.projectManager.initialize();

            this.isInitialized = true;
            console.log('✅ GPT initialized successfully');
            
            // Voice manager will be initialized after window creation

        } catch (error) {
            console.error('❌ Failed to initialize GPT:', error);
            throw error;
        }
    }

    createWindow() {
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

        // AI interaction handlers
        ipcMain.handle('send-command', async (event, command) => {
            const result = await this.gptCore.processCommand(command);
            
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
    }

    async startListening() {
        if (!this.isInitialized) {
            console.log('⚠️ GPT not yet initialized');
            return false;
        }

        try {
            if (!this.voiceManager) {
                console.log('⚠️ Voice Manager not initialized yet');
                return false;
            }
            
            await this.voiceManager.startListening((command) => {
                this.handleVoiceCommand(command);
            });
            
            this.isListening = true;
            console.log('🎤 GPT is now listening...');
            
            // Update tray menu
            this.updateTrayMenu();
            
            return true;
        } catch (error) {
            console.error('❌ Failed to start listening:', error);
            return false;
        }
    }

    async stopListening() {
        try {
            if (!this.voiceManager) {
                console.log('⚠️ Voice Manager not initialized yet');
                return;
            }
            
            await this.voiceManager.stopListening();
            this.isListening = false;
            console.log('🔇 GPT stopped listening');
            
            // Update tray menu
            this.updateTrayMenu();
            
            return true;
        } catch (error) {
            console.error('❌ Failed to stop listening:', error);
            return false;
        }
    }

    updateTrayMenu() {
        if (this.tray) {
            const contextMenu = Menu.buildFromTemplate([
                {
                    label: 'Show GPT',
                    click: () => this.mainWindow.show()
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
        }
    }

    async handleVoiceCommand(command) {
        console.log(`🎤 Voice command received: "${command}"`);
        
        try {
            // Check for wake words
            const lowerCommand = command.toLowerCase();
            
            if (lowerCommand.includes('gpt') || lowerCommand.includes('gpt, log that instance')) {
                // Process the command through GPT core
                const response = await this.gptCore.processCommand(command);
                
                // Send response to UI
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('gpt-response', {
                        command: command,
                        response: response,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Speak the response if TTS is enabled
                if (config.tts.enabled && response.shouldSpeak) {
                    await this.voiceManager.speak(response.message);
                }
            }
        } catch (error) {
            console.error('❌ Error processing voice command:', error);
        }
    }

    async initializeVoiceManager() {
        try {
            console.log('🎤 Initializing Voice Manager...');
            // Initialize voice manager with window reference
            this.voiceManager = new VoiceManager(this.mainWindow);
            await this.voiceManager.initialize();
            console.log('✅ Voice Manager initialized with window reference');
        } catch (error) {
            console.error('❌ Failed to initialize Voice Manager:', error);
        }
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
});

// Export for testing
module.exports = GptApp;
