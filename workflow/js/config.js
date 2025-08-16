// --- DATA OPERATIONS CONFIG ---
const DATA_OPERATIONS = {
    string: {
        replace: {
            name: 'Thay thế',
            params: {
                find: { name: 'Tìm kiếm', placeholder: 'chuỗi cần tìm' },
                replaceWith: { name: 'Thay thế bằng', placeholder: 'chuỗi thay thế' }
            },
            execute: (input, params) => String(input).replace(new RegExp(params.find, 'g'), params.replaceWith)
        },
        split: {
            name: 'Tách chuỗi',
            params: { delimiter: { name: 'Ký tự phân cách', placeholder: ',' } },
            execute: (input, params) => String(input).split(params.delimiter)
        },
        toUpperCase: { name: 'In hoa', execute: (input) => String(input).toUpperCase() },
        toLowerCase: { name: 'In thường', execute: (input) => String(input).toLowerCase() },
        trim: { name: 'Cắt khoảng trắng', execute: (input) => String(input).trim() },
        length: { name: 'Lấy độ dài', execute: (input) => String(input).length },
        substring: {
            name: 'Cắt chuỗi con',
            params: {
                start: { name: 'Bắt đầu', type: 'number', placeholder: '0' },
                end: { name: 'Kết thúc (tùy chọn)', type: 'number' }
            },
            execute: (input, params) => {
                const end = params.end === '' || params.end === undefined ? undefined : parseInt(params.end, 10);
                return String(input).substring(parseInt(params.start, 10), end);
            }
        },
        startsWith: {
            name: 'Bắt đầu bằng',
            params: { value: { name: 'Chuỗi con' } },
            execute: (input, params) => String(input).startsWith(params.value)
        },
        endsWith: {
            name: 'Kết thúc bằng',
            params: { value: { name: 'Chuỗi con' } },
            execute: (input, params) => String(input).endsWith(params.value)
        },
        match: {
            name: 'Khớp với Regex',
            params: { regex: { name: 'Biểu thức chính quy (Regex)', placeholder: '\\d+' } },
            execute: (input, params) => String(input).match(new RegExp(params.regex, 'g')) || []
        }
    },
    number: {
        add: { name: 'Cộng', params: { value: { name: 'Giá trị', type: 'number' } }, execute: (input, params) => parseFloat(input) + parseFloat(params.value) },
        subtract: { name: 'Trừ', params: { value: { name: 'Giá trị', type: 'number' } }, execute: (input, params) => parseFloat(input) - parseFloat(params.value) },
        multiply: { name: 'Nhân', params: { value: { name: 'Giá trị', type: 'number' } }, execute: (input, params) => parseFloat(input) * parseFloat(params.value) },
        divide: { name: 'Chia', params: { value: { name: 'Giá trị', type: 'number' } }, execute: (input, params) => parseFloat(input) / parseFloat(params.value) },
        round: { name: 'Làm tròn', execute: (input) => Math.round(parseFloat(input)) },
        floor: { name: 'Làm tròn xuống', execute: (input) => Math.floor(parseFloat(input)) },
        ceil: { name: 'Làm tròn lên', execute: (input) => Math.ceil(parseFloat(input)) },
        abs: { name: 'Giá trị tuyệt đối', execute: (input) => Math.abs(parseFloat(input)) },
        is_number: { name: 'Kiểm tra là số', execute: (input) => !isNaN(parseFloat(input)) && isFinite(input) }
    },
    array: {
        join: { name: 'Nối mảng', params: { delimiter: { name: 'Ký tự phân cách', placeholder: ',' } }, execute: (input, params) => input.join(params.delimiter) },
        map: { name: 'Trích xuất thuộc tính (Map)', params: { path: { name: 'Đường dẫn thuộc tính', placeholder: 'user.name' } }, execute: (input, params) => input.map(item => getProperty(item, params.path)) },
        get_by_index: { name: 'Lấy theo chỉ số', params: { index: { name: 'Chỉ số (index)', type: 'number', placeholder: '0' } }, execute: (input, params) => input[parseInt(params.index, 10)] },
        length: { name: 'Lấy độ dài', execute: (input) => Array.isArray(input) ? input.length : 0 },
        sum: { name: 'Tính tổng', execute: (input) => Array.isArray(input) ? input.reduce((acc, val) => acc + (parseFloat(val) || 0), 0) : 0 },
        reverse: { name: 'Đảo ngược', execute: (input) => Array.isArray(input) ? [...input].reverse() : [] },
        slice: {
            name: 'Cắt mảng con',
            params: {
                start: { name: 'Bắt đầu', type: 'number', placeholder: '0' },
                end: { name: 'Kết thúc (tùy chọn)', type: 'number' }
            },
            execute: (input, params) => {
                    const end = params.end === '' || params.end === undefined ? undefined : parseInt(params.end, 10);
                    return Array.isArray(input) ? input.slice(parseInt(params.start, 10), end) : [];
            }
        },
        includes: {
            name: 'Kiểm tra chứa giá trị',
            params: { value: { name: 'Giá trị cần tìm' } },
            execute: (input, params) => Array.isArray(input) ? input.includes(params.value) : false
        },
        find_object: {
            name: 'Tìm đối tượng theo thuộc tính',
            params: {
                path: { name: 'Đường dẫn thuộc tính', placeholder: 'user.id' },
                value: { name: 'Giá trị cần tìm' }
            },
            execute: (input, params) => Array.isArray(input) ? input.find(item => String(getProperty(item, params.path)) === String(params.value)) : undefined
        }
    },
    object: {
        get_property: { name: 'Lấy thuộc tính', params: { path: { name: 'Đường dẫn', placeholder: 'data.results[0].name' } }, execute: (input, params) => getProperty(input, params.path) },
        get_keys: { name: 'Lấy danh sách khóa (keys)', execute: (input) => Object.keys(input) },
        get_values: { name: 'Lấy danh sách giá trị (values)', execute: (input) => Object.values(input) },
        merge: {
            name: 'Trộn đối tượng',
            params: { object2: { name: 'Đối tượng thứ 2 (JSON)', placeholder: '{"key": "value"}' } },
            execute: (input, params) => {
                try {
                    const obj2 = JSON.parse(params.object2);
                    return { ...input, ...obj2 };
                } catch (e) {
                    throw new Error("Đối tượng thứ 2 không phải là JSON hợp lệ.");
                }
            }
        },
        set_property: {
            name: 'Thiết lập thuộc tính',
            params: {
                path: { name: 'Đường dẫn', placeholder: 'user.name' },
                value: { name: 'Giá trị mới' }
            },
            execute: (input, params) => {
                const newObj = JSON.parse(JSON.stringify(input)); // Deep copy
                setProperty(newObj, params.path, params.value);
                return newObj;
            }
        },
        has_property: {
            name: 'Kiểm tra có thuộc tính',
            params: { path: { name: 'Đường dẫn', placeholder: 'user.name' } },
            execute: (input, params) => getProperty(input, params.path) !== undefined
        }
    },
    json: {
        parse: { name: 'Phân tích (Parse)', execute: (input) => JSON.parse(input) },
        stringify: { name: 'Chuỗi hóa (Stringify)', params: { indent: { name: 'Thụt lề (indent)', type: 'number', placeholder: '2' } }, execute: (input, params) => JSON.stringify(input, null, parseInt(params.indent, 10) || undefined) },
        is_valid: {
            name: 'Kiểm tra JSON hợp lệ',
            execute: (input) => {
                if (typeof input === 'object') return true;
                try {
                    JSON.parse(input);
                    return true;
                } catch (e) {
                    return false;
                }
            }
        }
    }
};

// Helper for nested property access
const getProperty = (obj, path) => path.split('.').reduce((o, i) => (o && typeof o === 'object' && i in o) ? o[i] : undefined, obj);
// Helper for setting nested properties
const setProperty = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    // Attempt to parse value if it's a string that looks like a number or boolean
    let finalValue = value;
    if (typeof value === 'string') {
        if (!isNaN(value) && !isNaN(parseFloat(value))) {
            finalValue = parseFloat(value);
        } else if (value.toLowerCase() === 'true') {
            finalValue = true;
        } else if (value.toLowerCase() === 'false') {
            finalValue = false;
        }
    }
    current[keys[keys.length - 1]] = finalValue;
};


// --- CONFIGURATION ---
const workflowConfig = {
    nodeCategories: [
        {
            name: 'Actions',
            nodes: [
                {
                    type: 'http_request',
                    title: 'HTTP Request',
                    displayName: 'HTTP Request',
                    icon: '<i class="bi bi-globe"></i>',
                    outputs: ['success', 'error'],
                    defaultData: {
                        url: '', method: 'GET', timeout: 30000,
                        auth: { type: 'none', token: '', username: '', password: '' },
                        queryParams: [], headers: [],
                        body: { type: 'none', json: '', formUrlEncoded: [] }
                    },
                    settings: [
                        {
                            type: 'tabs',
                            tabs: [
                                {
                                    title: 'General',
                                    active: true,
                                    controls: [
                                        { type: 'text', label: 'URL', dataField: 'url', placeholder: 'https://api.example.com', variablePicker: true },
                                        { type: 'select', label: 'Method', dataField: 'method', options: [
                                            { value: 'GET', text: 'GET' }, { value: 'POST', text: 'POST' }, { value: 'PUT', text: 'PUT' }, { value: 'DELETE', text: 'DELETE' }, { value: 'PATCH', text: 'PATCH' }
                                        ]},
                                        { type: 'number', label: 'Timeout (ms)', dataField: 'timeout' },
                                        {
                                            type: 'button',
                                            text: '<i class="bi bi-clipboard-plus"></i> Import from cURL',
                                            action: 'import-curl',
                                            class: 'btn-outline-primary w-100 mt-2'
                                        }
                                    ]
                                },
                                {
                                    title: 'Auth',
                                    controls: [
                                        { type: 'select', label: 'Loại Xác thực', dataField: 'auth.type', onChange: 'rerender', options: [
                                            { value: 'none', text: 'Không' }, { value: 'bearer', text: 'Bearer Token' }, { value: 'basic', text: 'Basic Auth' }
                                        ]},
                                        { type: 'group', visibleWhen: { dataField: 'auth.type', is: 'bearer' }, controls: [
                                            { type: 'text', label: 'Token', dataField: 'auth.token', placeholder: 'eyJhbGciOi...' }
                                        ]},
                                        { type: 'group', visibleWhen: { dataField: 'auth.type', is: 'basic' }, controls: [
                                            { type: 'text', label: 'Username', dataField: 'auth.username' },
                                            { type: 'password', label: 'Password', dataField: 'auth.password' }
                                        ]}
                                    ]
                                },
                                {
                                    title: 'Params',
                                    controls: [
                                        {
                                            type: 'repeater',
                                            dataField: 'queryParams',
                                            addButtonText: '+ Thêm Query Param',
                                            fields: [
                                                { type: 'text', dataField: 'key', placeholder: 'Key' },
                                                { type: 'text', dataField: 'value', placeholder: 'Value', variablePicker: true }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    title: 'Headers',
                                    controls: [
                                        {
                                            type: 'repeater',
                                            dataField: 'headers',
                                            addButtonText: '+ Thêm Header',
                                            fields: [
                                                { type: 'text', dataField: 'key', placeholder: 'Key' },
                                                { type: 'text', dataField: 'value', placeholder: 'Value', variablePicker: true }
                                            ]
                                        }
                                    ]
                                },
                                {
                                    title: 'Body',
                                    controls: [
                                        { type: 'select', label: 'Loại Body', dataField: 'body.type', onChange: 'rerender', options: [
                                            { value: 'none', text: 'Không' }, { value: 'json', text: 'JSON (application/json)' }, { value: 'form-urlencoded', text: 'Form (x-www-form-urlencoded)' }
                                        ]},
                                        { type: 'group', visibleWhen: { dataField: 'body.type', is: 'json' }, controls: [
                                            { type: 'textarea', label: 'JSON', dataField: 'body.json', rows: 8, placeholder: '{ "key": "{{some_variable}}" }' }
                                        ]},
                                        { type: 'group', visibleWhen: { dataField: 'body.type', is: 'form-urlencoded' }, controls: [
                                            {
                                                type: 'repeater',
                                                dataField: 'body.formUrlEncoded',
                                                addButtonText: '+ Thêm trường Form',
                                                fields: [
                                                    { type: 'text', dataField: 'key', placeholder: 'Key' },
                                                    { type: 'text', dataField: 'value', placeholder: 'Value', variablePicker: true }
                                                ]
                                            }
                                        ]}
                                    ]
                                }
                            ]
                        }
                    ],
                    execute: async (data, logger) => {
                        const { url, method = 'GET', timeout = 30000, auth, queryParams, headers: customHeaders, body } = data;
                        if (!url) throw new Error('URL không được để trống.');

                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), parseInt(timeout, 10));

                        const finalUrl = new URL(url);
                        if (queryParams && Array.isArray(queryParams)) {
                            queryParams.forEach(p => { if (p.key) finalUrl.searchParams.append(p.key, p.value); });
                        }

                        const requestHeaders = new Headers();
                        if (customHeaders && Array.isArray(customHeaders)) {
                            customHeaders.forEach(h => { if (h.key) requestHeaders.append(h.key, h.value); });
                        }

                        if (auth && auth.type === 'bearer' && auth.token) requestHeaders.set('Authorization', `Bearer ${auth.token}`);
                        else if (auth && auth.type === 'basic' && auth.username) requestHeaders.set('Authorization', `Basic ${btoa(`${auth.username}:${auth.password || ''}`)}`);

                        const options = { method, signal: controller.signal, headers: requestHeaders };

                        if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
                            if (body && body.type === 'json' && body.json) {
                                options.body = body.json;
                                if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
                            } else if (body && body.type === 'form-urlencoded' && body.formUrlEncoded) {
                                const formBody = new URLSearchParams();
                                body.formUrlEncoded.forEach(p => { if (p.key) formBody.append(p.key, p.value); });
                                options.body = formBody;
                                if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
                            }
                        }

                        if (logger) logger.info(`=> ${method} ${finalUrl.toString()}`);
                        try {
                            const response = await fetch(finalUrl.toString(), options);
                            clearTimeout(timeoutId);

                            const responseHeaders = {};
                            response.headers.forEach((value, key) => { responseHeaders[key] = value; });

                            const contentType = response.headers.get('content-type');
                            let responseBody;
                            try {
                                if (contentType && contentType.includes('application/json')) {
                                    responseBody = await response.json();
                                } else {
                                    responseBody = await response.text();
                                }
                            } catch (e) {
                                responseBody = await response.text(); // Fallback to text if JSON parsing fails
                            }

                            const result = { statusCode: response.status, ok: response.ok, headers: responseHeaders, body: responseBody };

                            if (!response.ok) {
                                if (logger) logger.error(`<= ${response.status} ${response.statusText}`);
                                throw Object.assign(new Error(`Request failed with status ${response.status}`), { context: result });
                            }

                            if (logger) logger.success(`<= ${response.status} ${response.statusText}`);
                            return result;
                        } catch (error) {
                            clearTimeout(timeoutId);
                            if (error.name === 'AbortError') {
                                throw new Error(`Request timed out after ${timeout}ms.`);
                            }
                            throw error;
                        }
                    }
                },
                {
                    type: 'send_email',
                    title: 'Gửi Email',
                    displayName: 'Gửi Email',
                    icon: '<i class="bi bi-envelope"></i>',
                    outputs: ['success', 'error'],
                    defaultData: { subject: 'Thông báo quan trọng', recipient: '' },
                    settings: [
                        { type: 'text', label: 'Chủ đề', dataField: 'subject', variablePicker: true },
                        { type: 'text', label: 'Người nhận', dataField: 'recipient', variablePicker: true }
                    ],
                    execute: (data, logger) => new Promise((resolve, reject) => {
                        if (logger) logger.info(`Đang gửi email tới ${data.recipient} với chủ đề "${data.subject}"`);
                        setTimeout(() => {
                            if (!data || !data.recipient || !data.recipient.includes('@')) {
                                reject(new Error('Email người nhận không hợp lệ.'));
                                return;
                            }
                            const result = { status: 'sent', recipient: data.recipient, subject: data.subject, timestamp: new Date().toISOString() };
                            if (logger) logger.success(`Đã gửi email thành công tới ${data.recipient}`);
                            resolve(result);
                        }, 1500);
                    })
                },
                {
                    type: 'log_message',
                    title: 'Log Message',
                    displayName: 'Log Message',
                    icon: '<i class="bi bi-chat-left-text"></i>',
                    outputs: ['success'],
                    defaultData: { message: 'Hello from workflow!', level: 'info' },
                    settings: [
                        { type: 'textarea', label: 'Nội dung', dataField: 'message', rows: 3, variablePicker: true },
                        { type: 'select', label: 'Cấp độ Log', dataField: 'level', options: [
                            { value: 'info', text: 'Info' }, { value: 'success', text: 'Success' }, { value: 'error', text: 'Error' }
                        ]}
                    ],
                    execute: (data, logger) => {
                        const { message, level } = data;
                        if (logger && logger[level]) {
                            logger[level](message);
                        } else if (logger) {
                            logger.info(message);
                        }
                        return { logged: true, level, message };
                    }
                },
                {
                    type: 'execute_command',
                    title: 'Chạy Lệnh',
                    displayName: 'Chạy Lệnh',
                    icon: '<i class="bi bi-terminal"></i>',
                    outputs: ['success', 'error'],
                    defaultData: { command: '' },
                    settings: [
                        { type: 'textarea', label: 'Lệnh cần chạy', dataField: 'command', rows: 4, placeholder: 'ví dụ: node --version' }
                    ],
                    execute: (data, logger) => new Promise((resolve, reject) => {
                        const { exec } = require('child_process');
                        const { command } = data;

                        if (!command) {
                            return reject(new Error('Lệnh không được để trống.'));
                        }

                        if (logger) logger.info(`=> Đang chạy lệnh: ${command}`);

                        exec(command, (error, stdout, stderr) => {
                            if (error) {
                                if (logger) logger.error(`Lỗi khi chạy lệnh: ${error.message}`);
                                return reject(Object.assign(new Error(error.message), { context: { stderr, stdout } }));
                            }
                            if (stderr) {
                                if (logger) logger.info(`Stderr: ${stderr}`);
                            }

                            if (logger) logger.success(`Lệnh thực thi thành công.`);
                            resolve({ stdout, stderr });
                        });
                    })
                }
            ]
        },
        {
            name: 'File System',
            nodes: [
                {
                    type: 'read_file',
                    title: 'Đọc File',
                    displayName: 'Đọc File',
                    icon: '<i class="bi bi-file-earmark-text"></i>',
                    outputs: ['success', 'error'],
                    defaultData: { filePath: '', encoding: 'utf8' },
                    settings: [
                        { type: 'file-select', label: 'Đường dẫn File', dataField: 'filePath' },
                        { type: 'select', label: 'Encoding', dataField: 'encoding', options: [
                            { value: 'utf8', text: 'UTF-8' }, { value: 'ascii', text: 'ASCII' }, { value: 'utf16le', text: 'UTF-16 LE' }, { value: 'base64', text: 'Base64' }
                        ]}
                    ],
                    execute: (data, logger) => {
                        const fs = require('fs').promises;
                        const { filePath, encoding } = data;
                        if (!filePath) throw new Error('Đường dẫn file không được để trống.');
                        if (logger) logger.info(`Đang đọc file: ${filePath}`);
                        return fs.readFile(filePath, encoding)
                            .then(content => {
                                if (logger) logger.success(`Đọc file thành công.`);
                                return { content };
                            })
                            .catch(err => {
                                throw new Error(err.message);
                            });
                    }
                },
                {
                    type: 'write_file',
                    title: 'Ghi File',
                    displayName: 'Ghi File',
                    icon: '<i class="bi bi-file-earmark-plus"></i>',
                    outputs: ['success', 'error'],
                    defaultData: { folderPath: '', fileName: 'output.txt', content: '', writeMode: 'overwrite' },
                    settings: [
                        { type: 'folder-select', label: 'Thư mục Lưu trữ', dataField: 'folderPath' },
                        { type: 'text', label: 'Tên File', dataField: 'fileName', placeholder: 'output.txt', variablePicker: true },
                        { type: 'textarea', label: 'Nội dung', dataField: 'content', rows: 5, variablePicker: true },
                        { type: 'select', label: 'Chế độ ghi', dataField: 'writeMode', options: [
                            { value: 'overwrite', text: 'Ghi đè (Overwrite)' }, { value: 'append', text: 'Ghi nối (Append)' }
                        ]}
                    ],
                    execute: (data, logger) => {
                        const fs = require('fs').promises;
                        const path = require('path');
                        const { folderPath, fileName, content, writeMode } = data;
                        if (!folderPath) throw new Error('Thư mục lưu trữ không được để trống.');
                        if (!fileName) throw new Error('Tên file không được để trống.');

                        const finalPath = path.join(folderPath, fileName);
                        const operation = writeMode === 'append' ? fs.appendFile : fs.writeFile;
                        const actionText = writeMode === 'append' ? 'nối vào' : 'ghi vào';

                        if (logger) logger.info(`Đang ${actionText} file: ${finalPath}`);
                        return operation(finalPath, content, 'utf8')
                            .then(() => {
                                if (logger) logger.success(`Ghi file thành công.`);
                                return { success: true, path: finalPath };
                            })
                            .catch(err => {
                                throw new Error(err.message);
                            });
                    }
                }
            ]
        },
        {
            name: 'Data',
            nodes: [
                {
                    type: 'html_extractor',
                    title: 'Trích xuất HTML',
                    displayName: 'Trích xuất HTML',
                    icon: '<i class="bi bi-magnet"></i>',
                    outputs: ['success', 'error'],
                    defaultData: {
                        htmlContent: '',
                        extractions: [
                            { key: 'title', selector: 'h1', attribute: '', extractType: 'single' }
                        ]
                    },
                    settings: [
                        { type: 'textarea', label: 'Nội dung HTML', dataField: 'htmlContent', rows: 6, variablePicker: true },
                        { type: 'info', text: 'Dùng CSS Selector để trích xuất dữ liệu. Nếu "Thuộc tính" để trống, sẽ lấy text bên trong.' },
                        {
                            type: 'repeater',
                            dataField: 'extractions',
                            addButtonText: '<i class="bi bi-plus-lg"></i> Thêm trường trích xuất',
                            fields: [
                                { type: 'text', dataField: 'key', placeholder: 'Key' },
                                { type: 'text', dataField: 'selector', placeholder: 'CSS Selector' },
                                { type: 'text', dataField: 'attribute', placeholder: 'Thuộc tính' },
                                {
                                    type: 'select',
                                    dataField: 'extractType',
                                    options: [
                                        { value: 'single', text: 'Một' },
                                        { value: 'multiple', text: 'Nhiều' }
                                    ]
                                }
                            ]
                        }
                    ],
                    execute: (data, logger) => {
                        const { htmlContent, extractions } = data;
                        if (!htmlContent) throw new Error('Nội dung HTML không được để trống.');

                        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
                        const results = {};

                        if (logger) logger.info(`Bắt đầu trích xuất từ HTML...`);

                        extractions.forEach(ext => {
                            if (!ext.key || !ext.selector) return;

                            try {
                                if (ext.extractType === 'multiple') {
                                    const elements = doc.querySelectorAll(ext.selector);
                                    results[ext.key] = Array.from(elements).map(el => {
                                        return ext.attribute ? el.getAttribute(ext.attribute) : el.textContent.trim();
                                    });
                                } else { // 'single'
                                    const element = doc.querySelector(ext.selector);
                                    results[ext.key] = element ? (ext.attribute ? element.getAttribute(ext.attribute) : element.textContent.trim()) : null;
                                }
                            } catch (e) {
                                if(logger) logger.error(`Lỗi với selector "${ext.selector}": ${e.message}`);
                                results[ext.key] = { error: `Invalid selector: ${e.message}` };
                            }
                        });

                        if (logger) logger.success(`Trích xuất HTML hoàn tất.`);
                        return results;
                    }
                },
                {
                    type: 'generate_data',
                    title: 'Tạo Dữ liệu',
                    displayName: 'Tạo Dữ liệu',
                    icon: '<i class="bi bi-magic"></i>',
                    outputs: ['success', 'error'],
                    defaultData: {
                        generationType: 'string.uuid',
                        locale: 'en', // *** NEW: Default locale
                        min: 0, max: 100,
                        length: 16,
                        jsonStructure: [
                            { key: 'id', type: 'string.uuid' },
                            { key: 'user', type: 'object', children: [
                                { key: 'name', type: 'person.fullName' },
                                { key: 'email', type: 'internet.email' }
                            ]}
                        ]
                    },
                    settings: [
                        { // *** NEW: Locale selector
                            type: 'select',
                            label: 'Ngôn ngữ (Locale)',
                            dataField: 'locale',
                            options: [
                                { value: 'vi', text: 'Vietnamese (vi)' },
                                { value: 'en', text: 'English (en)' },
                                { value: 'de', text: 'German (de)' },
                                { value: 'ja', text: 'Japanese (ja)' },
                                { value: 'fr', text: 'French (fr)' },
                                { value: 'es', text: 'Spanish (es)' },
                                { value: 'ru', text: 'Russian (ru)' },
                            ]
                        },
                        {
                            type: 'select',
                            label: 'Loại dữ liệu',
                            dataField: 'generationType',
                            onChange: 'rerender',
                            optionGroups: [
                                { label: 'Chuỗi & Số', options: [
                                    { value: 'string.uuid', text: 'UUID' },
                                    { value: 'string.alphanumeric', text: 'Chuỗi chữ và số' },
                                    { value: 'string.hexadecimal', text: 'Chuỗi Hex' },
                                    { value: 'number.int', text: 'Số nguyên ngẫu nhiên' },
                                    { value: 'number.float', text: 'Số thực ngẫu nhiên' },
                                ]},
                                { label: 'Người dùng (Person)', options: [
                                    { value: 'person.fullName', text: 'Họ và Tên' }, { value: 'person.firstName', text: 'Tên' },
                                    { value: 'person.lastName', text: 'Họ' }, { value: 'person.jobTitle', text: 'Chức danh' },
                                    { value: 'person.gender', text: 'Giới tính' }, { value: 'person.bio', text: 'Tiểu sử' },
                                ]},
                                { label: 'Địa chỉ (Location)', options: [
                                    { value: 'location.streetAddress', text: 'Địa chỉ đường' }, { value: 'location.city', text: 'Thành phố' },
                                    { value: 'location.state', text: 'Tiểu bang' }, { value: 'location.zipCode', text: 'Mã bưu điện' },
                                    { value: 'location.country', text: 'Quốc gia' }, { value: 'location.latitude', text: 'Vĩ độ' },
                                    { value: 'location.longitude', text: 'Kinh độ' },
                                ]},
                                { label: 'Internet', options: [
                                    { value: 'internet.email', text: 'Email' }, { value: 'internet.userName', text: 'Tên người dùng' },
                                    { value: 'internet.url', text: 'URL' }, { value: 'internet.domainName', text: 'Tên miền' },
                                    { value: 'internet.ip', text: 'Địa chỉ IP' }, { value: 'internet.mac', text: 'Địa chỉ MAC' },
                                    { value: 'internet.password', text: 'Mật khẩu' }, { value: 'internet.userAgent', text: 'User Agent' },
                                ]},
                                 { label: 'Tài chính (Finance)', options: [
                                    { value: 'finance.accountNumber', text: 'Số tài khoản' }, { value: 'finance.amount', text: 'Số tiền' },
                                    { value: 'finance.currencyName', text: 'Tên tiền tệ' }, { value: 'finance.currencyCode', text: 'Mã tiền tệ' },
                                    { value: 'finance.creditCardNumber', text: 'Số thẻ tín dụng' }, { value: 'finance.bic', text: 'Mã BIC' },
                                ]},
                                { label: 'Công ty (Company)', options: [
                                    { value: 'company.name', text: 'Tên công ty' }, { value: 'company.buzzPhrase', text: 'Khẩu hiệu' },
                                ]},
                                { label: 'Điện thoại (Phone)', options: [
                                    { value: 'phone.number', text: 'Số điện thoại' },
                                ]},
                                { label: 'Dữ liệu có cấu trúc', options: [{ value: 'structured_json', text: 'JSON có cấu trúc' }] }
                            ]
                        },
                        { type: 'group', visibleWhen: { dataField: 'generationType', is: 'number.int' }, controls: [
                            { type: 'number', label: 'Tối thiểu', dataField: 'min', col: 6 },
                            { type: 'number', label: 'Tối đa', dataField: 'max', col: 6 }
                        ]},
                        { type: 'group', visibleWhen: { dataField: 'generationType', is: 'number.float' }, controls: [
                            { type: 'number', label: 'Tối thiểu', dataField: 'min', col: 4 },
                            { type: 'number', label: 'Tối đa', dataField: 'max', col: 4 },
                            { type: 'number', label: 'Số thập phân', dataField: 'precision', col: 4, placeholder: '2' }
                        ]},
                        { type: 'group', visibleWhen: { dataField: 'generationType', is: 'string.alphanumeric' }, controls: [
                            { type: 'number', label: 'Độ dài', dataField: 'length', col: 12 },
                        ]},
                         { type: 'group', visibleWhen: { dataField: 'generationType', is: 'internet.password' }, controls: [
                            { type: 'number', label: 'Độ dài', dataField: 'length', col: 12 },
                        ]},
                        { type: 'group', visibleWhen: { dataField: 'generationType', is: 'structured_json' }, controls: [
                            { type: 'json-builder', dataField: 'jsonStructure' }
                        ]},
                        { type: 'group', controls: [
                            { type: 'button', text: '<i class="bi bi-play-circle"></i> Test', action: 'test-data-generation', class: 'btn-info text-white' },
                            { type: 'output-display', label: 'Kết quả Test:', ref: 'test-output-container' }
                        ]}
                    ],
                    execute: (data, logger, context) => {
                        // *** UPDATED: Logic for localization
                        const { Faker, allLocales } = require('@faker-js/faker');
                        const { generationType, locale = 'en' } = data;

                        if (logger) logger.info(`Đang tạo dữ liệu loại: ${generationType} với ngôn ngữ: ${locale}`);
                        
                        // Initialize Faker with the selected locale, and English as a fallback
                        const faker = new Faker({
                            locale: [allLocales[locale], allLocales.en],
                        });
                        
                        const _generateSingleValue = (type, params) => {
                            const [module, method] = type.split('.');
                            if (!module || !method || !faker[module] || !faker[module][method]) {
                                throw new Error(`Loại dữ liệu không xác định hoặc không hợp lệ: ${type}`);
                            }

                            // Handle methods with specific options from our UI
                            if (type === 'number.int' || type === 'number.float') {
                                return faker.number[method]({ min: params.min, max: params.max, precision: params.precision });
                            }
                            if (type === 'string.alphanumeric' || type === 'internet.password') {
                                return faker[module][method](params.length);
                            }

                            // Default call for methods without parameters
                            return faker[module][method]();
                        };

                        const _buildObjectRecursively = (structure, params) => {
                            const output = {};
                            if (!Array.isArray(structure)) return output;

                            for (const item of structure) {
                                if (item.key && item.type) {
                                    if (item.type === 'object') {
                                        output[item.key] = _buildObjectRecursively(item.children, params);
                                    } else {
                                        output[item.key] = _generateSingleValue(item.type, params);
                                    }
                                }
                            }
                            return output;
                        };

                        if (generationType === 'structured_json') {
                            const result = _buildObjectRecursively(data.jsonStructure, data);
                            if (logger) logger.success(`Đã tạo JSON có cấu trúc thành công.`);
                            return { result };
                        } else {
                            const result = _generateSingleValue(generationType, data);
                            if (logger) logger.success(`Đã tạo dữ liệu thành công.`);
                            return { result };
                        }
                    }
                }
            ]
        },
        {
            name: 'Logic',
            nodes: [
                {
                    type: 'condition',
                    title: 'Điều kiện',
                    displayName: 'Điều kiện (If)',
                    icon: '<i class="bi bi-sign-split"></i>',
                    outputs: ['true', 'false'],
                    defaultData: {
                        conditionGroups: [
                            [ // Group 1 (OR)
                                { inputValue: '', operator: '==', comparisonValue: '' } // Condition 1.1 (AND)
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
                },
                {
                    type: 'loop',
                    title: 'Vòng lặp',
                    displayName: 'Vòng lặp (Loop)',
                    icon: '<i class="bi bi-arrow-repeat"></i>',
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
                },
                {
                    type: 'data_processing',
                    title: 'Xử lý Dữ liệu',
                    displayName: 'Xử lý Dữ liệu',
                    icon: '<i class="bi bi-code-slash"></i>',
                    outputs: ['success', 'error'],
                    defaultData: {
                        input: '',
                        operation: '',
                        params: {}
                    },
                    settings: [
                        { type: 'text', label: 'Giá trị đầu vào', dataField: 'input', placeholder: '{{some_node.output}}', variablePicker: true },
                        { type: 'select', label: 'Thao tác', dataField: 'operation', onChange: 'rerender',
                            optionGroups: [
                                { label: 'String', options: Object.keys(DATA_OPERATIONS.string).map(k => ({ value: `string.${k}`, text: DATA_OPERATIONS.string[k].name })) },
                                { label: 'Number', options: Object.keys(DATA_OPERATIONS.number).map(k => ({ value: `number.${k}`, text: DATA_OPERATIONS.number[k].name })) },
                                { label: 'Array', options: Object.keys(DATA_OPERATIONS.array).map(k => ({ value: `array.${k}`, text: DATA_OPERATIONS.array[k].name })) },
                                { label: 'Object', options: Object.keys(DATA_OPERATIONS.object).map(k => ({ value: `object.${k}`, text: DATA_OPERATIONS.object[k].name })) },
                                { label: 'JSON', options: Object.keys(DATA_OPERATIONS.json).map(k => ({ value: `json.${k}`, text: DATA_OPERATIONS.json[k].name })) },
                            ]
                        },
                        { type: 'group', dataField: 'params', visibleWhen: { dataField: 'operation', is: 'string.replace' }, controls: [
                            { type: 'text', label: 'Tìm kiếm', dataField: 'params.find', variablePicker: true }, { type: 'text', label: 'Thay thế bằng', dataField: 'params.replaceWith', variablePicker: true }
                        ]},
                        { type: 'group', dataField: 'params', visibleWhen: { dataField: 'operation', is: 'string.split' }, controls: [
                            { type: 'text', label: 'Ký tự phân cách', dataField: 'params.delimiter', variablePicker: true }
                        ]},
                        { type: 'group', dataField: 'params', visibleWhen: { dataField: 'operation', is: 'string.substring' }, controls: [
                            { type: 'number', label: 'Bắt đầu', dataField: 'params.start', variablePicker: true }, { type: 'number', label: 'Kết thúc', dataField: 'params.end', variablePicker: true }
                        ]},
                        { type: 'group', controls: [
                            { type: 'button', text: '<i class="bi bi-play-circle"></i> Test Thao tác', action: 'test-operation', class: 'btn-info text-white' },
                            { type: 'output-display', label: 'Kết quả Test:', ref: 'test-output-container' }
                        ]}
                    ],
                    execute: (data, logger) => {
                        const { input, operation, params } = data;
                        if (!operation) {
                            throw new Error("Vui lòng chọn một thao tác.");
                        }
                        const [operationType, operationKey] = operation.split('.');
                        const opConfig = DATA_OPERATIONS[operationType]?.[operationKey];

                        if (!opConfig || typeof opConfig.execute !== 'function') {
                            throw new Error(`Thao tác không hợp lệ: ${operation}`);
                        }

                        if (logger) logger.info(`Đang thực hiện ${opConfig.name} trên đầu vào.`);

                        let processedInput = input;
                        if (operationType !== 'json' && typeof input === 'string') {
                            try {
                                processedInput = JSON.parse(input);
                            } catch (e) {
                                // It's just a string, which is fine for string operations.
                            }
                        }

                        const result = opConfig.execute(processedInput, params);
                        if (logger) logger.success(`Xử lý dữ liệu thành công.`);
                        return { result };
                    }
                },
                {
                    type: 'try_catch',
                    title: 'Try / Catch',
                    displayName: 'Try / Catch',
                    icon: '<i class="bi bi-shield-shaded"></i>',
                    outputs: ['try', 'catch'],
                    defaultData: {},
                    settings: [
                        { type: 'info', text: "Thực thi các khối trong nhánh 'try'. Nếu có lỗi xảy ra, luồng sẽ chuyển sang nhánh 'catch'." }
                    ],
                    execute: () => {
                        return { selectedPort: 'try', data: { status: 'initiated' } };
                    }
                },
                {
                    type: 'delay',
                    title: 'Delay',
                    displayName: 'Delay',
                    icon: '<i class="bi bi-clock-history"></i>',
                    outputs: ['success'],
                    defaultData: { delay: 1000 },
                    settings: [
                        { type: 'number', label: 'Thời gian chờ (ms)', dataField: 'delay' }
                    ],
                    execute: (data, logger) => new Promise(resolve => {
                        const delayMs = parseInt(data.delay, 10) || 0;
                        if (logger) logger.info(`Đang chờ trong ${delayMs}ms...`);
                        setTimeout(() => {
                            if (logger) logger.success(`Đã chờ xong.`);
                            resolve({ delayedFor: delayMs });
                        }, delayMs);
                    })
                },
                {
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
                        context._updateVariablesPanel(); // Update UI
                        return { variablesSet: setVariables };
                    }
                }
            ]
        }
    ]
};

// --- DÀNH CHO NODE.JS ---
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        workflowConfig,
        DATA_OPERATIONS,
        getProperty,
        setProperty
    };
}