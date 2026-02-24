# FHE Project Management Tracker — Project Summary & Go-Live Plan

**Client:** Florida Horizon Engineering (FHE)
**Repository:** https://github.com/Nursec22b/FHE-Project-Management-Tracker
**Prepared:** February 2026

---

## 1. WHAT WE BUILT

### Overview
A full-stack, internal Kanban-style project management platform built exclusively for Florida Horizon Engineering. It functions like an enterprise version of Trello — but hosted internally, customized to FHE workflows, and extended with powerful email automation.

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React (TypeScript) — Progressive Web App (PWA) |
| Backend | Node.js + Express.js (TypeScript) |
| Database | PostgreSQL 16 |
| Authentication | JWT (JSON Web Tokens) |
| Email Automation | Microsoft Graph API (Azure AD) |
| Containerization | Docker (multi-stage build) |
| Cloud Deployment | Microsoft Azure (App Service + PostgreSQL Flexible Server) |
| Alternative Deployment | Office Laptop + Cloudflare Tunnel (free HTTPS) |

---

## 2. FEATURES

### Core Board Features
- **Kanban Boards** — Create unlimited boards per project/team
- **Lists** — Customizable columns (To Do, In Progress, Review, Done + custom)
- **Drag & Drop Cards** — Move cards between lists and reorder within lists
- **Card Details:**
  - Title and rich description
  - Due dates
  - Cover colors (visual org)
  - Colored labels (customizable per board)
  - Member assignment (assign multiple FHE staff)
  - Checklists with individual item completion tracking
  - File attachments (up to 25MB per file)
  - Comments/discussion thread

### User & Access Management
- **Secure Registration & Login** (bcrypt + JWT)
- **Board Membership Roles** — Admin vs. Member
- **Admin Controls** — Add/remove members, archive boards/lists/cards
- **Profile Management** — Display name and avatar URL

### Email Automation (Key Differentiator)
- **Monitors a shared FHE mailbox** (e.g., tasks@floridahorizoneng.com) every 60 seconds
- **Rules Engine** — Admins configure rules with filters:
  - Sender email address or domain
  - Recipient address
  - Subject line keywords
- **Auto-actions when rule matches:**
  - Creates a new card on a specified board + list
  - Auto-assigns specific FHE team members
  - Auto-applies labels
- **Rule Management UI** — Enable/disable rules without deleting them
- **Powered by Microsoft Graph API** (integrates natively with FHE's Microsoft 365 environment)

### Progressive Web App (PWA)
- **Installable** on desktop and mobile (works like a native app)
- **Offline-capable** (service worker)
- No app store needed — install directly from browser

### Security & Performance
- **Helmet.js** security headers
- **Rate limiting** (1,000 req/15min general; 20 req/15min on auth endpoints)
- **CORS** protection
- **HTTPS-only** in production
- **Health check endpoint** (`/api/health`) for monitoring

### Demo
- Standalone interactive demo (`demo.html`) — no server required
- Full UI walkthrough of all screens

---

## 3. CLOUD DEPLOYMENT DIRECTIVE PLAN — GO LIVE ON AZURE

### Prerequisites
- [ ] Azure account with active subscription
- [ ] Azure CLI installed (`az login` ready)
- [ ] Microsoft 365 admin access (for email automation)
- [ ] Domain name (optional — Azure provides a free `.azurewebsites.net` URL)

### Phase 1: One-Command Azure Deployment

The deployment script is already built. Run from the project root:

```bash
az login
./deploy/azure-deploy.sh fhe-project-board eastus
```

**What this does automatically:**
1. Creates an Azure Resource Group
2. Creates an Azure Container Registry (ACR)
3. Builds and pushes the Docker image to ACR
4. Provisions a PostgreSQL 16 Flexible Server (burstable B1ms tier)
5. Creates an Azure App Service Plan (B1 Linux)
6. Deploys the Web App container
7. Sets all environment variables securely
8. Enables HTTPS-only

**Estimated Azure Monthly Cost (B1 tier):**
| Service | Estimated Cost |
|---------|---------------|
| App Service Plan (B1) | ~$13/mo |
| PostgreSQL Flexible Server (B1ms) | ~$25/mo |
| Container Registry (Basic) | ~$5/mo |
| **Total** | **~$43/mo** |

> For lower cost, consider Railway.app (~$5/mo) or Render.com (free tier available) as alternatives.

### Phase 2: Post-Deployment Setup

After the script completes:

```bash
# 1. Run database migrations
az webapp ssh --resource-group fhe-project-board --name fhe-project-board
node server/dist/db/migrate.js

# 2. Seed the database (creates default admin + sample data)
node server/dist/db/seed.js
```

**Default admin login:**
- Email: `admin@floridahorizoneng.com`
- Password: `admin123`  ⚠️ **CHANGE IMMEDIATELY after first login**

### Phase 3: Email Automation Setup (Microsoft 365)

1. **Register an Azure AD App:**
   - Go to Azure Portal → Azure Active Directory → App Registrations → New
   - Name: "FHE Project Board"
   - Add API permission: `Mail.Read` (Application permission)
   - Grant admin consent
   - Create a client secret
   - Copy: Tenant ID, Client ID, Client Secret

2. **Set environment variables in Azure:**
   ```
   AZURE_TENANT_ID = <your-tenant-id>
   AZURE_CLIENT_ID = <your-client-id>
   AZURE_CLIENT_SECRET = <your-client-secret>
   EMAIL_MONITORED_MAILBOX = tasks@floridahorizoneng.com
   ```

3. **Create your first email rule** in the app's Admin → Email Rules panel

### Phase 4: Custom Domain (Optional)

```bash
# Add a custom domain to the Azure Web App
az webapp config hostname add \
  --resource-group fhe-project-board \
  --webapp-name fhe-project-board \
  --hostname board.floridahorizoneng.com
```

Then add a CNAME record in your DNS pointing to `fhe-project-board.azurewebsites.net`

### Phase 5: Automated Backups

Already configured in the Docker Compose setup. For Azure, enable automated backups:
```bash
az postgres flexible-server backup create \
  --resource-group fhe-project-board \
  --name fhe-project-board-db
```

---

## 4. ALTERNATIVE: OFFICE LAPTOP DEPLOYMENT (Zero Cloud Cost)

If Azure costs are a concern, the app can run from an office laptop/PC:

```bash
# One-time setup on the office machine
bash deploy/office-laptop/setup.sh
```

**Then for public HTTPS access (free):**
1. Create a free Cloudflare account
2. Create a Cloudflare Tunnel (see `deploy/office-laptop/REMOTE-ACCESS.md`)
3. Add the tunnel token to `.env`
4. Start the tunnel:
   ```bash
   docker compose -f deploy/office-laptop/docker-compose.prod.yml --profile tunnel up -d
   ```

**Result:** Live at `https://board.yourdomain.com` — free, HTTPS, no port forwarding needed.

---

## 5. TRELLO MIGRATION PLAN

### Overview
Import all existing FHE Trello boards, lists, and cards into the new system.

### Step 1: Export Trello Data
**Option A — Trello JSON Export (No API key needed):**
1. Open your Trello board
2. Click the board menu (3 dots) → More → Print and Export → Export as JSON
3. Save the `.json` file
4. Repeat for each board

**Option B — Trello REST API (Programmatic, for multiple boards):**
1. Get your Trello API Key: https://trello.com/app-key
2. Get your Token from the same page
3. Export all boards:
   ```
   GET https://api.trello.com/1/members/me/boards?key=KEY&token=TOKEN&fields=all
   GET https://api.trello.com/1/boards/{id}?key=KEY&token=TOKEN&cards=all&lists=all&members=all&checklists=all
   ```

### Step 2: Run the Import Script
A Trello-to-FHE import script needs to be built (see Step 3). It will:

| Trello | → | FHE Board |
|--------|---|-----------|
| Board | → | Board |
| List | → | List |
| Card | → | Card |
| Card description | → | Card description |
| Due date | → | Due date |
| Labels (colors) | → | Labels (mapped by color) |
| Members | → | Assignees (matched by email) |
| Checklists | → | Checklists + items |
| Comments | → | Comments |
| Attachments | → | Attachments (re-uploaded) |

### Step 3: Import Script to Build
File to create: `scripts/import-trello.ts`

```typescript
// Usage: npx ts-node scripts/import-trello.ts <path-to-trello-export.json> <target-board-id>
```

**Logic:**
1. Parse Trello JSON
2. Create board in FHE system (or map to existing)
3. Create lists in order
4. For each card:
   - Create card with title + description
   - Set due date if present
   - Create labels (match or create by color/name)
   - Add checklists and items
   - Add comments (with original author name prepended)
5. Report import summary

### Step 4: Member Mapping
Before running the import, create a `member-map.json`:
```json
{
  "trello_username_1": "user@floridahorizoneng.com",
  "trello_username_2": "user2@floridahorizoneng.com"
}
```
This ensures Trello cards are assigned to the correct FHE users.

---

## 6. LAUNCH CHECKLIST

### Pre-Launch
- [ ] Deploy to Azure (Phase 1 above)
- [ ] Run migrations and seed
- [ ] Change default admin password
- [ ] Create user accounts for all FHE staff
- [ ] Configure email automation (Azure AD app registration)
- [ ] Test email rule: send test email to tasks@floridahorizoneng.com → verify card is created
- [ ] Export all Trello boards to JSON
- [ ] Run Trello import script
- [ ] Verify all cards, lists, labels imported correctly
- [ ] Install PWA on team members' phones/desktops
- [ ] Set up custom domain (optional)

### Post-Launch
- [ ] Train team on new board (30-min walkthrough)
- [ ] Share login credentials securely
- [ ] Monitor `/api/health` endpoint
- [ ] Enable Azure backup schedule
- [ ] Decommission Trello boards (after team confirms all data transferred)

---

## 7. NEXT DEVELOPMENT PRIORITIES

Based on the current state, recommended next features:
1. **Notifications** — In-app or email alerts when cards are assigned or commented
2. **Board Templates** — Pre-built board structures for common FHE project types
3. **Reporting Dashboard** — Cards by status, overdue items, workload per team member
4. **Calendar View** — Visualize due dates across all boards
5. **Trello Import Script** — (Immediate priority — see Section 5)

---

*Document generated February 2026 — FHE Project Management Tracker*
