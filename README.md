# La Crochet

An online shop for handmade crochet pieces. Customers browse, add to cart, pay online (PayRex) or cash on delivery, and get their order by Lalamove rider or store pickup. The owner runs everything from a back office at `/admin`. Yarnie, a chat helper powered by Google Gemini, answers questions in the corner of every shop page.

This guide gets the project running on **your own laptop** after you clone or pull it from GitHub.

---

## How the project is put together

Think of it like a small store:

| Part | Like a… | Folder | Runs at |
| --- | --- | --- | --- |
| **Website** (frontend) | The shop floor customers see | `la-crochet-project/` | http://localhost:5173 |
| **Backend** (server) | The cashier who checks every rule | `backend/` | http://localhost:8000 |
| **Database** | The record book | Supabase (online) | — |
| **PayRex, Lalamove, Gemini** | Outside partners: payments, riders, chat | Called only by the backend | — |

You need **two terminal windows open at the same time**: one for the backend, one for the website.

```text
LaCrochet/
├── backend/                 # FastAPI server (Python)
│   ├── main.py              # starts the server
│   ├── routes/              # one file per area: orders, cart, payments, chat, ...
│   ├── models/ schemas/     # database tables and data shapes
│   ├── database/            # schema.sql, seed.sql, migrations/
│   ├── tests/               # automatic tests (see tests/TESTING.md)
│   ├── .env.example         # list of settings to copy into .env
│   └── requirements.txt     # Python packages
├── la-crochet-project/      # React + Vite website
│   ├── src/pages/           # one file per page (pages/admin = back office)
│   ├── src/components/      # shared pieces (Navbar, Footer, login, chat...)
│   └── src/api/             # how the website talks to the backend
└── README.md
```

---

## 1. Install these first (one time)

| Tool | Get it from | Check it works |
| --- | --- | --- |
| Python 3.12 or newer | python.org (tick **"Add Python to PATH"** when installing) | `py --version` |
| Node.js (LTS) | nodejs.org | `node -v` |
| Git | git-scm.com | `git --version` |

---

## 2. Get the code (first time only)

```bat
cd C:\Users\YOUR-NAME\Documents
git clone https://github.com/H4d3ssss/LaCrochet.git
cd LaCrochet
```

Already have it? Just get the latest:

```bat
cd C:\Users\YOUR-NAME\Documents\LaCrochet
git pull
```

---

## 3. Set up the backend (first time only)

Open a terminal in the project folder:

```bat
cd backend
py -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
```

- `venv` is the backend's own "lunchbox" of Python packages, kept separate from other projects. When it's on, your terminal line starts with `(venv)`.
- Always use `python -m pip`, not plain `pip`, so packages go into the venv.

**Make your settings file (`.env`):**

1. In the `backend` folder, copy `.env.example` and name the copy `.env`:

    ```bat
    copy .env.example .env
    ```

2. Open `.env` in VS Code and fill it in. **Ask the team lead for the team's values in a private message** (database address and test keys). Never post them in a group chat, a screenshot, or GitHub.

Only `DATABASE_URL`, `JWT_SECRET` and `FRONTEND_URL` are required. If the PayRex, Lalamove or Gemini lines are empty, the shop still runs:

- no PayRex: paying online shows an error, but cash on delivery works,
- no Lalamove: delivery is a flat ₱90,
- no Gemini: the chat button says Yarnie isn't set up yet.

> `.env` is in `.gitignore`, so Git never uploads it. Before every commit, run `git status` and make sure `.env` is **not** in the list.

---

## 4. Set up the website (first time only)

Open a **second** terminal in the project folder:

```bat
cd la-crochet-project
npm install
```

The website looks for the backend at `http://localhost:8000`. You don't need a `.env` in this folder.

---

## 5. Run it (every time you work)

**Terminal 1: backend**

```bat
cd C:\Users\YOUR-NAME\Documents\LaCrochet\backend
venv\Scripts\activate
uvicorn main:app --reload
```

Open http://localhost:8000. It should say *"La Crochet API is running!"*. The list of all backend addresses is at http://localhost:8000/docs.

**Terminal 2: website**

```bat
cd C:\Users\YOUR-NAME\Documents\LaCrochet\la-crochet-project
npm run dev
```

Open **http://localhost:5173**. Press `Ctrl + C` in a terminal to stop it.

---

## 6. After every `git pull`

Someone else's changes may need a small step on your side. Check what changed:

| If the pull changed… | Do this |
| --- | --- |
| `backend/requirements.txt` | In terminal 1 (venv on): `python -m pip install -r requirements.txt` |
| `la-crochet-project/package.json` | In terminal 2: `npm install` |
| `backend/.env.example` (a new setting) | Copy the new line into your own `.env` and fill it in |
| A new file in `backend/database/migrations/` | The database needs an update; see section 7 |
| Anything else | Nothing. The backend and website reload by themselves |

Not sure? Running both install commands again is always safe.

---

## 7. The database (Supabase)

If the team shares **one** Supabase database, only one person needs to do this. Everyone else just uses the same `DATABASE_URL`.

**Brand-new database:** in Supabase, open **SQL Editor**, paste and **Run** these files from `backend/database/` in this order:

1. `schema.sql` builds all the tables.
2. `seed.sql` adds starter categories and products.

**Existing database:** run each new file in `backend/database/migrations/` once, in number order:

| File | Adds |
| --- | --- |
| `001_order_access_token.sql` | Private order links |
| `002_cart_items.sql` | Carts saved per account |
| `003_lalamove.sql` | Map pins and rider details |
| `004_contact_messages.sql` | Contact page messages (back office → Messages) |

The migration files are safe to run again if you're not sure whether one was run.

> If a back-office page says **"Could not reach the server"** but the backend is running, a migration is usually missing. Check the backend terminal for `relation "…" does not exist`.

---

## 8. Using the shop

- **Customer:** click *Log in* → *Create account*, then shop as normal.
- **Owner (back office):** sign up, then in Supabase's SQL Editor run:

    ```sql
    update users set role = 'admin' where email = 'your@email.com';
    ```

    Log out and in again. You'll land in the back office (`/admin`).

**Product photos:** in Back office → Products → Add/Edit, drag a photo onto the box, click *Choose a photo*, or paste one. Photos are saved in `backend/uploads/` on **your** laptop and are not uploaded to GitHub, so your teammates won't see the photos you upload (they'll see a yarn icon instead).

**Testing payments, delivery and chat:**

| Feature | What you need in `.env` | Notes |
| --- | --- | --- |
| Online payment | `PAYREX_API_SECRET` (`sk_test_…`) | Test mode = no real money. PayRex can't return to `localhost`, so also run `ngrok http 8000`, put that address in `PUBLIC_API_URL`, and run `py setup_payrex_webhook.py https://your-ngrok-address` once (inside `backend`, venv on). |
| Lalamove delivery | `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET` (`pk_test_…`), `SHOP_LAT`, `SHOP_LNG`, `SHOP_PHONE` | Sandbox = fake riders. Check your setup with `py check_delivery_setup.py`. |
| Yarnie chat | `GEMINI_API_KEY` | Free quota is shared per Google project. If Yarnie says it's "very busy", wait a minute. |

---

## 9. Running the tests

The tests check PayRex, Lalamove, Gemini and photo uploads using practice copies. No internet, no real keys and no real money are needed.

```bat
cd backend
venv\Scripts\activate
python -m pip install -r requirements-dev.txt
python -m pytest -m contract
```

To run **all** the tests, put a **separate, empty** database in `TEST_DATABASE_URL` in `.env` (for example, a second free Supabase project). **Never use the shop's real database here**: the tests wipe their database. Then run:

```bat
python -m pytest
```

More details are in [`backend/tests/TESTING.md`](backend/tests/TESTING.md).

---

## 10. Common problems

| You see | Fix |
| --- | --- |
| `pip is not recognized` | Use `python -m pip …` with the venv on |
| `venv\Scripts\activate` is blocked ("running scripts is disabled") | Run once in PowerShell: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use Command Prompt instead |
| `ModuleNotFoundError` | Venv not on, or packages missing: `venv\Scripts\activate`, then `python -m pip install -r requirements.txt` |
| `npm` errors about missing packages, or the map doesn't show | `npm install` in `la-crochet-project` |
| Website says "Could not reach the server" | Start the backend (terminal 1). Still failing? See the note in section 7 |
| A `.env` change does nothing | Stop the backend (`Ctrl + C`) and start it again |
| Can't open `/admin` | Your account isn't the owner yet; see section 8 |
| `git pull` says your changes would be overwritten | Save your work first: `git stash`, then `git pull`, then `git stash pop` |

---

## Rules for the team

- Never commit `.env`, keys or passwords. Use **test/sandbox keys** only.
- Pull before you start working: `git pull`.
- Commit small, clear changes: `git add .` → `git commit -m "Add photo upload to products"` → `git push`.
- If you add a database change, add a new numbered file in `backend/database/migrations/` and tell the team to run it.
- If you add a new setting, add it (without the real value) to `backend/.env.example`.


## HADES WAS HERE
