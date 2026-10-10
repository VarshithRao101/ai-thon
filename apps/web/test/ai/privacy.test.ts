import { afterEach, describe, expect, it } from "vitest";
import { createShield } from "@/lib/ai/privacy";

describe("Privacy Shield: personal data never reaches the model", () => {
  afterEach(() => {
    process.env.PRIVACY_SHIELD = undefined;
  });

  it("masks emails, Indian phones, Aadhaar, PAN, UPI and cards", () => {
    const shield = createShield();
    const masked = shield.mask(
      "Asha (asha.rao@gmail.com, +91 98765 43210, 9123456789) Aadhaar 2345 6789 0123, PAN ABCDE1234F, pays via asha@okicici, card 4111 1111 1111 1111"
    );
    for (const leaked of [
      "asha.rao@gmail.com",
      "98765",
      "9123456789",
      "2345 6789",
      "ABCDE1234F",
      "@okicici",
      "4111",
    ]) {
      expect(masked).not.toContain(leaked);
    }
    expect(masked).toContain("[EMAIL_1]");
    expect(masked).toContain("[PHONE_1]");
    expect(masked).toContain("[PHONE_2]");
    expect(masked).toContain("[AADHAAR_1]");
    expect(masked).toContain("[PAN_1]");
    expect(masked).toContain("[UPI_1]");
    expect(masked).toContain("[CARD_1]");
    expect(shield.report()).toEqual({
      masked: 7,
      kinds: { email: 1, upi: 1, card: 1, aadhaar: 1, pan: 1, phone: 2 },
    });
  });

  it("gives the same value the same placeholder", () => {
    const shield = createShield();
    expect(shield.mask("a@b.co then a@b.co")).toBe("[EMAIL_1] then [EMAIL_1]");
    expect(shield.mask("again a@b.co")).toBe("again [EMAIL_1]");
    expect(shield.report().masked).toBe(1);
  });

  it("puts the real values back into the model's answer", () => {
    const shield = createShield();
    shield.mask("Reply to asha@example.in or call 9876543210");
    expect(shield.unmask("Write to [EMAIL_1] or ring [phone_1].")).toBe(
      "Write to asha@example.in or ring 9876543210."
    );
    expect(
      shield.unmaskDeep({ to: "[EMAIL_1]", list: ["[PHONE_1]", 3], n: null })
    ).toEqual({ to: "asha@example.in", list: ["9876543210", 3], n: null });
  });

  it("leaves ordinary numbers alone", () => {
    const shield = createShield();
    const text =
      "Order 482913 on 2026-10-11 for ₹80,000, 25 lakhs, 200 T-shirts, pincode 506004, card 1234 5678 9012 3456";
    expect(shield.mask(text)).toBe(text);
    expect(shield.report().masked).toBe(0);
  });

  it("can be switched off", () => {
    process.env.PRIVACY_SHIELD = "off";
    const shield = createShield();
    expect(shield.mask("asha@example.in")).toBe("asha@example.in");
  });
});
