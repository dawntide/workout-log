DO $migration$
DECLARE
  legacy_id uuid;
  high_bar_id uuid;
BEGIN
  SELECT "id" INTO legacy_id
  FROM "dev"."exercise"
  WHERE "name" = 'Back Squat'
  LIMIT 1;

  SELECT "id" INTO high_bar_id
  FROM "dev"."exercise"
  WHERE "name" = 'High-Bar Back Squat'
  LIMIT 1;

  IF legacy_id IS NOT NULL AND high_bar_id IS NULL THEN
    UPDATE "dev"."exercise"
    SET "name" = 'High-Bar Back Squat', "category" = 'Legs'
    WHERE "id" = legacy_id;
    high_bar_id := legacy_id;
  ELSIF legacy_id IS NOT NULL AND high_bar_id IS NOT NULL THEN
    UPDATE "dev"."workout_set"
    SET "exercise_id" = high_bar_id
    WHERE "exercise_id" = legacy_id;

    INSERT INTO "dev"."exercise_alias" ("exercise_id", "alias")
    SELECT high_bar_id, "alias"
    FROM "dev"."exercise_alias"
    WHERE "exercise_id" = legacy_id
    ON CONFLICT ("alias") DO UPDATE
    SET "exercise_id" = excluded."exercise_id";

    DELETE FROM "dev"."exercise" WHERE "id" = legacy_id;
  ELSIF high_bar_id IS NULL THEN
    INSERT INTO "dev"."exercise" ("name", "category")
    VALUES ('High-Bar Back Squat', 'Legs')
    RETURNING "id" INTO high_bar_id;
  END IF;
END
$migration$;
--> statement-breakpoint
INSERT INTO "dev"."exercise" ("name", "category")
VALUES
  ('High-Bar Back Squat', 'Legs'),
  ('Low-Bar Back Squat', 'Legs'),
  ('Front Squat', 'Legs'),
  ('Bench Press', 'Chest'),
  ('Deadlift', 'Back'),
  ('Overhead Press', 'Shoulder'),
  ('Pull-Up', 'Back'),
  ('Weighted Pull-Up', 'Back')
ON CONFLICT ("name") DO UPDATE
SET "category" = excluded."category";
--> statement-breakpoint
INSERT INTO "dev"."exercise_alias" ("exercise_id", "alias")
SELECT e."id", aliases."alias"
FROM (
  VALUES
    ('High-Bar Back Squat', 'Back Squat'),
    ('High-Bar Back Squat', 'High Bar Back Squat'),
    ('High-Bar Back Squat', 'High-Bar Squat'),
    ('High-Bar Back Squat', 'High Bar Squat'),
    ('High-Bar Back Squat', 'Squat'),
    ('High-Bar Back Squat', '스쿼트'),
    ('High-Bar Back Squat', '하이바 스쿼트'),
    ('High-Bar Back Squat', '하이바 백스쿼트'),
    ('Low-Bar Back Squat', 'Low Bar Back Squat'),
    ('Low-Bar Back Squat', 'Low-Bar Squat'),
    ('Low-Bar Back Squat', 'Low Bar Squat'),
    ('Low-Bar Back Squat', '로우바 스쿼트'),
    ('Low-Bar Back Squat', '로우바 백스쿼트'),
    ('Front Squat', 'FSQ'),
    ('Front Squat', '프론트 스쿼트'),
    ('Weighted Pull-Up', 'Weighted Pull Up'),
    ('Weighted Pull-Up', 'Weighted Pullup'),
    ('Weighted Pull-Up', '중량 풀업'),
    ('Weighted Pull-Up', '중량풀업')
) AS aliases("exercise_name", "alias")
JOIN "dev"."exercise" e ON e."name" = aliases."exercise_name"
ON CONFLICT ("alias") DO UPDATE
SET "exercise_id" = excluded."exercise_id";
--> statement-breakpoint
UPDATE "dev"."workout_set" ws
SET "exercise_id" = e."id"
FROM "dev"."exercise" e
WHERE ws."exercise_id" IS NULL
  AND lower(trim(ws."exercise_name")) = lower(e."name");
--> statement-breakpoint
UPDATE "dev"."workout_set" ws
SET "exercise_id" = e."id"
FROM "dev"."exercise_alias" a
JOIN "dev"."exercise" e ON e."id" = a."exercise_id"
WHERE ws."exercise_id" IS NULL
  AND lower(trim(ws."exercise_name")) = lower(a."alias");
--> statement-breakpoint
UPDATE "dev"."workout_set" ws
SET "exercise_id" = e."id", "exercise_name" = e."name"
FROM "dev"."exercise" e
WHERE e."name" = 'Weighted Pull-Up'
  AND lower(trim(ws."exercise_name")) IN (
    'weighted pull-up',
    'weighted pull up',
    'weighted pullup',
    '중량 풀업',
    '중량풀업'
  );
--> statement-breakpoint
UPDATE "dev"."workout_set" ws
SET "exercise_name" = 'High-Bar Back Squat'
FROM "dev"."exercise" e
WHERE ws."exercise_id" = e."id"
  AND e."name" = 'High-Bar Back Squat';
--> statement-breakpoint
UPDATE "dev"."workout_log"
SET "personal_records" = NULL
WHERE "personal_records" IS NOT NULL;
--> statement-breakpoint
DELETE FROM "dev"."stats_cache";
