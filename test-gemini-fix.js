/**
 * Test and fix Gemini configuration
 */

const { PrismaClient } = require('@prisma/client');
const { decryptSecret } = require('./lib/crypto');

async function testGemini() {
  console.log('🔍 Checking Gemini Configuration...\n');
  
  const prisma = new PrismaClient();
  
  try {
    // 1. Check database configuration
    const geminiConfig = await prisma.aiProviderConfig.findUnique({
      where: { provider: 'gemini' }
    });
    
    console.log('📊 Database Config:');
    console.log('- Provider:', geminiConfig.provider);
    console.log('- Enabled:', geminiConfig.enabled);
    console.log('- Model:', geminiConfig.modelDefault);
    console.log('- Has API Key:', !!geminiConfig.apiKey);
    console.log('- Active for tools:', geminiConfig.isActiveForToolSlug);
    
    if (!geminiConfig.apiKey) {
      console.log('\n❌ No API key found in database!');
      return;
    }
    
    // 2. Decrypt and test API key
    const apiKey = decryptSecret(geminiConfig.apiKey);
    console.log('\n🔑 API Key Info:');
    console.log('- Length:', apiKey.length);
    console.log('- Starts with:', apiKey.substring(0, 10) + '...');
    
    // 3. Test Gemini API
    console.log('\n🧪 Testing Gemini API...');
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiConfig.modelDefault}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'Say OK' }]
          }]
        })
      }
    );
    
    const data = await response.json();
    
    console.log('Status:', response.status);
    
    if (response.ok) {
      console.log('✅ Gemini API is WORKING!');
      console.log('Response:', data.candidates?.[0]?.content?.parts?.[0]?.text);
    } else {
      console.log('❌ Gemini API Error:');
      console.log(JSON.stringify(data, null, 2));
    }
    
    // 4. Check tool routing
    console.log('\n🔧 Checking Tool Routing...');
    
    const { getActiveProviderForTool } = require('./lib/ai/config');
    
    const metadataProvider = await getActiveProviderForTool('metadata-generator');
    console.log('- metadata-generator uses:', metadataProvider);
    
    const imagePromptProvider = await getActiveProviderForTool('image-to-prompt');
    console.log('- image-to-prompt uses:', imagePromptProvider);
    
    if (metadataProvider === 'gemini' && imagePromptProvider === 'gemini') {
      console.log('\n✅ Tool routing is correctly configured!');
    } else {
      console.log('\n⚠️  Tools are not routing to Gemini!');
      console.log('Expected: gemini, Got:', metadataProvider);
    }
    
    // 5. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📝 Summary:');
    if (response.ok && metadataProvider === 'gemini') {
      console.log('✅ Gemini is fully configured and working!');
      console.log('✅ Ready for metadata generation with images!');
    } else {
      console.log('❌ Issues found. Check errors above.');
    }
    
  } catch (error) {
    console.log('\n❌ Error:', error.message);
    console.log(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testGemini().catch(console.error);
