import { Router } from "express";
import Product from "../models/Product.js";

const router = Router();

/**
 * POST /api/promotions/apply-discount
 * Apply percentage discount to all active products
 */
router.post("/apply-discount", async (req, res) => {
  try {
    const { percentage, brand } = req.body;

    if (!percentage || percentage < 0 || percentage > 100) {
      return res.status(400).json({
        error: "Valid percentage (0-100) is required",
      });
    }

    // Build query to filter active products
    const query = { active: true };
    if (brand && brand !== "all") {
      query.brand = brand;
    }

    // Find products matching the filter
    const products = await Product.find(query);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      let variantsUpdated = false;

      // Apply discount to each variant
      for (const variant of product.variants) {
        const originalPrice = variant.originalPrice || variant.price;
        const discountedPrice = originalPrice * (1 - percentage / 100);

        // Store original price if not already stored
        if (!variant.originalPrice) {
          variant.originalPrice = variant.price;
        }

        variant.price = Math.round(discountedPrice * 100) / 100; // Round to 2 decimals
        variantsUpdated = true;
      }

      if (variantsUpdated) {
        await product.save();
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    const brandText = brand && brand !== "all" ? ` for brand "${brand}"` : "";
    res.json({
      success: true,
      message: `Applied ${percentage}% discount to ${updatedCount} products${brandText}`,
      updatedCount,
      skippedCount,
      percentage,
      brand: brand || "all",
    });
  } catch (error) {
    console.error("Error applying discount:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/promotions/remove-discount
 * Remove discounts and restore original prices
 */
router.post("/remove-discount", async (req, res) => {
  try {
    const products = await Product.find({ active: true });

    let updatedCount = 0;

    for (const product of products) {
      let variantsUpdated = false;

      for (const variant of product.variants) {
        if (variant.originalPrice) {
          variant.price = variant.originalPrice;
          variant.originalPrice = undefined; // Remove the field
          variantsUpdated = true;
        }
      }

      if (variantsUpdated) {
        await product.save();
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `Removed discounts from ${updatedCount} products`,
      updatedCount,
    });
  } catch (error) {
    console.error("Error removing discount:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/promotions/status
 * Check if products currently have discounts applied
 */
router.get("/status", async (req, res) => {
  try {
    const productsWithDiscount = await Product.countDocuments({
      active: true,
      "variants.originalPrice": { $exists: true },
    });

    const totalProducts = await Product.countDocuments({ active: true });

    res.json({
      hasActiveDiscount: productsWithDiscount > 0,
      productsWithDiscount,
      totalProducts,
    });
  } catch (error) {
    console.error("Error checking promotion status:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
