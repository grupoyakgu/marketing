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

/** Uploads a remote video (e.g. a HeyGen result) into Cloudinary by URL —
 * Cloudinary fetches it server-side rather than us downloading and
 * re-uploading the bytes ourselves. Authenticates the same way the admin
 * listing calls above do (HTTP Basic with api_key:api_secret), which the
 * Upload API accepts as an alternative to a computed signature. */
export async function uploadVideoFromUrl(sourceUrl: string): Promise<{ url: string } | { error: string }> {
  const { cloudName, apiKey, apiSecret } = getCredentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const res = await fetch(`${CLOUDINARY_API}/${cloudName}/video/upload`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ file: sourceUrl, resource_type: 'video' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Cloudinary uploadVideoFromUrl failed: ${res.status} ${JSON.stringify(json)}`);
    return { error: json.error?.message ?? `Cloudinary upload failed (${res.status}).` };
  }
  return { url: json.secure_url };
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
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const names: string[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ max_results: '500' });
    if (cursor) params.set('next_cursor', cursor);

    const res = await fetch(`${CLOUDINARY_API}/${cloudName}/folders/${encodedPath}?${params}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cloudinary folders API error ${res.status}: ${body}`);
    }
    const json = await res.json();
    const folders: { name: string }[] = json.folders ?? [];
    names.push(...folders.map(f => f.name));
    cursor = json.next_cursor;
  } while (cursor);

  return names;
}

// Cloudinary caps each by_asset_folder response at 500 results and returns a
// next_cursor when there's more — capped here at 10 pages (5,000 images) as a
// sanity limit, far beyond any real project folder, so a runaway account
// state can't loop forever.
async function listResourcesByAssetFolder(cloudName: string, auth: string, assetFolder: string): Promise<CloudinaryImage[]> {
  const all: CloudinaryImage[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ asset_folder: assetFolder, max_results: '500' });
    if (cursor) params.set('next_cursor', cursor);

    const res = await fetch(`${CLOUDINARY_API}/${cloudName}/resources/by_asset_folder?${params}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cloudinary by_asset_folder API error ${res.status}: ${body}`);
    }
    const json = await res.json();
    const resources: { public_id: string; secure_url: string; filename?: string; resource_type?: string; type?: string }[] =
      json.resources ?? [];
    // TEMP DIAGNOSTIC — a user reported seeing fewer images in the picker than
    // in the Cloudinary console for one folder; logging the raw resource_type/
    // type/public_id here to see what by_asset_folder actually returns vs what
    // the console shows, since api.cloudinary.com isn't reachable from this
    // sandbox to check directly. Remove once root-caused.
    console.error(
      `[cloudinary debug] by_asset_folder("${assetFolder}") returned ${resources.length} resource(s): ` +
        JSON.stringify(resources.map(r => ({ public_id: r.public_id, resource_type: r.resource_type, type: r.type })))
    );
    all.push(...resources.map(mapResource));

    cursor = json.next_cursor;
    if (!cursor) break;
  }

  return all;
}

/** Lists each project subfolder under CLOUDINARY_GALLERY_ROOT (default
 * "marketing/images") separately — never merged — for the planner's image
 * picker. Subfolders are discovered dynamically, so the picker always
 * reflects whatever projects actually exist under the root. Also includes
 * images uploaded directly into the root itself (asset_folder ===
 * GALLERY_ROOT, no subfolder) as a "General" bucket — by_asset_folder is an
 * exact match, so those were previously invisible since only subfolder
 * paths were ever queried. */
export async function listCloudinaryImagesByFolder(): Promise<CloudinaryFolderImages[]> {
  const { cloudName, apiKey, apiSecret } = getCredentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const childNames = await listChildFolders(cloudName, auth, GALLERY_ROOT);

  const [rootImages, subfolders] = await Promise.all([
    listResourcesByAssetFolder(cloudName, auth, GALLERY_ROOT).catch(err => {
      console.error(`listCloudinaryImagesByFolder failed for root "${GALLERY_ROOT}": ${err instanceof Error ? err.message : err}`);
      return [] as CloudinaryImage[];
    }),
    Promise.all(
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
    ),
  ]);

  return rootImages.length > 0 ? [{ folder: 'General', images: rootImages }, ...subfolders] : subfolders;
}
