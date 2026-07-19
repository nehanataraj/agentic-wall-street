CREATE TYPE "public"."email_thread_status" AS ENUM('open', 'needs_human', 'auto_replied', 'closed');--> statement-breakpoint
CREATE TYPE "public"."email_agent_action" AS ENUM('auto_reply', 'escalate');--> statement-breakpoint
CREATE TYPE "public"."email_message_direction" AS ENUM('inbound_form', 'inbound_email', 'outbound_agent', 'outbound_ack', 'outbound_team');--> statement-breakpoint
CREATE TABLE "op"."email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_email" text NOT NULL,
	"contact_name" text,
	"subject" text NOT NULL,
	"status" "email_thread_status" DEFAULT 'open' NOT NULL,
	"last_outbound_provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "op"."email_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"action" "email_agent_action" NOT NULL,
	"category" text,
	"confidence" numeric(5, 4),
	"reasoning" text,
	"draft_subject" text,
	"draft_body" text,
	"kb_version" text,
	"hard_rule_hit" text,
	"team_provider_id" text,
	"user_provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "op"."email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"run_id" uuid,
	"direction" "email_message_direction" NOT NULL,
	"provider_message_id" text,
	"subject" text,
	"body_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "op"."email_agent_runs" ADD CONSTRAINT "email_agent_runs_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "op"."email_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "op"."email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "op"."email_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "op"."email_messages" ADD CONSTRAINT "email_messages_run_id_email_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "op"."email_agent_runs"("id") ON DELETE no action ON UPDATE no action;
