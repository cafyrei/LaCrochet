// Can this cart line be ordered right now? (Still on sale, and enough in stock.)
export const canOrder = (item) => item.available && item.quantity <= item.stockQty;
