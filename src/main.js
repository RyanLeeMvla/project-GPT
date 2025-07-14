const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const JarvisCore = require('./core/jarvis-core');
const VoiceManager = require('./voice/voice-manager');
const SecurityManager = require('./security/security-manager');
const ProjectManager = require('./projects/project-manager');
const config = require('../config/settings.json');

class JarvisApp {
    constructor() {
        this.mainWindow = null;
        this.tray = null;
        this.jarvisCore = null;
        this.voiceManager = null;
        this.isListening = false;
        this.isInitialized = false;
    }

    async initialize() {
        console.log('🤖 JARVIS AI Agent Starting...');
        
        try {
            // Initialize core components
            this.jarvisCore = new JarvisCore(config.openai.apiKey);
            this.voiceManager = new VoiceManager();
            this.securityManager = new SecurityManager();
            this.projectManager = new ProjectManager();

            // Setup IPC handlers
            this.setupIPCHandlers();
            
            // Initialize components
            await this.jarvisCore.initialize();
            await this.voiceManager.initialize();
            await this.securityManager.initialize();
            await this.projectManager.initialize();

            this.isInitialized = true;
            console.log('✅ JARVIS initialized successfully');
            
            // Start voice listening if enabled
            if (config.autoStartListening) {
                this.startListening();
            }

        } catch (error) {
            console.error('❌ Failed to initialize JARVIS:', error);
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
            icon: path.join(__dirname, '../assets/jarvis-icon.png'),
            show: false, // Start hidden
            skipTaskbar: true
        });

        this.mainWindow.loadFile(path.join(__dirname, 'ui/index.html'));

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
            this.mainWindow.webContents.openDevTools();
        }
    }

    createTray() {
        this.tray = new Tray(path.join(__dirname, '../assets/jarvis-tray.png'));
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show JARVIS',
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
                label: 'Quit JARVIS',
                click: () => {
                    app.isQuiting = true;
                    app.quit();
                }
            }
        ]);

        this.tray.setContextMenu(contextMenu);
        this.tray.setToolTip('JARVIS AI Agent');
        
        this.tray.on('double-click', () => {
            this.mainWindow.show();
        });
    }

    setupIPCHandlers() {
        // Voice control handlers
        ipcMain.handle('start-listening', () => {
            return this.startListening();
        });

        ipcMain.handle('stop-listening', () => {
            return this.stopListening();
        });

        // AI interaction handlers
        ipcMain.handle('send-command', async (event, command) => {
            return await this.jarvisCore.processCommand(command);
        });

        // Project management handlers
        ipcMain.handle('get-projects', async () => {
            return await this.projectManager.getAllProjects();
        });

        ipcMain.handle('create-project', async (event, projectData) => {
            return await this.projectManager.createProject(projectData);
        });

        // System status handlers
        ipcMain.handle('get-status', () => {
            return {
                isListening: this.isListening,
                isInitialized: this.isInitialized,
                uptime: process.uptime()
            };
        });
    }

    async startListening() {
        if (!this.isInitialized) {
            console.log('⚠️ JARVIS not yet initialized');
            return false;
        }

        try {
            await this.voiceManager.startListening((command) => {
                this.handleVoiceCommand(command);
            });
            
            this.isListening = true;
            console.log('🎤 JARVIS is now listening...');
            
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
            await this.voiceManager.stopListening();
            this.isListening = false;
            console.log('🔇 JARVIS stopped listening');
            
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
                    label: 'Show JARVIS',
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
                    label: 'Quit JARVIS',
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
            
            if (lowerCommand.includes('jarvis') || lowerCommand.includes('gpt, log that instance')) {
                // Process the command through JARVIS core
                const response = await this.jarvisCore.processCommand(command);
                
                // Send response to UI
                if (this.mainWindow) {
                    this.mainWindow.webContents.send('jarvis-response', {
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
}

// Electron app lifecycle
const jarvisApp = new JarvisApp();

app.whenReady().then(async () => {
    await jarvisApp.initialize();
    jarvisApp.createWindow();
});

app.on('window-all-closed', () => {
    // Keep running in background on all platforms
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        jarvisApp.createWindow();
    }
});

// Handle app closing
app.on('before-quit', () => {
    app.isQuiting = true;
});

// Export for testing
module.exports = JarvisApp;
