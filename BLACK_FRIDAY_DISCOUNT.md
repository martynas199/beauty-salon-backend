# Black Friday Discount System

## Overview
The Black Friday discount system allows you to apply a 15% discount to all products with a single API call and display a special "BLACK FRIDAY" badge in the UI.

## Backend API Endpoints

### Apply Black Friday Discount
**Endpoint:** `POST /api/products/apply-black-friday`

Applies a 15% discount to all products:
- Saves current price to `originalPrice` and `originalPriceEUR`
- Reduces price by 15% (`price = price * 0.85`)
- Updates both GBP and EUR prices
- Handles both legacy product fields and variant-based products
- Skips products that already have a discount applied

**Example:**
```bash
curl -X POST http://localhost:5000/api/products/apply-black-friday
```

**Response:**
```json
{
  "success": true,
  "message": "Black Friday discount applied to 25 products",
  "updatedCount": 25,
  "totalProducts": 25
}
```

### Remove Black Friday Discount
**Endpoint:** `POST /api/products/remove-black-friday`

Removes the discount and restores original prices:
- Restores prices from `originalPrice` and `originalPriceEUR`
- Clears the `originalPrice` fields
- Handles both legacy and variant-based products

**Example:**
```bash
curl -X POST http://localhost:5000/api/products/remove-black-friday
```

**Response:**
```json
{
  "success": true,
  "message": "Black Friday discount removed from 25 products",
  "updatedCount": 25,
  "totalProducts": 25
}
```

## Frontend UI Changes

### Black Friday Badge
Products with discounts now display a "BLACK FRIDAY" badge instead of the generic "SALE" badge:
- **Style:** Black background with white text
- **Position:** Top-right corner of product images
- **Size:** Slightly larger than the previous SALE badge
- **Shadow:** Added shadow for better visibility

### Updated Components
1. **ProductCard.jsx** - Product catalog cards
2. **ProductDetailModal.jsx** - Product detail modal view
3. **ProductDetailPage.jsx** - Full product detail page

## How It Works

### Discount Logic
1. When you apply the Black Friday discount:
   - Current `price` → saved to `originalPrice`
   - Current `priceEUR` → saved to `originalPriceEUR`
   - New `price` = original × 0.85 (15% off)
   - New `priceEUR` = original × 0.85 (15% off)

2. Frontend detects discount:
   ```javascript
   hasDiscount = originalPrice && originalPrice > price
   ```

3. Badge displays "BLACK FRIDAY" when `hasDiscount` is true

### Variant Support
For products with variants (different sizes/options):
- Each variant's price is discounted individually
- Each variant retains its original price relationship
- Discount applies to both GBP and EUR prices

### Currency Support
- Both GBP (£) and EUR (€) prices are discounted
- Frontend displays correct currency based on user selection
- Discount percentage remains consistent across currencies

## Usage Instructions

### 1. Before Black Friday
Ensure all products have correct prices set in the admin panel.

### 2. Activate Black Friday Discount
Run this command from your backend server (or use Postman/API client):
```bash
curl -X POST https://your-backend-url.com/api/products/apply-black-friday
```

Or if running locally:
```bash
curl -X POST http://localhost:5000/api/products/apply-black-friday
```

### 3. Verify Discount Applied
- Check the response to see how many products were updated
- Visit the frontend to see "BLACK FRIDAY" badges on all products
- Verify prices show both discounted and original (strikethrough) prices

### 4. After Black Friday
Remove the discount to restore original prices:
```bash
curl -X POST https://your-backend-url.com/api/products/remove-black-friday
```

## Important Notes

1. **Idempotent Operations:** 
   - Applying discount multiple times won't compound the discount
   - The system checks if `originalPrice` already exists before applying

2. **Price Rounding:**
   - Prices are rounded to 2 decimal places (e.g., £12.75)
   - Uses standard rounding: `Math.round(price * 100) / 100`

3. **Active/Inactive Products:**
   - Discount applies to ALL products (active and inactive)
   - If you want to exclude certain products, make them inactive first

4. **Data Safety:**
   - Original prices are preserved in `originalPrice` fields
   - Removal endpoint restores exact original prices
   - No data is lost during discount application/removal

## Testing

### Test Apply Discount
1. Note original prices of a few products
2. Apply Black Friday discount
3. Verify prices are 15% lower
4. Check that "BLACK FRIDAY" badges appear
5. Verify original prices show as strikethrough

### Test Remove Discount
1. Remove Black Friday discount
2. Verify prices return to original values
3. Check that badges disappear
4. Confirm no `originalPrice` fields remain set

## Troubleshooting

### Discount not appearing?
- Check if products have `active: true` in database
- Verify frontend is fetching latest product data
- Clear browser cache and hard refresh

### Prices incorrect?
- Verify original prices were set correctly before applying discount
- Check both GBP and EUR prices were set in product variants
- Use remove endpoint to restore and try again

### Badge not showing?
- Discount badge only appears when `originalPrice > price`
- Check that discount was successfully applied to products
- Verify ProductCard component is rendering correctly

## Future Enhancements

Potential improvements for future versions:
- Add discount percentage as configurable parameter
- Support different discounts for different product categories
- Add start/end dates for automatic discount activation/removal
- Create admin UI panel for managing promotions
- Add analytics to track Black Friday sales performance
