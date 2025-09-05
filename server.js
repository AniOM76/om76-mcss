const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const testRoutes = require('./routes/test');
const { initializeOM76Database } = require('./config/database');
const { initializeRedisConnection } = require('./config/redis');
const { initializeOM76Queues } = require('./services/queueService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`OM76.MCSS: ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

app.use('/webhooks', webhookRoutes);
app.use('/admin', adminRoutes);
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/test', testRoutes);

app.get('/', (req, res) => {
  res.json({ 
    service: 'OM76.MCSS',
    name: 'Multi-Calendar Sync Service',
    version: process.env.npm_package_version || '1.0.0',
    status: 'running',
    platform: 'Railway',
    description: 'Synchronizes events across multiple Google Calendar accounts with privacy-preserving block events',
    endpoints: {
      health: '/health',
      admin: '/admin/dashboard',
      webhooks: '/webhooks/calendar/:calendarId',
      auth: '/auth/status',
      test: '/test/calendar/:calendarId/events'
    },
    timestamp: new Date().toISOString()
  });
});

app.use('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'OM76.MCSS: Endpoint not found',
    service: 'OM76.MCSS',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.use((error, req, res, next) => {
  console.error('OM76.MCSS Error:', error);
  res.status(500).json({ 
    error: 'OM76.MCSS Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

async function startOM76Service() {
  try {
    console.log('Starting OM76.MCSS on Railway...');
    
    console.log('OM76.MCSS: Initializing database connection...');
    await initializeOM76Database();
    
    console.log('OM76.MCSS: Initializing Redis connection...');
    await initializeRedisConnection();
    
    console.log('OM76.MCSS: Initializing job queues...');
    await initializeOM76Queues();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`OM76.MCSS: Multi-Calendar Sync Service running on Railway port ${PORT}`);
      console.log(`OM76.MCSS: Environment - ${process.env.NODE_ENV || 'development'}`);
      console.log(`OM76.MCSS: Database - Connected`);
      console.log(`OM76.MCSS: Redis - Connected`);
      console.log(`OM76.MCSS: Webhooks ready at ${process.env.WEBHOOK_BASE_URL || `http://localhost:${PORT}`}/webhooks/calendar/:calendarId`);
      console.log('OM76.MCSS: Service initialization complete');
    });
  } catch (error) {
    console.error('OM76.MCSS: Failed to start service:', error);
    console.error('OM76.MCSS: Stack trace:', error.stack);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('OM76.MCSS: Received SIGINT, shutting down gracefully...');
  try {
    const { closeRedisConnection } = require('./config/redis');
    await closeRedisConnection();
    console.log('OM76.MCSS: Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('OM76.MCSS: Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('OM76.MCSS: Received SIGTERM, shutting down gracefully...');
  try {
    const { closeRedisConnection } = require('./config/redis');
    await closeRedisConnection();
    console.log('OM76.MCSS: Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('OM76.MCSS: Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('OM76.MCSS: Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('OM76.MCSS: Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startOM76Service();