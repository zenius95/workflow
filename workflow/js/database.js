const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Đường dẫn tới file database, đặt trong thư mục gốc của ứng dụng
const dbPath = path.join(require('@electron/remote').app.getPath('userData'), 'workflows.sqlite');

// Khởi tạo Sequelize
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false // Tắt log SQL cho gọn
});

// Định nghĩa Model Workflow
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
        type: DataTypes.JSON, // Lưu toàn bộ object workflow (nodes, connections)
        allowNull: false
    }
}, {
    timestamps: true // Tự động thêm createdAt và updatedAt
});

// *** BẮT ĐẦU THAY ĐỔI: Model mới cho Version History ***
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
        onDelete: 'CASCADE' // Tự động xóa version nếu workflow bị xóa
    },
    data: {
        type: DataTypes.JSON,
        allowNull: false
    }
}, {
    timestamps: true,
    updatedAt: false // Chỉ cần biết thời điểm tạo
});

Workflow.hasMany(WorkflowVersion, { foreignKey: 'workflowId' });
WorkflowVersion.belongsTo(Workflow, { foreignKey: 'workflowId' });
// *** KẾT THÚC THAY ĐỔI ***

/**
 * Lớp quản lý Database cho Workflow
 */
class DatabaseManager {
    constructor() {
        this.db = sequelize;
        this.Workflow = Workflow;
        this.WorkflowVersion = WorkflowVersion; // *** NEW ***
        this.MAX_VERSIONS = 100; // *** NEW: Giới hạn số lượng version
    }

    /**
     * Khởi tạo database và đồng bộ model
     */
    async initialize() {
        try {
            await this.db.sync({ alter: true });
            console.log('Database initialized successfully.');
        } catch (error) {
            console.error('Failed to initialize database:', error);
        }
    }

    /**
     * Lưu hoặc cập nhật một workflow
     * @param {string} name Tên của workflow
     * @param {object} data Dữ liệu workflow từ workflowBuilder.getWorkflow()
     * @param {number|null} id ID của workflow nếu muốn cập nhật
     * @returns {Promise<Workflow>}
     */
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

    /**
     * Lấy danh sách tất cả workflow đã lưu
     * @returns {Promise<Workflow[]>}
     */
    async getWorkflows() {
        return this.Workflow.findAll({
            order: [['updatedAt', 'DESC']]
        });
    }

    /**
     * Xóa một workflow bằng ID
     * @param {number} id
     * @returns {Promise<number>} Số lượng bản ghi đã xóa
     */
    async deleteWorkflow(id) {
        return this.Workflow.destroy({
            where: { id }
        });
    }

    // *** BẮT ĐẦU THAY ĐỔI: Các hàm mới cho Version History ***
    
    /**
     * Lưu một phiên bản của workflow
     * @param {number} workflowId ID của workflow chính
     * @param {object} data Dữ liệu workflow để lưu lại
     * @returns {Promise<WorkflowVersion>}
     */
    async saveWorkflowVersion(workflowId, data) {
        if (!workflowId) {
            throw new Error('Cần có ID của workflow để lưu phiên bản.');
        }

        const newVersion = await this.WorkflowVersion.create({ workflowId, data });
        
        // Cắt bớt các phiên bản cũ nếu vượt quá giới hạn
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

    /**
     * Lấy tất cả các phiên bản của một workflow
     * @param {number} workflowId
     * @returns {Promise<WorkflowVersion[]>}
     */
    async getWorkflowVersions(workflowId) {
        return this.WorkflowVersion.findAll({
            where: { workflowId },
            order: [['createdAt', 'DESC']]
        });
    }
    // *** KẾT THÚC THAY ĐỔI ***
}

// Export một instance duy nhất của class
module.exports = new DatabaseManager();