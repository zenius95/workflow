module.exports = {
    type: 'condition',
    title: 'Điều kiện',
    displayName: 'Điều kiện (If)',
    icon: '<i class="ri-git-pull-request-line"></i>',
    outputs: ['true', 'false'],
    defaultData: {
        conditionGroups: [
            [
                { inputValue: '', operator: '==', comparisonValue: '' }
            ]
        ]
    },
    settings: [
        { type: 'condition-builder', dataField: 'conditionGroups' }
    ],
    execute: (data, logger) => new Promise(resolve => {
        const { conditionGroups = [] } = data;
        if (!conditionGroups || conditionGroups.length === 0) {
            if (logger) logger.error('Khối điều kiện không có nhóm nào để đánh giá.');
            resolve({ selectedPort: 'false', data: { conditionResult: false } });
            return;
        }

        const evaluateCondition = (cond) => {
            const { inputValue, operator, comparisonValue } = cond;
            if (logger) logger.info(`-- Đang kiểm tra: "${inputValue}" ${operator} "${comparisonValue}"`);

            let result = false;
            const numInputValue = parseFloat(inputValue);
            const numComparisonValue = parseFloat(comparisonValue);

            switch (operator) {
                case '==': result = inputValue == comparisonValue; break;
                case '!=': result = inputValue != comparisonValue; break;
                case '>': result = !isNaN(numInputValue) && !isNaN(numComparisonValue) && numInputValue > numComparisonValue; break;
                case '<': result = !isNaN(numInputValue) && !isNaN(numComparisonValue) && numInputValue < numComparisonValue; break;
                case '>=': result = !isNaN(numInputValue) && !isNaN(numComparisonValue) && numInputValue >= numComparisonValue; break;
                case '<=': result = !isNaN(numInputValue) && !isNaN(numComparisonValue) && numInputValue <= numComparisonValue; break;
                case 'contains': result = String(inputValue).includes(String(comparisonValue)); break;
                case 'not_contains': result = !String(inputValue).includes(String(comparisonValue)); break;
                case 'is_empty': result = inputValue === null || inputValue === undefined || inputValue === ''; break;
                case 'is_not_empty': result = inputValue !== null && inputValue !== undefined && inputValue !== ''; break;
                default: if (logger) logger.error(`Toán tử không hợp lệ: ${operator}`); result = false; break;
            }
            return result;
        };

        const finalResult = conditionGroups.some(group => {
            if (!group || group.length === 0) return false;
            return group.every(evaluateCondition);
        });

        const selectedPort = finalResult ? 'true' : 'false';
        if (logger) logger.success(`Kết quả logic tổng hợp là ${finalResult}. Chuyển hướng tới cổng: ${selectedPort}`);
        resolve({ selectedPort, data: { conditionResult: finalResult } });
    })
};