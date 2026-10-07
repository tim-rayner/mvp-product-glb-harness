import { env } from "./shared/env";
import { SpatialProductSourceSchema } from "./features/products/product";

console.log(`hello (${env.NODE_ENV}, port ${env.PORT})`);

try {
const example = SpatialProductSourceSchema.parse({
  merchantId: "mamas-and-papas",
  productId: "example-product",
  title: "Example Product",
  sourceUrl: "https://example.com/product",
  images: ["https://example.com/product.jpg"],
  dimensions: {
    width: 460,
    depth: 520,
    height: 820,
  },
  dimensionSource: "Merchant product page",
  dimensionConfidence: "high",
});
console.log("Example product:", example);
console.log("Example product parsed successfully.");
}   catch (error) {
  console.error("Error parsing example product:", error);
}

