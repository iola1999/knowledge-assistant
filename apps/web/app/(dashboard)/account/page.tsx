import { AccountSettingsWorkbench } from "@/components/account/account-settings-workbench";
import { requireSessionUser } from "@/lib/auth/require-user";

export default async function AccountPage() {
  const user = await requireSessionUser();

  return (
    <AccountSettingsWorkbench
      currentUser={{
        name: user.name,
        username: user.username,
      }}
    />
  );
}
