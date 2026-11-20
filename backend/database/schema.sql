-- =====================================================================
-- La Crochet — database schema (PostgreSQL / Supabase)
-- Run this once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Then run seed.sql to add the starting categories and products.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: keeps every table's updated_at current automatically.
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- USERS — customer and admin accounts (sign-up form)
-- ---------------------------------------------------------------------
create table users (
  user_id            integer generated always as identity primary key,
  first_name         varchar(100) not null,
  last_name          varchar(100) not null,
  email              varchar(255) not null unique,
  password_hash      varchar(255) not null,
  phone              varchar(20),
  role               varchar(20)  not null default 'customer'
                       check (role in ('customer', 'admin')),
  marketing_opt_in   boolean      not null default false,
  terms_accepted_at  timestamptz,
  terms_version      date         not null,
  email_verified_at  timestamptz,
  created_at         timestamptz  not null default now(),
  updated_at         timestamptz  not null default now(),
  -- Emails are always saved in lowercase (the backend does this too).
  constraint users_email_lowercase check (email = lower(email))
);


-- ---------------------------------------------------------------------
-- ADDRESSES — saved shipping addresses (one user can have many)
-- ---------------------------------------------------------------------
create table addresses (
  address_id      integer generated always as identity primary key,
  user_id         integer      not null references users(user_id) on delete cascade,
  recipient_name  varchar(200) not null,
  phone           varchar(20)  not null,
  street          varchar(255) not null,
  barangay        varchar(100) not null,
  city            varchar(100) not null,
  province        varchar(100) not null,
  postal_code     varchar(10)  not null check (postal_code ~ '^\d{4}$'),
  country         varchar(100) not null default 'Philippines',
  lat             numeric(9, 6),   -- map pin, remembered for next checkout
  lng             numeric(9, 6),
  is_default      boolean      not null default false,
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);

create index addresses_user_id_idx on addresses(user_id);
-- Only ONE default address per user.
create unique index addresses_one_default_per_user
  on addresses(user_id) where is_default;


-- ---------------------------------------------------------------------
-- CATEGORIES — shop sections (footer "Shop" links, catalog filters)
-- ---------------------------------------------------------------------
create table categories (
  category_id  integer generated always as identity primary key,
  name         varchar(100) not null unique,
  slug         varchar(100) not null unique,   -- used in links, e.g. /catalog?category=crochet-kits
  description  varchar(255),
  sort_order   integer      not null default 0,
  created_at   timestamptz  not null default now()
);


-- ---------------------------------------------------------------------
-- PRODUCTS — everything sold in the catalog
-- ---------------------------------------------------------------------
create table products (
  product_id   integer generated always as identity primary key,
  category_id  integer        references categories(category_id) on delete set null,
  name         varchar(150)   not null,
  slug         varchar(160)   not null unique,
  description  text           not null default '',
  price        numeric(10, 2) not null check (price > 0),   -- in pesos, e.g. 450.00
  image_url    varchar(500),
  stock_qty    integer        not null default 0 check (stock_qty >= 0),
  is_active    boolean        not null default true,        -- false = hidden from the shop
  is_featured  boolean        not null default false,       -- shows in "Best Selling" on the home page
  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now()
);

create index products_category_id_idx on products(category_id);
create index products_active_idx on products(is_active);


-- ---------------------------------------------------------------------
-- WISHLIST — the heart button
-- ---------------------------------------------------------------------
create table wishlist_items (
  user_id     integer     not null references users(user_id) on delete cascade,
  product_id  integer     not null references products(product_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);


-- ---------------------------------------------------------------------
-- CART — each logged-in customer's cart, saved to their account
-- ---------------------------------------------------------------------
create table cart_items (
  user_id     integer     not null references users(user_id) on delete cascade,
  product_id  integer     not null references products(product_id) on delete cascade,
  quantity    integer     not null check (quantity between 1 and 99),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, product_id)   -- one row per product per customer
);


-- ---------------------------------------------------------------------
-- ORDERS — one row per checkout
-- Contact + address are COPIED here, so old orders stay correct even if
-- the customer later edits their profile or deletes an address.
-- ---------------------------------------------------------------------
create sequence order_number_seq;

create table orders (
  order_id          integer generated always as identity primary key,
  order_number      varchar(20) not null unique
                      default ('LC-' || to_char(now(), 'YYYY') || '-' ||
                               lpad(nextval('order_number_seq')::text, 4, '0')),  -- LC-2026-0001
  user_id           integer     references users(user_id) on delete set null,  -- null = guest checkout
  -- Secret part of the confirmation link, so order numbers can't be guessed.
  access_token      uuid        not null default gen_random_uuid() unique,

  -- Contact information (checkout form)
  customer_name     varchar(200) not null,
  email             varchar(255) not null,
  phone             varchar(20)  not null,

  -- Shipping
  shipping_method   varchar(20)  not null check (shipping_method in ('delivery', 'pickup')),
  ship_street       varchar(255),
  ship_barangay     varchar(100),
  ship_city         varchar(100),
  ship_province     varchar(100),
  ship_postal_code  varchar(10),
  ship_country      varchar(100) default 'Philippines',
  ship_lat          numeric(9, 6),   -- customer's map pin (Lalamove needs it)
  ship_lng          numeric(9, 6),

  -- Payment
  payment_method    varchar(20)  not null check (payment_method in ('cod', 'online')),
  payment_status    varchar(20)  not null default 'unpaid'
                      check (payment_status in ('unpaid', 'paid', 'failed', 'refunded')),
  order_status      varchar(20)  not null default 'pending'
                      check (order_status in ('pending', 'processing', 'ready_for_pickup',
                                              'shipped', 'completed', 'cancelled')),

  -- Money (pesos)
  subtotal          numeric(10, 2) not null check (subtotal >= 0),
  shipping_fee      numeric(10, 2) not null default 0 check (shipping_fee >= 0),
  total             numeric(10, 2) not null check (total >= 0),

  -- Outside services
  payrex_checkout_session_id  varchar(100) unique,
  lalamove_order_id           varchar(100),
  lalamove_status             varchar(30),    -- ASSIGNING_DRIVER, ON_GOING, PICKED_UP, COMPLETED, ...
  lalamove_share_link         varchar(500),   -- live tracking page for the customer
  lalamove_fee                numeric(10, 2), -- what Lalamove charged when the rider was booked
  lalamove_driver_id          varchar(50),

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint orders_total_matches check (total = subtotal + shipping_fee),
  -- A delivery order must have an address; pickup doesn't need one.
  constraint orders_delivery_needs_address check (
    shipping_method = 'pickup'
    or (ship_street is not null and ship_city is not null and ship_postal_code is not null)
  )
);

create index orders_user_id_idx on orders(user_id);
create index orders_status_idx on orders(order_status);
create index orders_created_at_idx on orders(created_at desc);


-- ---------------------------------------------------------------------
-- ORDER ITEMS — the products inside each order
-- Name and price are copied, so a later price change doesn't rewrite history.
-- ---------------------------------------------------------------------
create table order_items (
  order_item_id  integer generated always as identity primary key,
  order_id       integer        not null references orders(order_id) on delete cascade,
  product_id     integer        references products(product_id) on delete set null,
  product_name   varchar(150)   not null,
  unit_price     numeric(10, 2) not null check (unit_price > 0),
  quantity       integer        not null check (quantity between 1 and 99),
  line_total     numeric(10, 2) generated always as (unit_price * quantity) stored
);

create index order_items_order_id_idx on order_items(order_id);


-- ---------------------------------------------------------------------
-- NEWSLETTER — footer "Join" form
-- ---------------------------------------------------------------------
create table newsletter_subscribers (
  subscriber_id    integer generated always as identity primary key,
  email            varchar(255) not null unique check (email = lower(email)),
  subscribed_at    timestamptz  not null default now(),
  unsubscribed_at  timestamptz
);


-- ---------------------------------------------------------------------
-- Contact page messages (also in migrations/004_contact_messages.sql)
-- ---------------------------------------------------------------------
create table if not exists contact_messages (
  message_id    serial       primary key,
  user_id       integer      references users (user_id) on delete set null,  -- null = guest
  name          varchar(200) not null,
  email         varchar(255) not null,
  phone         varchar(20),
  topic         varchar(20)  not null check (topic in ('order', 'custom', 'product', 'other')),
  order_number  varchar(20),
  message       text         not null check (char_length(message) between 1 and 2000),
  status        varchar(10)  not null default 'new' check (status in ('new', 'read', 'replied')),
  created_at    timestamptz  not null default now()
);

create index if not exists contact_messages_status_idx on contact_messages (status, created_at desc);

-- ---------------------------------------------------------------------
-- Auto-update updated_at
-- ---------------------------------------------------------------------
create trigger users_set_updated_at     before update on users     for each row execute function set_updated_at();
create trigger addresses_set_updated_at before update on addresses for each row execute function set_updated_at();
create trigger products_set_updated_at  before update on products  for each row execute function set_updated_at();
create trigger orders_set_updated_at    before update on orders    for each row execute function set_updated_at();
create trigger cart_items_set_updated_at before update on cart_items for each row execute function set_updated_at();


-- ---------------------------------------------------------------------
-- Security: Supabase also exposes tables through a public web API.
-- Turning on Row Level Security with no rules locks that door, so only
-- your FastAPI backend (which connects directly) can read and write.
-- ---------------------------------------------------------------------
alter table users                  enable row level security;
alter table addresses              enable row level security;
alter table categories             enable row level security;
alter table products               enable row level security;
alter table wishlist_items         enable row level security;
alter table cart_items             enable row level security;
alter table orders                 enable row level security;
alter table order_items            enable row level security;
alter table newsletter_subscribers enable row level security;
alter table contact_messages       enable row level security;
