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

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET required)');
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  // Use /resources/image with optional prefix — works on all Cloudinary plans
  const params = new URLSearchParams({ type: 'upload', max_results: '50' });
  if (folder) params.set('prefix', folder);

  const res = await fetch(`${CLOUDINARY_API}/${cloudName}/resources/image?${params}`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const resources: { public_id: string; secure_url: string; filename?: string }[] = json.resources ?? [];

  if (resources.length === 0 && folder) {
    // Retry without prefix in case images are at root level
    const res2 = await fetch(`${CLOUDINARY_API}/${cloudName}/resources/image?type=upload&max_results=50`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res2.ok) {
      const json2 = await res2.json();
      const all: { public_id: string; secure_url: string; filename?: string }[] = json2.resources ?? [];
      return all.map(r => ({
        id: r.public_id,
        name: r.filename ?? r.public_id.split('/').pop() ?? r.public_id,
        url: r.secure_url,
      }));
    }
  }

  return resources.map(r => ({
    id: r.public_id,
    name: r.filename ?? r.public_id.split('/').pop() ?? r.public_id,
    url: r.secure_url,
  }));
}
