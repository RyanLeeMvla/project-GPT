const axios = require('axios');
const fs = require('fs');
const path = require('path');

class FabricationManager {
    constructor() {
        this.bambuPrinters = new Map();
        this.printQueue = [];
        this.currentPrintJob = null;
        this.isInitialized = false;
        this.config = null;
    }

    async initialize() {
        console.log('🖨️ Initializing Fabrication Manager...');
        
        try {
            // Load fabrication configuration
            this.config = await this.loadConfig();
            
            // Initialize Bambu Lab printers
            await this.initializeBambuPrinters();
            
            this.isInitialized = true;
            console.log('✅ Fabrication Manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Fabrication Manager:', error);
            this.isInitialized = false;
        }
    }

    async loadConfig() {
        try {
            const configPath = path.join(__dirname, '../../config/fabrication.json');
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } else {
                // Create default config
                const defaultConfig = {
                    bambuLab: {
                        printers: [],
                        defaultSettings: {
                            layer_height: 0.2,
                            infill_density: 20,
                            print_speed: 100,
                            support_enabled: true,
                            bed_temperature: 60,
                            nozzle_temperature: 210
                        }
                    },
                    materials: {
                        PLA: {
                            nozzle_temp: 210,
                            bed_temp: 60,
                            speed_modifier: 1.0
                        },
                        PETG: {
                            nozzle_temp: 235,
                            bed_temp: 80,
                            speed_modifier: 0.8
                        },
                        ABS: {
                            nozzle_temp: 250,
                            bed_temp: 100,
                            speed_modifier: 0.9
                        }
                    },
                    safety: {
                        max_print_time_hours: 24,
                        require_confirmation: true,
                        auto_shutdown_enabled: true
                    }
                };
                
                // Save default config
                fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
                return defaultConfig;
            }
        } catch (error) {
            console.error('❌ Error loading fabrication config:', error);
            return null;
        }
    }

    async initializeBambuPrinters() {
        if (!this.config || !this.config.bambuLab || !this.config.bambuLab.printers) {
            console.log('ℹ️ No Bambu Lab printers configured');
            return;
        }

        for (const printerConfig of this.config.bambuLab.printers) {
            try {
                const printer = new BambuLabPrinter(printerConfig);
                await printer.connect();
                this.bambuPrinters.set(printerConfig.id, printer);
                console.log(`✅ Connected to Bambu Lab printer: ${printerConfig.name}`);
            } catch (error) {
                console.error(`❌ Failed to connect to printer ${printerConfig.name}:`, error);
            }
        }
    }

    async executeCommand(parameters) {
        try {
            const { command, printerId, data } = parameters;
            
            switch (command) {
                case 'get_printer_status':
                    return await this.getPrinterStatus(printerId);
                
                case 'start_print':
                    return await this.startPrint(printerId, data);
                
                case 'pause_print':
                    return await this.pausePrint(printerId);
                
                case 'resume_print':
                    return await this.resumePrint(printerId);
                
                case 'cancel_print':
                    return await this.cancelPrint(printerId);
                
                case 'preheat_printer':
                    return await this.preheatPrinter(printerId, data.material);
                
                case 'upload_gcode':
                    return await this.uploadGCode(printerId, data.filePath);
                
                case 'get_print_queue':
                    return { success: true, data: this.printQueue };
                
                case 'estimate_print_time':
                    return await this.estimatePrintTime(data.filePath);
                
                case 'check_material_compatibility':
                    return await this.checkMaterialCompatibility(data.material, data.settings);
                
                default:
                    return {
                        success: false,
                        error: `Unknown fabrication command: ${command}`
                    };
            }
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getPrinterStatus(printerId = null) {
        try {
            if (printerId) {
                const printer = this.bambuPrinters.get(printerId);
                if (!printer) {
                    return {
                        success: false,
                        error: `Printer ${printerId} not found`
                    };
                }
                
                const status = await printer.getStatus();
                return {
                    success: true,
                    data: status
                };
            } else {
                // Get status of all printers
                const allStatus = {};
                for (const [id, printer] of this.bambuPrinters) {
                    try {
                        allStatus[id] = await printer.getStatus();
                    } catch (error) {
                        allStatus[id] = { error: error.message };
                    }
                }
                
                return {
                    success: true,
                    data: allStatus,
                    summary: this.generateStatusSummary(allStatus)
                };
            }
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    generateStatusSummary(allStatus) {
        const printers = Object.keys(allStatus);
        const activePrints = printers.filter(id => 
            allStatus[id].state === 'printing' || allStatus[id].state === 'paused'
        ).length;
        
        const availablePrinters = printers.filter(id => 
            allStatus[id].state === 'idle' || allStatus[id].state === 'ready'
        ).length;
        
        return {
            total_printers: printers.length,
            active_prints: activePrints,
            available_printers: availablePrinters,
            status: activePrints > 0 ? 'printing' : 'idle'
        };
    }

    async startPrint(printerId, printData) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            const { filePath, material = 'PLA', settings = {} } = printData;
            
            // Validate file exists
            if (!fs.existsSync(filePath)) {
                return {
                    success: false,
                    error: `G-code file not found: ${filePath}`
                };
            }

            // Safety check - require confirmation for long prints
            const estimatedTime = await this.estimatePrintTime(filePath);
            if (this.config.safety.require_confirmation && estimatedTime.hours > 4) {
                return {
                    success: false,
                    error: `Print estimated to take ${estimatedTime.hours} hours. Please confirm this long print job.`,
                    needsConfirmation: true,
                    estimatedTime: estimatedTime
                };
            }

            // Check material compatibility
            const materialCheck = await this.checkMaterialCompatibility(material, settings);
            if (!materialCheck.compatible) {
                return {
                    success: false,
                    error: `Material incompatibility: ${materialCheck.issues.join(', ')}`
                };
            }

            // Start the print
            const result = await printer.startPrint(filePath, material, settings);
            
            if (result.success) {
                this.currentPrintJob = {
                    printerId: printerId,
                    filePath: filePath,
                    material: material,
                    startTime: new Date(),
                    estimatedTime: estimatedTime,
                    status: 'printing'
                };
            }

            return result;
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async pausePrint(printerId) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            const result = await printer.pausePrint();
            
            if (result.success && this.currentPrintJob && this.currentPrintJob.printerId === printerId) {
                this.currentPrintJob.status = 'paused';
                this.currentPrintJob.pausedAt = new Date();
            }

            return result;
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async resumePrint(printerId) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            const result = await printer.resumePrint();
            
            if (result.success && this.currentPrintJob && this.currentPrintJob.printerId === printerId) {
                this.currentPrintJob.status = 'printing';
                this.currentPrintJob.resumedAt = new Date();
            }

            return result;
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async cancelPrint(printerId) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            const result = await printer.cancelPrint();
            
            if (result.success && this.currentPrintJob && this.currentPrintJob.printerId === printerId) {
                this.currentPrintJob.status = 'cancelled';
                this.currentPrintJob.cancelledAt = new Date();
            }

            return result;
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async preheatPrinter(printerId, material) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            const materialSettings = this.config.materials[material];
            if (!materialSettings) {
                return {
                    success: false,
                    error: `Unknown material: ${material}`
                };
            }

            return await printer.preheat(materialSettings.nozzle_temp, materialSettings.bed_temp);
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async estimatePrintTime(filePath) {
        try {
            // Simple G-code analysis for time estimation
            const gcode = fs.readFileSync(filePath, 'utf8');
            const lines = gcode.split('\n');
            
            let totalTime = 0; // in seconds
            let currentFeedrate = 1500; // mm/min default
            
            for (const line of lines) {
                if (line.startsWith('; estimated printing time')) {
                    // Check for slicer-provided time estimate
                    const timeMatch = line.match(/(\d+)h\s*(\d+)m\s*(\d+)s/);
                    if (timeMatch) {
                        const hours = parseInt(timeMatch[1]) || 0;
                        const minutes = parseInt(timeMatch[2]) || 0;
                        const seconds = parseInt(timeMatch[3]) || 0;
                        totalTime = hours * 3600 + minutes * 60 + seconds;
                        break;
                    }
                }
                
                // Basic movement analysis
                if (line.startsWith('G1') || line.startsWith('G0')) {
                    const feedMatch = line.match(/F(\d+)/);
                    if (feedMatch) {
                        currentFeedrate = parseInt(feedMatch[1]);
                    }
                    
                    // Rough estimation based on movement commands
                    totalTime += 0.1; // Very rough estimate
                }
            }
            
            const hours = Math.floor(totalTime / 3600);
            const minutes = Math.floor((totalTime % 3600) / 60);
            
            return {
                success: true,
                totalSeconds: totalTime,
                hours: hours,
                minutes: minutes,
                formatted: `${hours}h ${minutes}m`
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                estimated: 'unknown'
            };
        }
    }

    async checkMaterialCompatibility(material, settings) {
        try {
            const materialConfig = this.config.materials[material];
            if (!materialConfig) {
                return {
                    compatible: false,
                    issues: [`Unknown material: ${material}`]
                };
            }

            const issues = [];
            
            // Check temperature settings
            if (settings.nozzle_temperature) {
                const tempDiff = Math.abs(settings.nozzle_temperature - materialConfig.nozzle_temp);
                if (tempDiff > 20) {
                    issues.push(`Nozzle temperature ${settings.nozzle_temperature}°C differs significantly from recommended ${materialConfig.nozzle_temp}°C`);
                }
            }

            if (settings.bed_temperature) {
                const bedTempDiff = Math.abs(settings.bed_temperature - materialConfig.bed_temp);
                if (bedTempDiff > 15) {
                    issues.push(`Bed temperature ${settings.bed_temperature}°C differs significantly from recommended ${materialConfig.bed_temp}°C`);
                }
            }

            return {
                compatible: issues.length === 0,
                issues: issues,
                recommendations: {
                    nozzle_temp: materialConfig.nozzle_temp,
                    bed_temp: materialConfig.bed_temp,
                    speed_modifier: materialConfig.speed_modifier
                }
            };
            
        } catch (error) {
            return {
                compatible: false,
                issues: [`Compatibility check failed: ${error.message}`]
            };
        }
    }

    async uploadGCode(printerId, filePath) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            if (!fs.existsSync(filePath)) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`
                };
            }

            return await printer.uploadFile(filePath);
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async addToPrintQueue(printJob) {
        this.printQueue.push({
            ...printJob,
            id: Date.now(),
            addedAt: new Date(),
            status: 'queued'
        });
        
        return {
            success: true,
            message: `Print job added to queue. Position: ${this.printQueue.length}`
        };
    }

    async cleanup() {
        for (const [id, printer] of this.bambuPrinters) {
            try {
                await printer.disconnect();
            } catch (error) {
                console.error(`Error disconnecting printer ${id}:`, error);
            }
        }
    }
}

// Bambu Lab Printer API wrapper
class BambuLabPrinter {
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.ip = config.ip;
        this.accessCode = config.accessCode;
        this.serialNumber = config.serialNumber;
        this.baseURL = `http://${this.ip}`;
        this.isConnected = false;
    }

    async connect() {
        try {
            // Test connection to printer
            const response = await axios.get(`${this.baseURL}/v1/status`, {
                timeout: 5000,
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`
                }
            });
            
            this.isConnected = true;
            return { success: true };
            
        } catch (error) {
            this.isConnected = false;
            throw new Error(`Failed to connect to ${this.name}: ${error.message}`);
        }
    }

    async getStatus() {
        try {
            const response = await axios.get(`${this.baseURL}/v1/status`, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`
                }
            });
            
            return response.data;
            
        } catch (error) {
            return {
                error: error.message,
                state: 'disconnected'
            };
        }
    }

    async startPrint(filePath, material, settings) {
        try {
            // This is a simplified example - actual Bambu Lab API calls would be more complex
            const response = await axios.post(`${this.baseURL}/v1/print`, {
                file: path.basename(filePath),
                material: material,
                settings: settings
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return {
                success: true,
                message: `Print started on ${this.name}`,
                jobId: response.data.jobId
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to start print: ${error.message}`
            };
        }
    }

    async pausePrint() {
        try {
            await axios.post(`${this.baseURL}/v1/print/pause`, {}, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`
                }
            });
            
            return {
                success: true,
                message: `Print paused on ${this.name}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to pause print: ${error.message}`
            };
        }
    }

    async resumePrint() {
        try {
            await axios.post(`${this.baseURL}/v1/print/resume`, {}, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`
                }
            });
            
            return {
                success: true,
                message: `Print resumed on ${this.name}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to resume print: ${error.message}`
            };
        }
    }

    async cancelPrint() {
        try {
            await axios.post(`${this.baseURL}/v1/print/cancel`, {}, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`
                }
            });
            
            return {
                success: true,
                message: `Print cancelled on ${this.name}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to cancel print: ${error.message}`
            };
        }
    }

    async preheat(nozzleTemp, bedTemp) {
        try {
            await axios.post(`${this.baseURL}/v1/preheat`, {
                nozzle_temperature: nozzleTemp,
                bed_temperature: bedTemp
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return {
                success: true,
                message: `Preheating ${this.name} - Nozzle: ${nozzleTemp}°C, Bed: ${bedTemp}°C`
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to preheat: ${error.message}`
            };
        }
    }

    async uploadFile(filePath) {
        try {
            const fileData = fs.readFileSync(filePath);
            const formData = new FormData();
            formData.append('file', fileData, path.basename(filePath));
            
            const response = await axios.post(`${this.baseURL}/v1/upload`, formData, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`,
                    ...formData.getHeaders()
                }
            });
            
            return {
                success: true,
                message: `File uploaded to ${this.name}`,
                fileId: response.data.fileId
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to upload file: ${error.message}`
            };
        }
    }

    async disconnect() {
        this.isConnected = false;
    }
}

module.exports = FabricationManager;
