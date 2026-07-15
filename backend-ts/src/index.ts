import express from 'express';
import cors from 'cors';
import { getSettings } from './config';
import { getRagEngine } from './ragEngine';
import chatRouter from './routes/chat';
import knowledgeRouter from './routes/knowledge';

const settings = getSettings();

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: settings.corsOriginsList,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body parser ─────────────────────────────────────────────────────────
app.use(express.json());

// ── Health checks ───────────────────────────────────────────────────────
const healthResponse = () => {
  const mode =
    settings.DEV_MODE || !settings.bedrockConfigured ? 'dev' : 'prod';
  return {
    status: 'ok',
    version: settings.APP_VERSION,
    mode,
  };
};

app.get('/health', (_req, res) => {
  res.json(healthResponse());
});

app.get('/api/v1/health', (_req, res) => {
  res.json(healthResponse());
});

// ── Routes ──────────────────────────────────────────────────────────────
app.use('/api/v1', chatRouter);
app.use('/api/v1/knowledge', knowledgeRouter);

// ── Start server ────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8001', 10);

async function main() {
  console.log(
    `Starting ${settings.APP_NAME} v${settings.APP_VERSION} [dev_mode=${settings.DEV_MODE}]`
  );

  // Initialize RAG engine
  const ragEngine = getRagEngine();
  try {
    await ragEngine.initialize();
    console.log('RAG engine initialized successfully.');
  } catch (err) {
    console.error('RAG engine failed to initialize:', err, '— running in degraded mode.');
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
