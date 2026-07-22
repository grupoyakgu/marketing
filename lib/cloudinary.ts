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

async function fetchResources(cloudName: string, auth: string, prefix?: string): Promise<CloudinaryImage[]> {
  // Use /resources/image with optional prefix — works on all Cloudinary plans
  // (the alternative /resources/search endpoint requires a paid Search API add-on).
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
  return resources.map(r => ({
    id: r.public_id,
    name: r.filename ?? r.public_id.split('/').pop() ?? r.public_id,
    url: r.secure_url,
  }));
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

// Project subfolders shown as separate, non-mixed groups in the dashboard's
// post-editor image picker — each stays under its own directory so a user can
// expand a specific project and see only its images. Configurable via
// CLOUDINARY_GALLERY_FOLDERS (comma-separated) without a redeploy; defaults
// to the two current projects.
const DEFAULT_GALLERY_FOLDERS = ['BDS 36', 'Peral 23'];

function getGalleryFolderPrefixes(): { name: string; prefix: string }[] {
  const raw = process.env.CLOUDINARY_GALLERY_FOLDERS;
  const names = raw ? raw.split(',').map(f => f.trim()).filter(Boolean) : DEFAULT_GALLERY_FOLDERS;
  // Not nested under CLOUDINARY_FOLDER — confirmed via production logs that
  // CLOUDINARY_FOLDER doesn't match any actual image (they live at Cloudinary
  // root, no folder prefix), so these are their own top-level folders.
  return names.map(name => ({ name, prefix: name }));
}

/** Lists each project folder's images separately (never merged) for the
 * planner's image picker. A folder with no matches just comes back empty —
 * unlike listCloudinaryImages(), there's no root-level fallback here, since
 * that would defeat keeping each project's images under its own directory. */
export async function listCloudinaryImagesByFolder(): Promise<CloudinaryFolderImages[]> {
  const { cloudName, apiKey, apiSecret } = getCredentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const folders = getGalleryFolderPrefixes();

  const results = await Promise.all(
    folders.map(async ({ name, prefix }) => {
      try {
        const images = await fetchResources(cloudName, auth, prefix);
        return { folder: name, prefix, images };
      } catch (err) {
        console.error(`listCloudinaryImagesByFolder failed for prefix "${prefix}": ${err instanceof Error ? err.message : err}`);
        return { folder: name, prefix, images: [] };
      }
    })
  );
  console.log(
    `[cloudinary] gallery folders queried: ${JSON.stringify(results.map(r => ({ folder: r.folder, prefix: r.prefix, count: r.images.length })))}`
  );
  return results.map(({ folder, images }) => ({ folder, images }));
}
