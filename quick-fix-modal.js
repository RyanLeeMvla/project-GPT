// Quick Fix Script - Bypass Setup Modal
const fs = require('fs');
const path = require('path');

console.log('🚀 Quick Fix: Bypassing setup modal for immediate dashboard access...');

const appJsPath = path.join(__dirname, 'src/ui/app.js');
const backupPath = appJsPath + '.backup-original';

try {
    // Read the current app.js
    let appContent = fs.readFileSync(appJsPath, 'utf8');
    
    // Backup original if not already backed up
    if (!fs.existsSync(backupPath)) {
        fs.writeFileSync(backupPath, appContent);
        console.log('📦 Original app.js backed up');
    }
    
    // Replace the setup modal logic with auto-skip
    const setupModalPattern = /this\.showSetupModal\(\);/g;
    const hideModalPattern = /this\.hideSetupModal\(\);/g;
    
    // Replace all showSetupModal calls with hideSetupModal
    appContent = appContent.replace(setupModalPattern, 'this.hideSetupModal(); console.log("🚀 AUTO-SKIP: Setup modal bypassed");');
    
    // Add forced dashboard loading after modal hide
    const dashboardLoadPattern = /this\.hideSetupModal\(\);/g;
    appContent = appContent.replace(dashboardLoadPattern, `this.hideSetupModal(); 
        console.log("🚀 AUTO-SKIP: Setup modal bypassed");
        setTimeout(() => {
            console.log("📊 Loading dashboard data...");
            this.loadDashboardData();
        }, 500);`);
    
    // Write the modified content
    fs.writeFileSync(appJsPath, appContent);
    
    console.log('✅ Setup modal bypass applied successfully!');
    console.log('📋 Changes made:');
    console.log('   - All setup modals now auto-hide');
    console.log('   - Dashboard data loads automatically');
    console.log('   - Original file backed up as app.js.backup-original');
    
} catch (error) {
    console.error('❌ Failed to apply quick fix:', error);
    
    // Try to restore backup if available
    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, appJsPath);
        console.log('🔄 Restored original app.js from backup');
    }
}
