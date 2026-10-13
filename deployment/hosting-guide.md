# Hosting guide (managed hosting, no self-managed physical server)

Recommended split:
1. **Frontend:** Deploy `frontend/` to Netlify or Vercel as a static site.
2. **Backend:** Deploy `backend/` as a Node.js web service on Render or a similar managed host.
3. **Database:** Create a PostgreSQL database on Supabase or another managed PostgreSQL provider.

## Environment variables on the backend host
- `DATABASE_URL`: managed PostgreSQL connection string
- `FRONTEND_ORIGIN`: exact deployed frontend URL
- `JWT_SECRET`: random secret at least 32 characters
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: initial admin account
- `SMS_API_URL`, `SMS_API_TOKEN`, `SMS_SENDER_NAME`: optional provider settings

## Frontend API URL
Before deploying, replace the local API default in `frontend/app.js` with your deployed backend URL, e.g.:
`const API_BASE = 'https://YOUR-BACKEND-HOST.example/api';`

Do not use that placeholder literally. Configure HTTPS and verify CORS origin. Set camera scanning on HTTPS because browsers generally require a secure context for camera access.

## Database
Run `database/schema.sql` in the managed PostgreSQL SQL editor before starting the API. Store backups and limit database credentials to the backend service.

A hosted application still uses servers behind the scenes; managed hosting means you do not operate the server hardware yourself.
