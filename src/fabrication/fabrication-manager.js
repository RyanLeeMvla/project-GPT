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
            
            // Initialize Bambu Lab printers (non-blocking)
            this.initializeBambuPrinters().catch(error => {
                console.warn('⚠️ Printer initialization failed (non-critical):', error.message);
            });
            
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
                
                case 'upload_gcode':
                    return await this.uploadGCode(printerId, data.filePath);
                
                case 'start_print':
                    return await this.startPrint(printerId, data.fileName);
                
                case 'pause_print':
                    return await this.pausePrint(printerId);
                
                case 'resume_print':
                    return await this.resumePrint(printerId);
                
                case 'cancel_print':
                    return await this.cancelPrint(printerId);
                
                case 'get_print_queue':
                    return { success: true, data: this.printQueue };
                
                case 'get_printer_info':
                    return await this.getPrinterInfo(printerId);
                
                case 'check_filament':
                    return await this.checkFilament(printerId);
                
                default:
                    return {
                        success: false,
                        error: `Unknown fabrication command: ${command}. Available commands: get_printer_status, upload_gcode, start_print, pause_print, resume_print, cancel_print, check_filament`
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

    async startPrint(printerId, fileName) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            // Simple validation - let the printer handle the rest
            if (!fileName) {
                return {
                    success: false,
                    error: `No file specified for printing`
                };
            }

            // Check printer status including filament before starting
            const status = await printer.getStatus();
            if (!status || status.error) {
                return {
                    success: false,
                    error: `Cannot communicate with printer: ${status?.error || 'Unknown error'}`
                };
            }

            // Check for filament availability (P1S without AMS)
            const filamentCheck = this.checkFilamentStatus(status);
            if (!filamentCheck.hasFilament) {
                return {
                    success: false,
                    error: `No filament detected on ${printer.name}. Please load filament before printing.`,
                    needsFilament: true,
                    filamentStatus: filamentCheck
                };
            }

            // Check if printer is ready to print
            if (!this.isPrinterReady(status)) {
                return {
                    success: false,
                    error: `Printer is not ready. Current state: ${status.state || 'unknown'}`,
                    printerStatus: status
                };
            }

            // Safety confirmation for any print job
            if (this.config.safety.require_confirmation) {
                return {
                    success: false,
                    error: `Print requires confirmation. Use voice command "GPT, confirm print" or UI confirmation.`,
                    needsConfirmation: true,
                    fileName: fileName,
                    printer: printer.name,
                    filamentStatus: filamentCheck
                };
            }

            // Start the print - let Bambu Studio/printer handle material settings, time estimation, etc.
            const result = await printer.startPrint(fileName);
            
            if (result.success) {
                this.currentPrintJob = {
                    printerId: printerId,
                    fileName: fileName,
                    startTime: new Date(),
                    status: 'printing',
                    filamentType: filamentCheck.detectedMaterial || 'unknown'
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

    checkFilamentStatus(printerStatus) {
        // For P1S without AMS, check direct filament sensor
        const filamentDetected = printerStatus.filament_detected !== false; // Default to true if not specified
        const hasFilament = printerStatus.has_filament !== false;
        
        // Bambu P1S reports filament status in various ways
        const filamentPresent = filamentDetected && hasFilament;
        
        return {
            hasFilament: filamentPresent,
            detectedMaterial: printerStatus.current_material || null,
            filamentSensorWorking: printerStatus.filament_sensor_enabled !== false,
            recommendation: filamentPresent ? 
                'Filament detected and ready' : 
                'Please load filament into the printer before starting print'
        };
    }

    isPrinterReady(status) {
        const readyStates = ['idle', 'ready', 'standby'];
        const busyStates = ['printing', 'paused', 'heating', 'homing'];
        const errorStates = ['error', 'offline', 'fault'];
        
        if (errorStates.includes(status.state)) {
            return false;
        }
        
        if (busyStates.includes(status.state)) {
            return false;
        }
        
        return readyStates.includes(status.state) || !status.state; // Default to ready if state unknown
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

    async getPrinterInfo(printerId) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            return await printer.getInfo();
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async checkFilament(printerId) {
        try {
            const printer = this.bambuPrinters.get(printerId);
            if (!printer) {
                return {
                    success: false,
                    error: `Printer ${printerId} not found`
                };
            }

            const status = await printer.getStatus();
            if (!status || status.error) {
                return {
                    success: false,
                    error: `Cannot communicate with printer: ${status?.error || 'Unknown error'}`
                };
            }

            const filamentCheck = this.checkFilamentStatus(status);
            
            return {
                success: true,
                data: {
                    printerName: printer.name,
                    hasFilament: filamentCheck.hasFilament,
                    detectedMaterial: filamentCheck.detectedMaterial,
                    recommendation: filamentCheck.recommendation,
                    filamentSensorWorking: filamentCheck.filamentSensorWorking,
                    readyToPrint: this.isPrinterReady(status) && filamentCheck.hasFilament
                }
            };
            
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

// Bambu Lab Printer API wrapper for P1S
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
            // Test connection to printer using Bambu Lab's actual API endpoint
            const response = await axios.get(`${this.baseURL}/v1/status`, {
                timeout: 5000,
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`
                }
            });
            
            this.isConnected = true;
            return { success: true, message: `Connected to ${this.name}` };
            
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
            
            // For P1S without AMS, enhance status with filament detection
            const status = response.data;
            
            // Return the printer's actual status with enhanced filament info
            return {
                ...status,
                printer_name: this.name,
                printer_id: this.id,
                connection_status: 'connected',
                // P1S filament detection fields (these may vary based on actual API)
                filament_detected: status.filament_detected ?? true, // Default to true if not reported
                has_filament: status.has_filament ?? true,
                current_material: status.current_material || null,
                filament_sensor_enabled: status.filament_sensor_enabled ?? true,
                // Additional helpful status
                bed_temperature: status.bed_temperature || 0,
                nozzle_temperature: status.nozzle_temperature || 0,
                state: status.state || 'unknown'
            };
            
        } catch (error) {
            return {
                error: error.message,
                state: 'disconnected',
                printer_name: this.name,
                printer_id: this.id,
                connection_status: 'error',
                filament_detected: false,
                has_filament: false
            };
        }
    }

    async getInfo() {
        try {
            const response = await axios.get(`${this.baseURL}/v1/info`, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`
                }
            });
            
            return {
                success: true,
                data: {
                    ...response.data,
                    configured_name: this.name,
                    configured_id: this.id,
                    ip_address: this.ip
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async startPrint(fileName) {
        try {
            // Start print using file already on the printer
            const response = await axios.post(`${this.baseURL}/v1/print`, {
                filename: fileName,
                // Let the printer use its own settings
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return {
                success: true,
                message: `Print started on ${this.name}: ${fileName}`,
                jobId: response.data?.jobId || 'unknown'
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

    async uploadFile(filePath) {
        try {
            // Upload G-code file to the printer's storage
            const fileData = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);
            
            // Use form data for file upload
            const FormData = require('form-data');
            const formData = new FormData();
            formData.append('file', fileData, fileName);
            
            const response = await axios.post(`${this.baseURL}/v1/upload`, formData, {
                headers: {
                    'Authorization': `Bearer ${this.accessCode}`,
                    ...formData.getHeaders()
                },
                timeout: 30000 // 30 second timeout for file uploads
            });
            
            return {
                success: true,
                message: `File uploaded to ${this.name}: ${fileName}`,
                fileName: fileName,
                fileId: response.data?.fileId || fileName
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
        return { success: true, message: `Disconnected from ${this.name}` };
    }
}

module.exports = FabricationManager;
