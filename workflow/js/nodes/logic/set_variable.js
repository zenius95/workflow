module.exports = {
    type: 'set_variable',
    title: 'Set Variable',
    displayName: 'Set Variable',
    icon: '<i class="bi bi-braces-asterisk"></i>',
    outputs: ['success'],
    defaultData: { variables: [{ key: '', value: '' }] },
    settings: [
        {
            type: 'repeater',
            dataField: 'variables',
            addButtonText: '+ Thêm biến',
            fields: [
                { type: 'text', dataField: 'key', placeholder: 'Tên biến' },
                { type: 'text', dataField: 'value', placeholder: 'Giá trị', variablePicker: true }
            ]
        }
    ],
    execute: (data, logger, context) => {
        const { variables } = data;
        if (!variables || !Array.isArray(variables)) {
            throw new Error("Định dạng biến không hợp lệ.");
        }
        const setVariables = {};
        variables.forEach(variable => {
            if (variable.key) {
                if (logger) logger.info(`Thiết lập biến toàn cục: global.${variable.key} = ${JSON.stringify(variable.value)}`);
                context.globalVariables[variable.key] = variable.value;
                setVariables[variable.key] = variable.value;
            }
        });
        context._updateVariablesPanel();
        return { variablesSet: setVariables };
    }
};