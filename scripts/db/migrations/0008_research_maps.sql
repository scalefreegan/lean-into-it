CREATE TABLE "research_maps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"question" text NOT NULL,
	"title" text NOT NULL,
	"map" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_maps" ADD CONSTRAINT "research_maps_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_maps_learner_idx" ON "research_maps" USING btree ("learner_id","created_at");