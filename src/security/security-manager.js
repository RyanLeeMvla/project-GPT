const bcrypt = require('bcrypt');
const keytar = require('keytar');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecurityManager {
    constructor() {
        this.serviceName = 'JARVIS-AI-Agent';
        this.encryptionKey = null;
        this.accessLevels = {
            READ: 1,
            WRITE: 2,
            ADMIN: 3,
            SYSTEM: 4
        };
        this.userPermissions = new Map();
        this.sessionTokens = new Map();
        this.auditLog = [];
        this.isInitialized = false;
    }

    async initialize() {
        console.log('🔐 Initializing Security Manager...');
        
        try {
            // Generate or retrieve encryption key
            await this.setupEncryption();
            
            // Initialize user permissions
            await this.loadUserPermissions();
            
            // Setup audit logging
            this.setupAuditLogging();
            
            this.isInitialized = true;
            console.log('✅ Security Manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Security Manager:', error);
            throw error;
        }
    }

    async setupEncryption() {
        try {
            // Try to retrieve existing encryption key
            let encryptionKey = await keytar.getPassword(this.serviceName, 'encryption-key');
            
            if (!encryptionKey) {
                // Generate new encryption key
                encryptionKey = crypto.randomBytes(32).toString('hex');
                await keytar.setPassword(this.serviceName, 'encryption-key', encryptionKey);
                console.log('🔑 Generated new encryption key');
            }
            
            this.encryptionKey = encryptionKey;
            
        } catch (error) {
            console.error('❌ Failed to setup encryption:', error);
            // Fallback to session-only encryption
            this.encryptionKey = crypto.randomBytes(32).toString('hex');
            console.log('⚠️ Using session-only encryption key');
        }
    }

    async loadUserPermissions() {
        try {
            const permissionsPath = path.join(__dirname, '../../config/permissions.json');
            
            if (fs.existsSync(permissionsPath)) {
                const permissionsData = JSON.parse(fs.readFileSync(permissionsPath, 'utf8'));
                
                for (const [user, permissions] of Object.entries(permissionsData)) {
                    this.userPermissions.set(user, permissions);
                }
            } else {
                // Create default permissions
                const defaultPermissions = {
                    'system': {
                        level: this.accessLevels.SYSTEM,
                        capabilities: ['*'],
                        restrictions: []
                    },
                    'admin': {
                        level: this.accessLevels.ADMIN,
                        capabilities: [
                            'project_management',
                            'fabrication_control',
                            'computer_operations',
                            'file_management',
                            'browser_control'
                        ],
                        restrictions: ['system_critical_operations']
                    },
                    'user': {
                        level: this.accessLevels.WRITE,
                        capabilities: [
                            'project_management',
                            'note_taking',
                            'file_management_limited'
                        ],
                        restrictions: [
                            'fabrication_control',
                            'system_operations',
                            'admin_functions'
                        ]
                    }
                };
                
                for (const [user, permissions] of Object.entries(defaultPermissions)) {
                    this.userPermissions.set(user, permissions);
                }
                
                // Save default permissions
                fs.writeFileSync(permissionsPath, JSON.stringify(defaultPermissions, null, 2));
            }
            
        } catch (error) {
            console.error('❌ Failed to load user permissions:', error);
            // Set minimal permissions
            this.userPermissions.set('default', {
                level: this.accessLevels.READ,
                capabilities: ['note_taking'],
                restrictions: ['*']
            });
        }
    }

    setupAuditLogging() {
        // Setup audit log file
        const auditDir = path.join(__dirname, '../../logs');
        if (!fs.existsSync(auditDir)) {
            fs.mkdirSync(auditDir, { recursive: true });
        }
        
        this.auditLogPath = path.join(auditDir, 'security-audit.log');
        
        // Log security manager initialization
        this.logSecurityEvent('SYSTEM', 'INIT', 'Security Manager initialized', null);
    }

    async performSecurityCheck(parameters) {
        try {
            const { operation, user = 'system', resource, data } = parameters;
            
            switch (operation) {
                case 'authorize_action':
                    return await this.authorizeAction(user, resource, data.action);
                
                case 'validate_session':
                    return await this.validateSession(data.token);
                
                case 'encrypt_data':
                    return await this.encryptData(data.content);
                
                case 'decrypt_data':
                    return await this.decryptData(data.encryptedContent);
                
                case 'audit_log':
                    return { success: true, data: this.getAuditLog(data.limit) };
                
                case 'check_permissions':
                    return await this.checkUserPermissions(user);
                
                case 'secure_storage':
                    return await this.secureStorage(data.key, data.value);
                
                case 'retrieve_secure':
                    return await this.retrieveSecure(data.key);
                
                default:
                    return {
                        success: false,
                        error: `Unknown security operation: ${operation}`
                    };
            }
            
        } catch (error) {
            this.logSecurityEvent('SYSTEM', 'ERROR', `Security check failed: ${error.message}`, parameters);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async authorizeAction(user, resource, action) {
        try {
            const userPermissions = this.userPermissions.get(user) || this.userPermissions.get('default');
            
            if (!userPermissions) {
                this.logSecurityEvent(user, 'DENY', `No permissions found for user`, { resource, action });
                return {
                    authorized: false,
                    reason: 'User not found in permissions system'
                };
            }
            
            // Check if action is explicitly restricted
            if (userPermissions.restrictions.includes(action) || userPermissions.restrictions.includes('*')) {
                this.logSecurityEvent(user, 'DENY', `Action restricted`, { resource, action });
                return {
                    authorized: false,
                    reason: `Action '${action}' is restricted for user '${user}'`
                };
            }
            
            // Check if user has capability for this action
            const hasCapability = userPermissions.capabilities.includes(action) || 
                                 userPermissions.capabilities.includes(resource) ||
                                 userPermissions.capabilities.includes('*');
            
            if (!hasCapability) {
                this.logSecurityEvent(user, 'DENY', `Insufficient capabilities`, { resource, action });
                return {
                    authorized: false,
                    reason: `User '${user}' lacks capability for '${action}'`
                };
            }
            
            // Additional checks for high-privilege operations
            if (this.isHighPrivilegeOperation(action) && userPermissions.level < this.accessLevels.ADMIN) {
                this.logSecurityEvent(user, 'DENY', `Insufficient privilege level`, { resource, action });
                return {
                    authorized: false,
                    reason: `Action '${action}' requires admin privileges`
                };
            }
            
            this.logSecurityEvent(user, 'ALLOW', `Action authorized`, { resource, action });
            return {
                authorized: true,
                userLevel: userPermissions.level
            };
            
        } catch (error) {
            this.logSecurityEvent(user, 'ERROR', `Authorization error: ${error.message}`, { resource, action });
            return {
                authorized: false,
                reason: `Authorization check failed: ${error.message}`
            };
        }
    }

    isHighPrivilegeOperation(action) {
        const highPrivilegeOperations = [
            'fabrication_control',
            'system_operations',
            'computer_operations',
            'browser_control',
            'file_management'
        ];
        
        return highPrivilegeOperations.includes(action);
    }

    async createSession(user, capabilities = []) {
        try {
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            
            this.sessionTokens.set(sessionToken, {
                user: user,
                capabilities: capabilities,
                createdAt: new Date(),
                expiresAt: expiryTime,
                active: true
            });
            
            this.logSecurityEvent(user, 'SESSION_CREATE', 'Session created', { token: sessionToken.substring(0, 8) + '...' });
            
            return {
                success: true,
                token: sessionToken,
                expiresAt: expiryTime
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async validateSession(token) {
        try {
            const session = this.sessionTokens.get(token);
            
            if (!session) {
                return {
                    valid: false,
                    reason: 'Session not found'
                };
            }
            
            if (!session.active) {
                return {
                    valid: false,
                    reason: 'Session is inactive'
                };
            }
            
            if (session.expiresAt < new Date()) {
                this.sessionTokens.delete(token);
                this.logSecurityEvent(session.user, 'SESSION_EXPIRE', 'Session expired', { token: token.substring(0, 8) + '...' });
                return {
                    valid: false,
                    reason: 'Session expired'
                };
            }
            
            return {
                valid: true,
                user: session.user,
                capabilities: session.capabilities
            };
            
        } catch (error) {
            return {
                valid: false,
                reason: error.message
            };
        }
    }

    async revokeSession(token) {
        try {
            const session = this.sessionTokens.get(token);
            if (session) {
                session.active = false;
                this.logSecurityEvent(session.user, 'SESSION_REVOKE', 'Session revoked', { token: token.substring(0, 8) + '...' });
            }
            
            return {
                success: true,
                message: 'Session revoked'
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async encryptData(data) {
        try {
            const algorithm = 'aes-256-gcm';
            const iv = crypto.randomBytes(16);
            const key = Buffer.from(this.encryptionKey, 'hex');
            
            const cipher = crypto.createCipher(algorithm, key);
            cipher.setAAD(Buffer.from('JARVIS-AI-Agent'));
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            const result = {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
            
            return {
                success: true,
                data: Buffer.from(JSON.stringify(result)).toString('base64')
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async decryptData(encryptedData) {
        try {
            const algorithm = 'aes-256-gcm';
            const key = Buffer.from(this.encryptionKey, 'hex');
            
            const dataObj = JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
            const iv = Buffer.from(dataObj.iv, 'hex');
            const authTag = Buffer.from(dataObj.authTag, 'hex');
            
            const decipher = crypto.createDecipher(algorithm, key);
            decipher.setAAD(Buffer.from('JARVIS-AI-Agent'));
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(dataObj.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return {
                success: true,
                data: JSON.parse(decrypted)
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async secureStorage(key, value) {
        try {
            const encryptedValue = await this.encryptData(value);
            if (!encryptedValue.success) {
                return encryptedValue;
            }
            
            await keytar.setPassword(this.serviceName, key, encryptedValue.data);
            
            this.logSecurityEvent('SYSTEM', 'SECURE_STORE', `Data stored securely`, { key });
            
            return {
                success: true,
                message: 'Data stored securely'
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async retrieveSecure(key) {
        try {
            const encryptedData = await keytar.getPassword(this.serviceName, key);
            
            if (!encryptedData) {
                return {
                    success: false,
                    error: 'Key not found in secure storage'
                };
            }
            
            const decryptedValue = await this.decryptData(encryptedData);
            
            this.logSecurityEvent('SYSTEM', 'SECURE_RETRIEVE', `Data retrieved from secure storage`, { key });
            
            return decryptedValue;
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async checkUserPermissions(user) {
        const permissions = this.userPermissions.get(user);
        
        if (!permissions) {
            return {
                success: false,
                error: 'User not found'
            };
        }
        
        return {
            success: true,
            data: {
                user: user,
                level: permissions.level,
                capabilities: permissions.capabilities,
                restrictions: permissions.restrictions
            }
        };
    }

    logSecurityEvent(user, action, description, metadata = null) {
        const event = {
            timestamp: new Date().toISOString(),
            user: user,
            action: action,
            description: description,
            metadata: metadata
        };
        
        this.auditLog.push(event);
        
        // Keep audit log size manageable
        if (this.auditLog.length > 10000) {
            this.auditLog = this.auditLog.slice(-5000);
        }
        
        // Write to file
        try {
            fs.appendFileSync(this.auditLogPath, JSON.stringify(event) + '\n');
        } catch (error) {
            console.error('❌ Failed to write audit log:', error);
        }
        
        // Log important events to console
        if (['DENY', 'ERROR', 'SESSION_CREATE', 'SESSION_REVOKE'].includes(action)) {
            console.log(`🔐 Security Event: ${user} - ${action} - ${description}`);
        }
    }

    getAuditLog(limit = 100) {
        return this.auditLog.slice(-limit).reverse();
    }

    async generateSecurityReport() {
        try {
            const now = new Date();
            const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            
            const recentEvents = this.auditLog.filter(event => 
                new Date(event.timestamp) > dayAgo
            );
            
            const deniedActions = recentEvents.filter(event => event.action === 'DENY');
            const errors = recentEvents.filter(event => event.action === 'ERROR');
            const sessions = recentEvents.filter(event => 
                event.action === 'SESSION_CREATE' || event.action === 'SESSION_REVOKE'
            );
            
            const activeSessions = Array.from(this.sessionTokens.values()).filter(session => 
                session.active && session.expiresAt > now
            );
            
            return {
                success: true,
                data: {
                    generatedAt: now.toISOString(),
                    period: '24 hours',
                    summary: {
                        totalEvents: recentEvents.length,
                        deniedActions: deniedActions.length,
                        errors: errors.length,
                        sessionActivity: sessions.length,
                        activeSessions: activeSessions.length
                    },
                    topDeniedActions: this.getTopDeniedActions(deniedActions),
                    recentErrors: errors.slice(-10),
                    activeUsers: activeSessions.map(session => ({
                        user: session.user,
                        createdAt: session.createdAt,
                        expiresAt: session.expiresAt
                    }))
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    getTopDeniedActions(deniedActions) {
        const actionCounts = {};
        
        deniedActions.forEach(event => {
            const action = event.metadata?.action || 'unknown';
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });
        
        return Object.entries(actionCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([action, count]) => ({ action, count }));
    }

    async cleanup() {
        // Revoke all active sessions
        for (const [token, session] of this.sessionTokens) {
            if (session.active) {
                await this.revokeSession(token);
            }
        }
        
        this.logSecurityEvent('SYSTEM', 'SHUTDOWN', 'Security Manager shutting down', null);
    }
}

module.exports = SecurityManager;
