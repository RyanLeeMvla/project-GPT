// Lightweight Enhanced Navigation and Loading Integration

// Initialize performance enhancements after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Lightweight enhanced loading system ready');
    
    // Simple delayed initialization to avoid blocking UI
    setTimeout(() => {
        if (window.gptUI && window.performanceTimer && window.loadingManager) {
            enhanceNavigationLightweight();
            console.log('✅ Lightweight enhanced loading system initialized');
        }
    }, 3000); // Delayed to ensure app is fully loaded
});

function enhanceNavigationLightweight() {
    // Only enhance the most critical functions with minimal overhead
    const originalNavigateToPage = window.gptUI.navigateToPage;
    
    if (originalNavigateToPage) {
        window.gptUI.navigateToPage = async function(page) {
            console.log(`🔄 Navigating to: ${page}`);
            
            // Simple performance timing without heavy overhead
            const startTime = performance.now();
            
            try {
                const result = await originalNavigateToPage.call(this, page);
                
                const duration = Math.round(performance.now() - startTime);
                console.log(`⚡ Page ${page} loaded in ${duration}ms`);
                
                // Simple performance indicator update
                const indicator = document.getElementById('performance-indicator');
                if (indicator) {
                    const performanceText = document.getElementById('performance-text');
                    if (performanceText) {
                        performanceText.textContent = `${page}: ${duration}ms`;
                        indicator.classList.add('show');
                        
                        // Color coding
                        if (duration < 100) {
                            indicator.style.backgroundColor = 'rgba(0, 255, 136, 0.8)';
                        } else if (duration < 500) {
                            indicator.style.backgroundColor = 'rgba(255, 193, 7, 0.8)';
                        } else {
                            indicator.style.backgroundColor = 'rgba(255, 68, 68, 0.8)';
                        }
                        
                        // Auto-hide
                        setTimeout(() => indicator.classList.remove('show'), 2000);
                    }
                }
                
                return result;
            } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                console.error(`❌ Navigation to ${page} failed after ${duration}ms:`, error);
                throw error;
            }
        };
    }
}
