# How to Get a Valid Gemini API Key

## Steps to Get Your Gemini API Key

1. **Go to Google AI Studio**
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in with your Google account

2. **Create API Key**
   - Click "Create API Key" button
   - Select your Google Cloud project (or create a new one)
   - Copy the generated API key

3. **API Key Format**
   - Valid Gemini API keys start with: `AIza`
   - Length: approximately 39 characters
   - Example format: `AIzaSyD1234567890abcdefghijklmnopqrstu`

4. **Update Your .env File**
   - Open `/home/mrdisable/Desktop/metadata_tools/.env`
   - Replace the GEMINI_API_KEY value with your new valid key
   - Example:
     ```
     GEMINI_API_KEY="AIzaSyYourActualKeyHere123456789"
     ```

5. **Update Database (Important!)**
   After updating .env, run this command to update the database:
   ```bash
   npm run db:seed
   ```
   Or manually update with:
   ```bash
   npx prisma db execute --stdin <<< "UPDATE \"AiProviderConfig\" SET \"apiKey\" = NULL WHERE provider = 'gemini';"
   ```
   Then restart your app - it will read from the .env file.

## Alternative: Use OpenAI Only

If you prefer to use OpenAI instead:

1. **Add OpenAI Credits**
   - Go to: https://platform.openai.com/settings/organization/billing/
   - Add billing information
   - Add at least $5 in credits

2. **Set OpenAI as Primary Provider**
   - Update database:
     ```bash
     npx prisma db execute --stdin <<< "UPDATE \"AiProviderConfig\" SET enabled = false WHERE provider = 'gemini';"
     npx prisma db execute --stdin <<< "UPDATE \"AiProviderConfig\" SET enabled = true WHERE provider = 'openai';"
     ```

3. **Restart Your App**
   ```bash
   npm run dev
   ```

## Current Status

❌ **Gemini API Key**: Invalid format (starts with `AQ.Ab8...` instead of `AIza...`)
❌ **OpenAI API Key**: No credits remaining

**You need to fix at least ONE of these to use the metadata generator!**
