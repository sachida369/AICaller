# AI Agent Caller - Starter Kit

A minimal, end-to-end starter you can run locally:
- **Client**: simple dashboard to upload CSV leads, create and start campaigns
- **Server**: Express API, CSV parsing, naive dialer loop, Twilio call placeholder, JSON storage

## Run locally
```bash
# Terminal 1
cd server
cp .env.example .env
# fill credentials if you want to actually place calls
npm install
npm run dev

# Terminal 2 (optional): just open the client in a browser once server is running
# visit http://localhost:8080
```

## Flow
1. Upload `shared/sample.csv` or your own CSV.
2. Create a campaign. Copy the generated Campaign ID.
3. Click **Start Campaign**.
4. Check **Live Status** with the Campaign ID.

## What to build next (production roadmap)
- Replace JSON files with Postgres
- Use a proper job queue (BullMQ/Redis) for concurrency
- Twilio <-> WebSocket <-> OpenAI Realtime for voice AI
- CRM webhooks for qualified leads
- DNC scrubbing, retries, answering machine detection
- AuthN/AuthZ, audit logs
- Deploy with Docker + HTTPS + monitoring
