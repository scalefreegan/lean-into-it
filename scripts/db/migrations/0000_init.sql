CREATE TABLE "attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"body" text NOT NULL,
	"solved" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solved_exercises" (
	"learner_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"solution" text NOT NULL,
	"solved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solved_exercises_learner_id_lesson_id_exercise_id_pk" PRIMARY KEY("learner_id","lesson_id","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solved_exercises" ADD CONSTRAINT "solved_exercises_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_learner_exercise" ON "attempts" USING btree ("learner_id","lesson_id","exercise_id","created_at");