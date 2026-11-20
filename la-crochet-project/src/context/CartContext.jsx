import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  addCartItem,
  emptyCart,
  getCart,
  removeCartItem,
  setCartItemQuantity,
} from "../api/cart";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { canOrder } from "../utils/cart";

const CartContext = createContext(null);
const OLD_STORAGE_KEY = "lacrochet-cart"; // carts used to live in the browser
const EMPTY_CART = { items: [], count: 0, subtotal: 0 };
// Remembers which cart items the customer UNticked, per account, so new items
// start ticked and their choice survives a page refresh.
const unselectedKey = (userId) => `lacrochet-cart-unselected-${userId}`;

function loadUnselected(userId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(unselectedKey(userId))) ?? []);
  } catch {
    return new Set();
  }
}

function saveUnselected(userId, ids) {
  try {
    localStorage.setItem(unselectedKey(userId), JSON.stringify([...ids]));
  } catch {
    // Storage blocked: the choice just won't survive a refresh.
  }
}

function getProductId(product) {
  return product?.id ?? product?.product_id ?? product?.productId;
}

// Server shape → the shape the pages already use.
function toCart(data) {
  return {
    items: data.items.map((line) => ({
      id: line.product_id,
      name: line.name,
      image: line.image_url,
      price: line.price,
      quantity: line.quantity,
      stockQty: line.stock_qty,
      available: line.available,
    })),
    count: data.count,
    subtotal: data.subtotal,
  };
}

export function CartProvider({ children }) {
  const { user, token, requestLogin } = useAuth();
  const { toast } = useToast();
  const [cart, setCart] = useState(EMPTY_CART);
  const userId = user?.user_id ?? null;
  const [unselected, setUnselected] = useState(() => (userId ? loadUnselected(userId) : new Set()));
  const [unselectedFor, setUnselectedFor] = useState(userId);
  const [isLoading, setIsLoading] = useState(false);
  const [cartError, setCartError] = useState("");

  // Item a guest clicked before logging in; added as soon as they log in.
  const pendingAddRef = useRef(null);

  // Carts now live in the database: clear the old browser copy once.
  useEffect(() => {
    try {
      localStorage.removeItem(OLD_STORAGE_KEY);
    } catch {
      // Storage unavailable; nothing to clean up.
    }
  }, []);

  const applyCart = useCallback((data) => {
    setCart(toCart(data));
    setCartError("");
  }, []);

  // Each account remembers its own ticks: switch to theirs when someone logs in or out.
  if (userId !== unselectedFor) {
    setUnselectedFor(userId);
    setUnselected(userId ? loadUnselected(userId) : new Set());
  }

  // Load the logged-in customer's cart (and finish a pending "Add to Cart").
  // Logged out → empty cart.
  useEffect(() => {
    if (!user || !token) {
      setCart(EMPTY_CART);
      return;
    }

    let ignore = false;
    const pending = pendingAddRef.current;
    pendingAddRef.current = null;

    setIsLoading(true);
    const load = pending
      ? addCartItem(token, pending.productId, pending.quantity)
          .then((data) => {
            toast({ message: "Added to your cart", action: { label: "View cart", to: "/cart" } });
            return data;
          })
          .catch((error) => {
            // Couldn't add it (e.g. sold out): still show their cart, plus why.
            if (!ignore) setCartError(error.message);
            toast({ message: error.message, tone: "error" });
            return getCart(token);
          })
      : getCart(token);

    load
      .then((data) => {
        if (!ignore) setCart(toCart(data));
      })
      .catch((error) => {
        if (!ignore) setCartError(error.message);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [user, token, toast]); // toast never changes, so this still runs only on login/logout

  const refreshCart = useCallback(async () => {
    if (!token) return;
    try {
      applyCart(await getCart(token));
    } catch (error) {
      setCartError(error.message);
    }
  }, [token, applyCart]);

  // Returns { ok: true } if added. Guests get the login popup instead,
  // and the item is added right after they log in.
  // quiet: no "Added to your cart" message (e.g. Buy now goes straight to checkout).
  async function addToCart(product, quantity = 1, { quiet = false } = {}) {
    const productId = getProductId(product);
    const amount = Math.max(1, Math.floor(Number(quantity) || 1));

    if (!user) {
      requestLogin(() => {
        pendingAddRef.current = { productId, quantity: amount };
      }, "to add this to your cart");
      return { ok: false, needsLogin: true };
    }

    try {
      applyCart(await addCartItem(token, productId, amount));
      if (!quiet) toast({ message: "Added to your cart", action: { label: "View cart", to: "/cart" } });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async function changeQuantity(productId, amount) {
    const item = cart.items.find((line) => line.id === productId);
    if (!item) return;
    const quantity = item.quantity + amount;
    if (quantity < 1) return;

    try {
      applyCart(await setCartItemQuantity(token, productId, quantity));
    } catch (error) {
      setCartError(error.message);
    }
  }

  // Removes a line, with an "Undo" button in the message that puts it back.
  async function removeFromCart(productId) {
    const item = cart.items.find((line) => line.id === productId);
    try {
      applyCart(await removeCartItem(token, productId));
      if (item) {
        toast({
          message: `Removed ${item.name}`,
          tone: "info",
          action: {
            label: "Undo",
            onClick: () =>
              addCartItem(token, productId, item.quantity)
                .then(applyCart)
                .catch((error) => toast({ message: error.message, tone: "error" })),
          },
        });
      }
    } catch (error) {
      setCartError(error.message);
    }
  }

  // ---- Choosing what to check out ----
  const updateUnselected = useCallback(
    (change) => {
      setUnselected((current) => {
        const next = change(new Set(current));
        if (user) saveUnselected(user.user_id, next);
        return next;
      });
    },
    [user]
  );

  const isSelected = (productId) => !unselected.has(productId);

  function toggleSelected(productId) {
    updateUnselected((ids) => {
      if (ids.has(productId)) ids.delete(productId);
      else ids.add(productId);
      return ids;
    });
  }

  // Tick (true) or untick (false) every item that can be ordered.
  function selectAll(selected) {
    updateUnselected((ids) => {
      cart.items.filter(canOrder).forEach((item) => (selected ? ids.delete(item.id) : ids.add(item.id)));
      return ids;
    });
  }

  // The lines going to checkout: ticked, still on sale and in stock.
  const selectedItems = useMemo(
    () => cart.items.filter((item) => canOrder(item) && !unselected.has(item.id)),
    [cart.items, unselected]
  );
  const selectedCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const selectedSubtotal = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  async function clearCart() {
    if (!token) {
      setCart(EMPTY_CART);
      return;
    }
    try {
      applyCart(await emptyCart(token));
    } catch (error) {
      setCartError(error.message);
    }
  }

  return (
    <CartContext.Provider
      value={{
        cartItems: cart.items,
        cartCount: cart.count,
        subtotal: cart.subtotal,
        selectedItems,
        selectedCount,
        selectedSubtotal,
        isSelected,
        toggleSelected,
        selectAll,
        isLoading,
        cartError,
        addToCart,
        changeQuantity,
        removeFromCart,
        clearCart,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside a CartProvider");
  }

  return context;
}
