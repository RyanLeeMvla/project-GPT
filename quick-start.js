// Quick Start Script - Temporarily disable performance monitoring for faster startup

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🚀 Quick Start: Optimizing for fast startup...');

// Temporarily rename performance files to disable them
const performanceFile = path.join(__dirname, 'src/ui/performance.js');
const enhancedNavFile = path.join(__dirname, 'src/ui/enhanced-nav.js');

const performanceBackup = performanceFile + '.backup';
const enhancedNavBackup = enhancedNavFile + '.backup';

try {
    // Backup and disable performance files
    if (fs.existsSync(performanceFile)) {
        fs.renameSync(performanceFile, performanceBackup);
        console.log('📦 Performance monitoring temporarily disabled');
    }
    
    if (fs.existsSync(enhancedNavFile)) {
        fs.renameSync(enhancedNavFile, enhancedNavBackup);
        console.log('📦 Enhanced navigation temporarily disabled');
    }
    
    // Start the application
    console.log('⚡ Starting optimized version...');
    const electronProcess = spawn('npm', ['start'], {
        stdio: 'inherit',
        shell: true,
        cwd: __dirname
    });
    
    // Restore files when the process exits
    electronProcess.on('exit', () => {
        console.log('\n🔄 Restoring performance files...');
        
        try {
            if (fs.existsSync(performanceBackup)) {
                fs.renameSync(performanceBackup, performanceFile);
            }
            if (fs.existsSync(enhancedNavBackup)) {
                fs.renameSync(enhancedNavBackup, enhancedNavFile);
            }
            console.log('✅ Files restored');
        } catch (error) {
            console.warn('⚠️ Could not restore files:', error.message);
        }
    });
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping application...');
        electronProcess.kill('SIGINT');
    });
    
} catch (error) {
    console.error('❌ Quick start failed:', error);
    
    // Try to restore files if something went wrong
    try {
        if (fs.existsSync(performanceBackup)) {
            fs.renameSync(performanceBackup, performanceFile);
        }
        if (fs.existsSync(enhancedNavBackup)) {
            fs.renameSync(enhancedNavBackup, enhancedNavFile);
        }
    } catch (restoreError) {
        console.warn('⚠️ Could not restore files:', restoreError.message);
    }
}
