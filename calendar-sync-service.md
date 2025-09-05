# OM76.MCSS Development Plan
## Multi-Calendar Sync Service - Railway Hosted

## Overview
OM76.MCSS (Multi-Calendar Sync Service) is an orchestration service that monitors multiple Google Calendar accounts and automatically creates private "blocking" events across all other calendars when a new event is added to any calendar. The service is designed to be deployed and hosted entirely on Railway for maximum simplicity and cost-effectiveness.

## Core Requirements

### Functional Requirements
- Monitor 5 Google Calendar accounts for new/updated events
- Create corresponding "block" events on all other calendars
- Set block events as private (visible only to calendar owner)
- Maintain event details in private events for owner visibility
- Handle event updates and deletions
- Prevent infinite loops when creating block events

### Privacy Requirements
- Block events show generic titles (e.g., "Calendar 01 Block")
- Original event details only visible to calendar owner
- No sensitive information exposed to calendar viewers

## Technical Architecture - Railway Platform

### 1. Railway Service Components

#### OM76.MCSS Main Application
- **Platform**: Railway Web Service
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Purpose**: Handle webhooks, process events, manage API calls
- **Auto-scaling**: Railway handles traffic spikes automatically

#### PostgreSQL Database
- **Platform**: Railway PostgreSQL Service
- **Purpose**: Store event mappings and calendar configurations
- **Backup**: Automatic daily backups included
- **Connection**: Railway-managed connection pooling

#### Redis Cache & Queue
- **Platform**: Railway Redis Service  
- **Purpose**: Job queue processing and caching
- **Queue System**: Bull.js for reliable event processing
- **Connection**: Railway-managed Redis instance

#### Custom Domain & SSL
- **Platform**: Railway Domain Management
- **Purpose**: Professional webhook URLs for Google Calendar
- **SSL**: Automatic HTTPS certificates
- **Example**: `om76-mcss.railway.app` or custom domain

### 2. Development Phases

#### Phase 1: Railway Foundation Setup
**Duration**: 1 week

**Tasks**:
1. Create Railway project from GitHub repository
2. Set up PostgreSQL and Redis services in Railway
3. Configure environment variables in Railway dashboard
4. Set up Google Cloud Project and Calendar API credentials
5. Configure custom domain for webhook endpoints
6. Run initial database migrations

**Deliverables**:
- OM76.MCSS deployed on Railway
- Database schema implemented
- Google Calendar API authenticated
- Webhook endpoints ready
- Environment properly configured

#### Phase 2: Core Event Detection
**Duration**: 2 weeks

**Tasks**:
1. Implement Google Calendar webhook subscriptions
2. Build webhook endpoint handlers in Express.js
3. Create event change detection and filtering logic
4. Set up Bull.js job queues with Railway Redis
5. Implement event validation and loop prevention
6. Add comprehensive logging for Railway monitoring

**Deliverables**:
- Real-time calendar change detection
- Webhook processing system
- Job queue system operational
- Event filtering to prevent loops
- Railway logs showing system activity

#### Phase 3: Block Event Creation Engine
**Duration**: 2 weeks

**Tasks**:
1. Build block event creation logic
2. Implement privacy settings and metadata handling
3. Create event relationship tracking in PostgreSQL
4. Handle timezone conversion and event timing
5. Add retry logic and error handling
6. Build admin dashboard for monitoring via Railway

**Deliverables**:
- Automatic block event creation
- Privacy controls working correctly
- Event relationship tracking
- Robust error handling and retries
- Basic admin interface

#### Phase 4: Event Lifecycle Management
**Duration**: 2 weeks

**Tasks**:
1. Handle event updates (modify existing block events)
2. Handle event deletions (remove corresponding block events)
3. Implement conflict resolution logic
4. Add comprehensive event validation
5. Build monitoring dashboard using Railway metrics
6. Optimize performance for Railway environment

**Deliverables**:
- Full event lifecycle support
- Conflict resolution system
- Performance optimizations
- Monitoring dashboard
- Railway-specific optimizations

#### Phase 5: Testing & Production Deployment
**Duration**: 2 weeks

**Tasks**:
1. Comprehensive testing across all calendar scenarios
2. Load testing with Railway infrastructure
3. Security audit and credential management
4. Production environment setup in Railway
5. Documentation and operational procedures
6. Backup and recovery procedures

**Deliverables**:
- Fully tested OM76.MCSS system
- Production deployment on Railway
- Security audit completed
- User documentation
- Operational runbooks

## Technical Implementation Details

### Railway-Specific Configuration

#### Project Structure
```
om76-mcss/
├── package.json
├── server.js
├── railway.json
├── routes/
│   ├── webhooks.js
│   ├── admin.js
│   └── health.js
├── services/
│   ├── calendarService.js
│   ├── eventProcessor.js
│   ├── syncService.js
│   └── queueService.js
├── models/
│   ├── EventMapping.js
│   ├── BlockEvent.js
│   └── CalendarConfig.js
├── config/
│   ├── database.js
│   ├── redis.js
│   └── google.js
├── migrations/
│   └── 001_initial_schema.sql
└── scripts/
    ├── setup.js
    └── migrate.js
```

#### Railway Configuration (railway.json)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Google Calendar API Integration

#### Authentication Setup for Railway
```javascript
// config/google.js
const { google } = require('googleapis');

class GoogleCalendarManager {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.WEBHOOK_BASE_URL}/auth/callback`
    );
  }

  async authenticateCalendar(refreshToken) {
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    return google.calendar({ 
      version: 'v3', 
      auth: this.oauth2Client 
    });
  }

  async setupWebhook(calendarService, calendarId) {
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/webhooks/calendar/${calendarId}`;
    
    const watchRequest = {
      id: `om76-mcss-${calendarId}-${Date.now()}`,
      type: 'web_hook',
      address: webhookUrl,
      params: {
        ttl: '3600'
      }
    };
    
    return calendarService.events().watch({
      calendarId: calendarId,
      requestBody: watchRequest
    });
  }
}

module.exports = GoogleCalendarManager;
```

### Railway Database Configuration

#### Database Connection (config/database.js)
```javascript
const { Pool } = require('pg');

// Railway PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Railway-optimized connection handling
pool.on('connect', () => {
  console.log('OM76.MCSS connected to Railway PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Railway PostgreSQL connection error:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};
```

#### Database Schema for OM76.MCSS
```sql
-- migrations/001_initial_schema.sql
-- OM76.MCSS Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Calendar configurations for OM76.MCSS
CREATE TABLE mcss_calendar_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calendar_id VARCHAR(255) UNIQUE NOT NULL,
    calendar_name VARCHAR(255),
    calendar_alias VARCHAR(10), -- 'Calendar 01', 'Calendar 02', etc.
    access_token TEXT,
    refresh_token TEXT,
    webhook_id VARCHAR(255),
    webhook_resource_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event mappings for OM76.MCSS sync tracking
CREATE TABLE mcss_event_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_event_id VARCHAR(255) NOT NULL,
    original_calendar_id VARCHAR(255) NOT NULL,
    original_summary TEXT,
    event_start TIMESTAMP WITH TIME ZONE,
    event_end TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(original_event_id, original_calendar_id)
);

-- Block events created by OM76.MCSS
CREATE TABLE mcss_block_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mapping_id UUID REFERENCES mcss_event_mappings(id) ON DELETE CASCADE,
    block_event_id VARCHAR(255) NOT NULL,
    target_calendar_id VARCHAR(255) NOT NULL,
    block_title VARCHAR(255), -- "Calendar 01 Block", etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(block_event_id, target_calendar_id)
);

-- OM76.MCSS system logs
CREATE TABLE mcss_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50), -- 'webhook_received', 'block_created', 'sync_completed'
    calendar_id VARCHAR(255),
    event_id VARCHAR(255),
    status VARCHAR(20), -- 'success', 'error', 'warning'
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for OM76.MCSS performance
CREATE INDEX idx_mcss_original_event ON mcss_event_mappings(original_event_id);
CREATE INDEX idx_mcss_original_calendar ON mcss_event_mappings(original_calendar_id);
CREATE INDEX idx_mcss_mapping_blocks ON mcss_block_events(mapping_id);
CREATE INDEX idx_mcss_calendar_active ON mcss_calendar_configs(calendar_id, is_active);
CREATE INDEX idx_mcss_sync_logs_calendar ON mcss_sync_logs(calendar_id, created_at);
CREATE INDEX idx_mcss_sync_logs_type ON mcss_sync_logs(event_type, created_at);
```

### Railway Queue System

#### Queue Service (services/queueService.js)
```javascript
const Queue = require('bull');
const { syncEventAcrossCalendars } = require('./syncService');

// OM76.MCSS Queue Configuration for Railway
const OM76_EVENT_SYNC_QUEUE = new Queue('om76-mcss-event-sync', process.env.REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

// Process OM76.MCSS sync jobs
OM76_EVENT_SYNC_QUEUE.process('syncEvent', 5, async (job) => {
  const { eventData, sourceCalendarId } = job.data;
  
  try {
    console.log(`OM76.MCSS: Processing sync for event ${eventData.id} from ${sourceCalendarId}`);
    
    await syncEventAcrossCalendars(eventData, sourceCalendarId);
    
    console.log(`OM76.MCSS: Successfully synced event ${eventData.id}`);
    return { status: 'completed', eventId: eventData.id };
  } catch (error) {
    console.error(`OM76.MCSS: Failed to sync event ${eventData.id}:`, error.message);
    throw error;
  }
});

// OM76.MCSS Queue Event Handlers
OM76_EVENT_SYNC_QUEUE.on('completed', (job, result) => {
  console.log(`OM76.MCSS: Job ${job.id} completed successfully`);
});

OM76_EVENT_SYNC_QUEUE.on('failed', (job, err) => {
  console.error(`OM76.MCSS: Job ${job.id} failed:`, err.message);
});

async function addOM76SyncJob(eventData, sourceCalendarId, priority = 'normal') {
  const jobOptions = {
    priority: priority === 'high' ? 1 : 10,
    delay: priority === 'immediate' ? 0 : 1000
  };
  
  return OM76_EVENT_SYNC_QUEUE.add('syncEvent', 
    { eventData, sourceCalendarId },
    jobOptions
  );
}

module.exports = {
  addOM76SyncJob,
  getQueueStatus: () => OM76_EVENT_SYNC_QUEUE.getJobCounts(),
  initializeOM76Queues: async () => {
    console.log('OM76.MCSS: Event sync queue initialized on Railway');
  }
};
```

### Main Application Server

#### OM76.MCSS Server (server.js)
```javascript
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');
const { initializeOM76Database } = require('./config/database');
const { initializeOM76Queues } = require('./services/queueService');

const app = express();
const PORT = process.env.PORT || 3000;

// OM76.MCSS Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OM76.MCSS Request Logging
app.use((req, res, next) => {
  console.log(`OM76.MCSS: ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// OM76.MCSS Routes
app.use('/webhooks', webhookRoutes);
app.use('/admin', adminRoutes);
app.use('/health', healthRoutes);

// OM76.MCSS Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'OM76.MCSS',
    name: 'Multi-Calendar Sync Service',
    version: process.env.npm_package_version || '1.0.0',
    status: 'running',
    platform: 'Railway',
    timestamp: new Date().toISOString()
  });
});

// OM76.MCSS Error Handler
app.use((error, req, res, next) => {
  console.error('OM76.MCSS Error:', error);
  res.status(500).json({ 
    error: 'OM76.MCSS Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// Initialize OM76.MCSS Services
async function startOM76Service() {
  try {
    console.log('Starting OM76.MCSS on Railway...');
    
    await initializeOM76Database();
    await initializeOM76Queues();
    
    app.listen(PORT, () => {
      console.log(`OM76.MCSS: Multi-Calendar Sync Service running on Railway port ${PORT}`);
      console.log(`OM76.MCSS: Environment - ${process.env.NODE_ENV}`);
      console.log(`OM76.MCSS: Database - Connected`);
      console.log(`OM76.MCSS: Redis - Connected`);
    });
  } catch (error) {
    console.error('OM76.MCSS: Failed to start service:', error);
    process.exit(1);
  }
}

startOM76Service();
```

## Railway Deployment Configuration

### Environment Variables for OM76.MCSS
```bash
# OM76.MCSS Core Configuration
SERVICE_NAME=OM76.MCSS
NODE_ENV=production
PORT=3000

# Railway Services (auto-generated)
DATABASE_URL=postgresql://postgres:password@host:5432/railway
REDIS_URL=redis://default:password@host:6379

# OM76.MCSS Webhook Configuration  
WEBHOOK_BASE_URL=https://om76-mcss.railway.app

# Google Calendar API for OM76.MCSS
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://om76-mcss.railway.app/auth/callback

# OM76.MCSS Calendar Configuration
CALENDAR_01_ID=calendar1@gmail.com
CALENDAR_02_ID=calendar2@gmail.com  
CALENDAR_03_ID=calendar3@gmail.com
CALENDAR_04_ID=calendar4@gmail.com
CALENDAR_05_ID=calendar5@gmail.com

# OM76.MCSS Security
JWT_SECRET=your_jwt_secret_for_om76_mcss
WEBHOOK_SECRET=your_webhook_verification_secret

# OM76.MCSS Monitoring
LOG_LEVEL=info
ENABLE_METRICS=true
```

## Security Considerations for OM76.MCSS

### Railway-Specific Security
- **Environment Variables**: Securely managed in Railway dashboard
- **Database Encryption**: Railway PostgreSQL includes encryption at rest
- **Network Security**: Railway provides automatic HTTPS and network isolation
- **Access Control**: Railway team access controls for deployment management

### OM76.MCSS Application Security
- **OAuth 2.0**: Secure Google Calendar API authentication
- **Webhook Verification**: Validate incoming Google Calendar webhooks
- **Rate Limiting**: Implement API rate limiting for Google Calendar calls
- **Data Privacy**: Ensure block events maintain privacy settings
- **Audit Logging**: Complete audit trail in `mcss_sync_logs` table

## Cost Analysis - Railway Hosting

### OM76.MCSS Monthly Costs
| Component | Railway Plan | Cost |
|-----------|--------------|------|
| **Web Service** | Pro Plan | $20/month |
| **PostgreSQL** | Included | $0 |
| **Redis** | Included | $0 |
| **Custom Domain** | Included | $0 |
| **SSL Certificates** | Included | $0 |
| **Monitoring & Logs** | Included | $0 |
| **Backup & Recovery** | Included | $0 |
| **Total** | | **$20/month** |

### Cost Benefits vs Alternatives
- **AWS Lambda + RDS**: ~$35-50/month
- **Google Cloud Run + SQL**: ~$25-40/month  
- **Heroku Equivalent**: ~$32/month
- **OM76.MCSS on Railway**: **$20/month**

## Monitoring & Operations

### Railway Built-in Monitoring for OM76.MCSS
- **Application Logs**: Real-time log streaming
- **Performance Metrics**: CPU, memory, response times
- **Database Monitoring**: Connection counts, query performance
- **Error Tracking**: Automatic error detection and alerting
- **Uptime Monitoring**: Built-in health check monitoring

### OM76.MCSS Custom Metrics
```javascript
// Health endpoint with OM76.MCSS metrics
app.get('/health/detailed', async (req, res) => {
  try {
    const queueStatus = await getQueueStatus();
    const dbStatus = await pool.query('SELECT NOW()');
    
    res.json({
      service: 'OM76.MCSS',
      status: 'healthy',
      platform: 'Railway',
      database: 'connected',
      redis: 'connected',
      queue: {
        active: queueStatus.active,
        waiting: queueStatus.waiting,
        completed: queueStatus.completed,
        failed: queueStatus.failed
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      service: 'OM76.MCSS',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

## Success Criteria for OM76.MCSS

### Functional Success
- ✅ 99%+ event synchronization accuracy across all 5 calendars
- ✅ Sub-30 second synchronization latency via Railway infrastructure
- ✅ Zero private event detail leakage to calendar viewers
- ✅ Reliable event lifecycle management (create, update, delete)
- ✅ 24/7 webhook availability on Railway platform

### Technical Success
- ✅ 99.9% uptime on Railway infrastructure
- ✅ Automated monitoring and alerting via Railway dashboard
- ✅ Secure credential management in Railway environment
- ✅ Scalable architecture handling calendar spike loads
- ✅ Cost-effective operation under $25/month

### Operational Success
- ✅ Simple deployment process via Railway Git integration
- ✅ Easy debugging via Railway real-time logs
- ✅ Straightforward scaling via Railway auto-scaling
- ✅ Reliable backup and recovery via Railway PostgreSQL
- ✅ Professional webhook endpoints via Railway custom domains

OM76.MCSS on Railway provides a robust, cost-effective, and maintainable solution for multi-calendar synchronization with enterprise-grade reliability at startup-friendly pricing.