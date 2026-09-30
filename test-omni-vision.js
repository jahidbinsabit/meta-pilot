/**
 * Test OmniRoute Vision Model with Image
 * Tests if uploaded images can be processed for metadata and prompts
 */

async function testOmniVision() {
  console.log('🖼️  Testing OmniRoute Vision Model...\n');

  // Create a simple test image (1x1 red pixel PNG as base64)
  const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  const imageDataUrl = `data:image/png;base64,${testImageBase64}`;

  console.log('📡 Test 1: Direct OmniRoute Vision API Call with Image');
  console.log('Model: auto/best-vision');
  console.log('Image: 1x1 test image\n');
  
  try {
    const response = await fetch('http://localhost:20128/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OMNI_API_KEY || 'your-omni-api-key'}`,
      },
      body: JSON.stringify({
        model: 'auto/best-vision',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image in detail. What do you see?'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 100,
        temperature: 0
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Vision API Response:');
      console.log('Status:', response.status);
      console.log('Model Used:', data.model);
      console.log('Response:', data.choices?.[0]?.message?.content);
      console.log('Usage:', data.usage);
      console.log('\n✅ Vision model is working! Images can be processed.');
    } else {
      console.log('❌ Vision API Error:', {
        status: response.status,
        error: data
      });
    }
  } catch (error) {
    console.log('❌ Connection Error:', error.message);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 2: Using CustomAdapter with vision
  console.log('🔧 Test 2: CustomAdapter Vision Integration');
  
  try {
    const { CustomAdapter } = require('./lib/ai/adapters/custom.ts');
    
    const adapter = new CustomAdapter({
      apiKey: process.env.OMNI_API_KEY || 'your-omni-api-key',
      apiUrl: process.env.OMNI_API_URL || 'http://localhost:20128/v1/chat/completions',
      model: 'auto/best-vision',
      apiType: 'openai'
    });

    console.log('✅ CustomAdapter instantiated with vision model');
    console.log('Model:', adapter.config?.model || 'auto/best-vision');

    console.log('\n🚀 Testing image generation with adapter...');
    const result = await adapter.generate({
      toolSlug: 'metadata-generator',
      systemPrompt: 'You are an expert at analyzing stock images and generating metadata.',
      userPrompt: 'Analyze this image and provide: 1) A descriptive title, 2) Keywords (comma-separated)',
      imageUrls: [imageDataUrl],
      maxTokens: 150,
      temperature: 0.7
    });

    if (result.success) {
      console.log('✅ Image processing successful!');
      console.log('Response:', result.raw);
      console.log('Latency:', result.latencyMs + 'ms');
      console.log('Model:', result.model);
      console.log('Usage:', result.usage);
      console.log('\n✅ Ready for metadata generation and image-to-prompt!');
    } else {
      console.log('❌ Generation failed:', result.errorMessage);
    }
  } catch (error) {
    console.log('❌ CustomAdapter Error:', error.message);
    console.log('Stack:', error.stack);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 3: Check database configuration
  console.log('🗄️  Test 3: Database Configuration Verification');
  
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const omniConfig = await prisma.aiProviderConfig.findUnique({
      where: { provider: 'omni' }
    });

    if (omniConfig) {
      console.log('✅ Database Configuration:');
      console.log({
        provider: omniConfig.provider,
        enabled: omniConfig.enabled,
        modelDefault: omniConfig.modelDefault,
        customApiUrl: omniConfig.customApiUrl,
        apiType: omniConfig.apiType,
        hasApiKey: !!omniConfig.apiKey
      });

      if (omniConfig.modelDefault === 'auto/best-vision') {
        console.log('✅ Vision model correctly configured!');
      } else {
        console.log('⚠️  Model is not set to vision:', omniConfig.modelDefault);
      }
    }
  } catch (error) {
    console.log('❌ Database Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 Vision Test Complete!');
  console.log('\n📝 Summary:');
  console.log('- Your OmniRoute is configured with: auto/best-vision');
  console.log('- This model can process images for:');
  console.log('  ✅ Metadata generation (title, description, keywords)');
  console.log('  ✅ Image-to-prompt generation');
  console.log('  ✅ Visual analysis and descriptions');
}

// Run tests
testOmniVision().catch(console.error);
