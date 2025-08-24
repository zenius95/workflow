/** * Logger class to handle displaying messages in the application's console panel. 
 */
class Logger {
    constructor(outputElement) {
        this.output = outputElement;
        if (!this.output) {
            console.error("Logger output element not found! Falling back to devtools console.");
            this.log = console.log; // Fallback 
            return;
        }
    }

    _log(message, type = 'info') {
        // Allow system messages to be logged to the UI console as well.
        // console.log(`[SYSTEM] ${message}`); // Keep this for devtools console if desired

        const timestamp = new Date().toLocaleTimeString('en-GB');
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        let finalMessage = message;
        if (typeof message === 'object') {
            finalMessage = JSON.stringify(message, null, 2);
        }

        logEntry.innerHTML = `<span class="log-timestamp">${timestamp}</span><pre class="log-content ${type} d-inline">${finalMessage}</pre>`;
        this.output.appendChild(logEntry);
        this.output.scrollTop = this.output.scrollHeight;
    }

    info(message) { this._log(message, 'info'); }
    success(message) { this._log(message, 'success'); }
    error(message) { this._log(message, 'error'); }
    system(message) { this._log(message, 'system'); }
    clear() { this.output.innerHTML = ''; }
}
