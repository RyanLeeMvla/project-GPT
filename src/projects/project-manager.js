const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class ProjectManager {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../../database/projects.db');
        this.isInitialized = false;
    }

    async initialize() {
        console.log('📊 Initializing Project Manager...');
        
        try {
            // Ensure database directory exists
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            
            // Initialize SQLite database
            this.db = new sqlite3.Database(this.dbPath);
            
            // Create tables
            await this.createTables();
            
            this.isInitialized = true;
            console.log('✅ Project Manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Project Manager:', error);
            throw error;
        }
    }

    async createTables() {
        return new Promise((resolve, reject) => {
            const createProjectsTable = `
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    type TEXT,
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    deadline DATETIME,
                    priority INTEGER DEFAULT 1,
                    progress REAL DEFAULT 0.0,
                    tags TEXT,
                    file_path TEXT,
                    metadata TEXT
                )
            `;

            const createTasksTable = `
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER,
                    title TEXT NOT NULL,
                    description TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    due_date DATETIME,
                    priority INTEGER DEFAULT 1,
                    estimated_hours REAL,
                    actual_hours REAL,
                    assigned_to TEXT,
                    dependencies TEXT,
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            `;

            const createNotesTable = `
                CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER,
                    content TEXT NOT NULL,
                    context TEXT,
                    tags TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    note_type TEXT DEFAULT 'general',
                    attachments TEXT,
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            `;

            const createInventoryTable = `
                CREATE TABLE IF NOT EXISTS inventory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    category TEXT,
                    quantity REAL DEFAULT 0,
                    unit TEXT,
                    cost_per_unit REAL,
                    supplier TEXT,
                    location TEXT,
                    min_quantity REAL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_used DATETIME,
                    project_id INTEGER,
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            `;

            const createTimelineTable = `
                CREATE TABLE IF NOT EXISTS timeline_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER,
                    event_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    start_date DATETIME NOT NULL,
                    end_date DATETIME,
                    status TEXT DEFAULT 'scheduled',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    dependencies TEXT,
                    resources_needed TEXT,
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            `;

            const createRemindersTable = `
                CREATE TABLE IF NOT EXISTS reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER,
                    title TEXT NOT NULL,
                    description TEXT,
                    reminder_type TEXT DEFAULT 'one_time',
                    reminder_date DATETIME NOT NULL,
                    is_recurring INTEGER DEFAULT 0,
                    recurrence_pattern TEXT,
                    recurrence_end_date DATETIME,
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT DEFAULT 'manual',
                    priority INTEGER DEFAULT 1,
                    notification_sent INTEGER DEFAULT 0,
                    last_reminded DATETIME,
                    snooze_until DATETIME,
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            `;

            this.db.serialize(() => {
                this.db.run(createProjectsTable);
                this.db.run(createTasksTable);
                this.db.run(createNotesTable);
                this.db.run(createInventoryTable);
                this.db.run(createTimelineTable);
                this.db.run(createRemindersTable, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    async getAllProjects() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT p.*, 
                       COUNT(t.id) as task_count,
                       COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks
                FROM projects p
                LEFT JOIN tasks t ON p.id = t.project_id
                WHERE p.status != 'deleted'
                GROUP BY p.id
                ORDER BY p.updated_at DESC
            `;
            
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getProjectById(projectId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT p.*, 
                       COUNT(t.id) as task_count,
                       COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks
                FROM projects p
                LEFT JOIN tasks t ON p.id = t.project_id
                WHERE p.id = ? AND p.status != 'deleted'
                GROUP BY p.id
            `;
            
            this.db.get(query, [projectId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getActiveProjects() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM projects 
                WHERE status = 'active' 
                ORDER BY priority DESC, updated_at DESC
            `;
            
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async createProject(projectData) {
        return new Promise((resolve, reject) => {
            const {
                name,
                description = '',
                type = 'general',
                deadline = null,
                priority = 1,
                tags = [],
                filePath = null
            } = projectData;

            const query = `
                INSERT INTO projects (name, description, type, deadline, priority, tags, file_path, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const tagsString = Array.isArray(tags) ? tags.join(',') : tags;
            const metadata = JSON.stringify({
                createdBy: 'JARVIS',
                version: '1.0'
            });

            this.db.run(query, [name, description, type, deadline, priority, tagsString, filePath, metadata], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        name: name,
                        description: description,
                        type: type
                    });
                }
            });
        });
    }

    async updateProject(projectId, updates) {
        return new Promise((resolve, reject) => {
            const allowedFields = ['name', 'description', 'status', 'deadline', 'priority', 'progress', 'tags'];
            const updateFields = [];
            const values = [];

            Object.keys(updates).forEach(key => {
                if (allowedFields.includes(key)) {
                    updateFields.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            });

            if (updateFields.length === 0) {
                resolve({ success: false, error: 'No valid fields to update' });
                return;
            }

            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(projectId);

            const query = `UPDATE projects SET ${updateFields.join(', ')} WHERE id = ?`;

            this.db.run(query, values, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        success: true,
                        message: `Project ${projectId} updated successfully`,
                        changes: this.changes
                    });
                }
            });
        });
    }

    async deleteProject(projectId) {
        return new Promise((resolve, reject) => {
            if (!projectId) {
                resolve({
                    success: false,
                    error: 'Project ID is required'
                });
                return;
            }
            
            console.log('🗑️ Deleting project with ID:', projectId);
            
            const query = `
                UPDATE projects 
                SET status = 'deleted', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;

            this.db.run(query, [projectId], function(err) {
                if (err) {
                    console.error('❌ Error deleting project:', err);
                    resolve({
                        success: false,
                        error: err.message
                    });
                } else if (this.changes === 0) {
                    console.warn('⚠️ No project found with ID:', projectId);
                    resolve({
                        success: false,
                        error: `Project with ID ${projectId} not found`
                    });
                } else {
                    console.log(`✅ Project ${projectId} marked as deleted`);
                    resolve({
                        success: true,
                        message: `Project ${projectId} deleted successfully`,
                        id: projectId
                    });
                }
            });
        });
    }

    async addNote(noteData) {
        return new Promise((resolve, reject) => {
            const {
                content,
                context = '',
                tags = [],
                projectId = null,
                noteType = 'general'
            } = noteData;

            const query = `
                INSERT INTO notes (project_id, content, context, tags, note_type)
                VALUES (?, ?, ?, ?, ?)
            `;

            const tagsString = Array.isArray(tags) ? tags.join(',') : tags;
            const contextString = typeof context === 'object' ? JSON.stringify(context) : context;

            this.db.run(query, [projectId, content, contextString, tagsString, noteType], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        content: content,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });
    }

    async getNotes(projectId = null, limit = 50) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT n.*, p.name as project_name
                FROM notes n
                LEFT JOIN projects p ON n.project_id = p.id
            `;
            
            const params = [];
            
            if (projectId) {
                query += ' WHERE n.project_id = ?';
                params.push(projectId);
            }
            
            query += ' ORDER BY n.created_at DESC LIMIT ?';
            params.push(limit);

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async addReminder(reminderData) {
        return new Promise((resolve, reject) => {
            const {
                projectId,
                title,
                description = '',
                reminderDate,
                isRecurring = false,
                recurrencePattern = null,
                recurrenceEndDate = null,
                priority = 1,
                createdBy = 'manual'
            } = reminderData;

            if (!projectId || !title || !reminderDate) {
                reject(new Error('Project ID, title, and reminder date are required'));
                return;
            }

            const query = `
                INSERT INTO reminders (project_id, title, description, reminder_date, is_recurring, 
                                     recurrence_pattern, recurrence_end_date, priority, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [
                projectId, title, description, reminderDate, isRecurring ? 1 : 0, 
                recurrencePattern, recurrenceEndDate, priority, createdBy
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        projectId: projectId,
                        title: title,
                        reminderDate: reminderDate,
                        isRecurring: isRecurring
                    });
                }
            });
        });
    }

    async getReminders(projectId = null, includeInactive = false) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT r.*, p.name as project_name
                FROM reminders r
                LEFT JOIN projects p ON r.project_id = p.id
            `;
            
            const conditions = [];
            const params = [];
            
            if (projectId) {
                conditions.push('r.project_id = ?');
                params.push(projectId);
            }
            
            if (!includeInactive) {
                conditions.push("r.status != 'inactive'");
            }
            
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }
            
            query += ' ORDER BY r.reminder_date ASC';

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Parse recurrence pattern if it exists
                    const remindersWithParsedData = rows.map(reminder => ({
                        ...reminder,
                        is_recurring: Boolean(reminder.is_recurring),
                        recurrence_pattern: reminder.recurrence_pattern ? JSON.parse(reminder.recurrence_pattern) : null
                    }));
                    resolve(remindersWithParsedData);
                }
            });
        });
    }

    async updateReminder(reminderId, updates) {
        return new Promise((resolve, reject) => {
            const allowedFields = ['title', 'description', 'reminder_date', 'is_recurring', 
                                 'recurrence_pattern', 'recurrence_end_date', 'status', 'priority'];
            const updateFields = [];
            const values = [];

            Object.keys(updates).forEach(key => {
                if (allowedFields.includes(key)) {
                    updateFields.push(`${key} = ?`);
                    let value = updates[key];
                    // Handle boolean conversion for is_recurring
                    if (key === 'is_recurring') {
                        value = value ? 1 : 0;
                    }
                    // Handle JSON stringification for recurrence_pattern
                    if (key === 'recurrence_pattern' && typeof value === 'object') {
                        value = JSON.stringify(value);
                    }
                    values.push(value);
                }
            });

            if (updateFields.length === 0) {
                resolve({ success: false, error: 'No valid fields to update' });
                return;
            }

            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(reminderId);

            const query = `UPDATE reminders SET ${updateFields.join(', ')} WHERE id = ?`;

            this.db.run(query, values, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        success: true,
                        message: `Reminder ${reminderId} updated successfully`,
                        changes: this.changes
                    });
                }
            });
        });
    }

    async deleteReminder(reminderId) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE reminders SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

            this.db.run(query, [reminderId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        success: true,
                        message: `Reminder ${reminderId} deleted successfully`,
                        changes: this.changes
                    });
                }
            });
        });
    }

    async snoozeReminder(reminderId, snoozeUntil) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE reminders SET snooze_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

            this.db.run(query, [snoozeUntil, reminderId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        success: true,
                        message: `Reminder ${reminderId} snoozed until ${snoozeUntil}`,
                        changes: this.changes
                    });
                }
            });
        });
    }

    async markReminderNotified(reminderId) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE reminders SET notification_sent = 1, last_reminded = CURRENT_TIMESTAMP WHERE id = ?`;

            this.db.run(query, [reminderId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        success: true,
                        message: `Reminder ${reminderId} marked as notified`
                    });
                }
            });
        });
    }

    async getDueReminders() {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            const query = `
                SELECT r.*, p.name as project_name
                FROM reminders r
                LEFT JOIN projects p ON r.project_id = p.id
                WHERE r.status = 'active' 
                  AND r.reminder_date <= ?
                  AND (r.snooze_until IS NULL OR r.snooze_until <= ?)
                ORDER BY r.reminder_date ASC
            `;

            this.db.all(query, [now, now], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async addProjectNote(noteData) {
        return new Promise((resolve, reject) => {
            const {
                projectId,
                content,
                context = '',
                tags = [],
                noteType = 'project_note',
                createdBy = 'manual'
            } = noteData;

            if (!projectId || !content) {
                reject(new Error('Project ID and content are required'));
                return;
            }

            const query = `
                INSERT INTO notes (project_id, content, context, tags, note_type, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            const tagsString = Array.isArray(tags) ? tags.join(',') : tags;
            const contextString = typeof context === 'object' ? JSON.stringify(context) : context;

            this.db.run(query, [projectId, content, contextString, tagsString, noteType], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        projectId: projectId,
                        content: content,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });
    }

    async getProjectNotes(projectId, limit = 50) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT n.*, p.name as project_name
                FROM notes n
                LEFT JOIN projects p ON n.project_id = p.id
                WHERE n.project_id = ? AND n.note_type = 'project_note'
                ORDER BY n.created_at DESC
                LIMIT ?
            `;

            this.db.all(query, [projectId, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async addInventoryItem(itemData) {
        return new Promise((resolve, reject) => {
            const {
                name,
                description = '',
                category = 'general',
                quantity = 0,
                unit = 'pcs',
                costPerUnit = 0,
                supplier = '',
                location = '',
                minQuantity = 0,
                projectId = null
            } = itemData;

            const query = `
                INSERT INTO inventory (name, description, category, quantity, unit, cost_per_unit, supplier, location, min_quantity, project_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [name, description, category, quantity, unit, costPerUnit, supplier, location, minQuantity, projectId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        name: name,
                        quantity: quantity,
                        unit: unit
                    });
                }
            });
        });
    }

    async getInventory(category = null) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT i.*, p.name as project_name
                FROM inventory i
                LEFT JOIN projects p ON i.project_id = p.id
            `;
            
            const params = [];
            
            if (category) {
                query += ' WHERE i.category = ?';
                params.push(category);
            }
            
            query += ' ORDER BY i.name ASC';

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Check for low inventory
                    const inventoryWithAlerts = rows.map(item => ({
                        ...item,
                        isLowStock: item.quantity <= item.min_quantity && item.min_quantity > 0
                    }));
                    
                    resolve(inventoryWithAlerts);
                }
            });
        });
    }

    async updateInventoryQuantity(itemId, quantityChange, reason = '') {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // First get current quantity
                this.db.get('SELECT quantity, name FROM inventory WHERE id = ?', [itemId], (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!row) {
                        reject(new Error('Inventory item not found'));
                        return;
                    }
                    
                    const newQuantity = row.quantity + quantityChange;
                    
                    // Update quantity
                    this.db.run(
                        'UPDATE inventory SET quantity = ?, last_used = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [newQuantity, itemId],
                        function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve({
                                    success: true,
                                    message: `${row.name} quantity updated from ${row.quantity} to ${newQuantity}`,
                                    oldQuantity: row.quantity,
                                    newQuantity: newQuantity,
                                    change: quantityChange
                                });
                            }
                        }
                    );
                });
            });
        });
    }

    async addTimelineEvent(eventData) {
        return new Promise((resolve, reject) => {
            const {
                projectId,
                eventType,
                title,
                description = '',
                startDate,
                endDate = null,
                dependencies = '',
                resourcesNeeded = ''
            } = eventData;

            const query = `
                INSERT INTO timeline_events (project_id, event_type, title, description, start_date, end_date, dependencies, resources_needed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [projectId, eventType, title, description, startDate, endDate, dependencies, resourcesNeeded], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        title: title,
                        startDate: startDate
                    });
                }
            });
        });
    }

    async getProjectTimeline(projectId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM timeline_events
                WHERE project_id = ?
                ORDER BY start_date ASC
            `;

            this.db.all(query, [projectId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async executeAction(parameters) {
        console.log('📊 Project Manager executeAction called with:', parameters);
        try {
            const { action, data } = parameters;
            console.log('📊 Action:', action, 'Data:', data);
            
            switch (action) {
                case 'create_project':
                    const result = await this.createProject(data);
                    return { success: true, data: result, message: `Project "${data.name}" created successfully` };
                  case 'update_project':
                    return await this.updateProject(data.id, data.updates);

                case 'add_note':
                    return await this.addNote(data);
                
                case 'get_projects':
                    return { success: true, data: await this.getAllProjects() };
                
                case 'get_project':
                    return { success: true, data: await this.getProjectById(data.id) };
                
                case 'get_inventory':
                    return { success: true, data: await this.getInventory(data.category) };
                
                case 'add_inventory':
                    return await this.addInventoryItem(data);
                
                case 'update_inventory':
                    return await this.updateInventoryQuantity(data.id, data.change, data.reason);
                
                case 'edit_project':
                case 'update_project':
                    // Handle both projectId and projectName
                    let projectIdToEdit = data.projectId || data.id;
                    if (!projectIdToEdit && data.projectName) {
                        const project = await this.findProjectByName(data.projectName);
                        if (project) {
                            projectIdToEdit = project.id;
                        } else {
                            return {
                                success: false,
                                error: `Project "${data.projectName}" not found`
                            };
                        }
                    }
                    
                    if (!projectIdToEdit) {
                        return {
                            success: false,
                            error: 'Project ID or name is required for editing'
                        };
                    }
                    
                    // Extract updates from data (exclude projectId, projectName)
                    const updates = { ...data };
                    delete updates.projectId;
                    delete updates.projectName;
                    delete updates.id;
                    delete updates.action;
                    
                    return await this.updateProject(projectIdToEdit, updates);

                case 'delete_project':
                    // Handle both projectId and projectName
                    let projectIdToDelete = data.projectId || data.id;
                    if (!projectIdToDelete && data.projectName) {
                        const project = await this.findProjectByName(data.projectName);
                        if (project) {
                            projectIdToDelete = project.id;
                        } else {
                            return {
                                success: false,
                                error: `Project "${data.projectName}" not found`
                            };
                        }
                    }
                    
                    if (!projectIdToDelete) {
                        return {
                            success: false,
                            error: 'Project ID or name is required for deletion'
                        };
                    }
                    
                    return await this.deleteProject(projectIdToDelete);
                
                case 'add_timeline_event':
                    return await this.addTimelineEvent(data);
                
                case 'get_timeline':
                    return { success: true, data: await this.getProjectTimeline(data.projectId) };
                
                // Reminder actions
                case 'add_reminder':
                    return { success: true, data: await this.addReminder(data), message: `Reminder "${data.title}" added successfully` };
                
                case 'get_reminders':
                    return { success: true, data: await this.getReminders(data.projectId, data.includeInactive) };
                
                case 'update_reminder':
                    return await this.updateReminder(data.id, data.updates);
                
                case 'delete_reminder':
                    return await this.deleteReminder(data.id);
                
                case 'snooze_reminder':
                    return await this.snoozeReminder(data.id, data.snoozeUntil);
                
                case 'get_due_reminders':
                    return { success: true, data: await this.getDueReminders() };
                
                case 'add_project_note':
                    return { success: true, data: await this.addProjectNote(data), message: `Note added to project successfully` };
                
                case 'get_project_notes':
                    return { success: true, data: await this.getProjectNotes(data.projectId, data.limit) };
                
                // Handle common project management actions that aren't implemented yet
                case 'move_project_stage':
                case 'update_project_status':
                case 'change_project_stage':
                case 'set_project_phase':
                    return await this.moveProjectStage(data);
                
                default:
                    console.log('❌ Unknown action:', action);
                    return {
                        success: true,
                        message: `Project management action "${action}" is noted and logged. You can manage projects directly in the Projects tab for now.`
                    };
            }
            
        } catch (error) {
            console.error('❌ Project Manager executeAction error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getProjectAnalytics(projectId = null) {
        return new Promise((resolve, reject) => {
            let query;
            let params;
            
            if (projectId) {
                query = `
                    SELECT 
                        COUNT(*) as total_tasks,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
                        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
                        AVG(progress) as avg_progress
                    FROM tasks 
                    WHERE project_id = ?
                `;
                params = [projectId];
            } else {
                query = `
                    SELECT 
                        COUNT(DISTINCT p.id) as total_projects,
                        COUNT(CASE WHEN p.status = 'active' THEN 1 END) as active_projects,
                        COUNT(CASE WHEN p.status = 'completed' THEN 1 END) as completed_projects,
                        COUNT(t.id) as total_tasks,
                        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks
                    FROM projects p
                    LEFT JOIN tasks t ON p.id = t.project_id
                    WHERE p.status != 'deleted'
                `;
                params = [];
            }

            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async cleanup() {
        if (this.db) {
            this.db.close();
        }
    }

    async moveProjectStage(data) {
        console.log('📊 Moving project stage with data:', data);
        
        try {
            const { projectId, projectName, targetStage, targetStatus, newStatus, stage, status } = data;
            
            // Determine the new status from various possible parameter names
            let newProjectStatus = targetStage || targetStatus || newStatus || stage || status;
            
            // If no explicit project ID, try to find by name
            let finalProjectId = projectId;
            if (!finalProjectId && projectName) {
                const project = await this.findProjectByName(projectName);
                if (project) {
                    finalProjectId = project.id;
                } else {
                    return {
                        success: false,
                        error: `Project "${projectName}" not found`
                    };
                }
            }
            
            if (!finalProjectId) {
                return {
                    success: false,
                    error: 'Project ID or name is required to move project stage'
                };
            }
            
            // Normalize common stage/status names
            const statusMapping = {
                'planning': 'planning',
                'plan': 'planning',
                'in progress': 'in_progress',
                'progress': 'in_progress',
                'active': 'active',
                'working': 'in_progress',
                'development': 'in_progress',
                'testing': 'testing',
                'test': 'testing',
                'review': 'review',
                'complete': 'completed',
                'completed': 'completed',
                'done': 'completed',
                'finished': 'completed',
                'on hold': 'on_hold',
                'hold': 'on_hold',
                'paused': 'on_hold',
                'cancelled': 'cancelled',
                'canceled': 'cancelled'
            };
            
            const normalizedStatus = statusMapping[newProjectStatus?.toLowerCase()] || newProjectStatus;
            
            if (!normalizedStatus) {
                return {
                    success: false,
                    error: 'Valid target stage/status is required (e.g., planning, in progress, testing, completed)'
                };
            }
            
            // Update the project status
            const updateResult = await this.updateProject(finalProjectId, { 
                status: normalizedStatus,
                updated_at: new Date().toISOString()
            });
            
            if (updateResult.success) {
                return {
                    success: true,
                    message: `Project moved to "${normalizedStatus}" stage successfully`,
                    data: { projectId: finalProjectId, newStatus: normalizedStatus }
                };
            } else {
                return updateResult;
            }
            
        } catch (error) {
            console.error('❌ Error moving project stage:', error);
            return {
                success: false,
                error: `Failed to move project stage: ${error.message}`
            };
        }
    }

    async findProjectByName(projectName) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM projects 
                WHERE name LIKE ? AND status != 'deleted'
                ORDER BY updated_at DESC
                LIMIT 1
            `;
            
            this.db.get(query, [`%${projectName}%`], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
}

module.exports = ProjectManager;
