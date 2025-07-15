const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database/projects.db');
const db = new sqlite3.Database(dbPath);

const testProjects = [
    {
        name: 'Website Redesign',
        description: 'Redesign company website with modern UI',
        type: 'web-development',
        status: 'planning',
        priority: 2
    },
    {
        name: 'Mobile App Development',
        description: 'Build iOS and Android mobile application',
        type: 'mobile-development',
        status: 'in_progress',
        priority: 1
    },
    {
        name: 'Database Migration',
        description: 'Migrate from MySQL to PostgreSQL',
        type: 'backend',
        status: 'review',
        priority: 3
    },
    {
        name: 'API Documentation',
        description: 'Complete API documentation for v2.0',
        type: 'documentation',
        status: 'completed',
        priority: 2
    }
];

console.log('Adding test projects...');

db.serialize(() => {
    // Clear existing projects first
    db.run('DELETE FROM projects', (err) => {
        if (err) {
            console.error('Error clearing projects:', err);
            return;
        }
        console.log('Cleared existing projects');
        
        // Add test projects
        const stmt = db.prepare(`
            INSERT INTO projects (name, description, type, status, priority, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        testProjects.forEach((project, index) => {
            const metadata = JSON.stringify({
                createdBy: 'test-script',
                version: '1.0'
            });
            
            stmt.run([
                project.name,
                project.description,
                project.type,
                project.status,
                project.priority,
                metadata
            ], function(err) {
                if (err) {
                    console.error('Error inserting project:', err);
                } else {
                    console.log(`Added project: ${project.name} (ID: ${this.lastID})`);
                }
            });
        });
        
        stmt.finalize(() => {
            console.log('All test projects added successfully!');
            db.close();
        });
    });
});
