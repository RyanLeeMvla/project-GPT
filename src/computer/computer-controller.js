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
                
                case 'get_system_status':
                    return await this.getSystemHealth(); // Always use detailed monitoring
                
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
            // Get real-time memory usage
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memoryUsage = Math.round((usedMem / totalMem) * 100);
            
            // Get disk usage
            let diskUsage = 0;
            let diskFreeGB = 0;
            let diskTotalGB = 0;
            
            // Get accurate CPU usage with 2-second averaging
            let cpuUsage = 0;
            try {
                if (os.platform() === 'win32') {
                    const { exec } = require('child_process');
                    
                    // Take 8 samples over 2 seconds (250ms intervals) for accurate monitoring
                    const samples = [];
                    const sampleInterval = 250; // milliseconds
                    const numSamples = 8;
                    
                    for (let i = 0; i < numSamples; i++) {
                        try {
                            const cpuResult = await new Promise((resolve, reject) => {
                                exec('powershell -Command "Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average"', 
                                    { timeout: 2000 }, (error, stdout) => {
                                    if (error) {
                                        reject(error);
                                    } else {
                                        resolve(parseFloat(stdout.trim()) || 0);
                                    }
                                });
                            });
                            samples.push(cpuResult);
                            
                            // Wait before next sample (except for the last one)
                            if (i < numSamples - 1) {
                                await new Promise(resolve => setTimeout(resolve, sampleInterval));
                            }
                        } catch (sampleError) {
                            console.warn(`CPU sample ${i + 1} failed:`, sampleError.message);
                            // Continue with other samples
                        }
                    }
                    
                    // Calculate average of valid samples
                    if (samples.length > 0) {
                        cpuUsage = Math.round(samples.reduce((sum, val) => sum + val, 0) / samples.length);
                    }
                } else {
                    // Fallback to load average for non-Windows systems
                    const loadAvg = os.loadavg();
                    cpuUsage = Math.round(Math.min(loadAvg[0] * 25, 100));
                }
            } catch (error) {
                console.warn('Failed to get CPU usage, using fallback:', error.message);
                const loadAvg = os.loadavg();
                cpuUsage = Math.round(loadAvg[0] * 10);
            }
            
            // Get disk usage
            try {
                if (os.platform() === 'win32') {
                    const diskResult = await new Promise((resolve, reject) => {
                        exec('powershell -Command "Get-WmiObject -Class Win32_LogicalDisk | Where-Object DeviceID -eq \'C:\' | Select-Object Size,FreeSpace"', 
                            { timeout: 3000 }, (error, stdout) => {
                            if (error) {
                                reject(error);
                            } else {
                                try {
                                    // Parse PowerShell output format: 
                                    // Size    FreeSpace
                                    // ----    ---------
                                    // 1021821579264 863185633280
                                    const lines = stdout.trim().split('\n');
                                    if (lines.length >= 3) {
                                        const dataLine = lines[2].trim();
                                        const parts = dataLine.split(/\s+/);
                                        if (parts.length >= 2) {
                                            const sizeBytes = parseInt(parts[0]) || 0;
                                            const freeBytes = parseInt(parts[1]) || 0;
                                            resolve({ size: sizeBytes, free: freeBytes });
                                        } else {
                                            resolve({ size: 0, free: 0 });
                                        }
                                    } else {
                                        resolve({ size: 0, free: 0 });
                                    }
                                } catch (parseError) {
                                    console.warn('Disk parsing error:', parseError.message);
                                    resolve({ size: 0, free: 0 });
                                }
                            }
                        });
                    });
                    
                    if (diskResult.size > 0) {
                        diskTotalGB = Math.round(diskResult.size / (1024**3) * 100) / 100;
                        diskFreeGB = Math.round(diskResult.free / (1024**3) * 100) / 100;
                        diskUsage = Math.round(((diskResult.size - diskResult.free) / diskResult.size) * 100);
                    }
                } else {
                    // Fallback for non-Windows systems using df command
                    const diskResult = await new Promise((resolve, reject) => {
                        exec('df -h /', { timeout: 3000 }, (error, stdout) => {
                            if (error) {
                                reject(error);
                            } else {
                                try {
                                    const lines = stdout.trim().split('\n');
                                    if (lines.length > 1) {
                                        const parts = lines[1].split(/\s+/);
                                        const usagePercent = parseInt(parts[4].replace('%', '')) || 0;
                                        const available = parseFloat(parts[3].replace('G', '')) || 0;
                                        const size = parseFloat(parts[1].replace('G', '')) || 0;
                                        resolve({ usage: usagePercent, free: available, total: size });
                                    } else {
                                        resolve({ usage: 0, free: 0, total: 0 });
                                    }
                                } catch (parseError) {
                                    reject(parseError);
                                }
                            }
                        });
                    });
                    
                    diskUsage = diskResult.usage;
                    diskFreeGB = diskResult.free;
                    diskTotalGB = diskResult.total;
                }
            } catch (error) {
                console.warn('Failed to get disk usage:', error.message);
                // Keep default values (0)
            }
            
            let overall = 'Good';
            if (memoryUsage > 80 || cpuUsage > 80 || diskUsage > 90) {
                overall = 'Poor';
            } else if (memoryUsage > 60 || cpuUsage > 60 || diskUsage > 80) {
                overall = 'Fair';
            }
            
            return {
                overall: overall,
                memory: memoryUsage,
                cpu: cpuUsage,
                disk: diskUsage,
                diskFreeGB: diskFreeGB,
                diskTotalGB: diskTotalGB,
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

    // Enhanced real-time system monitoring (Task Manager style)
    async getDetailedSystemStats() {
        try {
            const result = {
                timestamp: new Date().toISOString(),
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname()
            };

            if (os.platform() === 'win32') {
                // Windows-specific detailed monitoring using PowerShell with CPU averaging
                const { exec } = require('child_process');
                
                // Get averaged CPU over 2 seconds
                const cpuSamples = [];
                const sampleInterval = 250; // milliseconds
                const numSamples = 8;
                
                for (let i = 0; i < numSamples; i++) {
                    try {
                        const cpuResult = await new Promise((resolve, reject) => {
                            exec('powershell "Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average"', 
                                { timeout: 2000 }, (error, stdout) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(parseFloat(stdout.trim()) || 0);
                                }
                            });
                        });
                        cpuSamples.push(cpuResult);
                        
                        // Wait before next sample (except for the last one)
                        if (i < numSamples - 1) {
                            await new Promise(resolve => setTimeout(resolve, sampleInterval));
                        }
                    } catch (sampleError) {
                        console.warn(`CPU sample ${i + 1} failed:`, sampleError.message);
                    }
                }
                
                // Calculate average CPU
                const avgCpu = cpuSamples.length > 0 ? 
                    cpuSamples.reduce((sum, val) => sum + val, 0) / cpuSamples.length : 0;
                
                // Get memory stats
                const memStatsPromise = new Promise((resolve, reject) => {
                    const command = `powershell "
                        $memory = Get-WmiObject -Class Win32_OperatingSystem
                        $totalMemGB = [math]::Round($memory.TotalVisibleMemorySize / 1MB, 2)
                        $freeMemGB = [math]::Round($memory.FreePhysicalMemory / 1MB, 2)
                        $usedMemGB = [math]::Round(($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / 1MB, 2)
                        $memoryPercent = [math]::Round((($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / $memory.TotalVisibleMemorySize) * 100, 1)
                        
                        Write-Output \\"MEM_TOTAL:$totalMemGB\\"
                        Write-Output \\"MEM_USED:$usedMemGB\\"
                        Write-Output \\"MEM_FREE:$freeMemGB\\"
                        Write-Output \\"MEM_PERCENT:$memoryPercent\\"
                    "`;
                    
                    exec(command, { timeout: 3000 }, (error, stdout) => {
                        if (error) {
                            reject(error);
                        } else {
                            const lines = stdout.trim().split('\n');
                            const stats = {};
                            lines.forEach(line => {
                                const [key, value] = line.split(':');
                                if (key && value) {
                                    stats[key] = parseFloat(value) || value;
                                }
                            });
                            resolve(stats);
                        }
                    });
                });

                const memoryStats = await memStatsPromise;
                
                result.cpu = {
                    usage: Math.round(avgCpu),
                    cores: os.cpus().length,
                    model: os.cpus()[0]?.model || 'Unknown',
                    samplesCount: cpuSamples.length,
                    samplingDuration: '2 seconds (8 samples)'
                };
                
                result.memory = {
                    totalGB: memoryStats.MEM_TOTAL || 0,
                    usedGB: memoryStats.MEM_USED || 0,
                    freeGB: memoryStats.MEM_FREE || 0,
                    usagePercent: memoryStats.MEM_PERCENT || 0
                };
                
            } else {
                // Fallback for other platforms (Linux/Mac)
                const totalMem = os.totalmem();
                const freeMem = os.freemem();
                const usedMem = totalMem - freeMem;
                
                result.cpu = {
                    usage: Math.round(Math.min(os.loadavg()[0] * 25, 100)),
                    cores: os.cpus().length,
                    model: os.cpus()[0]?.model || 'Unknown'
                };
                
                result.memory = {
                    totalGB: Math.round(totalMem / (1024**3) * 100) / 100,
                    usedGB: Math.round(usedMem / (1024**3) * 100) / 100,
                    freeGB: Math.round(freeMem / (1024**3) * 100) / 100,
                    usagePercent: Math.round((usedMem / totalMem) * 100)
                };
            }

            result.uptime = {
                seconds: os.uptime(),
                hours: Math.round(os.uptime() / 3600 * 100) / 100,
                days: Math.round(os.uptime() / 86400 * 100) / 100
            };

            return result;
            
        } catch (error) {
            console.error('Error getting detailed system stats:', error);
            return {
                error: error.message,
                timestamp: new Date().toISOString()
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
