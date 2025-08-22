# AI Agent Caller - Server

Minimal Express server that:
- Accepts CSV lead uploads
- Creates/starts campaigns
- Runs a naive dialer loop
- Places calls via Twilio (if credentials are provided) or simulates calls
- Stores data in JSON files

## Quick Start
```bash
cd server
cp .env.example .env
# fill in TWILIO_* and OPENAI_API_KEY if you want real calls/AI
npm install
npm run dev
```

Open http://localhost:8080 to view the client (served from ../client).

## CSV Format
Headers are flexible, but recommended:
```
name,phone,company,email
Alice,+15551234567,ACME,alice@example.com
Bob,+15557654321,Globex,bob@example.com
```

## Next Steps (hook AI)
- Replace `mockConversation()` with OpenAI Realtime API streaming logic (STT -> GPT -> TTS).
- Update TwiML to stream call audio to your websocket and back to Twilio.
- Add CRM webhook on qualified leads.

**Note:** This is a starter. For production, add a real DB (Postgres), a job queue (BullMQ), and rate limiting.
