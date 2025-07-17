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
                model: "gpt-4o", 
                maxTokens: 8000,
                temperature: 0.3
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
        this.activeFeatureRequest = null;
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
- edit_project: Edit/update existing projects { projectId OR projectName, name?, description?, type?, priority?, deadline?, status? }
- update_project: Update existing projects { projectId, name?, description?, type?, priority?, deadline?, status? }
- delete_project: Delete/remove projects { projectId OR projectName }
- get_projects: List all projects { status?, limit? }
- add_note: Add notes to projects { projectId, content, type? }
- add_timeline_event: Add timeline events { title, description?, type?, project_id?, date? }
- get_timeline: Get project timeline { projectId?, limit? }
- move_project_stage: Move project between stages { projectId OR projectName, targetStage/targetStatus }
  Valid stages: planning, in_progress, active, testing, review, completed, on_hold, cancelled
- add_inventory: Add inventory items { name, category, quantity?, location?, notes? }
- update_inventory: Update inventory { itemId, name?, category?, quantity?, location?, notes? }

When user asks to move/change/update project status or stage, use:
{
    "action": "project_management",
    "parameters": {
        "action": "move_project_stage",
        "data": {
            "projectName": "Project Name",
            "targetStage": "new_stage"
        }
    }
}

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
- "get_system_status" (for system health and status requests)

SYSTEM STATUS REQUESTS:
When users ask for system status, health, or local machine information, use:
{
    "action": "get_system_status",
    "parameters": {}
}

Examples of system status requests:
- "get my local system status"
- "show system health"
- "what's my CPU usage"
- "check system status"
- "how is my computer running"

ALWAYS use "get_system_status" action (NOT computer_operation) for system health queries.

Note: System status available on request - use "get my local system status" to check current health.
`;
        return context;
    }

    async getSystemStatus() {
        try {
            // Check if subsystems are initialized
            if (!this.projectManager || !this.fabricationManager || !this.computerController) {
                return '❌ System status unavailable - Core subsystems not initialized';
            }

            const activeProjects = await this.projectManager.getActiveProjects();
            const printerStatus = await this.fabricationManager.getPrinterStatus();
            const systemHealth = await this.computerController.getSystemHealth();
            
            // Create status indicators
            const healthEmoji = systemHealth.overall === 'Good' ? '🟢' : 
                               systemHealth.overall === 'Fair' ? '🟡' : '🔴';
            
            const memoryEmoji = systemHealth.memory < 60 ? '🟢' : 
                               systemHealth.memory < 80 ? '🟡' : '🔴';
            
            const cpuEmoji = systemHealth.cpu < 60 ? '🟢' : 
                            systemHealth.cpu < 80 ? '🟡' : '🔴';
            
            const diskEmoji = systemHealth.disk < 80 ? '🟢' : 
                             systemHealth.disk < 90 ? '🟡' : '🔴';
            
            const printerEmoji = printerStatus.status === 'connected' ? '🟢' : 
                                printerStatus.status === 'printing' ? '🟡' : '🔴';
            
            return `
╭─────────── 🖥️ System Status ───────────╮
│                                        │
│  📋 Projects: ${activeProjects.length} active                  │
│  🖨️  Printer: ${printerEmoji} ${printerStatus.status}                │
│                                        │
│  ${healthEmoji} Health: ${systemHealth.overall}                     │
│  ${memoryEmoji} Memory: ${systemHealth.memory}% used                │
│  ${cpuEmoji} CPU: ${systemHealth.cpu}% active                  │
│  ${diskEmoji} Disk: ${systemHealth.disk}% used (${systemHealth.diskFreeGB}GB free)   │
│                                        │
│  ⏱️  Uptime: ${systemHealth.uptime} hours              │
│                                        │
╰────────────────────────────────────────╯`;
        } catch (error) {
            return '❌ System status unavailable - ' + error.message;
        }
    }

    // Detailed system status with 2-second CPU averaging - use when accuracy is critical
    async getDetailedSystemStatus() {
        try {
            const activeProjects = await this.projectManager.getActiveProjects();
            const printerStatus = await this.fabricationManager.getPrinterStatus();
            const systemHealth = await this.computerController.getSystemHealth(); // Use detailed mode
            
            // Create status indicators
            const healthEmoji = systemHealth.overall === 'Good' ? '🟢' : 
                               systemHealth.overall === 'Fair' ? '🟡' : '🔴';
            
            const memoryEmoji = systemHealth.memory < 60 ? '🟢' : 
                               systemHealth.memory < 80 ? '🟡' : '🔴';
            
            const cpuEmoji = systemHealth.cpu < 60 ? '🟢' : 
                            systemHealth.cpu < 80 ? '🟡' : '🔴';
            
            const diskEmoji = systemHealth.disk < 80 ? '🟢' : 
                             systemHealth.disk < 90 ? '🟡' : '🔴';

            return `
╭─────────── 🖥️ Detailed System Status ───────────╮
│  📊 Projects: ${activeProjects.length} active 🖨️ Printer: ${printerStatus} │
│  ${healthEmoji} Health: ${systemHealth.overall} ${memoryEmoji} Memory: ${systemHealth.memory}% used │
│  ${cpuEmoji} CPU: ${systemHealth.cpu}% active (2s avg) ${diskEmoji} Disk: ${systemHealth.disk}% used (${systemHealth.diskFreeGB}GB free) │
│  ⏱️  Uptime: ${systemHealth.uptime} hours              │
│                                        │
╰────────────────────────────────────────╯`;
        } catch (error) {
            return '❌ Detailed system status unavailable - ' + error.message;
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
            
            // Check if we're in an active feature request workflow
            if (this.activeFeatureRequest) {
                return await this.handleFeatureWorkflow(userInput);
            }
            
            // Check for feature requests using AI detection
            console.log('🔍 Checking for feature patterns in:', userInput);
            const isFeatureRequest = await this.detectFeatureRequest(userInput);
            
            if (isFeatureRequest) {
                console.log('🚀 Feature request detected by AI:', userInput);
                console.log('🎯 Detection result:', isFeatureRequest);
                
                return await this.startConversationalWorkflow(userInput, isFeatureRequest);
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
                    // Transform action parameter to operation for computer controller
                    const computerParams = {
                        operation: parameters.action || parameters.operation,
                        target: parameters.target,
                        options: parameters.options || {}
                    };
                    return await this.computerController.executeOperation(computerParams);
                
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
                
                case 'feature_request':
                    // Enhanced feature implementation using the comprehensive global system
                    console.log('🚀 Processing comprehensive feature request:', parameters);
                    
                    if (this.codeRewriter) {
                        try {
                            // Build detailed conversation context for the feature
                            const conversation = [
                                { 
                                    role: 'user', 
                                    content: parameters.originalRequest || parameters.description
                                }
                            ];
                            
                            // Add clarification context if available
                            if (parameters.clarification) {
                                conversation.push({
                                    role: 'user',
                                    content: `Additional details: ${parameters.clarification}`
                                });
                            }
                            
                            // Add system understanding of the request
                            conversation.push({
                                role: 'system',
                                content: `COMPREHENSIVE FEATURE REQUEST:
- Description: ${parameters.description}
- Target: ${parameters.target}
- Type: ${parameters.type}
- Priority: ${parameters.priority}
- User wants: ${parameters.originalRequest}
- Clarification: ${parameters.clarification || 'None provided'}

Generate complete, working implementation with real code changes.`
                            });
                            
                            // Create project for tracking
                            await this.projectManager.executeAction({
                                action: 'create_project',
                                data: {
                                    name: `Feature: ${parameters.description.substring(0, 50)}`,
                                    description: `${parameters.type} for ${parameters.target}: ${parameters.description}`,
                                    type: 'software',
                                    priority: parameters.priority === 'high' ? 1 : parameters.priority === 'low' ? 3 : 2
                                }
                            });
                            
                            // Generate comprehensive feature code using enhanced system
                            const sourceContext = this.codeRewriter.getSourceContext();
                            console.log('🔍 Source context contains', Object.keys(sourceContext).length, 'files');
                            
                            const rewriteResult = await this.codeRewriter.generateFeatureCode(conversation, sourceContext, this);
                            console.log('🎯 Feature generation result:', rewriteResult);
                            
                            if (rewriteResult && rewriteResult.changes && rewriteResult.changes.length > 0) {
                                console.log(`📝 Applying ${rewriteResult.changes.length} code changes...`);
                                
                                const applicationResult = await this.codeRewriter.applyCodeChanges(rewriteResult.changes, true);
                                
                                const successMessage = `🎉 Feature implemented successfully!
✅ ${rewriteResult.description}
📁 Files modified: ${applicationResult.successCount}
${applicationResult.failureCount > 0 ? `⚠️ Failed changes: ${applicationResult.failureCount}` : ''}
📊 Analysis: ${rewriteResult.analysisResult?.requestType || 'general'} (${rewriteResult.analysisResult?.complexity || 'medium'})
📋 Project created to track progress.`;

                                return {
                                    success: true,
                                    message: successMessage,
                                    needsRestart: rewriteResult.needsRestart,
                                    data: { 
                                        target: parameters.target,
                                        originalRequest: parameters.originalRequest,
                                        description: rewriteResult.description,
                                        filesModified: applicationResult.successCount,
                                        failedChanges: applicationResult.failureCount,
                                        analysisResult: rewriteResult.analysisResult
                                    }
                                };
                            } else {
                                console.warn('⚠️ No changes generated for feature request');
                                return {
                                    success: false,
                                    error: 'Unable to generate feature implementation. The request may need more specific details or the target components may not be found.',
                                    suggestClarification: true,
                                    analysisResult: rewriteResult?.analysisResult
                                };
                            }
                        } catch (rewriteError) {
                            console.error('❌ Feature request processing failed:', rewriteError);
                            return {
                                success: false,
                                error: `Feature implementation encountered an error: ${rewriteError.message}`,
                                suggestRetry: true
                            };
                        }
                    } else {
                        return {
                            success: false,
                            error: 'Code rewriter is not available. Feature implementation requires the global code generation system.',
                            suggestRestart: true
                        };
                    }
                
                case 'get_system_status':
                case 'system_status':
                    // Handle system status requests
                    try {
                        const statusMessage = await this.getSystemStatus();
                        return {
                            success: true,
                            message: statusMessage,
                            data: statusMessage
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        };
                    }
                
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
                                await this.codeRewriter.applyCodeChanges(rewriteResult.changes, true);
                                
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

    async detectFeatureRequest(userInput) {
        /*
        AUTONOMOUS AI WORKFLOW SPECIFICATION:
        [User input] --> (Feature request detected) --> [First set of clarifying questions from agent] 
        --> User response --> [Confirmation request from AI] --> [User confirm] --> [Agent action]
        * User can quit at any time throughout the process
        * All responses are AI-generated, no hardcoded content
        */
        
        try {
            // Prevent recursive detection - skip if this looks like an internal system prompt
            if (userInput.includes('TASK:') || 
                userInput.includes('SYSTEM:') || 
                userInput.includes('CONVERSATION:') ||
                userInput.includes('JSON') ||
                userInput.length > 500) {
                console.log('🚫 Skipping feature detection for internal system prompt');
                return false;
            }

            // Use a lightweight model for quick feature detection
            const detectionPrompt = `
Analyze this user input to determine if it's requesting to CREATE or MODIFY the application's code/interface.

User input: "${userInput}"

IMPORTANT: Only classify as feature request if the user wants to CHANGE THE CODE or CREATE NEW FUNCTIONALITY.

NOT feature requests (using existing features):
- Moving/updating/managing existing projects or data
- Using existing UI elements or commands  
- Standard CRUD operations (create, read, update, delete existing data)
- Navigation or viewing operations
- Project management commands (move stages, update status, etc.)

Feature requests (changing the codebase):
- "add a search feature" (new functionality)
- "make the UI better" (modify interface)
- "change button colors" (modify styling)
- "redesign the dashboard" (modify layout)

Respond with JSON only:
{
    "isFeatureRequest": true/false,
    "confidence": 0.0-1.0,
    "reason": "Brief explanation of why this is/isn't a feature request"
}

Be VERY conservative - when in doubt, choose false.`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: detectionPrompt }],
                temperature: 0.1,
                max_tokens: 200
            });

            const response = JSON.parse(completion.choices[0].message.content);
            
            // Return false if not a feature request or confidence too low
            if (!response.isFeatureRequest || response.confidence < 0.8) {
                console.log(`🚫 Not a feature request: ${response.reason || 'Low confidence'}`);
                return false;
            }

            console.log(`🚀 Feature request detected: ${response.reason}`);
            return {
                isFeatureRequest: true,
                confidence: response.confidence,
                target: 'general',
                type: 'improvement',
                priority: 'medium',
                description: `User requested: ${userInput}`
            };

        } catch (error) {
            console.error('❌ Error in AI feature detection:', error);
            
            // Intelligent fallback using AI for intent classification
            try {
                const intentPrompt = `
Classify this user input into one of these categories:

User input: "${userInput}"

Categories:
1. PROJECT_MANAGEMENT - Moving, updating, or managing existing projects/tasks
2. FEATURE_REQUEST - Requesting new features, improvements, or code changes  
3. GENERAL_QUERY - Questions, information requests, or other commands

Consider the INTENT and CONTEXT, not just keywords.

Examples:
- "Move UI Improvement projects to planning stage" = PROJECT_MANAGEMENT (managing existing projects)
- "Make the UI better" = FEATURE_REQUEST (requesting improvements)
- "Show me my projects" = GENERAL_QUERY (information request)

Respond with only the category name.`;

                const intentCompletion = await this.openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: intentPrompt }],
                    temperature: 0.1,
                    max_tokens: 50
                });

                const intent = intentCompletion.choices[0].message.content.trim();
                
                if (intent === 'PROJECT_MANAGEMENT' || intent === 'GENERAL_QUERY') {
                    console.log(`🎯 AI classified as ${intent}, skipping feature detection`);
                    return false;
                }
                
                if (intent === 'FEATURE_REQUEST') {
                    console.log('🚀 AI classified as FEATURE_REQUEST');
                    return {
                        isFeatureRequest: true,
                        confidence: 0.6, // Lower confidence for fallback detection
                        target: 'general',
                        type: 'improvement',
                        priority: 'medium',
                        description: `User requested: ${userInput}`
                    };
                }

            } catch (intentError) {
                console.error('❌ AI intent classification failed:', intentError);
            }
            
            // Last resort: conservative approach - don't trigger feature workflow
            console.log('🚫 Fallback: treating as general command to avoid false positives');
            return false;
        }
    }

    async startConversationalWorkflow(userInput, detectionResult) {
        try {
            // Fully AI-driven clarifying questions generation
            const clarificationPrompt = `
SYSTEM: You are an autonomous AI assistant helping to clarify a feature request.

USER REQUEST: "${userInput}"
DETECTED: ${detectionResult.type} for ${detectionResult.target} (confidence: ${detectionResult.confidence})

TASK: Generate natural clarifying questions to better understand the user's exact needs.

Generate a response that:
1. Briefly acknowledges their request 
2. Asks 2-3 specific, targeted questions to understand their exact requirements
3. Be conversational and helpful (not robotic)
4. Mention they can say "quit" to cancel

Focus on understanding:
- Specific implementation details they want
- Visual/functional preferences 
- Scope and requirements
- Any constraints or special needs

RESPONSE FORMAT: Plain text only, no JSON. Be natural and engaging.`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: clarificationPrompt }],
                temperature: 0.7,
                max_tokens: 250
            });

            // Store the workflow context
            this.activeFeatureRequest = {
                originalInput: userInput,
                detection: detectionResult,
                stage: 'clarification'
            };

            return {
                message: completion.choices[0].message.content,
                action: null,
                parameters: null,
                shouldSpeak: true,
                needsClarification: true,
                clarifyingQuestions: ["Please provide more details"],
                confidence: detectionResult.confidence
            };

        } catch (error) {
            console.error('❌ Error in AI-driven clarification workflow:', error);
            
            // Fully AI-driven fallback - use simple autonomous prompt
            try {
                const fallbackPrompt = `User wants: "${userInput}"
This is a ${detectionResult.type} for ${detectionResult.target}.

Generate a natural response asking for clarification details. Be conversational and mention they can say "quit".`;

                const fallbackCompletion = await this.openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: fallbackPrompt }],
                    temperature: 0.7,
                    max_tokens: 150
                });

                this.activeFeatureRequest = {
                    originalInput: userInput,
                    detection: detectionResult,
                    stage: 'clarification'
                };

                return {
                    message: fallbackCompletion.choices[0].message.content,
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: true,
                    clarifyingQuestions: ["Please provide more details"],
                    confidence: detectionResult.confidence
                };
            } catch (fallbackError) {
                console.error('❌ AI fallback also failed:', fallbackError);
                
                // Last resort autonomous response
                this.activeFeatureRequest = {
                    originalInput: userInput,
                    detection: detectionResult,
                    stage: 'clarification'
                };

                return {
                    message: "I'd love to help with that! Can you give me a bit more detail about what you're looking for?",
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: true,
                    clarifyingQuestions: ["Can you provide more details?"],
                    confidence: detectionResult.confidence
                };
            }
        }
    }

    async handleFeatureWorkflow(userInput) {
        const lowerInput = userInput.toLowerCase();
        
        // Allow user to quit at any time
        if (lowerInput.includes('quit') || lowerInput.includes('cancel') || lowerInput.includes('stop')) {
            this.activeFeatureRequest = null;
            
            // AI-generated quit response
            try {
                const quitPrompt = `User wants to quit/cancel their feature request. Generate a brief, friendly response acknowledging this and offering to help with something else.`;
                
                const completion = await this.openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: quitPrompt }],
                    temperature: 0.7,
                    max_tokens: 100
                });
                
                return {
                    message: completion.choices[0].message.content,
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: false,
                    clarifyingQuestions: null,
                    confidence: 1.0
                };
            } catch (error) {
                console.error('❌ Error generating quit response:', error);
                return {
                    message: "No problem! What else can I help you with?",
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: false,
                    clarifyingQuestions: null,
                    confidence: 1.0
                };
            }
        }

        if (this.activeFeatureRequest.stage === 'clarification') {
            // Move to confirmation stage
            return await this.generateConfirmation(userInput);
        } else if (this.activeFeatureRequest.stage === 'confirmation') {
            // Handle user's confirmation or denial
            return await this.handleConfirmation(userInput);
        }

        return null;
    }

    async generateConfirmation(userInput) {
        try {
            // Fully AI-driven confirmation generation
            const confirmationPrompt = `
SYSTEM: You are an autonomous AI assistant confirming a feature implementation request.

ORIGINAL REQUEST: "${this.activeFeatureRequest.originalInput}"
DETECTION: ${this.activeFeatureRequest.detection.type} for ${this.activeFeatureRequest.detection.target}
USER CLARIFICATION: "${userInput}"

TASK: Generate a natural confirmation message that:
1. Summarizes exactly what you understand the user wants implemented
2. Shows you understand both the original request AND the clarification
3. Asks for clear confirmation to proceed with implementation
4. Reminds them they can say "quit" to cancel anytime

Be conversational, specific, and show clear understanding of their request.

RESPONSE FORMAT: Plain text only, no JSON. Be natural and conversational.`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: confirmationPrompt }],
                temperature: 0.5,
                max_tokens: 200
            });

            // Update stage and store clarification
            this.activeFeatureRequest.stage = 'confirmation';
            this.activeFeatureRequest.clarification = userInput;

            return {
                message: completion.choices[0].message.content,
                action: null,
                parameters: null,
                shouldSpeak: true,
                needsClarification: true,
                clarifyingQuestions: ["Should I proceed with this implementation?"],
                confidence: 0.9
            };

        } catch (error) {
            console.error('❌ Error generating AI confirmation:', error);
            
            // Fully AI-driven fallback confirmation
            try {
                const fallbackConfirmationPrompt = `User originally wanted: "${this.activeFeatureRequest.originalInput}"
They clarified: "${userInput}"

Generate a confirmation message asking if they want to proceed. Be natural and conversational.`;

                const fallbackCompletion = await this.openai.chat.completions.create({
                    model: "gpt-3.5-turbo", 
                    messages: [{ role: "user", content: fallbackConfirmationPrompt }],
                    temperature: 0.5,
                    max_tokens: 150
                });

                this.activeFeatureRequest.stage = 'confirmation';
                this.activeFeatureRequest.clarification = userInput;
                
                return {
                    message: fallbackCompletion.choices[0].message.content,
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: true,
                    clarifyingQuestions: ["Should I proceed with this implementation?"],
                    confidence: 0.8
                };
            } catch (fallbackError) {
                console.error('❌ AI confirmation fallback failed:', fallbackError);
                
                // Last resort - very simple autonomous response
                this.activeFeatureRequest.stage = 'confirmation';
                this.activeFeatureRequest.clarification = userInput;
                
                return {
                    message: "Got it! Should I go ahead and implement this for you?",
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: true,
                    clarifyingQuestions: ["Should I proceed?"],
                    confidence: 0.7
                };
            }
        }
    }

    async handleConfirmation(userInput) {
        const lowerInput = userInput.toLowerCase();
        
        if (lowerInput.includes('yes') || lowerInput.includes('confirm') || lowerInput.includes('proceed') || lowerInput.includes('go ahead')) {
            // Execute the feature request
            const result = await this.executeFeatureFromWorkflow();
            this.activeFeatureRequest = null;
            return result;
        } else if (lowerInput.includes('no') || lowerInput.includes('cancel')) {
            this.activeFeatureRequest = null;
            
            // AI-generated cancellation response
            try {
                const cancellationPrompt = `User decided not to proceed with their feature request. Generate a brief, friendly response acknowledging the cancellation and offering to help with something else.`;
                
                const completion = await this.openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: cancellationPrompt }],
                    temperature: 0.7,
                    max_tokens: 100
                });
                
                return {
                    message: completion.choices[0].message.content,
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: false,
                    clarifyingQuestions: null,
                    confidence: 1.0
                };
            } catch (error) {
                console.error('❌ Error generating cancellation response:', error);
                return {
                    message: "No problem! Feel free to ask me anything else.",
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: false,
                    clarifyingQuestions: null,
                    confidence: 1.0
                };
            }
        } else {
            // AI-generated clarification request
            try {
                const clarificationPrompt = `User's response to confirmation: "${userInput}"
I need them to clearly say yes or no to proceed. Generate a brief response asking for a clear answer.`;
                
                const completion = await this.openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: clarificationPrompt }],
                    temperature: 0.5,
                    max_tokens: 100
                });
                
                return {
                    message: completion.choices[0].message.content,
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: true,
                    clarifyingQuestions: ["Please say 'yes' or 'no'"],
                    confidence: 0.7
                };
            } catch (error) {
                console.error('❌ Error generating clarification request:', error);
                return {
                    message: "Could you please say 'yes' to proceed or 'quit' to cancel?",
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: true,
                    clarifyingQuestions: ["Please say 'yes' or 'quit'"],
                    confidence: 0.7
                };
            }
        }
    }

    async executeFeatureFromWorkflow() {
        try {
            const request = this.activeFeatureRequest;
            
            // Execute the feature request
            const actionResult = await this.executeAction('feature_request', {
                originalRequest: request.originalInput,
                description: request.detection.description,
                target: request.detection.target,
                priority: request.detection.priority,
                type: request.detection.type,
                clarification: request.clarification
            });

            if (actionResult.success) {
                return {
                    message: `🎉 Feature implemented successfully!\n\n${actionResult.message}`,
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: false,
                    clarifyingQuestions: null,
                    confidence: 1.0
                };
            } else {
                return {
                    message: `❌ Implementation failed: ${actionResult.error}\n\nWould you like me to try a different approach?`,
                    action: null,
                    parameters: null,
                    shouldSpeak: true,
                    needsClarification: true,
                    clarifyingQuestions: ["Should I try again?"],
                    confidence: 0.5
                };
            }

        } catch (error) {
            console.error('❌ Error executing feature:', error);
            return {
                message: `❌ Sorry, I encountered an error: ${error.message}`,
                action: null,
                parameters: null,
                shouldSpeak: true,
                needsClarification: false,
                clarifyingQuestions: null,
                confidence: 0.0
            };
        }
    }

    // Debug message functionality for chat integration
    sendDebugToChat(message) {
        console.log('📤 DEBUG to chat:', message);
        
        // If there's an active UI connection, send the debug message
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.executeJavaScript(`
                if (window.app && window.app.addChatMessage) {
                    window.app.addChatMessage({
                        role: 'system',
                        content: '${message.replace(/'/g, "\\'")}',
                        timestamp: new Date().toLocaleTimeString(),
                        isDebug: true
                    });
                }
            `).catch(error => {
                console.warn('⚠️ Failed to send debug message to chat:', error.message);
            });
        }
    }

    setMainWindow(mainWindow) {
        this.mainWindow = mainWindow;
        console.log('📱 Main window reference set for debug messaging');
    }
}

module.exports = GptCore;
