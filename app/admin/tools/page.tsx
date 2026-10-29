import { listTools } from '@/lib/tools/registry';
import { ToolsClient } from '@/components/admin/tools-client';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

export default async function AdminToolsPage() {
  const tools = await listTools();
  return <ToolsClient tools={tools} />;
}
