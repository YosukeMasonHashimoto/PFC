import { describe, it, expect } from "vitest";
import { sendErrorReason } from "../src/lib/auth-errors";
describe("safe login error classification", () => {
  it.each([
    [{ status: 429 }, "rate_limit"],
    [{ code: "over_email_send_rate_limit" }, "rate_limit"],
    [{ code: "email_address_not_authorized" }, "email_restricted"],
    [{ code: "email_address_invalid" }, "email"],
    [{ status: 401 }, "config"],
    [{ name: "AuthRetryableFetchError" }, "connection"],
    [{ code: "unexpected_failure", status: 500 }, "send"],
  ])("classifies %j as %s", (input, reason) =>
    expect(sendErrorReason(input)).toBe(reason),
  );
});
