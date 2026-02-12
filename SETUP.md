# FHE Project Board - Setup Guide

Internal project management board for Florida Horizon Engineering.

## Architecture

```
┌──────────────────────────────────────────────┐
│              React PWA (Frontend)              │
│   Kanban Board · Cards · Drag & Drop · PWA    │
└──────────────┬───────────────────────────────┘
               │ REST API
┌──────────────┴───────────────────────────────┐
│          Express.js (Backend API)             │
│  Auth · Boards · Cards · Email Automation     │
├───────────────────┬──────────────────────────┤
│   PostgreSQL DB   │  Microsoft Graph API      │
│   (All data)      │  (Email automation)       │
└───────────────────┴──────────────────────────┘
```

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or Docker)

### 1. Start the database

**Option A: Docker (recommended)**
```bash
docker compose -f docker-compose.dev.yml up -d
```

**Option B: Local PostgreSQL**
```bash
createdb fhe_project_board
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

For local Docker DB, use:
```
DATABASE_URL=postgresql://fhe_user:devpassword@localhost:5432/fhe_project_board
```

### 3. Install dependencies

```bash
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### 4. Run database migration and seed

```bash
npm run db:migrate
npm run db:seed
```

This creates:
- Default admin account: `admin@floridahorizoneng.com` / `admin123`
- Sample board with lists and cards
- Default labels

### 5. Start development servers

```bash
npm run dev
```

This starts:
- Backend API on http://localhost:3001
- Frontend on http://localhost:3000

## Production Deployment (Azure)

### Option A: One-command Azure deployment

```bash
az login
./deploy/azure-deploy.sh fhe-project-board eastus
```

### Option B: Docker Compose

```bash
# Set environment variables
export DB_PASSWORD="strong-password-here"
export JWT_SECRET="random-secret-here"

docker compose up -d
```

Then run migrations:
```bash
docker compose exec app node server/dist/db/migrate.js
docker compose exec app node server/dist/db/seed.js
```

## Email Automation Setup

The email automation polls a Microsoft 365 mailbox and automatically creates cards from incoming emails.

### 1. Register Azure AD Application

1. Go to [Azure Portal](https://portal.azure.com) > Azure Active Directory > App registrations
2. Click "New registration"
3. Name: "FHE Project Board"
4. Supported account types: "Single tenant"
5. Click Register

### 2. Configure API Permissions

1. Go to API permissions > Add a permission > Microsoft Graph
2. Application permissions (not delegated):
   - `Mail.Read` - Read mail in all mailboxes
   - `Mail.ReadWrite` - Mark messages as read
3. Click "Grant admin consent"

### 3. Create Client Secret

1. Go to Certificates & secrets > New client secret
2. Description: "FHE Project Board"
3. Expiry: 24 months
4. Copy the secret value immediately

### 4. Configure the Application

Set these environment variables:
```
AZURE_TENANT_ID=your-directory-tenant-id
AZURE_CLIENT_ID=your-application-client-id
AZURE_CLIENT_SECRET=your-client-secret-value
EMAIL_MONITORED_MAILBOX=tasks@floridahorizoneng.com
EMAIL_POLL_INTERVAL_MS=60000
```

### 5. Create Email Rules

1. Log in as an admin user
2. Go to Email Rules (in the top navigation)
3. Create rules with filters:
   - **By sender**: Add specific email addresses or domains
   - **By recipient**: Monitor specific mailbox aliases
   - **By subject**: Match or exclude keywords
4. Set target board and list for new cards
5. Optionally auto-assign users and labels

### Example Rules

| Rule | From | Subject | Target List |
|------|------|---------|-------------|
| Client Requests | `*@client.com` | - | To Do |
| Permit Updates | `permits@county.gov` | "permit" | Review |
| Urgent | - | "urgent", "asap" | To Do (with Urgent label) |

## PWA Installation

### Mobile (iPhone/Android)
1. Open the app URL in Safari (iOS) or Chrome (Android)
2. Tap Share > "Add to Home Screen"
3. The app icon will appear on your home screen

### Desktop (Chrome/Edge)
1. Open the app URL
2. Click the install icon in the address bar
3. Click "Install"

## User Management

### Adding Users
1. New users register at the login page
2. Admin can change user roles via the database

### Roles
- **Admin**: Full access, can manage email rules, all boards
- **Member**: Can create boards, manage cards on boards they belong to
- **Viewer** (board-level): Read-only access to a specific board

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login |
| `/api/auth/me` | GET | Current user profile |
| `/api/boards` | GET/POST | List/create boards |
| `/api/boards/:id` | GET/PUT/DELETE | Board CRUD |
| `/api/lists` | POST | Create list |
| `/api/lists/:id` | PUT/DELETE | Update/archive list |
| `/api/cards` | POST | Create card |
| `/api/cards/:id` | GET/PUT/DELETE | Card CRUD |
| `/api/cards/:id/move` | PUT | Move/reorder card |
| `/api/labels` | POST | Create label |
| `/api/checklists` | POST | Create checklist |
| `/api/email-rules` | GET/POST | Email rules (admin) |
| `/api/health` | GET | Health check |
