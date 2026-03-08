// Local development server - replaces `vercel dev`
const express = require('express');
const path = require('path');
const fs = require('fs');

// Load .env
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

// Register ts-node before loading any TS files
require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
        module: 'commonjs',
        target: 'es2020',
        esModuleInterop: true,
        moduleResolution: 'node',
    },
});

console.log('\n🐎 PotroNET API Dev Server\n');

try {
    const handler = require('./api/[...path].ts').default;

    app.all('/api/*', (req, res) => {
        // Mock the [...path] query array that Vercel usually provides
        const pathPart = req.params[0];
        const segments = pathPart ? pathPart.split('/').filter(Boolean) : [];

        // Pass to standard handler proxy to allow query modification if needed
        const reqProxy = new Proxy(req, {
            get(target, prop) {
                if (prop === 'query') {
                    return { ...target.query, path: segments };
                }
                const val = target[prop];
                if (typeof val === 'function') return val.bind(target);
                return val;
            },
        });

        handler(reqProxy, res);
    });

    app.all('/api', (req, res) => {
        const reqProxy = new Proxy(req, {
            get(target, prop) {
                if (prop === 'query') return { ...target.query, path: [] };
                const val = target[prop];
                if (typeof val === 'function') return val.bind(target);
                return val;
            },
        });
        handler(reqProxy, res);
    });

    console.log('  ✓ Catch-all endpoint registered for /api/*');

    app.listen(PORT, () => {
        console.log(`\n🚀 API running at http://localhost:${PORT}/api\n`);
    });
} catch (err) {
    console.error(`Failed to load handler: ${err.message}`);
}
