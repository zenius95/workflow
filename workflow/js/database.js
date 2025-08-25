const { Sequelize, DataTypes, Op } = require('sequelize');
const { app } = require('electron')
const path = require('path')

function parseDataField(data) {
    if (typeof data === 'string') {
        try {
            return JSON.parse(data);
        } catch {
            return {};
        }
    }
    if (typeof data === 'object' && data !== null) {
        return data;
    }
    return {};
}

class Database {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: dbPath,
            logging: false,
        });

        this.Workflow = this.sequelize.define('Workflow', {
            name: { type: DataTypes.STRING, allowNull: false },
            data: { type: DataTypes.TEXT },
            createdAt: { type: DataTypes.STRING, allowNull: false },
            updatedAt: { type: DataTypes.STRING, allowNull: false },
        }, {
            tableName: 'workflows',
            timestamps: false,
        });

        this.WorkflowVersion = this.sequelize.define('WorkflowVersion', {
            workflow_id: { type: DataTypes.INTEGER, allowNull: false },
            data: { type: DataTypes.TEXT },
            createdAt: { type: DataTypes.STRING, allowNull: false },
        }, {
            tableName: 'workflow_versions',
            timestamps: false,
        });

        this.WorkflowVersion.belongsTo(this.Workflow, { foreignKey: 'workflow_id', onDelete: 'CASCADE' });
    }

    async init() {
        await this.sequelize.authenticate();
        await this.Workflow.sync();
        await this.WorkflowVersion.sync();
        console.log("Database tables are ready.");
    }

    async getWorkflows(options = {}) {
        const { limit = 15, offset = 0, searchTerm = '' } = options;
        const where = searchTerm ? { name: { [Op.like]: `%${searchTerm}%` } } : {};
        const { count, rows } = await this.Workflow.findAndCountAll({
            where,
            order: [['updatedAt', 'DESC']],
            limit,
            offset,
        });
        return {
            count,
            rows: rows.map(row => {
                const obj = row.toJSON();
                obj.data = parseDataField(obj.data);
                return obj;
            })
        };
    }

    async deleteWorkflow(id) {
        const result = await this.Workflow.destroy({ where: { id } });
        if (result === 0) {
            return { success: false, message: 'No workflow found with that ID.' };
        }
        return { success: true };
    }

    async getWorkflowVersions(workflowId) {
        const rows = await this.WorkflowVersion.findAll({
            where: { workflow_id: workflowId },
            order: [['createdAt', 'DESC']]
        });
        return rows.map(row => {
            const obj = row.toJSON();
            obj.data = parseDataField(obj.data);
            return obj;
        });
    }

    async createWorkflowVersion(workflowId, data) {
        const createdAt = new Date().toISOString();
        const row = await this.WorkflowVersion.create({
            workflow_id: workflowId,
            data: JSON.stringify(data),
            createdAt,
        });
        return { id: row.id };
    }

    async close() {
        await this.sequelize.close();
        console.log('Close the database connection.');
    }

    async getWorkflowById(id) {
        const row = await this.Workflow.findByPk(id);
        if (row) {
            const obj = row.toJSON();
            obj.data = parseDataField(obj.data);
            return obj;
        }
        return null;
    }

    async updateWorkflow(id, { name, data }) {
        const updatedAt = new Date().toISOString();
        const [changes] = await this.Workflow.update(
            { name, data: JSON.stringify(data), updatedAt },
            { where: { id } }
        );
        return { id, changes };
    }

    async createWorkflow({ name, data }) {
        const createdAt = new Date().toISOString();
        const row = await this.Workflow.create({
            name,
            data: JSON.stringify(data),
            createdAt,
            updatedAt: createdAt,
        });
        return { id: row.id };
    }
}

// Create and export a single, initialized instance of the Database
const dbInstance = new Database(process.env.DB_PATH || path.join(app.getPath('userData'), 'workflows.db')); // Use environment variable or default
dbInstance.init().then(() => {
    console.log("Database initialized and ready for use.");
}).catch(err => {
    console.error("Failed to initialize database:", err);
});

module.exports = dbInstance;