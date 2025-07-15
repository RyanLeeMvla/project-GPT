// Performance and Loading Management Utilities

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

// Global instances
window.performanceTimer = new PerformanceTimer();
window.loadingManager = new LoadingManager();

// Enhanced loading functions
window.enhancedLoad = {
    async projects() {
        // Start timing and show loading
        window.performanceTimer.start('Load Projects');
        window.loadingManager.show('projects', 'Loading Projects...');
        
        try {
            const { ipcRenderer } = require('electron');
            const projects = await ipcRenderer.invoke('get-projects');
            
            // End timing and hide loading
            const duration = window.performanceTimer.end('Load Projects');
            window.loadingManager.hide('projects', duration);
            
            return projects || [];
        } catch (error) {
            console.error('Error loading projects:', error);
            
            // End timing and hide loading even on error
            const duration = window.performanceTimer.end('Load Projects');
            window.loadingManager.hide('projects', duration);
            
            throw error;
        }
    },

    async dashboard() {
        // Start timing and show loading
        window.performanceTimer.start('Load Dashboard');
        window.loadingManager.show('dashboard', 'Loading Dashboard...');
        
        try {
            const { ipcRenderer } = require('electron');
            const status = await ipcRenderer.invoke('get-status');
            
            // End timing and hide loading
            const duration = window.performanceTimer.end('Load Dashboard');
            window.loadingManager.hide('dashboard', duration);
            
            return status;
        } catch (error) {
            console.error('Error loading dashboard:', error);
            
            // End timing and hide loading even on error
            const duration = window.performanceTimer.end('Load Dashboard');
            window.loadingManager.hide('dashboard', duration);
            
            throw error;
        }
    },

    async inventory() {
        // Start timing and show loading
        window.performanceTimer.start('Load Inventory');
        window.loadingManager.show('inventory', 'Loading Inventory...');
        
        try {
            const { ipcRenderer } = require('electron');
            const inventory = await ipcRenderer.invoke('get-inventory');
            
            // End timing and hide loading
            const duration = window.performanceTimer.end('Load Inventory');
            window.loadingManager.hide('inventory', duration);
            
            return inventory || [];
        } catch (error) {
            console.error('Error loading inventory:', error);
            
            // End timing and hide loading even on error
            const duration = window.performanceTimer.end('Load Inventory');
            window.loadingManager.hide('inventory', duration);
            
            throw error;
        }
    }
};

console.log('🚀 Performance and Loading Management initialized');
