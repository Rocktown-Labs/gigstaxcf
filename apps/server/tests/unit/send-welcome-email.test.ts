import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import {
  markEmailEventFailed,
  markEmailEventSent,
} from "@/lib/services/email-events";
import { sendWelcomeEmailWorkflow } from "@/lib/workflows/send-welcome-email";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@gigstaxcf/db/schema", () => ({
  emailEvents: {
    externalEventId: "externalEventId",
    id: "id",
    status: "status",
  },
}));

vi.mock("@/emails", () => ({
  WelcomeEmail: vi.fn(() => null),
}));

vi.mock("@/emails/render-email", () => ({
  renderEmailTemplate: vi.fn().mockResolvedValue({
    html: "<p>welcome</p>",
    text: "welcome",
  }),
}));

vi.mock("@/lib/services/email-events", () => ({
  ensureEmailEventPending: vi.fn().mockResolvedValue({
    id: 44,
    status: "pending",
  }),
  markEmailEventFailed: vi.fn(),
  markEmailEventSent: vi.fn(),
  markEmailEventSkipped: vi.fn(),
  shouldSendEmailEvent: vi.fn(() => true),
}));

vi.mock("@/lib/services/email", () => ({
  isNonRetryableEmailSendError: vi.fn((error: unknown) =>
    String(error).includes("Not authorized to send emails from")
  ),
  sendEmail: vi
    .fn()
    .mockRejectedValue(
      new Error("Not authorized to send emails from gigstax.com")
    ),
}));

describe("sendWelcomeEmailWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.select).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    } as never);
  });

  it("marks welcome emails failed once for non-retryable sender authorization errors", async () => {
    await expect(
      sendWelcomeEmailWorkflow({
        appUserId: 3,
        email: "user@example.com",
        name: "User",
      })
    ).resolves.toBeUndefined();

    expect(markEmailEventFailed).toHaveBeenCalledWith({
      error: "Not authorized to send emails from gigstax.com",
      eventId: 44,
    });
    expect(markEmailEventSent).not.toHaveBeenCalled();
  });
});
