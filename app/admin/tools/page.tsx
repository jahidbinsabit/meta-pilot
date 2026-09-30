import { prisma } from '@/lib/db';
import { listTools, type ToolEntry } from '@/lib/tools/registry';
import { ToolsClient } from '@/components/admin/tools-client';

export default async function AdminToolsPage() {
  const tools = await listTools();
  return <ToolsClient tools={tools} />;
}
