import {
  SpatialProductSourceSchema,
  type SpatialProductSource,
} from "../product";
import { formatToMm } from "../../../shared/utils/formatToMm";

const fromCm = formatToMm("cm");

const sourceUrl = "https://www.mamasandpapas.com/products/flyn-set-oxford-whitem-smfn02700";
const imageUrl = (path: string, v: number) =>
  `https://cdn.shopify.com/s/files/1/0414/6023/6453/${path}.jpg?v=${v}`;

/**
 * The dresser images from the Flyn 2 piece set gallery, in page order. The cotbed-only shots are
 * left out. There is no back view.
 *
 * 0: front lifestyle (with the changing top and props), 1: three-quarter close-up of the changing
 * top, 2: three-quarter without the changing top, 3: three-quarter with the changing top.
 */
const images = [
  imageUrl("products/mamas-papas-furniture-sets-flyn-2-piece-cotbed-and-dresser-changer-set-white-32129123942565", 1720444748),
  imageUrl("files/mamas-papas-furniture-sets-flyn-2-piece-cotbed-and-dresser-changer-set-white-34588892430501", 1720444748),
  imageUrl("products/mamas-papas-furniture-sets-flyn-2-piece-cotbed-and-dresser-changer-set-white-32128928841893", 1720444748),
  imageUrl("products/mamas-papas-furniture-sets-flyn-2-piece-cotbed-and-dresser-changer-set-white-32128928874661", 1720444748),
];

/**
 * Flyn Dresser Changer (white), with the changing top fitted. Populated from the Mamas & Papas
 * Flyn 2 piece set page, which is the only listing found for it. No SKU is recorded because the
 * page's SKU (SMFN02700) belongs to the set, not to the dresser.
 */
export const flynDresserChanger: SpatialProductSource = SpatialProductSourceSchema.parse({
  merchantId: "mamas-and-papas",
  productId: "flyn-dresser-changer-white",
  title: "Flyn Dresser Changer - White",
  sourceUrl,
  images,
  dimensions: {
    width: fromCm(103.5),
    depth: fromCm(53),
    height: fromCm(98.8),
  },
  dimensionSource:
    "Merchant set product page, dresser changer with changer rails fitted: 103.5 x 53 x 98.8 cm (without: 103.5 x 51 x 90.5 cm)",
  dimensionConfidence: "high",
});
