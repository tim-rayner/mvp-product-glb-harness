import { env } from "./env";
import { SpatialProductSourceSchema } from "./schemas/product";

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
}   catch (error) {
  console.error("Error parsing example product:", error);
}

console.log("Example product parsed successfully.");
