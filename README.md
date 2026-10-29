# Smart Society — Full Stack

This project preserves the original Claude Artifact design and connects it to a Node.js + Express API with PostgreSQL persistence.

## Requirements
- Node.js 18+
- PostgreSQL 14+

## Setup
1. In pgAdmin, connect to your server and open Query Tool on the `postgres` database.
2. Run `CREATE DATABASE smart_society;` (skip if it already exists).
3. Copy `.env.example` to `.env`.
4. Edit `DATABASE_URL` and replace `YOUR_POSTGRES_PASSWORD` with your PostgreSQL password.
5. Open a terminal in this folder and run:

```bash
npm install
npm start
```

6. Visit http://localhost:3000

The backend creates its tables and demo records automatically on first start.

## Demo logins
- Resident: `B-10, Mayfield Gardens` / `demo1234`
- RWA staff: `RWA-01` / `admin1234`

## Connected features
- Resident/staff login and resident registration
- Complaint submission with an optional image attachment (saved in PostgreSQL) and resident complaint tracking
- Staff complaint status updates
- Service requests, full resident request history, repeat requests after Provided/Completed/Cancelled, and staff service status updates
- PostgreSQL storage shared across sessions/devices on the same deployment

## Security before deployment
Change the demo passwords and `SESSION_SECRET`. Configure PostgreSQL and environment variables with your hosting provider. This is a demo starter, not a production-audited system.
