# PrimePath Chatbot - Backend

Standalone AI chatbot backend extracted from SmartCRM. Powers the PrimePath Chatbot widget with real-time messaging, RAG-based AI responses, and customer thread management.

## Prerequisites

- **Node.js** 18+
- **MySQL** 8.0+
- **DeepSeek API key** (primary AI model)
- **OpenAI API key** (for text embeddings / RAG)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create MySQL database

```sql
CREATE DATABASE primepath_chatbot;
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=primepath_chatbot
DB_PORT=3306

PORT=3000
FRONTEND_URL=http://localhost:4001

DEEPSEEK_API_KEY=your_deepseek_api_key
CHATGPT_CHUNK_API_KEY=your_openai_api_key
```

### 4. Seed the database

This creates a default company, agent, and widget:

```bash
node src/scripts/seed.js
```

**Copy the Widget ID** from the output — you'll need it for the frontend.

### 5. Start the server

```bash
npm run dev
```

Server runs at `http://localhost:3000`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agent/get-widget?widgetId=xxx` | Get widget configuration |
| POST | `/api/customer/create-customer-thread` | Create customer + chat thread |
| POST | `/api/chat/chat-web` | Send message, get AI response |
| GET | `/api/chat/chat-history?threadId=xxx` | Get chat history |

## Architecture

```
src/
├── app.js                          # Express server + Socket.IO setup
├── config/
│   ├── db.config.js                # MySQL connection + schema init
│   ├── deepseek.config.js          # DeepSeek AI client
│   └── chatgpt.config.js           # OpenAI client (embeddings)
├── controllers/
│   ├── agent.control.js            # Widget config endpoint
│   ├── chat.control.js             # Chat message handling
│   └── customer.control.js         # Customer thread creation
├── models/
│   ├── agent.model.js              # Agent/widget DB queries
│   ├── chat.model.js               # Thread/message DB queries
│   └── customer.model.js           # Customer DB queries
├── routes/
│   ├── index.route.js              # Route aggregator
│   ├── agent.route.js
│   ├── chat.route.js
│   └── customer.route.js
├── services/
│   ├── agent.service.js            # AI response generation + RAG
│   ├── chat.service.js             # Message save/emit + bot response
│   ├── customer.service.js         # Customer lookup/creation
│   └── helpers/
│       ├── socket.helper.service.js # Socket.IO real-time events
│       ├── embedding.helper.service.js # OpenAI embeddings
│       └── prompts.helper.service.js   # AI prompt templates
├── utils/
│   ├── ai-completion.js            # DeepSeek/OpenAI wrapper
│   └── utc-date.js                 # Date conversion utilities
└── scripts/
    └── seed.js                     # Database seed script
```

## How It Works

1. Frontend fetches widget config via `/api/agent/get-widget`
2. Customer thread created via `/api/customer/create-customer-thread`
3. User sends message → saved to DB → emitted via Socket.IO
4. Backend generates AI response using DeepSeek + RAG embeddings
5. Bot response saved + emitted back to frontend in real-time

## Training Your Bot

To add knowledge to your bot, insert training data into the `agent_files` and `agent_file_chunks` tables. The bot uses RAG (Retrieval Augmented Generation) with OpenAI embeddings to find relevant chunks and include them in the AI prompt context.
