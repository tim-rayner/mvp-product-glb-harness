import {
  SpatialProductSourceSchema,
  type SpatialProductSource,
} from "../product";
import { formatToMm } from "../../../shared/utils/formatToMm";

const fromCm = formatToMm("cm");

/** Flynn Cotbed (white), populated from the Mamas & Papas product page. Cot mode dimensions. */
export const flynCotbed: SpatialProductSource = SpatialProductSourceSchema.parse({
  merchantId: "mamas-and-papas",
  productId: "flyn-cot-bed-white",
  sku: "CBFM02700",
  title: "Flynn Cotbed",
  sourceUrl:
    "https://www.mamasandpapas.com/products/flyn-cot-bed-white-m-cbfm02700",
  images: [
    "https://www.mamasandpapas.com/cdn/shop/files/mamas-papas-cot-beds-flyn-baby-cotbed-white-34588859924645.jpg?v=1691756039&width=1000",
    "https://www.mamasandpapas.com/cdn/shop/files/mamas-papas-cot-beds-flyn-baby-cotbed-white-34588859891877.jpg?v=1743765988&width=1000",
    "https://www.mamasandpapas.com/cdn/shop/files/mamas-papas-cot-beds-flyn-cotbed-white-1154223694.jpg?v=1743769972&width=1000",
    "https://www.mamasandpapas.com/cdn/shop/products/mamas-papas-cot-beds-flyn-baby-cotbed-white-32128952696997.jpg?v=1743765988&width=1000",
    "https://www.mamasandpapas.com/cdn/shop/products/mamas-papas-cot-beds-flyn-baby-cotbed-white-32129056440485.jpg?v=1743765988&width=1000",
    "https://www.mamasandpapas.com/cdn/shop/products/mamas-papas-cot-beds-flyn-baby-cotbed-white-32129078919333.jpg?v=1743765988&width=1000",
  ],
  dimensions: {
    width: fromCm(146.3),
    depth: fromCm(79.5),
    height: fromCm(95.3),
  },
  dimensionSource: "Merchant product page (cot mode: 146.3 x 79.5 x 95.3 cm)",
  dimensionConfidence: "high",
});
