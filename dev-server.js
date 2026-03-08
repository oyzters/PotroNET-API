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

// Collect all routes first, then register in correct order
const routes = [];

function collectRoutes(dir, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            collectRoutes(fullPath, `${prefix}/${entry.name}`);
            continue;
        }

        if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;

        let routePath = entry.name
            .replace(/\.ts$/, '')
            .replace(/\.js$/, '');

        // Handle [param] -> :param
        const hasParam = routePath.includes('[');
        routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');

        // Handle index files
        if (routePath === 'index') {
            routePath = '';
        }

        const expressPath = `/api${prefix}${routePath ? '/' + routePath : ''}`;

        routes.push({ expressPath, fullPath, hasParam });
    }
}

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
console.log('Loading routes:');

collectRoutes(path.join(__dirname, 'api'));

// Sort: static/specific routes first, parameterized routes last
routes.sort((a, b) => {
    if (a.hasParam !== b.hasParam) return a.hasParam ? 1 : -1;
    const aSegs = a.expressPath.split('/').length;
    const bSegs = b.expressPath.split('/').length;
    if (bSegs !== aSegs) return bSegs - aSegs;
    return a.expressPath.localeCompare(b.expressPath);
});

for (const route of routes) {
    try {
        const handler = require(route.fullPath).default;
        if (typeof handler === 'function') {
            app.all(route.expressPath, (req, res) => {
                // Express req.query is a getter in Express 5+ and cannot be reassigned.
                // Vercel handlers read params from req.query, so we use a Proxy
                // to intercept property access and merge params into query.
                const originalQuery = req.query || {};
                const mergedData = { ...originalQuery, ...req.params };

                const queryProxy = new Proxy(mergedData, {
                    get(target, prop) {
                        return target[prop];
                    },
                    has(target, prop) {
                        return prop in target;
                    },
                });

                // Create a proxy for req that overrides query
                const reqProxy = new Proxy(req, {
                    get(target, prop) {
                        if (prop === 'query') return queryProxy;
                        const val = target[prop];
                        if (typeof val === 'function') return val.bind(target);
                        return val;
                    },
                });

                handler(reqProxy, res);
            });
            console.log(`  ✓ ${route.expressPath}${route.hasParam ? ' (param)' : ''}`);
        }
    } catch (err) {
        console.error(`  ✗ ${route.expressPath}: ${err.message}`);
    }
}

app.listen(PORT, () => {
    console.log(`\n🚀 API running at http://localhost:${PORT}/api\n`);
});
