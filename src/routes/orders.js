import { Router } from "express";
import Stripe from "stripe";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Beautician from "../models/Beautician.js";
import {
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
} from "../emails/mailer.js";

const router = Router();

let stripeInstance = null;
function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

// GET /api/orders - List all orders (admin)
router.get("/", async (req, res) => {
  try {
    const { status, paymentStatus, page, limit = 50 } = req.query;
    const filter = {};

    if (status) filter.orderStatus = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    // Pagination support
    const usePagination = page !== undefined;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const skip = (pageNum - 1) * pageLimit;

    if (usePagination) {
      // Paginated response
      const [orders, total] = await Promise.all([
        Order.find(filter)
          .select(
            "orderNumber userId items subtotal shipping total orderStatus paymentStatus createdAt shippingAddress"
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageLimit)
          .lean(),
        Order.countDocuments(filter),
      ]);

      res.json({
        data: orders,
        pagination: {
          page: pageNum,
          limit: pageLimit,
          total,
          totalPages: Math.ceil(total / pageLimit),
          hasMore: pageNum * pageLimit < total,
        },
      });
    } else {
      // Legacy: return limited orders
      const orders = await Order.find(filter)
        .sort({ createdAt: -1 })
        .limit(pageLimit)
        .lean();

      res.json(orders);
    }
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/confirm-checkout - Confirm product checkout payment
// IMPORTANT: Must come BEFORE /:id route to avoid being caught as an ID
router.get("/confirm-checkout", async (req, res) => {
  try {
    const stripe = getStripe();
    const { session_id, orderId } = req.query;

    if (!session_id || !orderId) {
      return res.status(400).json({ error: "Missing session_id or orderId" });
    }

    const order = await Order.findById(orderId).populate("items.productId");
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    // Update order payment status
    order.paymentStatus = "paid";
    order.orderStatus = "processing";
    order.stripePaymentIntentId =
      session.payment_intent?.id || session.payment_intent;

    // Process Stripe Connect transfers for beautician-owned products
    // Note: For single-beautician orders, destination charges handle payment automatically
    // Only create transfers for multi-beautician orders
    if (order.stripeConnectPayments && order.stripeConnectPayments.length > 0) {
      const needsTransfers = order.stripeConnectPayments.length > 1;

      for (const payment of order.stripeConnectPayments) {
        const beautician = await Beautician.findById(payment.beauticianId);

        if (
          beautician &&
          beautician.stripeAccountId &&
          beautician.stripeStatus === "connected"
        ) {
          try {
            // For single-beautician orders, destination charge already handled payment
            if (!needsTransfers) {
              payment.status = "succeeded";
              payment.paymentIntentId =
                session.payment_intent?.id || session.payment_intent;

              // Update beautician earnings
              await Beautician.findByIdAndUpdate(beautician._id, {
                $inc: { totalEarnings: payment.amount },
              });

              console.log(
                `[ORDER CONFIRM] Single-beautician order: destination charge handled payment for ${beautician._id}`
              );
            } else {
              // For multi-beautician orders, create separate transfers
              const transfer = await stripe.transfers.create({
                amount: Math.round(payment.amount * 100), // Convert to pence
                currency: "gbp",
                destination: beautician.stripeAccountId,
                transfer_group: `ORDER_${order._id}`,
                metadata: {
                  orderId: String(order._id),
                  beauticianId: String(beautician._id),
                  type: "product_sale",
                },
              });

              payment.transferId = transfer.id;
              payment.status = "succeeded";
              payment.paymentIntentId =
                session.payment_intent?.id || session.payment_intent;

              // Update beautician earnings
              await Beautician.findByIdAndUpdate(beautician._id, {
                $inc: { totalEarnings: payment.amount },
              });

              console.log(
                `[ORDER CONFIRM] Transfer created for beautician ${beautician._id}: ${transfer.id}`
              );
            }
          } catch (error) {
            console.error(
              `[ORDER CONFIRM] Payment processing failed for beautician ${beautician._id}:`,
              error
            );
            payment.status = "failed";
          }
        } else {
          console.log(
            `[ORDER CONFIRM] Beautician ${payment.beauticianId} not connected to Stripe`
          );
          payment.status = "failed";
        }
      }
    }

    await order.save();

    // Update stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        if (item.variantId && product.variants) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            variant.stock -= item.quantity;
          }
        } else {
          product.stock -= item.quantity;
        }
        await product.save();
      }
    }

    // Send order confirmation emails
    console.log("[ORDER CONFIRM] About to send order confirmation emails...");
    try {
      // Reload order with populated product data for emails
      const populatedOrder = await Order.findById(order._id).populate(
        "items.productId"
      );
      console.log(
        "[ORDER CONFIRM] Loaded order with products. Customer email:",
        populatedOrder.customer?.email
      );

      // Send customer confirmation email
      await sendOrderConfirmationEmail({ order: populatedOrder });
      console.log(
        "[ORDER CONFIRM] Customer confirmation email sent to:",
        populatedOrder.customer?.email
      );

      // Send admin notification email
      await sendAdminOrderNotification({ order: populatedOrder });
      console.log("[ORDER CONFIRM] Admin notification email sent");
    } catch (emailErr) {
      console.error("[ORDER CONFIRM] Failed to send order emails:", emailErr);
      // Don't fail the request if email fails
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error("Error confirming product checkout:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/number/:orderNumber - Get order by order number
router.get("/number/:orderNumber", async (req, res) => {
  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/:id - Get single order by ID
// IMPORTANT: Must come AFTER specific routes like /confirm-checkout and /number/:orderNumber
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders/checkout - Create Stripe checkout session for product order
router.post("/checkout", async (req, res) => {
  try {
    const stripe = getStripe();
    const {
      items,
      shippingAddress,
      shippingMethod,
      currency: requestedCurrency,
    } = req.body;

    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Order must have at least one item" });
    }

    // Validate and prepare items with beautician info
    const validatedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId).populate(
        "beauticianId"
      );
      if (!product) {
        return res
          .status(400)
          .json({ error: `Product not found: ${item.productId}` });
      }

      let variant = null;
      let price, stock, size;

      if (item.variantId && product.variants && product.variants.length > 0) {
        variant = product.variants.id(item.variantId);
        if (!variant) {
          return res
            .status(400)
            .json({ error: `Variant not found for product: ${product.title}` });
        }
        // Use EUR price if currency is EUR and priceEUR exists, otherwise use GBP price
        price =
          requestedCurrency?.toUpperCase() === "EUR" && variant.priceEUR != null
            ? variant.priceEUR
            : variant.price;
        stock = variant.stock;
        size = variant.size;
      } else {
        // Use EUR price if currency is EUR and priceEUR exists, otherwise use GBP price
        price =
          requestedCurrency?.toUpperCase() === "EUR" && product.priceEUR != null
            ? product.priceEUR
            : product.price;
        stock = product.stock;
        size = product.size;
      }

      if (stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.title}. Available: ${stock}, Requested: ${item.quantity}`,
        });
      }

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        title: product.title,
        size: size,
        price: price,
        quantity: item.quantity,
        image: product.image?.url || product.images?.[0]?.url || "",
        beauticianId: product.beauticianId?._id || null,
        beautician: product.beauticianId,
      });

      subtotal += price * item.quantity;
    }

    // Use selected shipping method price, or calculate default
    const shipping = shippingMethod?.price ?? (subtotal >= 50 ? 0 : 5.99);
    const total = subtotal + shipping;

    // Use requested currency or default to environment/gbp
    const currency = (
      requestedCurrency ||
      process.env.STRIPE_CURRENCY ||
      "gbp"
    ).toLowerCase();

    // Create pending order
    const order = new Order({
      items: validatedItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        title: item.title,
        size: item.size,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        beauticianId: item.beauticianId,
      })),
      shippingAddress,
      subtotal,
      shipping,
      tax: 0,
      total,
      currency: currency.toUpperCase(),
      paymentStatus: "pending",
      orderStatus: "pending",
    });

    await order.save();

    // Group items by beautician for Stripe Connect
    const itemsByBeautician = new Map();
    for (const item of validatedItems) {
      const beauticianId = item.beauticianId?.toString() || "platform";
      if (!itemsByBeautician.has(beauticianId)) {
        itemsByBeautician.set(beauticianId, []);
      }
      itemsByBeautician.get(beauticianId).push(item);
    }
    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";

    // Build line items for Stripe
    const lineItems = [];
    const stripeConnectPayments = [];

    for (const [beauticianId, items] of itemsByBeautician) {
      for (const item of items) {
        lineItems.push({
          price_data: {
            currency,
            unit_amount: Math.round(item.price * 100), // Convert to pence
            product_data: {
              name: item.title,
              description: item.size ? `Size: ${item.size}` : undefined,
              images: item.image ? [item.image] : undefined,
            },
          },
          quantity: item.quantity,
        });
      }

      // Track expected payments for beautician-owned products
      if (beauticianId !== "platform") {
        // Get beautician info from first item in this group
        const firstItem = items[0];
        if (firstItem.beautician) {
          const itemsTotal = items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          );

          // Validate beautician has Stripe account
          if (
            !firstItem.beautician.stripeAccountId ||
            firstItem.beautician.stripeStatus !== "connected"
          ) {
            return res.status(400).json({
              error: `Product "${firstItem.title}" belongs to a beautician who hasn't set up payment processing yet. Please contact support.`,
            });
          }

          stripeConnectPayments.push({
            beauticianId,
            beauticianStripeAccount: firstItem.beautician.stripeAccountId,
            amount: itemsTotal,
            status: "pending",
          });
        }
      }
    }

    // Note: Shipping is now handled via shipping_options in Stripe Checkout
    // Don't add shipping as a line item since Stripe will add it based on shipping_options

    // Create or retrieve Stripe customer with pre-filled shipping address
    const customer = await stripe.customers.create({
      email: shippingAddress.email,
      name: `${shippingAddress.firstName} ${shippingAddress.lastName}`,
      phone: shippingAddress.phone,
      shipping: {
        name: `${shippingAddress.firstName} ${shippingAddress.lastName}`,
        phone: shippingAddress.phone,
        address: {
          line1: shippingAddress.address,
          city: shippingAddress.city,
          postal_code: shippingAddress.postalCode,
          country: shippingAddress.country === "United Kingdom" ? "GB" : "IE",
        },
      },
    });

    // Create Stripe Checkout session
    // For single-beautician orders, use destination charges (beautician pays fees)
    // For multi-beautician orders, use transfers after payment (platform pays fees)
    const sessionConfig = {
      mode: "payment",
      client_reference_id: String(order._id),
      customer: customer.id,
      success_url: `${frontend}/shop/success?orderId=${order._id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/shop/cancel?orderId=${order._id}`,
      metadata: {
        orderId: String(order._id),
        type: "product_order",
      },
      line_items: lineItems,
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: Math.round(shipping * 100),
              currency,
            },
            display_name:
              shippingMethod?.name ||
              (shipping === 0 ? "Free Shipping" : "Standard Shipping"),
            delivery_estimate: shippingMethod?.estimatedDays
              ? {
                  minimum: {
                    unit: "business_day",
                    value:
                      parseInt(shippingMethod.estimatedDays.split("-")[0]) || 3,
                  },
                  maximum: {
                    unit: "business_day",
                    value:
                      parseInt(shippingMethod.estimatedDays.split("-")[1]) || 5,
                  },
                }
              : {
                  minimum: {
                    unit: "business_day",
                    value: 3,
                  },
                  maximum: {
                    unit: "business_day",
                    value: 5,
                  },
                },
          },
        },
      ],
      phone_number_collection: {
        enabled: false, // Already have phone from customer
      },
      allow_promotion_codes: true,
    };

    // If single beautician order, use destination charges so beautician pays Stripe fees
    if (
      stripeConnectPayments.length === 1 &&
      stripeConnectPayments[0].beauticianStripeAccount
    ) {
      const payment = stripeConnectPayments[0];
      sessionConfig.payment_intent_data = {
        transfer_data: {
          destination: payment.beauticianStripeAccount,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Update order with session ID and Connect payment tracking
    order.stripePaymentIntentId = session.id;
    order.stripeConnectPayments = stripeConnectPayments;
    await order.save();

    res.json({
      url: session.url,
      sessionId: session.id,
      orderId: order._id,
    });
  } catch (error) {
    console.error("Error creating product checkout:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders - Create new order
router.post("/", async (req, res) => {
  try {
    const { items, shippingAddress, notes, userId } = req.body;

    // Validate items
    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Order must have at least one item" });
    }

    // Validate and check stock for each item
    const validatedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({
          error: `Product not found: ${item.productId}`,
        });
      }

      // Get variant or use legacy fields
      let variant = null;
      let price, stock, size;

      if (item.variantId && product.variants && product.variants.length > 0) {
        variant = product.variants.id(item.variantId);
        if (!variant) {
          return res.status(400).json({
            error: `Variant not found for product: ${product.title}`,
          });
        }
        price = variant.price;
        stock = variant.stock;
        size = variant.size;
      } else {
        price = product.price;
        stock = product.stock;
        size = product.size;
      }

      // Check stock availability
      if (stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.title}. Available: ${stock}, Requested: ${item.quantity}`,
        });
      }

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        title: product.title,
        size: size,
        price: price,
        quantity: item.quantity,
        image: product.image?.url || product.images?.[0]?.url || "",
      });

      subtotal += price * item.quantity;
    }

    // Calculate shipping
    const shipping = subtotal >= 50 ? 0 : 5.99; // Free shipping over £50
    const total = subtotal + shipping;

    // Create order with userId if provided (logged-in users)
    const order = new Order({
      items: validatedItems,
      shippingAddress,
      subtotal,
      shipping,
      tax: 0,
      total,
      notes: notes || "",
      ...(userId ? { userId } : {}), // Add userId if provided
    });

    await order.save();

    // Update stock for each item
    for (const item of validatedItems) {
      const product = await Product.findById(item.productId);
      if (item.variantId && product.variants) {
        const variant = product.variants.id(item.variantId);
        if (variant) {
          variant.stock -= item.quantity;
        }
      } else {
        product.stock -= item.quantity;
      }
      await product.save();
    }

    res.status(201).json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(400).json({ error: error.message });
  }
});

// PATCH /api/orders/:id - Update order status
router.patch("/:id", async (req, res) => {
  try {
    const { orderStatus, paymentStatus, trackingNumber, notes } = req.body;
    const updates = {};

    if (orderStatus) {
      updates.orderStatus = orderStatus;
      if (orderStatus === "shipped" && !updates.shippedAt) {
        updates.shippedAt = new Date();
      }
      if (orderStatus === "delivered" && !updates.deliveredAt) {
        updates.deliveredAt = new Date();
      }
    }

    if (paymentStatus) updates.paymentStatus = paymentStatus;
    if (trackingNumber !== undefined) updates.trackingNumber = trackingNumber;
    if (notes !== undefined) updates.notes = notes;

    const order = await Order.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/orders/:id - Delete order (admin only)
router.delete("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow deleting pending orders
    if (order.orderStatus !== "pending") {
      return res.status(400).json({
        error: "Can only delete pending orders",
      });
    }

    await Order.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders/:id/cancel - Cancel order
router.post("/:id/cancel", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow canceling pending or processing orders
    if (!["pending", "processing"].includes(order.orderStatus)) {
      return res.status(400).json({
        error: "Can only cancel pending or processing orders",
      });
    }

    order.orderStatus = "cancelled";
    await order.save();

    // Restore stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        if (item.variantId && product.variants) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            variant.stock += item.quantity;
          }
        } else {
          product.stock += item.quantity;
        }
        await product.save();
      }
    }

    res.json(order);
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders/:id/refund - Issue refund for order
router.post("/:id/refund", async (req, res) => {
  try {
    const stripe = getStripe();
    const { reason } = req.body;

    const order = await Order.findById(req.params.id).populate(
      "items.productId"
    );
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.paymentStatus !== "paid") {
      return res.status(400).json({ error: "Order payment not completed" });
    }

    if (order.refundStatus === "full") {
      return res.status(400).json({ error: "Order already fully refunded" });
    }

    // Create Stripe refund
    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      reverse_transfer: true, // Reverse transfers to beauticians
      metadata: {
        orderId: String(order._id),
        reason: reason || "Customer request",
      },
    });

    // Update Connect payment statuses
    if (order.stripeConnectPayments && order.stripeConnectPayments.length > 0) {
      for (const payment of order.stripeConnectPayments) {
        if (payment.status === "succeeded") {
          payment.status = "refunded";

          // Deduct from beautician earnings
          await Beautician.findByIdAndUpdate(payment.beauticianId, {
            $inc: { totalEarnings: -payment.amount },
          });
        }
      }
    }

    // Update order status
    order.paymentStatus = "refunded";
    order.orderStatus = "refunded";
    order.refundStatus = "full";
    order.refundedAt = new Date();
    order.refundReason = reason || "Customer request";
    await order.save();

    // Restore stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        if (item.variantId && product.variants) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            variant.stock += item.quantity;
          }
        } else {
          product.stock += item.quantity;
        }
        await product.save();
      }
    }

    console.log(`[ORDER REFUND] Order ${order._id} refunded: ${refund.id}`);
    res.json({ success: true, order, refund });
  } catch (error) {
    console.error("Error refunding order:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
