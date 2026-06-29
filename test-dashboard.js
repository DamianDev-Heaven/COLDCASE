const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('simulador/src/dashboard-template.js', 'utf8');
const dom = new JSDOM(`<!DOCTYPE html><html><head>${html}</head><body></body></html>`, { runScripts: "dangerously" });
const window = dom.window;
// let's see if it parses correctly!
console.log("Parsed!");
