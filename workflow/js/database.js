const sqlite3 = require('sqlite3').verbose();

class Database {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Could not connect to database', err);
                    reject(err);
                } else {
                    console.log('Connected to database');
                    resolve();
                }
            });
        });
    }

    // PHIÊN BẢN HOÀN CHỈNH: Đảm bảo khởi tạo tuần tự, chống lỗi race condition
    async init() {
        if (!this.db) {
            await this.connect();
        }

        const runQuery = (query) => {
            return new Promise((resolve, reject) => {
                this.db.run(query, (err) => {
                    if (err) {
                        console.error("Database query failed:", query, err);
                        return reject(err);
                    }
                    resolve();
                });
            });
        };

        const createWorkflowsTable = `
            CREATE TABLE IF NOT EXISTS workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                data TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            );
        `;
        const createVersionsTable = `
            CREATE TABLE IF NOT EXISTS workflow_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                data TEXT,
                createdAt TEXT NOT NULL,
                FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE
            );
        `;

        try {
            await runQuery(createWorkflowsTable);
            await runQuery(createVersionsTable);
            console.log("Database tables are ready.");
        } catch (error) {
            console.error("Failed to initialize database tables.", error);
            throw error;
        }
    }

    getWorkflows(options = {}) {
        const { limit = 15, offset = 0, searchTerm = '' } = options;
        
        return new Promise((resolve, reject) => {
            const whereClause = searchTerm ? `WHERE name LIKE ?` : '';
            const params = searchTerm ? [`%${searchTerm}%`] : [];
            
            const countQuery = `SELECT COUNT(*) as count FROM workflows ${whereClause}`;
            
            this.db.get(countQuery, params, (err, countRow) => {
                if (err) {
                    return reject(err);
                }
                
                const query = `
                    SELECT * FROM workflows 
                    ${whereClause} 
                    ORDER BY updatedAt DESC 
                    LIMIT ? OFFSET ?
                `;
                
                this.db.all(query, [...params, limit, offset], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            count: countRow ? countRow.count : 0,
                            rows: rows.map(row => ({
                                ...row,
                                data: JSON.parse(row.data || '{}')
                            }))
                        });
                    }
                });
            });
        });
    }

    deleteWorkflow(id) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM workflows WHERE id = ?', [id], function(err) {
                if (err) {
                    reject({ success: false, message: err.message });
                } else if (this.changes === 0) {
                    resolve({ success: false, message: 'No workflow found with that ID.' });
                } else {
                    resolve({ success: true });
                }
            });
        });
    }
    
    getWorkflowVersions(workflowId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM workflow_versions WHERE workflow_id = ? ORDER BY createdAt DESC`;
            this.db.all(query, [workflowId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({
                        ...row,
                        data: JSON.parse(row.data || '{}')
                    })));
                }
            });
        });
    }

    createWorkflowVersion(workflowId, data) {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO workflow_versions (workflow_id, data, createdAt) VALUES (?, ?, ?)`;
            const dataJson = JSON.stringify(data);
            const createdAt = new Date().toISOString();
            this.db.run(query, [workflowId, dataJson, createdAt], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID });
                }
            });
        });
    }
    
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error(err.message);
                }
                console.log('Close the database connection.');
            });
        }
    }
    
    // PHIÊN BẢN HOÀN CHỈNH: Đảm bảo parse JSON khi đọc
    getWorkflowById(id) {
        return new Promise((resolve, reject) => {
          this.db.get('SELECT * FROM workflows WHERE id = ?', [id], (err, row) => {
            if (err) {
              console.error('Database error:', err.message);
              reject(err);
            } else {
              if (row) {
                row.data = JSON.parse(row.data || '{}');
              }
              resolve(row);
            }
          });
        });
    }
    
    updateWorkflow(id, { name, data }) {
        const dataJson = JSON.stringify(data);
        const updatedAt = new Date().toISOString();
        return new Promise((resolve, reject) => {
          this.db.run(
            'UPDATE workflows SET name = ?, data = ?, updatedAt = ? WHERE id = ?',
            [name, dataJson, updatedAt, id],
            function (err) {
              if (err) {
                console.error('Database error:', err.message);
                reject(err);
              } else {
                resolve({ id: id, changes: this.changes });
              }
            }
          );
        });
    }
    
    createWorkflow({ name, data }) {
        const dataJson = JSON.stringify(data);
        const createdAt = new Date().toISOString();
        const updatedAt = createdAt;
        return new Promise((resolve, reject) => {
          this.db.run(
            'INSERT INTO workflows (name, data, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
            [name, dataJson, createdAt, updatedAt],
            function (err) {
              if (err) {
                console.error('Database error:', err.message);
                reject(err);
              } else {
                resolve({ id: this.lastID });
              }
            }
          );
        });
    }
}

module.exports = Database;