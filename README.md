# OM76.MCSS
## Multi-Calendar Sync Service

A Railway-hosted service that synchronizes events across multiple Google Calendar accounts with privacy-preserving block events.

### Features
- Monitors 5 Google Calendar accounts
- Creates private blocking events across calendars
- Maintains event privacy for different calendar viewers
- Real-time webhook-based synchronization

### Tech Stack
- Node.js + Express.js
- Railway (hosting + PostgreSQL + Redis)
- Google Calendar API
- Bull.js (job queues)

### Quick Start
See [docs/setup.md](docs/setup.md) for detailed setup instructions.
