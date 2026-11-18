CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"lesson_id" text,
	"exercise_id" text,
	"rung" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_role" CHECK ("chat_messages"."role" in ('user', 'assistant', 'note')),
	CONSTRAINT "chat_messages_rung" CHECK ("chat_messages"."rung" is null or "chat_messages"."rung" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "hints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"rung" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hints_rung" CHECK ("hints"."rung" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "rung" smallint;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "assisted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hints" ADD CONSTRAINT "hints_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_learner_idx" ON "chat_messages" USING btree ("learner_id","id");--> statement-breakpoint
CREATE INDEX "hints_learner_exercise" ON "hints" USING btree ("learner_id","lesson_id","exercise_id","created_at");