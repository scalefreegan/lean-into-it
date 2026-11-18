CREATE TABLE "concept_credits" (
	"learner_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"credited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	CONSTRAINT "concept_credits_learner_id_concept_pk" PRIMARY KEY("learner_id","concept")
);
--> statement-breakpoint
ALTER TABLE "concept_credits" ADD CONSTRAINT "concept_credits_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;