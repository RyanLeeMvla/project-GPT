const OpenAI = require('openai');
const ComputerController = require('../computer/computer-controller');
const ProjectManager = require('../projects/project-manager');
const FabricationManager = require('../fabrication/fabrication-manager');
const SecurityManager = require('../security/security-manager');

class GptCore {
    constructor(apiKey, modelConfig = null) {
        this.openai = new OpenAI({
            apiKey: apiKey
        });
        
        // Default model configuration
        this.modelConfig = modelConfig || {
            chat: {
                model: "gpt-3.5-turbo",
                maxTokens: 1000,
                temperature: 0.7
            },
            codeGeneration: {
                model: "gpt-4o",
                maxTokens: 4000,
                temperature: 0.2
            },
            complexReasoning: {
                model: "o1-preview", 
                maxTokens: 8000,
                temperature: 1.0
            },
            fallback: "gpt-4-turbo"
        };
        
        this.computerController = null;
        this.projectManager = null;
        this.fabricationManager = null;
        this.securityManager = null;
        this.codeRewriter = null;
        
        this.conversationHistory = [];
        this.systemContext = '';
        this.isInitialized = false;
    }

    async initialize() {
        console.log('🧠 Initializing GPT Core...');
        
        try {
            // Initialize subsystems
            this.computerController = new ComputerController();
            this.projectManager = new ProjectManager();
            this.fabricationManager = new FabricationManager();
            this.securityManager = new SecurityManager();

            await this.computerController.initialize();
            await this.projectManager.initialize();
            await this.fabricationManager.initialize();
            await this.securityManager.initialize();

            // Set up system context
            this.systemContext = await this.buildSystemContext();
            
            this.isInitialized = true;
            console.log('✅ GPT Core initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize GPT Core:', error);
            throw error;
        }
    }

    async buildSystemContext() {
        const context = `
You are GPT, an advanced AI assistant inspired by Tony Stark's AI from Iron Man. You have the following capabilities and responsibilities:

CORE PRINCIPLES:
1. Always ask clarifying questions when commands are ambiguous
2. Prioritize safety and security in all operations
3. Maintain professional but friendly communication
4. Keep detailed logs of all activities
5. Provide proactive suggestions and optimizations

CAPABILITIES:
- Computer operations (file management, application control)
- Project management and timeline tracking
- 3D modeling assistance and OnShape integration
- 3D printer control (Bambu Lab)
- Note-taking and context awareness
- Error detection and optimization suggestions
- Simulation API integration
- Real-time data analysis and visualization
- Secure access management
- Version control automation

PROJECT MANAGEMENT ACTIONS:
When users ask to create projects, use:
{
    "action": "project_management",
    "parameters": {
        "action": "create_project",
        "data": {
            "name": "Project Name",
            "description": "Project description",
            "type": "general|software|hardware|research",
            "priority": 1-5
        }
    }
}

Available project_management actions:
- create_project: Create new projects { name, description?, type?, priority?, deadline? }
- update_project: Update existing projects { projectId, name?, description?, type?, priority?, deadline?, status? }
- get_projects: List all projects { status?, limit? }
- add_note: Add notes to projects { projectId, content, type? }
- add_timeline_event: Add timeline events { title, description?, type?, project_id?, date? }
- get_timeline: Get project timeline { projectId?, limit? }
- move_project_stage: Move project between stages { projectId OR projectName, targetStage/targetStatus }
  Valid stages: planning, in_progress, active, testing, review, completed, on_hold, cancelled
- add_inventory: Add inventory items { name, category, quantity?, location?, notes? }
- update_inventory: Update inventory { itemId, name?, category?, quantity?, location?, notes? }

When user asks to move/change/update project status or stage, use move_project_stage action.
You can identify projects by ID or name. Be flexible with stage names (e.g., "done" = "completed").

TRIGGER PHRASES:
- "GPT" - General commands and requests
- "GPT, log that instance" - Note-taking with context awareness

RESPONSE FORMAT:
Always respond with a JSON object containing:
{
    "message": "Your response to the user",
    "action": "action_type" | null,
    "parameters": {...} | null,
    "shouldSpeak": true/false,
    "needsClarification": true/false,
    "clarifyingQuestions": ["question1", "question2"] | null,
    "confidence": 0.0-1.0
}

ACTION TYPES:
- "computer_operation"
- "project_management"
- "fabrication_control"
- "note_taking"
- "browser_control"
- "file_management"
- "simulation_request"
- "optimization_analysis"
- "security_check"

Current system status: ${await this.getSystemStatus()}
`;
        return context;
    }

    async getSystemStatus() {
        try {
            const activeProjects = await this.projectManager.getActiveProjects();
            const printerStatus = await this.fabricationManager.getPrinterStatus();
            const systemHealth = await this.computerController.getSystemHealth();
            
            return `
Active Projects: ${activeProjects.length}
3D Printer Status: ${printerStatus.status}
System Health: ${systemHealth.overall}
Available Memory: ${systemHealth.memory}%
CPU Usage: ${systemHealth.cpu}%
`;
        } catch (error) {
            return 'System status unavailable';
        }
    }

    async processCommand(userInput, modelType = 'chat') {
        console.log(`🎯 Processing command: "${userInput}" with model type: ${modelType}`);
        
        try {
            // Check for specific trigger phrases
            const lowerInput = userInput.toLowerCase();
            
            if (lowerInput.includes('gpt, log that instance')) {
                return await this.handleNoteLogging(userInput);
            }
            
            // Add user input to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: userInput,
                timestamp: new Date().toISOString()
            });
            
            // Keep conversation history manageable
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }
            
            // Select model configuration based on type
            const config = this.getModelConfig(modelType);
            
            // Create the prompt for OpenAI
            const messages = [
                {
                    role: 'system',
                    content: this.systemContext
                },
                ...this.conversationHistory.slice(-10) // Last 10 messages for context
            ];
            
            // Get response from OpenAI with selected model
            const completion = await this.openai.chat.completions.create({
                model: config.model,
                messages: messages,
                temperature: config.temperature,
                max_tokens: config.maxTokens
            });
            
            const aiResponse = completion.choices[0].message.content;
            
            // For code generation, return raw response without JSON parsing
            if (modelType === 'codeGeneration') {
                console.log(`🤖 GPT response: ${aiResponse}`);
                return aiResponse;
            }
            
            // Parse the JSON response for other model types
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(aiResponse);
            } catch (parseError) {
                // Fallback if AI doesn't return valid JSON
                parsedResponse = {
                    message: aiResponse,
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: false,
                    clarifyingQuestions: null,
                    confidence: 0.8
                };
            }
            
            // Add AI response to conversation history
            this.conversationHistory.push({
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date().toISOString()
            });
            
            // Execute any requested actions
            if (parsedResponse.action && parsedResponse.parameters) {
                console.log('🔧 Executing action:', parsedResponse.action, 'with parameters:', parsedResponse.parameters);
                const actionResult = await this.executeAction(
                    parsedResponse.action, 
                    parsedResponse.parameters
                );
                
                console.log('🔧 Action result:', actionResult);
                
                // Update response with action result
                if (actionResult.success) {
                    parsedResponse.message += `\n\n✅ Action completed: ${actionResult.message || 'Successfully completed'}`;
                } else {
                    parsedResponse.message += `\n\n❌ Action failed: ${actionResult.error}`;
                }
            }
            
            console.log(`🤖 GPT response: ${parsedResponse.message}`);
            return parsedResponse;
            
        } catch (error) {
            console.error('❌ Error processing command:', error);
            return {
                message: "I apologize, but I encountered an error processing your request. Could you please try rephrasing or provide more details?",
                action: null,
                parameters: null,
                shouldSpeak: true,
                needsClarification: true,
                clarifyingQuestions: ["Could you rephrase your request?", "What specific action would you like me to take?"],
                confidence: 0.0
            };
        }
    }

    async handleNoteLogging(userInput) {
        try {
            // Extract the note content
            const noteMatch = userInput.match(/gpt,\s*log\s+that\s+instance\s+(.+)/i);
            const noteContent = noteMatch ? noteMatch[1] : userInput;
            
            // Get current context
            const context = await this.computerController.getCurrentContext();
            
            // Create note entry
            const note = {
                content: noteContent,
                context: context,
                timestamp: new Date().toISOString(),
                tags: this.extractTags(noteContent)
            };
            
            // Save note to project database
            const result = await this.projectManager.addNote(note);
            
            return {
                message: `📝 Note logged successfully: "${noteContent}". Context captured including active applications and current project.`,
                action: "note_taking",
                parameters: { noteId: result.id },
                shouldSpeak: true,
                needsClarification: false,
                clarifyingQuestions: null,
                confidence: 1.0
            };
            
        } catch (error) {
            console.error('❌ Error logging note:', error);
            return {
                message: "I had trouble logging that note. Could you please try again?",
                action: null,
                parameters: null,
                shouldSpeak: true,
                needsClarification: true,
                clarifyingQuestions: ["What would you like me to note?"],
                confidence: 0.0
            };
        }
    }

    extractTags(content) {
        // Simple tag extraction based on keywords
        const keywords = ['error', 'bug', 'optimization', 'idea', 'todo', 'meeting', 'design', '3d', 'print'];
        const contentLower = content.toLowerCase();
        return keywords.filter(keyword => contentLower.includes(keyword));
    }

    getModelConfig(modelType) {
        const config = this.modelConfig[modelType];
        if (!config) {
            console.warn(`⚠️ Unknown model type: ${modelType}, using fallback`);
            return {
                model: this.modelConfig.fallback,
                maxTokens: 2000,
                temperature: 0.7
            };
        }
        return config;
    }

    // Method to update model configuration (useful for settings changes)
    updateModelConfig(newConfig) {
        this.modelConfig = { ...this.modelConfig, ...newConfig };
        console.log('📝 Model configuration updated');
    }

    async executeAction(actionType, parameters) {
        console.log('🔧 executeAction called with:', { actionType, parameters });
        try {
            switch (actionType) {
                case 'computer_operation':
                    return await this.computerController.executeOperation(parameters);
                
                case 'project_management':
                    return await this.projectManager.executeAction(parameters);
                
                case 'fabrication_control':
                    return await this.fabricationManager.executeCommand(parameters);
                
                case 'browser_control':
                    return await this.computerController.controlBrowser(parameters);
                
                case 'file_management':
                    return await this.computerController.manageFiles(parameters);
                
                case 'note_taking':
                    // Handle different note operations
                    try {
                        let result;
                        if (parameters.action === 'add_note') {
                            result = await this.projectManager.addNote(parameters.data);
                        } else if (parameters.action === 'edit_note') {
                            result = await this.projectManager.updateNote(parameters.data);
                        } else if (parameters.action === 'delete_note') {
                            result = await this.projectManager.deleteNote(parameters.data);
                        } else {
                            // Default to add_note if no specific action
                            result = await this.projectManager.addNote(parameters);
                        }
                        
                        // Return standardized success format
                        return {
                            success: true,
                            message: `Note operation completed successfully`,
                            data: result
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        };
                    }
                
                case 'security_check':
                    return await this.securityManager.performSecurityCheck(parameters);
                
                default:
                    // Trigger adaptive code rewriting for unknown actions
                    console.log(`🔧 Unknown action "${actionType}" - triggering adaptive rewrite`);
                    
                    if (this.codeRewriter) {
                        try {
                            // Build conversation context for rewriting
                            const conversation = [
                                { role: 'user', content: `Execute action: ${actionType}` },
                                { role: 'system', content: `Action "${actionType}" is not implemented. Need to generate this functionality.` }
                            ];
                            
                            const sourceContext = this.codeRewriter.getSourceContext();
                            const rewriteResult = await this.codeRewriter.generateFeatureCode(conversation, sourceContext, this);
                            
                            if (rewriteResult && rewriteResult.changes) {
                                await this.codeRewriter.applyCodeChanges(rewriteResult.changes);
                                
                                return {
                                    success: true,
                                    message: `Successfully generated and implemented ${actionType} functionality!`,
                                    needsRestart: rewriteResult.needsRestart || true
                                };
                            }
                        } catch (rewriteError) {
                            console.error('Adaptive rewrite failed:', rewriteError);
                        }
                    }
                    
                    return {
                        success: false,
                        error: `Unknown action type: ${actionType}`,
                        suggestRewrite: true
                    };
            }
        } catch (error) {
            console.error(`❌ Error executing action ${actionType}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getConversationHistory() {
        return this.conversationHistory;
    }

    async clearConversationHistory() {
        this.conversationHistory = [];
        console.log('🗑️ Conversation history cleared');
    }

    async updateSystemContext() {
        this.systemContext = await this.buildSystemContext();
        console.log('🔄 System context updated');
    }

    setCodeRewriter(codeRewriter) {
        this.codeRewriter = codeRewriter;
    }
}

module.exports = GptCore;
