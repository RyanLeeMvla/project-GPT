const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class CodeRewriter {
    constructor() {
        this.projectRoot = path.join(__dirname, '../..');
        this.sourceFiles = new Map(); // Cache of source file contents
        this.backups = new Map(); // Backup of original files
        this.restartPending = false;
    }

    async initialize() {
        console.log('🔧 Initializing Code Rewriter...');
        await this.scanSourceFiles();
        console.log('✅ Code Rewriter initialized');
    }

    async scanSourceFiles() {
        const sourceDirectories = [
            'src/ui',
            'src/core', 
            'src/projects',
            'src/security',
            'src/computer',
            'src/fabrication',
            'src/voice'
        ];

        for (const dir of sourceDirectories) {
            await this.scanDirectory(path.join(this.projectRoot, dir));
        }
    }

    async scanDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    await this.scanDirectory(fullPath);
                } else if (entry.name.endsWith('.js')) {
                    const content = await fs.readFile(fullPath, 'utf8');
                    const relativePath = path.relative(this.projectRoot, fullPath);
                    this.sourceFiles.set(relativePath, content);
                }
            }
        } catch (error) {
            console.warn(`Could not scan directory ${dirPath}:`, error.message);
        }
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
        console.log(`💾 Creating code backup: ${timestamp}`);
        
        for (const [filePath, content] of this.sourceFiles) {
            this.backups.set(`${filePath}_${timestamp}`, content);
        }
        
        return timestamp;
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

    async applyCodeChanges(changes) {
        console.log('🔧 Applying code changes...');
        
        for (const change of changes) {
            const { filePath, operation, content, insertAfter, method } = change;
            
            switch (operation) {
                case 'addMethod':
                    await this.addMethod(filePath, method, content);
                    break;
                case 'updateMethod':
                    await this.updateMethod(filePath, method, content);
                    break;
                case 'insertAfter':
                    await this.insertAfter(filePath, insertAfter, content);
                    break;
                case 'replaceSection':
                    await this.replaceSection(filePath, change.search, content);
                    break;
                case 'createFile':
                    await this.createFile(filePath, content);
                    break;
            }
        }
        
        // Refresh source cache after changes
        await this.scanSourceFiles();
    }

    async addMethod(filePath, methodName, methodCode) {
        const fullPath = path.join(this.projectRoot, filePath);
        let content = this.sourceFiles.get(filePath) || '';
        
        // Find the class and insert the method before the closing brace
        const classMatch = content.match(/class\s+\w+\s*\{([\s\S]*)\}$/);
        if (classMatch) {
            const insertPoint = content.lastIndexOf('}');
            const newContent = content.slice(0, insertPoint) + 
                             `\n    ${methodCode}\n` + 
                             content.slice(insertPoint);
            
            await this.writeFile(filePath, newContent);
        }
    }

    async updateMethod(filePath, methodName, newMethodCode) {
        let content = this.sourceFiles.get(filePath) || '';
        
        // Find and replace the existing method
        const methodRegex = new RegExp(
            `(\\s*(?:async\\s+)?${methodName}\\s*\\([^)]*\\)\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`,
            'g'
        );
        
        const updatedContent = content.replace(methodRegex, `$1\n${newMethodCode}\n    }`);
        await this.writeFile(filePath, updatedContent);
    }

    async insertAfter(filePath, searchString, insertContent) {
        let content = this.sourceFiles.get(filePath) || '';
        const insertIndex = content.indexOf(searchString);
        
        if (insertIndex !== -1) {
            const endIndex = insertIndex + searchString.length;
            const newContent = content.slice(0, endIndex) + 
                             `\n${insertContent}` + 
                             content.slice(endIndex);
            
            await this.writeFile(filePath, newContent);
        }
    }

    async replaceSection(filePath, searchString, replacement) {
        let content = this.sourceFiles.get(filePath) || '';
        const updatedContent = content.replace(searchString, replacement);
        await this.writeFile(filePath, updatedContent);
    }

    async createFile(filePath, content) {
        const fullPath = path.join(this.projectRoot, filePath);
        const dir = path.dirname(fullPath);
        
        // Ensure directory exists
        await fs.mkdir(dir, { recursive: true });
        await this.writeFile(filePath, content);
    }

    async writeFile(filePath, content) {
        const fullPath = path.join(this.projectRoot, filePath);
        await fs.writeFile(fullPath, content, 'utf8');
        this.sourceFiles.set(filePath, content);
        console.log(`✅ Updated file: ${filePath}`);
    }

    async generateFeatureCode(conversation, sourceContext, gptCore) {
        console.log('🤖 Generating feature code...');
        
        // Build the code generation prompt
        const prompt = this.buildCodeGenerationPrompt(conversation, sourceContext);
        
        try {
            // Use the GPT core to generate code changes
            const response = await gptCore.processCommand(prompt, 'codeGeneration');
            
            if (response && response.message) {
                // Try to parse the response as JSON
                const codeMatch = response.message.match(/\{[\s\S]*\}/);
                if (codeMatch) {
                    const codeResponse = JSON.parse(codeMatch[0]);
                    return {
                        changes: codeResponse.changes || [],
                        description: codeResponse.description || 'Generated feature implementation',
                        needsRestart: codeResponse.needsRestart !== false
                    };
                }
            }
            
            // Fallback: Create basic note-taking functionality if it's a note request
            if (conversation.some(msg => msg.content.includes('note') || msg.content.includes('add_note'))) {
                return this.generateNoteFeatureFallback();
            }
            
            return {
                changes: [],
                description: 'Failed to generate feature code',
                needsRestart: false
            };
            
        } catch (error) {
            console.error('Error generating feature code:', error);
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

    buildCodeGenerationPrompt(conversation, sourceContext) {
        return `
CONTEXT: You are a code rewriting agent that can modify application source code.

CONVERSATION HISTORY:
${conversation.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

CURRENT SOURCE CODE STRUCTURE:
${Object.entries(sourceContext).map(([file, info]) => 
    `${file}: ${info.lines} lines, classes: [${info.classes.join(', ')}], functions: [${info.functions.join(', ')}]`
).join('\n')}

KEY FILES FOR MODIFICATION:
${Object.entries(sourceContext).map(([file, info]) => 
    `\n=== ${file} ===\n${info.content.substring(0, 2000)}${info.content.length > 2000 ? '...' : ''}`
).join('\n')}

TASK: Generate a JSON response with specific code changes to implement the requested feature.

RESPONSE FORMAT:
{
    "changes": [
        {
            "filePath": "src/ui/app.js",
            "operation": "addMethod|updateMethod|insertAfter|replaceSection|createFile",
            "method": "methodName",
            "content": "code to add/replace",
            "search": "text to find for replacement",
            "insertAfter": "text to insert after"
        }
    ],
    "description": "what this implementation does",
    "needsRestart": true/false
}

Generate REAL, working code that integrates with the existing codebase.
`;
    }
}

module.exports = CodeRewriter;
