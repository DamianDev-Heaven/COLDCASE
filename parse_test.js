const fs = require('fs');
const html = require('./simulador/src/dashboard-template.js').renderDashboardPage();
const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
const lastScript = scripts[scripts.length - 1].replace(/<script>|<\/script>/g, '');
fs.writeFileSync('/tmp/js_test.js', lastScript);
