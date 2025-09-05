const express = require('express');
const { getQueueStatus } = require('../services/queueService');
const { query } = require('../config/database');
const GoogleCalendarManager = require('../config/google');

const router = express.Router();
const googleManager = new GoogleCalendarManager();

router.get('/dashboard', async (req, res) => {
  try {
    const queueStatus = await getQueueStatus();
    
    const calendarStats = await query(`
      SELECT 
        cc.calendar_alias,
        cc.calendar_name,
        cc.is_active,
        COUNT(DISTINCT em.id) as total_events,
        COUNT(DISTINCT be.id) as total_blocks
      FROM mcss_calendar_configs cc
      LEFT JOIN mcss_event_mappings em ON cc.calendar_id = em.original_calendar_id
      LEFT JOIN mcss_block_events be ON em.id = be.mapping_id
      GROUP BY cc.id, cc.calendar_alias, cc.calendar_name, cc.is_active
      ORDER BY cc.calendar_alias
    `);

    const recentActivity = await query(`
      SELECT 
        event_type,
        calendar_id,
        event_id,
        status,
        message,
        created_at
      FROM mcss_sync_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const syncStats = await query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        event_type,
        status,
        COUNT(*) as count
      FROM mcss_sync_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY hour, event_type, status
      ORDER BY hour DESC
    `);

    res.json({
      service: 'OM76.MCSS',
      dashboard: {
        queue: queueStatus,
        calendars: calendarStats.rows,
        recent_activity: recentActivity.rows,
        sync_statistics: syncStats.rows,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('OM76.MCSS: Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to load dashboard data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/calendars', async (req, res) => {
  try {
    const calendars = await googleManager.getCalendarConfigs();
    res.json({
      calendars: calendars,
      count: calendars.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('OM76.MCSS: Calendar list error:', error);
    res.status(500).json({
      error: 'Failed to get calendar list',
      message: error.message
    });
  }
});

router.post('/calendars/:calendarId/toggle', async (req, res) => {
  try {
    const { calendarId } = req.params;
    
    const result = await query(
      'UPDATE mcss_calendar_configs SET is_active = NOT is_active WHERE calendar_id = $1 RETURNING *',
      [calendarId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const calendar = result.rows[0];
    
    res.json({
      message: `Calendar ${calendar.calendar_alias} ${calendar.is_active ? 'activated' : 'deactivated'}`,
      calendar: calendar,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('OM76.MCSS: Calendar toggle error:', error);
    res.status(500).json({
      error: 'Failed to toggle calendar',
      message: error.message
    });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, calendar_id, event_type, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    let params = [];
    let paramIndex = 1;
    
    if (calendar_id) {
      whereClause += ` AND calendar_id = $${paramIndex}`;
      params.push(calendar_id);
      paramIndex++;
    }
    
    if (event_type) {
      whereClause += ` AND event_type = $${paramIndex}`;
      params.push(event_type);
      paramIndex++;
    }
    
    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    params.push(parseInt(limit));
    params.push(parseInt(offset));
    
    const logs = await query(`
      SELECT * FROM mcss_sync_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, params);

    const countResult = await query(`
      SELECT COUNT(*) as total FROM mcss_sync_logs ${whereClause}
    `, params.slice(0, -2));

    res.json({
      logs: logs.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('OM76.MCSS: Logs error:', error);
    res.status(500).json({
      error: 'Failed to get logs',
      message: error.message
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await query(`
      WITH daily_stats AS (
        SELECT 
          DATE(created_at) as date,
          event_type,
          status,
          COUNT(*) as count
        FROM mcss_sync_logs
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at), event_type, status
      ),
      calendar_stats AS (
        SELECT 
          cc.calendar_alias,
          COUNT(DISTINCT em.original_event_id) as events_synced,
          COUNT(DISTINCT be.block_event_id) as blocks_created
        FROM mcss_calendar_configs cc
        LEFT JOIN mcss_event_mappings em ON cc.calendar_id = em.original_calendar_id
        LEFT JOIN mcss_block_events be ON em.id = be.mapping_id
        WHERE cc.is_active = true
        GROUP BY cc.calendar_alias
      )
      SELECT 
        'daily_activity' as stat_type,
        json_agg(daily_stats) as data
      FROM daily_stats
      UNION ALL
      SELECT 
        'calendar_performance' as stat_type,
        json_agg(calendar_stats) as data
      FROM calendar_stats
    `);

    const statsData = {};
    stats.rows.forEach(row => {
      statsData[row.stat_type] = row.data;
    });

    res.json({
      service: 'OM76.MCSS',
      statistics: statsData,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('OM76.MCSS: Stats error:', error);
    res.status(500).json({
      error: 'Failed to generate statistics',
      message: error.message
    });
  }
});

module.exports = router;