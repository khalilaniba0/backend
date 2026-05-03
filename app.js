var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const http = require('http');
const { connectToMongoDB } = require('./config/db');
const utilisateurRouter = require('./routes/utilisateur.route');
const offreEmploiRouter = require('./routes/offreEmploi.route');
const candidatureRouter = require('./routes/candidature.route');
const entretienRouter = require('./routes/entretien.route');
const entrepriseRouter = require('./routes/entreprise.route');
const candidatRouter = require('./routes/candidat.route');
const candidatPasswordResetRouter = require('./routes/candidatPasswordReset.route');
const googleRouter = require('./routes/google.route');
const superadminRouter = require('./routes/superadmin.route');
var app = express();

const PORT = Number(process.env.PORT || 5000);
const IA_BASE_URL = process.env.IA_BASE_URL || 'http://cv-scoring-service:8000';
const IA_HEALTH_TIMEOUT_MS = Number(process.env.IA_HEALTH_TIMEOUT_MS || 5000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://10.0.0.5:3000';

const checkIaHealth = async () => {
  if (!IA_BASE_URL) {
    console.warn('[IA] health check skipped: IA_BASE_URL is not defined');
    return;
  }

  try {
    const response = await axios.get(`${IA_BASE_URL}/health`, {
      timeout: IA_HEALTH_TIMEOUT_MS
    });
    console.log(`[IA] health check OK (${response.status})`);
  } catch (error) {
    console.warn('[IA] health check KO', {
      baseUrl: IA_BASE_URL,
      status: error?.response?.status || null,
      message: error.message,
      details: error?.response?.data || null
    });
  }
};

// Allow frontend access from configured origin (Docker/Linux deployment).
const corsOptions = {
  origin: CORS_ORIGIN,
  credentials: true,
};
app.use(cors(corsOptions));

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure profile photos directory exists
const profilePhotosPath = path.join(__dirname, 'public', 'profile-photos');
if (!fs.existsSync(profilePhotosPath)) {
  fs.mkdirSync(profilePhotosPath, { recursive: true });
}

app.get('/health', function(req, res) {
  res.status(200).json({ status: 'ok' });
});

app.use('/user', utilisateurRouter);
app.use('/offre', offreEmploiRouter);
app.use('/candidature', candidatureRouter);
app.use('/entretien', entretienRouter);
app.use('/entreprise', entrepriseRouter);
app.use('/candidat', candidatPasswordResetRouter);
app.use('/candidat', candidatRouter);
app.use('/superadmin', superadminRouter);
app.use('/', googleRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  const status = err.status || 500;
  res.status(status).json({
    message: err.message,
    error: req.app.get('env') === 'development' ? err : {}
  });
});

const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => {
  connectToMongoDB();
  if (process.env.NODE_ENV !== 'test') {
    checkIaHealth();
  }
  console.log(`Server is running on port ${PORT}`);
});
