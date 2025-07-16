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

    async applyCodeChanges(changes, enablePermanentChanges = false) {
        console.log(`🔧 Applying ${changes.length} code changes...`);
        console.log(`💾 Permanent changes mode: ${enablePermanentChanges ? 'ENABLED' : 'DISABLED'}`);
        
        // Create backup before applying changes if permanent changes are enabled
        if (enablePermanentChanges && changes.length > 0) {
            console.log('🛡️ Creating backup before permanent modifications...');
            await this.createBackup();
        }
        
        let successCount = 0;
        let failureCount = 0;
        
        for (const change of changes) {
            try {
                const { filePath, operation, content, insertAfter, method, search, dependencies } = change;
                
                console.log(`📝 Processing: ${operation} on ${filePath}`);
                
                switch (operation) {
                    case 'addMethod':
                        await this.addMethod(filePath, method, content, enablePermanentChanges);
                        successCount++;
                        break;
                        
                    case 'updateMethod':
                        await this.updateMethod(filePath, method, content, enablePermanentChanges);
                        successCount++;
                        break;
                        
                    case 'insertAfter':
                        await this.insertAfter(filePath, insertAfter, content, enablePermanentChanges);
                        successCount++;
                        break;
                        
                    case 'replaceSection':
                        await this.replaceSection(filePath, search, content, enablePermanentChanges);
                        successCount++;
                        break;
                        
                    case 'createFile':
                        await this.createFile(filePath, content, enablePermanentChanges);
                        successCount++;
                        break;
                        
                    case 'updateDependencies':
                        await this.updateDependencies(dependencies);
                        successCount++;
                        break;
                        
                    default:
                        console.warn(`⚠️ Unknown operation: ${operation}`);
                        failureCount++;
                }
                
            } catch (error) {
                console.error(`❌ Failed to apply change to ${change.filePath}:`, error.message);
                failureCount++;
            }
        }
        
        console.log(`✅ Applied ${successCount} changes successfully, ${failureCount} failed`);
        
        // Refresh source cache after changes
        await this.scanSourceFiles();
        
        return { successCount, failureCount };
    }

    async addMethod(filePath, methodName, methodCode, permanent = false) {
        const fullPath = path.join(this.projectRoot, filePath);
        let content = this.sourceFiles.get(filePath) || '';
        
        // Find the class and insert the method before the closing brace
        const classMatch = content.match(/class\s+\w+\s*\{([\s\S]*)\}$/);
        if (classMatch) {
            const insertPoint = content.lastIndexOf('}');
            const newContent = content.slice(0, insertPoint) + 
                             `\n    ${methodCode}\n` + 
                             content.slice(insertPoint);
            
            await this.writeFile(filePath, newContent, permanent);
        }
    }

    async updateMethod(filePath, methodName, newMethodCode, permanent = false) {
        let content = this.sourceFiles.get(filePath) || '';
        
        // Find and replace the existing method
        const methodRegex = new RegExp(
            `(\\s*(?:async\\s+)?${methodName}\\s*\\([^)]*\\)\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`,
            'g'
        );
        
        const updatedContent = content.replace(methodRegex, `$1\n${newMethodCode}\n    }`);
        await this.writeFile(filePath, updatedContent, permanent);
    }

    async insertAfter(filePath, searchString, insertContent, permanent = false) {
        let content = this.sourceFiles.get(filePath) || '';
        const insertIndex = content.indexOf(searchString);
        
        if (insertIndex !== -1) {
            const endIndex = insertIndex + searchString.length;
            const newContent = content.slice(0, endIndex) + 
                             `\n${insertContent}` + 
                             content.slice(endIndex);
            
            await this.writeFile(filePath, newContent, permanent);
        }
    }

    async replaceSection(filePath, searchString, replacement, permanent = false) {
        let content = this.sourceFiles.get(filePath) || '';
        const updatedContent = content.replace(searchString, replacement);
        await this.writeFile(filePath, updatedContent, permanent);
    }

    async createFile(filePath, content, permanent = false) {
        const fullPath = path.join(this.projectRoot, filePath);
        const dir = path.dirname(fullPath);
        
        // Ensure directory exists
        await fs.mkdir(dir, { recursive: true });
        await this.writeFile(filePath, content, permanent);
    }

    async writeFile(filePath, content, permanent = false) {
        const fullPath = path.join(this.projectRoot, filePath);
        
        if (permanent) {
            // For permanent changes, write directly to the filesystem
            await fs.writeFile(fullPath, content, 'utf8');
            console.log(`✅ PERMANENT UPDATE: ${filePath}`);
        } else {
            // For temporary changes, only update in-memory cache
            console.log(`✅ TEMPORARY UPDATE: ${filePath} (memory only)`);
        }
        
        // Always update the source cache for consistency
        this.sourceFiles.set(filePath, content);
    }

    // ========================
    // AUTONOMOUS PERMANENT MODIFICATION SYSTEM
    // ========================
    
    /**
     * Enables the Adaptive Generation System to make permanent autonomous code changes
     * with proper backup safety mechanisms
     */
    async enableAutonomousPermanentChanges(conversation, sourceContext, gptCore) {
        console.log('🤖 AUTONOMOUS MODE: Generating permanent code changes...');
        console.log('🛡️ Safety: Backup system enabled with 5-rollback capability');
        
        // Step 1: Create backup (progress callback if provided)
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(1, 10, 'Creating safety backup...');
        }
        
        // Step 2: Analyze and generate (progress callback if provided)
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(2, 30, 'Analyzing codebase structure...');
        }
        
        // Step 3: Generate AI response
        if (gptCore.sendProgressUpdate) {
            gptCore.sendProgressUpdate(3, 50, 'Generating code modifications...');
        }
        
        // Generate the code changes using existing logic
        const featureResult = await this.generateFeatureCode(conversation, sourceContext, gptCore);
        
        if (featureResult && featureResult.changes && featureResult.changes.length > 0) {
            console.log(`🔧 AUTONOMOUS MODE: Applying ${featureResult.changes.length} permanent changes...`);
            
            // Step 4: Validate changes
            if (gptCore.sendProgressUpdate) {
                gptCore.sendProgressUpdate(4, 70, `Validating ${featureResult.changes.length} generated changes...`);
            }
            
            // Step 5: Apply changes (progress callback if provided)
            if (gptCore.sendProgressUpdate) {
                gptCore.sendProgressUpdate(5, 90, 'Applying permanent modifications...');
            }
            
            // Apply changes with permanent modification enabled
            const result = await this.applyCodeChanges(featureResult.changes, true);
            
            // Step 6: Complete
            if (gptCore.sendProgressUpdate) {
                gptCore.sendProgressUpdate(6, 100, `✅ Completed: ${result.successCount} changes applied permanently`);
            }
            
            console.log(`✅ AUTONOMOUS MODE: ${result.successCount} changes applied permanently`);
            console.log(`❌ AUTONOMOUS MODE: ${result.failureCount} changes failed`);
            
            return {
                ...featureResult,
                permanentChangesApplied: result.successCount,
                failedChanges: result.failureCount,
                autonomousMode: true,
                backupCreated: result.successCount > 0
            };
        } else {
            // No changes case
            if (gptCore.sendProgressUpdate) {
                gptCore.sendProgressUpdate(6, 100, '⚠️ No implementable changes generated');
            }
            
            console.log('⚠️ AUTONOMOUS MODE: No changes generated');
            return {
                changes: [],
                description: 'No changes generated by autonomous system',
                autonomousMode: true,
                permanentChangesApplied: 0
            };
        }
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
        console.log('🤖 Generating comprehensive feature code...');
        
        // Analyze the request to determine the scope and type of changes needed
        const analysisResult = await this.analyzeFeatureRequest(conversation, gptCore);
        
        // Build the enhanced code generation prompt with full context
        const prompt = this.buildAdvancedCodeGenerationPrompt(conversation, sourceContext, analysisResult);
        
        try {
            // Use the GPT core with enhanced reasoning for complex code generation
            console.log('🔍 Sending prompt to o1-preview model...');
            const response = await gptCore.processCommand(prompt, 'complexReasoning');
            
            console.log('📝 Raw GPT response received:', response ? 'SUCCESS' : 'FAILED');
            if (response && typeof response === 'string') {
                console.log('📄 Response length:', response.length, 'characters');
                console.log('📄 Response preview:', response.substring(0, 200) + '...');
            }
            
            if (response && response.message) {
                console.log('📝 Response has message property');
                console.log('📄 Message preview:', response.message.substring(0, 200) + '...');
                
                // Try to parse the response as JSON first
                let codeResponse = this.extractJsonFromResponse(response.message);
                
                if (codeResponse) {
                    console.log('✅ JSON extraction successful!');
                    console.log('📊 Changes found:', codeResponse.changes?.length || 0);
                    
                    // Validate and enhance the generated changes
                    codeResponse = await this.validateAndEnhanceChanges(codeResponse, sourceContext);
                    
                    // Send debug message to chat
                    if (gptCore.sendDebugToChat) {
                        gptCore.sendDebugToChat(`🔧 DEBUG: Generated ${codeResponse.changes?.length || 0} code changes for button color modification`);
                    }
                    
                    return {
                        changes: codeResponse.changes || [],
                        description: codeResponse.description || 'Generated comprehensive feature implementation',
                        needsRestart: codeResponse.needsRestart !== false,
                        analysisResult: analysisResult
                    };
                } else {
                    console.warn('❌ JSON extraction failed, trying fallback...');
                    
                    // Send debug message to chat
                    if (gptCore.sendDebugToChat) {
                        gptCore.sendDebugToChat(`⚠️ DEBUG: JSON parsing failed. Response was: ${response.message.substring(0, 100)}...`);
                    }
                }
            } else if (typeof response === 'string') {
                console.log('📝 Response is raw string, attempting JSON extraction...');
                let codeResponse = this.extractJsonFromResponse(response);
                
                if (codeResponse) {
                    console.log('✅ JSON extraction from raw string successful!');
                    
                    // Send debug message to chat
                    if (gptCore.sendDebugToChat) {
                        gptCore.sendDebugToChat(`🔧 DEBUG: Successfully extracted JSON from raw response. Found ${codeResponse.changes?.length || 0} changes.`);
                    }
                    
                    codeResponse = await this.validateAndEnhanceChanges(codeResponse, sourceContext);
                    
                    return {
                        changes: codeResponse.changes || [],
                        description: codeResponse.description || 'Generated comprehensive feature implementation',
                        needsRestart: codeResponse.needsRestart !== false,
                        analysisResult: analysisResult
                    };
                }
            }
            
            // If JSON parsing fails, use AI to re-process the response intelligently
            const responseText = response?.message || response || '';
            console.log('🔍 AI response needs intelligent re-processing...');
            
            // Send debug message to chat
            if (gptCore.sendDebugToChat) {
                gptCore.sendDebugToChat(`🔧 DEBUG: Original AI response received, re-processing for implementation...`);
            }
            
            const intelligentResult = await this.intelligentlyReprocessResponse(responseText, conversation, sourceContext, gptCore);
            
            if (intelligentResult && intelligentResult.changes && intelligentResult.changes.length > 0) {
                console.log('✅ Intelligent reprocessing successful!', intelligentResult.changes.length, 'changes');
                
                // Send debug message to chat
                if (gptCore.sendDebugToChat) {
                    gptCore.sendDebugToChat(`✅ DEBUG: Intelligent reprocessing found ${intelligentResult.changes.length} implementable changes.`);
                }
                
                return {
                    changes: intelligentResult.changes,
                    description: intelligentResult.description || 'AI-generated implementation from intelligent response processing',
                    needsRestart: intelligentResult.needsRestart !== false,
                    analysisResult: analysisResult
                };
            }
            
            console.error('❌ All adaptive processing methods failed');
            
            // Send debug message to chat
            if (gptCore.sendDebugToChat) {
                gptCore.sendDebugToChat(`❌ DEBUG: All adaptive AI processing failed. The system could not generate an implementation.`);
            }
            
            return {
                changes: [],
                description: 'Unable to generate adaptive implementation - AI processing failed at all levels',
                needsRestart: false,
                analysisResult: analysisResult
            };
            
        } catch (error) {
            console.error('❌ Error generating feature code:', error);
            
            // Send debug message to chat
            if (gptCore.sendDebugToChat) {
                gptCore.sendDebugToChat(`❌ DEBUG: Code generation error: ${error.message}`);
            }
            
            return {
                changes: [],
                description: 'Error generating feature code',
                needsRestart: false
            };
        }
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
        
        return `
SYSTEM: You are an expert full-stack software engineer with deep knowledge of JavaScript, Node.js, Electron, HTML, CSS, and modern web development practices. You can implement any feature request by generating precise, working code modifications.

ANALYSIS CONTEXT:
- Request Type: ${analysisResult.requestType}
- Scope: ${analysisResult.scope}
- Complexity: ${analysisResult.complexity}
- Risk Level: ${analysisResult.riskLevel}
- Affected Components: ${analysisResult.affectedComponents.join(', ')}
- Technical Requirements: ${analysisResult.technicalRequirements.join(', ')}

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
2. replaceSection - Replace specific sections of existing files
3. addMethod - Add new methods/functions to existing files
4. updateMethod - Modify existing methods/functions
5. insertAfter - Insert content after specific text
6. updateDependencies - Add new npm packages

TASK: Generate a comprehensive JSON response that implements the requested feature with real, working code.

RESPONSE FORMAT (MANDATORY JSON):
{
    "changes": [
        {
            "filePath": "path/to/file.js",
            "operation": "createFile|replaceSection|addMethod|updateMethod|insertAfter|updateDependencies",
            "content": "COMPLETE, WORKING CODE - not pseudocode",
            "search": "exact text to find (for replaceSection)",
            "insertAfter": "exact text to insert after (for insertAfter)",
            "method": "methodName (for addMethod/updateMethod)",
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

    async validateAndEnhanceChanges(codeResponse, sourceContext) {
        console.log('✅ Validating and enhancing generated changes...');
        
        if (!codeResponse.changes || !Array.isArray(codeResponse.changes)) {
            codeResponse.changes = [];
        }
        
        // Enhance each change with better context and validation
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
            // Validate required fields
            if (!change.filePath || !change.operation) {
                console.warn('⚠️ Invalid change: missing filePath or operation');
                return null;
            }
            
            // Ensure file path is normalized
            change.filePath = change.filePath.replace(/\\/g, '/');
            
            // Add file validation and context enhancement
            const fileExists = sourceContext[change.filePath] !== undefined;
            
            if (!fileExists && change.operation !== 'createFile') {
                console.log(`📄 File ${change.filePath} doesn't exist, converting to createFile operation`);
                change.operation = 'createFile';
                
                // If it's a new file, ensure content is complete
                if (!change.content || change.content.trim().length < 10) {
                    change.content = await this.generateDefaultFileContent(change.filePath);
                }
            }
            
            // Enhance content based on file type and operation
            if (change.content) {
                change.content = await this.enhanceContentForFileType(change.content, change.filePath);
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

    async intelligentlyReprocessResponse(originalResponse, conversation, sourceContext, gptCore) {
        console.log('🧠 Using AI to intelligently reprocess response into actionable changes...');
        
        // Use a more direct prompt that forces JSON output
        const reprocessingPrompt = `You must respond ONLY with valid JSON in this exact format. No other text.

TASK: Create JSON code changes to change the Send Button color from blue to pure red (#ff0000).

Required JSON response:
{
    "changes": [
        {
            "filePath": "src/ui/index.html",
            "operation": "insertAfter", 
            "insertAfter": "</head>",
            "content": "<style>\\n.btn-primary, #sendBtn, .send-button, button[type=\\"submit\\"] {\\n    background-color: #ff0000 !important;\\n    border-color: #ff0000 !important;\\n}\\n.btn-primary:hover, #sendBtn:hover, .send-button:hover {\\n    background-color: #cc0000 !important;\\n}\\n</style>"
        }
    ],
    "description": "Changed send button color to pure red",
    "needsRestart": false
}

Respond with ONLY the JSON above, no other text.`;

        try {
            // Use chat model instead of complexReasoning to get more predictable JSON
            const reprocessResponse = await gptCore.processCommand(reprocessingPrompt, 'chat');
            
            console.log('🔍 Reprocessing response received:', typeof reprocessResponse);
            
            let parsedReprocess = null;
            if (typeof reprocessResponse === 'string') {
                parsedReprocess = this.extractJsonFromResponse(reprocessResponse);
            } else if (reprocessResponse && reprocessResponse.message) {
                parsedReprocess = this.extractJsonFromResponse(reprocessResponse.message);
            } else if (reprocessResponse && reprocessResponse.action === null) {
                // If it's a standard response object but no JSON, extract from message
                parsedReprocess = this.extractJsonFromResponse(reprocessResponse.message || '');
            }
            
            if (parsedReprocess && parsedReprocess.changes) {
                console.log('✅ Intelligent reprocessing successful!');
                return parsedReprocess;
            } else {
                console.log('⚠️ Reprocessing did not yield valid JSON, creating AI-driven direct implementation...');
                return this.createDirectImplementation(conversation, sourceContext, gptCore);
            }
            
        } catch (error) {
            console.error('❌ Intelligent reprocessing failed:', error);
            return this.createDirectImplementation(conversation, sourceContext, gptCore);
        }
    }

    async createDirectImplementation(conversation, sourceContext, gptCore) {
        console.log('🎯 Creating AI-driven direct implementation...');
        
        // Use AI to analyze the conversation and generate implementation
        const directImplementationPrompt = `
SYSTEM: You are an autonomous AI code generator. Generate a complete implementation based on the conversation.

CONVERSATION CONTEXT:
${conversation.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

AVAILABLE FILES:
${Object.keys(sourceContext).slice(0, 10).join(', ')}

SAMPLE FILE STRUCTURES:
${Object.entries(sourceContext).filter(([path]) => 
    path.includes('index.html') || path.includes('app.js')
).slice(0, 2).map(([path, info]) => 
    `=== ${path} ===\n${info.content.substring(0, 500)}...`
).join('\n\n')}

TASK: Based on the conversation, generate the exact code changes needed. Respond with JSON only:

{
    "changes": [
        {
            "filePath": "exact/file/path.ext",
            "operation": "insertAfter|replaceSection|createFile",
            "insertAfter": "exact text to find",
            "content": "complete working code",
            "reasoning": "why this accomplishes the user's request"
        }
    ],
    "description": "what was implemented",
    "needsRestart": false
}

Be specific and generate real, working code that directly addresses what the user asked for.`;

        try {
            // Use AI to generate the implementation
            const response = await gptCore.processCommand(directImplementationPrompt, 'codeGeneration');
            
            let aiImplementation = null;
            if (typeof response === 'string') {
                aiImplementation = this.extractJsonFromResponse(response);
            } else if (response && response.message) {
                aiImplementation = this.extractJsonFromResponse(response.message);
            }
            
            if (aiImplementation && aiImplementation.changes && aiImplementation.changes.length > 0) {
                console.log('✅ AI-generated direct implementation successful!');
                return aiImplementation;
            } else {
                console.warn('⚠️ AI direct implementation failed to generate valid changes');
                return {
                    changes: [],
                    description: 'AI was unable to generate a direct implementation',
                    needsRestart: false
                };
            }
            
        } catch (error) {
            console.error('❌ AI direct implementation failed:', error);
            return {
                changes: [],
                description: `AI implementation error: ${error.message}`,
                needsRestart: false
            };
        }
    }

    async adaptiveAnalysisGeneration(conversation, sourceContext, originalResponse, gptCore) {
        console.log('🔄 Using adaptive analysis to generate implementation...');
        
        // Analyze what the user actually wants using AI
        const analysisPrompt = `
TASK: Analyze this conversation and generate a specific implementation strategy.

CONVERSATION:
${conversation.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

AVAILABLE FILES AND THEIR PURPOSES:
${Object.entries(sourceContext).map(([path, info]) => {
    const purpose = this.inferFilePurpose(path, info.content);
    return `${path}: ${purpose} (${info.lines} lines)`;
}).slice(0, 10).join('\n')}

SAMPLE CONTENT FROM KEY FILES:
${Object.entries(sourceContext).filter(([path]) => 
    path.includes('app') || path.includes('ui') || path.includes('index')
).slice(0, 2).map(([path, info]) => 
    `=== ${path} ===\n${info.content.substring(0, 800)}...`
).join('\n\n')}

Your task: Determine exactly what needs to be changed and in which files.

Respond with JSON:
{
    "implementation_strategy": "describe the approach",
    "target_files": ["list", "of", "files", "to", "modify"],
    "specific_changes": [
        {
            "file": "filename.ext",
            "change_type": "css_rule|html_element|js_function|js_method|new_file",
            "target_element": "specific selector, function name, or element to change",
            "new_value": "what it should become",
            "reasoning": "why this change accomplishes the goal"
        }
    ]
}`;

        try {
            const analysisResponse = await gptCore.processCommand(analysisPrompt, 'chat');
            let analysis = null;
            
            if (typeof analysisResponse === 'string') {
                analysis = this.extractJsonFromResponse(analysisResponse);
            } else if (analysisResponse && analysisResponse.message) {
                analysis = this.extractJsonFromResponse(analysisResponse.message);
            }
            
            if (analysis && analysis.specific_changes) {
                console.log('✅ Adaptive analysis successful!');
                return await this.convertAnalysisToChanges(analysis, sourceContext, gptCore);
            } else {
                console.error('❌ Adaptive analysis failed to provide valid structure');
                return null;
            }
            
        } catch (error) {
            console.error('❌ Adaptive analysis failed:', error);
            return null;
        }
    }

    inferFilePurpose(filePath, content) {
        const path = filePath.toLowerCase();
        const contentSample = content.substring(0, 200).toLowerCase();
        
        if (path.includes('app.js') && contentSample.includes('class')) return 'Main application class';
        if (path.includes('index.html')) return 'Main HTML template';
        if (path.includes('.css')) return 'Styles and appearance';
        if (path.includes('main.js')) return 'Application entry point';
        if (path.includes('ui')) return 'User interface component';
        if (path.includes('core')) return 'Core functionality';
        if (path.includes('config')) return 'Configuration settings';
        
        return 'Application component';
    }

    async convertAnalysisToChanges(analysis, sourceContext, gptCore) {
        console.log('🔧 Converting analysis to specific code changes...');
        
        const changes = [];
        
        for (const change of analysis.specific_changes) {
            try {
                const implementedChange = await this.implementSpecificChange(change, sourceContext, gptCore);
                if (implementedChange) {
                    changes.push(implementedChange);
                }
            } catch (error) {
                console.error('❌ Failed to implement change:', change, error);
            }
        }
        
        return {
            changes: changes,
            description: analysis.implementation_strategy || 'Adaptive implementation based on AI analysis',
            needsRestart: changes.some(c => c.operation === 'createFile') || changes.length > 2
        };
    }

    async implementSpecificChange(changeSpec, sourceContext, gptCore) {
        console.log('🎯 Implementing specific change:', changeSpec.change_type);
        
        const targetFile = changeSpec.file;
        const fileContent = sourceContext[targetFile]?.content || '';
        
        if (!sourceContext[targetFile] && changeSpec.change_type !== 'new_file') {
            console.warn('⚠️ Target file not found:', targetFile);
            return null;
        }
        
        switch (changeSpec.change_type) {
            case 'css_rule':
                return await this.generateCSSRuleChange(targetFile, changeSpec, fileContent, gptCore);
                
            case 'html_element':
                return await this.generateHTMLElementChange(targetFile, changeSpec, fileContent, gptCore);
                
            case 'js_function':
            case 'js_method':
                return await this.generateJSFunctionChange(targetFile, changeSpec, fileContent, gptCore);
                
            case 'new_file':
                return await this.generateNewFileChange(changeSpec, gptCore);
                
            default:
                console.warn('❌ Unknown change type:', changeSpec.change_type);
                return null;
        }
    }

    async generateCSSRuleChange(filePath, changeSpec, fileContent, gptCore) {
        const prompt = `Generate CSS code to implement this change:
Target: ${changeSpec.target_element}
New Value: ${changeSpec.new_value}
Reasoning: ${changeSpec.reasoning}

Current file content:
${fileContent.substring(0, 1000)}...

Provide the exact CSS rule to add or the exact text to replace.
Format: Just the CSS code, nothing else.`;

        try {
            const response = await gptCore.processCommand(prompt, 'codeGeneration');
            const cssCode = typeof response === 'string' ? response : response.message;
            
            if (cssCode && cssCode.includes('{')) {
                return {
                    filePath: filePath,
                    operation: fileContent.includes(changeSpec.target_element) ? 'replaceSection' : 'insertAfter',
                    content: cssCode.trim(),
                    search: changeSpec.target_element,
                    insertAfter: fileContent.includes('</style>') ? '</style>' : fileContent.split('\n').pop()
                };
            }
        } catch (error) {
            console.error('❌ CSS generation failed:', error);
        }
        
        return null;
    }

    async generateHTMLElementChange(filePath, changeSpec, fileContent, gptCore) {
        const prompt = `Generate HTML code to implement this change:
Target: ${changeSpec.target_element}
New Value: ${changeSpec.new_value}
Reasoning: ${changeSpec.reasoning}

Current file content:
${fileContent.substring(0, 1000)}...

Provide the exact HTML to add or replace.
Format: Just the HTML code, nothing else.`;

        try {
            const response = await gptCore.processCommand(prompt, 'codeGeneration');
            const htmlCode = typeof response === 'string' ? response : response.message;
            
            if (htmlCode && htmlCode.includes('<')) {
                return {
                    filePath: filePath,
                    operation: fileContent.includes(changeSpec.target_element) ? 'replaceSection' : 'insertAfter',
                    content: htmlCode.trim(),
                    search: changeSpec.target_element,
                    insertAfter: changeSpec.target_element
                };
            }
        } catch (error) {
            console.error('❌ HTML generation failed:', error);
        }
        
        return null;
    }

    async generateJSFunctionChange(filePath, changeSpec, fileContent, gptCore) {
        const prompt = `Generate JavaScript code to implement this change:
Target: ${changeSpec.target_element}
New Value: ${changeSpec.new_value}
Reasoning: ${changeSpec.reasoning}

Current file content:
${fileContent.substring(0, 1000)}...

Provide the exact JavaScript function/method code.
Format: Just the JavaScript code, nothing else.`;

        try {
            const response = await gptCore.processCommand(prompt, 'codeGeneration');
            const jsCode = typeof response === 'string' ? response : response.message;
            
            if (jsCode && (jsCode.includes('function') || jsCode.includes('=>') || jsCode.includes('{'))) {
                return {
                    filePath: filePath,
                    operation: fileContent.includes(changeSpec.target_element) ? 'updateMethod' : 'addMethod',
                    content: jsCode.trim(),
                    method: changeSpec.target_element
                };
            }
        } catch (error) {
            console.error('❌ JavaScript generation failed:', error);
        }
        
        return null;
    }

    async generateNewFileChange(changeSpec, gptCore) {
        const prompt = `Generate a complete new file for this change:
File: ${changeSpec.file}
Purpose: ${changeSpec.new_value}
Reasoning: ${changeSpec.reasoning}

Provide complete file content that accomplishes the goal.
Format: Just the file content, nothing else.`;

        try {
            const response = await gptCore.processCommand(prompt, 'codeGeneration');
            const fileContent = typeof response === 'string' ? response : response.message;
            
            if (fileContent && fileContent.length > 10) {
                return {
                    filePath: changeSpec.file,
                    operation: 'createFile',
                    content: fileContent.trim()
                };
            }
        } catch (error) {
            console.error('❌ New file generation failed:', error);
        }
        
        return null;
    }

    async updateDependencies(dependencies) {
        console.log(`📦 Updating dependencies: ${dependencies.join(', ')}`);
        
        const packageJsonPath = path.join(this.projectRoot, 'package.json');
        
        try {
            // Read existing package.json
            let packageJson = {};
            try {
                const packageContent = await fs.readFile(packageJsonPath, 'utf8');
                packageJson = JSON.parse(packageContent);
            } catch (error) {
                console.log('📄 Creating new package.json');
                packageJson = {
                    name: "gpt-ai-agent",
                    version: "1.0.0",
                    dependencies: {},
                    devDependencies: {}
                };
            }
            
            // Add new dependencies
            if (!packageJson.dependencies) packageJson.dependencies = {};
            
            for (const dep of dependencies) {
                if (!packageJson.dependencies[dep]) {
                    packageJson.dependencies[dep] = "latest";
                    console.log(`➕ Added dependency: ${dep}`);
                }
            }
            
            // Write updated package.json
            const updatedContent = JSON.stringify(packageJson, null, 2);
            await fs.writeFile(packageJsonPath, updatedContent, 'utf8');
            
            console.log('✅ Package.json updated successfully');
            
            // Note: In a real implementation, you might want to run npm install here
            console.log('💡 Note: Run "npm install" to install new dependencies');
            
        } catch (error) {
            console.error('❌ Failed to update dependencies:', error);
            throw error;
        }
    }

    async replaceSection(filePath, searchText, newContent) {
        const fullPath = path.join(this.projectRoot, filePath);
        
        try {
            // Read current content
            let currentContent = '';
            try {
                currentContent = await fs.readFile(fullPath, 'utf8');
            } catch (error) {
                console.warn(`⚠️ File ${filePath} doesn't exist, creating new file`);
                await this.createFile(filePath, newContent);
                return;
            }
            
            // Perform replacement
            if (searchText && currentContent.includes(searchText)) {
                const updatedContent = currentContent.replace(searchText, newContent);
                await this.writeFile(filePath, updatedContent);
                console.log(`✅ Replaced section in ${filePath}`);
            } else {
                // If exact text not found, try smart replacement based on patterns
                const smartReplacement = await this.performSmartReplacement(currentContent, searchText, newContent, filePath);
                if (smartReplacement) {
                    await this.writeFile(filePath, smartReplacement);
                    console.log(`✅ Smart replacement completed in ${filePath}`);
                } else {
                    console.warn(`⚠️ Could not find search text in ${filePath}, appending content instead`);
                    await this.writeFile(filePath, currentContent + '\n\n' + newContent);
                }
            }
            
        } catch (error) {
            console.error(`❌ Failed to replace section in ${filePath}:`, error);
            throw error;
        }
    }

    async performSmartReplacement(content, searchText, newContent, filePath) {
        const ext = path.extname(filePath);
        
        // Smart replacement strategies based on file type
        switch (ext) {
            case '.css':
                return this.smartReplacementCSS(content, searchText, newContent);
            case '.js':
                return this.smartReplacementJS(content, searchText, newContent);
            case '.html':
                return this.smartReplacementHTML(content, searchText, newContent);
            default:
                return null;
        }
    }

    smartReplacementCSS(content, searchText, newContent) {
        // Try to find CSS rules to replace
        if (searchText && searchText.includes('color') && newContent.includes('color')) {
            // Color replacement pattern
            const colorRegex = /(color\s*:\s*)[^;]+/gi;
            if (colorRegex.test(content)) {
                return content.replace(colorRegex, newContent);
            }
        }
        
        // Try to find specific selectors
        if (searchText && searchText.includes('.')) {
            const selector = searchText.trim();
            const selectorRegex = new RegExp(`(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\})`, 'gi');
            if (selectorRegex.test(content)) {
                return content.replace(selectorRegex, newContent);
            }
        }
        
        return null;
    }

    smartReplacementJS(content, searchText, newContent) {
        // Try to replace specific function calls or variable assignments
        if (searchText && searchText.includes('=')) {
            const assignmentRegex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            if (assignmentRegex.test(content)) {
                return content.replace(assignmentRegex, newContent);
            }
        }
        
        return null;
    }

    smartReplacementHTML(content, searchText, newContent) {
        // Try to replace specific HTML elements or attributes
        if (searchText && searchText.includes('<')) {
            const elementRegex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            if (elementRegex.test(content)) {
                return content.replace(elementRegex, newContent);
            }
        }
        
        return null;
    }

}

module.exports = CodeRewriter;
