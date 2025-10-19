import { v2 as cloudinary } from "cloudinary";

// Lazy configuration function - ensures env vars are loaded
let configured = false;
function ensureConfigured() {
  if (configured) return;

  // Configure Cloudinary with your credentials (from .env)
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // always use https URLs
  });

  // Validate configuration
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error("⚠️  Cloudinary credentials missing in .env file");
    console.error(
      "Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
    );
  }

  configured = true;
}

/**
 * Upload an image to Cloudinary.
 * @param {string} filePath - Local path of file to upload.
 * @param {string} folder - Folder to upload to (e.g., 'services', 'beauticians')
 * @returns {Promise<object>} Cloudinary upload result with secure_url, public_id, etc.
 */
export async function uploadImage(filePath, folder = "beauty-salon") {
  ensureConfigured();

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });
    console.log(`✅ Image uploaded to Cloudinary: ${result.secure_url}`);
    return result;
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error.message);
    throw new Error(`Failed to upload image to Cloudinary: ${error.message}`);
  }
}

/**
 * Delete image by its public ID.
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<object>} Cloudinary deletion result
 */
export async function deleteImage(publicId) {
  ensureConfigured();
  return cloudinary.uploader.destroy(publicId);
}

export default cloudinary;
