import { ExerciseCatalogScreen } from "@/components/exercise-catalog/exercise-catalog-screen";
import { isAdminRequest } from "@/server/auth/user";

export default async function ExercisesPage() {
  // 수정·삭제 진입점을 숨기는 용도다. 실제 차단은 apps/api가 한다.
  const canManage = await isAdminRequest();
  return <ExerciseCatalogScreen canManage={canManage} />;
}
