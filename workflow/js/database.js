// workflow/js/database.js
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const { app } = require('electron'); // Sử dụng module app của electron trực tiếp

const userDataPath = app ? app.getPath('userData') : './'; 
const dbPath = path.join(userDataPath, 'workflows.sqlite');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false 
});

const Workflow = sequelize.define('Workflow', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    data: {
        type: DataTypes.JSON, 
        allowNull: false
    }
}, {
    timestamps: true 
});

const WorkflowVersion = sequelize.define('WorkflowVersion', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    workflowId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Workflow,
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    data: {
        type: DataTypes.JSON,
        allowNull: false
    }
}, {
    timestamps: true,
    updatedAt: false 
});

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
            // *** SỬA LỖI QUAN TRỌNG: Đảm bảo chỉ dùng sync() để ổn định database ***
            await this.db.sync(); 
            // *** KẾT THÚC SỬA LỖI ***
            console.log('Database initialized successfully.');
        } catch (error) {
            console.error('Failed to initialize database:', error);
        }
    }

    async saveWorkflow(name, data, id = null) {
        if (!name || !data) {
            throw new Error('Tên và dữ liệu workflow không được để trống.');
        }
        if (id) {
            const [updated] = await this.Workflow.update({ name, data }, { where: { id } });
            if (updated) {
                return this.Workflow.findByPk(id);
            }
            throw new Error(`Không tìm thấy workflow với ID: ${id}`);
        } else {
            return this.Workflow.create({ name, data });
        }
    }

    async getWorkflows() {
        return this.Workflow.findAll({
            order: [['updatedAt', 'DESC']]
        });
    }

    async deleteWorkflow(id) {
        return this.Workflow.destroy({
            where: { id }
        });
    }
    
    async saveWorkflowVersion(workflowId, data) {
        if (!workflowId) {
            throw new Error('Cần có ID của workflow để lưu phiên bản.');
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