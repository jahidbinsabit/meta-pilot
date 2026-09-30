# Quick Setup Instructions

The following issues have been fixed in the codebase:

## ✅ Fixed Issues

1. **Docker port mapping corrected** - Changed `5440:5440` to `5440:5432` in docker-compose.yml
2. **BullMQ deprecation warnings fixed** - Added explicit Redis connection to all Workers
3. **Google OAuth configuration enhanced** - Added authorization params to fix "iss missing" error

## 🚀 Next Steps - Start PostgreSQL

You have PostgreSQL 18 installed locally. To start it and set up the database:

### Option 1: Using Local PostgreSQL (Recommended - No Docker needed)

```bash
# 1. Start PostgreSQL service
sudo systemctl start postgresql

# 2. Create the database and user
sudo -u postgres psql -c "CREATE USER mrdisable WITH PASSWORD 'mrdisable';"
sudo -u postgres psql -c "CREATE DATABASE genmetaai OWNER mrdisable;"
sudo -u postgres psql -c "ALTER USER mrdisable CREATEDB;"

# 3. Update the .env file DATABASE_URL (change port from 5440 to 5432)
sed -i 's/localhost:5440/localhost:5432/' .env

# 4. Push the database schema
npx prisma db push

# 5. Seed the database
npm run db:seed

# 6. Start the Next.js dev server
npm run dev
```

### Option 2: Using Docker (If you prefer Docker)

```bash
# 1. Add your user to docker group to avoid permission issues
sudo usermod -aG docker $USER
newgrp docker

# 2. Start the database containers
docker compose up -d db redis

# 3. Wait for database to be ready (about 10 seconds)
sleep 10

# 4. Push the database schema
npx prisma db push

# 5. Seed the database
npm run db:seed

# 6. Start the Next.js dev server
npm run dev
```

## 📝 Environment Variables

Your `.env` file needs to be updated based on which option you choose:

**For Local PostgreSQL (Option 1):**
```
DATABASE_URL="postgresql://mrdisable:mrdisable@localhost:5432/genmetaai"
```

**For Docker PostgreSQL (Option 2):**
```
DATABASE_URL="postgresql://mrdisable:mrdisable@localhost:5440/genmetaai"
```

## 🔍 Verification

After setup, verify everything is working:

```bash
# Check PostgreSQL is running
ss -ltnp | grep -E '(5432|5440)'

# Check Redis is running  
redis-cli ping

# Test database connection
npx prisma db push --skip-generate

# Start the app
npm run dev
```

Visit http://localhost:3000 and you should see the app without database errors.

## 🔐 Google OAuth Setup

The Google OAuth configuration has been fixed, but you need valid credentials:

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Update `.env` with your real `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

## ❌ Remaining Issues

After fixing the database connection, you may still see these until you configure them:
- S3/storage errors (if S3_ACCESS_KEY_ID not configured)
- Stripe errors (if STRIPE_SECRET_KEY not configured)
- Email errors (if SMTP settings not configured)

These are optional features and won't prevent the app from running.
