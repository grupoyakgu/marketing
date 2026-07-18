import { NextResponse } from 'next/server';
import { updatePost, deletePost, type PostUpdate } from '@/lib/marketing-plan';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const fields: PostUpdate = {};
  if (typeof body.content === 'string') fields.content = body.content;
  if (typeof body.scheduled_date === 'string') fields.scheduled_date = body.scheduled_date;
  if (typeof body.scheduled_time === 'string') fields.scheduled_time = body.scheduled_time;
  if (body.platform === 'linkedin' || body.platform === 'facebook' || body.platform === 'instagram') {
    fields.platform = body.platform;
  }
  if (typeof body.image_url === 'string' || body.image_url === null) fields.image_url = body.image_url;

  const post = await updatePost(params.id, fields);
  console.log(`[dashboard/plan PATCH] id=${params.id} fields=${JSON.stringify(fields)} savedImageUrl=${post.image_url ?? 'null'}`);
  return NextResponse.json(
    { post },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
  );
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await deletePost(params.id);
  return NextResponse.json({ ok: true });
}
