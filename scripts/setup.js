const fs = require('fs');
const path = require('path');
const readline = require('readline');

class SetupWizard {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.config = {};
    }

    async run() {
        console.log('🤖 Welcome to JARVIS AI Agent Setup!\n');
        console.log('This wizard will help you configure your JARVIS AI Agent.\n');
        
        try {
            // OpenAI API Key
            await this.setupOpenAI();
            
            // Voice settings
            await this.setupVoice();
            
            // Security settings
            await this.setupSecurity();
            
            // Bambu Lab printer (optional)
            await this.setupBambuLab();
            
            // Save configuration
            await this.saveConfig();
            
            console.log('\n✅ Setup completed successfully!');
            console.log('\nYou can now run JARVIS with: npm start');
            console.log('\nTo change settings later, edit config/settings.json');
            
        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
        } finally {
            this.rl.close();
        }
    }

    async setupOpenAI() {
        console.log('📡 OpenAI Configuration');
        console.log('You need an OpenAI API key to use JARVIS.');
        console.log('Get one at: https://platform.openai.com/api-keys\n');
        
        const apiKey = await this.question('Enter your OpenAI API key: ');
        
        if (!apiKey || apiKey.length < 10) {
            throw new Error('Invalid OpenAI API key provided');
        }
        
        this.config.openai = {
            apiKey: apiKey,
            model: 'gpt-4',
            maxTokens: 1000,
            temperature: 0.7
        };
        
        console.log('✅ OpenAI configuration saved\n');
    }

    async setupVoice() {
        console.log('🎤 Voice Configuration');
        
        const enableVoice = await this.question('Enable voice control? (y/n): ');
        const voiceEnabled = enableVoice.toLowerCase().startsWith('y');
        
        let autoStart = false;
        if (voiceEnabled) {
            const autoStartAnswer = await this.question('Start voice listening automatically? (y/n): ');
            autoStart = autoStartAnswer.toLowerCase().startsWith('y');
        }
        
        this.config.voice = {
            enabled: voiceEnabled,
            wakeWords: ['jarvis', 'gpt'],
            language: 'en-US',
            silenceThreshold: 500,
            maxRecordingLength: 10000
        };
        
        this.config.tts = {
            enabled: voiceEnabled,
            voice: 'default',
            rate: 1.0,
            volume: 1.0
        };
        
        this.config.autoStartListening = autoStart;
        
        console.log('✅ Voice configuration saved\n');
    }

    async setupSecurity() {
        console.log('🔐 Security Configuration');
        
        const requireAuth = await this.question('Require authentication for admin operations? (y/n): ');
        const authRequired = requireAuth.toLowerCase().startsWith('y');
        
        const allowSystemOps = await this.question('Allow JARVIS to perform system operations? (y/n): ');
        const systemOpsAllowed = allowSystemOps.toLowerCase().startsWith('y');
        
        this.config.security = {
            requireAuthentication: authRequired,
            sessionTimeout: 86400000, // 24 hours
            maxFailedAttempts: 3,
            auditLogging: true
        };
        
        this.config.computer = {
            allowSystemOperations: systemOpsAllowed,
            allowFileOperations: true,
            allowBrowserControl: true,
            restrictedPaths: [
                'C:\\Windows\\System32',
                'C:\\Program Files',
                'C:\\Users\\*\\AppData'
            ]
        };
        
        console.log('✅ Security configuration saved\n');
    }

    async setupBambuLab() {
        console.log('🖨️ Bambu Lab 3D Printer Configuration (Optional)');
        
        const hasPrinter = await this.question('Do you have a Bambu Lab 3D printer? (y/n): ');
        
        if (hasPrinter.toLowerCase().startsWith('y')) {
            const printerName = await this.question('Enter printer name: ') || 'Bambu Lab Printer';
            const printerIP = await this.question('Enter printer IP address: ');
            const accessCode = await this.question('Enter printer access code: ');
            const serialNumber = await this.question('Enter printer serial number: ');
            
            if (printerIP && accessCode) {
                this.config.fabrication = {
                    bambuLab: {
                        enabled: true,
                        autoConnect: false,
                        printers: [{
                            id: 'bambu_printer_01',
                            name: printerName,
                            ip: printerIP,
                            accessCode: accessCode,
                            serialNumber: serialNumber,
                            model: 'X1-Carbon'
                        }]
                    },
                    safety: {
                        requireConfirmation: true,
                        maxPrintTimeHours: 24,
                        autoShutdownEnabled: true
                    }
                };
                
                console.log('✅ Bambu Lab printer configured\n');
            } else {
                console.log('⚠️ Incomplete printer configuration, skipping...\n');
                this.config.fabrication = {
                    bambuLab: {
                        enabled: false,
                        printers: []
                    }
                };
            }
        } else {
            this.config.fabrication = {
                bambuLab: {
                    enabled: false,
                    printers: []
                }
            };
            console.log('✅ Skipped 3D printer configuration\n');
        }
    }

    async saveConfig() {
        console.log('💾 Saving configuration...');
        
        // Merge with default configuration
        const defaultConfig = {
            projects: {
                autoBackup: true,
                backupInterval: 3600000,
                maxProjects: 100,
                defaultProjectType: 'general'
            },
            ui: {
                theme: 'dark',
                showNotifications: true,
                minimizeToTray: true,
                startMinimized: false
            },
            debug: false
        };
        
        const finalConfig = { ...defaultConfig, ...this.config };
        
        // Ensure config directory exists
        const configDir = path.join(__dirname, '../config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Save main configuration
        const configPath = path.join(configDir, 'settings.json');
        fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
        
        // Update fabrication.json if printer was configured
        if (finalConfig.fabrication && finalConfig.fabrication.bambuLab.enabled) {
            const fabricationPath = path.join(configDir, 'fabrication.json');
            let fabricationConfig = {};
            
            if (fs.existsSync(fabricationPath)) {
                fabricationConfig = JSON.parse(fs.readFileSync(fabricationPath, 'utf8'));
            }
            
            fabricationConfig.bambuLab = finalConfig.fabrication.bambuLab;
            fs.writeFileSync(fabricationPath, JSON.stringify(fabricationConfig, null, 2));
        }
        
        console.log('✅ Configuration saved successfully!');
    }

    question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, (answer) => {
                resolve(answer);
            });
        });
    }
}

// Run setup if called directly
if (require.main === module) {
    const setup = new SetupWizard();
    setup.run().catch(console.error);
}

module.exports = SetupWizard;
