import { AiProvidersClient } from '@/components/admin/ai-providers-client';
import { listProviderConfigs } from '@/lib/ai/config';

export default async function AiProvidersPage() {
  // Direct server-side data fetching instead of HTTP request
  const configs = await listProviderConfigs().catch(() => []);
  return <AiProvidersClient configs={configs} />;
}
