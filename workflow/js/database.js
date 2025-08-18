// workflow/js/database.js
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const { app } = require('electron');

try {
    i18n = require('./i18n.js');
} catch (err) {
    console.log(err)
}

const userDataPath = app ? app.getPath('userData') : './'; 
const dbPath = path.join(userDataPath, 'workflows.sqlite');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false 
});

const Workflow = sequelize.define('Workflow', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    data: { type: DataTypes.JSON, allowNull: false }
}, { timestamps: true });

const WorkflowVersion = sequelize.define('WorkflowVersion', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    workflowId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: Workflow, key: 'id' },
        onDelete: 'CASCADE'
    },
    data: { type: DataTypes.JSON, allowNull: false }
}, { timestamps: true, updatedAt: false });

Workflow.hasMany(WorkflowVersion, { foreignKey: 'workflowId' });
WorkflowVersion.belongsTo(Workflow, { foreignKey: 'workflowId' });

class DatabaseManager {
    constructor() {
        this.db = sequelize;
        this.Workflow = Workflow;
        this.WorkflowVersion = WorkflowVersion;
        this.MAX_VERSIONS = 100;
    }

    async initialize() {
        try {
            await this.db.sync(); 
            console.log(i18n.get('database.init_success'));
        } catch (error) {
            console.error(i18n.get('database.init_fail'), error);
        }
    }

    async saveWorkflow(name, data, id = null) {
        if (!name || !data) {
            throw new Error(i18n.get('database.validation_error'));
        }
        if (id) {
            const [updated] = await this.Workflow.update({ name, data }, { where: { id } });
            if (updated) {
                return this.Workflow.findByPk(id);
            }
            throw new Error(i18n.get('database.not_found_error', { id }));
        } else {
            return this.Workflow.create({ name, data });
        }
    }

    async getWorkflows(options = {}) {
        const { limit, offset = 0, searchTerm = '' } = options;
        const where = {};
        if (searchTerm) {
            where.name = { [Op.like]: `%${searchTerm}%` };
        }

        return this.Workflow.findAndCountAll({
            where,
            order: [['updatedAt', 'DESC']],
            limit,
            offset
        });
    }
    
    async deleteWorkflow(id) {
        const workflow = await this.Workflow.findByPk(id);
        if (workflow) {
            await workflow.destroy();
            return { success: true, id };
        }
        return { success: false, message: i18n.get('database.delete_not_found', { id }) };
    }
    
    async saveWorkflowVersion(workflowId, data) {
        if (!workflowId) {
            throw new Error(i18n.get('database.version_id_error'));
        }

        const newVersion = await this.WorkflowVersion.create({ workflowId, data });
        
        const versions = await this.WorkflowVersion.findAll({
            where: { workflowId },
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'createdAt']
        });

        if (versions.length > this.MAX_VERSIONS) {
            const idsToDelete = versions.slice(this.MAX_VERSIONS).map(v => v.id);
            await this.WorkflowVersion.destroy({ where: { id: idsToDelete } });
        }
        
        return newVersion;
    }

    async getWorkflowVersions(workflowId) {
        return this.WorkflowVersion.findAll({
            where: { workflowId },
            order: [['createdAt', 'DESC']]
        });
    }
}

module.exports = new DatabaseManager();