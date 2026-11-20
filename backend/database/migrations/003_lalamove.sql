-- 003: Lalamove delivery
-- Run once in the Supabase SQL Editor (safe to run again).
--
-- Adds the customer's map pin (Lalamove needs exact coordinates) and
-- the rider booking details to each order, and saves the pin with the
-- customer's address so checkout remembers it next time.

alter table orders
  add column if not exists ship_lat             numeric(9, 6),
  add column if not exists ship_lng             numeric(9, 6),
  add column if not exists lalamove_status      varchar(30),
  add column if not exists lalamove_share_link  varchar(500),
  add column if not exists lalamove_fee         numeric(10, 2),
  add column if not exists lalamove_driver_id   varchar(50);

alter table addresses
  add column if not exists lat  numeric(9, 6),
  add column if not exists lng  numeric(9, 6);
