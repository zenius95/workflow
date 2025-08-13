const { workflowConfig } = require('./workflow/js/config.js');

const WorkflowRunner = require('./workflow/js/runner.js');


// --- Điểm bắt đầu của Script ---
function main() {
    // ===================================================================
    // Sếp hãy dán NỘI DUNG của file JSON đã export vào đây.
    // Xóa nội dung ví dụ bên dưới và dán object của sếp vào.
    const workflowObject = {
        "nodes": [
            {
                "id": "log_message_0",
                "type": "log_message",
                "x": 185,
                "y": 142,
                "data": {
                    "message": "Bắt đầu chạy workflow từ object trong code!",
                    "level": "success",
                    "title": "Bắt đầu"
                }
            },
            {
                "id": "execute_command_0",
                "type": "execute_command",
                "x": 482,
                "y": 142,
                "data": {
                    "command": "node -v",
                    "title": "Kiểm tra phiên bản Node"
                }
            }
        ],
        "connections": [
            {
                "from": "log_message_0",
                "fromPort": "success",
                "to": "execute_command_0"
            }
        ]
    };
    // ===================================================================

    // Kiểm tra xem object có hợp lệ không
    if (!workflowObject || !workflowObject.nodes || !workflowObject.connections || workflowObject.nodes.length === 0) {
        console.error('Lỗi: workflowObject không hợp lệ hoặc bị trống. Vui lòng dán JSON đã export vào.');
        process.exit(1);
    }

    try {
        const runner = new WorkflowRunner(workflowConfig, workflowObject);
        runner.run();
    } catch (error) {
        console.error(`Lỗi khi chạy workflow: ${error.message}`);
        process.exit(1);
    }
}

main();
