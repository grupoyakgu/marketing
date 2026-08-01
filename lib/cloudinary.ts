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
  // metadata there) — see listAllImageResources below for that case.
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
// never match these, regardless of what prefix is used.
//
// The dedicated by_asset_folder endpoint was tried first but proved
// unreliable in production: for one folder it silently omitted a resource
// whose asset_folder metadata exactly matched the query (confirmed by
// comparing its response against a plain account-wide listing, which
// correctly included that resource). So instead we do one broad, paginated
// listing of every image and group by its asset_folder field ourselves —
// slower per-request but consistent, and it's one call plus pagination
// rather than one call per folder.

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

interface CloudinaryResource {
  public_id: string;
  secure_url: string;
  filename?: string;
  asset_folder?: string;
}

// Capped at 10 pages (5,000 images) as a sanity limit, far beyond any real
// account size, so a runaway account state can't loop forever.
async function listAllImageResources(cloudName: string, auth: string): Promise<CloudinaryResource[]> {
  const all: CloudinaryResource[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ max_results: '500' });
    if (cursor) params.set('next_cursor', cursor);

    const res = await fetch(`${CLOUDINARY_API}/${cloudName}/resources/image?${params}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cloudinary resources API error ${res.status}: ${body}`);
    }
    const json = await res.json();
    all.push(...((json.resources ?? []) as CloudinaryResource[]));

    cursor = json.next_cursor;
    if (!cursor) break;
  }

  return all;
}

/** Lists each project subfolder under CLOUDINARY_GALLERY_ROOT (default
 * "marketing/images") separately — never merged — for the planner's image
 * picker. Folder names come from the union of listChildFolders (Cloudinary's
 * dedicated folders index, so a folder still shows up even with zero images
 * in it yet) and whatever asset_folder values actually appear in the broad
 * account-wide resource listing — the folders index has proven to lag behind
 * reality (a newly-added folder didn't show up there even though its images
 * were already listed via asset_folder), so a folder is shown the moment it
 * has at least one image, without waiting on that index to catch up. Images
 * uploaded directly into the root itself (asset_folder === GALLERY_ROOT, no
 * subfolder) surface as a "General" bucket. */
export async function listCloudinaryImagesByFolder(): Promise<CloudinaryFolderImages[]> {
  const { cloudName, apiKey, apiSecret } = getCredentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const [childNames, allResources] = await Promise.all([
    listChildFolders(cloudName, auth, GALLERY_ROOT),
    listAllImageResources(cloudName, auth),
  ]);

  const rootPrefix = `${GALLERY_ROOT}/`;
  const byFolder = new Map<string, CloudinaryImage[]>();
  const rootImages: CloudinaryImage[] = [];

  for (const r of allResources) {
    if (!r.asset_folder) continue;
    if (r.asset_folder === GALLERY_ROOT) {
      rootImages.push(mapResource(r));
    } else if (r.asset_folder.startsWith(rootPrefix)) {
      const name = r.asset_folder.slice(rootPrefix.length);
      if (!byFolder.has(name)) byFolder.set(name, []);
      byFolder.get(name)!.push(mapResource(r));
    }
  }

  // TEMP DIAGNOSTIC — a user reports a "food" folder still missing from the
  // picker even after deriving folder names from asset_folder values. Logging
  // every distinct asset_folder seen account-wide (not per-resource, so this
  // stays short) to see the folder's exact real path/casing. Remove once
  // root-caused.
  const distinctAssetFolders = Array.from(new Set(allResources.map(r => r.asset_folder).filter(Boolean))).sort();
  console.error(`[cloudinary debug] distinct asset_folder values account-wide: ${JSON.stringify(distinctAssetFolders)}`);
  console.error(`[cloudinary debug] childNames from listChildFolders("${GALLERY_ROOT}"): ${JSON.stringify(childNames)}`);

  const folderNames = new Set([...childNames, ...byFolder.keys()]);
  const subfolders = Array.from(folderNames).map(name => ({ folder: name, images: byFolder.get(name) ?? [] }));
  return rootImages.length > 0 ? [{ folder: 'General', images: rootImages }, ...subfolders] : subfolders;
}
