const express = require('express');
const { getQueueStatus } = require('../services/queueService');
const { pool } = require('../config/database');
const { getRedisClient } = require('../config/redis');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const dbStatus = await pool.query('SELECT NOW()');
    
    res.status(200).json({
      service: 'OM76.MCSS',
      status: 'healthy',
      platform: 'Railway',
      database: 'connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
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

router.get('/detailed', async (req, res) => {
  try {
    const queueStatus = await getQueueStatus();
    const dbStatus = await pool.query('SELECT NOW()');
    
    let redisStatus = 'unknown';
    try {
      const redisClient = getRedisClient();
      await redisClient.ping();
      redisStatus = 'connected';
    } catch (redisError) {
      redisStatus = 'disconnected';
    }
    
    res.json({
      service: 'OM76.MCSS',
      status: 'healthy',
      platform: 'Railway',
      database: 'connected',
      redis: redisStatus,
      queue: {
        active: queueStatus.active || 0,
        waiting: queueStatus.waiting || 0,
        completed: queueStatus.completed || 0,
        failed: queueStatus.failed || 0
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

router.get('/db', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        'calendars' as table_name, 
        COUNT(*) as count 
      FROM mcss_calendar_configs 
      WHERE is_active = true
      UNION ALL
      SELECT 
        'event_mappings' as table_name, 
        COUNT(*) as count 
      FROM mcss_event_mappings
      UNION ALL
      SELECT 
        'block_events' as table_name, 
        COUNT(*) as count 
      FROM mcss_block_events
      UNION ALL
      SELECT 
        'sync_logs' as table_name, 
        COUNT(*) as count 
      FROM mcss_sync_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    const dbStats = {};
    result.rows.forEach(row => {
      dbStats[row.table_name] = parseInt(row.count);
    });

    res.json({
      service: 'OM76.MCSS',
      database: 'connected',
      statistics: dbStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      service: 'OM76.MCSS',
      database: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;