// AI-assisted: written with Claude Code from the team's build spec.
import { Gate } from "@/components/Gate";
import { HouseholdForm } from "@/components/HouseholdForm";
import { userFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  // A household needs an owner, so setting one up starts with signing in.
  if (!(await userFromCookies())) return <Gate state="signin" next="/h/new" reason="Sign in first so this household is saved to your account." />;
  return <HouseholdForm />;
}
