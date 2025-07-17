const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class CodeRewriter {
    constructor() {
        this.projectRoot = path.join(__dirname, '../..');
        this.sourceFiles = new Map(); // Cache of source file contents
        this.backups = new Map(); // Memory backup of original files
        this.persistentBackups = new Map(); // Persistent backup references
        this.restartPending = false;
        this.backupDir = path.join(this.projectRoot, '.code-rewriter-backups');
        this.operationLog = [];
        this.autoRollback = true;
        
        // Comprehensive file patterns to scan
        this.filePatterns = [
            '.js', '.ts', '.json', '.html', '.css', '.scss', 
            '.jsx', '.tsx', '.vue', '.md', '.txt', '.sql',
            '.config.js', '.config.ts', '.config.json'
        ];
        
        // Critical directories to always include
        this.criticalDirs = [
            'src', 'public', 'assets', 'config', 'database', 
            'scripts', 'components', 'pages', 'styles', 
            'utils', 'lib', 'api', 'docs', 'tests'
        ];
        
        // Files to exclude from scanning
        this.excludePatterns = [
            'node_modules', '.git', '.vscode', 'dist', 'build', 
            '.next', '.nuxt', 'coverage', '.nyc_output',
            '.code-rewriter-backups', 'logs'
        ];
        
        // Auto-cleanup settings
        this.maxBackups = 5; // Keep only the 5 most recent backups
        this.autoCleanup = true; // Enable automatic cleanup
    }

    async initialize() {
        console.log('🔧 Initializing Enhanced Code Rewriter...');
        await this.initializeBackupSystem();
        await this.scanSourceFiles();
        
        // Auto-cleanup old backups on startup
        if (this.autoCleanup) {
            await this.cleanupOldBackups(this.maxBackups);
        }
        
        console.log('✅ Enhanced Code Rewriter initialized');
        console.log(`📁 Scanning ${this.sourceFiles.size} source files`);
        console.log(`💾 Backup system ready (keeping ${this.maxBackups} backups)`);
    }

    async initializeBackupSystem() {
        try {
            // Ensure backup directory exists
            await fs.mkdir(this.backupDir, { recursive: true });
            
            // Create operation log file if it doesn't exist
            const logFile = path.join(this.backupDir, 'operations.log');
            try {
                await fs.access(logFile);
            } catch {
                await fs.writeFile(logFile, JSON.stringify([], null, 2));
            }
            
            // Load previous operation log
            const logContent = await fs.readFile(logFile, 'utf8');
            this.operationLog = JSON.parse(logContent);
            
            console.log('💾 Persistent backup system initialized');
        } catch (error) {
            console.error('⚠️ Error initializing backup system:', error);
            this.autoRollback = false; // Disable auto-rollback if backup system fails
        }
    }

    async scanSourceFiles() {
        console.log('🔍 Comprehensive source file scanning...');
        
        // Start with critical directories
        for (const dir of this.criticalDirs) {
            const dirPath = path.join(this.projectRoot, dir);
            try {
                await fs.access(dirPath);
                await this.scanDirectory(dirPath);
            } catch (error) {
                // Directory doesn't exist, skip it
                console.log(`📁 Skipping non-existent directory: ${dir}`);
            }
        }
        
        // Also scan root level files
        await this.scanDirectory(this.projectRoot, false);
        
        console.log(`📊 Scanned ${this.sourceFiles.size} files across project`);
    }

    async scanDirectory(dirPath, recursive = true) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relativePath = path.relative(this.projectRoot, fullPath);
                
                // Skip excluded patterns
                if (this.shouldExclude(relativePath, entry.name)) {
                    continue;
                }
                
                if (entry.isDirectory() && recursive) {
                    // Recursively scan subdirectories
                    await this.scanDirectory(fullPath);
                } else if (entry.isFile() && this.shouldIncludeFile(entry.name)) {
                    try {
                        const content = await fs.readFile(fullPath, 'utf8');
                        this.sourceFiles.set(relativePath, content);
                        // Removed verbose per-file logging - only show summary
                    } catch (error) {
                        console.warn(`⚠️ Could not read file ${relativePath}:`, error.message);
                    }
                }
            }
        } catch (error) {
            console.warn(`⚠️ Error scanning directory ${dirPath}:`, error.message);
        }
    }

    shouldExclude(relativePath, fileName) {
        // Check if path contains any exclude patterns
        return this.excludePatterns.some(pattern => 
            relativePath.includes(pattern) || fileName.startsWith('.')
        );
    }

    shouldIncludeFile(fileName) {
        // Check if file matches any of our patterns
        return this.filePatterns.some(pattern => 
            fileName.endsWith(pattern) || fileName.includes(pattern)
        );
    }

    getSourceContext() {
        const context = {};
        for (const [filePath, content] of this.sourceFiles) {
            context[filePath] = {
                content: content,
                lines: content.split('\n').length,
                functions: this.extractFunctions(content),
                classes: this.extractClasses(content)
            };
        }
        return context;
    }

    extractFunctions(code) {
        const functionRegex = /(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
        const functions = [];
        let match;
        
        while ((match = functionRegex.exec(code)) !== null) {
            functions.push(match[1]);
        }
        
        return functions;
    }

    extractClasses(code) {
        const classRegex = /class\s+(\w+)/g;
        const classes = [];
        let match;
        
        while ((match = classRegex.exec(code)) !== null) {
            classes.push(match[1]);
        }
        
        return classes;
    }

    async createBackup() {
        const timestamp = Date.now();
        console.log('🛡️ Starting backup creation process...');
        console.log('📅 Backup timestamp:', timestamp);
        
        try {
            console.log('📊 Creating backup metadata...');
            // Create backup metadata
            const backupInfo = {
                timestamp,
                date: new Date().toISOString(),
                files: {},
                operation: 'pre-modification-backup'
            };
            
            console.log('📁 Creating backup directory...');
            // Create timestamp-specific backup directory
            const backupTimestampDir = path.join(this.backupDir, timestamp.toString());
            await fs.mkdir(backupTimestampDir, { recursive: true });
            console.log('✅ Backup directory created:', backupTimestampDir);
            
            console.log('💾 Starting file backup process...');
            console.log('📈 Files to backup:', this.sourceFiles.size);
            console.log('🔍 Source files map size check:', this.sourceFiles.size);
            console.log('🔍 Source files map entries preview:', Array.from(this.sourceFiles.keys()).slice(0, 5));
            
            let fileCount = 0;
            // Backup all source files to persistent storage
            for (const [filePath, content] of this.sourceFiles) {
                try {
                    fileCount++;
                    console.log(`📄 [${fileCount}/${this.sourceFiles.size}] Processing: ${filePath}`);
                    console.log(`📏 File size: ${content?.length || 0} characters`);
                    
                    // Memory backup
                    console.log(`💾 Setting memory backup for: ${filePath}_${timestamp}`);
                    this.backups.set(`${filePath}_${timestamp}`, content);
                    console.log(`✅ Memory backup set successfully`);
                    
                    // Persistent backup
                    const backupFilePath = path.join(backupTimestampDir, filePath.replace(/[\/\\]/g, '_'));
                    console.log(`💿 Writing to disk: ${backupFilePath}`);
                    
                    await fs.writeFile(backupFilePath, content, 'utf8');
                    console.log(`✅ File written to disk successfully`);
                    
                    console.log(`🔐 Generating checksum for: ${filePath}`);
                    const checksum = this.generateChecksum(content);
                    console.log(`✅ Checksum generated: ${checksum}`);
                    
                    backupInfo.files[filePath] = {
                        originalPath: filePath,
                        backupPath: backupFilePath,
                        size: content.length,
                        checksum: checksum
                    };
                    console.log(`📋 Backup info recorded for: ${filePath}`);
                    
                    // Progress indicator every 5 files
                    if (fileCount % 5 === 0) {
                        console.log(`🚀 Progress update: ${fileCount}/${this.sourceFiles.size} files backed up (${Math.round(fileCount/this.sourceFiles.size*100)}%)`);
                    }
                    
                } catch (fileError) {
                    console.error(`❌ FAILED to backup file ${filePath}:`, fileError);
                    console.error(`❌ Error details:`, fileError.message);
                    console.error(`❌ File content length:`, content?.length || 0);
                    // Continue with other files even if one fails
                }
            }
            
            console.log(`✅ File backup loop completed. Processed ${fileCount} files`);
            console.log(`📊 Backup info contains ${Object.keys(backupInfo.files).length} file records`);
            
            // Save backup metadata
            const metadataPath = path.join(backupTimestampDir, 'backup-info.json');
            
            console.log('💾 Saving backup metadata...');
            console.log('📂 Metadata path:', metadataPath);
            console.log('📊 Metadata size:', JSON.stringify(backupInfo, null, 2).length, 'characters');
            
            try {
                await fs.writeFile(metadataPath, JSON.stringify(backupInfo, null, 2));
                console.log('✅ Backup metadata saved successfully:', metadataPath);
            } catch (metadataError) {
                console.error('❌ Failed to save backup metadata:', metadataError);
                throw metadataError;
            }
            
            console.log('📝 Updating operation log...');
            console.log('📊 Current operation log entries:', this.operationLog.length);
            
            // Add to operation log
            const newLogEntry = {
                timestamp,
                type: 'backup',
                status: 'success',
                filesCount: Object.keys(backupInfo.files).length
            };
            
            console.log('📝 Adding log entry:', newLogEntry);
            this.operationLog.push(newLogEntry);
            console.log('📊 Operation log now has:', this.operationLog.length, 'entries');
            
            console.log('💾 Saving operation log to disk...');
            await this.saveOperationLog();
            console.log('✅ Operation log saved successfully');
            
            console.log(`✅ Backup completed successfully: ${Object.keys(backupInfo.files).length} files backed up`);
            
            // Auto-cleanup old backups after creating new one
            if (this.autoCleanup) {
                console.log('🧹 Starting auto-cleanup of old backups...');
                await this.cleanupOldBackups(this.maxBackups);
            }
            
            console.log('🎉 Backup process complete, returning timestamp:', timestamp);
            return timestamp;
            
        } catch (error) {
            console.error('❌ Backup creation failed at step:', error);
            console.error('❌ Error details:', error.message);
            console.error('❌ Error stack:', error.stack);
            this.operationLog.push({
                timestamp,
                type: 'backup',
                status: 'failed',
                error: error.message
            });
            await this.saveOperationLog();
            throw error;
        }
    }

    generateChecksum(content) {
        try {
            console.log(`🔐 Starting checksum generation for content length: ${content?.length || 0}`);
            
            // Simple checksum for file integrity verification
            let hash = 0;
            const contentStr = content || '';
            
            console.log(`🔄 Processing ${contentStr.length} characters for checksum...`);
            
            for (let i = 0; i < contentStr.length; i++) {
                if (i % 10000 === 0 && i > 0) {
                    console.log(`🔄 Checksum progress: ${i}/${contentStr.length} characters (${Math.round(i/contentStr.length*100)}%)`);
                }
                
                const char = contentStr.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            
            const result = hash.toString(16);
            console.log(`✅ Checksum completed: ${result}`);
            return result;
        } catch (error) {
            console.error(`❌ Checksum generation failed:`, error);
            console.error(`❌ Content type:`, typeof content);
            console.error(`❌ Content preview:`, content?.substring(0, 100) || 'null');
            return 'checksum-error';
        }
    }

    async saveOperationLog() {
        try {
            const logFile = path.join(this.backupDir, 'operations.log');
            console.log('💾 Saving operation log to:', logFile);
            console.log('📊 Log entries to save:', this.operationLog.length);
            
            const logData = JSON.stringify(this.operationLog, null, 2);
            console.log('📏 Log data size:', logData.length, 'characters');
            
            await fs.writeFile(logFile, logData);
            console.log('✅ Operation log file written successfully');
        } catch (error) {
            console.error('❌ Failed to save operation log:', error);
            console.error('❌ Backup dir:', this.backupDir);
            console.error('❌ Operation log length:', this.operationLog?.length || 0);
        }
    }

    async getBackupList() {
        try {
            const backupEntries = await fs.readdir(this.backupDir);
            const timestampDirs = backupEntries
                .filter(entry => /^\d+$/.test(entry))
                .map(dir => ({
                    dir,
                    timestamp: parseInt(dir),
                    path: path.join(this.backupDir, dir),
                    date: new Date(parseInt(dir)).toISOString()
                }))
                .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
            
            return timestampDirs;
        } catch (error) {
            console.error('⚠️ Failed to get backup list:', error);
            return [];
        }
    }

    async cleanupOldBackups(maxKeep = 10) {
        try {
            const backupEntries = await fs.readdir(this.backupDir);
            const timestampDirs = backupEntries
                .filter(entry => /^\d+$/.test(entry))
                .map(dir => ({
                    dir,
                    timestamp: parseInt(dir),
                    path: path.join(this.backupDir, dir)
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
            
            if (timestampDirs.length > maxKeep) {
                const toDelete = timestampDirs.slice(maxKeep);
                let deletedCount = 0;
                
                for (const backup of toDelete) {
                    try {
                        await fs.rm(backup.path, { recursive: true, force: true });
                        deletedCount++;
                    } catch (error) {
                        console.error(`Failed to remove backup ${backup.dir}:`, error.message);
                    }
                }
                
                if (deletedCount > 0) {
                    console.log(`🧹 Cleaned up ${deletedCount} old backups`);
                }
            }
        } catch (error) {
            console.error('⚠️ Backup cleanup failed:', error);
        }
    }

    async restoreBackup(timestamp) {
        console.log(`🔄 Restoring code backup: ${timestamp}`);
        
        for (const [filePath] of this.sourceFiles) {
            const backupKey = `${filePath}_${timestamp}`;
            if (this.backups.has(backupKey)) {
                const originalContent = this.backups.get(backupKey);
                await this.writeFile(filePath, originalContent);
            }
        }
    }

    // ========================
    // DEPRECATED MANUAL MODE METHODS (COMMENTED OUT)
    // These methods are no longer used - replaced by advanced AI system
    // ========================
    
    /*
    // REMOVED: Manual mode with enablePermanentChanges parameter
    async applyCodeChanges(changes, enablePermanentChanges = false) {
        // This method has been replaced by applyChangesDirectly() 
        // which only applies permanent changes
    }
    
    // REMOVED: Individual operation methods
    async addMethod(filePath, methodName, methodCode, permanent = false) {
        // Replaced by executeChange() with 'modifyFile' operation
    }
    
    async updateMethod(filePath, methodName, newMethodCode, permanent = false) {
        // Replaced by executeChange() with 'replaceContent' operation
    }
    
    async insertAfter(filePath, searchString, insertContent, permanent = false) {
        // Replaced by executeChange() with 'insertContent' operation
    }
    
    async replaceSection(filePath, searchString, replacement, permanent = false) {
        // Replaced by executeChange() with 'replaceContent' operation
    }
    
    async createFile(filePath, content, permanent = false) {
        // Replaced by executeChange() with 'createFile' operation
    }
    
    // REMOVED: Manual writeFile with permanent parameter
    async writeFile(filePath, content, permanent = false) {
        // All file operations are now permanent only
        // Replaced by specific operation methods
    }
    */

    // ========================
    // SINGLE ADVANCED AI SYSTEM (NO MANUAL MODE, NO ECONOMICAL BYPASS)
    // ========================
    
    /**
     * MAIN ENTRY POINT - Advanced AI Code Generation Only
     */
    async generateAndApplyChanges(conversation, sourceContext, gptCore) {
        console.log('🚀 ADVANCED AI: Starting unified code generation system...');
        
        // Step 1: Create backup
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(1, 10, 'Creating safety backup...');
        }
        await this.createBackup();
        
        // Step 2: Advanced AI Analysis
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(2, 30, 'Running advanced AI analysis...');
        }
        const analysisResult = await this.advancedRequestAnalysis(conversation, sourceContext, gptCore);
        
        // Step 3: AI Code Generation
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(3, 50, 'Generating precise code modifications...');
        }
        const codeResult = await this.advancedCodeGeneration(conversation, sourceContext, analysisResult, gptCore);
        
        // Step 4: AI-Powered Validation (ENHANCED)
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(4, 70, `AI peer reviewing ${codeResult.changes?.length || 0} generated changes...`);
        }
        const validatedResult = await this.aiPoweredValidation(codeResult, sourceContext, gptCore);
        
        // Step 5: Apply Changes
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(5, 90, 'Applying validated modifications...');
        }
        const finalResult = await this.applyChangesDirectly(validatedResult.changes, gptCore);
        
        // Step 6: Complete
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(6, 100, `✅ Completed: ${finalResult.successCount} changes applied permanently`);
        }
        
        return finalResult;
    }
    
    /**
     * Rollback to a specific backup for autonomous changes gone wrong
     */
    async autonomousRollback(backupIndex = 0) {
        console.log(`🔄 AUTONOMOUS ROLLBACK: Restoring backup ${backupIndex}...`);
        
        try {
            const backupDirs = await this.getBackupList();
            if (backupDirs.length === 0) {
                throw new Error('No backups available for rollback');
            }
            
            const targetBackup = backupDirs[backupIndex];
            if (!targetBackup) {
                throw new Error(`Backup ${backupIndex} not found`);
            }
            
            await this.restoreBackup(targetBackup.timestamp);
            console.log(`✅ AUTONOMOUS ROLLBACK: Successfully restored backup from ${targetBackup.date}`);
            
            return {
                success: true,
                restoredBackup: targetBackup,
                message: `Rollback completed to backup from ${targetBackup.date}`
            };
        } catch (error) {
            console.error('❌ AUTONOMOUS ROLLBACK FAILED:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async generateFeatureCode(conversation, sourceContext, gptCore) {
        console.log('🤖 Delegating to advanced AI system...');
        
        // This method now delegates to the new advanced system
        return await this.generateAndApplyChanges(conversation, sourceContext, gptCore);
    }

    generateNoteFeatureFallback() {
        return {
            changes: [
                {
                    filePath: 'src/ui/app.js',
                    operation: 'addMethod',
                    content: `
    // Note-taking functionality
    async addNote(noteData) {
        try {
            const note = {
                id: Date.now(),
                content: noteData.content || noteData,
                timestamp: new Date().toISOString(),
                type: noteData.type || 'general'
            };
            
            this.notes = this.notes || [];
            this.notes.push(note);
            
            // Save to localStorage for persistence
            localStorage.setItem('gpt-notes', JSON.stringify(this.notes));
            
            console.log('📝 Note added:', note);
            this.showSuccess(\`Note added: \${note.content}\`);
            
            // Refresh notes view if we're on that page
            if (this.currentPage === 'notes') {
                this.loadNotes();
            }
            
            return { success: true, note: note };
        } catch (error) {
            console.error('Error adding note:', error);
            this.showError('Failed to add note');
            return { success: false, error: error.message };
        }
    }

    async editNote(noteId, newContent) {
        try {
            this.notes = this.notes || [];
            const noteIndex = this.notes.findIndex(n => n.id === noteId);
            
            if (noteIndex === -1) {
                throw new Error('Note not found');
            }
            
            this.notes[noteIndex].content = newContent;
            this.notes[noteIndex].updatedAt = new Date().toISOString();
            
            localStorage.setItem('gpt-notes', JSON.stringify(this.notes));
            
            this.showSuccess('Note updated successfully');
            if (this.currentPage === 'notes') {
                this.loadNotes();
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error editing note:', error);
            this.showError('Failed to edit note');
            return { success: false, error: error.message };
        }
    }

    async deleteNote(noteId) {
        try {
            this.notes = this.notes || [];
            const noteIndex = this.notes.findIndex(n => n.id === noteId);
            
            if (noteIndex === -1) {
                throw new Error('Note not found');
            }
            
            this.notes.splice(noteIndex, 1);
            localStorage.setItem('gpt-notes', JSON.stringify(this.notes));
            
            this.showSuccess('Note deleted successfully');
            if (this.currentPage === 'notes') {
                this.loadNotes();
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error deleting note:', error);
            this.showError('Failed to delete note');
            return { success: false, error: error.message };
        }
    }`
                },
                {
                    filePath: 'src/ui/app.js',
                    operation: 'updateMethod',
                    method: 'constructor',
                    content: `
        this.currentPage = 'dashboard';
        this.isListening = false;
        this.isGptInitialized = false;
        this.chatMessages = [];
        this.projects = [];
        this.notes = [];
        this.webSpeechRecognition = null;
        this.lastTranscript = '';
        
        // Load notes from localStorage
        this.loadNotesFromStorage();
        
        // Hardcoded inventory system with persistence
        this.initializeInventory();
        
        // Adaptive Feature Generation System
        this.currentWorkflow = null;
        this.featureBackups = [];
        this.featureFlags = new Map();`
                },
                {
                    filePath: 'src/ui/app.js',
                    operation: 'addMethod',
                    content: `
    loadNotesFromStorage() {
        try {
            const savedNotes = localStorage.getItem('gpt-notes');
            this.notes = savedNotes ? JSON.parse(savedNotes) : [];
            console.log('📝 Loaded notes from localStorage:', this.notes.length, 'notes');
        } catch (error) {
            console.error('Error loading notes:', error);
            this.notes = [];
        }
    }`
                },
                {
                    filePath: 'src/ui/app.js',
                    operation: 'updateMethod',
                    method: 'loadNotes',
                    content: `
        try {
            const notesList = document.getElementById('notesList');
            if (notesList) {
                if (this.notes.length === 0) {
                    notesList.innerHTML = \`
                        <div class="project-item" style="text-align: center; color: #666;">
                            No notes yet. Try saying "add note Buy Batteries" or use voice commands!
                        </div>
                    \`;
                } else {
                    notesList.innerHTML = this.notes.map(note => \`
                        <div class="project-item note-item" data-note-id="\${note.id}">
                            <div class="project-content">
                                <div class="project-name">\${note.content}</div>
                                <div class="project-meta">
                                    \${note.type || 'general'} • 
                                    Created: \${new Date(note.timestamp).toLocaleDateString()}
                                    \${note.updatedAt ? \` • Updated: \${new Date(note.updatedAt).toLocaleDateString()}\` : ''}
                                </div>
                            </div>
                            <div class="project-actions">
                                <button class="edit-note-btn" data-note-id="\${note.id}" style="background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Edit</button>
                                <button class="delete-note-btn" data-note-id="\${note.id}" style="background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Delete</button>
                            </div>
                        </div>
                    \`).join('');
                }
            }
        } catch (error) {
            console.error('Error loading notes:', error);
        }`
                }
            ],
            description: 'Note-taking feature with add, edit, delete functionality',
            needsRestart: true
        };
    }

    async triggerRestart() {
        if (this.restartPending) return;
        
        this.restartPending = true;
        console.log('🔄 Triggering application restart...');
        
        try {
            // Delay to allow current operations to complete
            setTimeout(() => {
                // Spawn a new process to run npm run fresh
                const child = spawn('npm', ['run', 'fresh'], {
                    cwd: this.projectRoot,
                    detached: true,
                    stdio: 'ignore',
                    shell: true
                });
                
                child.unref();
                
                // Exit current process after a short delay
                setTimeout(() => {
                    process.exit(0);
                }, 1000);
            }, 2000);
            
        } catch (error) {
            console.error('Error triggering restart:', error);
            this.restartPending = false;
        }
    }

    buildAdvancedCodeGenerationPrompt(conversation, sourceContext, analysisResult) {
        const contextSummary = this.generateContextSummary(sourceContext);
        const relevantFiles = this.identifyRelevantFiles(sourceContext, analysisResult);
        
        // ENHANCED: Include actual file content analysis if available
        const enhancedAnalysis = analysisResult.fileAnalyses ? `
🚨 CRITICAL ENHANCED CONTENT ANALYSIS 🚨
DO NOT IGNORE - USE ONLY THESE ACTUAL SELECTORS:

${Object.entries(analysisResult.fileAnalyses).map(([file, analysis]) => `
📁 FILE: ${file}
🆔 ACTUAL IDs THAT EXIST: ${analysis.htmlIdentifiers.ids.join(', ') || 'NONE'}
🎨 ACTUAL CLASSES THAT EXIST: ${analysis.htmlIdentifiers.classes.join(', ') || 'NONE'}
🔧 ACTUAL CSS VARIABLES: ${analysis.cssVariables.join(', ') || 'NONE'}
📝 HAS <style> TAG: ${analysis.hasStyleTag}
📊 CSS SELECTORS IN FILE: ${analysis.cssSelectors.ids.map(id => `#${id}`).join(', ') || 'NONE'}
`).join('')}

🚨 MANDATORY RULES:
1. ONLY use the IDs and classes listed above
2. Do NOT create new selectors like .send-button if they don't exist
3. Do NOT assume any selectors that aren't in the actual file analysis
4. If you need to style #sendBtn, use #sendBtn - NOT .send-button
5. Use existing CSS variables from the list above

⛔ VIOLATION = IMMEDIATE FAILURE ⛔
` : '';
        
        return `
SYSTEM: You are an expert full-stack software engineer with deep knowledge of JavaScript, Node.js, Electron, HTML, CSS, and modern web development practices. You have ACTUAL FILE CONTENT ANALYSIS to prevent assumptions about selectors and code structure.

ANALYSIS CONTEXT:
- Request Type: ${analysisResult.requestType}
- Scope: ${analysisResult.scope}
- Complexity: ${analysisResult.complexity}
- Risk Level: ${analysisResult.riskLevel}
- Affected Components: ${analysisResult.affectedComponents.join(', ')}
- Technical Requirements: ${analysisResult.technicalRequirements.join(', ')}
- Enhanced Context: ${analysisResult.enhancedContext ? 'YES - using actual file analysis' : 'NO'}

${enhancedAnalysis}

CONVERSATION HISTORY:
${conversation.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

PROJECT STRUCTURE OVERVIEW:
${contextSummary}

MOST RELEVANT FILES FOR THIS REQUEST:
${relevantFiles.map(file => `
=== ${file.path} ===
Type: ${file.type}
Lines: ${file.lines}
Key Elements: ${file.keyElements.join(', ')}
Content Preview:
${file.content}
`).join('\n')}

AVAILABLE OPERATIONS:
1. createFile - Create entirely new files
2. modifyFile - Add new methods/functions or append to existing files
3. replaceContent - Replace specific sections of existing files
4. insertContent - Insert content after specific text
5. updateDependencies - Add new npm packages

TASK: Generate a comprehensive JSON response that implements the requested feature with real, working code.

RESPONSE FORMAT (MANDATORY JSON):
{
    "changes": [
        {
            "filePath": "path/to/file.js",
            "operation": "createFile|modifyFile|replaceContent|insertContent|updateDependencies",
            "content": "COMPLETE, WORKING CODE - not pseudocode",
            "targetLocation": "exact text to find (for replaceContent) or text to insert after (for insertContent)",
            "dependencies": ["package1", "package2"] (for updateDependencies)
        }
    ],
    "description": "Clear description of what was implemented",
    "needsRestart": true/false,
    "reasoning": "Brief explanation of the approach taken"
}

CRITICAL REQUIREMENTS:
1. Generate REAL, executable code - no pseudocode or placeholders
2. Ensure code integrates properly with existing architecture
3. Follow established patterns and conventions in the codebase
4. Include proper error handling and validation
5. Make minimal, focused changes that accomplish the goal
6. Test integration points with existing functionality
7. Consider responsive design for UI changes
8. Maintain backward compatibility where possible

EXAMPLE FOR UI COLOR CHANGE:
If changing button color from blue to red, identify the exact CSS class/selector and provide the complete CSS rule with the new color value.

EXAMPLE FOR NEW FEATURE:
If adding functionality, create complete implementation including UI elements, event handlers, data management, and integration with existing systems.

Generate the JSON response now:`;
    }

    generateContextSummary(sourceContext) {
        const summary = [];
        const fileTypes = {};
        
        // Categorize files by type
        for (const [filePath, info] of Object.entries(sourceContext)) {
            const ext = path.extname(filePath);
            if (!fileTypes[ext]) fileTypes[ext] = [];
            fileTypes[ext].push(filePath);
        }
        
        // Generate summary
        summary.push(`Total Files: ${Object.keys(sourceContext).length}`);
        for (const [ext, files] of Object.entries(fileTypes)) {
            summary.push(`${ext || 'no-ext'}: ${files.length} files`);
        }
        
        // Key directories
        const directories = [...new Set(Object.keys(sourceContext).map(f => path.dirname(f)))];
        summary.push(`Key Directories: ${directories.slice(0, 10).join(', ')}`);
        
        return summary.join('\n');
    }

    identifyRelevantFiles(sourceContext, analysisResult) {
        const relevantFiles = [];
        const maxFiles = 5; // Limit to prevent prompt bloat
        
        // Score files based on relevance to the request
        const scoredFiles = [];
        
        for (const [filePath, info] of Object.entries(sourceContext)) {
            let score = 0;
            
            // Score based on file type and request type
            if (analysisResult.requestType.includes('ui') && (filePath.includes('ui') || filePath.includes('app'))) {
                score += 20;
            }
            
            if (filePath.includes('.css') && analysisResult.keywords.some(k => k.includes('color') || k.includes('style'))) {
                score += 25;
            }
            
            if (filePath.includes('.js') && analysisResult.requestType !== 'ui_change') {
                score += 15;
            }
            
            // Score based on keywords in content
            const content = info.content?.toLowerCase() || '';
            for (const keyword of analysisResult.keywords) {
                if (content.includes(keyword.toLowerCase())) {
                    score += 10;
                }
            }
            
            // Score based on file size (prefer medium-sized files)
            const lines = info.lines || 0;
            if (lines > 50 && lines < 500) score += 5;
            
            scoredFiles.push({
                path: filePath,
                score: score,
                info: info
            });
        }
        
        // Sort by score and take top files
        scoredFiles.sort((a, b) => b.score - a.score);
        
        for (const file of scoredFiles.slice(0, maxFiles)) {
            const ext = path.extname(file.path);
            const content = file.info.content || '';
            
            relevantFiles.push({
                path: file.path,
                type: this.getFileTypeDescription(ext),
                lines: file.info.lines || 0,
                keyElements: file.info.classes.concat(file.info.functions).slice(0, 5),
                content: content.length > 1500 ? content.substring(0, 1500) + '\n...[truncated]' : content
            });
        }
        
        return relevantFiles;
    }

    getFileTypeDescription(ext) {
        const types = {
            '.js': 'JavaScript Module',
            '.css': 'Stylesheet',
            '.html': 'HTML Template',
            '.json': 'Configuration/Data',
            '.md': 'Documentation',
            '.ts': 'TypeScript Module'
        };
        return types[ext] || 'Text File';
    }

    async analyzeFeatureRequest(conversation, gptCore) {
        console.log('🔍 Analyzing feature request scope and requirements...');
        
        const analysisPrompt = `
TASK: Analyze this feature request conversation to determine the scope, type, and requirements.

CONVERSATION:
${conversation.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

Provide a JSON analysis with the following structure:
{
    "requestType": "ui_change|backend_logic|api_modification|database_change|configuration|new_feature|refactoring|bug_fix|integration|performance|security",
    "scope": "frontend|backend|fullstack|config|database|external",
    "complexity": "simple|medium|complex",
    "affectedComponents": ["component1", "component2"],
    "requiredFiles": ["path/to/file1.js", "path/to/file2.css"],
    "dependencies": ["external_library1", "internal_module2"],
    "riskLevel": "low|medium|high",
    "estimatedChanges": "number of files estimated to change",
    "keywords": ["keyword1", "keyword2"],
    "technicalRequirements": ["requirement1", "requirement2"]
}

Focus on accurate classification and comprehensive analysis.`;

        try {
            const response = await gptCore.processCommand(analysisPrompt, 'complexReasoning');
            const analysisResult = this.extractJsonFromResponse(response.message);
            
            if (analysisResult) {
                console.log(`📊 Analysis complete: ${analysisResult.requestType} (${analysisResult.complexity})`);
                return analysisResult;
            }
        } catch (error) {
            console.error('Analysis failed:', error);
        }
        
        // Fallback analysis
        return {
            requestType: "new_feature",
            scope: "fullstack", 
            complexity: "medium",
            affectedComponents: ["ui"],
            requiredFiles: [],
            dependencies: [],
            riskLevel: "medium",
            estimatedChanges: "2-5",
            keywords: [],
            technicalRequirements: []
        };
    }

    extractJsonFromResponse(text) {
        try {
            console.log('🔍 Attempting JSON extraction from response...');
            
            // Clean the text first
            let cleanText = text.trim();
            
            // Try multiple extraction patterns
            const patterns = [
                /\{[\s\S]*\}/,                           // Standard JSON block
                /```json\s*(\{[\s\S]*?\})\s*```/,        // JSON in code blocks  
                /```\s*(\{[\s\S]*?\})\s*```/,            // JSON in generic code blocks
                /json\s*:\s*(\{[\s\S]*?\})/i,            // json: {...} pattern
                /(?:response|result|output)\s*:\s*(\{[\s\S]*?\})/i, // response: {...} pattern
                /(\{[\s\S]*?"changes"[\s\S]*?\})/        // Look for changes key specifically
            ];
            
            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                const match = cleanText.match(pattern);
                if (match) {
                    console.log(`✅ Pattern ${i+1} matched!`);
                    const jsonStr = match[1] || match[0];
                    
                    try {
                        const parsed = JSON.parse(jsonStr);
                        console.log('✅ Successfully parsed JSON with pattern', i+1);
                        console.log('📊 Parsed object keys:', Object.keys(parsed));
                        return parsed;
                    } catch (parseError) {
                        console.warn(`⚠️ Pattern ${i+1} matched but JSON parse failed:`, parseError.message);
                        console.log('📄 Attempted to parse:', jsonStr.substring(0, 100) + '...');
                        continue;
                    }
                }
            }
            
            // Try to find and fix common JSON issues
            console.log('🔧 Trying JSON repair...');
            const repairedJson = this.attemptJsonRepair(cleanText);
            if (repairedJson) {
                console.log('✅ JSON repair successful!');
                return repairedJson;
            }
            
            console.warn('❌ All JSON extraction patterns failed');
            console.log('📄 Text preview:', cleanText.substring(0, 300) + '...');
            return null;
        } catch (error) {
            console.error('❌ JSON extraction failed:', error.message);
            console.log('📄 Input text length:', text?.length || 0);
            return null;
        }
    }

    attemptJsonRepair(text) {
        try {
            // Look for JSON-like structures and try to fix common issues
            let jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            
            let jsonStr = jsonMatch[0];
            
            // Fix common issues
            jsonStr = jsonStr
                .replace(/,(\s*[}\]])/g, '$1')           // Remove trailing commas
                .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
                .replace(/:\s*'([^']*)'/g, ': "$1"')    // Replace single quotes with double quotes
                .replace(/\\n/g, '\\\\n')               // Fix newline escaping
                .replace(/\n/g, '\\n');                 // Escape actual newlines
            
            try {
                const parsed = JSON.parse(jsonStr);
                console.log('✅ JSON repair successful!');
                return parsed;
            } catch (error) {
                console.log('⚠️ JSON repair failed:', error.message);
                return null;
            }
        } catch (error) {
            console.log('⚠️ JSON repair attempt failed:', error.message);
            return null;
        }
    }

    // ========================
    // UPDATED VALIDATION METHODS (NOW USES AI-POWERED VALIDATION)
    // ========================
    
    async validateAndEnhanceChanges(codeResponse, sourceContext) {
        console.log('✅ Enhanced validation redirecting to AI-powered validation...');
        
        if (!codeResponse.changes || !Array.isArray(codeResponse.changes)) {
            codeResponse.changes = [];
        }
        
        // Basic enhancement only - main validation now done by AI
        const enhancedChanges = await Promise.all(
            codeResponse.changes.map(async (change) => {
                return await this.enhanceSingleChange(change, sourceContext);
            })
        );
        
        // Filter out invalid changes
        codeResponse.changes = enhancedChanges.filter(change => change !== null);
        
        // Add any missing dependencies or setup files
        const additionalChanges = await this.generateAdditionalRequiredChanges(codeResponse, sourceContext);
        codeResponse.changes.push(...additionalChanges);
        
        return codeResponse;
    }

    async enhanceSingleChange(change, sourceContext) {
        try {
            // Basic validation only - AI does the heavy lifting now
            if (!change.filePath || !change.operation) {
                console.warn('⚠️ Invalid change: missing filePath or operation');
                return null;
            }
            
            // Ensure file path is normalized
            change.filePath = change.filePath.replace(/\\/g, '/');
            
            // Convert old operation names to new ones
            const operationMapping = {
                'addMethod': 'modifyFile',
                'updateMethod': 'replaceContent', 
                'insertAfter': 'insertContent',
                'replaceSection': 'replaceContent'
            };
            
            if (operationMapping[change.operation]) {
                const oldOperation = change.operation;
                change.operation = operationMapping[change.operation];
                console.log(`🔄 Converted operation: ${oldOperation} → ${change.operation}`);
                
                // Map old parameters to new ones
                if (change.insertAfter) {
                    change.targetLocation = change.insertAfter;
                    delete change.insertAfter;
                }
                if (change.search) {
                    change.targetLocation = change.search;
                    delete change.search;
                }
            }
            
            return change;
            
        } catch (error) {
            console.error('Error enhancing change:', error);
            return null;
        }
    }

    async generateAdditionalRequiredChanges(codeResponse, sourceContext) {
        const additionalChanges = [];
        
        // Check if any package.json updates are needed
        const needsPackageUpdate = this.checkForNewDependencies(codeResponse);
        if (needsPackageUpdate.length > 0) {
            additionalChanges.push({
                filePath: 'package.json',
                operation: 'updateDependencies',
                dependencies: needsPackageUpdate,
                content: null // Will be generated during application
            });
        }
        
        // Check if configuration updates are needed
        const configUpdates = this.checkForConfigurationUpdates(codeResponse);
        additionalChanges.push(...configUpdates);
        
        return additionalChanges;
    }

    checkForNewDependencies(codeResponse) {
        const dependencies = [];
        const content = JSON.stringify(codeResponse);
        
        // Common dependency patterns
        const dependencyPatterns = [
            { pattern: /import.*from ['"]([^'"]+)['"]/, type: 'npm' },
            { pattern: /require\(['"]([^'"]+)['"]\)/, type: 'npm' },
            { pattern: /fetch\(/, deps: ['node-fetch'] },
            { pattern: /axios\./,  deps: ['axios'] },
            { pattern: /express\./,  deps: ['express'] },
            { pattern: /socket\.io/, deps: ['socket.io'] }
        ];
        
        for (const {pattern, deps} of dependencyPatterns) {
            if (pattern.test(content) && deps) {
                dependencies.push(...deps);
            }
        }
        
        return [...new Set(dependencies)]; // Remove duplicates
    }

    checkForConfigurationUpdates(codeResponse) {
        // This could check for config file updates, environment variables, etc.
        return [];
    }

    async generateDefaultFileContent(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath, ext);
        
        const templates = {
            '.js': `// ${fileName}.js
const ${fileName} = {
    // Implementation here
};

module.exports = ${fileName};
`,
            '.css': `/* ${fileName}.css */
.${fileName} {
    /* Styles here */
}
`,
            '.html': `<!DOCTYPE html>
<html>
<head>
    <title>${fileName}</title>
</head>
<body>
    <h1>${fileName}</h1>
</body>
</html>
`,
            '.json': `{
    "name": "${fileName}",
    "version": "1.0.0"
}
`
        };
        
        return templates[ext] || `// ${fileName}${ext}\n// Generated file\n`;
    }

    async enhanceContentForFileType(content, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        
        // Add file-specific enhancements
        switch (ext) {
            case '.js':
                // Ensure proper module structure
                if (!content.includes('module.exports') && !content.includes('export')) {
                    content += '\n\n// Module export added automatically\n// module.exports = {};';
                }
                break;
                
            case '.css':
                // Ensure CSS is well-formatted
                if (!content.includes('{') && content.includes(':')) {
                    // Looks like inline styles, wrap in a class
                    content = `.generated-styles {\n    ${content}\n}`;
                }
                break;
        }
        
        return content;
    }

    // ========================
    // IMPROVED FILE OPERATION METHODS
    // ========================
    
    /**
     * DIRECT CHANGE APPLICATION
     * Apply changes directly to files (permanent only)
     */
    async applyChangesDirectly(changes, gptCore) {
        console.log(`🔧 ADVANCED AI: Applying ${changes.length} changes directly to files...`);
        
        let successCount = 0;
        let failureCount = 0;
        
        for (const change of changes) {
            try {
                await this.executeChange(change);
                successCount++;
                console.log(`✅ Applied: ${change.operation} on ${change.filePath}`);
            } catch (error) {
                failureCount++;
                console.error(`❌ Failed: ${change.operation} on ${change.filePath}:`, error.message);
            }
        }
        
        // Update operation log
        this.operationLog.push({
            timestamp: Date.now(),
            type: 'code-modification',
            status: failureCount === 0 ? 'success' : 'partial',
            changesApplied: successCount,
            changesFailed: failureCount
        });
        await this.saveOperationLog();
        
        // Refresh source cache
        await this.scanSourceFiles();
        
        console.log(`✅ ADVANCED AI: Applied ${successCount} changes successfully, ${failureCount} failed`);
        
        return {
            successCount,
            failureCount,
            totalChanges: changes.length,
            autonomousMode: true,
            advancedAI: true
        };
    }
    
    /**
     * Execute a validated change
     */
    async executeChange(change) {
        const fullPath = path.join(this.projectRoot, change.filePath);
        
        switch (change.operation) {
            case 'createFile':
                await this.createNewFile(fullPath, change.content);
                break;
                
            case 'modifyFile':
                await this.modifyExistingFile(fullPath, change.content, change.targetLocation);
                break;
                
            case 'replaceContent':
                await this.replaceFileContent(fullPath, change.targetLocation || change.search, change.content);
                break;
                
            case 'insertContent':
                await this.insertFileContent(fullPath, change.targetLocation || change.insertAfter, change.content);
                break;
                
            case 'updateDependencies':
                // Handle package.json updates - for now just log it
                console.log(`📦 Dependencies update requested: ${change.dependencies?.join(', ') || 'none specified'}`);
                break;
                
            default:
                throw new Error(`Unknown operation: ${change.operation}. Supported operations: createFile, modifyFile, replaceContent, insertContent, updateDependencies`);
        }
        
        // Update source cache
        const relativePath = path.relative(this.projectRoot, fullPath);
        const updatedContent = await fs.readFile(fullPath, 'utf8');
        this.sourceFiles.set(relativePath, updatedContent);
    }
    
    /**
     * Create a completely new file
     */
    async createNewFile(fullPath, content) {
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf8');
        console.log(`✅ CREATED: ${path.relative(this.projectRoot, fullPath)}`);
    }
    
    /**
     * Modify an existing file - ENHANCED ERROR HANDLING
     * Purpose: Modify existing files by replacing sections or appending content
     */
    async modifyExistingFile(fullPath, content, targetLocation) {
        try {
            const existingContent = await fs.readFile(fullPath, 'utf8');
            
            if (targetLocation && existingContent.includes(targetLocation)) {
                // Replace specific location
                const newContent = existingContent.replace(targetLocation, content);
                await fs.writeFile(fullPath, newContent, 'utf8');
                console.log(`✅ MODIFIED (replaced): ${path.relative(this.projectRoot, fullPath)}`);
            } else {
                // Append to end of file
                await fs.writeFile(fullPath, existingContent + '\n\n' + content, 'utf8');
                console.log(`✅ MODIFIED (appended): ${path.relative(this.projectRoot, fullPath)}`);
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist - THROW ERROR instead of creating
                throw new Error(`Attempted to modify existing file, but file not found: ${path.relative(this.projectRoot, fullPath)}`);
            }
            throw error;
        }
    }
    
    /**
     * Replace specific content patterns within a file
     * Purpose: Find and replace specific text patterns (like changing colors, updating values)
     */
    async replaceFileContent(fullPath, searchText, replacement) {
        const content = await fs.readFile(fullPath, 'utf8');
        
        if (!content.includes(searchText)) {
            throw new Error(`Search text not found in file: ${searchText} in ${path.relative(this.projectRoot, fullPath)}`);
        }
        
        const newContent = content.replace(new RegExp(searchText, 'g'), replacement);
        await fs.writeFile(fullPath, newContent, 'utf8');
        console.log(`✅ REPLACED: ${searchText} in ${path.relative(this.projectRoot, fullPath)}`);
    }
    
    /**
     * Insert content at a specific location within a file
     * Purpose: Add new content at precise locations (like adding CSS rules, new functions)
     */
    async insertFileContent(fullPath, insertAfter, content) {
        const existingContent = await fs.readFile(fullPath, 'utf8');
        const insertIndex = existingContent.indexOf(insertAfter);
        
        if (insertIndex === -1) {
            throw new Error(`Insertion point not found: ${insertAfter} in ${path.relative(this.projectRoot, fullPath)}`);
        }
        
        const endIndex = insertIndex + insertAfter.length;
        const newContent = existingContent.slice(0, endIndex) + 
                         '\n' + content + 
                         existingContent.slice(endIndex);
        
        await fs.writeFile(fullPath, newContent, 'utf8');
        console.log(`✅ INSERTED: after "${insertAfter}" in ${path.relative(this.projectRoot, fullPath)}`);
    }

    // ========================
    // MISSING AI METHODS IMPLEMENTATION
    // ========================
    
    /**
     * Advanced AI Request Analysis
     * Analyzes the conversation to understand what needs to be built
     */
    async advancedRequestAnalysis(conversation, sourceContext, gptCore) {
        console.log('🤖 ADVANCED AI: Analyzing request with enhanced content awareness...');
        
        // ENHANCED: Identify and analyze target files based on conversation
        const targetFiles = this.identifyTargetFiles(conversation, sourceContext);
        console.log(`🔍 Identified ${targetFiles.length} target files for analysis`);
        
        // ENHANCED: Analyze actual file content to provide real context
        const fileAnalyses = {};
        for (const filePath of targetFiles.slice(0, 5)) { // Analyze up to 5 most relevant files
            const analysis = this.analyzeFileContent(filePath, sourceContext);
            if (analysis) {
                fileAnalyses[filePath] = analysis;
                console.log(`📊 Analyzed ${filePath}: ${analysis.cssSelectors.ids.length} IDs, ${analysis.cssSelectors.classes.length} classes`);
            }
        }
        
        const analysisPrompt = `
SYSTEM: You are an expert software architect analyzing feature requests. You have ACTUAL FILE CONTENT ANALYSIS to prevent assumptions.

CONVERSATION HISTORY:
${conversation.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

PROJECT CONTEXT:
- Total Files: ${Object.keys(sourceContext).length}
- Key Components: ${Object.keys(sourceContext).filter(f => f.includes('src/')).slice(0, 5).join(', ')}

ENHANCED CONTENT ANALYSIS:
${Object.entries(fileAnalyses).map(([file, analysis]) => `
File: ${file}
- IDs found: ${analysis.cssSelectors.ids.join(', ') || 'none'}
- Classes found: ${analysis.cssSelectors.classes.join(', ') || 'none'}
- CSS Variables: ${analysis.cssVariables.join(', ') || 'none'}
- Has <style> tag: ${analysis.hasStyleTag}
- Has <script> tag: ${analysis.hasScriptTag}
`).join('')}

CRITICAL: Use the ACTUAL identifiers found above. Do NOT assume selectors that don't exist.

TASK: Analyze this request and provide a JSON response with detailed technical analysis.

REQUIRED JSON FORMAT:
{
    "requestType": "ui_change|backend_logic|new_feature|bug_fix|enhancement",
    "scope": "frontend|backend|fullstack",
    "complexity": "simple|medium|complex",
    "affectedComponents": ["component1", "component2"],
    "technicalRequirements": ["requirement1", "requirement2"],
    "riskLevel": "low|medium|high",
    "keywords": ["keyword1", "keyword2"],
    "estimatedFiles": 3,
    "priority": "low|medium|high",
    "actualSelectors": ${JSON.stringify(fileAnalyses)},
    "targetFiles": ${JSON.stringify(targetFiles)}
}

Analyze the conversation and respond with only the JSON:`;

        const response = await gptCore.processCommand(analysisPrompt, 'complexReasoning');
        const analysisResult = this.extractJsonFromResponse(response.message);
        
        if (!analysisResult) {
            throw new Error('AI failed to provide valid analysis - autonomous mode requires AI analysis to proceed');
        }
        
        // ENHANCED: Add the file analysis to the result for use in code generation
        analysisResult.fileAnalyses = fileAnalyses;
        analysisResult.enhancedContext = true;
        
        console.log(`✅ Enhanced analysis complete: ${analysisResult.requestType} (${analysisResult.complexity})`);
        console.log(`🎯 Using actual selectors from ${Object.keys(fileAnalyses).length} analyzed files`);
        return analysisResult;
    }

    /**
     * Advanced AI Code Generation
     * Generates precise code modifications based on analysis
     */
    async advancedCodeGeneration(conversation, sourceContext, analysisResult, gptCore) {
        console.log('🛠️ ADVANCED AI: Generating precise code modifications...');
        
        const codePrompt = this.buildAdvancedCodeGenerationPrompt(conversation, sourceContext, analysisResult);
        
        const response = await gptCore.processCommand(codePrompt, 'complexReasoning');
        const codeResult = this.extractJsonFromResponse(response.message);
        
        if (!codeResult || !codeResult.changes) {
            throw new Error('AI failed to generate valid code modifications - autonomous mode requires AI code generation to proceed');
        }
        
        console.log(`✅ Generated ${codeResult.changes.length} code modifications`);
        return codeResult;
    }

    /**
     * AI-Powered Validation System
     * Uses AI to peer-review generated code changes
     */
    async aiPoweredValidation(codeResult, sourceContext, gptCore) {
        console.log('🔍 ADVANCED AI: AI peer-reviewing generated changes...');
        
        if (!codeResult.changes || codeResult.changes.length === 0) {
            console.log('⚠️ No changes to validate');
            return codeResult;
        }
        
        const validationPrompt = `
SYSTEM: You are a senior code reviewer. Review these generated code changes for quality, safety, and integration.

GENERATED CHANGES:
${JSON.stringify(codeResult.changes, null, 2)}

PROJECT CONTEXT:
${Object.keys(sourceContext).slice(0, 10).map(f => `- ${f}`).join('\n')}

VALIDATION CRITERIA:
1. Code quality and best practices
2. Integration with existing codebase
3. Security concerns
4. Performance implications
5. Error handling

TASK: Review each change and provide validation result.

REQUIRED JSON FORMAT:
{
    "validationStatus": "approved|rejected|needs_modification",
    "changes": [
        {
            "filePath": "same as input",
            "operation": "same as input", 
            "content": "improved/validated content",
            "validated": true,
            "improvements": ["improvement1", "improvement2"],
            "warnings": ["warning1", "warning2"]
        }
    ],
    "overallAssessment": "assessment text",
    "safetyScore": <calculated_score_0_to_100>
}

Calculate a real safety score based on the actual risks identified. Provide validation response:`;

        const response = await gptCore.processCommand(validationPrompt, 'complexReasoning');
        const validationResult = this.extractJsonFromResponse(response.message);
        
        if (!validationResult || !validationResult.changes) {
            throw new Error('AI failed to provide valid code validation - autonomous mode requires AI validation to proceed');
        }
        
        console.log(`✅ AI validation complete: ${validationResult.validationStatus}`);
        console.log(`📊 Safety score: ${validationResult.safetyScore}`);
        
        // Reject if safety score is too low
        if (validationResult.safetyScore < 70) {
            throw new Error(`AI validation rejected: Safety score ${validationResult.safetyScore} below threshold (70). Assessment: ${validationResult.overallAssessment}`);
        }
        
        // Ensure original change fields are preserved (especially targetLocation)
        for (let i = 0; i < validationResult.changes.length; i++) {
            const originalChange = codeResult.changes[i];
            const validatedChange = validationResult.changes[i];
            
            // Preserve critical fields from original if missing in validation
            if (!validatedChange.targetLocation && originalChange.targetLocation) {
                validatedChange.targetLocation = originalChange.targetLocation;
            }
            if (!validatedChange.search && originalChange.search) {
                validatedChange.search = originalChange.search;
            }
            if (!validatedChange.insertAfter && originalChange.insertAfter) {
                validatedChange.insertAfter = originalChange.insertAfter;
            }
        }
        
        return validationResult;
    }

    /**
     * Enhanced Context Analysis Methods
     * These methods examine actual file content to prevent AI assumptions
     */

    /**
     * Extract CSS selectors from file content
     */
    extractCSSSelectors(content) {
        const selectors = {
            ids: [],
            classes: [],
            elements: []
        };

        if (!content || typeof content !== 'string') return selectors;

        // Extract ID selectors (#selector)
        const idMatches = content.match(/#[\w-]+/g) || [];
        selectors.ids = [...new Set(idMatches.map(m => m.substring(1)))];

        // Extract class selectors (.selector)
        const classMatches = content.match(/\.[\w-]+/g) || [];
        selectors.classes = [...new Set(classMatches.map(m => m.substring(1)))];

        // Extract element selectors (button, div, etc.)
        const elementMatches = content.match(/\b[a-z]+\s*{/g) || [];
        selectors.elements = [...new Set(elementMatches.map(m => m.replace(/\s*{/, '')))];

        return selectors;
    }

    /**
     * Extract HTML IDs and classes from file content
     */
    extractHTMLIds(content) {
        const identifiers = {
            ids: [],
            classes: []
        };

        if (!content || typeof content !== 'string') return identifiers;

        // Extract id attributes
        const idMatches = content.match(/id=["']([^"']+)["']/g) || [];
        identifiers.ids = [...new Set(idMatches.map(m => m.match(/id=["']([^"']+)["']/)[1]))];

        // Extract class attributes
        const classMatches = content.match(/class=["']([^"']+)["']/g) || [];
        identifiers.classes = [...new Set(
            classMatches.flatMap(m => 
                m.match(/class=["']([^"']+)["']/)[1].split(/\s+/)
            )
        )];

        return identifiers;
    }

    /**
     * Extract CSS variables from file content
     */
    extractCSSVariables(content) {
        if (!content || typeof content !== 'string') return [];

        const variableMatches = content.match(/--[\w-]+/g) || [];
        return [...new Set(variableMatches)];
    }

    /**
     * Identify target files based on conversation context
     */
    identifyTargetFiles(conversation, sourceContext) {
        const targetFiles = [];
        const conversationText = conversation.map(msg => msg.content).join(' ').toLowerCase();

        // Look for specific file mentions
        for (const filePath of Object.keys(sourceContext)) {
            const fileName = path.basename(filePath).toLowerCase();
            const fileExt = path.extname(filePath);

            // Check if file is mentioned directly
            if (conversationText.includes(fileName.replace(/\.[^.]+$/, ''))) {
                targetFiles.push(filePath);
                continue;
            }

            // Check for UI-related requests and HTML/CSS files
            if (conversationText.includes('button') || conversationText.includes('color') || 
                conversationText.includes('style') || conversationText.includes('ui')) {
                if (['.html', '.css', '.scss'].includes(fileExt)) {
                    targetFiles.push(filePath);
                }
            }

            // Check for JS functionality requests
            if (conversationText.includes('function') || conversationText.includes('method') ||
                conversationText.includes('feature') || conversationText.includes('click')) {
                if (['.js', '.ts', '.jsx', '.tsx'].includes(fileExt)) {
                    targetFiles.push(filePath);
                }
            }
        }

        return [...new Set(targetFiles)];
    }

    /**
     * Analyze actual file content before generating changes
     */
    analyzeFileContent(filePath, sourceContext) {
        const fileInfo = sourceContext[filePath];
        if (!fileInfo || !fileInfo.content) return null;

        const content = fileInfo.content; // Extract the actual content string

        const analysis = {
            filePath,
            fileType: path.extname(filePath),
            cssSelectors: this.extractCSSSelectors(content),
            htmlIdentifiers: this.extractHTMLIds(content),
            cssVariables: this.extractCSSVariables(content),
            hasStyleTag: content.includes('<style>'),
            hasScriptTag: content.includes('<script>'),
            lineCount: content.split('\n').length
        };

        return analysis;
    }

}

/*
========================
STREAMLINED SYSTEM SUMMARY
========================
/*
NEW STREAMLINED WORKFLOW:

1. generateAndApplyChanges() - MAIN ENTRY POINT
   - Single advanced AI system (no manual mode, no bypass)
   - Creates backup → AI analysis → code generation → AI validation → apply changes

2. AI-POWERED VALIDATION SYSTEM:
   - aiPoweredValidation() - AI peer review with source context
   - aiValidateSingleChange() - Individual change review
   - getRelatedFilesForValidation() - Context building
   - NO basic validation fallback (throws errors instead)

3. ADVANCED AI METHODS:
   - advancedRequestAnalysis() - Comprehensive request understanding
   - advancedCodeGeneration() - Sophisticated code creation
   - selectRelevantFiles() - Smart file selection

4. FILE OPERATION METHODS:
   - executeChange() - Routes to specific operation
   - createNewFile() - Create new files
   - modifyExistingFile() - Modify existing (throws error if not found)
   - replaceFileContent() - Find/replace patterns
   - insertFileContent() - Insert at specific locations

REMOVED/DEPRECATED:
- Manual mode (permanent=false parameter)
- Economical bypass system
- Basic validation fallback
- Individual operation methods (addMethod, updateMethod, etc.)
- Manual writeFile with permanent parameter

ENHANCED FEATURES:
- AI peer review validation
- Full source context awareness
- Strict improvement controls
- Better error handling
- Cleaner operation types
*/


module.exports = CodeRewriter;
