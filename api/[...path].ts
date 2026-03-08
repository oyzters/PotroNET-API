import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '../server/lib/cors';

// Route imports
import { login, register, me } from '../server/routes/auth';
import { listCareers } from '../server/routes/careers';
import { friendsIndex, friendById } from '../server/routes/friends';
import { messagesIndex, messagesByUser } from '../server/routes/messages';
import { notificationsIndex } from '../server/routes/notifications';
import { professorsList, professorById, professorRequests, professorReviews } from '../server/routes/professors';
import { profilesList, profileById } from '../server/routes/profiles';
import { publicationsIndex, publicationById, publicationLike } from '../server/routes/publications';
import { reportsIndex } from '../server/routes/reports';
import { resourcesIndex } from '../server/routes/resources';
import { searchAll } from '../server/routes/search';
import { subjectsIndex, subjectsUser } from '../server/routes/subjects';
import { tutoringIndex, tutoringRequests } from '../server/routes/tutoring';
import { adminStats, adminUsers, adminReports, adminPublications, adminProfessorRequests, adminNotifications, adminSubjects } from '../server/routes/admin';

// Health check handler
function health(_req: VercelRequest, res: VercelResponse) {
    res.status(200).json({
        status: 'ok', service: 'PotroNET API',
        version: '1.0.0', timestamp: new Date().toISOString(),
    });
}

// Route definitions: [pattern, handler]
// Patterns with :param are matched dynamically
type Handler = (req: VercelRequest, res: VercelResponse, ...args: string[]) => Promise<VercelResponse | void> | VercelResponse | void;

interface Route {
    pattern: string[];
    handler: Handler;
}

const routes: Route[] = [
    // Health
    { pattern: ['health'], handler: health },

    // Auth
    { pattern: ['auth', 'login'], handler: login },
    { pattern: ['auth', 'register'], handler: register },
    { pattern: ['auth', 'me'], handler: me },

    // Careers
    { pattern: ['careers'], handler: listCareers },

    // Friends
    { pattern: ['friends'], handler: friendsIndex },
    { pattern: ['friends', ':id'], handler: friendById },

    // Messages
    { pattern: ['messages'], handler: messagesIndex },
    { pattern: ['messages', ':userId'], handler: messagesByUser },

    // Notifications
    { pattern: ['notifications'], handler: notificationsIndex },

    // Professors (specific routes before parameterized)
    { pattern: ['professors', 'requests'], handler: professorRequests },
    { pattern: ['professors', 'reviews'], handler: professorReviews },
    { pattern: ['professors'], handler: professorsList },
    { pattern: ['professors', ':id'], handler: professorById },

    // Profiles
    { pattern: ['profiles'], handler: profilesList },
    { pattern: ['profiles', ':id'], handler: profileById },

    // Publications (specific routes before parameterized)
    { pattern: ['publications', ':id', 'likes'], handler: publicationLike },
    { pattern: ['publications'], handler: publicationsIndex },
    { pattern: ['publications', ':id'], handler: publicationById },

    // Reports
    { pattern: ['reports'], handler: reportsIndex },

    // Resources
    { pattern: ['resources'], handler: resourcesIndex },

    // Search
    { pattern: ['search'], handler: searchAll },

    // Subjects
    { pattern: ['subjects', 'user'], handler: subjectsUser },
    { pattern: ['subjects'], handler: subjectsIndex },

    // Tutoring
    { pattern: ['tutoring', 'requests'], handler: tutoringRequests },
    { pattern: ['tutoring'], handler: tutoringIndex },

    // Admin
    { pattern: ['admin', 'stats'], handler: adminStats },
    { pattern: ['admin', 'users'], handler: adminUsers },
    { pattern: ['admin', 'reports'], handler: adminReports },
    { pattern: ['admin', 'publications'], handler: adminPublications },
    { pattern: ['admin', 'professor-requests'], handler: adminProfessorRequests },
    { pattern: ['admin', 'notifications'], handler: adminNotifications },
    { pattern: ['admin', 'subjects'], handler: adminSubjects },
];

function matchRoute(pathSegments: string[]): { handler: Handler; params: string[] } | null {
    for (const route of routes) {
        if (route.pattern.length !== pathSegments.length) continue;

        let match = true;
        const params: string[] = [];

        for (let i = 0; i < route.pattern.length; i++) {
            if (route.pattern[i].startsWith(':')) {
                params.push(pathSegments[i]);
            } else if (route.pattern[i] !== pathSegments[i]) {
                match = false;
                break;
            }
        }

        if (match) return { handler: route.handler, params };
    }

    return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Handle CORS
    if (cors(req, res)) return;

    // Extract path segments from the catch-all query
    let pathSegments: string[] = [];
    if (Array.isArray(req.query.path)) {
        pathSegments = req.query.path;
    } else if (typeof req.query.path === 'string') {
        pathSegments = req.query.path.split('/').filter(Boolean);
    } else if (req.url) {
        // Fallback to parsing req.url if req.query.path is missing
        pathSegments = req.url.split('?')[0].replace(/^\/api\/?/, '').split('/').filter(Boolean);
    }

    // Always ensure query parameters from req.url are explicitly merged into req.query
    // Vercel rewrites sometimes discard the native req.query when using [...path]
    if (req.url && req.url.includes('?')) {
        try {
            const urlObj = new URL(`http://localhost${req.url}`);
            urlObj.searchParams.forEach((val, key) => {
                if (key !== 'path' && req.query[key] === undefined) {
                    req.query[key] = val;
                }
            });
        } catch { /* ignore fallback errors */ }
    }

    // Find matching route
    const matched = matchRoute(pathSegments);

    if (!matched) {
        return res.status(404).json({
            error: 'Endpoint not found',
            path: `/api/${pathSegments.join('/')}`,
            debug_query: req.query,
            debug_url: req.url
        });
    }

    try {
        await matched.handler(req, res, ...matched.params);
    } catch (err) {
        console.error(`Error in /api/${pathSegments.join('/')}:`, err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}
