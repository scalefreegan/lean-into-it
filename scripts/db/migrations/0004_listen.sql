ALTER TABLE "learners" ADD COLUMN "listen_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learners" ADD COLUMN "tts_voice_id" text;--> statement-breakpoint
ALTER TABLE "learners" ADD COLUMN "tts_model_id" text;