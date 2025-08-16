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

/**
 * Lớp quản lý Database cho Workflow
 */
class DatabaseManager {
    constructor() {
        this.db = sequelize;
        this.Workflow = Workflow;
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
}

// Export một instance duy nhất của class
module.exports = new DatabaseManager();