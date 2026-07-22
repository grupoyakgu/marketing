const CLOUDINARY_API = 'https://api.cloudinary.com/v1_1';

export interface CloudinaryImage {
  id: string;
  name: string;
  url: string;
}

export interface CloudinaryFolderImages {
  folder: string;
  images: CloudinaryImage[];
}

function getCredentials() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET required)');
  }
  return { cloudName, apiKey, apiSecret };
}

function mapResource(r: { public_id: string; secure_url: string; filename?: string }): CloudinaryImage {
  return {
    id: r.public_id,
    name: r.filename ?? r.public_id.split('/').pop() ?? r.public_id,
    url: r.secure_url,
  };
}

async function fetchResources(cloudName: string, auth: string, prefix?: string): Promise<CloudinaryImage[]> {
  // Use /resources/image with optional prefix — works on all Cloudinary plans
  // (the alternative /resources/search endpoint requires a paid Search API add-on).
  // NOTE: prefix matches against public_id, which does NOT reflect an asset's
  // folder on accounts using Cloudinary's Dynamic Folders (folder is separate
  // metadata there) — see listResourcesByAssetFolder below for that case.
  const params = new URLSearchParams({ type: 'upload', max_results: '50' });
  if (prefix) params.set('prefix', prefix);

  const res = await fetch(`${CLOUDINARY_API}/${cloudName}/resources/image?${params}`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const resources: { public_id: string; secure_url: string; filename?: string }[] = json.resources ?? [];
  return resources.map(mapResource);
}

/** Flat listing under CLOUDINARY_FOLDER — used by Pepe's browse_drive_images
 * tool and the post-schedule cron's fallback image pick. Unrelated to the
 * dashboard's per-project gallery below. */
export async function listCloudinaryImages(): Promise<CloudinaryImage[]> {
  const { cloudName, apiKey, apiSecret } = getCredentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const folder = process.env.CLOUDINARY_FOLDER;

  const images = await fetchResources(cloudName, auth, folder);
  if (images.length === 0 && folder) {
    // Retry without prefix in case images are at root level
    return fetchResources(cloudName, auth);
  }
  return images;
}

// ─── Per-project gallery (Dynamic Folders) ─────────────────────────────────
//
// Confirmed via production logs: this Cloudinary account uses Dynamic
// Folders — every asset's folder lives in its `asset_folder` metadata field
// (e.g. "marketing/images/Peral 23"), while `public_id` itself has no folder
// segment at all (e.g. "YK-_AP1_17_vq7yff"). A public_id-prefix search can
// never match these, regardless of what prefix is used, so the picker uses
// Cloudinary's dedicated by_asset_folder endpoint instead, and discovers
// subfolders dynamically under the root so the real structure (whatever
// projects exist under it) is always reflected instead of a hardcoded list.

const GALLERY_ROOT = process.env.CLOUDINARY_GALLERY_ROOT ?? 'marketing/images';

async function listChildFolders(cloudName: string, auth: string, path: string): Promise<string[]> {
  const res = await fetch(`${CLOUDINARY_API}/${cloudName}/folders/${path.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary folders API error ${res.status}: ${body}`);
  }
  const json = await res.json();
  const folders: { name: string }[] = json.folders ?? [];
  return folders.map(f => f.name);
}

async function listResourcesByAssetFolder(cloudName: string, auth: string, assetFolder: string): Promise<CloudinaryImage[]> {
  const params = new URLSearchParams({ asset_folder: assetFolder, max_results: '50' });
  const res = await fetch(`${CLOUDINARY_API}/${cloudName}/resources/by_asset_folder?${params}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary by_asset_folder API error ${res.status}: ${body}`);
  }
  const json = await res.json();
  const resources: { public_id: string; secure_url: string; filename?: string }[] = json.resources ?? [];
  return resources.map(mapResource);
}

/** Lists each project subfolder under CLOUDINARY_GALLERY_ROOT (default
 * "marketing/images") separately — never merged — for the planner's image
 * picker. Subfolders are discovered dynamically, so the picker always
 * reflects whatever projects actually exist under the root. */
export async function listCloudinaryImagesByFolder(): Promise<CloudinaryFolderImages[]> {
  const { cloudName, apiKey, apiSecret } = getCredentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const childNames = await listChildFolders(cloudName, auth, GALLERY_ROOT);

  return Promise.all(
    childNames.map(async name => {
      const assetFolder = `${GALLERY_ROOT}/${name}`;
      try {
        const images = await listResourcesByAssetFolder(cloudName, auth, assetFolder);
        return { folder: name, images };
      } catch (err) {
        console.error(`listCloudinaryImagesByFolder failed for "${assetFolder}": ${err instanceof Error ? err.message : err}`);
        return { folder: name, images: [] };
      }
    })
  );
}
