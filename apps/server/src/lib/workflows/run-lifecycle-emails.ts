interface RunLifecycleEmailsInput {
  userId: number;
}

export async function runLifecycleEmailsWorkflow(
  input: RunLifecycleEmailsInput
) {
  await runLifecycleEmailPassForUserStep(input.userId);
}

async function runLifecycleEmailPassForUserStep(userId: number) {
  const { runLifecycleEmailPassForUser } =
    await import("@/lib/services/email-lifecycle");

  await runLifecycleEmailPassForUser(userId);
}
