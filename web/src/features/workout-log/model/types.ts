// 실체는 순수 도메인 타입이라 lib 커널로 이동(architecture-layers.md 레이어 방향).
// 기존 importer(스토어·UI·서버 type-only 참조) 경로 보존용 재export 셸.
export * from "@/lib/workout-record/workout-log-types";
