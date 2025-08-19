module.exports = {
    type: 'loop',
    title: 'Vòng lặp',
    displayName: 'Vòng lặp (Loop)',
    icon: '<i class="ri-repeat-line"></i>',
    outputs: ['loop', 'done'],
    defaultData: {
        inputArray: ''
    },
    settings: [
        { type: 'text', label: 'Mảng đầu vào', dataField: 'inputArray', placeholder: '{{some_node.output.items}}', variablePicker: true, helpText: 'Cung cấp một JSON array hoặc một biến chứa mảng.' }
    ],
    execute: (data, logger) => {
        const { inputArray } = data;
        if (!Array.isArray(inputArray)) {
            throw new Error('Đầu vào cho vòng lặp phải là một mảng (Array).');
        }
        if (logger) logger.info(`Chuẩn bị lặp qua ${inputArray.length} phần tử.`);
        return inputArray;
    }
};