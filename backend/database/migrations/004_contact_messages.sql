-- 004: Contact messages
-- Run once in the Supabase SQL Editor (safe to run again).
--
-- Messages sent from the Contact page. The shop owner reads them in the
-- back office (Messages) and marks each one as read or replied.

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

-- Same lock as the other tables: only the FastAPI backend can read and write.
alter table contact_messages enable row level security;
