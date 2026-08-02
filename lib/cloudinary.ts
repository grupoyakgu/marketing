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
  // NOTE: prefix matches against public_id, which does NOT reflect an asset's
  // folder on accounts using Cloudinary's Dynamic Folders (folder is separate
  // metadata there) — see searchAllImageResources below for that case.
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
// Cloudinary's account-wide /resources/image listing has repeatedly proven
// unreliable in production — twice now (a "Food" folder, then a
// "Restaurants" folder) it has silently excluded an entire folder's worth of
// resources that a targeted by_asset_folder query for that same folder finds
// without issue, and there's no way to even discover such a folder's name
// from that listing since it never mentions it. The Search API
// (/resources/search) was confirmed via production logs to find both
// resources AND folder names those cases missed, so it's the primary source
// here. The dedicated folders index (listChildFolders) is kept only for
// folders with zero images in them — which the Search API, being a resource
// search, structurally cannot discover — and a by_asset_folder cross-check
// per folder still runs as a second opinion in case the Search API ever
// misses something the way the older listing did.

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
async function searchAllImageResources(cloudName: string, auth: string, folderPath: string): Promise<CloudinaryResource[]> {
  const all: CloudinaryResource[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const body: Record<string, unknown> = {
      expression: `folder:"${folderPath}" OR folder:"${folderPath}/*"`,
      max_results: 500,
    };
    if (cursor) body.next_cursor = cursor;

    const res = await fetch(`${CLOUDINARY_API}/${cloudName}/resources/search`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Cloudinary search API error ${res.status}: ${errBody}`);
    }
    const json = await res.json();
    all.push(...((json.resources ?? []) as CloudinaryResource[]));

    cursor = json.next_cursor;
    if (!cursor) break;
  }

  return all;
}

// Cross-check counterpart to searchAllImageResources — capped at 10 pages
// (5,000 images) per folder as the same sanity limit.
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
    const resources: { public_id: string; secure_url: string; filename?: string }[] = json.resources ?? [];
    all.push(...resources.map(mapResource));

    cursor = json.next_cursor;
    if (!cursor) break;
  }

  return all;
}

/** Lists each project subfolder under CLOUDINARY_GALLERY_ROOT (default
 * "marketing/images") separately — never merged — for the planner's image
 * picker. Folder names come from the union of listChildFolders (Cloudinary's
 * dedicated folders index, so a folder still shows up even with zero images
 * in it yet) and whatever asset_folder values actually appear in the Search
 * API results (see the comment above GALLERY_ROOT for why that's the primary
 * source now). Each folder's images are then the union of those search
 * results and a direct by_asset_folder cross-check — see the comment above
 * listResourcesByAssetFolder for why neither source is trusted alone. Images
 * uploaded directly into the root itself (asset_folder === GALLERY_ROOT, no
 * subfolder) surface as a "General" bucket. */
export async function listCloudinaryImagesByFolder(): Promise<CloudinaryFolderImages[]> {
  const { cloudName, apiKey, apiSecret } = getCredentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const [childNames, allResources] = await Promise.all([
    listChildFolders(cloudName, auth, GALLERY_ROOT),
    searchAllImageResources(cloudName, auth, GALLERY_ROOT),
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

  const folderNames = Array.from(new Set([...childNames, ...byFolder.keys()]));

  function mergeUnique(existing: CloudinaryImage[], extra: CloudinaryImage[]): CloudinaryImage[] {
    const seen = new Set(existing.map(img => img.id));
    return [...existing, ...extra.filter(img => !seen.has(img.id))];
  }

  const [crossCheckedFolders, crossCheckedRoot] = await Promise.all([
    Promise.all(
      folderNames.map(async name => {
        try {
          const extra = await listResourcesByAssetFolder(cloudName, auth, `${rootPrefix}${name}`);
          return { folder: name, images: mergeUnique(byFolder.get(name) ?? [], extra) };
        } catch (err) {
          console.error(`listCloudinaryImagesByFolder: by_asset_folder cross-check failed for "${name}": ${err instanceof Error ? err.message : err}`);
          return { folder: name, images: byFolder.get(name) ?? [] };
        }
      })
    ),
    listResourcesByAssetFolder(cloudName, auth, GALLERY_ROOT)
      .then(extra => mergeUnique(rootImages, extra))
      .catch(err => {
        console.error(`listCloudinaryImagesByFolder: by_asset_folder cross-check failed for root: ${err instanceof Error ? err.message : err}`);
        return rootImages;
      }),
  ]);

  return crossCheckedRoot.length > 0 ? [{ folder: 'General', images: crossCheckedRoot }, ...crossCheckedFolders] : crossCheckedFolders;
}
