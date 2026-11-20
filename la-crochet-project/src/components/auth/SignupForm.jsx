import { useRef, useState } from "react";
import { registerUser } from "../../api/auth";
import { useAuth } from "../../context/AuthContext";
import { useFieldErrors } from "../../utils/fieldErrors";


function Field({ label, id, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>

      <input id={id} className={`input ${props.readOnly ? "bg-sand text-muted" : ""}`} {...props} />
    </div>
  );
}

export default function SignupForm({
  onLogin,
  onClose,
  onLoginClick,
  onSignup = registerUser,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [addAddress, setAddAddress] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdName, setCreatedName] = useState(null);
  const { login } = useAuth();
  const formRef = useRef(null);

  useFieldErrors(formRef);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const data = new FormData(event.currentTarget);

    const account = {
      firstName: data.get("firstName").trim(),
      lastName: data.get("lastName").trim(),
      email: data.get("email").trim(),
      phone: data.get("phone").trim(),
      password: data.get("password"),
      acceptTerms: data.get("acceptTerms") === "on",
      marketingEmails: data.get("marketingEmails") === "on",
      shippingAddress: addAddress
        ? {
            street: data.get("street").trim(),
            barangay: data.get("barangay").trim(),
            city: data.get("city").trim(),
            province: data.get("province").trim(),
            postalCode: data.get("postalCode").trim(),
            country: "Philippines",
          }
        : null,
    };

    if (!account.firstName || !account.lastName) {
      setError("Please enter your first and last name.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onSignup(account);
      // Log them in straight away so they don't have to type it all again.
      try {
        await login(account.email, account.password, true, { quiet: true });
      } catch {
        // Account was created; they can still sign in by hand.
      }
      setCreatedName(account.firstName);
    } catch (err) {
      setError(
        err?.message || "Could not create your account. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdName) {
    return (
          <section aria-labelledby="signup-success-title" className="py-6 text-center">
            <h2
              id="signup-success-title"
              className="text-2xl font-semibold"
            >
              Welcome to La Crochet, {createdName}!
            </h2>

            <p className="mt-2 text-sm text-muted">
              Your account is ready and you're logged in.
            </p>

            {(onLoginClick || onClose) && (
              <button
                type="button"
                onClick={onLoginClick ?? onClose}
                className="btn-primary mt-6 w-full"
              >
                {onLoginClick ? "Sign in" : "Continue shopping"}
              </button>
            )}
          </section>
    );
  }

  return (
        <section aria-labelledby="signup-title">
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-7">
            {/* Heading */}
            <div>
              <h2
                id="signup-title"
                className="text-2xl font-semibold"
              >
                Create your account
              </h2>

              <p className="mt-1 text-sm text-muted">
                Save your cart, check out faster, and keep track of your orders.
              </p>
            </div>

            {/* Personal information */}
            <fieldset className="space-y-4">
              <legend className="mb-2 text-base font-bold text-ink">
                Personal information
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="First name"
                  id="signup-first-name"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  placeholder="Juan"
                  required
                />

                <Field
                  label="Last name"
                  id="signup-last-name"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Dela Cruz"
                  required
                />
              </div>

              <Field
                label={
                  addAddress
                    ? "Mobile number (needed for delivery)"
                    : "Mobile number (optional)"
                }
                id="signup-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+63 917 123 4567"
                required={addAddress}
              />
            </fieldset>

            <div className="h-px bg-line" />

            {/* Account details */}
            <fieldset className="space-y-4">
              <legend className="mb-2 text-base font-bold text-ink">
                Account details
              </legend>

              <Field
                label="Email address"
                id="signup-email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                placeholder="you@example.com"
                required
              />

              <Field
                label="Password"
                id="signup-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a password"
                minLength={8}
                aria-describedby="signup-password-hint"
                required
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p id="signup-password-hint" className="text-xs text-muted">
                  Use at least 8 characters.
                </p>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(event) => setShowPassword(event.target.checked)}
                    className="checkbox"
                  />
                  Show password
                </label>
              </div>
            </fieldset>

            <div className="h-px bg-line" />

            {/* Optional shipping address */}
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={addAddress}
                  onChange={(event) => setAddAddress(event.target.checked)}
                  aria-controls="signup-shipping-address"
                  className="checkbox mt-1"
                />

                <span>
                  <span className="block text-sm font-bold text-ink">
                    Add a shipping address
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    Save time at checkout. You can also add this later.
                  </span>
                </span>
              </label>

              {addAddress && (
                <fieldset
                  id="signup-shipping-address"
                  className="space-y-4 rounded-xl border border-line bg-cream p-4"
                >
                  <legend className="px-1 text-sm font-bold text-ink">
                    Shipping address
                  </legend>

                  <Field
                    label="House / unit number, building, and street"
                    id="signup-street"
                    name="street"
                    type="text"
                    autoComplete="address-line1"
                    placeholder="Unit 4, 123 Sampaguita Street"
                    required
                  />

                  <Field
                    label="Barangay"
                    id="signup-barangay"
                    name="barangay"
                    type="text"
                    autoComplete="address-line2"
                    placeholder="Barangay name"
                    required
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="City / municipality"
                      id="signup-city"
                      name="city"
                      type="text"
                      autoComplete="address-level2"
                      placeholder="Quezon City"
                      required
                    />

                    <Field
                      label="Province / region"
                      id="signup-province"
                      name="province"
                      type="text"
                      autoComplete="address-level1"
                      placeholder="Metro Manila"
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Postal code"
                      id="signup-postal-code"
                      name="postalCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="1100"
                      pattern="[0-9]{4}"
                      title="Enter a 4-digit Philippine postal code"
                      required
                    />

                    <Field
                      label="Country"
                      id="signup-country"
                      type="text"
                      autoComplete="country-name"
                      value="Philippines"
                      readOnly
                    />
                  </div>
                </fieldset>
              )}
            </div>

            {/* Preferences and terms */}
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink/80">
                <input
                  name="marketingEmails"
                  type="checkbox"
                  className="checkbox mt-1"
                />

                <span>
                  Email me about new collections, special offers, and LaCrochet
                  updates.
                </span>
              </label>

              <div className="flex items-start gap-3 text-sm text-ink/80">
                <input
                  id="signup-terms"
                  name="acceptTerms"
                  type="checkbox"
                  required
                  className="checkbox mt-1"
                />

                <div>
                  <label htmlFor="signup-terms">I agree to the </label>
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    Terms of Service
                  </a>
                  {" and acknowledge the "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    Privacy Policy
                  </a>
                  .
                </div>
              </div>
            </div>

            {error && (
              <p role="alert" className="alert-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              {isSubmitting ? "Creating your account…" : "Create account"}
            </button>

            <p data-announcer aria-live="polite" className="sr-only" />
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <button type="button" onClick={onLogin} className="link cursor-pointer">
              Log in
            </button>
          </p>
        </section>
  );
}
