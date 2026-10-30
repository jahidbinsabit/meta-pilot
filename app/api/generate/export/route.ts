import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { rateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';
import { buildCsv, csvFilename, formatLabel, type ExportFormat } from '@/lib/generator/csv';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();

    // R9 S9-04: exports build an unbounded CSV in memory per call —
    // cap per user.
    const rl = rateLimit(`generate-export:${user.id}`, {
      max: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }

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

    // T2-04: report the email outcome to the client instead of dropping
    // it silently. sendMail returns false when SMTP is not configured
    // (the parked state) and throws on transport errors — both used to
    // vanish into a log line while the UI implied a copy was emailed.
    let emailDelivery: 'sent' | 'unavailable' | 'not-requested' = 'not-requested';
    if (sendEmail) {
      try {
        const { sendMail } = await import('@/lib/email');
        const label = formatLabel(format);
        const sent = await sendMail({
          to: user.email,
          subject: `${label} export ready`,
          html: `<p>Your <strong>${label}</strong> export (${csvRows.length} rows) is attached.</p><p>Filename: <code>${filename}</code></p>`,
          attachments: [{ filename, content: csv, contentType: 'text/csv' }],
        });
        emailDelivery = sent ? 'sent' : 'unavailable';
      } catch (e) {
        console.error('export email failed', e);
        emailDelivery = 'unavailable';
      }
    }

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Email-Delivery': emailDelivery,
      },
    });
  } catch (e: any) {
    console.error('export failed', e);
    return NextResponse.json({ error: 'export_failed' }, { status: 500 });
  }
}
