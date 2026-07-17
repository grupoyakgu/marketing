const CLOUDINARY_API = 'https://api.cloudinary.com/v1_1';

export interface CloudinaryImage {
  id: string;
  name: string;
  url: string;
}

export async function listCloudinaryImages(): Promise<CloudinaryImage[]> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folder = process.env.CLOUDINARY_FOLDER;

  if (!cloudName || !apiKey || !apiSecret || !folder) {
    throw new Error('Cloudinary not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER)');
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const res = await fetch(`${CLOUDINARY_API}/${cloudName}/resources/search`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expression: `folder:${folder}`, max_results: 50 }),
  });

  if (!res.ok) throw new Error(`Cloudinary API error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const resources: { public_id: string; secure_url: string; filename?: string }[] = json.resources ?? [];

  return resources.map(r => ({
    id: r.public_id,
    name: r.filename ?? r.public_id.split('/').pop() ?? r.public_id,
    url: r.secure_url,
  }));
}
