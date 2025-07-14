const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');

class ComputerController {
    constructor() {
        this.platform = process.platform;
        this.browser = null;
        this.activeApplications = new Map();
        this.isInitialized = false;
    }

    async initialize() {
        console.log('💻 Initializing Computer Controller...');
        
        try {
            // Initialize browser for web automation
            this.browser = await puppeteer.launch({
                headless: false, // Show browser for user to see
                defaultViewport: null,
                args: ['--start-maximized']
            });
            
            this.isInitialized = true;
            console.log('✅ Computer Controller initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Computer Controller:', error);
            this.isInitialized = false;
        }
    }

    async executeOperation(parameters) {
        try {
            const { operation, target, options = {} } = parameters;
            
            switch (operation) {
                case 'open_application':
                    return await this.openApplication(target, options);
                
                case 'close_application':
                    return await this.closeApplication(target);
                
                case 'create_file':
                    return await this.createFile(target, options.content || '');
                
                case 'create_folder':
                    return await this.createFolder(target);
                
                case 'move_file':
                    return await this.moveFile(target, options.destination);
                
                case 'delete_file':
                    return await this.deleteFile(target);
                
                case 'get_system_info':
                    return await this.getSystemInfo();
                
                default:
                    return {
                        success: false,
                        error: `Unknown operation: ${operation}`
                    };
            }
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async openApplication(appName, options = {}) {
        try {
            let command;
            const lowerAppName = appName.toLowerCase();
            
            if (this.platform === 'win32') {
                // Windows application launching
                const commonApps = {
                    'notepad': 'notepad.exe',
                    'calculator': 'calc.exe',
                    'browser': 'start chrome',
                    'chrome': 'start chrome',
                    'firefox': 'start firefox',
                    'edge': 'start msedge',
                    'vscode': 'code',
                    'visual studio code': 'code',
                    'onshape': 'start chrome "https://www.onshape.com"',
                    'file explorer': 'explorer',
                    'explorer': 'explorer',
                    'task manager': 'taskmgr',
                    'control panel': 'control',
                    'paint': 'mspaint',
                    'cmd': 'start cmd',
                    'powershell': 'start powershell'
                };
                
                command = commonApps[lowerAppName] || `start ${appName}`;
                
                // Special handling for OnShape 3D modeling
                if (lowerAppName.includes('onshape') || lowerAppName.includes('3d') || lowerAppName.includes('cad')) {
                    return await this.openOnShape();
                }
                
            } else if (this.platform === 'darwin') {
                // macOS application launching
                command = `open -a "${appName}"`;
            } else {
                // Linux application launching
                command = appName;
            }
            
            return new Promise((resolve) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        resolve({
                            success: false,
                            error: `Failed to open ${appName}: ${error.message}`
                        });
                    } else {
                        this.activeApplications.set(appName, {
                            name: appName,
                            startTime: new Date(),
                            command: command
                        });
                        
                        resolve({
                            success: true,
                            message: `Successfully opened ${appName}`
                        });
                    }
                });
            });
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async openOnShape() {
        try {
            if (!this.browser) {
                await this.initialize();
            }
            
            const page = await this.browser.newPage();
            await page.goto('https://www.onshape.com', { waitUntil: 'networkidle2' });
            
            return {
                success: true,
                message: 'OnShape 3D modeling platform opened successfully. You can now start your CAD work.'
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to open OnShape: ${error.message}`
            };
        }
    }

    async closeApplication(appName) {
        try {
            if (this.platform === 'win32') {
                const command = `taskkill /IM ${appName}.exe /F`;
                
                return new Promise((resolve) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            resolve({
                                success: false,
                                error: `Failed to close ${appName}: ${error.message}`
                            });
                        } else {
                            this.activeApplications.delete(appName);
                            resolve({
                                success: true,
                                message: `Successfully closed ${appName}`
                            });
                        }
                    });
                });
            }
            
            return {
                success: false,
                error: 'Application closing not implemented for this platform'
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async controlBrowser(parameters) {
        try {
            const { action, url, selector, text } = parameters;
            
            if (!this.browser) {
                await this.initialize();
            }
            
            const pages = await this.browser.pages();
            let page = pages[pages.length - 1]; // Use the last opened page
            
            if (!page) {
                page = await this.browser.newPage();
            }
            
            switch (action) {
                case 'navigate':
                    await page.goto(url, { waitUntil: 'networkidle2' });
                    return {
                        success: true,
                        message: `Navigated to ${url}`
                    };
                
                case 'click':
                    await page.click(selector);
                    return {
                        success: true,
                        message: `Clicked element: ${selector}`
                    };
                
                case 'type':
                    await page.type(selector, text);
                    return {
                        success: true,
                        message: `Typed text into: ${selector}`
                    };
                
                case 'screenshot':
                    const screenshotPath = path.join(__dirname, '../temp/screenshot.png');
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    return {
                        success: true,
                        message: `Screenshot saved to ${screenshotPath}`
                    };
                
                default:
                    return {
                        success: false,
                        error: `Unknown browser action: ${action}`
                    };
            }
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async manageFiles(parameters) {
        try {
            const { action, source, destination, content } = parameters;
            
            switch (action) {
                case 'create':
                    return await this.createFile(source, content || '');
                
                case 'delete':
                    return await this.deleteFile(source);
                
                case 'move':
                    return await this.moveFile(source, destination);
                
                case 'copy':
                    return await this.copyFile(source, destination);
                
                case 'read':
                    return await this.readFile(source);
                
                default:
                    return {
                        success: false,
                        error: `Unknown file action: ${action}`
                    };
            }
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createFile(filePath, content = '') {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(filePath, content);
            
            return {
                success: true,
                message: `File created: ${filePath}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createFolder(folderPath) {
        try {
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            
            return {
                success: true,
                message: `Folder created: ${folderPath}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async moveFile(source, destination) {
        try {
            // Ensure destination directory exists
            const destDir = path.dirname(destination);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            
            fs.renameSync(source, destination);
            
            return {
                success: true,
                message: `File moved from ${source} to ${destination}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async copyFile(source, destination) {
        try {
            // Ensure destination directory exists
            const destDir = path.dirname(destination);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            
            fs.copyFileSync(source, destination);
            
            return {
                success: true,
                message: `File copied from ${source} to ${destination}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async deleteFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
            }
            
            return {
                success: true,
                message: `Deleted: ${filePath}`
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async readFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            return {
                success: true,
                message: `File read successfully`,
                data: content
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getCurrentContext() {
        try {
            const context = {
                platform: this.platform,
                activeApplications: Array.from(this.activeApplications.values()),
                currentDirectory: process.cwd(),
                timestamp: new Date().toISOString(),
                systemInfo: await this.getSystemInfo()
            };
            
            // Get active window title (Windows only for now)
            if (this.platform === 'win32') {
                context.activeWindow = await this.getActiveWindow();
            }
            
            return context;
            
        } catch (error) {
            console.error('❌ Error getting current context:', error);
            return {
                platform: this.platform,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async getActiveWindow() {
        return new Promise((resolve) => {
            if (this.platform === 'win32') {
                const powershell = spawn('powershell', [
                    '-Command',
                    'Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class Win32 { [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\"user32.dll\\")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count); }" ; $hwnd = [Win32]::GetForegroundWindow(); $title = New-Object System.Text.StringBuilder 256; [Win32]::GetWindowText($hwnd, $title, 256); $title.ToString()'
                ]);

                let output = '';
                powershell.stdout.on('data', (data) => {
                    output += data.toString();
                });

                powershell.on('close', () => {
                    resolve(output.trim() || 'Unknown');
                });

                powershell.on('error', () => {
                    resolve('Unknown');
                });
            } else {
                resolve('Unknown');
            }
        });
    }

    async getSystemInfo() {
        try {
            return {
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                uptime: os.uptime(),
                loadavg: os.loadavg(),
                totalmem: os.totalmem(),
                freemem: os.freemem(),
                cpus: os.cpus().length
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    async getSystemHealth() {
        try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memoryUsage = Math.round((usedMem / totalMem) * 100);
            
            const loadAvg = os.loadavg();
            const cpuUsage = Math.round(loadAvg[0] * 10); // Rough CPU usage estimate
            
            let overall = 'Good';
            if (memoryUsage > 80 || cpuUsage > 80) {
                overall = 'Poor';
            } else if (memoryUsage > 60 || cpuUsage > 60) {
                overall = 'Fair';
            }
            
            return {
                overall: overall,
                memory: memoryUsage,
                cpu: cpuUsage,
                uptime: Math.round(os.uptime() / 3600) // Hours
            };
            
        } catch (error) {
            return {
                overall: 'Unknown',
                memory: 0,
                cpu: 0,
                uptime: 0,
                error: error.message
            };
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = ComputerController;
