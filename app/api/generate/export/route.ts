import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { buildCsv, csvFilename, formatLabel, type ExportFormat } from '@/lib/generator/csv';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const body = await req.json();
    const {
      rows,
      format = 'adobe',
      category,
      releases,
      sendEmail = false,
    } = body as {
      rows: { fileName: string; title: string; description: string; keywords: string[] }[];
      format?: ExportFormat;
      category?: string;
      releases?: string;
      sendEmail?: boolean;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows_required' }, { status: 400 });
    }

    const csvRows = rows.map((r) => ({
      fileName: r.fileName,
      title: r.title,
      description: r.description,
      keywords: Array.isArray(r.keywords) ? r.keywords : [],
      category,
      releases,
    }));

    const csv = buildCsv(format, csvRows);
    const filename = csvFilename(format);

    // Persist to job history (audit trail of exports).
    await prisma.toolUsage.create({
      data: {
        userId: user.id,
        tool: `export:${format}`,
        metadata: {
          format,
          rowCount: csvRows.length,
          filename,
          category: category || null,
          releases: releases || null,
        } as any,
      },
    });

    if (sendEmail) {
      // Fire-and-forget email receipt if a mailer is configured.
      try {
        const { sendMail } = await import('@/lib/email');
        const label = formatLabel(format);
        await sendMail({
          to: user.email,
          subject: `${label} export ready`,
          html: `<p>Your <strong>${label}</strong> export (${csvRows.length} rows) is attached.</p><p>Filename: <code>${filename}</code></p>`,
          attachments: [{ filename, content: csv, contentType: 'text/csv' }],
        });
      } catch (e) {
        console.error('export email failed', e);
      }
    }

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('export failed', e);
    return NextResponse.json({ error: e?.message || 'export_failed' }, { status: 500 });
  }
}
