import { z } from "zod";

export const ACCOUNT_PASSWORD_MIN_LENGTH = 6;

export const changePasswordSchema = z
  .object({
    nextPassword: z
      .string()
      .min(ACCOUNT_PASSWORD_MIN_LENGTH, `新密码至少 ${ACCOUNT_PASSWORD_MIN_LENGTH} 位。`),
    confirmPassword: z.string().min(1, "请再次输入新密码。"),
  })
  .superRefine((value, ctx) => {
    if (value.nextPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "两次输入的新密码不一致。",
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export function validateChangePasswordInput(input: unknown) {
  return changePasswordSchema.safeParse(input);
}
