import { redirect } from "next/navigation";
import { APP_ROUTES } from "@/lib/app-routes";

export default function PlanCreatePage() {
  redirect(APP_ROUTES.programStore);
}
