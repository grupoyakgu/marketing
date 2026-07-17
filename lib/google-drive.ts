const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const FOLDER_ID = '1i786xTTwudLBpTBK221OBRqnn1YCV2d7';

export interface DriveImage {
  id: string;
  name: string;
  url: string;
}

export async function listDriveImages(): Promise<DriveImage[]> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_DRIVE_API_KEY not configured');

  const params = new URLSearchParams({
    q: `'${FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: 'files(id,name,mimeType)',
    key: apiKey,
    pageSize: '50',
  });

  const res = await fetch(`${DRIVE_API}/files?${params}`);
  if (!res.ok) throw new Error(`Google Drive API error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const files: { id: string; name: string }[] = json.files ?? [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marketing-grupo-yakgu.vercel.app';
  return files.map(f => ({
    id: f.id,
    name: f.name,
    url: `${appUrl}/api/drive-image?id=${f.id}`,
  }));
}
