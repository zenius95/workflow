module.exports = {
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
};