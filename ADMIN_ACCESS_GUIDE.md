# Admin Panel Access Guide

## ✅ Admin Panel is Ready!

Your admin panel has been successfully configured and is ready to use.

---

## 🔐 Default Admin Credentials

**Admin Login URL:** http://localhost:3000/login?callbackUrl=%2Fadmin

**Default Credentials:**
- **Email:** `admin@stockforge.local`
- **Password:** `admin123`

---

## 📋 Step-by-Step Login Instructions

1. **Open your browser** and navigate to:
   ```
   http://localhost:3000/login
   ```

2. **Enter the credentials:**
   - Email: `admin@stockforge.local`
   - Password: `admin123`

3. **Click "Sign in"**

4. **You will be redirected to:** http://localhost:3000/admin

---

## 🎯 What Was Fixed

The following issues have been resolved:

### 1. **Login Page Fixed**
   - Updated the login page to use NextAuth's `signIn()` function correctly
   - Fixed the credentials authentication flow
   - Added proper callback URL handling

### 2. **Port Configuration**
   - Server is now running on the correct port: **3000**
   - Previous port conflict has been resolved

### 3. **Admin User Verified**
   - Admin user exists in database ✓
   - Correct role assigned: `ADMIN` ✓
   - Password hash is properly set ✓
   - Credits: 10,000
   - Membership: ENTERPRISE

---

## 🛠️ Admin Panel Features

Once logged in, you'll have access to:

- **Overview/Dashboard** - System statistics and metrics
- **Users Management** - View and manage all users
- **Plans & Pricing** - Configure membership plans
- **Credit Packages** - Manage credit packages
- **AI Providers** - Configure Gemini/OpenAI settings
- **Payment Gateways** - Setup bKash, Nagad, Stripe
- **Site Settings** - Global site configuration
- **Tools Registry** - Manage available tools
- **Notifications** - Create and manage announcements
- **Audit Log** - View all admin actions
- **Analytics** - Platform analytics and insights
- **Homepage Editor** - Edit homepage content

---

## 🔄 Alternative: Direct Admin URL

After logging in, you can directly access the admin panel at:
```
http://localhost:3000/admin
```

If you're not logged in, you'll be automatically redirected to the login page.

---

## 🚀 Server Status

Your Next.js development server is currently running:
- **URL:** http://localhost:3000
- **Status:** ✅ Running
- **Environment:** Development

To check if the server is running:
```bash
ps aux | grep 'next dev' | grep -v grep
```

To restart the server:
```bash
# Stop the server
pkill -f 'next dev'

# Start the server
cd /home/mrdisable/Desktop/metadata_tools
npm run dev
```

---

## 🔧 Troubleshooting

### Problem: "Invalid email or password"
**Solution:** The credentials are case-sensitive. Make sure you're using:
- Email: `admin@stockforge.local` (all lowercase)
- Password: `admin123`

### Problem: Redirected to /dashboard instead of /admin
**Solution:** Your user account doesn't have ADMIN role. To promote a user:
```bash
cd /home/mrdisable/Desktop/metadata_tools
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.user.update({where:{email:'your@email.com'},data:{role:'ADMIN'}}).then(()=>p.\$disconnect());
"
```

### Problem: Page not loading
**Solution:** Make sure the development server is running on port 3000:
```bash
cd /home/mrdisable/Desktop/metadata_tools
npm run dev
```

---

## 🔑 Creating Additional Admin Users

### Method 1: Using the Admin Panel
1. Login as admin
2. Go to **Admin → Users**
3. Find the user you want to promote
4. Click "Set Role" → "ADMIN"

### Method 2: Using Command Line
```bash
cd /home/mrdisable/Desktop/metadata_tools
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.user.update({
  where:{email:'user@example.com'},
  data:{role:'ADMIN'}
}).then(()=>p.\$disconnect());
"
```

### Method 3: During Database Seed
Edit `.env` file before running seed:
```bash
SEED_ADMIN_EMAIL=your@email.com
SEED_PASSWORD=yourpassword
```

Then run:
```bash
npm run db:seed
```

---

## 📊 Admin User Details

Current admin user in database:
- **Email:** admin@stockforge.local
- **Role:** ADMIN
- **Membership Tier:** ENTERPRISE
- **Credits:** 10,000
- **Status:** Active
- **Authentication:** Email/Password (Password Hash stored securely)

---

## 🔒 Security Notes

1. **Change the default password** after first login (once account settings are implemented)
2. The password is hashed using bcrypt with 12 salt rounds
3. Admin routes are protected by middleware that checks for ADMIN role
4. Session tokens include role information for fast authorization checks

---

## 📝 Quick Reference

| Item | Value |
|------|-------|
| Login URL | http://localhost:3000/login |
| Admin Panel URL | http://localhost:3000/admin |
| Default Email | admin@stockforge.local |
| Default Password | admin123 |
| Server Port | 3000 |
| Database | PostgreSQL (localhost:5432) |

---

## ✨ Next Steps

1. **Login to the admin panel** using the credentials above
2. **Explore the admin features** and familiarize yourself with the interface
3. **Configure AI providers** (Gemini/OpenAI) in Admin → AI Providers
4. **Setup payment gateways** in Admin → Payment Gateways (optional)
5. **Customize site settings** in Admin → Settings

---

## 📞 Need Help?

If you encounter any issues:
1. Check the browser console for errors (F12 → Console)
2. Check the server logs: `tail -f /tmp/nextjs-dev.log`
3. Verify the database connection: `npx prisma db push`
4. Ensure all environment variables are set correctly in `.env`

---

**Last Updated:** September 26, 2026  
**Version:** 1.0  
**Status:** ✅ Working
