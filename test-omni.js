/**
 * Test script for OmniRoute custom provider
 * Tests direct API call and database sync
 */

async function testOmniRoute() {
  console.log('🧪 Testing OmniRoute Integration...\n');

  // Test 1: Direct API call to OmniRoute
  console.log('📡 Test 1: Direct OmniRoute API Call');
  console.log('URL: http://localhost:20128/v1/chat/completions');
  
  try {
    const response = await fetch('http://localhost:20128/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OMNI_API_KEY || 'your-omni-api-key'}`,
      },
      body: JSON.stringify({
        model: 'auto/best-chat',
        messages: [
          { role: 'system', content: 'You are a test assistant.' },
          { role: 'user', content: 'Say "OK" in one word.' }
        ],
        max_tokens: 10,
        temperature: 0
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ OmniRoute API Response:', {
        status: response.status,
        model: data.model,
        content: data.choices?.[0]?.message?.content,
        usage: data.usage
      });
    } else {
      console.log('❌ OmniRoute API Error:', {
        status: response.status,
        error: data
      });
    }
  } catch (error) {
    console.log('❌ Connection Error:', error.message);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 2: Check database configuration
  console.log('🗄️  Test 2: Database Configuration Check');
  
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const omniConfig = await prisma.aiProviderConfig.findUnique({
      where: { provider: 'omni' }
    });

    if (omniConfig) {
      console.log('✅ Database Configuration Found:');
      console.log({
        provider: omniConfig.provider,
        enabled: omniConfig.enabled,
        modelDefault: omniConfig.modelDefault,
        customApiUrl: omniConfig.customApiUrl,
        apiType: omniConfig.apiType,
        hasApiKey: !!omniConfig.apiKey,
        priority: omniConfig.priority
      });

      // Validate configuration
      const issues = [];
      if (!omniConfig.enabled) issues.push('❌ Provider is disabled');
      if (!omniConfig.apiKey) issues.push('❌ API Key is missing');
      if (!omniConfig.customApiUrl) issues.push('❌ Custom API URL is missing');
      if (!omniConfig.modelDefault) issues.push('❌ Default model is missing');

      if (issues.length === 0) {
        console.log('✅ Configuration is valid and ready to use!');
      } else {
        console.log('\n⚠️  Configuration Issues:');
        issues.forEach(issue => console.log(issue));
      }
    } else {
      console.log('❌ Omni provider not found in database');
    }
  } catch (error) {
    console.log('❌ Database Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 3: Check if CustomAdapter can be instantiated
  console.log('🔧 Test 3: CustomAdapter Integration Check');
  
  try {
    const { CustomAdapter } = require('./lib/ai/adapters/custom.ts');
    
    const adapter = new CustomAdapter({
      apiKey: process.env.OMNI_API_KEY || 'your-omni-api-key',
      apiUrl: process.env.OMNI_API_URL || 'http://localhost:20128/v1/chat/completions',
      model: 'auto/best-chat',
      apiType: 'openai'
    });

    console.log('✅ CustomAdapter instantiated successfully');
    console.log('Adapter ID:', adapter.id);
    console.log('Adapter Name:', adapter.name);

    // Test health check
    console.log('\n🏥 Running health check...');
    const healthy = await adapter.healthcheck();
    console.log(healthy ? '✅ Health check passed' : '❌ Health check failed');

    if (healthy) {
      console.log('\n🚀 Testing generation...');
      const result = await adapter.generate({
        toolSlug: 'test',
        systemPrompt: 'You are a test assistant.',
        userPrompt: 'Say "Hello from OmniRoute" in exactly that phrase.',
        maxTokens: 20,
        temperature: 0
      });

      if (result.success) {
        console.log('✅ Generation successful!');
        console.log('Response:', result.raw);
        console.log('Latency:', result.latencyMs + 'ms');
        console.log('Usage:', result.usage);
      } else {
        console.log('❌ Generation failed:', result.errorMessage);
      }
    }
  } catch (error) {
    console.log('❌ CustomAdapter Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 Test Complete!');
}

// Run tests
testOmniRoute().catch(console.error);
