import {
  SpatialProductSourceSchema,
  type SpatialProductSource,
} from "../product";
import { formatToMm } from "../../../shared/utils/formatToMm";

const fromCm = formatToMm("cm");

const sourceUrl =
  "https://www.mamasandpapas.com/products/penrose-nursing-chair-stool-off-wht-fr-seps8bw00";
const imageUrl = (id: number, v: number) =>
  `https://cdn.shopify.com/s/files/1/0414/6023/6453/files/mamas-papas-nursing-chair-sets-penrose-nursing-chair-stool-off-white-boucle-${id}.jpg?v=${v}`;

/**
 * The full merchant gallery for the Penrose set, in page order. There is no back view.
 *
 * 0: lifestyle (chair + stool in a nursery), 1: three-quarter chair + stool, 2: three-quarter
 * chair, 3: three-quarter stool, 4: front chair, 5: side chair (profile), 6: fabric close-up.
 */
const images = [
  imageUrl(1208376500, 1764009293),
  imageUrl(1208376495, 1764009301),
  imageUrl(1208376498, 1764009306),
  imageUrl(1208376499, 1764009286),
  imageUrl(1208376497, 1764009296),
  imageUrl(1208376494, 1764009299),
  imageUrl(1208376496, 1764009174),
];

/**
 * Penrose rocking nursing chair and footstool (off-white boucle), one product sold as a set,
 * populated from the Mamas & Papas product page and modelled as arranged in the set packshot
 * (images[1]): the stool in front of the chair, within its width.
 *
 * The merchant only publishes per-piece dimensions (chair W76 x D82 x H88 cm, footstool W50 x D41
 * x H37 cm). Width and height are the chair's, since the stool sits inside its width and is lower.
 * Depth is estimated: chair depth + ~2 cm gap + stool depth ≈ 125 cm. The gap is a styling choice
 * read off the packshot, hence low confidence.
 */
export const penroseNursingChairStool: SpatialProductSource = SpatialProductSourceSchema.parse({
  merchantId: "mamas-and-papas",
  productId: "penrose-nursing-chair-stool-off-white-boucle",
  sku: "SEPS8BW00",
  title: "Penrose Nursing Chair & Stool - Off White Boucle",
  sourceUrl,
  images,
  dimensions: {
    width: fromCm(76),
    depth: fromCm(125),
    height: fromCm(88),
  },
  dimensionSource:
    "Merchant product page (chair: W76 x D82 x H88 cm; footstool: W50 x D41 x H37 cm); set depth estimated at ~125 cm from the arrangement in the set packshot",
  dimensionConfidence: "low",
});
