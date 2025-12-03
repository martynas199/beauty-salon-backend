import { Router } from "express";
import multer from "multer";
import Product from "../models/Product.js";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import fs from "fs/promises";

const router = Router();

// Multer configuration for file upload
const upload = multer({ dest: "uploads/" });

// Helper to delete local file
async function deleteLocalFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.error("Error deleting local file:", err);
  }
}

// GET /api/products - List all products
router.get("/", async (req, res) => {
  try {
    const { featured, category, active, page, limit } = req.query;
    const filter = {};

    if (featured === "true") filter.featured = true;
    if (category) filter.category = category;
    if (active !== undefined) filter.active = active === "true";

    // Pagination support
    const usePagination = page !== undefined;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const skip = (pageNum - 1) * pageLimit;

    if (usePagination) {
      // Paginated response with count
      const [products, total] = await Promise.all([
        Product.find(filter)
          .select(
            "_id title brand description price originalPrice image category featured active variants beauticianId"
          )
          .sort({ order: 1, createdAt: -1 })
          .skip(skip)
          .limit(pageLimit)
          .lean(),
        Product.countDocuments(filter),
      ]);

      res.json({
        data: products,
        pagination: {
          page: pageNum,
          limit: pageLimit,
          total,
          totalPages: Math.ceil(total / pageLimit),
          hasMore: pageNum * pageLimit < total,
        },
      });
    } else {
      // Legacy: return all products
      const products = await Product.find(filter)
        .sort({ order: 1, createdAt: -1 })
        .lean();
      res.json(products);
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/products/:id - Get single product
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products - Create new product
router.post("/", async (req, res) => {
  try {
    const productData = {
      ...req.body,
      keyBenefits: Array.isArray(req.body.keyBenefits)
        ? req.body.keyBenefits
        : req.body.keyBenefits
        ? req.body.keyBenefits.split("\n").filter((b) => b.trim())
        : [],
    };

    const product = new Product(productData);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(400).json({ error: error.message });
  }
});

// PATCH /api/products/:id - Update product
router.patch("/:id", async (req, res) => {
  try {
    const updates = { ...req.body };

    // Handle keyBenefits conversion
    if (updates.keyBenefits) {
      updates.keyBenefits = Array.isArray(updates.keyBenefits)
        ? updates.keyBenefits
        : updates.keyBenefits.split("\n").filter((b) => b.trim());
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/products/:id - Delete product
router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Delete main image from Cloudinary if exists
    if (product.image?.publicId && product.image?.provider === "cloudinary") {
      await deleteImage(product.image.publicId);
    }

    // Delete all gallery images from Cloudinary
    if (product.images && product.images.length > 0) {
      for (const img of product.images) {
        if (img.publicId && img.provider === "cloudinary") {
          await deleteImage(img.publicId);
        }
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products/:id/upload-image - Upload product main image
router.post("/:id/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      await deleteLocalFile(req.file.path);
      return res.status(404).json({ error: "Product not found" });
    }

    // Delete old image from Cloudinary
    if (product.image?.publicId && product.image?.provider === "cloudinary") {
      await deleteImage(product.image.publicId);
    }

    // Upload new image to Cloudinary
    const result = await uploadImage(req.file.path, "products");

    // Update product with new image
    product.image = {
      url: result.secure_url,
      publicId: result.public_id,
      provider: "cloudinary",
    };

    await product.save();

    // Delete local file
    await deleteLocalFile(req.file.path);

    res.json(product);
  } catch (error) {
    console.error("Error uploading product image:", error);
    if (req.file) await deleteLocalFile(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products/:id/upload-images - Upload multiple gallery images
router.post(
  "/:id/upload-images",
  upload.array("images", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No image files provided" });
      }

      const product = await Product.findById(req.params.id);
      if (!product) {
        // Clean up uploaded files
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
        return res.status(404).json({ error: "Product not found" });
      }

      const uploadedImages = [];

      // Upload each image to Cloudinary
      for (const file of req.files) {
        try {
          const result = await uploadImage(file.path, "products");
          uploadedImages.push({
            url: result.secure_url,
            publicId: result.public_id,
            provider: "cloudinary",
          });
          await deleteLocalFile(file.path);
        } catch (error) {
          console.error("Error uploading image:", error);
          await deleteLocalFile(file.path);
        }
      }

      // Add new images to product
      product.images = [...(product.images || []), ...uploadedImages];
      await product.save();

      res.json(product);
    } catch (error) {
      console.error("Error uploading product images:", error);
      if (req.files) {
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
      }
      res.status(500).json({ error: error.message });
    }
  }
);

// DELETE /api/products/:id/images/:imageIndex - Delete a specific gallery image
router.delete("/:id/images/:imageIndex", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const imageIndex = parseInt(req.params.imageIndex);
    if (
      isNaN(imageIndex) ||
      imageIndex < 0 ||
      imageIndex >= product.images.length
    ) {
      return res.status(400).json({ error: "Invalid image index" });
    }

    const imageToDelete = product.images[imageIndex];

    // Delete from Cloudinary if it's a cloudinary image
    if (imageToDelete.publicId && imageToDelete.provider === "cloudinary") {
      await deleteImage(imageToDelete.publicId);
    }

    // Remove image from array
    product.images.splice(imageIndex, 1);
    await product.save();

    res.json(product);
  } catch (error) {
    console.error("Error deleting product image:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products/apply-black-friday - Apply 15% Black Friday discount to all products
router.post("/apply-black-friday", async (req, res) => {
  try {
    const products = await Product.find({});
    let updatedCount = 0;

    for (const product of products) {
      let updated = false;

      // Update variants if they exist
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          // Only apply if not already discounted
          if (
            !variant.originalPrice ||
            variant.originalPrice === variant.price
          ) {
            variant.originalPrice = variant.price;
            variant.price = Math.round(variant.price * 0.85 * 100) / 100; // 15% discount, round to 2 decimals
            updated = true;
          }

          if (
            !variant.originalPriceEUR ||
            variant.originalPriceEUR === variant.priceEUR
          ) {
            variant.originalPriceEUR = variant.priceEUR;
            variant.priceEUR = Math.round(variant.priceEUR * 0.85 * 100) / 100;
            updated = true;
          }
        }
      }

      // Update legacy price fields (for products without variants)
      if (!product.variants || product.variants.length === 0) {
        if (!product.originalPrice || product.originalPrice === product.price) {
          product.originalPrice = product.price;
          product.price = Math.round(product.price * 0.85 * 100) / 100;
          updated = true;
        }

        if (
          !product.originalPriceEUR ||
          product.originalPriceEUR === product.priceEUR
        ) {
          product.originalPriceEUR = product.priceEUR;
          product.priceEUR = Math.round(product.priceEUR * 0.85 * 100) / 100;
          updated = true;
        }
      }

      if (updated) {
        await product.save();
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `Black Friday discount applied to ${updatedCount} products`,
      updatedCount,
      totalProducts: products.length,
    });
  } catch (error) {
    console.error("Error applying Black Friday discount:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/products/remove-black-friday - Remove Black Friday discount from all products
router.post("/remove-black-friday", async (req, res) => {
  try {
    const products = await Product.find({});
    let updatedCount = 0;

    for (const product of products) {
      let updated = false;

      // Restore variants if they have originalPrice set
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          if (variant.originalPrice && variant.originalPrice > variant.price) {
            variant.price = variant.originalPrice;
            variant.originalPrice = undefined;
            updated = true;
          }

          if (
            variant.originalPriceEUR &&
            variant.originalPriceEUR > variant.priceEUR
          ) {
            variant.priceEUR = variant.originalPriceEUR;
            variant.originalPriceEUR = undefined;
            updated = true;
          }
        }
      }

      // Restore legacy price fields
      if (!product.variants || product.variants.length === 0) {
        if (product.originalPrice && product.originalPrice > product.price) {
          product.price = product.originalPrice;
          product.originalPrice = undefined;
          updated = true;
        }

        if (
          product.originalPriceEUR &&
          product.originalPriceEUR > product.priceEUR
        ) {
          product.priceEUR = product.originalPriceEUR;
          product.originalPriceEUR = undefined;
          updated = true;
        }
      }

      if (updated) {
        await product.save();
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `Black Friday discount removed from ${updatedCount} products`,
      updatedCount,
      totalProducts: products.length,
    });
  } catch (error) {
    console.error("Error removing Black Friday discount:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
