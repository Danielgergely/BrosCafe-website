import StockPhotoNote from "@/components/product/StockPhotoNote";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/**
 * A compact product card for the sideways rows: photo, name, price, and a tap
 * opens the product. `product` must already be localized.
 *
 * Unlike ProductCard it carries no shared-layout image id: a product can sit in
 * a row and in the /menu grid at once, and two elements with one layoutId make
 * the modal's opening animation jump between them.
 */
export default function ProductTile({ product, testId = "product-tile" }) {
  const { openProduct } = useUi();

  return (
    <button
      type="button"
      data-testid={`${testId}-${product.id}`}
      data-cursor="view"
      onClick={() => openProduct(product.id)}
      className="group block w-[38vw] max-w-[220px] shrink-0 snap-start text-left sm:w-[220px]"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-white">
        <img
          src={product.images?.[0]}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.05]"
        />
        <StockPhotoNote product={product} className="absolute bottom-2 left-2 z-10" />
      </div>
      <p className="mt-3 line-clamp-2 font-display text-lg font-medium leading-tight text-olive">
        {product.name}
      </p>
      <p className="mt-1 text-sm font-medium text-olive/70">{formatPrice(product.price_huf)}</p>
    </button>
  );
}
