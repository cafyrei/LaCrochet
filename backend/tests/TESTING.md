# Testing the 3 outside services (PayRex, Lalamove, Gemini)

La Crochet talks to three outside companies:

- **PayRex** for online payments (GCash, Maya, cards).
- **Lalamove** for riders.
- **Gemini** (Google) for Yarnie, the chat helper.

These tests check that our side of each conversation is right. They run without the internet, without real keys and without real money.

## The three kinds of test, in plain words

| Kind | Everyday comparison | What it checks |
|---|---|---|
| **Contract** | Checking a letter against the post office's rules before mailing it | Every message we send uses the exact format PayRex, Lalamove and Gemini publish: the right fields, amounts in centavos, signatures and phone formats. It also checks that we read their answers and error messages correctly. |
| **Integration** | A full rehearsal with stand-in actors | A whole journey through the real backend and a real (test) database. For example: customer pays → PayRex says "paid" → order becomes *Preparing* and only the bought items leave the cart. |
| **Interface** | Checking that the plug fits the socket | The website (React) gets back the exact keys it reads (`checkout_url`, `fee`, `rider`, `reply`, …), the right status codes, and a readable `detail` message on errors. |
| **Live** (optional) | One quick phone call to the real company | One tiny real call to each sandbox, to prove the rules we wrote down still match. Off by default. |

### The stand-ins ("fakes")

The tests never reach the real companies. Instead they talk to practice copies in `tests/fakes/` that act like the real thing:

- **Fake PayRex** checks our secret key and refuses badly formed requests. It can act as a customer paying, and it sends signed "paid" messages (webhooks).
- **Fake Lalamove** checks every signature and gives prices by distance. It refuses spots outside its area, assigns rider "Juan Dela Cruz", and refuses cancelling more than 5 minutes after a rider is assigned, just like Lalamove.
- **Fake Gemini** is a small local server. It can pretend to be busy (503), out of quota (429), wrong key (401) or give an empty answer.

The rules each fake follows are written down once in `tests/contracts/`.

### Safety built in

- All keys in the tests are fake (`sk_test_FAKE…`). Your real `.env` keys are never used, except by the optional live tests.
- A guard blocks the internet during tests. Any accidental real call fails loudly.
- The database tests **wipe their database**. So they only run on `TEST_DATABASE_URL`, and they refuse to start if it is the same as your real `DATABASE_URL`.

## How to run them (Windows)

```bat
cd C:\Users\ralff\Documents\LaCrochet\backend
venv\Scripts\activate
python -m pip install -r requirements-dev.txt
```

**1. Tests that need no database** (contract tests, most of them):

```bat
python -m pytest -m contract
```

**2. Everything.** First make a **separate, empty** Postgres database. You can use a second free Supabase project, or Postgres on your laptop. Never use the shop's real database. Then add its address to `backend/.env`:

```
TEST_DATABASE_URL=postgresql+psycopg://postgres:PASSWORD@HOST:5432/postgres
```

```bat
python -m pytest
```

**Only one kind:** `python -m pytest -m integration` (or `-m interface`, `-m contract`).
**Only one service:** `python -m pytest -k payrex` (or `-k lalamove`, `-k gemini`).

**3. Live tests (optional).** These use your real **test/sandbox** keys from `.env`, so they need the internet:

```bat
set RUN_LIVE_API_TESTS=1
python -m pytest -m live
set RUN_LIVE_API_TESTS=
```

They only run with a PayRex `sk_test_` key and a Lalamove `pk_test_` key. They make one ₱20 test payment page and close it straight away. They ask Lalamove for one price and never book a rider. They ask Gemini one short question.

## Results (21 Nov 2026)

**113 passed, 3 skipped** (the 3 skipped are the live tests, which are off by default). It takes about 12 seconds.

| | Contract | Integration | Interface |
|---|---|---|---|
| PayRex | 15 | 14 | 7 |
| Lalamove | 23 | 16 | 6 |
| Gemini | 13 | 12 | 7 |

Small thing noticed: `routes/chatRoutes.py` uses `HTTP_422_UNPROCESSABLE_ENTITY`. The newest Starlette calls it `HTTP_422_UNPROCESSABLE_CONTENT`. It still works today, it just prints a warning.
