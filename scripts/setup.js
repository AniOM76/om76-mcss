const { runMigrations } = require('./migrate');
const { query, pool } = require('../config/database');
require('dotenv').config();

async function setupOM76Service() {
  try {
    console.log('OM76.MCSS: Starting service setup...');
    
    console.log('OM76.MCSS: Checking database schema...');
    try {
      await runMigrations();
    } catch (error) {
      if (error.code === '42P07') {
        console.log('OM76.MCSS: Database tables already exist, skipping migrations');
      } else {
        throw error;
      }
    }
    
    console.log('OM76.MCSS: Setting up initial calendar configurations...');
    await setupCalendarConfigs();
    
    console.log('OM76.MCSS: Setup completed successfully!');
    console.log('OM76.MCSS: Next steps:');
    console.log('1. Configure Google Calendar API credentials in Railway environment');
    console.log('2. Update calendar refresh tokens in the database');
    console.log('3. Set up webhook endpoints with Google Calendar');
    console.log('4. Deploy to Railway and test webhook connectivity');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('OM76.MCSS: Setup failed:', error);
    await pool.end();
    process.exit(1);
  }
}

async function setupCalendarConfigs() {
  const calendars = [
    { 
      id: process.env.CALENDAR_01_ID || 'calendar1@example.com',
      alias: 'Calendar 01',
      name: 'Primary Calendar'
    },
    {
      id: process.env.CALENDAR_02_ID || 'calendar2@example.com',
      alias: 'Calendar 02',
      name: 'Secondary Calendar'
    },
    {
      id: process.env.CALENDAR_03_ID || 'calendar3@example.com',
      alias: 'Calendar 03',
      name: 'Third Calendar'
    },
    {
      id: process.env.CALENDAR_04_ID || 'calendar4@example.com',
      alias: 'Calendar 04',
      name: 'Fourth Calendar'
    },
    {
      id: process.env.CALENDAR_05_ID || 'calendar5@example.com',
      alias: 'Calendar 05',
      name: 'Fifth Calendar'
    }
  ];

  for (const calendar of calendars) {
    try {
      const existing = await query(
        'SELECT id FROM mcss_calendar_configs WHERE calendar_id = $1',
        [calendar.id]
      );
      
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO mcss_calendar_configs (calendar_id, calendar_name, calendar_alias, is_active) 
           VALUES ($1, $2, $3, $4)`,
          [calendar.id, calendar.name, calendar.alias, true]
        );
        console.log(`OM76.MCSS: Added calendar configuration for ${calendar.alias}`);
      } else {
        console.log(`OM76.MCSS: Calendar configuration for ${calendar.alias} already exists`);
      }
    } catch (error) {
      console.error(`OM76.MCSS: Failed to setup calendar ${calendar.alias}:`, error);
    }
  }
}

if (require.main === module) {
  setupOM76Service();
}

module.exports = { setupOM76Service };