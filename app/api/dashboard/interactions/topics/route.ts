import { NextResponse } from 'next/server';
import { addTopic } from '@/lib/interactions';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  if (!topic) return NextResponse.json({ error: 'topic is required.' }, { status: 400 });

  try {
    const row = await addTopic(topic, 'user');
    return NextResponse.json({ topic: row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add topic.' },
      { status: 400 }
    );
  }
}
