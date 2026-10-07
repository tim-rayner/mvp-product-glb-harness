import {
  SpatialProductSourceSchema,
  type SpatialProductSource,
} from "../product";
import { formatToMm } from "../../../shared/utils/formatToMm";

const fromCm = formatToMm("cm");

/**
 * Moses Basket (white cable knit), populated from the Mamas & Papas product page. Upper (overall)
 * dimensions.
 *
 * The merchant's H26 cm is the rim and excludes the upright handles, which any image-to-3D model
 * reproduces. Overall height is estimated from the side packshot (images[3]): ~41 cm scaling from
 * the 26 cm rim. Scaling from the 86 cm length gives ~51 cm, but the slightly elevated camera
 * inflates verticals; rim-relative scaling cancels that out.
 */
export const mosesBasket: SpatialProductSource = SpatialProductSourceSchema.parse({
  merchantId: "mamas-and-papas",
  productId: "moses-basket-white-cable",
  sku: "7700B2B00",
  title: "Moses Basket - White Cable Knit",
  sourceUrl:
    "https://www.mamasandpapas.com/collections/baby-furniture/products/moses-basket-white-cable-7700b2b00",
  images: [
    "https://cdn.shopify.com/s/files/1/0414/6023/6453/files/mamas-papas-moses-basket-white-cable-knit-1184473250.jpg?v=1755254207",
    "https://cdn.shopify.com/s/files/1/0414/6023/6453/files/mamas-papas-moses-basket-bedding-moses-basket-white-cable-knit-1200396694.jpg?v=1774951335",
    "https://cdn.shopify.com/s/files/1/0414/6023/6453/files/mamas-papas-moses-basket-bedding-moses-basket-white-cable-knit-1193306089.jpg?v=1761732575",
    "https://cdn.shopify.com/s/files/1/0414/6023/6453/files/mamas-papas-moses-basket-bedding-moses-basket-white-cable-knit-1193262763.jpg?v=1761732575",
    "https://cdn.shopify.com/s/files/1/0414/6023/6453/files/mamas-papas-moses-basket-bedding-moses-basket-white-cable-knit-1193262764.jpg?v=1761732575",
    "https://cdn.shopify.com/s/files/1/0414/6023/6453/files/mamas-papas-moses-basket-bedding-moses-basket-white-cable-knit-1193262762.jpg?v=1761732575",
  ],
  dimensions: {
    width: fromCm(86),
    depth: fromCm(42),
    height: fromCm(42),
  },
  dimensionSource:
    "Merchant product page (upper: L86 x W42 x H26 cm, rim height; base: L76 x W30 cm); overall height incl. handles estimated at ~42 cm from side packshot",
  dimensionConfidence: "medium",
});
