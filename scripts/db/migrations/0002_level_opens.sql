CREATE TABLE "level_opens" (
	"learner_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"how" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_opens_learner_id_level_pk" PRIMARY KEY("learner_id","level"),
	CONSTRAINT "level_opens_how" CHECK ("level_opens"."how" in ('earned', 'anyway', 'placement'))
);
--> statement-breakpoint
ALTER TABLE "level_opens" ADD CONSTRAINT "level_opens_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;