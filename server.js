// ============================================================
//  RIDE FARE COMPARISON SERVER
//  Main entry point — Express API + Playwright + Formula engine
// ============================================================
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const fareRouter        = require('./routes/fares');
const crowdsourceRouter = require('./routes/crowdsource');
const healthRouter      = require('./routes/health');
const { log }    = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());

// Rate limit: 60 requests per minute per IP
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests — please slow down' },
}));

// ── Routes ───────────────────────────────────────────────────
app.use('/api', fareRouter);
app.use('/api', crowdsourceRouter);
app.use('/',    healthRouter);

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  log(`Fare server running on port ${PORT}`);
});

module.exports = app;
