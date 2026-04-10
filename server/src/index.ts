import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { startEmailPolling } from './services/emailAutomation';
import { runMigrations } from './db/migrate';
import { runSeed } from './db/seed';

// Route imports
import authRoutes from './routes/auth';
import boardRoutes from './routes/boards';
import listRoutes from './routes/lists';
import cardRoutes from './routes/cards';
import labelRoutes from './routes/labels';
import checklistRoutes from './routes/checklists';
import emailRuleRoutes from './routes/emailRules';
import userRoutes from './routes/users';

const app = express();

// Trust Railway/Azure/Cloudflare proxy so express-rate-limit can read the
// real client IP from the X-Forwarded-For header instead of throwing an error.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
}));

app.use(cors({
  origin: config.nodeEnv === 'production'
    ? config.clientUrl
    : [config.clientUrl, 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Auth endpoints get stricter rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.resolve(config.upload.dir)));

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/email-rules', emailRuleRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (config.nodeEnv === 'production') {
  const clientBuildPath = path.resolve(__dirname, '../../client/build');
  app.use(express.static(clientBuildPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handling (must be last)
app.use(errorHandler);

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function start() {
  // Run migrations + seed on every startup (both are idempotent / no-op if
  // the schema / data already exist, so this is safe in production).
  console.log('Running database migrations...');
  await runMigrations();

  console.log('Checking database seed...');
  await runSeed();

  app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║   FHE Project Board Server                       ║
║   Running on port ${config.port}                          ║
║   Environment: ${config.nodeEnv}                    ║
╚══════════════════════════════════════════════════╝
    `);

    startEmailPolling();
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
