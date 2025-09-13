// Frontend routes configuration
import express from 'express';
import path from 'path';\nimport rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();\n.use(limiter);

// Serve static files from the frontend build directory
router.use(express.static(path.join(__dirname, '../../dist')));

// API routes
router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/api/config', (req, res) => {
  res.json({ 
    appName: 'Travel AI Platform',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Catch-all handler: send back React's index.html file for SPA routing
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

export const frontendRoutes = router;
export default router;