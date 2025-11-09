import { Router } from "express";

const router = Router();

// Royal Mail carrier ID (you'll need to get this from your ShipEngine account)
// For now, we'll use a fallback approach
const ROYAL_MAIL_CARRIER_ID = process.env.ROYAL_MAIL_CARRIER_ID || "";

/**
 * Get shipping rates from ShipEngine
 * @route POST /api/shipping/rates
 * @access Public
 */
router.post("/rates", async (req, res) => {
  try {
    const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY;

    if (!SHIPENGINE_API_KEY) {
      return res.status(500).json({
        message: "ShipEngine API key not configured",
      });
    }

    const { shipment, service_codes } = req.body;

    // Validate required fields
    if (!shipment?.ship_from?.postal_code || !shipment?.ship_to?.postal_code) {
      return res.status(400).json({
        message: "Origin and destination postal codes are required",
      });
    }

    if (!shipment?.packages?.[0]?.weight?.value) {
      return res.status(400).json({
        message: "Package weight is required",
      });
    }

    // Prepare request with all required fields
    const estimateRequest = {
      carrier_ids: ROYAL_MAIL_CARRIER_ID ? [ROYAL_MAIL_CARRIER_ID] : [],
      from_country_code: shipment.ship_from.country_code || "GB",
      from_postal_code: shipment.ship_from.postal_code,
      to_country_code: shipment.ship_to.country_code || "GB",
      to_postal_code: shipment.ship_to.postal_code,
      to_city_locality: shipment.ship_to.city || "London",
      to_state_province: shipment.ship_to.state || "",
      weight: {
        value: shipment.packages[0].weight.value,
        unit: shipment.packages[0].weight.unit || "kilogram",
      },
      dimensions: shipment.packages[0].dimensions || {
        length: 40,
        width: 30,
        height: 15,
        unit: "centimeter",
      },
    };

    // Add service codes if specified
    if (service_codes && service_codes.length > 0 && service_codes[0]) {
      estimateRequest.service_codes = service_codes;
    }

    // Make request to ShipEngine API
    const response = await fetch(
      "https://api.shipengine.com/v1/rates/estimate",
      {
        method: "POST",
        headers: {
          "API-Key": SHIPENGINE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(estimateRequest),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("ShipEngine API error:", data);
      return res.status(response.status).json({
        message: "Failed to get shipping rates from ShipEngine",
        error: data,
      });
    }

    console.log("✅ ShipEngine rates response:", JSON.stringify(data, null, 2));

    res.json(data);
  } catch (error) {
    console.error("Shipping rates error:", error);
    res.status(500).json({
      message: "Failed to get shipping rates",
      error: error.message,
    });
  }
});

/**
 * Calculate shipping cost based on cart weight and destination
 * @route POST /api/shipping/calculate
 * @access Public
 */
router.post("/calculate", async (req, res) => {
  try {
    const { postalCode, countryCode = "GB", items, city } = req.body;

    console.log("📦 Shipping calculation request:", {
      postalCode,
      countryCode,
      city,
      itemCount: items?.length,
      items: items?.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        weight: i.weight,
      })),
    });

    if (!postalCode || !items || items.length === 0) {
      return res.status(400).json({
        message: "Postal code and items are required",
      });
    }

    // Calculate total weight from items
    const totalWeight = items.reduce((sum, item) => {
      const weight = item.weight || 0.1; // Default 100g if not specified
      return sum + weight * item.quantity;
    }, 0);

    // Calculate total number of items
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    // Add packaging weight based on number of items
    let packagingWeight = 0;
    if (totalItems <= 6) {
      packagingWeight = 0.025; // 25g for up to 6 items
    } else if (totalItems <= 12) {
      packagingWeight = 0.05; // 50g for 7-12 items
    } else if (totalItems <= 24) {
      packagingWeight = 0.1; // 100g for 13-24 items
    } else {
      packagingWeight = 0.15; // 150g for 25+ items
    }

    const totalWeightWithPackaging = totalWeight + packagingWeight;

    console.log("⚖️ Weight breakdown:", {
      productWeight: totalWeight.toFixed(3) + "kg",
      totalItems,
      packagingWeight: packagingWeight.toFixed(3) + "kg",
      finalWeight: totalWeightWithPackaging.toFixed(3) + "kg",
    });

    // Weight-based shipping options
    let shippingOptions = [];

    if (countryCode === "GB") {
      // UK domestic shipping options based on weight (including packaging)
      console.log(
        "🇬🇧 UK domestic shipping - selecting tier for",
        totalWeightWithPackaging.toFixed(3),
        "kg"
      );

      if (totalWeightWithPackaging <= 2) {
        // Lightweight items (up to 2kg)
        console.log("✅ Selected tier: Lightweight (up to 2kg)");
        shippingOptions = [
          {
            id: "royal-mail-2nd",
            name: "Royal Mail 2nd Class",
            price: 3.99,
            estimatedDays: "2-3 business days",
            description: "Standard delivery",
          },
          {
            id: "royal-mail-1st",
            name: "Royal Mail 1st Class",
            price: 5.99,
            estimatedDays: "1-2 business days",
            description: "Faster delivery",
          },
          {
            id: "royal-mail-tracked",
            name: "Royal Mail Tracked 24",
            price: 7.99,
            estimatedDays: "Next working day",
            description: "Next day with tracking",
          },
        ];
      } else if (totalWeightWithPackaging <= 5) {
        // Medium weight (2-5kg)
        console.log("✅ Selected tier: Medium (2-5kg)");
        shippingOptions = [
          {
            id: "royal-mail-tracked-48",
            name: "Royal Mail Tracked 48",
            price: 8.99,
            estimatedDays: "2-3 business days",
            description: "Standard tracked delivery",
          },
          {
            id: "royal-mail-tracked-24",
            name: "Royal Mail Tracked 24",
            price: 11.99,
            estimatedDays: "Next working day",
            description: "Next day with tracking",
          },
        ];
      } else if (totalWeightWithPackaging <= 10) {
        // Heavy items (5-10kg)
        console.log("✅ Selected tier: Heavy (5-10kg)");
        shippingOptions = [
          {
            id: "tracked-48",
            name: "Royal Mail Tracked 48",
            price: 12.99,
            estimatedDays: "2-3 business days",
            description: "Standard tracked delivery",
          },
          {
            id: "tracked-24",
            name: "Royal Mail Tracked 24",
            price: 15.99,
            estimatedDays: "Next working day",
            description: "Next day with tracking",
          },
        ];
      } else {
        // Very heavy (over 10kg)
        console.log("✅ Selected tier: Very Heavy (10kg+)");
        shippingOptions = [
          {
            id: "courier-standard",
            name: "Courier Standard",
            price: 18.99,
            estimatedDays: "3-5 business days",
            description: "Standard courier delivery",
          },
          {
            id: "courier-express",
            name: "Courier Express",
            price: 24.99,
            estimatedDays: "1-2 business days",
            description: "Express courier delivery",
          },
        ];
      }
    } else {
      // International shipping options
      console.log("🌍 International shipping for country:", countryCode);
      shippingOptions = [
        {
          id: "international-standard",
          name: "International Standard",
          price: 15.99,
          estimatedDays: "7-14 business days",
          description: "Standard international delivery",
        },
        {
          id: "international-tracked",
          name: "International Tracked",
          price: 22.99,
          estimatedDays: "5-10 business days",
          description: "Tracked international delivery",
        },
      ];
    }

    console.log("🚚 Shipping options generated:", {
      optionCount: shippingOptions.length,
      options: shippingOptions.map((o) => ({
        id: o.id,
        name: o.name,
        price: o.price,
      })),
      totalWeight: totalWeightWithPackaging.toFixed(3) + "kg",
      breakdown: {
        products: totalWeight.toFixed(3) + "kg",
        packaging: packagingWeight.toFixed(3) + "kg",
      },
      destination: { postalCode, city, countryCode },
    });

    res.json({
      options: shippingOptions,
      weight: totalWeightWithPackaging,
      productWeight: totalWeight,
      packagingWeight: packagingWeight,
      calculation: "weight-based",
    });
  } catch (error) {
    console.error("Shipping calculation error:", error);
    // Fallback to fixed shipping on error
    res.json({
      options: [
        {
          id: "standard",
          name: "Standard Shipping",
          price: 4.99,
          estimatedDays: "3-5 business days",
          description: "Standard delivery",
        },
      ],
    });
  }
});

export default router;
